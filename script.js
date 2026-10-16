// ===================================// دكتور مستقبلي 🩺 - Script.js المطور
// ===================================
document.addEventListener("DOMContentLoaded", function () {
  // ------------------------------------------
  // 1. الدارك مود والقائمة الجانبية
  // ------------------------------------------
  const themeToggle = document.getElementById("themeToggle");
  if (themeToggle) {
    if (localStorage.getItem("theme") === "dark") {
      document.body.classList.add("dark");
      themeToggle.textContent = "☀️";
    }
    themeToggle.addEventListener("click", function () {
      document.body.classList.toggle("dark");
      const isDark = document.body.classList.contains("dark");
      localStorage.setItem("theme", isDark ? "dark" : "light");
      themeToggle.textContent = isDark ? "☀️" : "🌙";
    });
  }

  const menuBtn = document.getElementById("menuBtn");
  const navLinks = document.getElementById("navLinks");
  if (menuBtn && navLinks) {
    // ملاحظة: كان الكود بيضيف كلاس اسمه "open" بينما ملف الـ CSS بيتحكم بالظهور
    // عن طريق كلاس اسمه "active" فقط، فكانت القائمة المنسدلة مبتفتحش أبداً على الموبايل.
    menuBtn.addEventListener("click", function (e) {
      e.stopPropagation();
      navLinks.classList.toggle("active");
    });

    // إغلاق القائمة تلقائياً بعد الضغط على أي رابط جوّاها
    navLinks.querySelectorAll("a").forEach((link) => {
      link.addEventListener("click", function () {
        navLinks.classList.remove("active");
      });
    });

    // إغلاق القائمة عند الضغط في أي مكان خارجها
    document.addEventListener("click", function (e) {
      if (
        navLinks.classList.contains("active") &&
        !navLinks.contains(e.target) &&
        e.target !== menuBtn
      ) {
        navLinks.classList.remove("active");
      }
    });
  }

  // -----------------------------------       -------
  // 2. التحقق الذكي من تسجيل الدخول عند التصفح
  // ------------------------------------------
  const studentToken = localStorage.getItem("studentAuthToken");
  const isLoggedIn = Boolean(studentToken);

  const currentPath = window.location.pathname.toLowerCase();
  const isAuthPage =
    currentPath.includes("login") || currentPath.includes("signup");

  // الملف الشخصي خاص بالطالب المسجل فقط، ولا نعتمد على بيانات localStorage وحدها.
  document.querySelectorAll('a[href*="profile.html"]').forEach((link) => {
    link.addEventListener("click", (event) => {
      if (!localStorage.getItem("studentAuthToken")) {
        event.preventDefault();
        window.location.href = "login.html?next=profile.html";
      }
    });
  });

  // ------------------------------------------
  // 3. توجيه أزرار "ابدأ الآن مجاناً" 🚀
  // ------------------------------------------
  // بنربط الأزرار دي بحيث لو الطالب مسجل يروح للرئيسية، ولو مش مسجل يروح لإنشاء حساب
  const startBtns = document.querySelectorAll(".btn-start-now, #startNowBtn");
  startBtns.forEach((btn) => {
    btn.addEventListener("click", function (e) {
      e.preventDefault();
      if (isLoggedIn) {
        window.location.href = "index.html"; // مسجل بالفعل -> الصفحة الرئيسية
      } else {
        window.location.href = "signup.html"; // مش مسجل -> إنشاء حساب
      }
    });
  });

  // ------------------------------------------
  // 4. نموذج إنشاء حساب (signupForm) بدون ريفرش
  // ------------------------------------------
  const signupForm = document.getElementById("signupForm");
  if (signupForm) {
    // ربط زرار إرسال الرمز (الصفحة مفيهاش onclick، فلازم الربط يتم من هنا)
    const sendOtpBtnEl = document.getElementById("sendOtpBtn");
    if (sendOtpBtnEl) {
      sendOtpBtnEl.addEventListener("click", function (e) {
        e.preventDefault();
        if (typeof sendOtp === "function") {
          sendOtp();
        }
      });
    }
    signupForm.addEventListener("submit", async function (e) {
      // 🛑 يمنع المتصفح من عمل ريفرش ومسح البيانات
      e.preventDefault();

      const nameInput = document.getElementById("name");
      const phoneInput = document.getElementById("phone");
      const emailInput = document.getElementById("email");
      const passwordInput = document.getElementById("password");
      const confirmPasswordInput = document.getElementById("confirmPassword");
      const otpCodeInput = document.getElementById("otpCode");

      const name = nameInput ? nameInput.value.trim() : "";
      const phone = phoneInput ? phoneInput.value.trim() : "";
      const email = emailInput ? emailInput.value.trim() : "";
      const password = passwordInput ? passwordInput.value : "";
      const confirmPassword = confirmPasswordInput
        ? confirmPasswordInput.value
        : "";
      const branchInput = document.getElementById("branch");
      const branch = branchInput ? branchInput.value : "عام";
      const otpCode = otpCodeInput ? otpCodeInput.value.trim() : "";
      const submitBtn = signupForm.querySelector('button[type="submit"]');

      if (!name || !phone || !email || !password) {
        alert("يرجى تعبئة جميع الحقول أولاً");
        return;
      }

      if (!/^01[0125][0-9]{8}$/.test(phone)) {
        alert("اكتب رقم موبايل مصري صحيح من 11 رقمًا");
        return;
      }

      if (password && confirmPassword && password !== confirmPassword) {
        alert("كلمتا السر غير متطابقتين!");
        return;
      }

      if (String(password).length < 6) {
        alert("كلمة المرور يجب أن تكون 6 أحرف على الأقل");
        return;
      }

      if (!otpCode) {
        alert("من فضلك أدخل رمز التحقق المرسل إلى بريدك أولاً!");
        return;
      }

      try {
        if (submitBtn) { submitBtn.disabled = true; submitBtn.textContent = "جاري إنشاء الحساب..."; }
        const otpRes = await fetch("/api/verify-otp", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ email, code: otpCode }),
        });
        const otpData = await otpRes.json();
        if (!otpData.success) {
          alert(otpData.message || "رمز التحقق غير صحيح!");
          return;
        }

        const res = await fetch("/api/register", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ name, email, phone, password, branch }),
        });
        const data = await res.json();

        if (res.ok && data.success) {
          localStorage.setItem("userName", name);
          localStorage.setItem("userEmail", email);
          localStorage.setItem("loggedInUserPhone", phone);
          localStorage.setItem("userBranch", branch);
          if (data.token) localStorage.setItem("studentAuthToken", data.token);
          const next = new URLSearchParams(window.location.search).get("next");
          window.location.href = next === "profile.html" ? "profile.html" : "index.html";
        } else {
          alert(
            data.message || "حدث خطأ أثناء إنشاء الحساب، برجاء المحاولة مجدداً",
          );
        }
      } catch (err) {
        console.warn("تعذر إنشاء الحساب على الخادم:", err);
        alert("تعذر الاتصال بالخادم، ولم يتم إنشاء الحساب. حاول مرة أخرى.");
      } finally {
        if (submitBtn) { submitBtn.disabled = false; submitBtn.textContent = "سجل الآن"; }
      }
    });
  }

  // ------------------------------------------
  // 5. نموذج تسجيل الدخول (loginForm)
  // ------------------------------------------
  const loginForm = document.getElementById("loginForm");
  if (loginForm) {
    loginForm.addEventListener("submit", async function (e) {
      e.preventDefault();
      const phoneInput = document.getElementById("phone");
      const passwordInput = document.getElementById("password");
      const phone = phoneInput ? phoneInput.value.trim() : "";
      const password = passwordInput ? passwordInput.value : "";
      const submitBtn = loginForm.querySelector('button[type="submit"]');

      if (!/^01[0125][0-9]{8}$/.test(phone)) {
        alert("اكتب رقم موبايل مصري صحيح من 11 رقمًا");
        return;
      }

      try {
        if (submitBtn) { submitBtn.disabled = true; submitBtn.textContent = "جاري الدخول..."; }
        const res = await fetch("/api/login", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ phone, password }),
        });

        const data = await res.json();
        if (res.ok && data.user) {
          localStorage.setItem("loggedInUserPhone", phone);
          if (data.token) localStorage.setItem("studentAuthToken", data.token);
          if (data.user.name) localStorage.setItem("userName", data.user.name);
          if (data.user.email)
            localStorage.setItem("userEmail", data.user.email);
          if (data.user.branch)
            localStorage.setItem("userBranch", data.user.branch);
          if (data.user.points)
            localStorage.setItem("userPoints", data.user.points);
          const next = new URLSearchParams(window.location.search).get("next");
          window.location.href = next === "profile.html" ? "profile.html" : "index.html";
        } else {
          alert(data.message || "رقم الهاتف غير مسجل");
        }
      } catch (err) {
        console.warn("تعذر تسجيل الدخول على الخادم:", err);
        alert("تعذر الاتصال بالخادم، ولم يتم تسجيل الدخول. حاول مرة أخرى.");
      } finally {
        if (submitBtn) { submitBtn.disabled = false; submitBtn.textContent = "دخول"; }
      }
    });
  }

  // ------------------------------------------
  // 6. تهيئة البروفايل ولوحة الصدارة والشات
  // ------------------------------------------
  if (currentPath.includes("profile.html")) {
    initProfilePage();
  }

  if (currentPath.includes("leaderboard.html")) {
    loadLeaderboard();
  }

  const branchLabel = document.getElementById("branchInfoText");
  if (branchLabel) {
    const savedBranch = localStorage.getItem("userBranch") || "عام";
    branchLabel.textContent = savedBranch;
  }

  const homeBranchSelect = document.getElementById("homeBranchSelect");
  if (homeBranchSelect) {
    const savedBranch = localStorage.getItem("userBranch") || "عام";
    homeBranchSelect.value = savedBranch === "أزهر" ? "أزهر" : "عام";
    homeBranchSelect.addEventListener("change", function () {
      const selectedBranch = this.value === "أزهر" ? "أزهر" : "عام";
      localStorage.setItem("userBranch", selectedBranch);
      const branchLabelEl = document.getElementById("branchInfoText");
      if (branchLabelEl) branchLabelEl.textContent = selectedBranch;
      const examBranchLabel = document.getElementById("examBranchLabel");
      if (examBranchLabel) examBranchLabel.textContent = selectedBranch;
      const notesBranchLabel = document.getElementById("notesBranchLabel");
      if (notesBranchLabel) notesBranchLabel.textContent = selectedBranch;
    });
  }

  const examBranchLabel = document.getElementById("examBranchLabel");
  if (examBranchLabel) {
    const savedBranch = localStorage.getItem("userBranch") || "عام";
    examBranchLabel.textContent = savedBranch;
  }

  const notesBranchLabel = document.getElementById("notesBranchLabel");
  if (notesBranchLabel) {
    const savedBranch = localStorage.getItem("userBranch") || "عام";
    notesBranchLabel.textContent = savedBranch;
  }

  const chatForm = document.getElementById("chatForm");
  if (chatForm) {
    chatForm.addEventListener("submit", async function (e) {
      e.preventDefault();
      const input = document.getElementById("userInput");
      const msgList = document.getElementById("chatMessages");
      if (input && input.value.trim() !== "") {
        const question = input.value.trim();

        // إضافة رسالة الطالب
        const msgDiv = document.createElement("div");
        msgDiv.className = "message user-msg";
        msgDiv.innerHTML = `<p>${question
          .replace(/</g, "&" + "lt;")
          .replace(/>/g, "&" + "gt;")
          .replace(/&/g, "&" + "amp;")}</p>`;
        msgList.appendChild(msgDiv);
        input.value = "";
        msgList.scrollTop = msgList.scrollHeight;

        // إضافة رسالة "جارٍ الكتابة..."
        const loading = document.createElement("div");
        loading.className = "message bot-msg loading-msg";
        loading.id = "loadingMsg";
        loading.textContent = "دكتور AI بيفكر... 🤔";
        msgList.appendChild(loading);
        msgList.scrollTop = msgList.scrollHeight;

        // الاتصال بالمعلم الذكي عبر Backend آمن (لا توجد مفاتيح AI في الـFrontend)
        let botReply = "";
        try {
          const branch = localStorage.getItem("userBranch") || "عام";
          const res = await fetch("/api/chat", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ question, branch }),
          });
          const data = await res.json();
          if (data.success && data.reply) {
            botReply = data.reply;
            updateChatStatus("المعلم الذكي متصل وجاهز 🩺", false);
          } else {
            throw new Error(data.message || "تعذر الحصول على رد من المعلم الذكي");
          }
        } catch (err) {
          console.log("خطأ في الشات:", err);
          updateChatStatus("المعلم الذكي غير متاح حالياً", true);
          botReply = err.message || "تعذر الاتصال بالمعلم الذكي. لم يتم إنشاء رد تلقائي.";
        }

        // إزالة رسالة التحميل وإضافة الرد
        const loadingMsg = document.getElementById("loadingMsg");
        if (loadingMsg) loadingMsg.remove();

        const botDiv = document.createElement("div");
        botDiv.className = "message bot-msg";
        const safeReply = botReply
          .replace(/&/g, "&" + "amp;")
          .replace(/</g, "&" + "lt;")
          .replace(/>/g, "&" + "gt;")
          .replace(/\n/g, "<br>");
        botDiv.innerHTML = `<p>${safeReply}</p><span class="msg-time">الآن</span>`;
        msgList.appendChild(botDiv);
        msgList.scrollTop = msgList.scrollHeight;
      }
    });
  }
});

// ===================================// الوظائف العامة (Global Functions)
// ===================================
function updateChatStatus(status, isError = false) {
  const statusEl = document.getElementById("chatStatus");
  if (!statusEl) return;
  statusEl.textContent = status;
  if (isError) {
    statusEl.classList.add("status-error");
    statusEl.style.color = "#dc2626";
  } else {
    statusEl.classList.remove("status-error");
    statusEl.style.color = "#16a34a";
  }
}

// أدوات البحث: الصفحات فيها صندوقين محتملين
// searchBox (صفحة الرئيسية، فيه نتائج فورية) و searchBar (الصفحات التانية)
function getSearchTargets() {
  const box = document.getElementById("searchBox");
  const bar = document.getElementById("searchBar");
  return { box: box, bar: bar, main: box || bar };
}

function isSearchVisible(el) {
  if (!el) return false;
  return getComputedStyle(el).display !== "none";
}

function openSearchBox() {
  const targets = getSearchTargets();
  if (!targets.main) return false;
  if (targets.main === targets.bar) {
    targets.bar.classList.add("active");
    targets.bar.style.display = "flex";
  } else {
    targets.main.style.display = "block";
  }
  const input = targets.main.querySelector("input");
  if (input) input.focus();
  return true;
}

function closeSearchBox() {
  const targets = getSearchTargets();
  if (!targets.main) return;
  targets.main.style.display = "none";
  if (targets.main === targets.bar) targets.bar.classList.remove("active");
}

function toggleSearch() {
  const targets = getSearchTargets();
  // في الصفحات اللي مفيهاش صندوق بحث (زي صفحة المعلم الذكي)
  // نودّي الطالب لصفحة الرئيسية ونفتح البحث تلقائياً
  if (!targets.main) {
    window.location.href = "index.html?search=1";
    return;
  }
  if (isSearchVisible(targets.main)) closeSearchBox();
  else openSearchBox();
}

// دالة البحث الحي (doSearch): تبحث في المذكرات والدروس والامتحانات
// (محليًا + من السيرفر) وتعمل بدون أي onclick داخل HTML
async function doSearch() {
  const input = document.getElementById("searchInput");
  const resultsBox = document.getElementById("searchResults");
  if (!input || !resultsBox) return;

  const query = input.value.trim().toLowerCase();
  if (query === "") {
    resultsBox.innerHTML = "";
    return;
  }

  const found = [];
  const seen = new Set();
  const add = (type, title, link) => {
    const clean = String(title || "").trim();
    if (!clean) return;
    const key = type + "|" + clean;
    if (seen.has(key)) return;
    seen.add(key);
    found.push({ type: type, title: clean, link: link });
  };

  // 1) بيانات محفوظة محليًا (لو موجودة)
  try {
    const notes = JSON.parse(localStorage.getItem("notesData")) || [];
    notes.forEach((n) => add("مذكرة", n.title, "notes.html"));
  } catch (e) {}
  try {
    const courses = JSON.parse(localStorage.getItem("coursesData")) || {};
    Object.keys(courses).forEach((key) => {
      (courses[key].lessons || []).forEach((l) => add("درس", l.title, "exams.html"));
    });
  } catch (e) {}

  // 2) بحث من السيرفر (الامتحانات متاحة للجميع، والمذكرات للمسجّلين)
  const token = localStorage.getItem("studentAuthToken");
  const branch = localStorage.getItem("userBranch") || "عام";
  const headers = token ? { "x-student-token": token } : {};
  const jobs = [
    fetch("/api/exams?branch=" + encodeURIComponent(branch))
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => {
        if (d && d.success) (d.exams || []).forEach((x) => add("امتحان", x.lessonTitle, "exams.html"));
      })
      .catch(() => {}),
  ];
  if (token) {
    jobs.push(
      fetch("/api/notes?branch=" + encodeURIComponent(branch), { headers: headers })
        .then((r) => (r.ok ? r.json() : null))
        .then((d) => {
          if (d && d.success) (d.notes || []).forEach((n) => add("مذكرة", n.title, "notes.html"));
        })
        .catch(() => {}),
    );
  }

  resultsBox.innerHTML =
    '<p style="color: gray; font-size: 13px; padding: 8px;">جاري البحث… 🔍</p>';
  await Promise.all(jobs);

  const matches = found
    .filter((f) => f.title.toLowerCase().includes(query))
    .slice(0, 8);

  if (matches.length === 0) {
    resultsBox.innerHTML =
      '<p style="color: gray; font-size: 13px; padding: 8px;">لا توجد نتائج مطابقة 🔍</p>';
    return;
  }

  resultsBox.innerHTML = matches
    .map(
      (f) =>
        `<a href="${f.link}" style="display:block; padding:8px; text-decoration:none; color:var(--text, #000); border-bottom:1px solid var(--border, #eee);">${f.type} • ${f.title}</a>`,
    )
    .join("");
}

// دالة توجيه زر "ابدأ الآن مجاناً"
function handleStartNow() {
  const loggedInPhone = localStorage.getItem("loggedInUserPhone");
  if (loggedInPhone) {
    window.location.href = "index.html";
  } else {
    window.location.href = "signup.html";
  }
}

// دالة إرسال رمز التحقق (OTP) إلى البريد
async function sendOtp() {
  const emailInput = document.getElementById("email");
  const phoneInput = document.getElementById("phone");
  const emailError = document.getElementById("signupEmailError");
  const otpError = document.getElementById("otpError");
  const btn = document.getElementById("sendOtpBtn");

  const email = emailInput ? emailInput.value.trim() : "";
  const phone = phoneInput ? phoneInput.value.trim() : "";

  if (!email) {
    if (emailError) emailError.innerText = "أدخل البريد الإلكتروني أولاً";
    return;
  }
  if (emailError) emailError.innerText = "";
  if (otpError) otpError.innerText = "";

  if (btn) {
    btn.disabled = true;
    btn.textContent = "جاري الإرسال... ⏳";
  }

  try {
    const res = await fetch("/api/send-otp", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email, phone }),
    });
    const data = await res.json();
    if (data.success) {
      if (otpError) otpError.innerText = "✅ تم إرسال الرمز إلى بريدك";
      if (btn) {
        btn.disabled = false;
        btn.textContent = "أعد الإرسال 🔄";
      }
    } else {
      if (otpError)
        otpError.innerText =
          data.message || "لم نتمكن من إرسال الرمز حالياً. حاول مرة أخرى.";
      if (btn) {
        btn.disabled = false;
        btn.textContent = "إرسال الرمز 📨";
      }
    }
  } catch (err) {
    console.log("خطأ في إرسال الرمز:", err);
    if (otpError)
      otpError.innerText =
        "تعذر الاتصال بالخادم. تحقق من الإنترنت وحاول مجدداً.";
    if (btn) {
      btn.disabled = false;
      btn.textContent = "إرسال الرمز 📨";
    }
  }
}

// دالة الأزرار السريعة في المعلم الذكي (اشرح/لخص/امتحان/سؤال)
function quickAction(action) {
  const input = document.getElementById("userInput");
  if (!input) return;
  input.value = action + " ";
  input.focus();
}

// لا توجد ردود تعليمية محفوظة؛ أي رد تعليمي يأتي من /api/chat فقط.

// دالة إغلاق بانر التهنئة
function closeBanner() {
  const banner = document.getElementById("winBanner");
  if (banner) banner.style.display = "none";
}

// دالة عرض الشهادة (تُستخدم من بانر التهنئة)
function viewCertificate() {
  const phone = localStorage.getItem("loggedInUserPhone");
  if (!phone) {
    alert("سجل دخولك أولاً لعرض شهاداتك 📜");
    return;
  }
  window.location.href = "profile.html#certificates";
}

async function performSearch() {
  // لو الصفحة فيها صندوق نتائج بحث نستخدمه مباشرة
  if (document.getElementById("searchResults")) {
    await doSearch();
    return;
  }
  // وإلا (زي صفحة الملف الشخصي) نكمّل البحث في الصفحة الرئيسية
  const input = document.getElementById("searchInput");
  const query = input ? input.value.trim() : "";
  window.location.href =
    "index.html?search=1" + (query ? "&q=" + encodeURIComponent(query) : "");
}

async function initProfilePage() {
  const token = localStorage.getItem("studentAuthToken");
  if (!token) {
    window.location.replace("login.html?next=profile.html");
    return;
  }
  const savedName = localStorage.getItem("userName") || "دكتور مستقبلي";
  const savedPhone = localStorage.getItem("loggedInUserPhone") || "غير محدد";

  const elName = document.getElementById("userName");
  const elPhone = document.getElementById("userPhone");
  const elWelcome = document.getElementById("welcomeText");
  const elAvatar = document.getElementById("avatarLetter");
  const elBadge = document.getElementById("userBadge");
  const elPoints = document.getElementById("userPoints");
  const elCerts = document.getElementById("userCertsCount");
  const elProgress = document.getElementById("progressText");
  const elProgressFill = document.getElementById("progressBarFill");
  const elBadgeExam = document.getElementById("badgeExam");
  const elBadgePoints = document.getElementById("badgePoints");

  if (elName) elName.innerText = savedName;
  if (elPhone) elPhone.innerText = savedPhone;
  if (elAvatar) elAvatar.innerText = savedName.charAt(0).toUpperCase();
  if (elWelcome) {
    const hour = new Date().getHours();
    const greeting = hour < 12 ? "صباح الخير" : "مساء الخير";
    elWelcome.innerText = `${greeting} يا دكتور ${savedName.split(" ")[0]}! 👋`;
  }

  // جلب بيانات النقاط واللقب من السيرفر عبر جلسة الطالب فقط
  try {
    const res = await fetch("/api/profile", {
      headers: { "x-student-token": token },
    });
    if (res.status === 401) {
      localStorage.removeItem("studentAuthToken");
      window.location.href = "login.html";
      return;
    }
    const data = await res.json();
    if (res.status === 401 || !data.success) {
      localStorage.clear();
      window.location.replace("login.html?next=profile.html");
      return;
    }
    if (data.success && data.user) {
      const u = data.user;
      if (elPoints) elPoints.innerText = u.points;
      if (elBadge) elBadge.innerText = u.rankTitle || "🏅 طالب جديد";
      if (elCerts) elCerts.innerText = u.certificatesCount;
      const streakEl = document.getElementById("userStreak");
      if (streakEl) streakEl.textContent = Number(u.streak || 0);

      // حساب التقدم نحو اللقب التالي
      const nextMilestone = u.points < 100 ? 100 : u.points < 300 ? 300 : u.points < 600 ? 600 : 1000;
      if (elProgress) {
        elProgress.innerText = u.points >= 1000
          ? "تم الوصول لأعلى لقب"
          : `${u.points} / ${nextMilestone} نقطة`;
      }
      if (elProgressFill) {
        const pct = u.points >= 1000 ? 100 : Math.min(100, (u.points / nextMilestone) * 100);
        elProgressFill.style.width = `${pct}%`;
      }
      if (elBadgeExam && Number(u.examsCompleted) > 0) elBadgeExam.classList.remove("locked");
      if (elBadgePoints && Number(u.points) >= 100) elBadgePoints.classList.remove("locked");
    }
  } catch (e) {
    console.log("تعذر جلب بيانات البروفايل من السيرفر:", e);
  }

  const logoutBtn = document.getElementById("logoutBtn");
  if (logoutBtn) {
    logoutBtn.onclick = async function () {
      if (confirm("هل ترغب في تسجيل الخروج؟")) {
        const token = localStorage.getItem("studentAuthToken");
        if (token) {
          try {
            await fetch("/api/logout", {
              method: "POST",
              headers: { "x-student-token": token },
            });
          } catch (error) {
            console.warn("تعذر إغلاق جلسة الخادم:", error);
          }
        }
        localStorage.clear();
        window.location.href = "login.html";
      }
    };
  }
}

function getClientRankTitle(points) {
  const value = Number(points) || 0;
  if (value >= 1000) return "دكتور مستقبلي 🩺";
  if (value >= 600) return "طالب متفوق 🌟";
  if (value >= 300) return "طالب متميز 🏅";
  if (value >= 100) return "طالب مجتهد 📚";
  return "طالب جديد";
}

function escapeHtmlValue(value) {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

async function loadLeaderboard() {
  try {
    const response = await fetch("/api/leaderboard");
    const data = await response.json();

    const tableBody = document.getElementById("leaderboardTableBody");
    if (data.success && tableBody) {
      let html = "";
      data.leaderboard.forEach((student, index) => {
        const rankTitle = getClientRankTitle(student.points);

        html += `
                    <tr>
                        <td>${index + 1}</td>
                        <td>${escapeHtmlValue(student.name)}</td>
                        <td>${escapeHtmlValue(student.points)} نقطة</td>
                        <td>${rankTitle}</td>
                    </tr>
                `;
      });
      tableBody.innerHTML = html;
    }
  } catch (error) {
    console.log("خطأ جلب لوحة الصدارة:", error);
  }
}

// =================================// تفاعل 3D حقيقي مع حركة الماوس/اللمس على البطاقات (.card-item, .tilt-3d)
(function initTilt3D() {
  const prefersReducedMotion =
    window.matchMedia &&
    window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  if (prefersReducedMotion) return;

  function attachTilt(el) {
    const MAX_TILT = 10; // أقصى زاوية ميل بالدرجات
    let rect = null;

    function handleMove(clientX, clientY) {
      if (!rect) rect = el.getBoundingClientRect();
      const px = (clientX - rect.left) / rect.width; // 0..1
      const py = (clientY - rect.top) / rect.height; // 0..1
      const rotateY = (px - 0.5) * MAX_TILT * 2;
      const rotateX = (0.5 - py) * MAX_TILT * 2;
      el.style.transform = `translateY(-9px) rotateX(${rotateX.toFixed(2)}deg) rotateY(${rotateY.toFixed(2)}deg)`;
      el.style.setProperty("--glow-x", `${px * 100}%`);
      el.style.setProperty("--glow-y", `${py * 100}%`);
    }

    el.addEventListener("mouseenter", () => {
      rect = el.getBoundingClientRect();
    });
    el.addEventListener("mousemove", (e) => handleMove(e.clientX, e.clientY));
    el.addEventListener("mouseleave", () => {
      el.style.transform = "";
      rect = null;
    });
    el.addEventListener(
      "touchmove",
      (e) => {
        if (e.touches && e.touches[0]) {
          handleMove(e.touches[0].clientX, e.touches[0].clientY);
        }
      },
      { passive: true },
    );
    el.addEventListener("touchend", () => {
      el.style.transform = "";
      rect = null;
    });
  }

  function initAll() {
    document.querySelectorAll(".card-item, .tilt-3d").forEach(attachTilt);
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", initAll);
  } else {
    initAll();
  }
})();
 


/* =========================================================
   إصلاح سياسة الأمان (CSP)
   الموقع بيستخدم ترويسة أمان بتمنع أكواد JavaScript المضمّنة داخل
   وسوم HTML (script-src-attr 'none')، وده كان بيعطّل أزرار مهمة
   (البحث 🔍 / إغلاق بانر التهنئة / استلام الشهادة / تحميل PDF).
   لذلك تم ربط كل هذه الأزرار من هنا عبر data-action.
   ========================================================= */
(function bindCspSafeHandlers() {
  document.addEventListener("click", function (event) {
    const el = event.target.closest("[data-action]");
    if (!el) return;
    const action = el.getAttribute("data-action");

    if (action === "toggle-search") {
      event.preventDefault();
      toggleSearch();
    } else if (action === "close-banner") {
      event.preventDefault();
      closeBanner();
    } else if (action === "view-certificate") {
      event.preventDefault();
      viewCertificate();
    } else if (action === "go-home") {
      event.preventDefault();
      window.location.href = "index.html";
    } else if (action === "open-cert") {
      event.preventDefault();
      const certId = el.getAttribute("data-cert-id");
      if (certId) {
        window.open("/api/certificate-pdf/" + encodeURIComponent(certId), "_blank");
      }
    }
  });

  function initSearchBindings() {
    const searchInput = document.getElementById("searchInput");
    const resultsBox = document.getElementById("searchResults");

    // البحث الحي أثناء الكتابة (بدل onkeyup المضمّن)
    if (searchInput && resultsBox) {
      let timer = null;
      searchInput.addEventListener("input", function () {
        clearTimeout(timer);
        timer = setTimeout(function () {
          doSearch();
        }, 250);
      });
      searchInput.addEventListener("keydown", function (event) {
        if (event.key === "Enter") {
          event.preventDefault();
          clearTimeout(timer);
          doSearch();
        }
      });
    }

    // زر "بحث" في الشريط (صفحة الملف الشخصي)
    const searchSubmitBtn = document.getElementById("searchSubmitBtn");
    if (searchSubmitBtn) {
      searchSubmitBtn.addEventListener("click", function (event) {
        event.preventDefault();
        performSearch();
      });
    }

    // فتح صندوق البحث تلقائيًا عند الوصول من زر 🔍 في صفحة أخرى
    const params = new URLSearchParams(window.location.search);
    if (params.get("search") === "1") {
      openSearchBox();
      const q = params.get("q");
      if (q && searchInput && resultsBox) {
        searchInput.value = q;
        doSearch();
      }
    }
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", initSearchBindings);
  } else {
    initSearchBindings();
  }
})();
