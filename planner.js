const weeklyPlan = [
  { key: "sat", name: "السبت", date: "١", tasks: [{ time: "٧:٠٠ – ١٢:٠٠", title: "المدرسة", note: "يوم دراسي", type: "blue" }, { time: "١٢:٠٠ – ٢:٠٠", title: "فطار وراحة", note: "استراحة", type: "gray" }, { time: "بعد ٢:٠٠", title: "علوم", note: "مذاكرة وحل التدريبات", type: "teal", id: "sat-science" }] },
  { key: "sun", name: "الأحد", date: "٢", tasks: [{ time: "٢:٠٠ – ٦:٠٠", title: "فلسفة ومنطق", note: "مذاكرة مركزة", type: "teal", id: "sun-philosophy" }, { time: "بعد ٦:٠٠", title: "مراجعة خفيفة", note: "أو راحة", type: "gray", id: "sun-review" }] },
  { key: "mon", name: "الاثنين", date: "٣", tasks: [{ time: "قبل ٤:٠٠", title: "تجهيز للدرس", note: "راحة أو تحضير", type: "gray" }, { time: "٤:٠٠", title: "درس رياضة", note: "موعد الدرس", type: "blue", id: "mon-math" }, { time: "بعد الدرس", title: "أدب / نصوص / قراءة", note: "حسب المحاضرة", type: "teal", id: "mon-arabic" }] },
  { key: "tue", name: "الثلاثاء", date: "٤", tasks: [{ time: "خلال اليوم", title: "تاريخ", note: "مذاكرة المادة", type: "teal", id: "tue-history" }, { time: "بعد المذاكرة", title: "حل التدريبات", note: "الأجزاء المحتاجة حل", type: "teal", id: "tue-practice" }] },
  { key: "wed", name: "الأربعاء", date: "٥", tasks: [{ time: "مهمة اليوم", title: "تسليم واجب العربي", note: "موعد التسليم", type: "orange", id: "wed-arabic" }, { time: "وقت مرن", title: "مراجعة أو راحة", note: "حسب احتياجك", type: "gray", id: "wed-flex" }] },
  { key: "thu", name: "الخميس", date: "٦", tasks: [{ time: "خلال اليوم", title: "إنجليزي", note: "مذاكرة المادة", type: "teal", id: "thu-english" }] },
  { key: "fri", name: "الجمعة", date: "٧", tasks: [{ time: "وقت مرن", title: "مراجعة أو خروج", note: "يوم مفتوح", type: "gray", id: "fri-flex" }] }
];

const dayKeys = ["sun", "mon", "tue", "wed", "thu", "fri", "sat"];
const arabicDigits = (value) => String(value).replace(/[0-9]/g, (d) => "٠١٢٣٤٥٦٧٨٩"[d]);
const getTodayKey = () => dayKeys[new Date().getDay()];
const storageKey = "plannerCompletedTasks";
const getCompleted = () => JSON.parse(localStorage.getItem(storageKey) || "[]");
const saveCompleted = (items) => localStorage.setItem(storageKey, JSON.stringify(items));
const weekDayDate = (dayKey) => {
  const now = new Date();
  const dayOrder = { sat: 0, sun: 1, mon: 2, tue: 3, wed: 4, thu: 5, fri: 6 };
  const daysSinceSaturday = (now.getDay() + 1) % 7;
  const saturday = new Date(now);
  saturday.setHours(12, 0, 0, 0);
  saturday.setDate(now.getDate() - daysSinceSaturday);
  const date = new Date(saturday);
  date.setDate(saturday.getDate() + dayOrder[dayKey]);
  return date.toLocaleDateString("ar-EG", { day: "numeric", month: "short" });
};

function renderWeek() {
  const board = document.getElementById("weekBoard");
  if (!board) return;
  const today = getTodayKey();
  board.innerHTML = weeklyPlan.map((day) => {
    const isToday = day.key === today;
    const tasks = day.tasks.map((task) => task.id ? `<article class="task ${task.type} ${getCompleted().includes(task.id) ? "done" : ""}" data-task-id="${task.id}" role="button" tabindex="0" aria-label="تحديد ${task.title} كمكتملة"><span class="task-time">${task.time}</span><span class="task-title">${task.title}</span><span class="task-note">${task.note}</span></article>` : `<article class="task ${task.type}"><span class="task-time">${task.time}</span><span class="task-title">${task.title}</span><span class="task-note">${task.note}</span></article>`).join("");
    return `<section class="day-column ${isToday ? "current" : ""}"><header class="day-head"><span class="day-name">${day.name}</span><span class="day-date">${weekDayDate(day.key)}</span>${isToday ? '<span class="today-pill">اليوم</span>' : ""}</header>${tasks || '<div class="empty-day"><b>· · ·</b>يوم هادئ</div>'}</section>`;
  }).join("");
  board.querySelectorAll("[data-task-id]").forEach((task) => {
    const toggle = () => { const id = task.dataset.taskId; const done = getCompleted(); const next = done.includes(id) ? done.filter((item) => item !== id) : [...done, id]; saveCompleted(next); task.classList.toggle("done", next.includes(id)); updateStats(); };
    task.addEventListener("click", toggle); task.addEventListener("keydown", (event) => { if (event.key === "Enter" || event.key === " ") { event.preventDefault(); toggle(); } });
  });
}

function updateStats() {
  const allTasks = weeklyPlan.flatMap((day) => day.tasks).filter((task) => task.id);
  const completed = getCompleted().filter((id) => allTasks.some((task) => task.id === id)).length;
  const percent = allTasks.length ? Math.round((completed / allTasks.length) * 100) : 0;
  document.getElementById("completedCount").textContent = `${arabicDigits(completed)} / ${arabicDigits(allTasks.length)}`;
  document.getElementById("completionPercent").textContent = `${arabicDigits(percent)}٪`;
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
  if (day.key === "sat" && hour < 12) current = day.tasks[0];
  if (day.key === "mon" && hour < 16) current = day.tasks[0];
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
  document.getElementById("resetTasks")?.addEventListener("click", () => { saveCompleted([]); renderWeek(); updateStats(); });
});
