# دكتور مستقبلي — نسخة Supabase المصلحة

هذه النسخة تستخدم PostgreSQL في Supabase لحفظ بيانات الطلاب والامتحانات والنقاط والشهادات والمذكرات، وتستخدم Supabase Storage لحفظ ملفات PDF والصور. لا تعتمد على ملف SQLite محلي في النشر.

## قبل التشغيل

أنشئ في Supabase Bucket خاصاً باسم `notes-files`. لا تفعّل Public للـBucket.

انسخ `.env.example` إلى `.env` على جهازك فقط، ثم ضع القيم التالية:

```env
PORT=3000
DATABASE_URL=رابط_PostgreSQL_من_Supabase
SUPABASE_URL=رابط_مشروع_Supabase
SUPABASE_SERVICE_KEY=مفتاح_service_role_السري
SUPABASE_BUCKET=notes-files
ADMIN_PASSWORD=كلمة_مرور_أدمن_قوية
AI_API_KEY=مفتاح_AI_الجديد
AI_API_URL=https://api.groq.com/openai/v1/chat/completions
AI_MODEL=llama-3.3-70b-versatile
EMAIL_HOST=smtp.gmail.com
EMAIL_PORT=465
EMAIL_SECURE=true
EMAIL_USER=بريد_الإرسال
EMAIL_PASS=كلمة_مرور_التطبيق
EMAIL_FROM=بريد_الإرسال
```

لا تضع `SUPABASE_SERVICE_KEY` أو `DATABASE_URL` داخل صفحات HTML أو `script.js`، ولا ترفع `.env` إلى GitHub أو Replit أو Render.

## التشغيل المحلي

من Terminal داخل مجلد المشروع شغّل:

```bash
npm install
npm start
```

ثم افتح `http://localhost:3000`. عند أول تشغيل، يحاول الخادم إنشاء جداول Supabase المطلوبة تلقائياً. يجب أن يكون حساب قاعدة البيانات قادراً على إنشاء الجداول.

## رفع المشروع إلى Render

ارفع ملفات الكود إلى مستودع GitHub خاص، من غير `.env` أو `database.db` أو ملفات PDF الخاصة. في Render أنشئ Web Service من المستودع، واجعل أمر البناء:

```text
npm install
```

واجعل أمر التشغيل:

```text
npm start
```

أضف نفس متغيرات البيئة من لوحة Render، وخصوصاً `DATABASE_URL` و`SUPABASE_URL` و`SUPABASE_SERVICE_KEY` و`SUPABASE_BUCKET=notes-files`. لا تضع القيم السرية في الكود.

## ما تم إصلاحه في هذه النسخة

تم تحويل أمر إصدار الشهادة من صيغة SQLite إلى صيغة PostgreSQL، وإضافة اسم صاحب المذكرة إلى إدخال المسودة، وإصلاح تواريخ OTP لتُحفظ كـTIMESTAMP صحيح، وإضافة انتظار تهيئة الجداول قبل استقبال طلبات API، وجعل اسم Bucket الافتراضي `notes-files`، ودعم اسمي مفتاح الخدمة `SUPABASE_SERVICE_KEY` و`SUPABASE_SERVICE_ROLE_KEY`.

## تنبيه البيانات القديمة

هذه الحزمة لا تحتوي قاعدة بيانات الطلاب القديمة. عند تشغيلها على مشروع Supabase جديد ستبدأ الجداول فارغة. لا تنقل `database.db` إلى المستودع. إذا كانت هناك بيانات قديمة مهمة، يجب تنفيذ ترحيل منفصل مع نسخة احتياطية قبل تشغيل الطلاب الحقيقيين.
