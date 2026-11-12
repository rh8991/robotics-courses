// לוח בקרה למדריך: reads data/season.yml and shows "this meeting" (built from the date), the whole season,
// judging self-rating and links. Everything the guide marks is saved automatically in this browser
// (localStorage), with optional export/import to a file under "⚙️ הגדרות ועוד".

const STORE_KEY = "fll-control-v1"; // unchanged, so marks from the previous version are kept
const DAY = 86400000;
const DAYS = ["ראשון", "שני", "שלישי", "רביעי", "חמישי", "שישי", "שבת"];
const DEFAULT_DAY = 2; // שלישי

const store = {
  get(k, d) { try { const v = localStorage.getItem(k); return v === null ? d : JSON.parse(v); } catch (e) { return d; } },
  set(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); return true; } catch (e) { return false; } },
};

/* theme toggle – shared with the intro page */
(function () {
  const root = document.documentElement;
  const saved = store.get("fll-theme", null);
  if (saved) root.setAttribute("data-theme", saved);
  document.getElementById("themeBtn").addEventListener("click", () => {
    const cur = root.getAttribute("data-theme") ||
      (matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light");
    const next = cur === "dark" ? "light" : "dark";
    root.setAttribute("data-theme", next);
    store.set("fll-theme", next);
  });
})();

/* ---------- small helpers ---------- */
function esc(s) {
  return String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);
}
function fmt(s) {
  return esc(s).replace(/\*\*(.+?)\*\*/g, "<strong>$1</strong>");
}
// "2026-10-20" → local midnight; null if missing or malformed.
function parseDate(s) {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(s ?? "").trim());
  if (!m) return null;
  const d = new Date(+m[1], +m[2] - 1, +m[3]);
  return isNaN(d) || d.getMonth() !== +m[2] - 1 ? null : d;
}
function iso(d) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}
function showDate(d) {
  return `${d.getDate()}.${d.getMonth() + 1}`;
}
function addDays(d, n) {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate() + n);
}
// ?today=2026-12-08 lets you preview the board on another date.
const TODAY_OVERRIDE = parseDate(new URLSearchParams(location.search).get("today"));
function today() {
  if (TODAY_OVERRIDE) return TODAY_OVERRIDE;
  const n = new Date();
  return new Date(n.getFullYear(), n.getMonth(), n.getDate());
}
function safeUrl(u) {
  return /^(https?:\/\/|[\w.-]+\.html)/i.test(String(u ?? "")) ? u : "";
}
function isExternal(u) {
  return /^https?:\/\//i.test(u);
}
function parseDay(v) {
  if (v === undefined || v === null || v === "") return null;
  if (typeof v === "number" && v >= 0 && v <= 6) return v;
  const name = String(v).replace(/^יום\s*/, "").replace(/[׳']/g, "").trim();
  const i = DAYS.indexOf(name);
  return i >= 0 ? i : -1;
}

/* ---------- load + validate ---------- */
async function loadSeason() {
  const res = await fetch("data/season.yml", { cache: "no-cache" });
  if (!res.ok) throw new Error(`לא הצלחתי לטעון את הקובץ data/season.yml (${res.status})`);
  const text = await res.text();
  try {
    return jsyaml.load(text) || {};
  } catch (e) {
    const line = e.mark ? ` (בערך בשורה ${e.mark.line + 1})` : "";
    throw new Error(`יש טעות כתיבה בקובץ data/season.yml${line}. בדקו רווחים בתחילת השורה ומירכאות.`);
  }
}

// Normalise the YAML and collect problems to show instead of breaking the page.
function prepare(data) {
  const problems = [];
  const areas = {};
  for (const a of data.areas || []) if (a && a.id) areas[a.id] = a;
  const seen = new Set();
  const phases = (data.phases || []).filter(Boolean).map((p, pi) => {
    const pid = p.id || `phase-${pi + 1}`;
    if (!p.id) problems.push(`לשלב "${p.title || pi + 1}" אין id – הסימונים שלו עלולים להתבלבל אם תשנו את הסדר.`);
    const from = parseDate(p.from), to = parseDate(p.to);
    if (p.from && !from) problems.push(`בשלב "${p.title || pid}" התאריך from לא בפורמט 2026-10-20.`);
    if (p.to && !to) problems.push(`בשלב "${p.title || pid}" התאריך to לא בפורמט 2026-10-20.`);
    const tasks = (p.tasks || []).filter(Boolean).map((t, ti) => {
      const id = t.id || `${pid}-${ti + 1}`;
      if (seen.has(id)) problems.push(`המזהה "${id}" מופיע פעמיים – לכל משימה צריך id אחר.`);
      seen.add(id);
      if (t.area && !areas[t.area]) problems.push(`במשימה "${id}" התחום "${t.area}" לא מוגדר ב-areas.`);
      const due = parseDate(t.due);
      if (t.due && !due) problems.push(`במשימה "${id}" התאריך due לא בפורמט 2026-10-20 – המשימה תופיע כ"עבודה שוטפת".`);
      let extra = t.links;
      if (extra && !Array.isArray(extra)) { problems.push(`במשימה "${id}" השדה links צריך להיות רשימה (כל שורה מתחילה ב-"-").`); extra = []; }
      const links = [t.link, ...(extra || [])].filter((l) => l && safeUrl(l.url));
      return { ...t, id, due, links, phase: pid, phaseTitle: p.title || "", phaseEmoji: p.emoji || "" };
    });
    return { ...p, id: pid, from, to, tasks };
  });
  const season = data.season || {};
  const comp = season.competition || {};
  const compDate = parseDate(comp.date);
  if (!compDate) problems.push("בחלק season חסר תאריך תחרות (competition.date) בפורמט 2027-01-28.");
  let meetingDay = parseDay(season.meeting_day);
  if (meetingDay === -1) {
    problems.push(`ב-season → meeting_day כתוב "${season.meeting_day}". צריך לכתוב יום: ראשון / שני / שלישי / רביעי / חמישי / שישי.`);
    meetingDay = null;
  }
  const noMeetings = new Set();
  const nm = season.no_meetings;
  if (nm && !Array.isArray(nm)) problems.push('ב-season → no_meetings צריך רשימה של תאריכים, למשל ["2026-12-08"].');
  else for (const s of nm || []) {
    const d = parseDate(s);
    if (d) noMeetings.add(iso(d));
    else problems.push(`ב-season → no_meetings התאריך "${s}" לא בפורמט 2026-12-08.`);
  }
  return {
    season, comp, compDate, areas, phases, meetingDay, noMeetings,
    judging: data.judging || [], levels: data.rating_levels || ["1", "2", "3", "4"], links: data.links || [], problems,
  };
}

/* ---------- saved state (automatic) ---------- */
const state = Object.assign(
  { done: {}, ratings: {}, notes: {}, mnotes: {}, who: "all", area: "all", hideDone: false, meetingDay: null },
  store.get(STORE_KEY, {})
);
let toastTimer;
function save(quiet) {
  const ok = store.set(STORE_KEY, state);
  if (quiet) return;
  const el = document.getElementById("toast");
  el.textContent = ok ? "✓ נשמר" : "⚠ הדפדפן לא מאפשר לשמור (חלון פרטי?) – הסימונים יימחקו בסגירה";
  el.classList.toggle("bad", !ok);
  el.classList.add("show");
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => el.classList.remove("show"), ok ? 1400 : 5000);
}

/* ---------- meetings: built from the dates ---------- */
function meetingDayOf(S) {
  return state.meetingDay ?? S.meetingDay ?? DEFAULT_DAY;
}
function buildMeetings(S) {
  const day = meetingDayOf(S);
  const froms = S.phases.map((p) => p.from).filter(Boolean);
  const tos = S.phases.map((p) => p.to).filter(Boolean);
  const start = froms.length ? new Date(Math.min(...froms)) : today();
  const end = S.compDate || (tos.length ? new Date(Math.max(...tos)) : addDays(start, 7 * 12));
  const list = [];
  let d = addDays(start, (day - start.getDay() + 7) % 7);
  while (d <= end && list.length < 80) {
    if (!S.noMeetings.has(iso(d))) list.push(d);
    d = addDays(d, 7);
  }
  // the competition day is the last stop, even when it isn't on the meeting day
  const compExtra = S.compDate && (!list.length || list[list.length - 1] < S.compDate);
  if (compExtra) list.push(S.compDate);
  return list.map((date, i) => ({
    date, key: iso(date), num: i + 1, next: list[i + 1] || null,
    comp: !!S.compDate && iso(date) === iso(S.compDate),
  }));
}
// index of the meeting a date belongs to (dates before the first meeting → first one)
function meetingIndexFor(M, d) {
  let idx = 0;
  for (let i = 0; i < M.length; i++) if (M[i].date <= d) idx = i;
  return idx;
}
// the meeting to show by default: today's, otherwise the next one (to prepare)
function currentIndex(M) {
  const now = today();
  const i = M.findIndex((m) => m.date >= now);
  return i === -1 ? M.length - 1 : i;
}
function phaseActive(p, from, toExcl) {
  return (!p.from || p.from < (toExcl || Infinity)) && (!p.to || p.to >= from);
}
function meetingContent(S, M, i) {
  const m = M[i];
  const all = S.phases.flatMap((p) => p.tasks);
  const target = all.filter((t) => t.due && meetingIndexFor(M, t.due) === i).sort((a, b) => a.due - b.due);
  const active = S.phases.filter((p) => phaseActive(p, m.date, m.next));
  const ongoing = active.flatMap((p) => p.tasks.filter((t) => !t.due));
  const isCurrent = i === currentIndex(M);
  const now = today();
  const late = isCurrent
    ? all.filter((t) => t.due && t.due <= now && !state.done[t.id] && !target.includes(t)).sort((a, b) => a.due - b.due)
    : [];
  return { m, target, ongoing, active, late, isCurrent };
}

/* ---------- rendering pieces ---------- */
function dueState(t, now) {
  if (!t.due || state.done[t.id]) return "";
  if (t.due < now) return "late";
  if (t.due - now <= 14 * DAY) return "soon";
  return "";
}
function whoClass(who) {
  return /מדריך/.test(who || "") ? "who-guide" : /קבוצה/.test(who || "") ? "who-team" : "";
}
function linkHtml(l, cls) {
  const u = safeUrl(l.url);
  return `<a class="${cls}" href="${esc(u)}"${isExternal(u) ? ' target="_blank" rel="noopener"' : ""}>🔗 ${esc(l.title || "קישור")}</a>`;
}
function taskHtml(t, S, now, opts = {}) {
  const area = S.areas[t.area];
  const ds = dueState(t, now);
  const meta = [
    opts.kind && KIND_TAG[opts.kind] ? KIND_TAG[opts.kind] : "",
    t.who ?`<span class="tg ${whoClass(t.who)}">${esc(t.who)}</span>` : "",
    opts.showPhase && t.phaseTitle ? `<span class="tg">${esc(t.phaseEmoji)} ${esc(t.phaseTitle)}</span>` : "",
    !opts.showPhase && !opts.inArea && area ?`<span class="tg">${esc(area.emoji || "")} ${esc(area.title)}</span>` : "",
    t.due ? `<span class="tg ${ds}">${ds === "late" ? "באיחור · " : ""}עד ${showDate(t.due)}</span>` : "",
    t.verify ? `<span class="tg verify" title="מידע שעוד לא אומת מול FIRST ישראל">⚠ לבדוק</span>` : "",
  ].join("");
  const links = t.links.length ? `<div class="tlinks">${t.links.map((l) => linkHtml(l, "tlink")).join("")}</div>` : "";
  return `<li data-id="${esc(t.id)}" data-who="${esc(t.who || "")}" data-area="${esc(t.area || "")}" class="${state.done[t.id] ? "is-done" : ""}">
    <input type="checkbox" id="t-${esc(t.id)}" ${state.done[t.id] ? "checked" : ""}>
    <div class="t"><label for="t-${esc(t.id)}">${fmt(t.text)}</label><div class="meta">${meta}</div>${links}</div>
  </li>`;
}
const KIND_ORDER = { late: 0, target: 1, ongoing: 2 };
const KIND_TAG = { target: '<span class="tg soon">🎯 יעד</span>', ongoing: '<span class="tg kind-ongoing">🔁 שוטף</span>' };
// areas the guide opened in the meeting view (kept while moving between meetings, not saved)
const openAreas = new Set();
// phases the guide opened/closed in the season view (otherwise: open when current or late)
const phaseOpen = new Map();
// group tasks by area, in the order of `areas` in the YAML; unknown/missing area → "אחר"
function byArea(S, tasks) {
  const groups = [
    ...Object.values(S.areas).map((a) => ({ id: a.id, title: a.title || a.id, emoji: a.emoji || "📌" })),
    { id: "", title: "אחר", emoji: "📌" },
  ];
  return groups
    .map((g) => ({ ...g, list: tasks.filter((t) => (S.areas[t.area] ? t.area : "") === g.id) }))
    .filter((g) => g.list.length);
}

function heroHtml(S) {
  const now = today();
  const all = S.phases.flatMap((p) => p.tasks);
  const done = all.filter((t) => state.done[t.id]).length;
  const pct = all.length ? Math.round((done / all.length) * 100) : 0;
  const daysLeft = S.compDate ? Math.max(0, Math.ceil((S.compDate - now) / DAY)) : null;
  return `<div class="hero hero-slim"><div class="hero-grid"><div>
      <div class="tag">${esc(S.season.title || "")}</div>
      <h1>לוח בקרה למדריך</h1>
      <div class="bigbar" role="progressbar" aria-label="התקדמות כללית" aria-valuemin="0" aria-valuemax="100" aria-valuenow="${pct}"><div style="width:${pct}%"></div></div>
      <div class="barlbl">בוצעו ${done} מתוך ${all.length} משימות בעונה (${pct}%)</div>
    </div>
    <div class="countdown">
      <div class="lbl">עד ${esc(S.comp.title || "התחרות")}${S.compDate ? ` (${showDate(S.compDate)}.${S.compDate.getFullYear()})` : ""}${S.comp.verify ? " ⚠" : ""}</div>
      <div class="num">${daysLeft ?? "–"}</div>
      <div class="lbl">${daysLeft != null ? `ימים · כ-${Math.ceil(daysLeft / 7)} שבועות` : "ימים"}</div>
    </div></div></div>`;
}

function meetingView(S, M, i) {
  const now = today();
  if (!M.length) return `<section class="block"><p class="empty">אין מפגשים להצגה – בדקו את התאריכים של השלבים ושל התחרות ב-data/season.yml.</p></section>`;
  const { m, target, ongoing, active, late, isCurrent } = meetingContent(S, M, i);
  const cur = currentIndex(M);
  const dayName = DAYS[m.date.getDay()];
  const label = m.key === iso(now) ? "המפגש של היום" : m.date < now ? "מפגש שעבר" : isCurrent ? "המפגש הבא" : "מפגש עתידי";
  const nextM = M[i + 1];

  const strip = M.map((x, j) => {
    const c = meetingContent(S, M, j);
    const tot = c.target.length, dn = c.target.filter((t) => state.done[t.id]).length;
    const cls = [j === i ? "sel" : "", j === cur ? "cur" : "", x.date < now && j !== cur ? "past" : "", tot && dn === tot ? "full" : ""].join(" ");
    return `<a href="#meeting=${x.key}" class="wk ${cls}" ${j === i ? 'aria-current="true"' : ""} title="מפגש ${x.num} · ${showDate(x.date)}${tot ? ` · ${dn}/${tot} יעדים` : ""}">
      <b>${x.comp ? "🏆" : x.num}</b><small>${showDate(x.date)}</small></a>`;
  }).join("");

  // one folded section per area (closed until the guide opens it)
  const groups = byArea(S, [...late, ...target, ...ongoing]);
  const kindOf = (t) => (late.includes(t) ? "late" : target.includes(t) ? "target" : "ongoing");
  const areasHtml = groups.length
    ? areaAccordion(S, now, groups, { key: (g) => g.id, kindOf, showPhase: true })
    : '<p class="empty card">אין משימות למפגש הזה.</p>';

  let preview = "";
  if (nextM) {
    const nc = meetingContent(S, M, i + 1);
    const starting = S.phases.filter((p) => p.from && p.from >= nextM.date && p.from < (nextM.next || Infinity));
    const items = [
      ...starting.map((p) => `<li>🚩 מתחיל שלב: ${esc(p.emoji || "")} ${esc(p.title)}</li>`),
      ...nc.target.map((t) => `<li class="${state.done[t.id] ? "is-done" : ""}">${fmt(t.text)} <small>(עד ${showDate(t.due)})</small></li>`),
    ];
    preview = `<div class="card mbox peek"><h3>👀 הצצה ${nextM.comp ? `ל${esc(S.comp.title || "יום התחרות")}` : "למפגש הבא"} · ${DAYS[nextM.date.getDay()]} ${showDate(nextM.date)}</h3>
      ${items.length ? `<ul>${items.join("")}</ul>` : '<p class="empty">אין יעדים חדשים – ממשיכים בעבודה השוטפת.</p>'}
      <a class="btn ghost small" href="#meeting=${nextM.key}">למפגש הבא ←</a></div>`;
  }

  const lessonCount = [...late, ...target, ...ongoing].length;
  return `<section class="block meeting" id="meetingView">
    <div class="mnav">
      <a class="btn ghost navbtn" href="${i > 0 ? `#meeting=${M[i - 1].key}` : "#"}" ${i > 0 ? "" : 'aria-disabled="true" tabindex="-1"'} data-step="-1" aria-label="למפגש הקודם">→ <span>הקודם</span></a>
      <div class="mtitle">
        <span class="mlabel ${isCurrent ? "now" : ""}">${label}</span>
        <h2>${m.comp ? `🏆 ${esc(S.comp.title || "יום התחרות")}` : `מפגש ${m.num} <span class="of">מתוך ${M.filter((x) => !x.comp).length}</span>`}</h2>
        <div class="mdate">יום ${dayName} · ${showDate(m.date)}.${m.date.getFullYear()}</div>
      </div>
      <a class="btn ghost navbtn" href="${nextM ? `#meeting=${nextM.key}` : "#"}" ${nextM ? "" : 'aria-disabled="true" tabindex="-1"'} data-step="1" aria-label="למפגש הבא"><span>הבא</span> ←</a>
    </div>
    <div class="mactions">
      ${i !== cur ? `<a class="btn ghost small" href="#meeting=${M[cur].key}">↩ חזרה ל${M[cur].key === iso(now) ? "מפגש של היום" : "מפגש הקרוב"}</a>` : ""}
      ${lessonCount ? `<button type="button" class="btn small" id="lessonBtn">▶ מצב שיעור – משימה אחרי משימה</button>` : ""}
    </div>
    <div class="weeks" role="navigation" aria-label="כל המפגשים">${strip}</div>

    ${active.length ? `<div class="phasechips">${active.map((p) => `<span class="pchip" title="${esc(p.goal ? "בסוף השלב: " + p.goal : "")}">${esc(p.emoji || "📌")} ${esc(p.title)}${p.to ? ` <small>עד ${showDate(p.to)}</small>` : ""}</span>`).join("")}</div>` : ""}

    <div class="areas-head">
      <h3>המשימות לפי תחום</h3>
      ${groups.length > 1 ? `<button type="button" class="btn ghost small" id="accAll">${groups.every((g) => openAreas.has(g.id)) ? "סגירת הכול" : "פתיחת הכול"}</button>` : ""}
    </div>
    <p class="hint legend">לוחצים על תחום כדי לפתוח אותו. <span class="tg late">⏰ באיחור</span> תאריך היעד עבר · <span class="tg soon">🎯 יעד</span> לסיים עד המפגש הבא · <span class="tg kind-ongoing">🔁 שוטף</span> בלי תאריך, לפי הזמן שיש</p>
    <div class="areas">${areasHtml}</div>
    ${preview}

    <div class="notes card"><label for="mn-${m.key}">📝 הערות למפגש ${m.num} (${showDate(m.date)})</label>
      <textarea id="mn-${m.key}" data-mnote="${m.key}" placeholder="מי היה, מה הספקנו, מה להמשיך בפעם הבאה…">${esc(state.mnotes[m.key] || "")}</textarea></div>
  </section>`;
}

// folded area sections – shared by the meeting view and the season view.
// opts.key(g) → the id remembered in openAreas; opts.kindOf(t) → "late" | "target" | "ongoing" (optional)
function areaAccordion(S, now, groups, opts) {
  const kindOf = opts.kindOf || ((t) => (dueState(t, now) === "late" ? "late" : "ongoing"));
  return groups.map((g) => {
    const key = opts.key(g);
    const dn = g.list.filter((t) => state.done[t.id]).length;
    const lateN = g.list.filter((t) => kindOf(t) === "late" && !state.done[t.id]).length;
    const targetN = opts.kindOf ? g.list.filter((t) => kindOf(t) === "target" && !state.done[t.id]).length : 0;
    const all = dn === g.list.length;
    const sorted = [
      ...g.list.filter((t) => !state.done[t.id]).sort((a, b) => KIND_ORDER[kindOf(a)] - KIND_ORDER[kindOf(b)]),
      ...g.list.filter((t) => state.done[t.id]),
    ];
    return `<details class="card area-acc ${all ? "all-done" : ""}" data-acc="${esc(key)}" ${openAreas.has(key) ? "open" : ""}>
      <summary>
        <span class="emo" aria-hidden="true">${esc(g.emoji)}</span>
        <span class="atitle">${esc(g.title)}</span>
        <span class="badges">${lateN ? `<span class="tg late" title="באיחור">⏰ ${lateN}</span>` : ""}${targetN ? `<span class="tg soon" title="יעד המפגש">🎯 ${targetN}</span>` : ""}</span>
        <span class="count">${all ? "✓ " : ""}${dn}/${g.list.length}</span>
      </summary>
      <ul class="tasks big">${sorted.map((t) => taskHtml(t, S, now, { showPhase: opts.showPhase, inArea: true, kind: opts.kindOf ? kindOf(t) : "" })).join("")}</ul>
    </details>`;
  }).join("");
}

function seasonView(S) {
  const now = today();
  const phaseStatus = (p) => (p.to && now > p.to ? "done" : p.from && now < p.from ? "later" : "now");
  const dates = (p) => (p.from && p.to ? `${showDate(p.from)} – ${showDate(p.to)}` : "");
  const statusPill = (st) => (st === "now" ? '<span class="pill-status now">עכשיו</span>' : st === "done" ? '<span class="pill-status done">הסתיים</span>' : "");

  // top level = areas; inside each area the season's tasks, under small phase headings (in season order)
  const groups = byArea(S, S.phases.flatMap((p) => p.tasks));
  const areasHtml = groups.map((g) => {
    const key = `season:${g.id}`;
    const dn = g.list.filter((t) => state.done[t.id]).length;
    const lateN = g.list.filter((t) => dueState(t, now) === "late").length;
    const all = dn === g.list.length;
    const byPhase = S.phases
      .map((p) => ({ p, list: g.list.filter((t) => t.phase === p.id) }))
      .filter((x) => x.list.length);
    return `<details class="card area-acc season-area ${all ? "all-done" : ""}" data-acc="${esc(key)}" ${openAreas.has(key) ? "open" : ""}>
      <summary>
        <span class="emo" aria-hidden="true">${esc(g.emoji)}</span>
        <span class="atitle">${esc(g.title)}</span>
        <span class="badges">${lateN ? `<span class="tg late" title="באיחור">⏰ ${lateN}</span>` : ""}</span>
        <span class="count">${all ? "✓ " : ""}${dn}/${g.list.length}</span>
        <span class="aprog progress" aria-hidden="true"><span style="width:${g.list.length ? (dn / g.list.length) * 100 : 0}%"></span></span>
      </summary>
      ${byPhase.map(({ p, list }) => {
        const st = phaseStatus(p);
        return `<div class="phase-group is-${st}">
          <h4 class="phase-sub"><span aria-hidden="true">${esc(p.emoji || "📌")}</span> ${esc(p.title)} ${statusPill(st)} <small>${dates(p)}</small></h4>
          <ul class="tasks big">${list.map((t) => taskHtml(t, S, now, { inArea: true })).join("")}</ul>
        </div>`;
      }).join("")}
    </details>`;
  }).join("");

  // the season's phases: a compact timeline with the goal of each one
  const timeline = S.phases.map((p) => {
    const st = phaseStatus(p);
    const d = p.tasks.filter((t) => state.done[t.id]).length;
    return `<li class="tl-item is-${st}">
      <div class="tl-head"><span aria-hidden="true">${esc(p.emoji || "📌")}</span> <b>${esc(p.title)}</b> ${statusPill(st)}
        <small>${dates(p)} · ${d}/${p.tasks.length} בוצעו</small></div>
      ${p.goal ? `<div class="tl-goal">🎯 ${fmt(p.goal)}</div>` : ""}
    </li>`;
  }).join("");

  return `<section class="block"><h2>🗺️ כל העונה – לפי תחומים</h2>
    <div class="toolbar" role="group" aria-label="סינון משימות">
      <span class="lbl">מי:</span>
      <button type="button" class="fbtn" data-who="all">כולם</button>
      <button type="button" class="fbtn" data-who="מדריך">מדריך</button>
      <button type="button" class="fbtn" data-who="קבוצה">קבוצה</button>
      <span class="sep"></span>
      <button type="button" class="fbtn" id="hideDone">הסתרת משימות שבוצעו</button>
      <span class="sep"></span>
      <button type="button" class="btn ghost small" id="accAll">פתיחת כל התחומים</button>
    </div>
    <p class="hint legend">כל המשימות של העונה, מחולקות לפי תחום. לוחצים על תחום כדי לפתוח אותו – בפנים המשימות מסודרות לפי שלבי העונה.</p>
    <div class="areas">${areasHtml}</div>

    <details class="card season-phases">
      <summary>📅 שלבי העונה – תאריכים ומה צריך להיות מוכן בסוף כל שלב</summary>
      <ol class="timeline-list">${timeline}</ol>
    </details>

    <details class="card season-phases">
      <summary>📝 הערות מדריך לפי שלב</summary>
      ${S.phases.map((p) => `<div class="notes"><label for="n-${esc(p.id)}">${esc(p.emoji || "📌")} ${esc(p.title)}</label>
        <textarea id="n-${esc(p.id)}" data-note="${esc(p.id)}" placeholder="מה עבד, מה לא, מה לזכור לפעם הבאה…">${esc(state.notes[p.id] || "")}</textarea></div>`).join("")}
    </details>
  </section>`;
}

function judgingView(S) {
  return `<section class="block"><h2>⚖️ ארבעת תחומי השיפוט – דירוג עצמי</h2>
    <p>לכל תחום: מה השופטים מחפשים, ואיפה הקבוצה נמצאת היום לדעתכם. חוזרים לדרג כל כמה שבועות – כך רואים התקדמות ובוחרים על מה לעבוד.</p>
    <div class="grid2">${S.judging.map((j) => `<article class="card judge">
      <h3><span aria-hidden="true">${esc(j.emoji || "")}</span>${esc(j.title)}</h3>
      ${j.summary ? `<p>${fmt(j.summary)}</p>` : ""}
      ${j.look_for?.length ? `<ul>${j.look_for.map((x) => `<li>${fmt(x)}</li>`).join("")}</ul>` : ""}
      ${safeUrl(j.rubric) ? `<p><a href="${esc(j.rubric)}" target="_blank" rel="noopener">📄 המחוון המלא</a></p>` : ""}
      <fieldset class="rating"><legend>איפה אנחנו היום?</legend><div class="opts">${S.levels.map((lv, i) => `
        <input type="radio" name="r-${esc(j.id)}" id="r-${esc(j.id)}-${i + 1}" value="${i + 1}" data-rate="${esc(j.id)}" ${state.ratings[j.id] === i + 1 ? "checked" : ""}>
        <label for="r-${esc(j.id)}-${i + 1}"><b>${i + 1}</b>${esc(lv)}</label>`).join("")}
      </div></fieldset>
    </article>`).join("")}</div>
  </section>`;
}

function linksView(S) {
  return `<section class="block"><h2>🔗 קישורים וקבצים</h2>${S.links.map((g) => `
    <h3>${esc(g.group || "")}</h3>
    <div class="links">${(g.items || []).map((it) => {
      const u = safeUrl(it.url);
      if (!u) return "";
      const ext = isExternal(u);
      let shown = u;
      try { shown = ext ? decodeURI(u).replace(/^https?:\/\/(www\.)?/, "") : u; } catch (e) { shown = u; }
      if (shown.length > 60) shown = shown.split("/")[0] + "/…"; // long file links: just the site
      return `<a class="link" href="${esc(u)}"${ext ? ' target="_blank" rel="noopener"' : ""}>
        <span class="ico" aria-hidden="true">${esc(it.emoji || "🔗")}</span>
        <span>${esc(it.title)}${it.verify ? ' <span class="tg verify">⚠ לבדוק</span>' : ""}<small>${esc(shown)}</small></span>
      </a>`;
    }).join("")}</div>`).join("")}
  </section>`;
}

function settingsHtml(S) {
  const day = meetingDayOf(S);
  return `<details class="settings card" id="settings">
    <summary>⚙️ הגדרות ועוד</summary>
    <div class="set-row">
      <label for="daySel"><b>יום המפגש של הקבוצה:</b></label>
      <select id="daySel">${DAYS.slice(0, 6).map((n, i) => `<option value="${i}" ${i === day ? "selected" : ""}>יום ${n}</option>`).join("")}</select>
      ${state.meetingDay != null && state.meetingDay !== (S.meetingDay ?? DEFAULT_DAY) ? `<button type="button" class="btn ghost small" id="dayReset">חזרה ליום שבקובץ (${DAYS[S.meetingDay ?? DEFAULT_DAY]})</button>` : ""}
    </div>
    <p class="hint">הסימונים, הדירוגים וההערות <b>נשמרים לבד</b> – אבל רק בדפדפן ובמכשיר הזה. כדי להעביר אותם למכשיר אחר או למדריך נוסף:</p>
    <div class="data-actions">
      <button type="button" class="btn ghost" id="exportBtn">⬇ שמירה לקובץ</button>
      <label class="btn ghost" for="importFile" style="cursor:pointer">⬆ טעינה מקובץ</label>
      <input type="file" id="importFile" accept="application/json,.json" hidden>
      <button type="button" class="btn ghost" id="printBtn">🖨 הדפסת העמוד</button>
      <button type="button" class="btn ghost" id="resetBtn">ניקוי כל הסימונים</button>
    </div>
    <div class="status-msg" id="statusMsg" role="status"></div>
  </details>`;
}

/* ---------- lesson mode: one task at a time ---------- */
function openLesson(S, M, i) {
  const { late, target, ongoing } = meetingContent(S, M, i);
  // a long backlog of late tasks would bury the lesson – then only this meeting's tasks are stepped through
  // same order as on the page: area by area, inside each area late → target → ongoing
  const rank = (t) => (late.includes(t) ? 0 : target.includes(t) ? 1 : 2);
  const list = byArea(S, [...(late.length <= 5 ? late : []), ...target, ...ongoing])
    .flatMap((g) => g.list.sort((a, b) => rank(a) - rank(b)));
  if (!list.length) return;
  let pos = Math.max(0, list.findIndex((t) => !state.done[t.id]));
  const back = document.activeElement;
  const ov = document.createElement("div");
  ov.className = "lesson";
  ov.setAttribute("role", "dialog");
  ov.setAttribute("aria-modal", "true");
  ov.setAttribute("aria-label", "מצב שיעור");
  document.body.appendChild(ov);
  document.body.classList.add("noscroll");
  const kind = (t) => (late.includes(t) ? "⏰ נשאר מקודם" : target.includes(t) ? "🎯 היעד של המפגש" : "🔁 עבודה שוטפת");
  const draw = () => {
    const t = list[pos];
    const done = !!state.done[t.id];
    const left = list.filter((x) => !state.done[x.id]).length;
    ov.innerHTML = `<div class="lesson-in">
      <div class="lesson-top">
        <span>מפגש ${M[i].num} · משימה ${pos + 1} מתוך ${list.length} · נשארו ${left}</span>
        <button type="button" class="icon-btn" data-l="close" aria-label="סגירת מצב שיעור">✕</button>
      </div>
      <div class="lesson-dots" aria-hidden="true">${list.map((x, j) => `<i class="${j === pos ? "on" : ""} ${state.done[x.id] ? "ok" : ""}"></i>`).join("")}</div>
      <div class="lesson-card ${done ? "is-done" : ""}">
        <div class="lesson-kind">${kind(t)} · ${esc(t.phaseEmoji)} ${esc(t.phaseTitle)}</div>
        <p class="lesson-text">${fmt(t.text)}</p>
        <div class="meta">${t.who ? `<span class="tg ${whoClass(t.who)}">${esc(t.who)}</span>` : ""}${t.due ? `<span class="tg">עד ${showDate(t.due)}</span>` : ""}${t.verify ? '<span class="tg verify">⚠ לבדוק</span>' : ""}</div>
        ${t.links.length ? `<div class="tlinks">${t.links.map((l) => linkHtml(l, "tlink")).join("")}</div>` : ""}
        ${done ? '<div class="lesson-ok">✓ בוצע</div>' : ""}
      </div>
      <div class="lesson-nav">
        <button type="button" class="btn ghost" data-l="prev" ${pos === 0 ? "disabled" : ""}>→ הקודמת</button>
        <button type="button" class="btn" data-l="done">${done ? "↺ לא בוצע" : pos < list.length - 1 ? "✓ בוצע, להבאה" : "✓ בוצע"}</button>
        <button type="button" class="btn ghost" data-l="next" ${pos === list.length - 1 ? "disabled" : ""}>הבאה ←</button>
      </div>
    </div>`;
    ov.querySelector('[data-l="done"]').focus();
  };
  const close = () => {
    ov.remove();
    document.body.classList.remove("noscroll");
    document.removeEventListener("keydown", onKey, true);
    redraw();
    if (back && document.contains(back)) back.focus();
  };
  const act = (a) => {
    if (a === "close") return close();
    if (a === "prev" && pos > 0) pos--;
    else if (a === "next" && pos < list.length - 1) pos++;
    else if (a === "done") {
      const t = list[pos];
      if (state.done[t.id]) delete state.done[t.id];
      else { state.done[t.id] = true; if (pos < list.length - 1) pos++; }
      save();
    }
    draw();
  };
  const onKey = (e) => {
    if (e.key === "Escape") { e.preventDefault(); close(); }
    else if (e.key === "ArrowRight") { e.preventDefault(); act("prev"); }
    else if (e.key === "ArrowLeft") { e.preventDefault(); act("next"); }
    else if (e.key === "Tab") {
      const f = [...ov.querySelectorAll("button:not([disabled]), a[href]")];
      if (!f.length) return;
      const first = f[0], last = f[f.length - 1];
      if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus(); }
      else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
    }
  };
  ov.addEventListener("click", (e) => {
    const b = e.target.closest("[data-l]");
    if (b && !b.disabled) act(b.dataset.l);
  });
  swipe(ov, (dir) => act(dir > 0 ? "next" : "prev"));
  document.addEventListener("keydown", onKey, true);
  draw();
}

// horizontal swipe: finger moving right → +1 (next, as when turning a Hebrew page), left → -1
function swipe(el, cb) {
  let x0 = null, y0 = 0;
  el.addEventListener("touchstart", (e) => {
    // ignore swipes that start on something that scrolls sideways or is being edited
    if (e.touches.length !== 1 || e.target.closest(".weeks, .phasechips, textarea, input, select")) { x0 = null; return; }
    x0 = e.touches[0].clientX; y0 = e.touches[0].clientY;
  }, { passive: true });
  el.addEventListener("touchend", (e) => {
    if (x0 === null) return;
    const dx = e.changedTouches[0].clientX - x0, dy = e.changedTouches[0].clientY - y0;
    x0 = null;
    if (Math.abs(dx) > 70 && Math.abs(dx) > Math.abs(dy) * 1.5) cb(dx > 0 ? 1 : -1);
  }, { passive: true });
}

/* ---------- page: routing + wiring ---------- */
let S, M, view = "meeting", sel = 0, openPhase = null;

function route() {
  const h = decodeURIComponent(location.hash.slice(1));
  const [name, arg] = h.split("=");
  view = ["meeting", "season", "judging", "links"].includes(name) ? name : "meeting";
  if (view === "meeting") {
    const d = parseDate(arg);
    const j = d ? M.findIndex((m) => m.key === iso(d)) : -1;
    sel = j >= 0 ? j : currentIndex(M);
  }
}

function show() {
  const app = document.getElementById("app");
  let html = "";
  if (S.problems.length)
    html += `<div class="warnbox"><strong>⚠ יש בעיות בקובץ data/season.yml</strong> – העמוד מוצג, אבל כדאי לתקן:<ul>${S.problems.map((p) => `<li>${esc(p)}</li>`).join("")}</ul></div>`;
  if (TODAY_OVERRIDE)
    html += `<div class="warnbox preview">👁 תצוגה לתאריך ${showDate(TODAY_OVERRIDE)}.${TODAY_OVERRIDE.getFullYear()} (בגלל <span dir="ltr">?today=</span> בכתובת). <a href="control.html">חזרה להיום</a></div>`;
  html += heroHtml(S);
  html += view === "meeting" ? meetingView(S, M, sel) : view === "season" ? seasonView(S) : view === "judging" ? judgingView(S) : linksView(S);
  html += settingsHtml(S);
  html += `<footer>לוח בקרה למדריך · FIRST® LEGO® League. התוכן נערך בקובץ <span dir="ltr">fll/data/season.yml</span>.</footer>`;
  const settingsOpen = document.getElementById("settings")?.open;
  app.innerHTML = html;
  if (settingsOpen) document.getElementById("settings").open = true;
  document.querySelectorAll(".tabs a").forEach((a) => {
    if (a.dataset.tab === view) a.setAttribute("aria-current", "page"); else a.removeAttribute("aria-current");
  });
  if (view === "season") refreshFilters(app);
  syncAccAll(app);
  if (view === "meeting") {
    const s = app.querySelector(".wk.sel");
    const strip = app.querySelector(".weeks");
    if (s && strip) strip.scrollLeft = s.offsetLeft - strip.clientWidth / 2 + s.offsetWidth / 2;
  }
  if (openPhase) {
    const d = document.getElementById("ph-" + openPhase);
    openPhase = null;
    if (d) d.scrollIntoView({ block: "start" });
  }
}

function refreshFilters(app) {
  app.querySelectorAll("[data-who]").forEach((b) => b.matches("button") && b.setAttribute("aria-pressed", b.dataset.who === state.who));
  app.querySelector("#hideDone").setAttribute("aria-pressed", state.hideDone);
  app.querySelectorAll(".tasks li").forEach((li) => {
    const okWho = state.who === "all" || li.dataset.who.includes(state.who);
    const okDone = !(state.hideDone && state.done[li.dataset.id]);
    li.hidden = !(okWho && okDone);
  });
  // an area with nothing left to show after filtering disappears
  app.querySelectorAll(".phase-group, details.area-acc").forEach((d) => {
    d.hidden = ![...d.querySelectorAll(".tasks li")].some((li) => !li.hidden);
  });
}

// label of the "open all / close all" button, by view and current state
function syncAccAll(app) {
  const btn = app.querySelector("#accAll");
  if (!btn) return;
  const accs = [...app.querySelectorAll("details.area-acc:not([hidden])")];
  const phases = [...app.querySelectorAll("details.phase")];
  const allOpen = accs.every((d) => d.open) && phases.every((d) => d.open);
  btn.textContent = view === "season"
    ? (allOpen ? "סגירת כל התחומים" : "פתיחת כל התחומים")
    : (allOpen ? "סגירת הכול" : "פתיחת הכול");
}

// keep the scroll position when re-drawing after a tick, so the page doesn't jump
function redraw() {
  const y = window.scrollY;
  show();
  window.scrollTo(0, y);
}

function goMeeting(step) {
  const j = sel + step;
  if (j >= 0 && j < M.length) location.hash = `meeting=${M[j].key}`;
}

function wire() {
  const app = document.getElementById("app");
  app.addEventListener("change", (e) => {
    const el = e.target;
    if (el.matches(".tasks input[type=checkbox]")) {
      const id = el.closest("li").dataset.id;
      if (el.checked) state.done[id] = true; else delete state.done[id];
      save();
      el.closest("li").classList.toggle("is-done", el.checked);
      setTimeout(redraw, 350); // short pause so the tick is visible before the task moves down
    } else if (el.dataset.rate) {
      state.ratings[el.dataset.rate] = +el.value;
      save();
    } else if (el.id === "daySel") {
      state.meetingDay = +el.value;
      save();
      M = buildMeetings(S);
      history.replaceState(null, "", location.pathname + location.search + "#meeting");
      route(); show();
      msg(`יום המפגש עודכן ליום ${DAYS[state.meetingDay]}.`);
    } else if (el.id === "importFile") {
      importState(el);
    }
  });
  // remember which areas are open, so ticking a task (which redraws the page) doesn't close them
  app.addEventListener("toggle", (e) => {
    const d = e.target;
    if (!(d instanceof HTMLDetailsElement)) return;
    if (d.classList.contains("area-acc")) {
      if (d.open) openAreas.add(d.dataset.acc); else openAreas.delete(d.dataset.acc);
    } else if (d.classList.contains("phase")) {
      phaseOpen.set(d.dataset.phase, d.open);
    } else return;
    syncAccAll(app);
  }, true);
  let noteTimer;
  app.addEventListener("input", (e) => {
    const el = e.target;
    if (el.dataset.note) state.notes[el.dataset.note] = el.value;
    else if (el.dataset.mnote) state.mnotes[el.dataset.mnote] = el.value;
    else return;
    save(true);
    clearTimeout(noteTimer);
    noteTimer = setTimeout(() => save(), 900);
  });
  app.addEventListener("click", (e) => {
    const b = e.target.closest("button, a");
    if (!b) return;
    if (b.getAttribute("aria-disabled") === "true") { e.preventDefault(); return; }
    if (b.dataset.open) { openPhase = b.dataset.open; return; } // the link goes to #season
    if (b.matches("a")) return;
    if (b.dataset.who) { state.who = b.dataset.who; save(true); refreshFilters(app); syncAccAll(app); }
    else if (b.id === "hideDone") { state.hideDone = !state.hideDone; save(true); refreshFilters(app); syncAccAll(app); }
    else if (b.id === "lessonBtn") openLesson(S, M, sel);
    else if (b.id === "accAll") {
      const accs = [...app.querySelectorAll("details.area-acc:not([hidden])")];
      const phases = [...app.querySelectorAll("details.phase")];
      const openAll = !(accs.every((d) => d.open) && phases.every((d) => d.open));
      accs.forEach((d) => { d.open = openAll; if (openAll) openAreas.add(d.dataset.acc); else openAreas.delete(d.dataset.acc); });
      // in the season view "open all" also opens the phases, otherwise the areas stay out of sight
      if (openAll) phases.forEach((d) => { d.open = true; phaseOpen.set(d.dataset.phase, true); });
      syncAccAll(app);
    }
    else if (b.id === "dayReset") {
      state.meetingDay = null; save(); M = buildMeetings(S);
      history.replaceState(null, "", location.pathname + location.search + "#meeting");
      route(); show();
    }
    else if (b.id === "printBtn") { app.querySelectorAll("details.phase, details.area-acc").forEach((d) => (d.open = true)); window.print(); }
    else if (b.id === "exportBtn") exportState();
    else if (b.id === "resetBtn") {
      if (!confirm("למחוק את כל הסימונים, הדירוגים וההערות בדפדפן הזה?")) return;
      state.done = {}; state.ratings = {}; state.notes = {}; state.mnotes = {}; save(); show();
      msg("כל הסימונים נמחקו.");
    }
  });
  // ← / → between meetings (RTL: right = earlier), not while typing
  document.addEventListener("keydown", (e) => {
    if (view !== "meeting" || document.querySelector(".lesson")) return;
    if (e.altKey || e.ctrlKey || e.metaKey) return;
    if (e.target instanceof Element && e.target.closest("input, textarea, select, button, [contenteditable]")) return;
    if (e.key === "ArrowRight") { e.preventDefault(); goMeeting(-1); }
    else if (e.key === "ArrowLeft") { e.preventDefault(); goMeeting(1); }
  });
  swipe(app, (dir) => {
    if (view === "meeting" && !document.querySelector(".lesson")) goMeeting(dir);
  });
  window.addEventListener("hashchange", () => {
    const before = view, jumpToPhase = !!openPhase;
    route(); show();
    if (jumpToPhase) return; // show() already scrolled to the phase
    if (before !== view || view !== "meeting") window.scrollTo(0, 0);
    else document.getElementById("meetingView")?.scrollIntoView({ block: "start" });
  });
}

async function importState(input) {
  const f = input.files[0];
  if (!f) return;
  try {
    const d = JSON.parse(await f.text());
    if (!d || typeof d !== "object" || !d.done) throw new Error();
    state.done = d.done || {}; state.ratings = d.ratings || {}; state.notes = d.notes || {}; state.mnotes = d.mnotes || {};
    save(); show();
    msg(`נטען מהקובץ ${f.name}.`);
  } catch (err) {
    msg("הקובץ לא נראה כמו גיבוי של לוח הבקרה – לא נטען כלום.");
  }
}
function exportState() {
  const data = { saved: new Date().toISOString(), done: state.done, ratings: state.ratings, notes: state.notes, mnotes: state.mnotes };
  const a = document.createElement("a");
  a.href = URL.createObjectURL(new Blob([JSON.stringify(data, null, 2)], { type: "application/json" }));
  a.download = `fll-control-${iso(today())}.json`;
  document.body.appendChild(a); a.click(); a.remove();
  msg("הקובץ נשמר בתיקיית ההורדות.");
}
function msg(t) {
  const el = document.getElementById("statusMsg");
  if (el) el.textContent = t;
}

document.addEventListener("DOMContentLoaded", async () => {
  const app = document.getElementById("app");
  try {
    S = prepare(await loadSeason());
    M = buildMeetings(S);
    route();
    wire();
    show();
  } catch (e) {
    console.error(e);
    app.innerHTML = `<div class="warnbox"><strong>⚠ ${esc(e.message)}</strong><br>אם פתחתם את הקובץ ישירות מהמחשב – צריך שרת מקומי (ראו README).</div>`;
  }
});
