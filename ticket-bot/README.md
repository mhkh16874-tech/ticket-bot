# Ticket Bot

بوت ديسكورد عربي لإدارة التذاكر، يفتح قناة جديدة لكل تذكرة، ويتضمن:
- لوحة فتح تذاكر
- إنشاء قنوات جديدة لكل طلب جديد
- أزرار لإغلاق التذكرة وحفظ نسخة
- حفظ نسخ التذاكر (transcripts)
- فئات مخصصة للتذاكر
- حد أقصى للتذاكر المفتوحة لكل مستخدم
- دعم عربي

## المتطلبات
- Node.js 18+
- حساب Discord Developer
- توكن البوت
- صلاحيات السيرفر المطلوبة

## التثبيت
1. انسخ ملف `.env.example` إلى `.env` وأدخل القيم.
2. املأ `config.json` بالمعلومات الصحيحة.
3. نفّذ:

```bash
npm install
npm run deploy-commands
npm start
```

## إعدادات البوت
- `DISCORD_TOKEN`: توكن البوت
- `CLIENT_ID`: معرف التطبيق
- `GUILD_ID`: معرف السيرفر
- `supportRoleId`: معرف دور الدعم
- `transcriptChannelId`: قناة حفظ النسخ
- `categories`: فئات التذاكر
- `defaultCategoryId`: الفئة الافتراضية
- `maxTicketsPerUser`: عدد التذاكر المسموح لكل مستخدم

## أذونات البوت الموصى بها
- View Channels
- Send Messages
- Manage Channels
- Read Message History
- Manage Messages
- Embed Links
- Attach Files
- Use Slash Commands

## مثال للتهيئة السريعة
```bash
cp .env.example .env
# عدّل القيم داخل .env
# عدّل config.json
npm install
npm run deploy-commands
npm start
```

## ملاحظات
- في Discord Developer يجب تفعيل Message Content Intent إن احتجت قراءة محتوى الرسائل بالكامل.
- البوت يخزن التذاكر في `tickets.json` كحل سريع وسهل. يمكنك لاحقاً ربط قاعدة بيانات.
