# تشغيل منصة دكتور مستقبلي على Netlify

هذه النسخة مجهزة لتشغيل واجهة الموقع على Netlify مع تشغيل API الخاص بـ Express داخل Netlify Functions. **لا تضع أي مفتاح داخل GitHub أو داخل ملفات HTML وJavaScript.** أضف الأسرار من إعدادات Netlify فقط.

## ماذا تغيّر؟

- تمت إضافة `netlify/functions/api.js` كمحول يربط Express بـ Netlify Functions.
- تمت إضافة `netlify.toml` لتوجيه `/api/*` إلى المحول ونشر مجلد `public`.
- تم نسخ ملفات الواجهة فقط إلى `public`، مع إبقاء ملفات الخادم خارجها.
- تم جعل الرفع المؤقت يستخدم `/tmp` داخل Netlify، ثم تُرفع المذكرات المنشورة إلى Supabase Storage الخاص.
- تم تعديل `server.js` ليعمل محليًا كالمعتاد، أو يُستورد داخل Function عند النشر.

## الرفع من GitHub

1. افتح Netlify واختر **Add new project → Import an existing project → GitHub**.
2. اختر المستودع الخاص `dr-mostaqbaly` والفرع `main`.
3. اترك **Base directory** فارغًا.
4. اترك **Build command** فارغًا أو اكتب `npm install` إذا طلبه Netlify.
5. لا تغيّر **Publish directory**؛ يجب أن تكون `public` لأن ملفات الواجهة موجودة فيها.
6. ابدأ النشر بعد إضافة المتغيرات السرية التالية من قسم **Environment variables**.

## المتغيرات المطلوبة

| الاسم | القيمة |
|---|---|
| `DATABASE_URL` | رابط Supabase Postgres من Connection string → URI |
| `SUPABASE_URL` | رابط مشروع Supabase مثل `https://xxxx.supabase.co` |
| `SUPABASE_SERVICE_KEY` | Secret key أو service_role key من Supabase API Keys؛ لا تستخدم Publishable key |
| `SUPABASE_BUCKET` | `notes-files` |
| `ADMIN_PASSWORD` | كلمة مرور قوية تختارها أنت للأدمن |
| `AI_API_KEY` | مفتاح مزود الذكاء الاصطناعي، إن أردت تشغيل الشات |
| `AI_API_URL` | رابط OpenAI-compatible لمزود الذكاء الاصطناعي |
| `AI_MODEL` | اسم النموذج عند مزود الذكاء الاصطناعي |
| `EMAIL_USER` | بريد إرسال OTP والشهادات |
| `EMAIL_PASS` | كلمة مرور تطبيق البريد، وليس كلمة مرور الحساب العادية |

لا تحتاج إلى إضافة `PORT`؛ Netlify يدير منفذ Function بنفسه.

## تنبيه بخصوص الملفات وOCR

الطلاب والجلسات والجداول تُحفظ في Supabase Postgres، والملفات المنشورة تُحفظ في Bucket الخاص `notes-files`. ملفات Netlify المؤقتة ليست مكانًا دائمًا للتخزين.

PDF النصي هو المسار المتوقع للعمل. OCR للـPDF المصور يعتمد على أدوات نظام مثل `pdftoppm` وقد لا تكون متاحة في بيئة Netlify Functions، كما أن OCR والطلبات الطويلة قد تتأثر بحدود Functions. يجب اختبار هذه الميزة بعد النشر فعليًا قبل الاعتماد عليها.

## الاختبار الأول بعد النشر

1. افتح رابط الموقع وتأكد من ظهور الصفحة الرئيسية.
2. افتح التسجيل وتأكد من أن الطلب لا يعرض خطأ قاعدة البيانات.
3. جرّب دخول الأدمن بكلمة المرور التي حفظتها في Netlify.
4. افتح الشات؛ إذا لم تضف إعدادات AI سيظهر تنبيه أن AI غير مُعد، وهذا متوقع.
5. جرّب إنشاء مذكرة بعد إضافة إعدادات Supabase والبريد وAI.

المشروع لا يحتوي على `.env` أو `database.db` أو `node_modules`، ولا ينبغي رفع أيٍّ منها إلى GitHub.

## مراجع رسمية

- [Express on Netlify](https://docs.netlify.com/build/frameworks/framework-setup-guides/express/)
- [Netlify Free plan](https://www.netlify.com/pricing/)
- [Netlify Free plan announcement](https://www.netlify.com/blog/introducing-netlify-free-plan/)
