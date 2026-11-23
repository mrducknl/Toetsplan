const STORAGE_KEY = "toetsplan-data-v1";
const MAX_DAILY_STUDY_MINUTES = 120;

const defaultData = {
  profileName: "Jouw profiel",
  subjects: [
    { id: "sub-1", name: "Wiskunde", color: "#6c63ff" },
    { id: "sub-2", name: "Engels", color: "#ff8b74" },
    { id: "sub-3", name: "Geschiedenis", color: "#35b995" }
  ],
  exams: [],
  tasks: [],
  notes: [],
  weeklyActivities: [],
  studyWindow: { start: "07:00", end: "22:00" },
  onboardingCompleted: false
};

const suggestedSubjects = [
  "Nederlands", "Wiskunde", "Engels", "Geschiedenis", "Biologie",
  "Aardrijkskunde", "Natuurkunde", "Scheikunde", "Frans", "Duits", "Economie",
  "Spaans", "Latijn", "Grieks", "Maatschappijleer", "Informatica", "Techniek",
  "Muziek", "Beeldende vorming", "Drama", "Lichamelijke opvoeding",
  "Burgerschap", "Filosofie", "Levensbeschouwing", "CKV", "Bedrijfseconomie"
];

const commonTopicSpellings = {
  aardplaaten: "aardplaten",
  continentten: "continenten",
  kontinenten: "continenten",
  platentektoniek: "plaattektoniek",
  meanderren: "meanderen",
  meandereren: "meanderen",
  landschapen: "landschappen",
  kontinent: "continent",
  subduktie: "subductie",
  konvergentie: "convergentie",
  sedimentasie: "sedimentatie",
  revolusie: "revolutie",
  fotosintese: "fotosynthese",
  napolion: "napoleon",
  pytagoras: "pythagoras",
  coordinaten: "coördinaten",
  bacterien: "bacteriën",
  hindoeisme: "hindoeïsme",
  francais: "français"
};
const assistantCompoundTopics = [
  "onderwerp en gezegde",
  "vraag en aanbod",
  "oorzaak en gevolg"
];

let data = loadData();
let calendarDate = new Date();
let dashboardDate = new Date();
let selectedSubjectColor = "#6c63ff";
const weekdayNames = ["Ma", "Di", "Wo", "Do", "Vr", "Za", "Zo"];
const weekdayFullNames = ["Maandag", "Dinsdag", "Woensdag", "Donderdag", "Vrijdag", "Zaterdag", "Zondag"];
let weeklyScheduleDraftActivities = [];

function correctAssistantTopicSpelling(topic, context) {
  return topic.replace(/[a-zà-ÿ]+/gi, word => {
    const lowerWord = word.toLowerCase();
    if (lowerWord === "condutie" &&
      /\b(?:aardplaten?|aardplaaten|plaattektoniek|subductie|vulkanen?|vulkanisme|convergentie|divergentie)\b/i.test(context)) {
      // In a plate-tectonics context, "subductie" is the likely intended term.
      return "subductie";
    }
    return commonTopicSpellings[lowerWord] || word;
  });
}

function cleanAssistantTopic(topic, context = topic) {
  const cleaned = String(topic)
    .replace(/^(?:(?:dat|dit|deze|die|de|het|een|mijn|jouw|ik|je|hij|zij|we|wij|heb|heeft|hebben|moet|moeten|gaat|is|zijn|ook|zoals|bijvoorbeeld|over)\s+)+/i, "")
    .replace(/\s+(?:dat|die|wat)\s+(?:ik|je|hij|zij|we|wij)\b.*$/i, "")
    .replace(/\s+(?:is|zijn|was|waren|moet|moeten|heeft|hebben|kan|kunnen|gaat|gaan)\b.*$/i, "")
    .replace(/\s+(?:verder|ook|etc(?:etera)?|enz(?:ovoorts)?)\s*$/i, "")
    .replace(/\s+/g, " ")
    .replace(/^[,;:.!?]+|[,;:.!?]+$/g, "")
    .trim();
  return correctAssistantTopicSpelling(cleaned, context);
}

function stripTrailingDateDetails(value) {
  const normalized = normalizeRelativeDateText(value);
  const cleaned = normalized
    .replace(/\b(?:vandaag|morgen|overmorgen|volgende\s+week|over\s+(?:\d{1,2}|een|twee|drie|vier|vijf|zes|zeven|acht|negen|tien)\s+(?:dagen?|weken?))\b[\s\S]*$/i, "")
    .replace(/\b(?:op|is op|datum|voor)\s+\d{1,2}(?:[-/.]\d{1,2})(?:[-/.]\d{2,4})?[\s\S]*$/i, "")
    .replace(/\b(?:op|is op|datum|voor)\s+\d{1,2}(?:e|ste|de)?\s+(?:januari|jan|februari|feb|maart|mrt|april|apr|mei|juni|jun|juli|jul|augustus|aug|september|sep|oktober|okt|november|nov|december|dec)[\s\S]*$/i, "")
    .replace(/\b(?:op|is op)\s+\d{4}-\d{1,2}-\d{1,2}[\s\S]*$/i, "")
    .replace(/\s+(?:op\s+)?(?:maandag|dinsdag|woensdag|donderdag|vrijdag|zaterdag|zondag)\b[\s\S]*$/i, "")
    .trim();
  if (cleaned === normalized.trim()) return cleaned;
  return cleaned.replace(/(?:\s+\b(?:is|wordt|valt|op|om|voor|het|de|een|dit|dat)\b)+\s*$/i, "").trim();
}

function cleanGeneratedExamTitle(title) {
  const source = String(title || "");
  return source
    .split(/\s*,\s*/)
    .map(topic => stripTrailingDateDetails(cleanAssistantTopic(topic, source)))
    .filter(Boolean)
    .join(", ");
}

function cleanGeneratedStudyTaskTitle(title, context = title) {
  const match = title.match(/^(Leren(?: en herhalen)?|Oefenen|Herhalen|Extra oefenen|Leer en leg uit|Actief ophalen(?: en oefenen)?|Oefenvragen|Door elkaar oefenen|Proeftoets|Gespreid herhalen):\s*(.*?)\s*·\s*((?:[\d.,]+\s*u)|(?:\d+\s*min))$/i);
  if (!match) return title;
  const topics = match[2].split(/\s*(?:,|\ben\b)\s*/i)
    .map(topic => stripTrailingDateDetails(cleanAssistantTopic(topic, `${match[2]} ${context}`)))
    .filter(Boolean);
  if (!topics.length) return title;
  const strategy = match[1].toLowerCase() === "leren en herhalen"
    ? /^30\s*min$/i.test(match[3]) ? "Herhalen" : "Leren"
    : /^(?:herhalen|gespreid herhalen|oefenen|extra oefenen|actief ophalen(?: en oefenen)?|oefenvragen|door elkaar oefenen|proeftoets)$/i.test(match[1])
      ? "Herhalen"
      : "Leren";
  return `${strategy}: ${topics.join(" en ")} · ${match[3]}`;
}

function loadData() {
  try {
    const savedData = JSON.parse(localStorage.getItem(STORAGE_KEY));
    const loadedData = { ...structuredClone(defaultData), ...savedData };
    loadedData.weeklyActivities = Array.isArray(loadedData.weeklyActivities)
      ? loadedData.weeklyActivities
      : [];
    loadedData.studyWindow = { ...defaultData.studyWindow, ...loadedData.studyWindow };
    delete loadedData.studyApproach;
    loadedData.notes = Array.isArray(loadedData.notes)
      ? loadedData.notes.map(note => ({ subjectId: null, ...note }))
      : [];
    if (typeof savedData?.onboardingCompleted === "boolean") {
      loadedData.onboardingCompleted = savedData.onboardingCompleted;
    } else {
      const hasExistingPlanning = Boolean(savedData) && (
        (Array.isArray(savedData.weeklyActivities) && savedData.weeklyActivities.length > 0) ||
        (Array.isArray(savedData.exams) && savedData.exams.length > 0) ||
        (Array.isArray(savedData.tasks) && savedData.tasks.length > 0) ||
        (typeof savedData.profileName === "string" && savedData.profileName !== "Jouw profiel")
      );
      loadedData.onboardingCompleted = hasExistingPlanning;
    }
    loadedData.exams = loadedData.exams.map(exam => {
      if (typeof exam.difficulty !== "number") return exam;
      const title = cleanGeneratedExamTitle(exam.title);
      return title && title !== exam.title ? { ...exam, title } : exam;
    });
    const legacyCombinedTaskIds = new Set();
    const legacyCombinedExamIds = new Set();
    loadedData.tasks = loadedData.tasks.flatMap(task => {
      let normalizedTask = task;
      if (task.examId && task.title.startsWith("Herhalen: alle onderwerpen")) {
        const exam = loadedData.exams.find(item => item.id === task.examId);
        if (exam && exam.title !== "Nieuwe toets") {
          normalizedTask = {
            ...task,
            title: task.title.replace(
              "Herhalen: alle onderwerpen",
              exam.title.replace(/,\s*/g, " en ")
            )
          };
        }
      }
      const exam = normalizedTask.examId &&
        loadedData.exams.find(item => item.id === normalizedTask.examId);
      if (typeof exam?.difficulty !== "number") return [normalizedTask];
      const title = cleanGeneratedStudyTaskTitle(normalizedTask.title, exam.title);
      normalizedTask = title === normalizedTask.title ? normalizedTask : { ...normalizedTask, title };
      const combinedTitle = normalizedTask.title.match(/^(Leren|Herhalen):\s*(.*?)\s*·\s*(\d+\s*min)$/i);
      const topics = exam.title.split(/\s*,\s*/).filter(Boolean);
      const combinedTopics = topics.join(" en ");
      const totalMinutes = Math.round(Number(normalizedTask.hours) * 60);
      if (!combinedTitle || topics.length < 2 || totalMinutes < topics.length ||
        !combinedTitle[2].toLowerCase().includes(combinedTopics.toLowerCase())) {
        return [normalizedTask];
      }

      let elapsedMinutes = 0;
      const splitTasks = topics.map((topic, index) => {
        const minutes = Math.floor(totalMinutes / topics.length) +
          (index < totalMinutes % topics.length ? 1 : 0);
        const startMinutes = clockToMinutes(normalizedTask.time);
        const time = startMinutes === null
          ? normalizedTask.time
          : `${String(Math.floor((startMinutes + elapsedMinutes) / 60)).padStart(2, "0")}:${String((startMinutes + elapsedMinutes) % 60).padStart(2, "0")}`;
        elapsedMinutes += minutes;
        return {
          ...normalizedTask,
          id: index === 0 ? normalizedTask.id : uid("task"),
          title: `${combinedTitle[1]}: ${topic} · ${formatStudyDuration(minutes / 60)}`,
          time,
          hours: minutes / 60
        };
      });
      legacyCombinedExamIds.add(normalizedTask.examId);
      splitTasks.forEach(splitTask => legacyCombinedTaskIds.add(splitTask.id));
      return splitTasks;
    });
    if (legacyCombinedTaskIds.size) {
      const tasksByExamTopic = new Map();
      loadedData.tasks
        .filter(task => legacyCombinedTaskIds.has(task.id))
        .forEach(task => {
          const match = task.title.match(/^(Leren|Herhalen):\s*(.*?)\s*·/i);
          if (!match) return;
          const key = `${task.examId}|${match[2].toLowerCase()}`;
          if (!tasksByExamTopic.has(key)) {
            tasksByExamTopic.set(key, { learning: [], reviews: [] });
          }
          const sessions = tasksByExamTopic.get(key);
          sessions[match[1].toLowerCase() === "leren" ? "learning" : "reviews"].push(task);
        });
      const retainedTasks = new Map();
      tasksByExamTopic.forEach(({ learning, reviews }) => {
        const byDateAndTime = (a, b) =>
          `${a.date || ""} ${a.time || ""}`.localeCompare(`${b.date || ""} ${b.time || ""}`);
        learning.sort(byDateAndTime);
        reviews.sort(byDateAndTime);
        learning.slice(0, 2).forEach(task => retainedTasks.set(task.id, task));
        if (learning.length < 2 && reviews.length > 1) {
          const promotedReview = reviews.shift();
          retainedTasks.set(promotedReview.id, {
            ...promotedReview,
            title: promotedReview.title.replace(/^Herhalen:/i, "Leren:")
          });
        }
        if (reviews.length) {
          const latestReview = reviews[reviews.length - 1];
          retainedTasks.set(latestReview.id, latestReview);
        }
      });
      loadedData.tasks = loadedData.tasks
        .map(task => retainedTasks.get(task.id) || task)
        .filter(task => !legacyCombinedTaskIds.has(task.id) || retainedTasks.has(task.id));
      loadedData.exams = loadedData.exams.map(exam => {
        if (!legacyCombinedExamIds.has(exam.id)) return exam;
        const hours = loadedData.tasks
          .filter(task => task.examId === exam.id)
          .reduce((sum, task) => sum + (Number(task.hours) || 0), 0);
        return { ...exam, hours };
      });
    }
    return loadedData;
  } catch {
    return structuredClone(defaultData);
  }
}

function saveData() {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
  render();
}

function uid(prefix) {
  return `${prefix}-${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

function escapeHtml(value) {
  const div = document.createElement("div");
  div.textContent = value ?? "";
  return div.innerHTML;
}

function readRequiredText(inputId, message) {
  const input = document.getElementById(inputId);
  const value = input.value.trim();
  input.setCustomValidity(value ? "" : message);
  if (!value) {
    input.reportValidity();
    input.focus();
    return null;
  }
  return value;
}

function isValid24HourTime(value) {
  return /^(?:[01]\d|2[0-3]):[0-5]\d$/.test(value);
}

document.addEventListener("input", event => {
  const input = event.target;
  if (!input.matches(".time-24-input")) return;
  const digits = input.value.replace(/\D/g, "").slice(0, 4);
  input.value = digits.length > 2
    ? `${digits.slice(0, 2)}:${digits.slice(2)}`
    : digits;
  input.setCustomValidity("");
  if (input.dataset.schoolStart !== undefined) {
    updateSchoolDayDuration(input.dataset.schoolStart);
  } else if (input.dataset.schoolEnd !== undefined) {
    updateSchoolDayDuration(input.dataset.schoolEnd);
  }
});

["examTitle", "taskTitle", "subjectName", "noteTitle", "profileNameInput", "assistantPrompt", "weeklyActivityName"]
  .forEach(id => document.getElementById(id).addEventListener("input", event => {
    event.currentTarget.setCustomValidity("");
  }));
document.querySelectorAll("dialog").forEach(dialog => dialog.addEventListener("close", () => {
  dialog.querySelectorAll("input, textarea").forEach(input => input.setCustomValidity(""));
}));

function toLocalDate(date) {
  const offset = date.getTimezoneOffset();
  return new Date(date.getTime() - offset * 60000).toISOString().slice(0, 10);
}

function dateOffsetFromToday(days) {
  const date = new Date();
  date.setDate(date.getDate() + days);
  return toLocalDate(date);
}

function dateFromDayMonth(day, month, year, today) {
  let targetYear = year ? Number(year) : today.getFullYear();
  if (targetYear < 100) targetYear += 2000;
  let date = new Date(targetYear, Number(month) - 1, Number(day));
  if (date.getFullYear() !== targetYear || date.getMonth() !== Number(month) - 1 || date.getDate() !== Number(day)) {
    return null;
  }
  if (!year && date < today) {
    targetYear++;
    date = new Date(targetYear, Number(month) - 1, Number(day));
    if (date.getMonth() !== Number(month) - 1 || date.getDate() !== Number(day)) return null;
  }
  return toLocalDate(date);
}

function normalizeRelativeDateText(text) {
  return text.replace(/\bvokgende(?=\s+week\b)/gi, "volgende");
}

function extractExamDate(prompt, today = new Date()) {
  const text = normalizeRelativeDateText(prompt.toLowerCase().replace(/\s+/g, " "));
  const baseDate = new Date(today.getFullYear(), today.getMonth(), today.getDate());
  const addDays = count => {
    const date = new Date(baseDate);
    date.setDate(date.getDate() + count);
    return toLocalDate(date);
  };
  if (/\bovermorgen\b/.test(text)) return addDays(2);
  if (/\bmorgen\b/.test(text)) return addDays(1);
  if (/\bvandaag\b/.test(text)) return toLocalDate(baseDate);

  const numberWords = { een: 1, twee: 2, drie: 3, vier: 4, vijf: 5, zes: 6, zeven: 7, acht: 8, negen: 9, tien: 10 };
  const relativeDate = text.match(/\bover\s+(\d{1,2}|een|twee|drie|vier|vijf|zes|zeven|acht|negen|tien)\s+(dagen?|weken?)\b/);
  if (relativeDate) {
    const count = Number(relativeDate[1]) || numberWords[relativeDate[1]];
    return addDays(count * (relativeDate[2].startsWith("week") ? 7 : 1));
  }
  const isoDate = text.match(/\b(\d{4})-(\d{1,2})-(\d{1,2})\b/);
  if (isoDate) return dateFromDayMonth(isoDate[3], isoDate[2], isoDate[1], baseDate);

  const fullNumericDate = text.match(/\b(\d{1,2})[-/](\d{1,2})[-/](\d{2,4})\b/);
  if (fullNumericDate) return dateFromDayMonth(fullNumericDate[1], fullNumericDate[2], fullNumericDate[3], baseDate);
  const explicitShortDate = text.match(/\b(?:op|is|wordt|valt)\s+(?:de\s+)?(\d{1,2})[-/](\d{1,2})\b/);
  if (explicitShortDate) return dateFromDayMonth(explicitShortDate[1], explicitShortDate[2], null, baseDate);

  const fullDottedDate = text.match(/\b(\d{1,2})\.(\d{1,2})\.(\d{2,4})\b/);
  if (fullDottedDate) return dateFromDayMonth(fullDottedDate[1], fullDottedDate[2], fullDottedDate[3], baseDate);

  const months = {
    januari: 1, jan: 1, februari: 2, feb: 2, maart: 3, mrt: 3,
    april: 4, apr: 4, mei: 5, juni: 6, jun: 6, juli: 7, jul: 7,
    augustus: 8, aug: 8, september: 9, sep: 9, oktober: 10, okt: 10,
    november: 11, nov: 11, december: 12, dec: 12
  };
  const monthPattern = Object.keys(months).sort((a, b) => b.length - a.length).join("|");
  const namedDate = text.match(new RegExp(`\\b(\\d{1,2})(?:e|ste|de)?\\s+(${monthPattern})\\b(?:\\s+(\\d{4}))?`));
  if (namedDate) return dateFromDayMonth(namedDate[1], months[namedDate[2]], namedDate[3], baseDate);

  const weekdays = {
    zondag: 0, maandag: 1, dinsdag: 2, woensdag: 3,
    donderdag: 4, vrijdag: 5, zaterdag: 6
  };
  const weekdayNamesPattern = Object.keys(weekdays).join("|");
  const nextWeekday = text.match(new RegExp(`\\b(?:volgende|aanstaande|komende)\\s+(?:week\\s+)?(${weekdayNamesPattern})\\b`));
  const weekday = nextWeekday || text.match(new RegExp(`\\b(?:op\\s+)?(${weekdayNamesPattern})\\b`));
  if (weekday) {
    const targetDay = weekdays[weekday[1]];
    const explicitNextWeek = new RegExp(`\\b(?:volgende|aanstaande|komende)\\s+week\\s+${weekdayNamesPattern}\\b`).test(text);
    const currentWeekday = (baseDate.getDay() + 6) % 7;
    let offset = (targetDay - baseDate.getDay() + 7) % 7;
    if (explicitNextWeek) {
      offset = 7 - currentWeekday + (targetDay + 6) % 7;
    } else if (nextWeekday && offset === 0) {
      offset = 7;
    }
    return addDays(offset);
  }
  if (/\bvolgende week\b/.test(text)) return addDays(7);
  return null;
}

function parseDate(value) {
  const [year, month, day] = value.split("-").map(Number);
  return new Date(year, month - 1, day);
}

function calendarDaysBetween(start, end) {
  const startUtc = Date.UTC(start.getFullYear(), start.getMonth(), start.getDate());
  const endUtc = Date.UTC(end.getFullYear(), end.getMonth(), end.getDate());
  return Math.round((endUtc - startUtc) / 86400000);
}

function showToast(message) {
  const toast = document.getElementById("toast");
  toast.textContent = message;
  toast.classList.add("show");
  clearTimeout(showToast.timer);
  showToast.timer = setTimeout(() => toast.classList.remove("show"), 2200);
}

function subjectById(id) {
  return data.subjects.find(subject => subject.id === id);
}

function render() {
  document.getElementById("profileName").textContent = data.profileName;
  document.getElementById("avatarInitial").textContent = data.profileName.charAt(0).toUpperCase() || "J";
  renderDashboard();
  renderCalendar();
  renderWeeklyActivities();
  renderSubjects();
  renderSettings();
  fillSubjectSelects();
}

function renderDashboard() {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const futureExams = data.exams
    .filter(exam => parseDate(exam.date) >= today)
    .sort((a, b) => a.date.localeCompare(b.date));

  const startOfWeek = new Date(today);
  startOfWeek.setDate(today.getDate() - ((today.getDay() + 6) % 7));
  const endOfWeek = new Date(startOfWeek);
  endOfWeek.setDate(startOfWeek.getDate() + 6);
  const weekExams = futureExams.filter(exam => {
    const examDate = parseDate(exam.date);
    return examDate >= startOfWeek && examDate <= endOfWeek;
  });
  document.getElementById("upcomingCount").textContent = futureExams.length;
  document.getElementById("weekCount").textContent = weekExams.length;
  document.getElementById("completedCount").textContent = data.tasks.filter(task => task.completed).length;

  const examList = document.getElementById("examList");
  examList.innerHTML = futureExams.slice(0, 5).map(exam => {
    const date = parseDate(exam.date);
    const subject = subjectById(exam.subjectId);
    const daysUntil = calendarDaysBetween(today, date);
    const relativeDate = daysUntil === 0 ? "Vandaag" : daysUntil === 1 ? "Morgen" : `Over ${daysUntil} dagen`;
    const subjectColor = subject?.color || "#777";
    return `
      <button class="exam-row upcoming-exam-row" data-exam-id="${escapeHtml(exam.id)}" style="--exam-color:${escapeHtml(subjectColor)}">
        <span class="date-badge"><strong>${date.getDate()}</strong><small>${date.toLocaleDateString("nl-NL", { month: "short" }).replace(".", "")}</small></span>
        <span class="exam-copy">
          <span class="exam-title-line"><strong>${escapeHtml(exam.title)}</strong><span class="subject-pill" style="--subject-color:${escapeHtml(subjectColor)}">${escapeHtml(subject?.name || "Vak")}</span></span>
          <span class="exam-meta"><span class="exam-subject-meta">${escapeHtml(subject?.name || "Vak")}</span><span>${escapeHtml(exam.time || "09:00")}</span><span>${escapeHtml(String(exam.hours || 1))} uur</span><strong>${relativeDate}</strong></span>
        </span>
        <span class="exam-row-arrow" aria-hidden="true">›</span>
      </button>`;
  }).join("") || `<div class="empty-state">Nog geen aankomende toetsen gepland.</div>`;

  examList.querySelectorAll("[data-exam-id]").forEach(button => {
    button.addEventListener("click", () => openExamDialog(button.dataset.examId));
  });

  const selectedDate = new Date(dashboardDate);
  selectedDate.setHours(0, 0, 0, 0);
  const selectedDateKey = toLocalDate(selectedDate);
  const dayLabel = new Intl.DateTimeFormat("nl-NL", {
    weekday: "long",
    day: "numeric",
    month: "long"
  }).format(selectedDate);
  const dateButton = document.getElementById("dashboardDateButton");
  dateButton.textContent = `${dayLabel.charAt(0).toUpperCase()}${dayLabel.slice(1)}`;

  const weekday = (selectedDate.getDay() + 6) % 7;
  const activities = data.weeklyActivities
    .filter(activity => activity.days.includes(weekday))
    .map(activity => ({
      start: activity.start,
      end: activity.end,
      title: activity.name,
      detail: activity.name.trim().toLowerCase() === "school" ? "Vaste schooltijd" : "Vaste afspraak",
      color: "#8a90a3"
    }));
  const exams = data.exams.filter(exam => exam.date === selectedDateKey).map(exam => {
    const subject = subjectById(exam.subjectId);
    return {
      start: exam.time || "09:00",
      title: exam.title,
      detail: `${subject?.name || "Vak"} · Toets`,
      color: subject?.color || "#777",
      examId: exam.id
    };
  });
  const tasks = data.tasks.filter(task => task.date === selectedDateKey).map(task => {
    const subject = subjectById(task.subjectId);
    return {
      start: task.time || "",
      end: task.time ? formatTimeRange(task.time, task.hours).split("–")[1] : "",
      title: task.title,
      detail: `${subject?.name || "Geen vak"} · ${task.completed ? "Afgerond" : task.examId ? "Leermoment" : "Taak"}`,
      color: subject?.color || "#777",
      taskId: task.id,
      examId: task.examId,
      completed: task.completed
    };
  });
  const entries = [...activities, ...exams, ...tasks]
    .sort((a, b) => (a.start || "99:99").localeCompare(b.start || "99:99"));

  const taskList = document.getElementById("taskList");
  taskList.innerHTML = entries.map(entry => {
    const time = entry.start ? `${entry.start}${entry.end ? `–${entry.end}` : ""}` : "Tijd niet ingesteld";
    return `
      <article class="dashboard-day-entry ${entry.completed ? "completed" : ""}" style="--entry-color:${escapeHtml(entry.color)}">
        <span class="dashboard-day-time">${escapeHtml(time)}</span>
        <div class="dashboard-day-entry-copy"><strong>${escapeHtml(entry.title)}</strong><small>${escapeHtml(entry.detail)}</small></div>
        ${entry.taskId ? `
          <input class="dashboard-task-check" type="checkbox" data-toggle-task="${escapeHtml(entry.taskId)}" aria-label="Taak afronden: ${escapeHtml(entry.title)}" ${entry.completed ? "checked" : ""}>
        ` : ""}
      </article>`;
  }).join("") || `<div class="dashboard-day-empty">Geen lessen, toetsen of taken gepland.</div>`;

  taskList.querySelectorAll("[data-toggle-task]").forEach(input => {
    input.addEventListener("change", () => {
      const task = data.tasks.find(item => item.id === input.dataset.toggleTask);
      if (task) task.completed = input.checked;
      saveData();
    });
  });
}

function renderCalendar() {
  const weekStart = new Date(calendarDate);
  weekStart.setHours(0, 0, 0, 0);
  weekStart.setDate(weekStart.getDate() - ((weekStart.getDay() + 6) % 7));
  const weekEnd = new Date(weekStart);
  weekEnd.setDate(weekStart.getDate() + 6);
  const todayKey = toLocalDate(new Date());
  const weekStartLabel = new Intl.DateTimeFormat("nl-NL", { day: "numeric", month: "short" })
    .format(weekStart).replace(".", "");
  const weekEndLabel = new Intl.DateTimeFormat("nl-NL", { day: "numeric", month: "short", year: "numeric" })
    .format(weekEnd).replace(".", "");
  document.getElementById("monthTitle").textContent = `${weekStartLabel} – ${weekEndLabel}`;

  const days = Array.from({ length: 7 }, (_, index) => {
    const date = new Date(weekStart);
    date.setDate(weekStart.getDate() + index);
    const key = toLocalDate(date);
    const activities = data.weeklyActivities
      .filter(activity => activity.days.includes(index))
      .map(activity => ({
        start: activity.start,
        end: activity.end,
        title: activity.name,
        kind: activity.name.trim().toLowerCase() === "school" ? "Vaste schooltijd" : "Vaste afspraak",
        color: "#8a90a3"
      }));
    const exams = data.exams.filter(exam => exam.date === key).map(exam => {
      const subject = subjectById(exam.subjectId);
      return {
        start: exam.time || "09:00",
        end: "",
        title: exam.title,
        kind: `${subject?.name || "Vak"} · Toets`,
        color: subject?.color || "#777",
        examId: exam.id
      };
    });
    const tasks = data.tasks.filter(task => task.date === key).map(task => {
      const subject = subjectById(task.subjectId);
      return {
        start: task.time || "",
        end: task.time ? formatTimeRange(task.time, task.hours).split("–")[1] : "",
        title: task.title,
        kind: `${subject?.name || "Geen vak"} · ${task.completed ? "Afgerond" : task.examId ? "Leermoment" : "Taak"}`,
        color: subject?.color || "#777",
        taskId: task.id,
        examId: task.examId,
        completed: task.completed
      };
    });
    const entries = [...activities, ...exams, ...tasks]
      .sort((a, b) => (a.start || "99:99").localeCompare(b.start || "99:99"));
    const entryMarkup = entries.map(entry => {
      const target = entry.examId
        ? `data-open-exam="${escapeHtml(entry.examId)}"`
        : entry.taskId && !entry.examId
          ? `data-open-task="${escapeHtml(entry.taskId)}"`
          : "";
      const time = entry.start
        ? `${entry.start}${entry.end ? `–${entry.end}` : ""}`
        : "Tijd niet ingesteld";
      return `
        <button type="button" class="week-agenda-entry ${entry.completed ? "completed" : ""}" ${target} ${target ? "" : "disabled"} style="--entry-color:${escapeHtml(entry.color)}">
          <span class="week-agenda-entry-time">${escapeHtml(time)}</span>
          <span class="week-agenda-entry-copy">
            <strong>${escapeHtml(entry.title)}</strong>
            <small>${escapeHtml(entry.kind)}</small>
          </span>
        </button>`;
    }).join("");
    const dayLabel = new Intl.DateTimeFormat("nl-NL", { weekday: "long" }).format(date);
    return `
      <article class="week-agenda-day ${key === todayKey ? "today" : ""}">
        <button type="button" class="week-agenda-date" data-date="${key}">
          <span>${escapeHtml(dayLabel)}</span>
          <strong>${date.getDate()}</strong>
        </button>
        <div class="week-agenda-items">
          ${entryMarkup || '<span class="week-agenda-empty">Geen afspraken</span>'}
        </div>
      </article>`;
  });
  document.getElementById("calendarGrid").innerHTML = days.join("");
  document.querySelectorAll("#calendarGrid [data-open-exam]").forEach(item => {
    item.addEventListener("click", () => openExamDialog(item.dataset.openExam));
  });
  document.querySelectorAll("#calendarGrid [data-open-task]").forEach(item => {
    item.addEventListener("click", () => openTaskDialog(item.dataset.openTask));
  });
  document.querySelectorAll(".week-agenda-date").forEach(day => {
    day.addEventListener("click", () => openDayDialog(day.dataset.date));
  });
}

function formatTimeRange(startTime, hours) {
  if (!startTime) return "Tijd instellen";
  if (!hours) return startTime;
  const [startHour, startMinute] = startTime.split(":").map(Number);
  const endMinutes = startHour * 60 + startMinute + Math.round(Number(hours) * 60);
  const endTime = `${String(Math.floor(endMinutes / 60) % 24).padStart(2, "0")}:${String(endMinutes % 60).padStart(2, "0")}`;
  return `${startTime}–${endTime}${endMinutes >= 1440 ? " (+1)" : ""}`;
}

function openDayDialog(date) {
  const parsedDate = parseDate(date);
  const formattedDate = new Intl.DateTimeFormat("nl-NL", {
    weekday: "long",
    day: "numeric",
    month: "long",
    year: "numeric"
  }).format(parsedDate);
  const dialog = document.getElementById("dayDialog");
  document.getElementById("dayDialogTitle").textContent =
    `${formattedDate.charAt(0).toUpperCase()}${formattedDate.slice(1)}`;
  dialog.dataset.date = date;

  const weekday = (parsedDate.getDay() + 6) % 7;
  const entries = data.weeklyActivities
    .filter(activity => activity.days.includes(weekday))
    .map(activity => ({
      startTime: activity.start,
      time: `${activity.start}–${activity.end}`,
      title: activity.name,
      detail: "Vaste activiteit"
    }));
  data.exams.filter(exam => exam.date === date).forEach(exam => {
    const subject = subjectById(exam.subjectId);
    entries.push({
      startTime: exam.time || "09:00",
      time: exam.time || "09:00",
      title: exam.title,
      detail: `${subject?.name || "Vak"} · Toets`
    });
  });
  data.tasks.filter(task => task.date === date).forEach(task => {
    const subject = subjectById(task.subjectId);
    entries.push({
      startTime: task.time || "99:99",
      time: formatTimeRange(task.time, task.hours),
      title: task.title,
      detail: `${subject?.name || "Geen vak"} · ${task.completed ? "Afgerond" : task.examId ? "Leermoment" : "Taak"}`
    });
  });
  entries.sort((a, b) => a.startTime.localeCompare(b.startTime));
  document.getElementById("dayScheduleList").innerHTML = entries.map(entry => `
    <article class="day-schedule-item">
      <span class="day-schedule-time">${escapeHtml(entry.time)}</span>
      <span class="day-schedule-copy">
        <strong>${escapeHtml(entry.title)}</strong>
        <span>${escapeHtml(entry.detail)}</span>
      </span>
    </article>`).join("") ||
    '<div class="day-empty-state">Er staat nog niets gepland op deze dag.</div>';
  dialog.showModal();
}

function renderWeeklyActivities() {
  const list = document.getElementById("weeklyActivityList");
  if (!list) return;
  const activities = [...weeklyScheduleDraftActivities].sort((a, b) =>
    a.days[0] - b.days[0] || a.start.localeCompare(b.start)
  );
  list.innerHTML = activities.map(activity => `
    <article class="weekly-activity-item">
      <div>
        <strong>${escapeHtml(activity.name)}</strong>
        <span>${activity.days.map(day => weekdayNames[day]).join(", ")} · ${escapeHtml(activity.start)}–${escapeHtml(activity.end)}</span>
      </div>
      <button type="button" class="task-remove" data-delete-weekly-activity="${escapeHtml(activity.id)}" aria-label="${escapeHtml(activity.name)} verwijderen">×</button>
    </article>`).join("") ||
    '<div class="empty-state">Nog geen vaste activiteiten toegevoegd.</div>';
  list.querySelectorAll("[data-delete-weekly-activity]").forEach(button => {
    button.addEventListener("click", () => {
      weeklyScheduleDraftActivities = weeklyScheduleDraftActivities.filter(activity =>
        activity.id !== button.dataset.deleteWeeklyActivity
      );
      renderWeeklyActivities();
      showToast("Afspraak verwijderd");
    });
  });
}

function renderSubjects() {
  document.getElementById("subjectGrid").innerHTML = data.subjects.map(subject => {
    const examCount = data.exams.filter(exam => exam.subjectId === subject.id).length;
    const noteCount = data.notes.filter(note => note.subjectId === subject.id).length;
    return `
      <article class="subject-card" style="--subject-color:${escapeHtml(subject.color)}">
        <span class="subject-card-bar"></span>
        <button type="button" class="subject-card-open" data-open-subject="${escapeHtml(subject.id)}" aria-label="Open vak ${escapeHtml(subject.name)}">
          <h3>${escapeHtml(subject.name)}</h3>
          <p>${examCount} ${examCount === 1 ? "toets" : "toetsen"} · ${noteCount} ${noteCount === 1 ? "aantekening" : "aantekeningen"}</p>
        </button>
        <button type="button" class="subject-card-delete" data-delete-subject="${escapeHtml(subject.id)}" title="Vak verwijderen" aria-label="Vak ${escapeHtml(subject.name)} verwijderen">×</button>
      </article>`;
  }).join("") || `<div class="empty-state subject-empty-state">Je hebt nog geen vakken. Voeg een vak toe om toetsen en taken te plannen.</div>`;

  document.querySelectorAll("[data-open-subject]").forEach(button => {
    button.addEventListener("click", () => openSubjectDetail(button.dataset.openSubject));
  });
  document.querySelectorAll("[data-delete-subject]").forEach(button => {
    button.addEventListener("click", () => {
      const subjectId = button.dataset.deleteSubject;
      const subject = subjectById(subjectId);
      const linkedCounts = {
        exams: data.exams.filter(exam => exam.subjectId === subjectId).length,
        tasks: data.tasks.filter(task => task.subjectId === subjectId).length,
        notes: data.notes.filter(note => note.subjectId === subjectId).length
      };
      const examCount = `${linkedCounts.exams} ${linkedCounts.exams === 1 ? "toets" : "toetsen"}`;
      const taskCount = `${linkedCounts.tasks} ${linkedCounts.tasks === 1 ? "taak" : "taken"}`;
      const noteCount = `${linkedCounts.notes} ${linkedCounts.notes === 1 ? "aantekening" : "aantekeningen"}`;
      if (!confirm(
        `Vak ${subject?.name || ""} verwijderen? Ook ${examCount}, ${taskCount} en ${noteCount} worden verwijderd.`
      )) return;
      data.subjects = data.subjects.filter(item => item.id !== subjectId);
      data.exams = data.exams.filter(exam => exam.subjectId !== subjectId);
      data.tasks = data.tasks.filter(task => task.subjectId !== subjectId);
      data.notes = data.notes.filter(note => note.subjectId !== subjectId);
      saveData();
    });
  });
}

let activeSubjectDetailId = null;

function openSubjectDetail(subjectId) {
  activeSubjectDetailId = subjectId;
  const subject = subjectById(subjectId);
  if (!subject) return;
  document.getElementById("subjectDetailTitle").textContent = subject.name;
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const exams = data.exams
    .filter(exam => exam.subjectId === subjectId && parseDate(exam.date) >= today)
    .sort((a, b) => a.date.localeCompare(b.date));
  document.getElementById("subjectExamList").innerHTML = exams.map(exam => `
    <button type="button" class="subject-detail-row" data-open-exam="${escapeHtml(exam.id)}">
      <span class="subject-detail-date">${parseDate(exam.date).getDate()} ${parseDate(exam.date).toLocaleDateString("nl-NL", { month: "short" }).replace(".", "")}</span>
      <span><strong>${escapeHtml(exam.title)}</strong><small>${exam.time || "09:00"} · ${exam.hours} uur</small></span>
    </button>`).join("") || `<div class="empty-state">Geen aankomende toetsen.</div>`;
  const notes = data.notes.filter(note => note.subjectId === subjectId);
  document.getElementById("subjectNoteList").innerHTML = notes.map(note => `
    <button type="button" class="subject-detail-note" data-open-note="${escapeHtml(note.id)}">
      <strong>${escapeHtml(note.title)}</strong><span>${escapeHtml(note.text || "Lege aantekening")}</span>
    </button>`).join("") || `<div class="empty-state">Nog geen aantekeningen.</div>`;
  document.querySelectorAll("#subjectExamList [data-open-exam]").forEach(button =>
    button.addEventListener("click", () => {
      document.getElementById("subjectDetailDialog").close();
      openExamDialog(button.dataset.openExam);
    })
  );
  document.querySelectorAll("#subjectNoteList [data-open-note]").forEach(button =>
    button.addEventListener("click", () => openNoteDialog(button.dataset.openNote))
  );
  document.getElementById("subjectDetailDialog").showModal();
}

function renderSettings() {
  document.getElementById("settingsProfileName").textContent = data.profileName;
  document.getElementById("settingsStudyWindow").textContent =
    `${data.studyWindow.start}–${data.studyWindow.end}`;
}

function fillSubjectSelects() {
  const options = data.subjects.map(subject => `<option value="${subject.id}">${escapeHtml(subject.name)}</option>`).join("");
  document.getElementById("examSubject").innerHTML = options ||
    '<option value="" selected disabled>Voeg eerst een vak toe bij Vakken</option>';
  document.getElementById("taskSubject").innerHTML = options ||
    '<option value="">Geen vak</option>';
  document.getElementById("noteSubject").innerHTML =
    options || '<option value="">Geen vak</option>';
  const existingNames = new Set(data.subjects.map(subject => subject.name.toLowerCase()));
  const suggestions = suggestedSubjects
    .filter(name => !existingNames.has(name.toLowerCase()))
    .map(name => `<option value="new:${escapeHtml(name)}">${escapeHtml(name)} (nieuw vak)</option>`)
    .join("");
  document.getElementById("assistantSubject").innerHTML =
    `<option value="auto">Automatisch herkennen</option>${options}${suggestions}`;
}

function openExamDialog(id = null, date = null) {
  const exam = id ? data.exams.find(item => item.id === id) : null;
  document.getElementById("examDialogTitle").textContent = exam ? "Toets bewerken" : "Nieuwe toets";
  document.getElementById("examId").value = exam?.id || "";
  document.getElementById("examTitle").value = exam?.title || "";
  document.getElementById("examDate").value = exam?.date || date || toLocalDate(new Date());
  document.getElementById("examTime").value = exam?.time || "09:00";
  document.getElementById("examHours").value = exam?.hours || 4;
  document.getElementById("examSubject").value = exam?.subjectId || data.subjects[0]?.id || "";
  document.getElementById("deleteExamButton").hidden = !exam;
  document.getElementById("examDialog").showModal();
}

function openTaskDialog(id = null, date = null) {
  const task = id ? data.tasks.find(item => item.id === id) : null;
  if (id && !task) {
    showToast("Taak niet gevonden");
    return;
  }
  document.getElementById("taskDialogTitle").textContent = task ? "Taak bewerken" : "Nieuwe taak";
  document.getElementById("taskId").value = task?.id || "";
  document.getElementById("taskTitle").value = task?.title || "";
  document.getElementById("taskSubject").value = task?.subjectId || data.subjects[0]?.id || "";
  document.getElementById("taskDate").value = task?.date || date || toLocalDate(new Date());
  document.getElementById("taskTime").value = task?.time || "16:00";
  document.getElementById("taskHours").value = task?.hours || 1;
  document.getElementById("deleteTaskButton").hidden = !task;
  document.getElementById("taskDialog").showModal();
}

function openNoteDialog(id = null) {
  const note = id ? data.notes.find(item => item.id === id) : null;
  document.getElementById("noteDialogTitle").textContent = note ? "Notitie bewerken" : "Nieuwe notitie";
  document.getElementById("noteId").value = note?.id || "";
  document.getElementById("noteSubject").value =
    note?.subjectId || activeSubjectDetailId || data.subjects[0]?.id || "";
  document.getElementById("noteTitle").value = note?.title || "";
  document.getElementById("noteText").value = note?.text || "";
  document.getElementById("deleteNoteButton").hidden = !note;
  document.getElementById("noteDialog").showModal();
}

function setView(viewName) {
  document.querySelectorAll(".nav-item").forEach(item => {
    const active = item.dataset.view === viewName;
    item.classList.toggle("active", active);
    if (active) item.setAttribute("aria-current", "page");
    else item.removeAttribute("aria-current");
  });
  document.querySelectorAll(".view").forEach(view => view.classList.remove("active"));
  document.getElementById(`${viewName}View`).classList.add("active");
  const titles = { dashboard: "Overzicht", calendar: "Agenda", subjects: "Vakken", settings: "Instellingen" };
  document.getElementById("pageTitle").textContent = titles[viewName];
  const hideCreationActions = viewName === "calendar" || viewName === "settings";
  document.getElementById("assistantButton").hidden = hideCreationActions;
  document.getElementById("addExamButton").hidden = hideCreationActions;
  document.getElementById("shareButton").hidden = viewName === "settings";
}

document.querySelectorAll(".nav-item").forEach(item => item.addEventListener("click", () => setView(item.dataset.view)));
document.querySelectorAll("[data-go]").forEach(button => button.addEventListener("click", () => setView(button.dataset.go)));

document.getElementById("todayLabel").textContent = new Intl.DateTimeFormat("nl-NL", { weekday: "long", day: "numeric", month: "long" }).format(new Date());
document.getElementById("addExamButton").addEventListener("click", () => openExamDialog());
document.getElementById("addTaskButton").addEventListener("click", () => {
  openTaskDialog(null, toLocalDate(dashboardDate));
});
document.getElementById("addSubjectButton").addEventListener("click", () => {
  document.getElementById("subjectName").value = "";
  document.getElementById("subjectDialog").showModal();
});
document.getElementById("examForm").addEventListener("submit", event => {
  event.preventDefault();
  const title = readRequiredText("examTitle", "Vul een onderwerp in.");
  if (title === null) return;
  const id = document.getElementById("examId").value;
  const exam = {
    id: id || uid("exam"),
    subjectId: document.getElementById("examSubject").value,
    title,
    date: document.getElementById("examDate").value,
    time: document.getElementById("examTime").value,
    hours: Number(document.getElementById("examHours").value)
  };
  if (id) data.exams = data.exams.map(item => item.id === id ? exam : item);
  else data.exams.push(exam);
  document.getElementById("examDialog").close();
  saveData();
  showToast("Toets opgeslagen");
});

document.getElementById("deleteExamButton").addEventListener("click", () => {
  const id = document.getElementById("examId").value;
  const linkedTaskCount = data.tasks.filter(task => task.examId === id).length;
  const linkedTasksText = linkedTaskCount
    ? ` De ${linkedTaskCount} bijbehorende ${linkedTaskCount === 1 ? "leermoment wordt" : "leermomenten worden"} ook verwijderd.`
    : "";
  if (!confirm(`Deze toets verwijderen?${linkedTasksText}`)) return;
  data.exams = data.exams.filter(exam => exam.id !== id);
  data.tasks = data.tasks.filter(task => task.examId !== id);
  document.getElementById("examDialog").close();
  saveData();
  showToast("Toets verwijderd");
});

document.getElementById("taskForm").addEventListener("submit", event => {
  event.preventDefault();
  const title = readRequiredText("taskTitle", "Vul een taak in.");
  if (title === null) return;
  const id = document.getElementById("taskId").value;
  const updates = {
    title,
    subjectId: document.getElementById("taskSubject").value,
    date: document.getElementById("taskDate").value,
    time: document.getElementById("taskTime").value,
    hours: Number(document.getElementById("taskHours").value)
  };
  if (id) {
    data.tasks = data.tasks.map(task => task.id === id ? { ...task, ...updates } : task);
  } else {
    data.tasks.push({ id: uid("task"), ...updates, completed: false });
  }
  document.getElementById("taskDialog").close();
  saveData();
  showToast(id ? "Taak bijgewerkt" : "Taak toegevoegd");
});

const subjectNameInput = document.getElementById("subjectName");
subjectNameInput.addEventListener("input", () => subjectNameInput.setCustomValidity(""));

document.getElementById("deleteTaskButton").addEventListener("click", () => {
  const id = document.getElementById("taskId").value;
  data.tasks = data.tasks.filter(task => task.id !== id);
  document.getElementById("taskDialog").close();
  saveData();
  showToast("Taak verwijderd");
});

document.getElementById("subjectForm").addEventListener("submit", event => {
  event.preventDefault();
  const name = readRequiredText("subjectName", "Vul een vaknaam in.");
  if (name === null) return;
  if (data.subjects.some(subject => subject.name.trim().toLowerCase() === name.toLowerCase())) {
    subjectNameInput.setCustomValidity("Dit vak bestaat al.");
    subjectNameInput.reportValidity();
    subjectNameInput.focus();
    return;
  }
  data.subjects.push({ id: uid("subject"), name, color: selectedSubjectColor });
  document.getElementById("subjectDialog").close();
  saveData();
  showToast("Vak toegevoegd");
});

document.querySelectorAll(".color-option").forEach(button => {
  button.addEventListener("click", () => {
    document.querySelectorAll(".color-option").forEach(option => {
      option.classList.remove("selected");
      option.setAttribute("aria-pressed", "false");
    });
    button.classList.add("selected");
    button.setAttribute("aria-pressed", "true");
    selectedSubjectColor = button.dataset.color;
  });
});

document.getElementById("noteForm").addEventListener("submit", event => {
  event.preventDefault();
  const title = readRequiredText("noteTitle", "Vul een titel in.");
  if (title === null) return;
  const id = document.getElementById("noteId").value;
  const note = {
    id: id || uid("note"),
    subjectId: document.getElementById("noteSubject").value || null,
    title,
    text: document.getElementById("noteText").value.trim()
  };
  if (id) data.notes = data.notes.map(item => item.id === id ? note : item);
  else data.notes.push(note);
  document.getElementById("noteDialog").close();
  saveData();
  if (document.getElementById("subjectDetailDialog").open) {
    openSubjectDetail(activeSubjectDetailId);
  }
  showToast("Notitie opgeslagen");
});

document.getElementById("deleteNoteButton").addEventListener("click", () => {
  const id = document.getElementById("noteId").value;
  data.notes = data.notes.filter(note => note.id !== id);
  document.getElementById("noteDialog").close();
  saveData();
  if (document.getElementById("subjectDetailDialog").open) {
    openSubjectDetail(activeSubjectDetailId);
  }
  showToast("Notitie verwijderd");
});

document.getElementById("profileButton").addEventListener("click", () => {
  document.getElementById("profileNameInput").value = data.profileName;
  document.getElementById("profileDialog").showModal();
});

document.getElementById("openProfileSettingsButton").addEventListener("click", () => {
  document.getElementById("profileNameInput").value = data.profileName;
  document.getElementById("profileDialog").showModal();
});
document.getElementById("openScheduleSettingsButton").addEventListener("click", openWeeklyScheduleDialog);
document.getElementById("openStudyWindowSettingsButton").addEventListener("click", () => {
  openWeeklyScheduleDialog();
  setWeeklyScheduleStep(3);
});
document.getElementById("subjectAddExamButton").addEventListener("click", () => {
  document.getElementById("subjectDetailDialog").close();
  openExamDialog();
  document.getElementById("examSubject").value = activeSubjectDetailId;
});
document.getElementById("subjectAddNoteButton").addEventListener("click", () => {
  openNoteDialog();
});

function updateSchoolDayDuration(day) {
  const checkbox = document.querySelector(`[data-school-day="${day}"]`);
  const output = document.querySelector(`[data-school-duration="${day}"]`);
  if (!checkbox?.checked) return;
  const startInput = document.querySelector(`[data-school-start="${day}"]`);
  const endInput = document.querySelector(`[data-school-end="${day}"]`);
  const start = clockToMinutes(startInput.value);
  const end = clockToMinutes(endInput.value);
  output.textContent = start !== null && end !== null && end > start
    ? `School duurt ${formatDuration(end - start)}`
    : "Gebruik 24-uursnotatie en controleer de eindtijd";
}

function renderSchoolScheduleQuestions() {
  const schoolByDay = new Map();
  data.weeklyActivities
    .filter(activity => activity.name.trim().toLowerCase() === "school")
    .forEach(activity => activity.days.forEach(day => {
      schoolByDay.set(day, activity);
    }));
  const container = document.getElementById("schoolScheduleQuestions");
  container.innerHTML = weekdayFullNames.map((name, day) => {
    const activity = schoolByDay.get(day);
    return `
      <article class="school-day-question">
        <label class="school-day-toggle">
          <input type="checkbox" data-school-day="${day}" ${activity ? "checked" : ""} />
          <span>${name}</span>
        </label>
        <div class="school-day-times" data-school-times="${day}" ${activity ? "" : "hidden"}>
          <label>Begint om <input type="text" class="time-24-input" data-school-start="${day}" value="${activity?.start || "08:30"}" inputmode="numeric" pattern="(?:[01][0-9]|2[0-3]):[0-5][0-9]" maxlength="5" placeholder="08:30" /></label>
          <label>Eindigt om <input type="text" class="time-24-input" data-school-end="${day}" value="${activity?.end || "15:00"}" inputmode="numeric" pattern="(?:[01][0-9]|2[0-3]):[0-5][0-9]" maxlength="5" placeholder="15:00" /></label>
          <span class="school-day-duration" data-school-duration="${day}" aria-live="polite"></span>
        </div>
      </article>`;
  }).join("");
  container.querySelectorAll("[data-school-day]").forEach(input => {
    input.addEventListener("change", () => {
      const times = container.querySelector(`[data-school-times="${input.dataset.schoolDay}"]`);
      times.hidden = !input.checked;
      updateSchoolDayDuration(input.dataset.schoolDay);
    });
  });
  container.querySelectorAll("[data-school-start], [data-school-end]").forEach(input => {
    input.addEventListener("input", () => updateSchoolDayDuration(input.dataset.schoolStart || input.dataset.schoolEnd));
  });
  weekdayFullNames.forEach((_, day) => updateSchoolDayDuration(day));
}

function formatDuration(minutes) {
  const hours = Math.floor(minutes / 60);
  const remainingMinutes = minutes % 60;
  return [
    hours ? `${hours} uur` : "",
    remainingMinutes ? `${remainingMinutes} minuten` : ""
  ].filter(Boolean).join(" ");
}

function openWeeklyScheduleDialog() {
  const profileDialog = document.getElementById("profileDialog");
  if (profileDialog.open) profileDialog.close();
  weeklyScheduleDraftActivities = data.weeklyActivities
    .filter(activity => activity.name.trim().toLowerCase() !== "school")
    .map(activity => ({ ...activity, days: [...activity.days] }));
  renderSchoolScheduleQuestions();
  document.getElementById("studyWindowStart").value = data.studyWindow.start;
  document.getElementById("studyWindowEnd").value = data.studyWindow.end;
  document.getElementById("weeklyActivityName").value = "";
  document.querySelectorAll('input[name="weeklyActivityDay"]').forEach(input => {
    input.checked = false;
  });
  document.getElementById("weeklyActivityStart").value = "16:00";
  document.getElementById("weeklyActivityEnd").value = "18:00";
  setWeeklyScheduleStep(1);
  renderWeeklyActivities();
  document.getElementById("weeklyScheduleDialog").showModal();
}

let onboardingStep = 1;

function renderOnboardingSchoolDays() {
  const container = document.getElementById("onboardingSchoolList");
  const existingSchool = new Map();
  data.weeklyActivities
    .filter(activity => activity.name.trim().toLowerCase() === "school")
    .forEach(activity => activity.days.forEach(day => existingSchool.set(day, activity)));
  container.innerHTML = weekdayFullNames.map((name, day) => {
    const activity = existingSchool.get(day);
    return `
      <article class="onboarding-school-day">
        <label>
          <input type="checkbox" data-onboarding-school-day="${day}" ${activity ? "checked" : day < 5 ? "checked" : ""} />
          <span>${name}</span>
        </label>
        <div class="onboarding-school-times">
          <label>Vanaf
            <input type="text" class="time-24-input" data-onboarding-school-start="${day}" value="${activity?.start || "08:30"}" inputmode="numeric" maxlength="5" placeholder="08:30" />
          </label>
          <label>Tot
            <input type="text" class="time-24-input" data-onboarding-school-end="${day}" value="${activity?.end || "15:30"}" inputmode="numeric" maxlength="5" placeholder="15:30" />
          </label>
        </div>
      </article>`;
  }).join("");
}

function setOnboardingStep(step) {
  onboardingStep = step;
  document.querySelectorAll("[data-onboarding-step]").forEach(section => {
    section.hidden = Number(section.dataset.onboardingStep) !== step;
  });
  document.getElementById("onboardingProgressBar").style.width = `${step / 3 * 100}%`;
  document.getElementById("onboardingBack").hidden = step === 1;
  document.getElementById("onboardingNext").textContent =
    step === 1 ? "Naar mijn rooster" : step === 2 ? "Wakkertijden kiezen" : "Start ToetsPlan";
}

function getOnboardingSchoolActivities() {
  const grouped = new Map();
  const selectedDays = [...document.querySelectorAll("[data-onboarding-school-day]:checked")];
  if (!selectedDays.length) {
    showToast("Selecteer minimaal één schooldag");
    return null;
  }
  for (const checkbox of selectedDays) {
    const day = Number(checkbox.dataset.onboardingSchoolDay);
    const start = document.querySelector(`[data-onboarding-school-start="${day}"]`).value;
    const end = document.querySelector(`[data-onboarding-school-end="${day}"]`).value;
    if (!isValid24HourTime(start) || !isValid24HourTime(end) || start >= end) {
      showToast(`Vul geldige schooltijden in voor ${weekdayFullNames[day]}`);
      return null;
    }
    const key = `${start}-${end}`;
    if (!grouped.has(key)) grouped.set(key, { id: uid("activity"), name: "School", days: [], start, end });
    grouped.get(key).days.push(day);
  }
  return [...grouped.values()];
}

function getAwakeWindow(startInput, endInput) {
  const start = startInput.value;
  const end = endInput.value;
  if (!isValid24HourTime(start) || !isValid24HourTime(end) || start >= end) {
    showToast("Vul een geldige opsta- en bedtijd in; de bedtijd moet later zijn dan de opstaantijd");
    const invalidStart = !isValid24HourTime(start) ||
      (isValid24HourTime(end) && start >= end);
    const invalidInput = invalidStart ? startInput : endInput;
    invalidInput.focus();
    return null;
  }
  return { start, end };
}

let onboardingSchoolActivities = null;

function openOnboarding() {
  if (data.onboardingCompleted) return;
  document.getElementById("onboardingName").value =
    data.profileName === "Jouw profiel" ? "" : data.profileName;
  document.getElementById("onboardingStudyStart").value = data.studyWindow.start;
  document.getElementById("onboardingStudyEnd").value = data.studyWindow.end;
  onboardingSchoolActivities = null;
  setOnboardingStep(1);
  renderOnboardingSchoolDays();
  document.getElementById("onboardingDialog").showModal();
}

document.getElementById("onboardingBack").addEventListener("click", () => {
  if (onboardingStep === 3) onboardingSchoolActivities = null;
  setOnboardingStep(Math.max(1, onboardingStep - 1));
});

document.getElementById("onboardingNext").addEventListener("click", () => {
  if (onboardingStep === 1) {
    const name = document.getElementById("onboardingName").value.trim();
    if (name) data.profileName = name;
    setOnboardingStep(2);
    return;
  }
  if (onboardingStep === 2) {
    onboardingSchoolActivities = getOnboardingSchoolActivities();
    if (onboardingSchoolActivities === null) return;
    setOnboardingStep(3);
    return;
  }
  if (onboardingSchoolActivities === null) {
    setOnboardingStep(2);
    showToast("Controleer eerst je schooldagen en schooltijden");
    return;
  }
  const awakeWindow = getAwakeWindow(
    document.getElementById("onboardingStudyStart"),
    document.getElementById("onboardingStudyEnd")
  );
  if (!awakeWindow) return;
  const otherActivities = data.weeklyActivities.filter(activity =>
    activity.name.trim().toLowerCase() !== "school"
  );
  data.weeklyActivities = [...onboardingSchoolActivities, ...otherActivities];
  data.studyWindow = awakeWindow;
  data.onboardingCompleted = true;
  document.getElementById("onboardingDialog").close();
  const rescheduleResult = rescheduleStudyTasks();
  saveData();
  showToast(rescheduleResult.unplacedCount
    ? `Je rooster is ingesteld. ${rescheduleResult.unplacedCount} leermoment(en) passen niet meer in je beschikbare tijd`
    : rescheduleResult.movedCount
      ? `Je rooster is ingesteld; ${rescheduleResult.movedCount} leermoment(en) verplaatst`
      : "Je rooster is ingesteld");
});

document.getElementById("onboardingDialog").addEventListener("cancel", event => {
  event.preventDefault();
});

function setWeeklyScheduleStep(step) {
  document.querySelectorAll(".weekly-step").forEach((section, index) => {
    section.hidden = index + 1 !== step;
  });
  document.getElementById("weeklyStepLabel").textContent = `Stap ${step} van 3`;
}

function getSchoolActivitiesFromForm() {
  const grouped = new Map();
  const days = [...document.querySelectorAll("[data-school-day]:checked")];
  for (const checkbox of days) {
    const day = Number(checkbox.dataset.schoolDay);
    const start = document.querySelector(`[data-school-start="${day}"]`).value;
    const end = document.querySelector(`[data-school-end="${day}"]`).value;
    if (!isValid24HourTime(start) || !isValid24HourTime(end) || start >= end) {
      showToast(`Vul geldige 24-uurs schooltijden in voor ${weekdayFullNames[day]}`);
      document.querySelector(`[data-school-start="${day}"]`).focus();
      return null;
    }
    const key = `${start}-${end}`;
    if (!grouped.has(key)) grouped.set(key, { id: uid("activity"), name: "School", days: [], start, end });
    grouped.get(key).days.push(day);
  }
  return [...grouped.values()];
}

document.getElementById("manageWeeklyScheduleCalendarButton").addEventListener("click", openWeeklyScheduleDialog);
document.getElementById("addTaskCalendarButton").addEventListener("click", () => {
  openTaskDialog(null, toLocalDate(calendarDate));
});
document.getElementById("profileForm").addEventListener("submit", event => {
  event.preventDefault();
  const name = readRequiredText("profileNameInput", "Vul je naam in.");
  if (name === null) return;
  data.profileName = name;
  document.getElementById("profileDialog").close();
  saveData();
});
document.getElementById("weeklyNextToActivities").addEventListener("click", () => {
  if (getSchoolActivitiesFromForm() === null) return;
  setWeeklyScheduleStep(2);
});
document.getElementById("weeklyBackToSchool").addEventListener("click", () => setWeeklyScheduleStep(1));
document.getElementById("weeklyNextToStudyWindow").addEventListener("click", () => setWeeklyScheduleStep(3));
document.getElementById("weeklyBackToActivities").addEventListener("click", () => setWeeklyScheduleStep(2));
document.getElementById("addWeeklyActivityButton").addEventListener("click", () => {
  const name = readRequiredText("weeklyActivityName", "Vul een afspraak in.");
  if (name === null) return;
  const days = [...document.querySelectorAll('input[name="weeklyActivityDay"]:checked')]
    .map(input => Number(input.value))
    .sort((a, b) => a - b);
  if (!days.length) {
    showToast("Kies ten minste één dag");
    document.querySelector('input[name="weeklyActivityDay"]').focus();
    return;
  }
  const start = document.getElementById("weeklyActivityStart").value;
  const end = document.getElementById("weeklyActivityEnd").value;
  if (!isValid24HourTime(start) || !isValid24HourTime(end) || start >= end) {
    showToast("Vul geldige tijden in 24-uursnotatie in");
    return;
  }
  weeklyScheduleDraftActivities.push({ id: uid("activity"), name, days, start, end });
  document.getElementById("weeklyActivityName").value = "";
  document.querySelectorAll('input[name="weeklyActivityDay"]').forEach(input => {
    input.checked = false;
  });
  renderWeeklyActivities();
});
document.getElementById("saveWeeklyScheduleButton").addEventListener("click", () => {
  const awakeWindow = getAwakeWindow(
    document.getElementById("studyWindowStart"),
    document.getElementById("studyWindowEnd")
  );
  if (!awakeWindow) return;
  const schoolActivities = getSchoolActivitiesFromForm();
  if (schoolActivities === null) return;
  data.weeklyActivities = [...schoolActivities, ...weeklyScheduleDraftActivities];
  data.studyWindow = awakeWindow;
  document.getElementById("weeklyScheduleDialog").close();
  const rescheduleResult = rescheduleStudyTasks();
  saveData();
  if (rescheduleResult.unplacedCount) {
    showToast(`Rooster opgeslagen. ${rescheduleResult.unplacedCount} leermoment(en) passen niet meer in je beschikbare tijd`);
  } else if (rescheduleResult.movedCount) {
    showToast(`Rooster opgeslagen; ${rescheduleResult.movedCount} leermoment(en) aangepast`);
  } else {
    showToast("Weekrooster opgeslagen");
  }
});

document.getElementById("prevMonth").addEventListener("click", () => {
  calendarDate.setDate(calendarDate.getDate() - 7);
  renderCalendar();
});
document.getElementById("nextMonth").addEventListener("click", () => {
  calendarDate.setDate(calendarDate.getDate() + 7);
  renderCalendar();
});
document.getElementById("todayButton").addEventListener("click", () => {
  calendarDate = new Date();
  renderCalendar();
});
document.getElementById("dashboardPrevDay").addEventListener("click", () => {
  dashboardDate.setDate(dashboardDate.getDate() - 1);
  renderDashboard();
});
document.getElementById("dashboardNextDay").addEventListener("click", () => {
  dashboardDate.setDate(dashboardDate.getDate() + 1);
  renderDashboard();
});
document.getElementById("dashboardTodayButton").addEventListener("click", () => {
  dashboardDate = new Date();
  renderDashboard();
});

document.getElementById("dayAddTaskButton").addEventListener("click", () => {
  const dialog = document.getElementById("dayDialog");
  const date = dialog.dataset.date;
  dialog.close();
  openTaskDialog(null, date);
});

document.querySelectorAll(".cancel-dialog, .close-dialog").forEach(button => {
  button.addEventListener("click", () => {
    const dialog = document.getElementById(button.dataset.dialog);
    if (dialog?.open) dialog.close();
  });
});

document.getElementById("shareButton").addEventListener("click", () => document.getElementById("shareDialog").showModal());

document.getElementById("copyButton").addEventListener("click", async () => {
  const payload = JSON.stringify(data, null, 2);
  try {
    await navigator.clipboard.writeText(payload);
    showToast("Planning gekopieerd");
  } catch {
    showToast("Klembord niet beschikbaar");
  }
});

document.getElementById("exportButton").addEventListener("click", () => {
  const blob = new Blob([JSON.stringify(data, null, 2)], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = "toetsplan-export.json";
  link.click();
  URL.revokeObjectURL(url);
  showToast("Planning geëxporteerd");
});

function parseAssistantRequest(prompt) {
  prompt = normalizeRelativeDateText(prompt);
  const text = prompt.toLowerCase();
  let difficulty = 2;
  if (/heel (erg )?moeilijk|zeer moeilijk|extreem moeilijk/.test(text)) difficulty = 4;
  else if (/moeilijk|uitdagend|zwaar/.test(text)) difficulty = 3;
  else if (/makkelijk|simpel|goed te doen/.test(text)) difficulty = 1;

  const explicitSubject = data.subjects.find(item => text.includes(item.name.toLowerCase()));
  const subjectCategories = [
    { name: "Nederlands", keywords: /\b(nederlands|zelfstandig(e)? naamwoord(en)?|lidwoord(en)?|werkwoord(en)?|bijvoeglijk(e)? naamwoord(en)?|bijvoegelijk(e)? naamwoord(en)?|bijwoord(en)?|voornaamwoord(en)?|voorzetsel(s)?|voegwoord(en)?|zinsontleding|onderwerp en gezegde|lijdend voorwerp|meewerkend voorwerp|persoonsvorm|spelling|leesteken(s)?|dictee|woordsoort(en)?)\b/i },
    { name: "Maatschappijleer", keywords: /\b(maatschappijleer|trias politica|grondwet|rechtsstaat|democratie|verkiezingen|parlement|politieke partij(en)?|mensenrechten|grondrechten|criminaliteit|mediawijsheid)\b/i },
    { name: "Geschiedenis", keywords: /\b(geschiedenis|geschied|hitler|nazisme|nazi'?s|holocaust|tweede wereldoorlog|eerste wereldoorlog|wereldoorlog(en)?|koude oorlog|romeinen|romeinse rijk|middeleeuwen|renaissance|reformatie|kolonialisme|industriele revolutie|industriële revolutie|franse revolutie|napoleon|monarchie|dictatuur|slavernij|prehistorie)\b/i },
    { name: "Wiskunde", keywords: /\b(wiskunde|wisk|rekenen|algebra|meetkunde|statistiek|breuken|procent(en)?|verhouding(en)?|vergelijking(en)?|kwadratische formule|formule(s)?|grafiek(en)?|functie(s)?|coordinaten|coördinaten|wortel(s)?|machten|pytagoras|pythagoras|sinus|cosinus|tangens|kansberekening|differentieren|integreren)\b/i },
    { name: "Aardrijkskunde", keywords: /\b(aardrijkskunde|topografie|werelddeel(en)?|continent(en)?|hoofdstad(en)?|kaartvaardigheid|klimaat(zone|verandering)?|landschap(pen)?|bevolking(sgroei)?|migratie|globalisering|plaattektoniek|aardplaten|subductie|convergentie|divergentie|meanderen|meandering|erosie|sedimentatie|vulkanen|rivieren|delta|verstedelijking|grondstoffen|landbouw|wereldeconomie)\b/i },
    { name: "Biologie", keywords: /\b(biologie|cel(len)?|celkern|dna|genen|erfelijkheid|evolutie|natuurlijke selectie|fotosynthese|verbranding|ecosysteem(en)?|voedselketen|voedselweb|orgaan(stelsel)?|spijsvertering|bloedsomloop|ademhaling|zenuwstelsel|hormonen|voortplanting|plantencel|dierlijke cel|bacterien|bacteriën|schimmels|biodiversiteit)\b/i },
    { name: "Natuurkunde", keywords: /\b(natuurkunde|kracht(en)?|snelheid|versnelling|beweging|newton|arbeid|vermogen|energiebehoud|energieomzetting|energievormen|kinetische energie|potentiële energie|potentiele energie|elektriciteit|elektrische stroom|spanning|weerstand|schakeling(en)?|magnetisme|golven|geluid|lichtbreking|optica|warmte|druk|dichtheid)\b/i },
    { name: "Scheikunde", keywords: /\b(scheikunde|atoom(massa)?|atomen|molecuul|moleculen|periodiek systeem|element(en)?|verbinding(en)?|chemische reactie(s)?|reactievergelijking(en)?|zuren|basen|ph-waarde|ion(en)?|binding(en)?|oxidatie|verbranding(sreactie)?|stoffen scheiden|mengsel(s)?|oplossing(en)?)\b/i },
    { name: "Economie", keywords: /\b(economie|vraag en aanbod|schaarste|inflatie|bbp|bruto binnenlands product|inkomen|belasting(en)?|markt(en)?|winst|verlies|kosten|omzet|conjunctuur|rente|sparen|lenen|begroting|consument|producent|werkloosheid)\b/i },
    { name: "Engels", keywords: /\b(engels|english|present simple|present continuous|past simple|past continuous|present perfect|past perfect|irregular verbs|phrasal verbs|passive voice|reported speech|conditionals|vocabulary|reading comprehension|writing skills|shakespeare|great gatsby|english literature)\b/i },
    { name: "Frans", keywords: /\b(frans|français|francais|être|etre|avoir|passé composé|passe compose|imparfait|futur proche|pronoms|conjugaison|vocabulaire)\b/i },
    { name: "Duits", keywords: /\b(duits|deutsch|der die das|akkusativ|dativ|nominativ|perfekt|präteritum|prateritum|trennbare verben|wortschatz)\b/i },
    { name: "Spaans", keywords: /\b(spaans|español|espanol|ser y estar|pretérito|preterito|indefinido|subjuntivo|vocabulario|conjugación|conjugacion)\b/i },
    { name: "Latijn", keywords: /\b(latijn|latin|naamvallen|declinatie(s)?|coniugatie(s)?|ablativus|accusativus|genitivus|dativus|nominativus|caesar|vergilius|cicero)\b/i },
    { name: "Grieks", keywords: /\b(grieks|oudgrieks|griekse alfabet|griekse mythologie|herodotus|homerus)\b/i },
    { name: "Informatica", keywords: /\b(informatica|programmeren|python|javascript|algoritme(s)?|database(s)?|html|css|netwerk(en)?|cybersecurity|binaire getallen|variabele(n)?|lus(sen)?|if statement)\b/i },
    { name: "Techniek", keywords: /\b(techniek|technologie|constructie(s)?|ontwerpen|materialen|machines|mechanica|technisch tekenen)\b/i },
    { name: "Muziek", keywords: /\b(muziek|notenleer|ritme(s)?|akkoorden|toonladder(s)?|maatsoort(en)?|muziekgeschiedenis|instrument(en)?)\b/i },
    { name: "Beeldende vorming", keywords: /\b(beeldende vorming|kunstgeschiedenis|perspectieftekenen|kleurencirkel|compositie|beeldaspect(en)?|schilderkunst|kunststroming(en)?)\b/i },
    { name: "Drama", keywords: /\b(drama|theater|toneel|acteren|scenografie|improvisatie)\b/i },
    { name: "Lichamelijke opvoeding", keywords: /\b(lichamelijke opvoeding|gymnastiek|sportregels|conditietraining|bewegingsleer)\b/i },
    { name: "Filosofie", keywords: /\b(filosofie|ethiek|kennisleer|metafysica|filosoof|filosofen|moreel dilemma)\b/i },
    { name: "Burgerschap", keywords: /\b(burgerschap|participatie|solidariteit|inclusie|demonstratierecht|maatschappelijke betrokkenheid)\b/i },
    { name: "CKV", keywords: /\b(ckv|culturele kunstzinnige vorming|kunst en cultuur|culturele activiteiten)\b/i },
    { name: "Bedrijfseconomie", keywords: /\b(bedrijfseconomie|balanspost(en)?|deb(et|it) en credit|activa en passiva|boekhouding|break-even|cashflow|resultatenrekening)\b/i },
    { name: "Levensbeschouwing", keywords: /\b(levensbeschouwing|godsdienst|religie|christendom|islam|jodendom|boeddhisme|hindoeisme|hindoeïsme|heilige boeken)\b/i }
  ];
  const recognizedCategory = subjectCategories.find(category => category.keywords.test(text));
  const categorySubject = recognizedCategory
    ? data.subjects.find(item =>
      item.name.toLowerCase() === recognizedCategory.name.toLowerCase() ||
      item.name.toLowerCase().includes(recognizedCategory.name.toLowerCase())
    )
    : null;
  const subject = explicitSubject || categorySubject;
  const subjectName = explicitSubject?.name || categorySubject?.name ||
    recognizedCategory?.name || subject?.name;

  let title = "Nieuwe toets";
  const topicSectionMatch = prompt.match(/(?:gaat\s+(?:over|voor)|toets\s+(?:gaat\s+)?over|onderwerpen?(?:\s+(?:zijn onder meer|bestaan uit|zijn))?|topics?|leerstof(?:\s+is)?|toetsstof|ik\s+(?:moet|wil)\s+(?:leren|kennen|beheersen|weten)|ik\s+heb\s+te\s+leren|over)\b\s*[:\-]?\s*([\s\S]+)/i);
  let topicSection = topicSectionMatch
    ? topicSectionMatch[1].replace(/[^\S\r\n]+/g, " ").trim()
    : "";

  topicSection = topicSection
    .replace(/^(?:zijn(?:\s+onder\s+meer)?|bestaan\s+uit)\s*[:\-]?\s*/i, "")
    .replace(/\bplan(?:neer)?\s+(?:dan|dit|de|mijn|voor|op)\b.*$/i, "")
    .replace(/\b(?:hij|het|die|deze)?\s*(?:is|gaat)\s+(?:heel |zeer |erg )?(?:makkelijk|gemiddeld|moeilijk|uitdagend|zwaar)\b.*$/i, "")
    .replace(/(?:,\s*|\s+)(?:heel\s+|zeer\s+|erg\s+)?(?:makkelijk|gemiddeld|moeilijk|uitdagend|zwaar)\s*$/i, "")
    .replace(/[.!]+$/, "")
    .trim();
  topicSection = stripTrailingDateDetails(topicSection);

  if (!topicSection) {
    const chapters = [];
    topicSection = prompt
      .replace(/\b(?:hoofdstuk(?:ken)?\s+\d+(?:\.\d+)?|h\d+(?:\.\d+)?)/gi, chapter => {
        const token = `CHAPTERTOKEN${chapters.length}TOKEN`;
        chapters.push(chapter);
        return token;
      })
      .replace(/\b(mijn|een|de|het|toets|tentamen|vak|gaat|over|voor|op|is|makkelijk|gemiddeld|moeilijk|heel|zeer|uitdagend|zwaar|ja|plan|dan|ook|in|alsjeblieft|hij|morgen)\b/gi, " ")
      .replace(/\b\d{1,2}(?:\s+(?:januari|februari|maart|april|mei|juni|juli|augustus|september|oktober|november|december))?(?:\s+\d{4})?\b/gi, " ")
      .replace(/\s+/g, " ")
      .replace(/CHAPTERTOKEN(\d+)TOKEN/g, (_, index) => chapters[Number(index)])
      .replace(/^[,;.\s]+|[,;.\s]+$/g, "")
      .trim();
  }

  if (subjectName) {
    const escapedSubjectName = subjectName.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    topicSection = topicSection
      .replace(new RegExp(`^${escapedSubjectName}\\s*[,;:-]?\\s*`, "i"), "")
      .trim();
  }

  const normalizedTopicSection = topicSection.replace(
    /\b([a-zà-ÿ]+en)\s+([a-zà-ÿ]+en)(?=\s+(?:en|,|;|&|\/))/gi,
    "$1, $2"
  );
  let topicSectionForSplitting = normalizedTopicSection;
  assistantCompoundTopics.forEach((phrase, index) => {
    topicSectionForSplitting = topicSectionForSplitting.replace(
      new RegExp(`\\b${phrase.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\b`, "gi"),
      `#${index}#`
    );
  });
  const topics = normalizedTopicSection
    ? topicSectionForSplitting
      .replace(/(^|\n)\s*(?:[-*•]|\d+[.)])\s*/g, "$1")
      .split(/\s*(?:,|;|&|\n|•|\ben\b|\band\b|\bplus\b|\/)\s*/i)
      .map(topic => {
        const restoredTopic = topic.replace(/#(\d+)#/g, (_, index) => assistantCompoundTopics[Number(index)]);
        return cleanAssistantTopic(restoredTopic.replace(/\b(?:en|plus)\b$/i, ""), topicSection);
      })
      .filter(topic => topic.length >= 2)
      .filter((topic, index, list) => list.findIndex(item => item.toLowerCase() === topic.toLowerCase()) === index)
    : [];

  if (topics.length) title = topics.join(", ");
  else {
    const titleMatch = prompt.match(/(?:toets|tentamen)\s+(?:voor|over)?\s*(.+?)(?:,|\.|$)/i);
    if (titleMatch) title = titleMatch[1].replace(/\b(op|is|is op)\b.*$/i, "").trim();
  }
  if (!title || title.length < 3) title = "Nieuwe toets";

  return { difficulty, subject, subjectName, title, topics };
}

document.getElementById("assistantButton").addEventListener("click", () => {
  document.getElementById("assistantPrompt").value = "";
  document.getElementById("assistantDate").value = dateOffsetFromToday(7);
  delete document.getElementById("assistantDate").dataset.autoFilled;
  delete document.getElementById("assistantDate").dataset.userEdited;
  document.getElementById("assistantSubject").value = "auto";
  updateAssistantPreview();
  document.getElementById("assistantDialog").showModal();
});

function updateAssistantDateFromPrompt(prompt) {
  const dateInput = document.getElementById("assistantDate");
  const extractedDate = extractExamDate(prompt);
  if (extractedDate) {
    if (dateInput.dataset.userEdited !== "true") {
      dateInput.value = extractedDate;
      dateInput.dataset.autoFilled = extractedDate;
    }
  } else {
    if (dateInput.dataset.autoFilled === dateInput.value) {
      dateInput.value = dateOffsetFromToday(7);
    }
    delete dateInput.dataset.autoFilled;
  }
}

function updateAssistantPreview() {
  const prompt = document.getElementById("assistantPrompt").value.trim();
  const parsed = prompt ? parseAssistantRequest(prompt) : { topics: [], subjectName: null };
  const selectedSubject = data.subjects.find(item =>
    item.id === document.getElementById("assistantSubject").value
  );
  const manualValue = document.getElementById("assistantSubject").value;
  const newSubjectName = manualValue.startsWith("new:") ? manualValue.slice(4) : "";
  const subjectName = selectedSubject?.name || newSubjectName || parsed.subjectName || (prompt ? "Niet herkend" : "—");
  const difficulty = Number(document.getElementById("assistantDifficulty").value);
  const difficultyNames = { 1: "Makkelijk", 2: "Gemiddeld", 3: "Moeilijk", 4: "Heel moeilijk" };
  const topicsContent = parsed.topics.length
    ? parsed.topics.map(topic => `<li class="ai-topic-chip">${escapeHtml(topic)}</li>`).join("")
    : `<li class="ai-topic-empty">${prompt ? "Geen onderwerpen herkend — controleer je beschrijving." : "Vul je beschrijving in om onderwerpen te zien."}</li>`;
  document.getElementById("aiPreview").innerHTML =
    `<div class="ai-preview-heading">
      <span class="ai-preview-icon">✦</span>
      <div class="ai-preview-heading-copy"><strong>Planningsvoorstel</strong><span>AI kiest de dagen en tijden.</span></div>
    </div>
    <div class="ai-preview-meta">
      <div class="ai-preview-detail"><span>Vak</span><strong>${escapeHtml(subjectName)}</strong></div>
      <div class="ai-preview-detail"><span>Moeilijkheid</span><strong>${difficultyNames[difficulty]} · ${difficulty}/4</strong></div>
    </div>
    <section class="ai-preview-section">
      <div class="ai-preview-section-heading"><strong>Onderwerpen</strong><span>${parsed.topics.length} herkend</span></div>
      <ul class="ai-topic-list">${topicsContent}</ul>
    </section>
    <div class="ai-preview-plan"><strong>Leeraanpak</strong><span>Per onderwerp: twee keer Leren, daarna één keer Herhalen</span></div>`;
}

document.getElementById("assistantPrompt").addEventListener("input", event => {
  const result = parseAssistantRequest(event.target.value);
  document.getElementById("assistantDifficulty").value = String(result.difficulty);
  updateAssistantDateFromPrompt(event.target.value);
  updateAssistantPreview();
});

document.getElementById("assistantSubject").addEventListener("change", updateAssistantPreview);
document.getElementById("assistantDifficulty").addEventListener("change", updateAssistantPreview);
document.getElementById("assistantDate").addEventListener("input", event => {
  event.currentTarget.dataset.userEdited = "true";
  delete event.currentTarget.dataset.autoFilled;
});

function clockToMinutes(time) {
  if (!isValid24HourTime(time)) return null;
  const [hours, minutes] = (time || "").split(":").map(Number);
  return Number.isFinite(hours) && Number.isFinite(minutes) ? hours * 60 + minutes : null;
}

function getEarlySchoolStart(date, weeklyActivities) {
  const weekday = (date.getDay() + 6) % 7;
  const starts = weeklyActivities
    .filter(activity =>
      activity.days.includes(weekday) && activity.name.trim().toLowerCase() === "school"
    )
    .map(activity => clockToMinutes(activity.start))
    .filter(start => start !== null && start < 9 * 60);
  return starts.length ? Math.min(...starts) : null;
}

function isBeforeEarlySchool(task, weeklyActivities = data.weeklyActivities) {
  if (!task.date || !task.time) return false;
  const date = parseDate(task.date);
  const time = clockToMinutes(task.time);
  if (!date || Number.isNaN(date.getTime()) || time === null) return false;
  const schoolStart = getEarlySchoolStart(date, weeklyActivities);
  return schoolStart !== null && time < schoolStart;
}

function findStudyStartTime(date, durationHours, plannedTasks, {
  weeklyActivities = data.weeklyActivities,
  existingTasks = data.tasks,
  existingExams = data.exams,
  studyWindow = data.studyWindow
} = {}) {
  const weekday = (date.getDay() + 6) % 7;
  let windowStart = clockToMinutes(studyWindow.start);
  const windowEnd = clockToMinutes(studyWindow.end);
  const durationMinutes = Math.round(durationHours * 60);
  const dateKey = toLocalDate(date);
  if (windowStart === null || windowEnd === null || durationMinutes <= 0 || windowStart >= windowEnd) return null;
  const earlySchoolStart = getEarlySchoolStart(date, weeklyActivities);
  if (earlySchoolStart !== null) windowStart = Math.max(windowStart, earlySchoolStart);
  const dayActivities = weeklyActivities.filter(activity => activity.days.includes(weekday));
  const existingStudyMinutes = existingTasks.reduce((sum, task) => {
    const minutes = Math.round(Number(task.hours) * 60);
    return task.examId && task.date === dateKey && Number.isFinite(minutes) && minutes > 0
      ? sum + minutes
      : sum;
  }, 0);
  const plannedStudyMinutes = plannedTasks.reduce((sum, task) => {
    const minutes = Math.round(Number(task.hours) * 60);
    return task.date === dateKey && Number.isFinite(minutes) && minutes > 0 ? sum + minutes : sum;
  }, 0);
  if (existingStudyMinutes + plannedStudyMinutes + durationMinutes > MAX_DAILY_STUDY_MINUTES) return null;

  const intervals = [];
  const addInterval = (startTime, hours) => {
    const start = clockToMinutes(startTime);
    if (start !== null && Number(hours) > 0) {
      intervals.push({ start, end: start + Number(hours) * 60 });
    }
  };
  dayActivities.forEach(activity => {
    const start = clockToMinutes(activity.start);
    const end = clockToMinutes(activity.end);
    if (start !== null && end !== null && end > start) intervals.push({ start, end });
  });
  existingTasks.filter(task => task.date === toLocalDate(date) && task.time)
    .forEach(task => addInterval(task.time, task.hours || 1));
  existingExams.filter(exam => exam.date === toLocalDate(date) && exam.time)
    .forEach(exam => addInterval(exam.time, exam.durationHours || 1));
  plannedTasks.filter(task => task.date === toLocalDate(date) && task.time)
    .forEach(task => addInterval(task.time, task.hours || 1));
  intervals.sort((a, b) => a.start - b.start);

  let start = windowStart;
  while (start + durationMinutes <= windowEnd) {
    const conflict = intervals.find(interval =>
      interval.start < start + durationMinutes && interval.end > start
    );
    if (!conflict) {
      return `${String(Math.floor(start / 60)).padStart(2, "0")}:${String(start % 60).padStart(2, "0")}`;
    }
    start = Math.ceil(conflict.end / 30) * 30;
  }
  return null;
}

function rescheduleStudyTasks({
  weeklyActivities = data.weeklyActivities,
  studyWindow = data.studyWindow,
  today = new Date(),
  taskIds = null
} = {}) {
  const todayDate = new Date(today);
  todayDate.setHours(0, 0, 0, 0);
  const todayKey = toLocalDate(todayDate);
  const fixedTasks = [];
  const tasksToReschedule = [];

  data.tasks.forEach(task => {
    if (taskIds && !taskIds.has(task.id)) {
      fixedTasks.push(task);
      return;
    }
    const exam = task.examId && data.exams.find(item => item.id === task.examId);
    const examDate = exam && /^\d{4}-\d{2}-\d{2}$/.test(exam.date) ? parseDate(exam.date) : null;
    const validExamDate = examDate && !Number.isNaN(examDate.getTime()) &&
      toLocalDate(examDate) === exam.date;
    if (!task.examId || task.completed || !validExamDate || exam.date <= todayKey ||
      !Number.isFinite(Number(task.hours)) || Number(task.hours) <= 0) {
      fixedTasks.push(task);
      return;
    }
    tasksToReschedule.push({ task, examDate });
  });

  tasksToReschedule.sort((a, b) =>
    a.examDate - b.examDate ||
    String(a.task.date || "").localeCompare(String(b.task.date || "")) ||
    String(a.task.time).localeCompare(String(b.task.time))
  );
  const rescheduledTasks = [];
  const fallbackTasks = [];

  tasksToReschedule.forEach(({ task, examDate }) => {
    const originalDate = /^\d{4}-\d{2}-\d{2}$/.test(task.date) ? parseDate(task.date) : todayDate;
    const targetDate = originalDate < todayDate ? todayDate : originalDate;
    const candidateDates = [];
    for (const candidate = new Date(todayDate); candidate < examDate; candidate.setDate(candidate.getDate() + 1)) {
      candidateDates.push(new Date(candidate));
    }
    candidateDates.sort((a, b) =>
      Math.abs(calendarDaysBetween(targetDate, a)) - Math.abs(calendarDaysBetween(targetDate, b)) ||
      a - b
    );

    let updatedTask = null;
    for (const candidateDate of candidateDates) {
      const startTime = findStudyStartTime(candidateDate, Number(task.hours), rescheduledTasks, {
        weeklyActivities,
        existingTasks: [...fixedTasks, ...fallbackTasks],
        existingExams: data.exams,
        studyWindow
      });
      if (!startTime) continue;
      updatedTask = { ...task, date: toLocalDate(candidateDate), time: startTime };
      break;
    }
    if (updatedTask) rescheduledTasks.push(updatedTask);
    else fallbackTasks.push(task);
  });

  const updatedById = new Map(rescheduledTasks.map(task => [task.id, task]));
  data.tasks = data.tasks.map(task => updatedById.get(task.id) || task);
  const movedCount = rescheduledTasks.filter(task => {
    const original = tasksToReschedule.find(item => item.task.id === task.id)?.task;
    return original && (task.date !== original.date || task.time !== original.time);
  }).length;
  return { movedCount, unplacedCount: fallbackTasks.length };
}

function rescheduleTasksBeforeEarlySchool(today = new Date()) {
  const todayDate = new Date(today);
  todayDate.setHours(0, 0, 0, 0);
  const todayKey = toLocalDate(todayDate);
  const currentTime = `${String(today.getHours()).padStart(2, "0")}:${String(today.getMinutes()).padStart(2, "0")}`;
  const taskIds = new Set(data.tasks
    .filter(task =>
      task.examId &&
      !task.completed &&
      (task.date > todayKey || (task.date === todayKey && task.time >= currentTime)) &&
      isBeforeEarlySchool(task)
    )
    .map(task => task.id));
  if (!taskIds.size) return { movedCount: 0, clearedCount: 0 };

  const { movedCount } = rescheduleStudyTasks({ today: todayDate, taskIds });
  let clearedCount = 0;
  data.tasks = data.tasks.map(task => {
    if (!taskIds.has(task.id) || !isBeforeEarlySchool(task)) return task;
    clearedCount++;
    return { ...task, time: "" };
  });
  return { movedCount, clearedCount };
}

function formatStudyDuration(hours) {
  const minutes = Math.round(hours * 60);
  if (minutes < 60) return `${minutes} min`;
  const fullHours = Math.floor(minutes / 60);
  const remainingMinutes = minutes % 60;
  return `${fullHours} u${remainingMinutes ? ` ${remainingMinutes} min` : ""}`;
}

function createStudySessions(topics) {
  const sessionsFor = (strategy, duration) => topics.map(topic => ({
    title: `${strategy}: ${topic}`,
    hours: duration
  }));
  return [
    ...sessionsFor("Leren", 0.75),
    ...sessionsFor("Leren", 0.75),
    ...sessionsFor("Herhalen", 0.5)
  ];
}

function buildStudyPlan({
  subjectId,
  title,
  date,
  difficulty,
  topics,
  today = new Date(),
  weeklyActivities = data.weeklyActivities,
  existingTasks = data.tasks,
  existingExams = data.exams,
  studyWindow = data.studyWindow
}) {
  const examDate = parseDate(date);
  const todayDate = new Date(today);
  todayDate.setHours(0, 0, 0, 0);
  const availableDays = Math.max(1, calendarDaysBetween(todayDate, examDate));
  const daysToUse = Math.max(1, Math.min(availableDays, 14));
  const planStartOffset = availableDays - daysToUse;
  const topicItems = topics.length ? topics : ["Basisstof"];
  const studySessions = createStudySessions(topicItems);
  const blockCount = Math.min(studySessions.length, daysToUse);
  const learningSessions = studySessions.filter(session => session.title.startsWith("Leren:"));
  const reviewSessions = studySessions.filter(session => session.title.startsWith("Herhalen:"));
  const firstLearningSessions = learningSessions.slice(0, topicItems.length);
  const secondLearningSessions = learningSessions.slice(topicItems.length);
  const firstLearningCount = Math.min(blockCount, firstLearningSessions.length);
  const secondLearningCount = Math.min(
    Math.max(0, blockCount - firstLearningCount),
    secondLearningSessions.length
  );
  const reviewCount = blockCount - firstLearningCount - secondLearningCount;
  const selectEvenly = (sessions, count) => Array.from({ length: count }, (_, index) => {
    const sessionIndex = count === 1
      ? 0
      : Math.round(index * (sessions.length - 1) / (count - 1));
    return sessions[sessionIndex];
  });
  const selectedSessions = [
    ...selectEvenly(firstLearningSessions, firstLearningCount),
    ...selectEvenly(secondLearningSessions, secondLearningCount),
    ...selectEvenly(reviewSessions, reviewCount)
  ];

  const plannedTasks = [];
  const candidateOffsets = Array.from({ length: daysToUse }, (_, index) => planStartOffset + index);
  const usedOffsets = new Set();
  for (let i = 0; i < blockCount; i++) {
    const targetOffset = blockCount === 1
      ? Math.max(planStartOffset, availableDays - 2)
      : planStartOffset + Math.round(i * (daysToUse - 1) / (blockCount - 1));
    const session = selectedSessions[i];
    const blockHours = session.hours;
    const nearbyOffsets = candidateOffsets
      .filter(offset => !usedOffsets.has(offset))
      .sort((a, b) => Math.abs(a - targetOffset) - Math.abs(b - targetOffset) || a - b);
    let taskDate;
    let startTime;
    let dayOffset;
    for (const offset of nearbyOffsets) {
      const candidateDate = new Date(todayDate);
      candidateDate.setDate(todayDate.getDate() + offset);
      if (candidateDate >= examDate) continue;
      const candidateTime = findStudyStartTime(candidateDate, blockHours, plannedTasks, {
        weeklyActivities,
        existingTasks,
        existingExams,
        studyWindow
      });
      if (!candidateTime) continue;
      taskDate = candidateDate;
      startTime = candidateTime;
      dayOffset = offset;
      break;
    }
    if (!taskDate) continue;
    usedOffsets.add(dayOffset);
    plannedTasks.push({
      title: `${session.title} · ${formatStudyDuration(blockHours)}`,
      subjectId,
      date: toLocalDate(taskDate),
      time: startTime,
      hours: blockHours,
      completed: false
    });
  }

  const plannedHours = plannedTasks.reduce((sum, task) => sum + task.hours, 0);
  return {
    exam: { subjectId, title, date, time: "09:00", hours: plannedHours, difficulty },
    tasks: plannedTasks,
    requestedBlockCount: blockCount
  };
}

document.getElementById("assistantForm").addEventListener("submit", event => {
  event.preventDefault();
  try {
    const prompt = readRequiredText("assistantPrompt", "Beschrijf je toets.");
    if (prompt === null) return;
    const parsed = parseAssistantRequest(prompt);
    const difficulty = Number(document.getElementById("assistantDifficulty").value) || parsed.difficulty;
    updateAssistantDateFromPrompt(prompt);
    const date = document.getElementById("assistantDate").value;
    const examDate = date ? parseDate(date) : null;
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    if (!examDate || Number.isNaN(examDate.getTime()) || examDate < today) {
      showToast("Vul een omschrijving en geldige toekomstige toetsdatum in");
      return;
    }
    const selectedSubject = data.subjects.find(item =>
      item.id === document.getElementById("assistantSubject").value
    );
    const manualValue = document.getElementById("assistantSubject").value;
    const newSubjectName = manualValue.startsWith("new:") ? manualValue.slice(4) : "";
    const subject = selectedSubject || (newSubjectName
      ? { id: uid("subject"), name: newSubjectName, color: "#5796db" }
      : parsed.subject) || (parsed.subjectName
      ? { id: uid("subject"), name: parsed.subjectName, color: "#5796db" }
      : null);
    if (!subject) {
      showToast("Kies een vak of voeg eerst een vak toe bij Vakken.");
      return;
    }

    const plan = buildStudyPlan({
      subjectId: subject.id,
      title: parsed.title,
      date,
      difficulty,
      topics: parsed.topics,
      today
    });

    if (!plan.tasks.length) {
      showToast("Er is geen plek voor studieblokken vóór deze toets");
      return;
    }

    const exam = { id: uid("exam"), ...plan.exam };
    if (!data.subjects.some(item => item.id === subject.id)) data.subjects.push(subject);
    data.exams.push(exam);
    data.tasks.push(...plan.tasks.map(task => ({ ...task, id: uid("task"), examId: exam.id })));
    saveData();
    document.getElementById("assistantDialog").close();
    showToast(plan.tasks.length < plan.requestedBlockCount
      ? `${plan.tasks.length} van ${plan.requestedBlockCount} studieblokken ingepland; de rest paste niet in je vrije tijden`
      : `${plan.tasks.length} studieblokken ingepland`);
    setView("calendar");
  } catch (error) {
    console.error("Automatisch plannen mislukt:", error);
    showToast("Inplannen is mislukt. Controleer of opslaan in deze browser is toegestaan.");
  }
});

const earlySchoolUpdates = rescheduleTasksBeforeEarlySchool();
if (earlySchoolUpdates.movedCount || earlySchoolUpdates.clearedCount) {
  saveData();
  const updates = [];
  if (earlySchoolUpdates.movedCount) {
    updates.push(`${earlySchoolUpdates.movedCount} leermoment(en) vóór school verplaatst`);
  }
  if (earlySchoolUpdates.clearedCount) {
    updates.push(`${earlySchoolUpdates.clearedCount} niet plaatsbare leermoment(en) zonder tijd gezet`);
  }
  showToast(updates.join("; "));
} else {
  render();
}
openOnboarding();
