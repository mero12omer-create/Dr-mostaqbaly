// ==========================================
// دكتور مستقبلي 🩺 - Script.js المطور
// ==========================================

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
  const loggedInPhone = localStorage.getItem("loggedInUserPhone");
  const loggedInEmail = localStorage.getItem("userEmail");
  const isLoggedIn = loggedInPhone || loggedInEmail;

  const currentPath = window.location.pathname.toLowerCase();
  const isAuthPage =
    currentPath.includes("login") || currentPath.includes("signup");

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

      if (!name || !phone || !email || !password) {
        alert("يرجى تعبئة جميع الحقول أولاً");
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
          window.location.href = "index.html";
        } else {
          alert(
            data.message || "حدث خطأ أثناء إنشاء الحساب، برجاء المحاولة مجدداً",
          );
        }
      } catch (err) {
        console.warn("تعذر إنشاء الحساب على الخادم:", err);
        alert("تعذر الاتصال بالخادم، ولم يتم إنشاء الحساب. حاول مرة أخرى.");
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

      try {
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
          window.location.href = "index.html";
        } else {
          alert(data.message || "رقم الهاتف غير مسجل");
        }
      } catch (err) {
        console.warn("تعذر تسجيل الدخول على الخادم:", err);
        alert("تعذر الاتصال بالخادم، ولم يتم تسجيل الدخول. حاول مرة أخرى.");
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

// ==========================================
// الوظائف العامة (Global Functions)
// ==========================================

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

function toggleSearch() {
  const searchBar =
    document.getElementById("searchBar") ||
    document.getElementById("searchBox");
  if (searchBar) {
    searchBar.style.display =
      searchBar.style.display === "none" || searchBar.style.display === ""
        ? "block"
        : "none";
  }
}

// دالة البحث الحي (doSearch) المستدعاة من index.html
function doSearch() {
  const input = document.getElementById("searchInput");
  const resultsBox = document.getElementById("searchResults");
  if (!input || !resultsBox) return;
  const query = input.value.trim().toLowerCase();
  if (query === "") {
    resultsBox.innerHTML = "";
    return;
  }

  // البحث في المذكرات والامتحانات المخزنة محلياً
  let found = [];
  try {
    const notes = JSON.parse(localStorage.getItem("notesData")) || [];
    notes.forEach((n) => {
      if ((n.title || "").toLowerCase().includes(query)) {
        found.push({ type: "مذكرة", title: n.title, link: "notes.html" });
      }
    });
  } catch (e) {}

  try {
    const courses = JSON.parse(localStorage.getItem("coursesData")) || {};
    Object.keys(courses).forEach((key) => {
      (courses[key].lessons || []).forEach((l) => {
        if ((l.title || "").toLowerCase().includes(query)) {
          found.push({ type: "درس", title: l.title, link: "exams.html" });
        }
      });
    });
  } catch (e) {}

  if (found.length === 0) {
    resultsBox.innerHTML =
      '<p style="color: gray; font-size: 13px; padding: 8px;">لا توجد نتائج مطابقة 🔍</p>';
    return;
  }

  resultsBox.innerHTML = found
    .slice(0, 8)
    .map(
      (f) =>
        `<a href="${f.link}" style="display:block; padding:8px; text-decoration:none; color:var(--text); border-bottom:1px solid var(--border);">${f.type} • ${f.title}</a>`,
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

function performSearch() {
  const input = document.getElementById("searchInput");
  if (!input) return;
  const query = input.value.trim().toLowerCase();
  if (query === "") return;
  alert(`جاري البحث عن: ${query}`);
}

async function initProfilePage() {
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
    const token = localStorage.getItem("studentAuthToken");
    if (!token) return;
    const res = await fetch("/api/profile", {
      headers: { "x-student-token": token },
    });
    const data = await res.json();
    if (data.success && data.user) {
      const u = data.user;
      if (elPoints) elPoints.innerText = u.points;
      if (elBadge) elBadge.innerText = u.rankTitle || "🏅 طالب جديد";
      if (elCerts) elCerts.innerText = u.certificatesCount;

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
