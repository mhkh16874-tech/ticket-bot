import { REST, Routes, ApplicationCommandType } from "discord.js";
import dotenv from "dotenv";
dotenv.config();

const commands = [
  {
    name: "ticketpanel",
    description: "نشر لوحة فتح التذاكر (يتطلب صلاحية إدارة السيرفر)",
    type: ApplicationCommandType.ChatInput
  }
];

const rest = new REST({ version: "10" }).setToken(process.env.DISCORD_TOKEN);

(async () => {
  try {
    console.log("جارٍ نشر الأوامر...");
    await rest.put(
      Routes.applicationGuildCommands(process.env.CLIENT_ID, process.env.GUILD_ID),
      { body: commands }
    );
    console.log("تم نشر الأوامر بنجاح.");
  } catch (err) {
    console.error(err);
  }
})();
