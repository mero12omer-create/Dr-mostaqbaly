// db.js
// بديل قاعدة البيانات: PostgreSQL (Supabase) بدل SQLite المحلي.
// الهدف: بيانات الطلاب متتخزنش على السيرفر نفسه، عشان متتمسحش عند أي
// إعادة تشغيل أو تحديث على الاستضافة (Render/غيرها).
//
// الملف ده بيوفر نفس الشكل اللي كان مستخدم مع sqlite3 (db.run / db.get / db.all)
// عشان نقلل التعديلات في server.js قدر الإمكان.

const { Pool } = require("pg");

if (!process.env.DATABASE_URL) {
  console.warn(
    "⚠️ تحذير: DATABASE_URL غير موجود في .env — لازم تحطه من Supabase (Project Settings → Database → Connection string).",
  );
}

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false }, // مطلوب للاتصال بـ Supabase
});

pool.on("connect", () => {
  console.log("تم الاتصال بقاعدة البيانات (Supabase) بنجاح 🗄️");
});
pool.on("error", (err) => {
  console.error("خطأ في اتصال قاعدة البيانات:", err.message);
});

// تحويل علامات الاستفهام (?) المستخدمة في استعلامات SQLite القديمة
// إلى الصيغة اللي بيفهمها Postgres ($1, $2, ...)
function convertPlaceholders(sql) {
  let i = 0;
  return sql.replace(/\?/g, () => `$${++i}`);
}

// جداول ملهاش عمود id (المفتاح الأساسي بتاعها حاجة تانية).
// إضافة "RETURNING id" لأي INSERT عليها بتخلي Postgres يرفض الاستعلام
// بالكامل بخطأ: column "id" does not exist — وده كان بيعطّل بدء جلسة المذاكرة
// لكل طالب من أول مرة.
const TABLES_WITHOUT_ID = new Set([
  "active_study_sessions", // المفتاح الأساسي: phone
  "otp_verifications",     // المفتاح الأساسي: email
  "sessions",              // المفتاح الأساسي: token
]);

// لو الاستعلام INSERT ومحتاجين نعرف الـ id بتاع الصف الجديد (زي this.lastID في sqlite)
function ensureReturningId(sql) {
  const trimmed = sql.trim();
  const isInsert = /^insert\s+into/i.test(trimmed);
  const hasReturning = /returning/i.test(trimmed);
  if (!isInsert || hasReturning) {
    return sql;
  }

  // اسم الجدول المستهدف — لو مالوش عمود id مانضيفش RETURNING id
  const tableMatch = trimmed.match(/^insert\s+into\s+"?([a-zA-Z0-9_]+)"?/i);
  const tableName = tableMatch ? tableMatch[1].toLowerCase() : "";
  if (TABLES_WITHOUT_ID.has(tableName)) {
    return sql;
  }

  return `${trimmed.replace(/;\s*$/, "")} RETURNING id`;
}

// Postgres بيحوّل أسماء الأعمدة غير المقتبسة لحروف صغيرة (ownerName → ownername)،
// والكود بيقرأها camelCase. الدالة دي بتضيف الاسم الصحيح لكل صف راجع من الداتابيس.
const CAMEL_COLUMNS = {
  aidraft: "aiDraft",
  fileurl: "fileUrl",
  isdraft: "isDraft",
  lessontitle: "lessonTitle",
  ownername: "ownerName",
  subjectgroup: "subjectGroup",
  subjectkey: "subjectKey",
  subjectname: "subjectName",
  todayminutes: "todayMinutes",
};
function fixRow(row) {
  if (!row || typeof row !== "object") return row;
  for (const key of Object.keys(row)) {
    const camel = CAMEL_COLUMNS[key];
    if (camel && !(camel in row)) row[camel] = row[key];
  }
  return row;
}

const db = {
  // يقابل db.run(sql, params, callback) — للـ INSERT/UPDATE/DELETE/CREATE TABLE
  run(sql, params, callback) {
    if (typeof params === "function") {
      callback = params;
      params = [];
    }
    params = params || [];
    const isInsert = /^\s*insert\s+into/i.test(sql);
    const finalSql = isInsert ? ensureReturningId(convertPlaceholders(sql)) : convertPlaceholders(sql);

    pool
      .query(finalSql, params)
      .then((result) => {
        if (typeof callback === "function") {
          const ctx = {
            lastID: result.rows && result.rows[0] ? result.rows[0].id : undefined,
            changes: result.rowCount,
          };
          callback.call(ctx, null);
        }
      })
      .catch((err) => {
        if (typeof callback === "function") callback(err);
        else console.error("خطأ في db.run:", err.message);
      });
    return this;
  },

  // نسخة Promise للاستخدام في تهيئة الجداول بالتتابع قبل استقبال الطلبات
  runAsync(sql, params) {
    return new Promise((resolve, reject) => {
      this.run(sql, params, function (err) {
        if (err) return reject(err);
        resolve({ lastID: this.lastID, changes: this.changes });
      });
    });
  },

  // يقابل db.get(sql, params, callback) — بيرجع صف واحد بس
  get(sql, params, callback) {
    if (typeof params === "function") {
      callback = params;
      params = [];
    }
    params = params || [];
    pool
      .query(convertPlaceholders(sql), params)
      .then((result) => {
        if (typeof callback === "function") callback(null, fixRow(result.rows[0]));
      })
      .catch((err) => {
        if (typeof callback === "function") callback(err);
      });
    return this;
  },

  // يقابل db.all(sql, params, callback) — بيرجع كل الصفوف
  all(sql, params, callback) {
    if (typeof params === "function") {
      callback = params;
      params = [];
    }
    params = params || [];
    pool
      .query(convertPlaceholders(sql), params)
      .then((result) => {
        if (typeof callback === "function") callback(null, result.rows.map(fixRow));
      })
      .catch((err) => {
        if (typeof callback === "function") callback(err);
      });
    return this;
  },
};

module.exports = db;
