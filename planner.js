const schoolRoutine = [
  { time: "٧:٠٠ – ١٢:٠٠", title: "المدرسة", note: "يوم دراسي", type: "blue" },
  { time: "١٢:٠٠ – ٢:٠٠", title: "فطار وراحة", note: "ممكن قيلولة قصيرة ٣٠–٦٠ دقيقة", type: "gray" }
];
const sleepRoutine = { time: "١٠:٣٠ م – ٦:٣٠ ص", title: "نوم واستعداد", note: "جهز حاجتك من بالليل", type: "gray" };

const weeklyPlan = [
  { key: "sat", name: "السبت", tasks: [...schoolRoutine, { time: "بعد ٢:٠٠", title: "علوم", note: "مذاكرة وحل التدريبات", type: "teal", id: "sat-science" }, sleepRoutine] },
  { key: "sun", name: "الأحد", tasks: [...schoolRoutine, { time: "٢:٠٠ – ٦:٠٠", title: "فلسفة ومنطق", note: "مذاكرة مركزة", type: "teal", id: "sun-philosophy" }, { time: "بعد ٦:٠٠", title: "مراجعة خفيفة", note: "أو راحة", type: "gray", id: "sun-review" }, sleepRoutine] },
  { key: "mon", name: "الاثنين", tasks: [...schoolRoutine, { time: "قبل ٤:٠٠", title: "تجهيز لدرس الرياضة", note: "راحة أو تحضير", type: "gray" }, { time: "٤:٠٠", title: "درس رياضة", note: "موعد الدرس", type: "blue", id: "mon-math" }, { time: "بعد الدرس", title: "أدب / نصوص / قراءة", note: "حسب المحاضرة", type: "teal", id: "mon-arabic" }, { time: "٩:٠٠ م", title: "درس إنجليزي", note: "لا مذاكرة ثقيلة بعده", type: "blue", id: "mon-english-class" }, sleepRoutine] },
  { key: "tue", name: "الثلاثاء", tasks: [...schoolRoutine, { time: "خلال اليوم", title: "تاريخ", note: "مذاكرة المادة", type: "teal", id: "tue-history" }, { time: "بعد المذاكرة", title: "حل التدريبات", note: "الأجزاء المحتاجة حل", type: "teal", id: "tue-practice" }, { time: "وقت إضافي", title: "إنجليزي", note: "مراجعة قصيرة إذا كنت فاضي", type: "teal", id: "tue-english" }, sleepRoutine] },
  { key: "wed", name: "الأربعاء", tasks: [...schoolRoutine, { time: "مهمة اليوم", title: "تسليم واجب العربي", note: "موعد التسليم", type: "orange", id: "wed-arabic" }, { time: "وقت مرن", title: "مراجعة أو راحة", note: "حسب احتياجك", type: "gray", id: "wed-flex" }, sleepRoutine] },
  { key: "thu", name: "الخميس", tasks: [...schoolRoutine, { time: "خلال اليوم", title: "إنجليزي", note: "مذاكرة المادة", type: "teal", id: "thu-english" }, { time: "٩:٠٠ م", title: "درس إنجليزي", note: "راجع الدرس بعده بخفة", type: "blue", id: "thu-english-class" }, sleepRoutine] },
  { key: "fri", name: "الجمعة", tasks: [{ time: "٢:٠٠ – ٤:٠٠", title: "إنجليزي — مهمة أساسية", note: "مذاكرة إجبارية", type: "teal", id: "fri-english" }, { time: "بعد ٤:٠٠", title: "مراجعة أو خروج", note: "وقت راحة مفتوح", type: "gray", id: "fri-flex" }, sleepRoutine] }
];

const dayKeys = ["sun", "mon", "tue", "wed", "thu", "fri", "sat"];
const arabicDigits = (value) => String(value).replace(/[0-9]/g, (d) => "٠١٢٣٤٥٦٧٨٩"[d]);
const getTodayKey = () => dayKeys[new Date().getDay()];
const storageKey = "plannerCompletedTasks";
const postponedKey = "plannerPostponedTasks";
const getCompleted = () => JSON.parse(localStorage.getItem(storageKey) || "[]");
const saveCompleted = (items) => localStorage.setItem(storageKey, JSON.stringify(items));
const getPostponed = () => JSON.parse(localStorage.getItem(postponedKey) || "[]");
const savePostponed = (items) => localStorage.setItem(postponedKey, JSON.stringify(items));
const weekDayDate = (dayKey) => {
  const now = new Date();
  const dayOrder = { sat: 0, sun: 1, mon: 2, tue: 3, wed: 4, thu: 5, fri: 6 };
  const daysSinceSaturday = (now.getDay() + 1) % 7;
  const saturday = new Date(now); saturday.setHours(12, 0, 0, 0); saturday.setDate(now.getDate() - daysSinceSaturday);
  const date = new Date(saturday); date.setDate(saturday.getDate() + dayOrder[dayKey]);
  return date.toLocaleDateString("ar-EG", { day: "numeric", month: "short" });
};

function renderWeek() {
  const board = document.getElementById("weekBoard"); if (!board) return;
  const today = getTodayKey(); const completed = getCompleted(); const postponed = getPostponed();
  board.innerHTML = weeklyPlan.map((day) => {
    const isToday = day.key === today;
    const tasks = day.tasks.map((task) => task.id ? `<article class="task ${task.type} ${completed.includes(task.id) ? "done" : ""} ${postponed.includes(task.id) ? "postponed" : ""}" data-task-id="${task.id}"><span class="task-time">${task.time}</span><span class="task-title">${task.title}</span><span class="task-note">${postponed.includes(task.id) ? "مؤجلة لبكرة" : task.note}</span><div class="task-actions"><button class="task-done" data-action="done" type="button">✓ تمت</button><button class="task-delay" data-action="delay" type="button">↷ بكرة</button></div></article>` : `<article class="task ${task.type}"><span class="task-time">${task.time}</span><span class="task-title">${task.title}</span><span class="task-note">${task.note}</span></article>`).join("");
    return `<section class="day-column ${isToday ? "current" : ""}"><header class="day-head"><span class="day-name">${day.name}</span><span class="day-date">${weekDayDate(day.key)}</span>${isToday ? '<span class="today-pill">اليوم</span>' : ""}</header>${tasks}</section>`;
  }).join("");
  board.querySelectorAll("[data-task-id]").forEach((task) => {
    task.querySelectorAll("[data-action]").forEach((button) => button.addEventListener("click", () => {
      const id = task.dataset.taskId; const action = button.dataset.action;
      const done = getCompleted().filter((item) => item !== id); const delayed = getPostponed().filter((item) => item !== id);
      if (action === "done") done.push(id); else delayed.push(id);
      saveCompleted(done); savePostponed(delayed); renderWeek(); updateStats();
    }));
  });
}

function updateStats() {
  const allTasks = weeklyPlan.flatMap((day) => day.tasks).filter((task) => task.id);
  const completed = getCompleted().filter((id) => allTasks.some((task) => task.id === id)).length;
  const percent = allTasks.length ? Math.round((completed / allTasks.length) * 100) : 0;
  document.getElementById("completedCount").textContent = `${arabicDigits(completed)} / ${arabicDigits(allTasks.length)}`;
  document.getElementById("completionPercent").textContent = `${arabicDigits(percent)}٪`;
  const progressBar = document.getElementById("weeklyProgressBar"); if (progressBar) progressBar.style.width = `${percent}%`;
}
function updateClock() {
  const now = new Date();
  const time = now.toLocaleTimeString("ar-EG", { hour: "2-digit", minute: "2-digit" });
  const date = now.toLocaleDateString("ar-EG", { weekday: "long", day: "numeric", month: "long", year: "numeric" });
  const timeEl = document.getElementById("currentTime"); const dateEl = document.getElementById("fullDate");
  if (timeEl) timeEl.textContent = time; if (dateEl) dateEl.textContent = date;
}
function updateFocus() {
  const day = weeklyPlan.find((item) => item.key === getTodayKey()) || weeklyPlan[0];
  const hour = new Date().getHours();
  let current = day.tasks.find((task) => task.id);
  if (hour >= 22 || hour < 7) current = sleepRoutine;
  else if (day.key !== "fri" && hour >= 7 && hour < 12) current = schoolRoutine[0];
  else if (day.key !== "fri" && hour >= 12 && hour < 14) current = schoolRoutine[1];
  const label = document.getElementById("currentLabel"); const title = document.getElementById("currentTask"); const hint = document.getElementById("currentHint");
  if (label && title && hint) { label.textContent = day.name; title.textContent = current ? current.title : "مراجعة جدولك"; hint.textContent = current ? current.note : "اختار مهمة مناسبة وابدأ بهدوء."; }
  const next = day.tasks.find((task) => task.id && task.id !== current?.id);
  const nextTask = document.getElementById("nextTask"); const nextTime = document.getElementById("nextTime");
  if (nextTask) nextTask.textContent = `المهمة القادمة: ${next ? next.title : "لا توجد"}`;
  if (nextTime) nextTime.textContent = next ? next.time : "—";
}
document.addEventListener("DOMContentLoaded", () => {
  const name = localStorage.getItem("userName"); if (name) document.getElementById("studentName").textContent = name.split(" ")[0];
  renderWeek(); updateStats(); updateClock(); updateFocus(); setInterval(() => { updateClock(); updateFocus(); }, 30000);
  document.getElementById("resetTasks")?.addEventListener("click", () => { saveCompleted([]); savePostponed([]); renderWeek(); updateStats(); });
});
