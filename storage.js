// storage.js
// تخزين ملفات المذكرات (PDF/صور) بشكل دائم على Supabase Storage
// بدل تخزينها محليًا على السيرفر (اللي بيتمسح مع كل إعادة تشغيل).

const fs = require("fs");
const path = require("path");
const crypto = require("crypto");
const { createClient } = require("@supabase/supabase-js");

const BUCKET = process.env.SUPABASE_BUCKET || "notes-files";

let supabase = null;
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY;
if (process.env.SUPABASE_URL && SUPABASE_SERVICE_KEY) {
  supabase = createClient(process.env.SUPABASE_URL, SUPABASE_SERVICE_KEY);
} else {
  console.warn(
    "⚠️ تحذير: SUPABASE_URL أو SUPABASE_SERVICE_KEY غير موجودين في .env — رفع الملفات لن يعمل.",
  );
}

// بيرفع ملف محلي (اللي multer حفظه مؤقتًا) إلى Supabase Storage
// الملف بيتخزن في Bucket خاص (Private) — يعني مفيش رابط مباشر دائم للملف؛
// لازم نولّد رابط مؤقت (Signed URL) وقت الحاجة بس، عشان محدش يقدر يوصل
// للمذكرة قبل ما الأدمن يوافق عليها.
async function uploadLocalFileToStorage(localPath, originalName) {
  if (!supabase) {
    throw new Error("خدمة تخزين الملفات غير مُعدّة (SUPABASE_URL/SUPABASE_SERVICE_KEY)");
  }
  const ext = path.extname(originalName || localPath) || "";
  const uniqueName = `${Date.now()}-${crypto.randomBytes(8).toString("hex")}${ext}`;
  const fileBuffer = fs.readFileSync(localPath);

  const { error } = await supabase.storage.from(BUCKET).upload(uniqueName, fileBuffer, {
    contentType: guessContentType(ext),
    upsert: false,
  });

  if (error) throw error;

  // بنرجع اسم الملف جوه الـ Bucket (المسار الداخلي) مش رابط عام،
  // وبنولّد رابط مؤقت بس وقت ما الطالب يفتح الملف فعلاً (getSignedFileUrl)
  return uniqueName;
}

// بيولّد رابط مؤقت (صالح لمدة ساعة) لملف مخزّن في الـ Bucket الخاص
async function getSignedFileUrl(storedPath, expiresInSeconds = 3600) {
  if (!supabase) {
    throw new Error("خدمة تخزين الملفات غير مُعدّة (SUPABASE_URL/SUPABASE_SERVICE_KEY)");
  }
  const { data, error } = await supabase.storage
    .from(BUCKET)
    .createSignedUrl(storedPath, expiresInSeconds);
  if (error) throw error;
  return data.signedUrl;
}

function guessContentType(ext) {
  const map = {
    ".pdf": "application/pdf",
    ".docx": "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    ".txt": "text/plain",
    ".png": "image/png",
    ".jpg": "image/jpeg",
    ".jpeg": "image/jpeg",
    ".webp": "image/webp",
  };
  return map[ext.toLowerCase()] || "application/octet-stream";
}

module.exports = { uploadLocalFileToStorage, getSignedFileUrl };
