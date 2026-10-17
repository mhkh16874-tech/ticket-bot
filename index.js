import {
  Client,
  GatewayIntentBits,
  Partials,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  ModalBuilder,
  TextInputBuilder,
  TextInputStyle,
  EmbedBuilder,
  PermissionsBitField,
  ChannelType,
  AttachmentBuilder
} from "discord.js";
import dotenv from "dotenv";
import fs from "fs-extra";
import path from "path";

dotenv.config();

const CONFIG_PATH = path.join(process.cwd(), "config.json");
const TICKETS_PATH = path.join(process.cwd(), "tickets.json");

const config = await fs.readJSON(CONFIG_PATH).catch(() => {
  console.error("لم أجد config.json — أنشئ الملف واملأ المعرفات.");
  process.exit(1);
});

await fs.ensureFile(TICKETS_PATH);
const ticketsStore = await fs.readJSON(TICKETS_PATH).catch(async () => {
  const initial = { lastTicketId: 0, openTickets: [] };
  await fs.writeJSON(TICKETS_PATH, initial, { spaces: 2 });
  return initial;
});

function saveTickets() {
  return fs.writeJSON(TICKETS_PATH, ticketsStore, { spaces: 2 });
}

function generateTicketName(username, id) {
  const safe = username.toLowerCase().replace(/[^a-z0-9\u0600-\u06FF_-]+/gi, "-").slice(0, 25);
  return `تذكرة-${safe}-${id}`;
}

async function fetchAllMessages(channel) {
  let messages = [];
  let lastId;
  while (true) {
    const options = { limit: 100 };
    if (lastId) options.before = lastId;

    const fetched = await channel.messages.fetch(options);
    if (fetched.size === 0) break;

    messages = messages.concat(Array.from(fetched.values()));
    lastId = fetched.last().id;

    if (fetched.size < 100) break;
  }
  return messages.reverse();
}

async function createTranscript(channel) {
  const messages = await fetchAllMessages(channel);
  const lines = messages.map((m) => {
    const time = new Date(m.createdTimestamp).toLocaleString("ar-EG");
    const author = `${m.author.tag} (${m.author.id})`;
    const content = m.content || "";
    const attachments = m.attachments.map((a) => a.url).join(" ");
    return `[${time}] ${author}: ${content} ${attachments}`;
  });
  return lines.join("\n");
}

const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.GuildMessageReactions
  ],
  partials: [Partials.Message, Partials.Channel, Partials.Reaction]
});

client.once("ready", () => {
  console.log(`متصل كـ ${client.user.tag}`);
});

client.on("interactionCreate", async (interaction) => {
  try {
    if (interaction.isChatInputCommand()) {
      if (interaction.commandName === "ticketpanel") {
        if (!interaction.member.permissions.has(PermissionsBitField.Flags.ManageGuild)) {
          return interaction.reply({
            content: "يجب أن تملك صلاحية إدارة السيرفر لاستخدام هذا الأمر.",
            ephemeral: true
          });
        }

        const panelEmbed = new EmbedBuilder()
          .setTitle("لوحة فتح التذاكر")
          .setDescription("اضغط على الزر لفتح تذكرة جديدة. اختر الفئة وادخل وصفاً موجزاً.")
          .setColor(0x00ae86);

        const openButton = new ButtonBuilder()
          .setCustomId("create_ticket")
          .setLabel("فتح تذكرة")
          .setStyle(ButtonStyle.Primary);

        const row = new ActionRowBuilder().addComponents(openButton);

        const msg = await interaction.channel.send({
          embeds: [panelEmbed],
          components: [row]
        });

        config.panelChannelId = interaction.channel.id;
        config.panelMessageId = msg.id;
        await fs.writeJSON(CONFIG_PATH, config, { spaces: 2 });

        return interaction.reply({
          content: "تم نشر لوحة التذاكر.",
          ephemeral: true
        });
      }
    }

    if (interaction.isButton() && interaction.customId === "create_ticket") {
      const modal = new ModalBuilder()
        .setCustomId("ticket_modal")
        .setTitle("فتح تذكرة جديدة");

      const subjectInput = new TextInputBuilder()
        .setCustomId("subject")
        .setLabel("موضوع التذكرة (مختصر)")
        .setStyle(TextInputStyle.Short)
        .setMaxLength(100)
        .setPlaceholder("مثال: مشكلة تسجيل الدخول")
        .setRequired(true);

      const categoryInput = new TextInputBuilder()
        .setCustomId("category")
        .setLabel("الفئة (دعم فني / شكاوى / اقتراحات / عام)")
        .setStyle(TextInputStyle.Short)
        .setPlaceholder("اكتب اسم الفئة أو اترك 'عام'")
        .setRequired(true);

      const firstRow = new ActionRowBuilder().addComponents(subjectInput);
      const secondRow = new ActionRowBuilder().addComponents(categoryInput);

      modal.addComponents(firstRow, secondRow);
      await interaction.showModal(modal);
    }

    if (interaction.isModalSubmit() && interaction.customId === "ticket_modal") {
      await interaction.deferReply({ ephemeral: true });

      const subject = interaction.fields.getTextInputValue("subject");
      const category = interaction.fields.getTextInputValue("category") || "عام";
      const userId = interaction.user.id;

      const userTickets = ticketsStore.openTickets.filter(
        (t) => t.userId === userId && t.status === "open"
      );

      if (userTickets.length >= (config.maxTicketsPerUser || 2)) {
        return interaction.editReply({
          content: `لا يمكنك فتح أكثر من ${config.maxTicketsPerUser} تذاكر في الوقت نفسه.`
        });
      }

      ticketsStore.lastTicketId += 1;
      const ticketId = ticketsStore.lastTicketId;

      const catId = config.categories?.[category] || config.defaultCategoryId || null;

      const guild = interaction.guild;
      const user = interaction.user;
      const channelName = generateTicketName(user.username, ticketId);

      const permissionOverwrites = [
        {
          id: guild.roles.everyone.id,
          deny: [PermissionsBitField.Flags.ViewChannel]
        },
        {
          id: userId,
          allow: [
            PermissionsBitField.Flags.ViewChannel,
            PermissionsBitField.Flags.SendMessages,
            PermissionsBitField.Flags.ReadMessageHistory
          ]
        }
      ];

      if (config.supportRoleId) {
        permissionOverwrites.push({
          id: config.supportRoleId,
          allow: [
            PermissionsBitField.Flags.ViewChannel,
            PermissionsBitField.Flags.SendMessages,
            PermissionsBitField.Flags.ReadMessageHistory
          ]
        });
      }

      const channelOptions = {
        type: ChannelType.GuildText,
        permissionOverwrites,
        topic: `تذكرة #${ticketId} — ${subject}`
      };

      if (catId && guild.channels.cache.get(catId)) {
        channelOptions.parent = catId;
      } else if (config.defaultCategoryId && guild.channels.cache.get(config.defaultCategoryId)) {
        channelOptions.parent = config.defaultCategoryId;
      }

      const ticketChannel = await guild.channels.create({
        name: channelName,
        ...channelOptions
      });

      const ticketObj = {
        ticketId,
        channelId: ticketChannel.id,
        userId,
        subject,
        category,
        status: "open",
        createdAt: new Date().toISOString()
      };

      ticketsStore.openTickets.push(ticketObj);
      await saveTickets();

      const welcomeEmbed = new EmbedBuilder()
        .setTitle(`التذكرة رقم #${ticketId}`)
        .setDescription(
          `مرحباً ${user}!\nفريق الدعم سيعاود التواصل معك قريباً.\nالموضوع: **${subject}**\nالفئة: **${category}**`
        )
        .setColor(0x00ae86)
        .setFooter({ text: `مُنشِئ التذكرة: ${user.tag}` });

      const closeBtn = new ButtonBuilder()
        .setCustomId("close_ticket")
        .setLabel("إغلاق التذكرة")
        .setStyle(ButtonStyle.Danger);

      const transcriptBtn = new ButtonBuilder()
        .setCustomId("transcript_ticket")
        .setLabel("حفظ نسخة الآن")
        .setStyle(ButtonStyle.Secondary);

      const transferBtn = new ButtonBuilder()
        .setCustomId("transfer_ticket")
        .setLabel("نقل/تعيين لمشرف")
        .setStyle(ButtonStyle.Primary);

      const ctrlRow = new ActionRowBuilder().addComponents(
        closeBtn,
        transcriptBtn,
        transferBtn
      );

      await ticketChannel.send({
        content: `${config.supportRoleId ? `<@&${config.supportRoleId}>` : ""} تم فتح تذكرة جديدة.`,
        embeds: [welcomeEmbed],
        components: [ctrlRow]
      });

      return interaction.editReply({
        content: `تم فتح التذكرة: ${ticketChannel}`,
        ephemeral: true
      });
    }

    if (interaction.isButton()) {
      const customId = interaction.customId;

      if (customId === "close_ticket") {
        const ticket = ticketsStore.openTickets.find(
          (t) => t.channelId === interaction.channelId && t.status === "open"
        );

        if (!ticket) {
          return interaction.reply({
            content: "لا يمكن إغلاق هذه القناة كتذكرة أو أنها مغلقة بالفعل.",
            ephemeral: true
          });
        }

        const confirmClose = new ActionRowBuilder().addComponents(
          new ButtonBuilder()
            .setCustomId("confirm_close_yes")
            .setLabel("نعم، إغلاق الآن")
            .setStyle(ButtonStyle.Danger),
          new ButtonBuilder()
            .setCustomId("confirm_close_no")
            .setLabel("إلغاء")
            .setStyle(ButtonStyle.Secondary)
        );

        return interaction.reply({
          content: "هل أنت متأكد من إغلاق التذكرة؟ سيتم حفظ نسخة قبل الحذف.",
          components: [confirmClose],
          ephemeral: true
        });
      }

      if (customId === "confirm_close_no") {
        return interaction.update({
          content: "تم إلغاء الإغلاق.",
          components: []
        });
      }

      if (customId === "confirm_close_yes") {
        await interaction.update({
          content: "جارٍ إغلاق التذكرة وحفظ النسخة...",
          components: []
        });

        const ticket = ticketsStore.openTickets.find(
          (t) => t.channelId === interaction.channelId && t.status === "open"
        );

        if (!ticket) {
          return interaction.followUp({
            content: "حدث خطأ: لم أجد التذكرة.",
            ephemeral: true
          });
        }

        const channel = interaction.channel;
        const transcriptText = await createTranscript(channel);
        const buffer = Buffer.from(transcriptText, "utf-8");
        const attachment = new AttachmentBuilder(buffer, {
          name: `transcript-ticket-${ticket.ticketId}.txt`
        });

        if (config.transcriptChannelId) {
          const target = await client.channels.fetch(config.transcriptChannelId).catch(() => null);
          if (target && target.isTextBased()) {
            await target.send({
              content: `نسخة من التذكرة رقم #${ticket.ticketId} — صاحب التذكرة: <@${ticket.userId}>`,
              files: [attachment]
            }).catch(() => null);
          }
        }

        try {
          const user = await client.users.fetch(ticket.userId);
          await user.send({
            content: `نسخة من تذكرتك رقم #${ticket.ticketId}`,
            files: [attachment]
          }).catch(() => null);
        } catch (err) {}

        ticket.status = "closed";
        ticket.closedAt = new Date().toISOString();
        await saveTickets();

        const waitSec = config.deleteChannelAfterCloseSeconds || 10;
        await channel.send(`تم إغلاق التذكرة وسيتم حذف القناة خلال ${waitSec} ثانية.`);

        setTimeout(async () => {
          try {
            await channel.delete(`Ticket #${ticket.ticketId} closed`);
          } catch (err) {}
        }, waitSec * 1000);

        return;
      }

      if (customId === "transcript_ticket") {
        const ticket = ticketsStore.openTickets.find(
          (t) => t.channelId === interaction.channelId && t.status === "open"
        );

        if (!ticket) {
          return interaction.reply({
            content: "هذه القناة ليست تذكرة مفتوحة.",
            ephemeral: true
          });
        }

        await interaction.deferReply({ ephemeral: true });

        const transcriptText = await createTranscript(interaction.channel);
        const buffer = Buffer.from(transcriptText, "utf-8");
        const attachment = new AttachmentBuilder(buffer, {
          name: `transcript-ticket-${ticket.ticketId}.txt`
        });

        if (config.transcriptChannelId) {
          const target = await client.channels.fetch(config.transcriptChannelId).catch(() => null);
          if (target && target.isTextBased()) {
            await target.send({
              content: `نسخة فورية من التذكرة #${ticket.ticketId}`,
              files: [attachment]
            }).catch(() => null);
          }
        }

        try {
          const user = await client.users.fetch(ticket.userId);
          await user.send({
            content: `نسخة من تذكرتك رقم #${ticket.ticketId}`,
            files: [attachment]
          }).catch(() => null);
        } catch (err) {}

        return interaction.editReply({
          content: "تم حفظ النسخة وإرسالها.",
          ephemeral: true
        });
      }

      if (customId === "transfer_ticket") {
        const modal = new ModalBuilder()
          .setCustomId("transfer_modal")
          .setTitle("نقل/تعيين لمشرف");

        const targetInput = new TextInputBuilder()
          .setCustomId("target")
          .setLabel("أدخل @المشرف أو المعرف (ID)")
          .setStyle(TextInputStyle.Short)
          .setPlaceholder("مثال: @user أو 123456789012345678")
          .setRequired(true);

        modal.addComponents(new ActionRowBuilder().addComponents(targetInput));
        return interaction.showModal(modal);
      }
    }

    if (interaction.isModalSubmit() && interaction.customId === "transfer_modal") {
      await interaction.deferReply({ ephemeral: true });

      const targetRaw = interaction.fields.getTextInputValue("target").trim();
      const matches = targetRaw.match(/(\d{17,19})/);

      if (!matches) {
        return interaction.editReply({
          content: "لم أتمكن من استخراج معرف المستخدم. أرسل ID أو منشن صحيح."
        });
      }

      const targetId = matches[1];
      const ticket = ticketsStore.openTickets.find(
        (t) => t.channelId === interaction.channelId && t.status === "open"
      );

      if (!ticket) {
        return interaction.editReply({
          content: "هذه القناة ليست تذكرة مفتوحة."
        });
      }

      try {
        const member = await interaction.guild.members.fetch(targetId);

        await interaction.channel.permissionOverwrites.edit(member.id, {
          ViewChannel: true,
          SendMessages: true,
          ReadMessageHistory: true
        });

        await interaction.editReply({
          content: `تم إضافة ${member.user.tag} إلى هذه التذكرة.`
        });

        await interaction.channel.send(
          `تمت إضافة ${member} إلى التذكرة بواسطة ${interaction.user}.`
        );
      } catch (err) {
        return interaction.editReply({
          content: "حدث خطأ عند العثور على العضو أو تعديل الصلاحيات."
        });
      }
    }
  } catch (err) {
    console.error("خطأ في معالج التفاعل:", err);
  }
});

client.login(process.env.DISCORD_TOKEN);
