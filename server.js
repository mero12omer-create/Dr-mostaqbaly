require("dotenv").config();
const express = require("express");
const nodemailer = require("nodemailer");
const crypto = require("crypto");
const fs = require("fs");
const path = require("path");
const os = require("os");
const { execFile } = require("child_process");
const { promisify } = require("util");
const multer = require("multer");
const mammoth = require("mammoth");
const pdfParse = require("pdf-parse");
const Tesseract = require("tesseract.js");
const bcrypt = require("bcrypt");
const rateLimit = require("express-rate-limit");
const helmet = require("helmet");
const { uploadLocalFileToStorage, getSignedFileUrl } = require("./storage.js");
const {
  normalizeBranch,
  normalizeSubjectKey,
  getSubjectsForBranch,
  getSubjectGroup,
  getSubjectLabel,
} = require("./subjects.js");
const app = express();
const execFileAsync = promisify(execFile);

// مجلد الرفع المؤقت (صور/ملفات المذكرات والامتحانات)
// Netlify Functions تسمح بالكتابة في /tmp فقط؛ التشغيل المحلي يحتفظ بمجلد uploads.
const isServerlessRuntime = Boolean(
  process.env.NETLIFY ||
    process.env.NETLIFY_DEV ||
    process.env.AWS_LAMBDA_FUNCTION_NAME ||
    process.env.VERCEL,
);
const runtimeUploadDir = isServerlessRuntime
  ? path.join(os.tmpdir(), "dr-mostaqbaly-uploads")
  : path.join(__dirname, "uploads");
if (!fs.existsSync(runtimeUploadDir)) {
  fs.mkdirSync(runtimeUploadDir, { recursive: true });
}
const ALLOWED_UPLOAD_EXTENSIONS = new Set([".pdf", ".docx", ".txt", ".png", ".jpg", ".jpeg", ".webp"]);
const upload = multer({
  dest: runtimeUploadDir,
  limits: { fileSize: 20 * 1024 * 1024 }, // 20MB كحد أقصى لكل ملف
  fileFilter: (req, file, callback) => {
    const ext = path.extname(file.originalname || "").toLowerCase();
    if (!ALLOWED_UPLOAD_EXTENSIONS.has(ext)) {
      const error = new Error("نوع الملف غير مدعوم");
      error.code = "INVALID_FILE_TYPE";
      return callback(error);
    }
    return callback(null, true);
  },
});

// ========================================
// إعدادات الأمان العامة (Helmet + حدود الطلبات)
// ========================================
app.use(
  helmet({
    // CSP مضبوط بدل تعطيله بالكامل: بيمنع تحميل سكريبتات أو موارد من مواقع
    // خارجية غير موثوقة. لسه محتاج 'unsafe-inline' للستايلات/سكريبتات inline
    // الموجودة في صفحات الموقع الحالية (تحسين مستقبلي: نقلها لملفات خارجية).
    contentSecurityPolicy: {
      directives: {
        defaultSrc: ["'self'"],
        scriptSrc: ["'self'", "'unsafe-inline'"],
        styleSrc: ["'self'", "'unsafe-inline'"],
        imgSrc: ["'self'", "data:", "https:"],
        connectSrc: ["'self'"],
        objectSrc: ["'none'"],
        frameAncestors: ["'self'"],
      },
    },
  }),
);
// تقديم ملفات الواجهة فقط؛ لا نعرض قاعدة البيانات أو كود الخادم أو ملفات الإعدادات.
const PUBLIC_PAGE_FILES = new Set([
  "index.html",
  "chat.html",
  "exams.html",
  "leaderboard.html",
  "login.html",
  "notes.html",
  "profile.html",
  "signup.html",
  "admin.html",
  "script.js",
  "subjects.js",
  "style.css",
  "image.jpg",
  "notes.png",
  "new-design-concept.png",
]);
app.use((req, res, next) => {
  if (req.method !== "GET" && req.method !== "HEAD") return next();
  const requestPath = String(req.path || "").replace(/^\/+/, "");
  if (!requestPath || requestPath.startsWith("api/") || requestPath.startsWith("uploads/") || requestPath.includes("..")) return next();
  if (!PUBLIC_PAGE_FILES.has(requestPath)) return next();
  return res.sendFile(path.join(__dirname, requestPath), { dotfiles: "deny" }, (err) => {
    if (err && !res.headersSent) next(err);
  });
});
app.get("/", (req, res) => res.sendFile(path.join(__dirname, "index.html")));
app.use(express.json({ limit: "25mb" }));
// لا نعرض ملفات الرفع الخام أو مسودات الأدمن؛ الملف يصبح متاحاً بعد اعتماد المذكرة فقط.
app.get("/uploads/:filename", (req, res) => {
  const filename = path.basename(String(req.params.filename || ""));
  if (!filename || filename !== req.params.filename) return res.status(404).end();
  const fileUrl = `/uploads/${filename}`;
  db.get(
    "SELECT id FROM notes WHERE fileUrl = ? AND (isDraft IS NULL OR isDraft = 0) LIMIT 1",
    [fileUrl],
    (err, row) => {
      if (err || !row) return res.status(404).send("الملف غير متاح");
      return res.sendFile(path.join(runtimeUploadDir, filename), { dotfiles: "deny" });
    },
  );
});

// حدود عامة لمنع إغراق السيرفر بالطلبات (Rate Limiting)
const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 دقيقة
  max: 10,
  standardHeaders: true,
  legacyHeaders: false,
  message: {
    success: false,
    message: "محاولات كثيرة جداً، حاول مرة أخرى بعد قليل",
  },
});

const otpLimiter = rateLimit({
  windowMs: 10 * 60 * 1000,
  max: 6,
  standardHeaders: true,
  legacyHeaders: false,
  message: {
    success: false,
    message: "طلبات كثيرة لرمز التحقق، حاول مرة أخرى بعد قليل",
  },
});

const chatLimiter = rateLimit({
  windowMs: 5 * 60 * 1000,
  max: 30,
  standardHeaders: true,
  legacyHeaders: false,
  message: { success: false, message: "استخدام كثيف جداً، هدّي شوية وارجع 🙏" },
});

const pointsLimiter = rateLimit({
  windowMs: 5 * 60 * 1000,
  max: 60,
  standardHeaders: true,
  legacyHeaders: false,
  message: { success: false, message: "طلبات كثيرة جداً لتحديث النقاط" },
});

// الاتصال بقاعدة البيانات (Supabase/PostgreSQL) — الاتصال والإعداد في db.js
const db = require("./db.js");

// ========================================
// جلسات الأدمن (Session) - صلاحيات من Backend فقط
// ========================================
function hashString(str) {
  return crypto.createHash("sha256").update(String(str)).digest("hex");
}

// ملاحظة: الجلسات بقت متخزنة في جدول sessions (قاعدة البيانات) بدل الذاكرة
// عشان متضيعش لما السيرفر يعيد التشغيل (راجع تعريف الجدول فوق)

// كلمة سر الأدمن لازم تيجي من متغيرات البيئة (.env) وليس مكتوبة في الكود
if (!process.env.ADMIN_PASSWORD) {
  console.warn(
    "⚠️ تحذير أمان: لم يتم تعيين ADMIN_PASSWORD في ملف .env — لن تتمكن من تسجيل الدخول كأدمن حتى تضيفها.",
  );
}
const ADMIN_PASS_HASH = hashString(
  process.env.ADMIN_PASSWORD || crypto.randomBytes(16).toString("hex"), // قيمة عشوائية غير معروفة إن لم تُضبط، فلا يمكن تخمينها
);
const SESSION_TTL = 3 * 60 * 60 * 1000; // 3 ساعات

// محاولات دخول الأدمن الفاشلة (حماية إضافية ضد التخمين العشوائي)
const adminFailedAttempts = {}; // ip -> { count, until }
function isAdminLoginBlocked(ip) {
  const rec = adminFailedAttempts[ip];
  return rec && rec.until && rec.until > Date.now();
}
function registerAdminFailure(ip) {
  const rec = adminFailedAttempts[ip] || { count: 0, until: 0 };
  rec.count += 1;
  if (rec.count >= 5) {
    rec.until = Date.now() + 15 * 60 * 1000; // حظر 15 دقيقة بعد 5 محاولات فاشلة
    rec.count = 0;
  }
  adminFailedAttempts[ip] = rec;
}
function clearAdminFailures(ip) {
  delete adminFailedAttempts[ip];
}

function createAdminSession() {
  return new Promise((resolve, reject) => {
    const token = crypto.randomBytes(24).toString("hex");
    const expiresAt = new Date(Date.now() + SESSION_TTL);
    db.run(
      `INSERT INTO sessions (token, kind, phone, expires_at) VALUES (?, 'admin', NULL, ?) RETURNING token`,
      [token, expiresAt],
      (err) => {
        if (err) return reject(err);
        resolve(token);
      },
    );
  });
}

function createStudentSession(phone) {
  return new Promise((resolve, reject) => {
    const token = crypto.randomBytes(32).toString("hex");
    const expiresAt = new Date(Date.now() + SESSION_TTL);
    db.run(
      `INSERT INTO sessions (token, kind, phone, expires_at) VALUES (?, 'student', ?, ?) RETURNING token`,
      [token, phone, expiresAt],
      (err) => {
        if (err) return reject(err);
        resolve(token);
      },
    );
  });
}

function requireStudentAuth(req, res, next) {
  const token = req.headers["x-student-token"] || String(req.headers.authorization || "").replace(/^Bearer\s+/i, "");
  if (!token) {
    return res.status(401).json({ success: false, message: "انتهت جلسة الطالب، سجل الدخول من جديد" });
  }
  db.get(
    `SELECT * FROM sessions WHERE token = ? AND kind = 'student'`,
    [token],
    (err, session) => {
      if (err || !session || new Date(session.expires_at).getTime() < Date.now()) {
        if (session) db.run(`DELETE FROM sessions WHERE token = ?`, [token]);
        return res.status(401).json({ success: false, message: "انتهت جلسة الطالب، سجل الدخول من جديد" });
      }
      req.studentPhone = session.phone;
      next();
    },
  );
}

// Middleware للتحقق من صلاحية الأدمن من Backend
function requireAdmin(req, res, next) {
  const token = req.headers["x-admin-token"];
  if (!token) {
    return res
      .status(401)
      .json({ success: false, message: "غير مصرح لك، سجل دخول الأدمن أولاً" });
  }
  db.get(
    `SELECT * FROM sessions WHERE token = ? AND kind = 'admin'`,
    [token],
    (err, session) => {
      if (err || !session || new Date(session.expires_at).getTime() < Date.now()) {
        if (session) db.run(`DELETE FROM sessions WHERE token = ?`, [token]);
        return res
          .status(401)
          .json({ success: false, message: "انتهت الجلسة، سجل دخول من جديد" });
      }
      next();
    },
  );
}

// دالة تشفير كلمة المرور بـ bcrypt (أقوى بكثير من SHA-256 العادي)
async function hashPassword(password) {
  return bcrypt.hash(String(password), 12);
}

// دعم الحسابات القديمة المشفرة بـ SHA-256 (قبل التحديث الأمني) بدون تعطيلها
function legacyHashPassword(password) {
  return crypto.createHash("sha256").update(String(password)).digest("hex");
}

// تتحقق من كلمة السر سواء كانت مخزنة بـ bcrypt (جديدة) أو SHA-256 (حساب قديم)
// وإذا كانت قديمة وصحيحة، تتم ترقيتها تلقائياً إلى bcrypt بصمت
async function verifyPassword(password, storedHash, phone) {
  const looksLikeBcrypt =
    typeof storedHash === "string" && storedHash.startsWith("$2");

  if (looksLikeBcrypt) {
    return bcrypt.compare(String(password), storedHash);
  }

  // حساب قديم بتشفير SHA-256
  const legacyMatch = legacyHashPassword(password) === storedHash;
  if (legacyMatch && phone) {
    // ترقية صامتة لكلمة السر إلى bcrypt عند أول تسجيل دخول ناجح
    try {
      const upgraded = await hashPassword(password);
      db.run(`UPDATE users SET password = ? WHERE phone = ?`, [
        upgraded,
        phone,
      ]);
    } catch (e) {
      console.log("تعذر ترقية كلمة السر إلى bcrypt:", e);
    }
  }
  return legacyMatch;
}

function normalizeText(value) {
  return typeof value === "string" ? value.trim() : "";
}

function escapeHtmlServer(value) {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/\"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

function getRankTitle(points) {
  const value = Number(points) || 0;
  if (value >= 1000) return "دكتور مستقبلي 🩺";
  if (value >= 600) return "طالب متفوق 🌟";
  if (value >= 300) return "طالب متميز 🏅";
  if (value >= 100) return "طالب مجتهد 📚";
  return "طالب جديد";
}

async function callAICompletion(aiUrl, apiKey, payload) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 45000);
  try {
    const response = await fetch(aiUrl, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify(payload),
      signal: controller.signal,
    });
    if (!response.ok) return null;
    return await response.json();
  } catch (error) {
    console.log("تعذر الاتصال بخدمة AI:", error.message);
    return null;
  } finally {
    clearTimeout(timeout);
  }
}

function isValidEmail(email) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(normalizeText(email));
}

function isValidPhone(phone) {
  return /^01\d{9}$/.test(normalizeText(phone));
}

function generateOtpCode() {
  return String(crypto.randomInt(100000, 1000000));
}

function buildOtpHtml(code) {
  return `
    <div style="font-family: 'Segoe UI', Tahoma, sans-serif; direction: rtl; text-align: center; background: #f8fafc; padding: 30px;">
      <div style="max-width: 450px; margin: 0 auto; background: #fff; border-radius: 16px; padding: 30px; border-top: 5px solid #2563eb;">
        <h2 style="color: #2563eb; margin-top: 0;">منصة دكتور مستقبلي 🩺</h2>
        <p style="font-size: 15px; color: #333;">استخدم الرمز التالي لإكمال إنشاء حسابك:</p>
        <div style="font-size: 36px; font-weight: 800; color: #2563eb; letter-spacing: 8px; background: #eff6ff; padding: 15px; border-radius: 12px; margin: 20px 0;">${code}</div>
        <p style="font-size: 13px; color: #64748b;">الرمز صالح لمدة 5 دقائق فقط.</p>
      </div>
    </div>`;
}

function sendOtpEmail(email, code) {
  return new Promise((resolve) => {
    const otpMailOptions = {
      from: "dr.mostaqbaly@gmail.com",
      to: email,
      subject: "🔐 رمز التحقق الخاص بك - منصة دكتور مستقبلي",
      html: buildOtpHtml(code),
    };

    transporter.sendMail(otpMailOptions, (mailErr) => {
      if (mailErr) {
        console.log("خطأ في إرسال رمز التحقق:", mailErr);
        resolve({ success: false, error: mailErr });
      } else {
        resolve({ success: true });
      }
    });
  });
}

async function initializeDatabase() {
  const statements = [
    `CREATE TABLE IF NOT EXISTS users (
      id SERIAL PRIMARY KEY,
      name TEXT,
      phone TEXT UNIQUE,
      email TEXT,
      password TEXT,
      points INTEGER DEFAULT 10,
      branch TEXT DEFAULT 'عام',
      disabled INTEGER DEFAULT 0,
      created_at TIMESTAMP DEFAULT NOW()
    )`,
    `CREATE TABLE IF NOT EXISTS exams (
      id SERIAL PRIMARY KEY,
      subjectKey TEXT,
      subjectName TEXT,
      subjectGroup TEXT DEFAULT 'general',
      lessonTitle TEXT,
      branch TEXT DEFAULT 'عام',
      content TEXT,
      created_at TIMESTAMP DEFAULT NOW()
    )`,
    `CREATE TABLE IF NOT EXISTS notes (
      id SERIAL PRIMARY KEY,
      title TEXT,
      subjectKey TEXT,
      subjectName TEXT,
      subjectGroup TEXT DEFAULT 'general',
      ownerName TEXT,
      size TEXT,
      fileUrl TEXT,
      branch TEXT DEFAULT 'عام',
      aiDraft TEXT,
      isDraft INTEGER DEFAULT 0,
      created_at TIMESTAMP DEFAULT NOW()
    )`,
    `CREATE TABLE IF NOT EXISTS certificates (
      id SERIAL PRIMARY KEY,
      phone TEXT,
      name TEXT,
      points INTEGER,
      rank_title TEXT,
      cert_number TEXT,
      issued_at TIMESTAMP DEFAULT NOW()
    )`,
    `CREATE TABLE IF NOT EXISTS otp_codes (
      id SERIAL PRIMARY KEY,
      phone TEXT,
      email TEXT,
      code TEXT,
      expires_at TIMESTAMP,
      created_at TIMESTAMP DEFAULT NOW()
    )`,
    `CREATE TABLE IF NOT EXISTS otp_verifications (
      email TEXT PRIMARY KEY,
      expires_at TIMESTAMP NOT NULL,
      created_at TIMESTAMP DEFAULT NOW()
    )`,
    `CREATE TABLE IF NOT EXISTS exam_attempts (
      id SERIAL PRIMARY KEY,
      exam_id INTEGER NOT NULL,
      phone TEXT NOT NULL,
      score INTEGER DEFAULT 0,
      total_points INTEGER DEFAULT 0,
      correct_count INTEGER DEFAULT 0,
      answers TEXT,
      created_at TIMESTAMP DEFAULT NOW(),
      UNIQUE(exam_id, phone)
    )`,
    `CREATE TABLE IF NOT EXISTS exam_drafts (
      id SERIAL PRIMARY KEY,
      subjectKey TEXT,
      subjectName TEXT,
      lessonTitle TEXT,
      branch TEXT DEFAULT 'عام',
      questions TEXT,
      created_at TIMESTAMP DEFAULT NOW()
    )`,
    `CREATE TABLE IF NOT EXISTS sessions (
      token TEXT PRIMARY KEY,
      kind TEXT NOT NULL,
      phone TEXT,
      expires_at TIMESTAMP NOT NULL,
      created_at TIMESTAMP DEFAULT NOW()
    )`,
  ];

  for (const statement of statements) await db.runAsync(statement, []);
  await db.runAsync(`CREATE UNIQUE INDEX IF NOT EXISTS idx_certificates_phone_rank ON certificates(phone, rank_title)`, []);
  await db.runAsync(`DELETE FROM otp_codes WHERE expires_at < ?`, [new Date()]);
}

const databaseReady = initializeDatabase()
  .then(() => true)
  .catch((err) => {
    // لا نوقف خادم الواجهة بالكامل إذا كانت إعدادات Supabase ناقصة أثناء التطوير.
    // طلبات API ستتلقى 503 واضحاً من middleware أدناه إلى أن تُضبط قاعدة البيانات.
    console.error("خطأ في تهيئة قاعدة البيانات:", err.message);
    return false;
  });

// لا نستقبل طلبات API قبل اكتمال إنشاء جداول Supabase.
app.use("/api", async (req, res, next) => {
  const isReady = await databaseReady;
  if (!isReady) {
    return res.status(503).json({
      success: false,
      code: "DATABASE_UNAVAILABLE",
      message: "قاعدة البيانات غير متاحة حالياً. اضبط DATABASE_URL ثم أعد تشغيل الخادم.",
    });
  }
  return next();
});

// تخزين رموز التحقق (OTP) مؤقتاً في الذاكرة (إلى جانب قاعدة البيانات)
const otpStore = {};
const verifiedOtpEmails = {}; // email -> expiry after successful OTP verification

// إعدادات إيميل المنصة (Nodemailer)
// ⚠️ لازم تحط EMAIL_USER و EMAIL_PASS في ملف .env (راجع .env.example)
// لا تكتب كلمة السر هنا أبداً حتى لا تتسرب مع الكود
if (!process.env.EMAIL_USER || !process.env.EMAIL_PASS) {
  console.warn(
    "⚠️ تحذير: لم يتم ضبط EMAIL_USER / EMAIL_PASS في .env — لن يعمل إرسال الإيميلات (OTP والشهادات) حتى تضبطهما.",
  );
}
const transporter = nodemailer.createTransport({
  service: "gmail",
  auth: {
    user: process.env.EMAIL_USER,
    pass: process.env.EMAIL_PASS,
  },
});

// 1. تسجيل طالب جديد (هدية 10 نقاط + إرسال إيميل الترحيب الأسطوري)
app.post("/api/register", authLimiter, async (req, res) => {
  const name = normalizeText(req.body.name);
  const phone = normalizeText(req.body.phone);
  const email = normalizeText(req.body.email);
  const password = req.body.password;
  const branch = normalizeText(req.body.branch) || "عام";

  if (!name || !phone || !email || !password) {
    return res
      .status(400)
      .json({ success: false, message: "جميع الحقول مطلوبة" });
  }

  if (!isValidPhone(phone)) {
    return res
      .status(400)
      .json({ success: false, message: "رقم الهاتف غير صحيح" });
  }

  if (!isValidEmail(email)) {
    return res
      .status(400)
      .json({ success: false, message: "البريد الإلكتروني غير صحيح" });
  }

  // مصدر التحقق الدائم هو PostgreSQL؛ الذاكرة وحدها لا تكفي مع Netlify Functions.
  const verification = await new Promise((resolve) => {
    db.get(
      `SELECT email FROM otp_verifications WHERE email = ? AND expires_at > ? LIMIT 1`,
      [email, new Date()],
      (verificationErr, row) => resolve({ verificationErr, row }),
    );
  });
  if (verification.verificationErr || !verification.row) {
    delete verifiedOtpEmails[email];
    return res.status(400).json({
      success: false,
      code: "EMAIL_NOT_VERIFIED",
      message: "يجب تأكيد رمز التحقق من البريد قبل إنشاء الحساب",
    });
  }

  if (String(password).length < 6) {
    return res.status(400).json({
      success: false,
      message: "كلمة المرور يجب أن تكون 6 أحرف على الأقل",
    });
  }

  const initialPoints = 10;
  const hashedPassword = await hashPassword(password);
  const userBranch = branch === "أزهر" ? "أزهر" : "عام";

  db.get(
    `SELECT phone, email FROM users WHERE phone = ? OR email = ?`,
    [phone, email],
    (selectErr, existingUser) => {
      if (selectErr) {
        return res
          .status(500)
          .json({ success: false, message: "خطأ في التحقق من الحساب" });
      }

      if (existingUser) {
        if (existingUser.phone === phone) {
          return res
            .status(409)
            .json({ success: false, message: "رقم الهاتف مسجل مسبقاً!" });
        }
        return res
          .status(409)
          .json({ success: false, message: "البريد الإلكتروني مسجل مسبقاً!" });
      }

      const query = `INSERT INTO users (name, phone, email, password, points, branch) VALUES (?, ?, ?, ?, ?, ?)`;
      db.run(
        query,
        [name, phone, email, hashedPassword, initialPoints, userBranch],
        async function (insertErr) {
          if (insertErr) {
            return res.status(500).json({
              success: false,
              message: "تعذر إنشاء الحساب، حاول مرة أخرى",
            });
          }

          const welcomeMailOptions = {
            from: "dr.mostaqbaly@gmail.com",
            to: email,
            subject: "🎉 أهلاً بك يا بطل في منصة دكتور مستقبلي",
            html: `
                <div style="font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif; direction: rtl; text-align: right; background-color: #f8fafc; padding: 30px; color: #0f172a;">
                    <div style="max-width: 600px; margin: 0 auto; background: #ffffff; border-radius: 16px; padding: 30px; box-shadow: 0 4px 12px rgba(0,0,0,0.05); border-top: 5px solid #2563eb;">
                        <h2 style="color: #2563eb; margin-top: 0;">أهلاً بك يا دكتور ${name} في عائلة دكتور مستقبلي! 🩺🎓</h2>
                        <p style="font-size: 16px; line-height: 1.6;">بكل حب وفخر، بنرحب بيك في المنصة التعليمية الأولى المصممة خصيصاً عشان تاخد بيديك وتوصلك لهدفك في الثانوية العامة.</p>
                        <div style="background: #eff6ff; border-right: 4px solid #2563eb; padding: 15px; margin: 20px 0; border-radius: 8px;">
                            <p style="margin: 0; font-weight: bold; color: #1e40af;">🎁 هدية الترحيب الخاصة بك:</p>
                            <p style="margin: 5px 0 0 0; font-size: 15px;">تم إضافة <strong>10 نقاط مجانية</strong> لحسابك فور التسجيل! ابدأ حل الامتحانات واجمع النقاط عشان توصل للقب <strong>"دكتور مستقبلي"</strong> عند جمع 500 نقطة.</p>
                        </div>
                        <h3 style="color: #0f172a; margin-top: 25px;">إيه اللي مستنيك جوه المنصة؟</h3>
                        <ul style="line-height: 1.8; font-size: 15px;">
                            <li>📚 <strong>بنك المذكرات:</strong> ملخصات وشروحات لكل الدروس بصيغة PDF.</li>
                            <li>📝 <strong>الامتحانات التفاعلية:</strong> امتحن وجرب نفسك واعرف مستواك فوراً مع تصحيح وتوضيح لكل إجابة.</li>
                            <li>🤖 <strong>دكتور AI:</strong> المعلم الذكي المتاح 24 ساعة للرد على كل أسئلتك وشرح المناهج.</li>
                            <li>🏆 <strong>لوحة الصدارة:</strong> نافس زمايلك وكن في المركز الأول دائماً!</li>
                        </ul>
                        <div style="text-align: center; margin-top: 30px;">
                            <a href="http://localhost:3000" style="background: #2563eb; color: white; padding: 12px 25px; border-radius: 10px; text-decoration: none; font-weight: bold; display: inline-block;">اضغط هنا للدخول للمنصة 🚀</a>
                        </div>
                        <p style="margin-top: 30px; font-size: 14px; color: #64748b; text-align: center; border-top: 1px solid #e2e8f0; padding-top: 15px;">
                            مع تحيات فريق عمل منصة دكتور مستقبلي 🩺<br>
                            إذا واجهتك أي مشكلة، تواصل معنا فوراً!
                        </p>
                    </div>
                </div>`,
          };

          transporter.sendMail(welcomeMailOptions, (mailErr) => {
            if (mailErr) console.log("خطأ في إرسال إيميل الترحيب:", mailErr);
            else console.log("تم إرسال إيميل الترحيب للطالب بنجاح!");
          });

          db.run(`DELETE FROM otp_verifications WHERE email = ?`, [email]);
          delete verifiedOtpEmails[email];
          const studentToken = await createStudentSession(phone);
          res.status(200).json({
            success: true,
            token: studentToken,
            user: { name, email, phone, points: initialPoints, branch: userBranch },
            message:
              "🎉 أهلاً بك يا دكتور! حصلت على 10 نقاط هدية التسجيل وتم إرسال تفاصيل الحساب إلى بريدك الإلكتروني.",
          });
        },
      );
    },
  );
});

// 2. تسجيل الدخول (فحص كلمة السر)
app.post("/api/login", authLimiter, (req, res) => {
  const phone = normalizeText(req.body.phone);
  const password = req.body.password;

  if (!phone || !password) {
    return res
      .status(400)
      .json({ success: false, message: "رقم الهاتف وكلمة المرور مطلوبان" });
  }

  db.get(`SELECT * FROM users WHERE phone = ?`, [phone], async (err, user) => {
    if (err) {
      return res
        .status(500)
        .json({ success: false, message: "خطأ في تسجيل الدخول" });
    }
    if (!user) {
      return res
        .status(404)
        .json({ success: false, message: "رقم الهاتف غير مسجل!" });
    }
    if (user.disabled) {
      return res.status(403).json({
        success: false,
        message:
          "تم تعطيل هذا الحساب. تواصل مع إدارة المنصة للمزيد من التفاصيل.",
      });
    }

    const isValid = await verifyPassword(password, user.password, phone);
    if (!isValid) {
      return res
        .status(401)
        .json({ success: false, message: "كلمة السر غير صحيحة!" });
    }
    const studentToken = await createStudentSession(user.phone);
    res.status(200).json({
      success: true,
      token: studentToken,
      user: {
        name: user.name,
        email: user.email,
        phone: user.phone,
        points: user.points,
        branch: user.branch,
      },
    });
  });
});

// 2.5. تسجيل دخول الأدمن (صلاحيات من Backend)
app.post("/api/logout", requireStudentAuth, (req, res) => {
  const token = req.headers["x-student-token"] || String(req.headers.authorization || "").replace(/^Bearer\s+/i, "");
  if (token) db.run(`DELETE FROM sessions WHERE token = ?`, [token]);
  return res.status(200).json({ success: true });
});

app.post("/api/admin-login", authLimiter, async (req, res) => {
  const ip = req.ip;
  if (isAdminLoginBlocked(ip)) {
    return res.status(429).json({
      success: false,
      message: "محاولات فاشلة كثيرة، حاول مرة أخرى بعد 15 دقيقة",
    });
  }

  const { password } = req.body;
  if (!password) {
    return res
      .status(400)
      .json({ success: false, message: "كلمة السر مطلوبة" });
  }
  if (hashString(password) !== ADMIN_PASS_HASH) {
    registerAdminFailure(ip);
    return res
      .status(401)
      .json({ success: false, message: "كلمة السر غير صحيحة" });
  }
  clearAdminFailures(ip);
  const token = await createAdminSession();
  res.status(200).json({ success: true, token });
});

// تصحيح الامتحان وحساب النقاط على الخادم فقط
app.post("/api/exams/:examId/submit", requireStudentAuth, pointsLimiter, (req, res) => {
  const examId = Number(req.params.examId);
  const answers = Array.isArray(req.body.answers) ? req.body.answers : [];
  if (!Number.isInteger(examId) || examId <= 0) {
    return res.status(400).json({ success: false, message: "معرف الامتحان غير صالح" });
  }

  db.get(`SELECT * FROM users WHERE phone = ?`, [req.studentPhone], (userErr, user) => {
    if (userErr || !user || user.disabled) {
      return res.status(401).json({ success: false, message: "حساب الطالب غير صالح" });
    }
    db.get(`SELECT * FROM exams WHERE id = ?`, [examId], (examErr, exam) => {
      if (examErr || !exam) {
        return res.status(404).json({ success: false, message: "الامتحان غير موجود" });
      }
      const branch = normalizeBranch(user.branch);
      if (exam.branch !== "مشترك" && normalizeBranch(exam.branch) !== branch) {
        return res.status(403).json({ success: false, message: "هذا الامتحان غير متاح لفرعك" });
      }
      let questions;
      try {
        questions = JSON.parse(exam.content || "[]");
      } catch {
        questions = [];
      }
      if (!questions.length || answers.length !== questions.length) {
        return res.status(400).json({ success: false, message: "يجب إرسال إجابة لكل أسئلة الامتحان" });
      }
      const score = questions.reduce((sum, question, index) => {
        const points = Number.isFinite(Number(question.points)) ? Math.max(1, Math.min(10, Math.round(Number(question.points)))) : 2;
        return sum + (Number(answers[index]) === Number(question.correct) ? points : 0);
      }, 0);
      const totalPoints = questions.reduce((sum, question) => sum + (Number.isFinite(Number(question.points)) ? Math.max(1, Math.min(10, Math.round(Number(question.points)))) : 2), 0);
      const correctCount = questions.reduce((sum, question, index) => sum + (Number(answers[index]) === Number(question.correct) ? 1 : 0), 0);
      db.run(
        `INSERT INTO exam_attempts (exam_id, phone, score, total_points, correct_count, answers) VALUES (?, ?, ?, ?, ?, ?)`,
        [examId, req.studentPhone, score, totalPoints, correctCount, JSON.stringify(answers)],
        function (attemptErr) {
          if (attemptErr) {
            if (String(attemptErr.message || "").includes("UNIQUE")) {
              return res.status(409).json({ success: false, code: "EXAM_ALREADY_SUBMITTED", message: "لقد أديت هذا الامتحان من قبل، ولن تتم إضافة النقاط مرة أخرى." });
            }
            return res.status(500).json({ success: false, message: "تعذر حفظ محاولة الامتحان" });
          }
          const newPoints = Number(user.points || 0) + score;
          db.run(`UPDATE users SET points = ? WHERE phone = ?`, [newPoints, req.studentPhone], (updateErr) => {
            if (updateErr) return res.status(500).json({ success: false, message: "تعذر تحديث نقاط الطالب" });
            if (score > 0) checkAndIssueCertificates(req.studentPhone, user, newPoints);
            const rank = getRankTitle(newPoints);
            res.status(200).json({ success: true, score, totalPoints, correctCount, newPoints, rank, message: `تم تصحيح الامتحان وإضافة ${score} نقطة بشكل آمن.` });
          });
        },
      );
    });
  });
});

// 3. تحديث النقاط وحساب الألقاب وإرسال إيميل عند الوصول لـ 500 نقطة
app.post("/api/update-points", requireStudentAuth, pointsLimiter, (req, res) => {
  const phone = normalizeText(req.body.phone);
  let addedPoints = Number(req.body.addedPoints);

  if (!phone || !isValidPhone(phone) || phone !== req.studentPhone) {
    return res
      .status(400)
      .json({ success: false, message: "جلسة الطالب غير صالحة" });
  }

  return res.status(410).json({
    success: false,
    code: "POINTS_ROUTE_RETIRED",
    message: "يتم احتساب النقاط من نتيجة الامتحان على الخادم فقط.",
  });

  // حماية: لا نسمح بإرسال أي رقم عشوائي (سالب أو ضخم) من الفرونت إند
  // الحد الأقصى المسموح به لكل سؤال هو 10 نقاط (يتوافق مع أعلى قيمة نقاط للسؤال الواحد)
  if (!Number.isFinite(addedPoints) || addedPoints <= 0 || addedPoints > 10) {
    return res
      .status(400)
      .json({ success: false, message: "قيمة نقاط غير صالحة" });
  }
  addedPoints = Math.round(addedPoints);

  db.get(`SELECT * FROM users WHERE phone = ?`, [phone], (err, user) => {
    if (err || !user) {
      return res
        .status(404)
        .json({ success: false, message: "الطالب غير موجود" });
    }

    const oldPoints = user.points || 10;
    const newPoints = oldPoints + addedPoints;

    db.run(
      `UPDATE users SET points = ? WHERE phone = ?`,
      [newPoints, phone],
      (updateErr) => {
        if (updateErr) {
          return res
            .status(500)
            .json({ success: false, message: "خطأ في تحديث النقاط" });
        }

        let rank = "طالب عادي";
        if (newPoints >= 500) {
          rank = "دكتور مستقبلي 🩺";

          const mailOptions = {
            from: "dr.mostaqbaly@gmail.com",
            to: "dr.mostaqbaly@gmail.com",
            subject: `🚨 مبروك يا دكتور! طالب جديد وصل لقب "دكتور مستقبلي"`,
            text: `البطل / ${user.name}\nرقم الهاتف: ${user.phone}\nوصل إلى ${newPoints} نقطة وحصل رسمياً على لقب "دكتور مستقبلي"! 🎓🔥`,
          };

          transporter.sendMail(mailOptions, (mailErr) => {
            if (mailErr) console.log("خطأ في إرسال الإيميل:", mailErr);
            else console.log("تم إرسال إيميل اللقب بنجاح!");
          });
        } else if (newPoints >= 200) {
          rank = "طالب عبقري 💡";
        } else if (newPoints >= 100) {
          rank = "طالب مميز 🏅";
        } else if (newPoints >= 50) {
          rank = "طالب متفوق 🌟";
        }

        // التحقق من الشهادات وإصدارها تلقائياً عند الوصول للنقاط التالية
        checkAndIssueCertificates(phone, user, newPoints);

        res.status(200).json({
          success: true,
          newPoints: newPoints,
          rank: rank,
          message: `مبروك! حصلت على نقاط جديدة. لقبك الحالي: ${rank}`,
        });
      },
    );
  });
});

// دالة إصدار الشهادات تلقائياً عند الوصول للنقاط التالية: 100 - 300 - 600 - 1000
function checkAndIssueCertificates(phone, user, newPoints) {
  const milestones = [
    { points: 100, title: "طالب مجتهد 📚" },
    { points: 300, title: "طالب متميز 🏅" },
    { points: 600, title: "طالب متفوق 🌟" },
    { points: 1000, title: "دكتور مستقبلي 🩺" },
  ];

  milestones.forEach((m) => {
    if (newPoints >= m.points) {
      // التحقق من عدم وجود شهادة مسبقة لهذا المستوى (منع إنشاء الشهادة مرتين)
      db.get(
        `SELECT id FROM certificates WHERE phone = ? AND rank_title = ?`,
        [phone, m.title],
        (cerr, existing) => {
          if (!existing) {
            // إنشاء رقم شهادة فريد
            const certNumber =
              "DM-" + Date.now() + "-" + Math.floor(Math.random() * 1000);
            db.run(
              `INSERT INTO certificates (phone, name, points, rank_title, cert_number) VALUES (?, ?, ?, ?, ?) ON CONFLICT (phone, rank_title) DO NOTHING`,
              [phone, user.name, newPoints, m.title, certNumber],
              function (ierr) {
                if (!ierr && this.changes > 0) {
                  console.log(
                    `تم إصدار شهادة "${m.title}" للطالب ${user.name} 🎓`,
                  );
                  // إرسال الشهادة إلى البريد الإلكتروني
                  sendCertificateEmail(
                    user.email,
                    user.name,
                    certNumber,
                    newPoints,
                    m.title,
                  );
                }
              },
            );
          }
        },
      );
    }
  });
}

// دالة إرسال الشهادة إلى البريد الإلكتروني
function sendCertificateEmail(toEmail, name, certNumber, points, title) {
  if (!toEmail) return;
  const mailOptions = {
    from: "dr.mostaqbaly@gmail.com",
    to: toEmail,
    subject: `🎓 مبروك يا دكتور ${name}! حصلت على شهادة "${title}"`,
    html: `
      <div style="font-family: 'Segoe UI', Tahoma, sans-serif; direction: rtl; text-align: center; background: #f8fafc; padding: 30px;">
        <div style="max-width: 500px; margin: 0 auto; background: #fff; border-radius: 16px; padding: 30px; border-top: 5px solid #f59e0b;">
          <h2 style="color: #2563eb; margin-top: 0;">🏆 مبروك يا دكتور ${name}!</h2>
          <p style="font-size: 16px; color: #333;">حصلت على شهادة <strong>"${title}"</strong> بإجمالي ${points} نقطة.</p>
          <p style="font-size: 14px; color: #64748b;">رقم الشهادة: ${certNumber}</p>
          <p style="font-size: 13px; color: #64748b;">استمر في التقدم والوصول لأعلى الألقاب! 🚀</p>
        </div>
      </div>`,
  };

  transporter.sendMail(mailOptions, (mailErr) => {
    if (mailErr) console.log("خطأ في إرسال إيميل الشهادة:", mailErr);
    else console.log(`تم إرسال شهادة "${title}" إلى بريد ${name} بنجاح!`);
  });
}

// 3. مسار جلب لوحة الصدارة (Leaderboard API)
app.get("/api/leaderboard", (req, res) => {
  const query = `SELECT name, points, branch FROM users ORDER BY points DESC LIMIT 10`;
  db.all(query, [], (err, rows) => {
    if (err) {
      return res
        .status(500)
        .json({ success: false, message: "خطأ في تحميل لوحة الصدارة" });
    }
    res.status(200).json({ success: true, leaderboard: rows });
  });
});

// 4. جلب بيانات الملف الشخصي
app.get("/api/profile", requireStudentAuth, (req, res) => {
  const phone = req.studentPhone;
  db.get(`SELECT * FROM users WHERE phone = ?`, [phone], (err, user) => {
    if (err || !user) {
      return res
        .status(404)
        .json({ success: false, message: "الطالب غير موجود" });
    }
    if (user.disabled) {
      return res.status(403).json({ success: false, message: "تم تعطيل هذا الحساب" });
    }

    // حساب اللقب من مصدر واحد
    const rankTitle = getRankTitle(user.points);

    // جلب عدد الشهادات والامتحانات المنجزة
    db.get(
      `SELECT COUNT(*) AS cnt,
              (SELECT COUNT(*) FROM exam_attempts WHERE phone = ?) AS examsCompleted
         FROM certificates WHERE phone = ?`,
      [phone, phone],
      (cerr, crow) => {
        res.status(200).json({
          success: true,
          user: {
            name: user.name,
            email: user.email,
            phone: user.phone,
            points: user.points,
            branch: user.branch,
            rankTitle: rankTitle,
            certificatesCount: crow ? crow.cnt : 0,
            examsCompleted: crow ? crow.examsCompleted : 0,
          },
        });
      },
    );
  });
});

function getUserBranchFromRequest(req) {
  return normalizeBranch(req.query.branch || req.body?.branch || "عام");
}

// يحدد نظام المحتوى (عام/أزهر) المطلوب عرضه.
// الأولوية دائماً لاختيار الطالب الظاهر في واجهة الموقع (زر "اختر نظامك")
// وليس لفرع الحساب المسجل به، لأن الموقع يسمح للطالب بتصفح أي نظام.
// كما أنه يسمح للزائر غير المسجل بتصفح المحتوى العام بدون تسجيل دخول إجباري.
function requireStudentSession(req, res, next) {
  const phone = normalizeText(req.query.phone || req.body?.phone || "");
  const requestedBranch = getUserBranchFromRequest(req);

  if (!phone) {
    // زائر غير مسجل: يسمح له بتصفح المحتوى حسب النظام المختار في الواجهة فقط
    req.userBranch = requestedBranch;
    return next();
  }

  db.get(`SELECT branch FROM users WHERE phone = ?`, [phone], (err, row) => {
    if (err || !row) {
      // رقم غير معروف بالسيرفر (قد يكون بيانات محلية قديمة) - نعامله كزائر
      req.userBranch = requestedBranch;
      return next();
    }
    // النظام المختار في الواجهة له الأولوية، وإلا نستخدم فرع الحساب
    req.userBranch = requestedBranch || row.branch || "عام";
    next();
  });
}

// 5. حفظ امتحان/درس جديد (للأدمن فقط)
app.post("/api/exams", requireAdmin, (req, res) => {
  const rawSubjectKey = normalizeText(req.body.subjectKey);
  const examBranch = normalizeBranch(req.body.branch);
  const subjectKey = normalizeSubjectKey(rawSubjectKey);
  const subjectGroup = getSubjectGroup(subjectKey, examBranch);
  const subjectName = getSubjectLabel(subjectKey, examBranch, req.body.subjectName);
  const { lessonTitle, content } = req.body;
  db.run(
    `INSERT INTO exams (subjectKey, subjectName, subjectGroup, lessonTitle, branch, content) VALUES (?, ?, ?, ?, ?, ?)`,
    [subjectKey, subjectName, subjectGroup, lessonTitle, examBranch, JSON.stringify(content)],
    function (err) {
      if (err) {
        return res
          .status(500)
          .json({ success: false, message: "خطأ في حفظ الامتحان" });
      }
      res.status(200).json({ success: true, id: this.lastID });
    },
  );
});

// 6. جلب الامتحانات (مع فلترة بالفرع)
app.get("/api/exams", requireStudentSession, (req, res) => {
  const userBranch = req.userBranch || getUserBranchFromRequest(req);
  db.all(
    `SELECT * FROM exams WHERE branch = ? OR branch = 'مشترك' ORDER BY created_at DESC`,
    [userBranch],
    (err, rows) => {
      if (err) {
        return res
          .status(500)
          .json({ success: false, message: "خطأ في جلب الامتحانات" });
      }
      const exams = rows.map((r) => ({
        id: r.id,
        subjectKey: normalizeSubjectKey(r.subjectKey),
        subjectName: getSubjectLabel(r.subjectKey, r.branch, r.subjectName),
        subjectGroup: r.subjectGroup || getSubjectGroup(r.subjectKey, r.branch),
        lessonTitle: r.lessonTitle,
        branch: r.branch,
        content: JSON.parse(r.content || "[]"),
      }));
      res.status(200).json({ success: true, exams: exams });
    },
  );
});

function createNoteDraftFromContent(
  title,
  subjectName,
  branch,
  content,
  sourceType,
  sourceName,
) {
  const intro = content && content.trim() ? content.trim().slice(0, 2200) : "";
  const warning = intro
    ? "\n\n⚠️ ملاحظة: تم إنشاء هذه المذكرة بناءً على المصدر المرفوع، مع الحفاظ على الدقة والالتزام بالمواد الموجودة فقط. إذا وجدت معلومة غير واضحة، راجع المصدر الأصلي قبل الاعتماد النهائي."
    : "";
  return {
    title,
    subjectName,
    branch,
    coverTitle: title,
    coverSubtitle: `مذكرة ${subjectName} • ${branch}`,
    objectives: [
      "فهم المحتوى الأساسي للمادة",
      "ترتيب الأفكار بطريقة مبسطة",
      "تسهيل المراجعة على الهاتف والطباعة",
    ],
    summary: `هذه مذكرة تم إنشاؤها من مصدر ${sourceType || "مرفوع"} باسم ${sourceName || "مصدر غير محدد"}.`,
    sections: [
      {
        title: "شرح مبسط",
        content: `استندت هذه المذكرة إلى المحتوى الموجود في المصدر المرفوع. تم ترتيب الأفكار بشكل واضح ومناسب للمراجعة السريعة. ${warning}`,
      },
      {
        title: "أمثلة تطبيقية",
        content:
          "راجع الأمثلة الأصلية الموجودة في المصدر لتأكيد الفهم، ثم حل الأسئلة بنفس الأسلوب.",
      },
      {
        title: "أهم النقاط",
        content:
          "ركز على الفكرة الأساسية أولًا ثم على التفاصيل الثانوية عند الحاجة.",
      },
      {
        title: "أسئلة مراجعة",
        content:
          "1) اذكر الفكرة الرئيسية.\n2) اشرح الفرق بين المفهومين.\n3) أعط مثالًا تطبيقيًا.",
      },
    ],
    sourceText: intro,
    warnings: intro
      ? []
      : ["لم يتم استخراج نص واضح من المصدر، تحتاج مراجعة يدوية."],
    isDraft: true,
    createdAt: new Date().toISOString(),
  };
}

async function generateNoteDraftWithAI(content, title, subjectName, branch) {
  const apiKey = normalizeText(process.env.AI_API_KEY || process.env.OPENAI_API_KEY);
  const aiBase = normalizeText(process.env.OPENAI_API_BASE || "https://api.openai.com/v1").replace(/\/$/, "");
  const aiUrl = normalizeText(process.env.AI_API_URL || (apiKey ? `${aiBase}/chat/completions` : ""));
  if (!apiKey || !aiUrl) return null;

  const payload = {
    model: process.env.AI_MODEL || "gpt-5-mini",
    messages: [
      {
        role: "system",
        content: "أنت محرر مذكرات تعليمية مصرية. أنشئ مسودة دقيقة ومنظمة من المصدر فقط، ولا تضف معلومات غير موجودة. أعد JSON صالحاً فقط بالمفاتيح: summary كنص، objectives كمصفوفة نصوص، sections كمصفوفة كائنات {title,content}، reviewQuestions كمصفوفة نصوص، warnings كمصفوفة نصوص. اجعل اللغة عربية واضحة ومناسبة للمراجعة.",
      },
      {
        role: "user",
        content: `العنوان: ${title}\nالمادة: ${subjectName}\nالفرع: ${branch}\n\nالمصدر:\n${content.slice(0, 20000)}`,
      },
    ],
    temperature: 0.2,
    max_completion_tokens: 1800,
  };

  try {
    const data = await callAICompletion(aiUrl, apiKey, payload);
    if (!data) return null;
    const raw = data.choices?.[0]?.message?.content || data.output_text || "";
    const cleaned = String(raw).replace(/```json|```/g, "").trim();
    const parsed = JSON.parse(cleaned);
    if (!parsed || typeof parsed !== "object" || !Array.isArray(parsed.sections)) return null;
    return {
      title,
      subjectName,
      branch,
      coverTitle: title,
      coverSubtitle: `مذكرة ${subjectName} • ${branch}`,
      summary: String(parsed.summary || "").trim(),
      objectives: Array.isArray(parsed.objectives) ? parsed.objectives.map(String).filter(Boolean).slice(0, 8) : [],
      sections: parsed.sections.map((section) => ({ title: String(section.title || "قسم"), content: String(section.content || "") })).filter((section) => section.content.trim()).slice(0, 12),
      reviewQuestions: Array.isArray(parsed.reviewQuestions) ? parsed.reviewQuestions.map(String).filter(Boolean).slice(0, 12) : [],
      warnings: Array.isArray(parsed.warnings) ? parsed.warnings.map(String).filter(Boolean).slice(0, 8) : [],
      aiGenerated: true,
    };
  } catch (error) {
    console.log("تعذر إنشاء مسودة المذكرة بالذكاء الاصطناعي:", error.message);
    return null;
  }
}

async function extractPdfTextWithOCR(filePath) {
  const tempPrefix = path.join(os.tmpdir(), `mostaqbaly-ocr-${Date.now()}-${crypto.randomBytes(4).toString("hex")}`);
  const tempDir = path.dirname(tempPrefix);
  try {
    await execFileAsync("pdftoppm", ["-png", "-r", "160", filePath, tempPrefix], {
      timeout: 180000,
      maxBuffer: 1024 * 1024,
    });
    const prefixName = path.basename(tempPrefix);
    const imageFiles = (await fs.promises.readdir(tempDir))
      .filter((name) => name.startsWith(`${prefixName}-`) && name.endsWith(".png"))
      .sort((a, b) => a.localeCompare(b, undefined, { numeric: true }));
    const pages = [];
    for (const imageName of imageFiles) {
      const imagePath = path.join(tempDir, imageName);
      try {
        const { data } = await Tesseract.recognize(imagePath, "ara+eng");
        if (data?.text) pages.push(data.text);
      } finally {
        await fs.promises.unlink(imagePath).catch(() => {});
      }
    }
    return pages.join("\\n\\n");
  } catch (error) {
    console.log("تعذر تشغيل OCR للـPDF المصور:", error.message);
    return "";
  }
}

// استخراج النص من صورة باستخدام موديل ذكاء اصطناعي يدعم الصور (أسرع وأدق
// وأكثر ثباتاً على السيرفرات اللحظية "serverless" من Tesseract، وده أضمن حل
// طالما عندنا AI_API_KEY مضبوط أصلاً لباقي الميزات).
async function extractTextFromImageWithAI(filePath) {
  const apiKey = normalizeText(process.env.AI_API_KEY || process.env.OPENAI_API_KEY);
  const aiBase = normalizeText(process.env.OPENAI_API_BASE || "https://api.openai.com/v1").replace(/\/$/, "");
  const aiUrl = normalizeText(process.env.AI_API_URL || (apiKey ? `${aiBase}/chat/completions` : ""));
  if (!apiKey || !aiUrl) return null;

  try {
    const imageBuffer = await fs.promises.readFile(filePath);
    const base64Image = imageBuffer.toString("base64");
    const ext = path.extname(filePath).toLowerCase().replace(".", "") || "jpeg";
    const mimeType = ext === "jpg" ? "jpeg" : ext;

    const payload = {
      // موديل مخصص لقراءة الصور (Vision) - منفصل عن AI_MODEL العادي
      // النصي لأن مش كل الموديلات بتدعم صور
      model: process.env.AI_VISION_MODEL || "qwen/qwen3.6-27b",
      messages: [
        {
          role: "user",
          content: [
            {
              type: "text",
              text:
                "أنت أداة نسخ نصوص (OCR) دقيقة، لست مساعداً يجيب على الأسئلة. " +
                "انسخ فقط كل نص مكتوب في الصورة بالضبط كما هو مكتوب، حرفاً بحرف، من أول سطر لآخر سطر في الصورة، بدون أي تلخيص أو حذف أو إعادة صياغة. " +
                "حافظ على ترقيم كل سؤال ورموز الاختيارات (أ ب ج د) كما هي بالضبط. " +
                "ممنوع منعاً باتاً اختراع أي نص غير موجود فعلياً في الصورة. لو جزء من الصورة غير واضح أو لا يمكن قراءته، اكتب [غير واضح] في مكانه ولا تخمّن. " +
                "لا تضف أي مقدمة أو تعليق أو ملخص، ابدأ مباشرة بنسخ النص.",
            },
            {
              type: "image_url",
              image_url: {
                url: `data:image/${mimeType};base64,${base64Image}`,
                detail: "high",
              },
            },
          ],
        },
      ],
      temperature: 0,
      max_tokens: 4000,
    };

    const data = await callAICompletion(aiUrl, apiKey, payload);
    if (!data) return null;
    const text = data.choices?.[0]?.message?.content || "";
    return normalizeText(text) ? text : null;
  } catch (err) {
    console.log("تعذر استخراج النص من الصورة بالذكاء الاصطناعي:", err.message);
    return null;
  }
}

// إصلاح ترتيب النص العربي المستخرج من ملفات PDF، واللي أحياناً بييجي معكوس
// أو مبعثر بسبب طريقة تخزين بعض ملفات الـ PDF للنص العربي (مشكلة معروفة في
// أغلب مكتبات قراءة PDF مع النصوص من اليمين لليسار). بنستخدم الذكاء
// الاصطناعي لإعادة بناء النص بترتيبه الصحيح بدل تخمين قواعد ثابتة قد
// تفشل مع حالات مختلفة.
async function repairArabicPdfText(rawText) {
  const apiKey = normalizeText(process.env.AI_API_KEY || process.env.OPENAI_API_KEY);
  const aiBase = normalizeText(process.env.OPENAI_API_BASE || "https://api.openai.com/v1").replace(/\/$/, "");
  const aiUrl = normalizeText(process.env.AI_API_URL || (apiKey ? `${aiBase}/chat/completions` : ""));
  // لو معندناش مفتاح ذكاء اصطناعي، رجّع النص الخام كما هو (أفضل من لا شيء)
  if (!apiKey || !aiUrl || !rawText || !rawText.trim()) return rawText;

  try {
    const payload = {
      model: process.env.AI_MODEL || "gpt-5-mini",
      messages: [
        {
          role: "user",
          content:
            "النص التالي مستخرج آلياً من ملف PDF عربي، وقد يكون ترتيب الحروف أو " +
            "الكلمات معكوساً أو مبعثراً بسبب مشكلة تقنية شائعة في استخراج النص " +
            "العربي من ملفات PDF. أعد بناء النص بالترتيب الصحيح والمقروء بالعربية " +
            "الفصحى دون تغيير المعنى أو حذف أي محتوى (حافظ على كل الأسئلة والاختيارات " +
            "والأرقام كما هي، فقط أصلح ترتيب القراءة). إذا كان النص سليماً بالفعل، " +
            "أعده كما هو دون أي تغيير. لا تضف أي مقدمة أو تعليق، أعد النص المُصلح فقط:\n\n" +
            rawText.slice(0, 12000),
        },
      ],
      temperature: 0,
      max_tokens: 4000,
    };
    const data = await callAICompletion(aiUrl, apiKey, payload);
    const fixed = data?.choices?.[0]?.message?.content;
    return fixed && fixed.trim() ? fixed : rawText;
  } catch (err) {
    console.log("تعذر إصلاح ترتيب نص PDF العربي:", err.message);
    return rawText;
  }
}

// فحص سريع: هل النص فيه عربي بشكل كافٍ يستاهل نمرّ عليه بخطوة الإصلاح؟
// (تجنباً لاستدعاء الذكاء الاصطناعي بلا داعٍ على ملفات إنجليزية بالكامل)
function looksLikeArabic(text) {
  const arabicChars = (text.match(/[\u0600-\u06FF]/g) || []).length;
  return arabicChars > 20;
}

async function extractTextFromFile(filePath, originalName) {
  const ext = path.extname(originalName || "").toLowerCase();
  if (ext === ".txt") {
    return fs.promises.readFile(filePath, "utf8");
  }
  if (ext === ".docx") {
    const result = await mammoth.extractRawText({ path: filePath });
    return result.value || "";
  }
  if (ext === ".pdf") {
    const data = await pdfParse(await fs.promises.readFile(filePath));
    const extractedText = data.text || "";
    if (!extractedText.trim()) return extractPdfTextWithOCR(filePath);
    // لو النص فيه عربي، نمرّ عليه بخطوة إصلاح الترتيب أولاً
    return looksLikeArabic(extractedText)
      ? repairArabicPdfText(extractedText)
      : extractedText;
  }
  if ([".png", ".jpg", ".jpeg", ".webp"].includes(ext)) {
    // المحاولة الأولى: قراءة الصورة بالذكاء الاصطناعي (أسرع وأثبت في السيرفرات اللحظية)
    const aiText = await extractTextFromImageWithAI(filePath);
    if (aiText && aiText.trim()) return aiText;
    // احتياطي: لو الذكاء الاصطناعي مش متاح أو فشل، نرجع لـ Tesseract التقليدية
    const { data } = await Tesseract.recognize(filePath, "ara+eng");
    return data?.text || "";
  }
  return "";
}

app.post("/api/notes", requireAdmin, (req, res) => {
  const noteBranch = normalizeBranch(req.body.branch);
  const subjectKey = normalizeSubjectKey(req.body.subjectKey);
  const subjectName = getSubjectLabel(subjectKey, noteBranch, req.body.subjectName);
  const subjectGroup = getSubjectGroup(subjectKey, noteBranch);
  const { title, size, fileUrl } = req.body;
  const ownerName = normalizeText(req.body.ownerName || "دكتور مستقبلي");
  db.run(
    `INSERT INTO notes (title, subjectKey, subjectName, subjectGroup, ownerName, size, fileUrl, branch) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
    [title, subjectKey, subjectName, subjectGroup, ownerName, size, fileUrl, noteBranch],
    function (err) {
      if (err) {
        return res
          .status(500)
          .json({ success: false, message: "خطأ في حفظ المذكرة" });
      }
      res.status(200).json({ success: true, id: this.lastID });
    },
  );
});

app.post(
  "/api/admin/notes/generate",
  requireAdmin,
  upload.array("sourceFiles", 10),
  async (req, res) => {
    try {
      const title = normalizeText(req.body.title || "مذكرة جديدة");
      const branch = normalizeBranch(req.body.branch);
      const subjectKey = normalizeSubjectKey(req.body.subjectKey);
      const subjectName = getSubjectLabel(
        subjectKey,
        branch,
        normalizeText(req.body.subjectName || "مادة غير محددة"),
      );
      const subjectGroup = getSubjectGroup(subjectKey, branch);
      const sourceType = normalizeText(req.body.sourceType || "مرفوع");
      const sourceName = normalizeText(
        req.body.sourceName ||
          (req.files && req.files[0]?.originalname) ||
          "مصدر غير محدد",
      );
      const ownerName = normalizeText(req.body.ownerName || "");

      if (!ownerName) {
        return res.status(400).json({ success: false, message: "اسم صاحب المذكرة مطلوب" });
      }

      if (!req.files || req.files.length === 0) {
        return res
          .status(400)
          .json({ success: false, message: "يرجى رفع ملف مصدر واحد على الأقل" });
      }

      // استخراج النص من كل الملفات المرفوعة بالتوازي (أسرع بكتير من التتابع،
      // ومهم عشان منتجاوزش الوقت المسموح للسيرفر لو رفع أكتر من ملف)
      const extractedParts = await Promise.all(
        req.files.map(async (file) => {
          try {
            return await extractTextFromFile(file.path, file.originalname);
          } catch (e) {
            console.log("تعذر استخراج نص من ملف:", file.originalname, e);
            return "";
          }
        }),
      );
      const combinedText = extractedParts.join("\n");
      const cleanedText = combinedText.replace(/\s+/g, " ").trim();

      if (!cleanedText) {
        req.files.forEach((f) => fs.unlink(f.path, () => {}));
        return res.status(400).json({
          success: false,
          message:
            "تعذر استخراج النص من الملفات المرفوعة، يرجى رفع ملفات واضحة أو نص مباشر",
        });
      }

      let draft = await generateNoteDraftWithAI(cleanedText, title, subjectName, branch);
      if (!draft) {
        draft = createNoteDraftFromContent(
          title,
          subjectName,
          branch,
          cleanedText,
          sourceType,
          sourceName,
        );
        draft.warnings = [
          ...(draft.warnings || []),
          "لم تتوفر خدمة الذكاء الاصطناعي وقت الإنشاء؛ تمت تهيئة مسودة من النص المستخرج وتحتاج مراجعة بشرية كاملة.",
        ];
      }
      draft.sourceText = cleanedText;
      draft.ownerName = ownerName;
      draft.aiGenerated = Boolean(draft.aiGenerated);

      // رفع أول ملف بشكل دائم على Supabase Storage كمرفق أساسي للمذكرة
      // (بدل التخزين المحلي اللي بيتمسح). لو المستخدم رفع أكتر من ملف، بيتم
      // دمج نص الكل في المسودة، لكن المرفق القابل للتنزيل هو أول ملف فقط
      // حاليًا حسب تصميم قاعدة البيانات الحالي.
      const primaryFile = req.files[0];
      const permanentFileUrl = await uploadLocalFileToStorage(
        primaryFile.path,
        primaryFile.originalname || sourceName,
      );
      req.files.forEach((f) => fs.unlink(f.path, () => {})); // مسح كل النسخ المؤقتة من السيرفر بعد الرفع

      const noteRecord = {
        title: draft.title,
        subjectKey: subjectKey || "custom",
        subjectName: draft.subjectName,
        subjectGroup,
        ownerName,
        size: req.body.size || "مستخرج تلقائياً",
        fileUrl: permanentFileUrl,
        branch: draft.branch,
        aiDraft: JSON.stringify(draft),
        isDraft: 1,
        created_at: new Date().toISOString(),
      };

      db.run(
        `INSERT INTO notes (title, subjectKey, subjectName, subjectGroup, ownerName, size, fileUrl, branch, aiDraft, isDraft) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          noteRecord.title,
          noteRecord.subjectKey,
          noteRecord.subjectName,
          noteRecord.subjectGroup,
          noteRecord.ownerName,
          noteRecord.size,
          noteRecord.fileUrl,
          noteRecord.branch,
          noteRecord.aiDraft,
          noteRecord.isDraft,
        ],
        function (err) {
          if (err) {
            return res
              .status(500)
              .json({ success: false, message: "تعذر حفظ المسودة" });
          }
          return res.status(200).json({
            success: true,
            draft: { ...noteRecord, id: this.lastID },
            aiGenerated: draft.aiGenerated,
        message: draft.aiGenerated
          ? "تم إنشاء مسودة بالذكاء الاصطناعي وانتظار المراجعة"
          : "تم استخراج النص وتهيئة مسودة للمراجعة اليدوية",
          });
        },
      );
    } catch (error) {
      console.log("خطأ في إنشاء المذكرة بالذكاء الاصطناعي:", error);
      return res
        .status(500)
        .json({ success: false, message: "حدث خطأ أثناء المعالجة" });
    }
  },
);

app.post("/api/admin/notes/approve", requireAdmin, (req, res) => {
  const { id, title, content, sourceText, warnings } = req.body;
  const ownerName = normalizeText(req.body.ownerName || "دكتور مستقبلي");
  const branch = normalizeBranch(req.body.branch);
  const subjectKey = normalizeSubjectKey(req.body.subjectKey || "custom");
  const subjectName = getSubjectLabel(subjectKey, branch, req.body.subjectName);
  const subjectGroup = getSubjectGroup(subjectKey, branch);
  if (!id) {
    return res
      .status(400)
      .json({ success: false, message: "معرف المذكرة مطلوب" });
  }
  const safeContent =
    typeof content === "string" ? content : JSON.stringify(content || {});
  db.run(
    `UPDATE notes SET title = ?, subjectName = ?, subjectKey = ?, subjectGroup = ?, ownerName = ?, branch = ?, aiDraft = ?, isDraft = 0 WHERE id = ?`,
    [title, subjectName, subjectKey, subjectGroup, ownerName, branch, safeContent, id],
    function (err) {
      if (err) {
        return res
          .status(500)
          .json({ success: false, message: "تعذر اعتماد المذكرة" });
      }
      if (this.changes === 0) {
        return res.status(404).json({ success: false, message: "المذكرة غير موجودة" });
      }
      return res
        .status(200)
        .json({ success: true, message: "تم اعتماد المذكرة ونشرها" });
    },
  );
});

// ========================================
// استخراج أسئلة الامتحانات بالذكاء الاصطناعي من صور/ملفات (للأدمن)
// ========================================

// محاولة تحليل نص خام لأسئلة اختيار من متعدد بصيغ شائعة (احتياطي بدون AI API)
function parseQuestionsHeuristically(rawText) {
  const text = String(rawText || "").replace(/\r/g, "");
  // نقسم النص عند بداية كل سؤال جديد (رقم متبوع بنقطة/قوس/شرطة)
  const blocks = text
    .split(/(?=(?:^|\n)\s*(?:\d{1,2}|س\s*\d{1,2})\s*[\.\)\-:])/g)
    .map((b) => b.trim())
    .filter(Boolean);

  const arabicLetters = ["أ", "ب", "ج", "د", "ه"];
  const questions = [];

  blocks.forEach((block) => {
    const lines = block
      .split("\n")
      .map((l) => l.trim())
      .filter(Boolean);
    if (!lines.length) return;

    // نص السؤال هو أول سطر بعد إزالة رقم السؤال
    const qLine = lines[0].replace(
      /^(?:\d{1,2}|س\s*\d{1,2})\s*[\.\)\-:]\s*/,
      "",
    );
    if (!qLine || qLine.length < 3) return;

    const options = [];
    let correctIdx = 0;
    let exp = "";

    lines.slice(1).forEach((line) => {
      const optMatch = line.match(/^(?:[أابجدهABCD1234])\s*[\.\)\-]\s*(.+)$/);
      if (optMatch && options.length < 6) {
        options.push(optMatch[1].trim().replace(/\s*[✔✓\*]\s*$/, ""));
        if (/[✔✓\*]/.test(line)) correctIdx = options.length - 1;
        return;
      }
      const ansMatch = line.match(
        /^(?:الإجابة|الاجابة|إجابة|الحل)\s*(?:الصحيحة)?\s*[:\-]?\s*(.+)$/,
      );
      if (ansMatch) {
        const ansRaw = ansMatch[1].trim();
        const letterIdx = arabicLetters.indexOf(ansRaw[0]);
        if (letterIdx !== -1) {
          correctIdx = letterIdx;
        } else {
          const numMatch = ansRaw.match(/\d+/);
          if (numMatch) correctIdx = Math.max(0, parseInt(numMatch[0], 10) - 1);
        }
        return;
      }
      const expMatch = line.match(/^(?:توضيح|شرح|تعليل)\s*[:\-]\s*(.+)$/);
      if (expMatch) {
        exp = expMatch[1].trim();
      }
    });

    if (qLine && options.length >= 2) {
      questions.push({
        q: qLine,
        options,
        correct: Math.min(correctIdx, options.length - 1),
        exp,
        points: 2,
      });
    }
  });

  return questions;
}

// استخدام الذكاء الاصطناعي (لو مضبوط AI_API_KEY/AI_API_URL) لاستخراج الأسئلة بدقة أعلى
async function parseQuestionsWithAI(rawText) {
  const apiKey = normalizeText(process.env.AI_API_KEY || process.env.OPENAI_API_KEY);
  const aiBase = normalizeText(process.env.OPENAI_API_BASE || "https://api.openai.com/v1").replace(/\/$/, "");
  const aiUrl = normalizeText(process.env.AI_API_URL || (apiKey ? `${aiBase}/chat/completions` : ""));
  if (!apiKey || !aiUrl) return null;

  try {
    const payload = {
      model: process.env.AI_MODEL || "gpt-5-mini",
      messages: [
        {
          role: "system",
          content:
            'أنت مساعد يستخرج أسئلة اختيار من متعدد من نص خام. أعد فقط JSON صحيح بدون أي نص إضافي أو Markdown، على شكل مصفوفة: [{"q": "نص السؤال", "options": ["اختيار1","اختيار2","اختيار3","اختيار4"], "correct": 0, "exp": "توضيح مختصر"}]. رقم "correct" هو فهرس الاختيار الصحيح (يبدأ من صفر). لا تخترع أسئلة غير موجودة في النص.',
        },
        { role: "user", content: rawText.slice(0, 12000) },
      ],
      temperature: 0.2,
    };

    const data = await callAICompletion(aiUrl, apiKey, payload);
    if (!data) return null;
    const raw =
      (data.choices &&
        data.choices[0] &&
        data.choices[0].message &&
        data.choices[0].message.content) ||
      "";
    const cleaned = raw.replace(/```json|```/g, "").trim();
    const parsed = JSON.parse(cleaned);
    if (!Array.isArray(parsed)) return null;
    return parsed
      .filter(
        (q) => q && q.q && Array.isArray(q.options) && q.options.length >= 2,
      )
      .map((q) => ({
        q: String(q.q).trim(),
        options: q.options.map((o) => String(o).trim()),
        correct: Number.isInteger(q.correct) ? q.correct : 0,
        exp: q.exp ? String(q.exp).trim() : "",
        points: 2,
      }));
  } catch (err) {
    console.log("تعذر استخراج الأسئلة بالذكاء الاصطناعي:", err);
    return null;
  }
}

app.post(
  "/api/admin/exams/generate",
  requireAdmin,
  upload.array("sourceFiles", 10),
  async (req, res) => {
    try {
      const rawSubjectKey = normalizeText(req.body.subjectKey);
      const branch = normalizeBranch(req.body.branch);
      const subjectKey = normalizeSubjectKey(rawSubjectKey);
      const subjectName = getSubjectLabel(subjectKey, branch, normalizeText(req.body.subjectName));
      const subjectGroup = getSubjectGroup(subjectKey, branch);
      const lessonTitle = normalizeText(req.body.lessonTitle);

      if (!lessonTitle) {
        return res
          .status(400)
          .json({ success: false, message: "اسم الدرس مطلوب" });
      }
      if (!req.files || req.files.length === 0) {
        return res
          .status(400)
          .json({
            success: false,
            message: "يرجى رفع صورة أو ملف أسئلة أولاً",
          });
      }

      // استخراج النص من كل الملفات بالتوازي (أسرع، ومهم لتفادي تجاوز
      // الوقت المسموح للسيرفر عند رفع أكتر من ملف/صورة)
      const examExtractedParts = await Promise.all(
        req.files.map(async (file) => {
          try {
            return await extractTextFromFile(file.path, file.originalname);
          } catch (e) {
            console.log("تعذر استخراج نص من ملف:", file.originalname, e);
            return "";
          } finally {
            fs.unlink(file.path, () => {});
          }
        }),
      );
      const combinedText = examExtractedParts.join("\n");
      combinedText = combinedText.trim();

      if (!combinedText) {
        return res.status(400).json({
          success: false,
          message: "تعذر استخراج أي نص من الملفات المرفوعة، جرب صورة أوضح",
        });
      }

      let questions = await parseQuestionsWithAI(combinedText);
      let usedAI = true;
      if (!questions || questions.length === 0) {
        usedAI = false;
        questions = parseQuestionsHeuristically(combinedText);
      }

      if (!questions || questions.length === 0) {
        return res.status(400).json({
          success: false,
          message:
            "تعذر التعرف على أي أسئلة في الملفات المرفوعة. تأكد من وضوح الصورة وأن الأسئلة مرقمة مع اختيارات واضحة (أ/ب/ج/د)",
        });
      }

      db.run(
        `INSERT INTO exam_drafts (subjectKey, subjectName, lessonTitle, branch, questions) VALUES (?, ?, ?, ?, ?)`,
        [
          subjectKey,
          subjectName,
          lessonTitle,
          branch,
          JSON.stringify(questions),
        ],
        function (err) {
          if (err) {
            return res
              .status(500)
              .json({ success: false, message: "تعذر حفظ مسودة الأسئلة" });
          }
          res.status(200).json({
            success: true,
            draftId: this.lastID,
            questions,
            usedAI,
            message: usedAI
              ? "تم استخراج الأسئلة بالذكاء الاصطناعي، راجعها قبل النشر"
              : "تم استخراج الأسئلة تلقائياً (وضع احتياطي)، راجعها جيداً قبل النشر",
          });
        },
      );
    } catch (error) {
      console.log("خطأ في استخراج أسئلة الامتحان:", error);
      res
        .status(500)
        .json({ success: false, message: "حدث خطأ أثناء المعالجة" });
    }
  },
);

// نشر الأسئلة بعد مراجعة الأدمن لها (وتحديد نقاط كل سؤال)
app.post("/api/admin/exams/publish", requireAdmin, (req, res) => {
  const { draftId, lessonTitle, questions } = req.body;
  const branch = normalizeBranch(req.body.branch);
  const subjectKey = normalizeSubjectKey(req.body.subjectKey);
  const subjectName = getSubjectLabel(subjectKey, branch, req.body.subjectName);
  const subjectGroup = getSubjectGroup(subjectKey, branch);

  if (
    !subjectKey ||
    !lessonTitle ||
    !Array.isArray(questions) ||
    !questions.length
  ) {
    return res
      .status(400)
      .json({ success: false, message: "بيانات الامتحان غير مكتملة" });
  }

  const cleanQuestions = questions
    .filter(
      (q) => q && q.q && Array.isArray(q.options) && q.options.length >= 2,
    )
    .map((q) => ({
      q: String(q.q).trim(),
      options: q.options.map((o) => String(o).trim()),
      correct: Number.isInteger(q.correct)
        ? Math.max(0, Math.min(q.correct, q.options.length - 1))
        : 0,
      exp: q.exp ? String(q.exp).trim() : "",
      points: Number.isFinite(Number(q.points))
        ? Math.max(1, Math.min(10, Math.round(Number(q.points))))
        : 2,
    }));

  if (!cleanQuestions.length) {
    return res
      .status(400)
      .json({ success: false, message: "لا توجد أسئلة صالحة للنشر" });
  }

  const examBranch = branch || "عام";
  db.run(
    `INSERT INTO exams (subjectKey, subjectName, subjectGroup, lessonTitle, branch, content) VALUES (?, ?, ?, ?, ?, ?)`,
    [subjectKey, subjectName, subjectGroup, lessonTitle, examBranch, JSON.stringify(cleanQuestions)],
    function (err) {
      if (err) {
        return res
          .status(500)
          .json({ success: false, message: "خطأ في نشر الامتحان" });
      }
      if (draftId) {
        db.run(`DELETE FROM exam_drafts WHERE id = ?`, [draftId]);
      }
      res.status(200).json({
        success: true,
        id: this.lastID,
        message: "تم نشر الأسئلة بنجاح ✅",
      });
    },
  );
});

app.get("/api/admin/exams/drafts", requireAdmin, (req, res) => {
  db.all(
    `SELECT * FROM exam_drafts ORDER BY created_at DESC LIMIT 20`,
    [],
    (err, rows) => {
      if (err) {
        return res
          .status(500)
          .json({ success: false, message: "خطأ في جلب المسودات" });
      }
      const drafts = (rows || []).map((r) => ({
        ...r,
        questions: JSON.parse(r.questions || "[]"),
      }));
      res.status(200).json({ success: true, drafts });
    },
  );
});

// ========================================
// إدارة الطلاب من لوحة الأدمن (بحث برقم الهاتف، تعطيل، حذف، إعادة تعيين كلمة السر)
// ========================================

app.get("/api/admin/users", requireAdmin, (req, res) => {
  const branch = normalizeText(req.query.branch);
  const disabled = req.query.disabled === "0" || req.query.disabled === "1" ? Number(req.query.disabled) : null;
  const conditions = [];
  const params = [];
  if (branch === "عام" || branch === "أزهر") {
    conditions.push("branch = ?");
    params.push(branch);
  }
  if (disabled !== null) {
    conditions.push("disabled = ?");
    params.push(disabled);
  }
  const where = conditions.length ? `WHERE ${conditions.join(" AND ")}` : "";
  db.all(
    `SELECT id, name, phone, email, points, branch, disabled FROM users ${where} ORDER BY points DESC, id DESC LIMIT 200`,
    params,
    (err, users) => {
      if (err) {
        return res.status(500).json({ success: false, message: "خطأ في تحميل قائمة الطلاب" });
      }
      res.status(200).json({ success: true, users: users || [] });
    },
  );
});

app.get("/api/admin/users/:phone", requireAdmin, (req, res) => {
  const phone = normalizeText(req.params.phone);
  db.get(
    `SELECT id, name, phone, email, points, branch, disabled, created_at FROM users WHERE phone = ?`,
    [phone],
    (err, user) => {
      if (err || !user) {
        return res
          .status(404)
          .json({ success: false, message: "لا يوجد طالب بهذا الرقم" });
      }
      res.status(200).json({ success: true, user });
    },
  );
});

app.post("/api/admin/users/toggle-disabled", requireAdmin, (req, res) => {
  const phone = normalizeText(req.body.phone);
  const disabled = req.body.disabled ? 1 : 0;
  if (!phone) {
    return res
      .status(400)
      .json({ success: false, message: "رقم الهاتف مطلوب" });
  }
  db.run(
    `UPDATE users SET disabled = ? WHERE phone = ?`,
    [disabled, phone],
    function (err) {
      if (err || this.changes === 0) {
        return res
          .status(404)
          .json({ success: false, message: "لا يوجد طالب بهذا الرقم" });
      }
      res.status(200).json({
        success: true,
        message: disabled ? "تم تعطيل الحساب" : "تم تفعيل الحساب",
      });
    },
  );
});

app.post("/api/admin/users/delete", requireAdmin, (req, res) => {
  const phone = normalizeText(req.body.phone);
  if (!phone) {
    return res
      .status(400)
      .json({ success: false, message: "رقم الهاتف مطلوب" });
  }
  db.run(`DELETE FROM users WHERE phone = ?`, [phone], function (err) {
    if (err || this.changes === 0) {
      return res
        .status(404)
        .json({ success: false, message: "لا يوجد طالب بهذا الرقم" });
    }
    // تنظيف البيانات المرتبطة بالطالب
    db.run(`DELETE FROM certificates WHERE phone = ?`, [phone]);
    res.status(200).json({ success: true, message: "تم حذف الحساب نهائياً" });
  });
});

app.post("/api/admin/users/reset-password", requireAdmin, async (req, res) => {
  const phone = normalizeText(req.body.phone);
  const newPassword =
    normalizeText(req.body.newPassword) ||
    crypto.randomBytes(4).toString("hex"); // كلمة سر عشوائية لو الأدمن ماكتبش واحدة

  if (!phone) {
    return res
      .status(400)
      .json({ success: false, message: "رقم الهاتف مطلوب" });
  }
  if (newPassword.length < 6) {
    return res.status(400).json({
      success: false,
      message: "كلمة المرور الجديدة يجب أن تكون 6 أحرف على الأقل",
    });
  }

  const hashed = await hashPassword(newPassword);
  db.run(
    `UPDATE users SET password = ? WHERE phone = ?`,
    [hashed, phone],
    function (err) {
      if (err || this.changes === 0) {
        return res
          .status(404)
          .json({ success: false, message: "لا يوجد طالب بهذا الرقم" });
      }
      res.status(200).json({
        success: true,
        newPassword, // تُعرض للأدمن مرة واحدة فقط عشان يبلغ الطالب بيها
        message: "تم تغيير كلمة المرور بنجاح",
      });
    },
  );
});

app.get("/api/admin/notes", requireAdmin, (req, res) => {
  db.all(`SELECT * FROM notes ORDER BY created_at DESC`, [], (err, rows) => {
    if (err) {
      return res
        .status(500)
        .json({ success: false, message: "خطأ في جلب المذكرات" });
    }
    const notes = (rows || []).map((row) => ({
      ...row,
      subjectKey: normalizeSubjectKey(row.subjectKey),
      subjectName: getSubjectLabel(row.subjectKey, row.branch, row.subjectName),
      subjectGroup: row.subjectGroup || getSubjectGroup(row.subjectKey, row.branch),
    }));
    res.status(200).json({ success: true, notes });
  });
});

app.get("/api/notes", requireStudentSession, (req, res) => {
  const userBranch = req.userBranch || getUserBranchFromRequest(req);
  db.all(
    `SELECT * FROM notes WHERE (isDraft IS NULL OR isDraft = 0) AND (branch = ? OR branch = 'مشترك') ORDER BY created_at DESC`,
    [userBranch],
    async (err, rows) => {
      if (err) {
        return res
          .status(500)
          .json({ success: false, message: "خطأ في جلب المذكرات" });
      }
      const notes = await Promise.all(
        (rows || []).map(async (row) => {
          let signedFileUrl = null;
          try {
            // الملف داخلي (وليس رابط قديم يبدأ بـ /uploads/) → نولّد رابط مؤقت آمن
            if (row.fileUrl && !row.fileUrl.startsWith("/uploads/") && !row.fileUrl.startsWith("http")) {
              signedFileUrl = await getSignedFileUrl(row.fileUrl);
            } else {
              signedFileUrl = row.fileUrl;
            }
          } catch (e) {
            signedFileUrl = null;
          }
          return {
            ...row,
            fileUrl: signedFileUrl,
            subjectKey: normalizeSubjectKey(row.subjectKey),
            subjectName: getSubjectLabel(row.subjectKey, row.branch, row.subjectName),
            subjectGroup: row.subjectGroup || getSubjectGroup(row.subjectKey, row.branch),
          };
        }),
      );
      res.status(200).json({ success: true, notes });
    },
  );
});

// 9. جلب شهادات الطالب
app.get("/api/certificates", requireStudentAuth, (req, res) => {
  const phone = req.studentPhone;
  db.all(
    `SELECT id, name, points, rank_title, cert_number, issued_at FROM certificates WHERE phone = ? ORDER BY issued_at DESC`,
    [phone],
    (err, rows) => {
      if (err) {
        return res
          .status(500)
          .json({ success: false, message: "خطأ في جلب الشهادات" });
      }
      res.status(200).json({ success: true, certificates: rows });
    },
  );
});

// 10. جلب المواد حسب الفرع (عام / أزهر)
app.get("/api/subjects", requireStudentSession, (req, res) => {
  const userBranch = req.userBranch || getUserBranchFromRequest(req);

  const groups = Object.fromEntries(
    Object.entries(require("./subjects.js").CATALOG[userBranch] || {}).map(
      ([groupKey, group]) => [
        groupKey,
        {
          label: group.label,
          subjects: group.subjects.reduce((acc, subject) => {
            acc[subject.key] = subject.label;
            return acc;
          }, {}),
        },
      ],
    ),
  );
  res.status(200).json({
    success: true,
    subjects: getSubjectsForBranch(userBranch),
    groups,
    branch: userBranch,
  });
});

// ========================================
// 11. نظام التحقق بالبريد (OTP) قبل التسجيل
// ========================================

// فحص ما إذا كان رقم الهاتف مسجلاً مسبقاً
app.post("/api/check-phone", (req, res) => {
  const { phone } = req.body;
  db.get(`SELECT id FROM users WHERE phone = ?`, [phone], (err, row) => {
    if (err) {
      return res
        .status(500)
        .json({ success: false, message: "خطأ في فحص الرقم" });
    }
    if (row) {
      return res.status(200).json({
        success: true,
        exists: true,
        message: "رقم الهاتف مسجل مسبقاً",
      });
    }
    res.status(200).json({ success: true, exists: false });
  });
});

function persistOtpVerification(email, res) {
  const expiresAt = new Date(Date.now() + 10 * 60 * 1000);
  db.run(
    `INSERT INTO otp_verifications (email, expires_at) VALUES (?, ?) ON CONFLICT (email) DO UPDATE SET expires_at = EXCLUDED.expires_at RETURNING email`,
    [email, expiresAt],
    (verificationErr) => {
      if (verificationErr) {
        console.log("تعذر حفظ تحقق البريد:", verificationErr.message);
        return res.status(503).json({
          success: false,
          code: "DATABASE_UNAVAILABLE",
          message: "تعذر حفظ التحقق حالياً، حاول مرة أخرى",
        });
      }
      verifiedOtpEmails[email] = expiresAt.getTime();
      return res.status(200).json({ success: true, message: "تم التحقق بنجاح" });
    },
  );
}

// إرسال رمز التحقق (OTP) إلى البريد الإلكتروني
app.post("/api/send-otp", otpLimiter, (req, res) => {
  const email = normalizeText(req.body.email);
  const phone = normalizeText(req.body.phone);

  if (!email || !isValidEmail(email)) {
    return res
      .status(400)
      .json({ success: false, message: "البريد الإلكتروني غير صحيح" });
  }

  const generateAndSend = () => {
    const code = generateOtpCode();
    const expires = Date.now() + 5 * 60 * 1000;
    const expiresAt = new Date(expires);
    otpStore[email] = { code, expires };

    db.run(`DELETE FROM otp_codes WHERE email = ?`, [email], (deleteErr) => {
      if (deleteErr) console.log("خطأ في حذف رموز OTP القديمة:", deleteErr);
    });

    db.run(
      `INSERT INTO otp_codes (email, code, expires_at) VALUES (?, ?, ?)`,
      [email, code, expiresAt],
      async (dbErr) => {
        if (dbErr) console.log("خطأ في حفظ الرمز في قاعدة البيانات:", dbErr);

        const mailResult = await sendOtpEmail(email, code);
        if (!mailResult.success) {
          return res.status(503).json({
            success: false,
            code: "EMAIL_UNAVAILABLE",
            message: "تعذر إرسال رمز التحقق إلى البريد الإلكتروني حالياً. حاول مرة أخرى بعد ضبط إعدادات البريد.",
          });
        }

        res
          .status(200)
          .json({ success: true, message: "تم إرسال رمز التحقق إلى بريدك" });
      },
    );
  };

  if (phone) {
    if (!isValidPhone(phone)) {
      return res
        .status(400)
        .json({ success: false, message: "رقم الهاتف غير صحيح" });
    }

    db.get(`SELECT id FROM users WHERE phone = ?`, [phone], (err, row) => {
      if (err) {
        return generateAndSend();
      }
      if (row) {
        return res
          .status(400)
          .json({ success: false, message: "رقم الهاتف مسجل مسبقاً!" });
      }
      generateAndSend();
    });
  } else {
    generateAndSend();
  }
});

// التحقق من الرمز (OTP)
app.post("/api/verify-otp", otpLimiter, (req, res) => {
  const email = normalizeText(req.body.email);
  const code = normalizeText(req.body.code);

  if (!email || !code) {
    return res
      .status(400)
      .json({ success: false, message: "البريد والرمز مطلوبان" });
  }

  const stored = otpStore[email];
  if (stored) {
    if (Date.now() > stored.expires) {
      delete otpStore[email];
      return res.status(400).json({
        success: false,
        message: "انتهت صلاحية الرمز، أرسل رمزاً جديداً",
      });
    }
    if (stored.code === code) {
      delete otpStore[email];
      db.run(`DELETE FROM otp_codes WHERE email = ? AND code = ?`, [
        email,
        code,
      ]);
      return persistOtpVerification(email, res);
    }
  }

  db.get(
    `SELECT code, expires_at FROM otp_codes WHERE email = ? ORDER BY id DESC LIMIT 1`,
    [email],
    (err, row) => {
      if (err || !row) {
        return res
          .status(400)
          .json({ success: false, message: "لم يتم إرسال رمز لهذا البريد" });
      }
      if (Number.isNaN(new Date(row.expires_at).getTime()) || Date.now() > new Date(row.expires_at).getTime()) {
        return res.status(400).json({
          success: false,
          message: "انتهت صلاحية الرمز، أرسل رمزاً جديداً",
        });
      }
      if (row.code !== code) {
        return res
          .status(400)
          .json({ success: false, message: "الرمز غير صحيح!" });
      }
      db.run(`DELETE FROM otp_codes WHERE email = ? AND code = ?`, [
        email,
        code,
      ]);
      return persistOtpVerification(email, res);
    },
  );
});

// 12. عرض/تحميل شهادة PDF (صفحة أنيقة قابلة للطباعة/الحفظ)
app.get("/api/certificate-pdf/:id", requireStudentAuth, (req, res) => {
  const certId = Number(req.params.id);
  if (!Number.isInteger(certId) || certId <= 0) return res.status(400).send("معرف الشهادة غير صالح");
  db.get(`SELECT * FROM certificates WHERE id = ? AND phone = ?`, [certId, req.studentPhone], (err, cert) => {
    if (err || !cert) {
      return res.status(404).send("الشهادة غير موجودة");
    }

    const issuedDate = new Date(cert.issued_at).toLocaleDateString("ar-EG", {
      year: "numeric",
      month: "long",
      day: "numeric",
    });

    const html = `<!DOCTYPE html>
<html lang="ar" dir="rtl">
<head>
<meta charset="UTF-8">
<title>شهادة - ${escapeHtmlServer(cert.name)}</title>
<style>
  * { margin: 0; padding: 0; box-sizing: border-box; }
  body { font-family: 'Segoe UI', Tahoma, Arial, sans-serif; background: #e2e8f0; display: flex; justify-content: center; align-items: center; min-height: 100vh; padding: 20px; }
  .certificate {
    width: 800px; max-width: 100%; background: #fff; border-radius: 20px; padding: 50px;
    text-align: center; border: 8px solid #f59e0b; box-shadow: 0 20px 50px rgba(0,0,0,0.2); position: relative;
  }
  .certificate:before { content: ''; position: absolute; top: 12px; left: 12px; right: 12px; bottom: 12px; border: 2px solid #f59e0b; border-radius: 12px; pointer-events: none; }
  .platform { color: #2563eb; font-weight: bold; font-size: 16px; margin-bottom: 10px; }
  .title { font-size: 40px; color: #f59e0b; font-weight: 800; margin: 10px 0; }
  .sub { color: #64748b; margin-bottom: 25px; }
  .name { font-size: 28px; color: #0f172a; font-weight: 800; margin: 15px 0; border-bottom: 3px solid #e2e8f0; display: inline-block; padding: 0 30px 10px; }
  .rank { font-size: 22px; color: #2563eb; font-weight: 700; margin: 15px 0; }
  .points { font-size: 16px; color: #334155; margin: 10px 0; }
  .footer { display: flex; justify-content: space-between; margin-top: 40px; font-size: 13px; color: #64748b; }
  .cert-num { font-size: 12px; color: #94a3b8; margin-top: 20px; }
  @media print { body { background: #fff; padding: 0; } .certificate { box-shadow: none; border-width: 6px; } }
</style>
</head>
<body>
  <div class="certificate">
    <div class="platform">🩺 منصة دكتور مستقبلي</div>
    <div class="title">شهادة تقدير</div>
    <div class="sub">تُمنح هذه الشهادة إلى</div>
    <div class="name">${escapeHtmlServer(cert.name)}</div>
    <div class="rank">🏆 ${escapeHtmlServer(cert.rank_title)}</div>
    <div class="points">بإجمالي نقاط: <strong>${escapeHtmlServer(cert.points)}</strong> ⭐</div>
    <div class="footer">
      <div>تاريخ الإصدار: ${escapeHtmlServer(issuedDate)}</div>
      <div>دكتور مستقبلي 🩺</div>
    </div>
    <div class="cert-num">رقم الشهادة: ${escapeHtmlServer(cert.cert_number)}</div>
  </div>
</body>
</html>`;

    res.send(html);
  });
});

// 13. المعلم الذكي (Chatbot) - من Backend آمن
// ========================================
// لا توجد مفاتيح AI في الـFrontend. إذا وُجد مفتاح AI في متغيرات البيئة
// (AI_API_KEY / AI_API_URL)، سنستخدمه. وإلا نستخدم رداً محلياً ذكياً.
// يبحث عن دروس/مذكرات حقيقية في قاعدة البيانات لها علاقة بسؤال الطالب
// عشان رد الشات بوت يكون مبني على محتوى المنصة الفعلي وليس رد عام فاضي
function findRelatedContent(question, branch) {
  return new Promise((resolve) => {
    const words = String(question)
      .replace(/[؟!\.\,\?]/g, " ")
      .split(/\s+/)
      .map((w) => w.trim())
      .filter((w) => w.length >= 3)
      .slice(0, 6);

    if (words.length === 0) return resolve({ notes: [], lessons: [] });

    const likeClauses = words.map(() => `title LIKE ?`).join(" OR ");
    const likeParams = words.map((w) => `%${w}%`);

    db.all(
      `SELECT title, subjectName, aiDraft FROM notes WHERE (branch = ? OR branch = 'مشترك') AND isDraft = 0 AND (${likeClauses}) LIMIT 3`,
      [branch, ...likeParams],
      (err, noteRows) => {
        const notes = err ? [] : noteRows || [];

        const lessonLikeClauses = words
          .map(() => `lessonTitle LIKE ?`)
          .join(" OR ");
        db.all(
          `SELECT lessonTitle, subjectName FROM exams WHERE (branch = ? OR branch = 'مشترك') AND (${lessonLikeClauses}) LIMIT 3`,
          [branch, ...likeParams],
          (err2, lessonRows) => {
            resolve({ notes, lessons: err2 ? [] : lessonRows || [] });
          },
        );
      },
    );
  });
}

app.post("/api/chat", chatLimiter, async (req, res) => {
  const question = normalizeText(req.body.question);
  if (!question) {
    return res.status(400).json({ success: false, message: "السؤال مطلوب" });
  }

  const userBranch = normalizeBranch(req.body.branch);
  const apiKey = normalizeText(process.env.AI_API_KEY || process.env.OPENAI_API_KEY);
  const aiBase = normalizeText(process.env.OPENAI_API_BASE || "https://api.openai.com/v1").replace(/\/$/, "");
  const aiUrl = normalizeText(process.env.AI_API_URL || (apiKey ? `${aiBase}/chat/completions` : ""));

  if (!apiKey || !aiUrl) {
    return res.status(503).json({
      success: false,
      code: "AI_NOT_CONFIGURED",
      message: "خدمة المعلم الذكي غير مهيأة حالياً. يرجى ضبط إعدادات الذكاء الاصطناعي من الخادم.",
    });
  }

  try {
    const related = await findRelatedContent(question, userBranch);
    const contextText =
      related.notes.length || related.lessons.length
        ? `محتوى منشور فعلياً على المنصة قد يفيد في الإجابة:\n${related.notes
            .map((note) => `- مذكرة: ${note.title} (${note.subjectName || ""})`)
            .join("\n")}\n${related.lessons
            .map((lesson) => `- درس/امتحان: ${lesson.lessonTitle} (${lesson.subjectName || ""})`)
            .join("\n")}`
        : "لا يوجد محتوى منشور مطابق مباشرة على المنصة لهذا السؤال.";

    const payload = {
      model: process.env.AI_MODEL || "gpt-5-mini",
      messages: [
        {
          role: "system",
          content: `أنت دكتور مستقبلي، معلم مصري خبير للمرحلة الثانوية. فرع الطالب هو: ${userBranch}. أجب عن السؤال الحالي فقط من خلال الذكاء الاصطناعي، واشرح ببساطة ودقة وباللغة العربية المناسبة للطالب. لا تخترع مصدراً أو درساً غير موجود. إذا كان السؤال غير واضح فاطلب توضيحه. إذا طلب الطالب محتوى من المنصة فاستخدم السياق المنشور فقط. ${contextText}`,
        },
        { role: "user", content: question },
      ],
      temperature: 0.4,
    };

    const data = await callAICompletion(aiUrl, apiKey, payload);
    if (!data) throw new Error("AI request failed or timed out");
    const reply =
      data.choices?.[0]?.message?.content ||
      data.output_text ||
      data.output?.[0]?.text ||
      "";

    if (!normalizeText(reply)) {
      throw new Error("AI returned an empty reply");
    }

    return res.status(200).json({ success: true, reply: String(reply).trim() });
  } catch (error) {
    console.log("تعذر استدعاء خدمة الذكاء الاصطناعي:", error.message);
    return res.status(503).json({
      success: false,
      code: "AI_UNAVAILABLE",
      message: "تعذر الاتصال بالمعلم الذكي حالياً. لم يتم إنشاء رد تلقائي، حاول مرة أخرى بعد قليل.",
    });
  }
});

// التقاط أي أخطاء غير متوقعة في أي راوت (مثل ملفات كبيرة جداً عبر multer)
app.use((err, req, res, next) => {
  console.log("خطأ غير متوقع:", err.message);
  if (res.headersSent) return next(err);
  if (err?.code === "INVALID_FILE_TYPE") {
    return res.status(400).json({ success: false, message: "نوع الملف غير مدعوم. استخدم PDF أو DOCX أو TXT أو صورة." });
  }
  if (err instanceof multer.MulterError && err.code === "LIMIT_FILE_SIZE") {
    return res.status(400).json({ success: false, message: "حجم الملف أكبر من الحد المسموح (20 ميجابايت)." });
  }
  res
    .status(500)
    .json({ success: false, message: "حدث خطأ غير متوقع في السيرفر" });
});

// التشغيل المحلي فقط؛ Netlify يستورد app عبر netlify/functions/api.js
if (require.main === module) {
  const PORT = process.env.PORT || 3000;
  app.listen(PORT, "0.0.0.0", () => {
    console.log(
      `السيرفر شغال بتميز على البورت ${PORT} 🚀 http://localhost:${PORT}`,
    );
  });
}

// تصدير التطبيق لمحول Netlify Functions
module.exports = app;
