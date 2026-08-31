// نقطة الدخول الخاصة بـ Vercel.
// Express app جاهز يستقبل (req, res) مباشرة، فمش محتاجين أي محول
// زي serverless-http (اللي كان مخصص لصيغة Netlify/AWS Lambda القديمة).
// Vercel بيستدعي أي ملف داخل /api كـ function بنفس صيغة (req, res) العادية.
module.exports = require("../server.js");
