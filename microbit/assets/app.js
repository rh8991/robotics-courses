// Loads data/schedule.yml + data/lessons.yml and renders the page named in <body data-page="...">.

const LEVELS = { beginner: "מתחילים", intermediate: "בינוני", advanced: "מתקדם" };
const SOURCES = { microbit: "micro:bit", tinybit: "Tiny:bit", project: "פרויקט" };

// Small stroke icon set (Lucide paths), drawn inline so they follow currentColor.
const ICON_PATHS = {
  search: '<circle cx="11" cy="11" r="7.5"/><path d="m20.5 20.5-4.2-4.2"/>',
  x: '<path d="M18 6 6 18"/><path d="m6 6 12 12"/>',
  back: '<path d="M5 12h14"/><path d="m12 5 7 7-7 7"/>',
  target: '<circle cx="12" cy="12" r="9"/><circle cx="12" cy="12" r="5"/><circle cx="12" cy="12" r="1.5"/>',
  sparkle: '<path d="m12 3-1.9 5.8a2 2 0 0 1-1.3 1.3L3 12l5.8 1.9a2 2 0 0 1 1.3 1.3L12 21l1.9-5.8a2 2 0 0 1 1.3-1.3L21 12l-5.8-1.9a2 2 0 0 1-1.3-1.3Z"/>',
  bulb: '<path d="M15 14c.2-1 .7-1.7 1.5-2.5 1-.9 1.5-2.2 1.5-3.5A6 6 0 0 0 6 8c0 1 .2 2.2 1.5 3.5.7.7 1.3 1.5 1.5 2.5"/><path d="M9 18h6"/><path d="M10 22h4"/>',
  rocket: '<path d="M4.5 16.5c-1.5 1.26-2 5-2 5s3.74-.5 5-2c.71-.84.7-2.13-.09-2.91a2.18 2.18 0 0 0-2.91-.09z"/><path d="m12 15-3-3a22 22 0 0 1 2-3.95A12.88 12.88 0 0 1 22 2c0 2.72-.78 7.5-6 11a22.35 22.35 0 0 1-4 2z"/><path d="M9 12H4s.55-3.03 2-4c1.62-1.08 5 0 5 0"/><path d="M12 15v5s3.03-.55 4-2c1.08-1.62 0-5 0-5"/>',
  code: '<path d="m16 18 6-6-6-6"/><path d="m8 6-6 6 6 6"/>',
  download: '<path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><path d="m7 10 5 5 5-5"/><path d="M12 15V3"/>',
  external: '<path d="M15 3h6v6"/><path d="M10 14 21 3"/><path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"/>',
  printer: '<path d="M6 9V2h12v7"/><path d="M6 18H4a2 2 0 0 1-2-2v-5a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v5a2 2 0 0 1-2 2h-2"/><rect x="6" y="14" width="12" height="8" rx="1"/>',
  clipboard: '<rect x="8" y="2" width="8" height="4" rx="1"/><path d="M16 4h2a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h2"/>',
  image: '<rect x="3" y="3" width="18" height="18" rx="2"/><circle cx="9" cy="9" r="2"/><path d="m21 15-3.1-3.1a2 2 0 0 0-2.8 0L6 21"/>',
};
function icon(name, cls = "") {
  return `<svg class="icon ${cls}" viewBox="0 0 24 24" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">${ICON_PATHS[name]}</svg>`;
}

async function loadYaml(path) {
  const res = await fetch(path, { cache: "no-cache" });
  if (!res.ok) throw new Error(`לא הצלחתי לטעון את ${path}`);
  return jsyaml.load(await res.text());
}

function esc(s) {
  return String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
}

// Light formatting for text in the YAML: **bold** and [[block name]].
function fmt(s) {
  return esc(s)
    .replace(/\*\*(.+?)\*\*/g, "<strong>$1</strong>")
    .replace(/\[\[(.+?)\]\]/g, '<code class="block-name" dir="auto">$1</code>');
}
// Same text with the markup stripped, for search and snippets.
function plain(s) {
  return String(s ?? "").replace(/\*\*(.+?)\*\*/g, "$1").replace(/\[\[(.+?)\]\]/g, "$1");
}

function list(items, ordered = false) {
  if (!items || !items.length) return "";
  const tag = ordered ? "ol" : "ul";
  return `<${tag}>${items.map((i) => `<li>${fmt(i)}</li>`).join("")}</${tag}>`;
}

function tags(lesson) {
  const out = [`<span class="tag src-${lesson.source}">${SOURCES[lesson.source] || lesson.source}</span>`];
  if (lesson.level) out.push(`<span class="tag level-${lesson.level}">${LEVELS[lesson.level] || lesson.level}</span>`);
  if (lesson.needs_v2) out.push(`<span class="tag v2">דורש micro:bit V2</span>`);
  return out.join("");
}

function warn(container, messages) {
  if (!messages.length) return;
  const div = document.createElement("div");
  div.className = "warning";
  div.innerHTML = `<strong>שימו לב – יש בעיה בקובץ הנתונים:</strong>${list(messages)}`;
  container.prepend(div);
}

async function loadAll() {
  const [schedule, lessonsData] = await Promise.all([loadYaml("data/schedule.yml"), loadYaml("data/lessons.yml")]);
  const lessons = {};
  for (const l of lessonsData.lessons || []) lessons[l.id] = l;
  const problems = [];
  const sessionOf = {};
  for (const s of schedule.sessions || []) {
    for (const id of s.lessons || []) {
      if (!lessons[id]) problems.push(`במפגש ${s.num} מופיע שיעור "${id}" שלא קיים ב-lessons.yml`);
      else if (!sessionOf[id]) sessionOf[id] = s;
    }
  }
  return { schedule, lessons, sessionOf, problems };
}

function lessonUrl(id, view) {
  return `lesson.html?id=${encodeURIComponent(id)}&view=${view}`;
}

/* ------------------------------------------------------------------ */
/*  Search                                                             */
/* ------------------------------------------------------------------ */

// Lowercase, drop niqqud and punctuation, fold Hebrew final letters so "חיישן" matches "חיישנים".
const FINALS = { "ך": "כ", "ם": "מ", "ן": "נ", "ף": "פ", "ץ": "צ" };
function norm(s) {
  return String(s ?? "")
    .toLowerCase()
    .replace(/[֑-ׇ]/g, "")
    .replace(/[ךםןףץ]/g, (c) => FINALS[c])
    .replace(/[^\p{L}\p{N}]+/gu, " ")
    .trim();
}

const LATIN = /^[a-z0-9]/;
function has(text, t) {
  if (!LATIN.test(t)) {
    // Hebrew: also match the singular, so "חיישנים" finds "חיישן" and "אורות" finds "אור".
    const stem = t.length >= 5 && /(ימ|ות)$/.test(t) ? t.slice(0, -2) : t;
    return text.includes(t) || text.includes(stem);
  }
  return (" " + text).includes(" " + t);
}

function buildIndex({ lessons, sessionOf }, view) {
  const entries = [];
  for (const l of Object.values(lessons)) {
    const s = sessionOf[l.id];
    if (view === "student" && !s) continue; // students see the scheduled course only
    const st = l.student || {};
    const g = l.guide || {};
    const blocks = JSON.stringify(st).match(/\[\[(.+?)\]\]/g) || [];
    const fields = [
      [5, l.title],
      [4, (l.concepts || []).join(" ")],
      [3, blocks.join(" ")],
      [2, s ? s.title : ""],
      [2, l.summary],
      [1, [st.intro, st.goal, st.concept, st.tip, st.challenge, ...(st.steps || [])].map(plain).join(" ")],
      [1, SOURCES[l.source] || ""],
    ];
    if (view === "guide") fields.push([1, [g.prep, g.extension, ...(g.objectives || []), ...(g.materials || []), ...(g.common_mistakes || [])].join(" ")]);
    entries.push({ lesson: l, session: s, fields: fields.map(([w, t]) => [w, norm(t)]) });
  }
  return entries;
}

function search(index, query) {
  const q = norm(query);
  if (!q) return [];
  const terms = q.split(" ");
  const num = /^\d+$/.test(q) ? Number(q) : null;
  const hits = [];
  for (const e of index) {
    if (num !== null) {
      if (e.session && e.session.num === num) hits.push({ e, score: 100 });
      continue;
    }
    let score = 0;
    let all = true;
    for (const t of terms) {
      let best = 0;
      for (const [w, text] of e.fields) {
        if (!has(text, t)) continue;
        const wordStart = (" " + text).includes(" " + t);
        best = Math.max(best, w * (wordStart ? 2 : 1));
      }
      if (!best) { all = false; break; }
      score += best;
    }
    if (all) hits.push({ e, score });
  }
  return hits
    .sort((a, b) => b.score - a.score || (a.e.session?.num ?? 99) - (b.e.session?.num ?? 99))
    .map((h) => h.e);
}

// Wrap query terms in <mark>, matching against the folded text but marking the original.
function highlight(text, query) {
  const raw = plain(text);
  const terms = norm(query).split(" ").filter((t) => t.length > 1);
  if (!terms.length) return esc(raw);
  const folded = raw.toLowerCase().replace(/[ךםןףץ]/g, (c) => FINALS[c]);
  const marks = new Array(raw.length).fill(false);
  for (const t of terms) {
    let i = folded.indexOf(t);
    while (i !== -1) {
      const wordStart = i === 0 || !/[\p{L}\p{N}]/u.test(folded[i - 1]);
      if (!LATIN.test(t) || wordStart) for (let k = i; k < i + t.length; k++) marks[k] = true;
      i = folded.indexOf(t, i + t.length);
    }
  }
  let out = "";
  let open = false;
  for (let i = 0; i < raw.length; i++) {
    if (marks[i] && !open) { out += "<mark>"; open = true; }
    if (!marks[i] && open) { out += "</mark>"; open = false; }
    out += esc(raw[i]);
  }
  return open ? out + "</mark>" : out;
}

// When a lesson matched on text that isn't shown in the result (a step, a block name),
// show that piece so the match makes sense.
function matchSnippet(l, query, shown) {
  const terms = norm(query).split(" ").filter(Boolean);
  if (terms.every((t) => has(norm(shown), t))) return "";
  const st = l.student || {};
  const pieces = [st.goal, st.concept, ...(st.steps || []), st.tip, st.challenge, st.intro, (l.concepts || []).join(", ")]
    .filter(Boolean)
    .map(plain);
  const hit = pieces.find((p) => terms.every((t) => has(norm(p), t))) || pieces.find((p) => terms.some((t) => has(norm(p), t)));
  if (!hit) return "";
  return hit.length > 110 ? hit.slice(0, 108).trimEnd() + "…" : hit;
}

/* ------------------------------------------------------------------ */
/*  Session list (student + guide)                                     */
/* ------------------------------------------------------------------ */

function sessionsHtml({ schedule, lessons }, view, partId) {
  const part = (schedule.parts || []).find((p) => p.id === partId);
  const sessions = (schedule.sessions || []).filter((s) => s.part === partId);
  const rows = sessions
    .map((s) => {
      const links = (s.lessons || [])
        .filter((id) => lessons[id])
        .map((id) => `<a href="${lessonUrl(id, view)}">${esc(lessons[id].title)}</a>`)
        .join("");
      const note = view === "guide" ? s.guide_note : s.student_note;
      return `<li class="session">
        <span class="num" aria-hidden="true">${esc(s.num)}</span>
        <div class="session-body">
          <h3><span class="visually-hidden">מפגש ${esc(s.num)}: </span>${esc(s.title)}</h3>
          ${note ? `<p class="note">${fmt(note)}</p>` : ""}
          <div class="session-lessons">${links}</div>
        </div>
      </li>`;
    })
    .join("");
  return `${part?.description ? `<p class="part-desc">${fmt(part.description)}</p>` : ""}
    <ol class="session-list part-${esc(partId)}">${rows}</ol>`;
}

function resultsHtml(results, query, view) {
  if (!results.length)
    return `<div class="empty"><p><strong>לא מצאנו שיעור כזה.</strong></p><p>נסו מילה אחרת, למשל: לב, רדיו, חיישן, מוזיקה, או מספר מפגש.</p></div>`;
  return `<ul class="results">${results
    .map(({ lesson: l, session: s }) => {
      const where = s ? `מפגש ${esc(s.num)} · ${esc(s.title)}` : "מאגר שיעורים נוסף";
      const blurb = l.summary || l.student?.goal || "";
      const why = matchSnippet(l, query, `${l.title} ${blurb}`);
      return `<li class="result part-${esc(s?.part || l.source)}">
        <a href="${lessonUrl(l.id, view)}">
          <span class="result-title">${highlight(l.title, query)}</span>
          <span class="result-where">${where}</span>
          ${blurb ? `<span class="result-blurb">${highlight(blurb, query)}</span>` : ""}
          ${why ? `<span class="result-why">${highlight(why, query)}</span>` : ""}
        </a>
      </li>`;
    })
    .join("")}</ul>`;
}

function renderCourse(main, data, view) {
  const root = main.querySelector("#course");
  const parts = data.schedule.parts || [];
  const index = buildIndex(data, view);
  const params = new URLSearchParams(location.search);
  let part = parts.some((p) => p.id === location.hash.slice(1)) ? location.hash.slice(1) : parts[0]?.id;

  const partTabs = parts
    .map((p) => {
      const nums = (data.schedule.sessions || []).filter((s) => s.part === p.id).map((s) => s.num);
      const range = nums.length ? `${Math.min(...nums)}–${Math.max(...nums)}` : "";
      return `<button type="button" role="tab" class="part-tab part-${esc(p.id)}" data-part="${esc(p.id)}">
        <span class="part-tab-name">${esc(p.short || SOURCES[p.id] || p.title)}</span>
        <span class="part-tab-range">מפגשים <bdi dir="ltr">${range}</bdi></span>
      </button>`;
    })
    .join("");

  root.innerHTML = `
    <div class="search" role="search">
      <label for="q" class="visually-hidden">חיפוש שיעור</label>
      ${icon("search", "search-icon")}
      <input id="q" type="search" autocomplete="off" spellcheck="false"
        placeholder="חיפוש: לב, חיישן אור, רדיו, מוזיקה…" value="${esc(params.get("q") || "")}">
      <button type="button" class="search-clear" aria-label="ניקוי החיפוש" hidden>${icon("x")}</button>
    </div>
    <p class="search-status" aria-live="polite"></p>
    <div class="course-view">
      <div class="part-tabs" role="tablist" aria-label="חלקי הקורס">${partTabs}</div>
      <div class="part-panel" role="tabpanel"></div>
    </div>
    <div class="results-view" hidden></div>`;

  const input = root.querySelector("#q");
  const clear = root.querySelector(".search-clear");
  const status = root.querySelector(".search-status");
  const courseView = root.querySelector(".course-view");
  const resultsView = root.querySelector(".results-view");
  const panel = root.querySelector(".part-panel");

  function drawPart() {
    root.querySelectorAll(".part-tab").forEach((b) => b.setAttribute("aria-selected", b.dataset.part === part ? "true" : "false"));
    panel.innerHTML = sessionsHtml(data, view, part);
  }

  function drawSearch() {
    const q = input.value;
    const active = norm(q) !== "";
    clear.hidden = !q;
    courseView.hidden = active;
    resultsView.hidden = !active;
    const url = new URL(location.href);
    if (active) url.searchParams.set("q", q);
    else url.searchParams.delete("q");
    history.replaceState(null, "", url);
    if (!active) { status.textContent = ""; return; }
    const results = search(index, q);
    status.textContent = results.length ? `נמצאו ${results.length} שיעורים` : "";
    resultsView.innerHTML = resultsHtml(results, q, view);
  }

  root.querySelectorAll(".part-tab").forEach((b) =>
    b.addEventListener("click", () => {
      part = b.dataset.part;
      history.replaceState(null, "", `${location.pathname}${location.search}#${part}`);
      drawPart();
    })
  );
  input.addEventListener("input", drawSearch);
  input.addEventListener("keydown", (e) => {
    if (e.key === "Escape") { input.value = ""; drawSearch(); }
  });
  clear.addEventListener("click", () => { input.value = ""; drawSearch(); input.focus(); });
  // "/" jumps to the search field, like on most sites.
  document.addEventListener("keydown", (e) => {
    if (e.key === "/" && document.activeElement !== input && !/input|textarea|select/i.test(document.activeElement.tagName)) {
      e.preventDefault();
      input.focus();
    }
  });

  drawPart();
  drawSearch();
}

/* ------------------------------------------------------------------ */
/*  Guide: lesson bank                                                 */
/* ------------------------------------------------------------------ */

function renderBank(main, { schedule, lessons }) {
  const scheduled = new Set((schedule.sessions || []).flatMap((s) => s.lessons || []));
  const bank = Object.values(lessons).filter((l) => !scheduled.has(l.id));
  const el = main.querySelector("#bank");
  const src = main.querySelector("#f-source");
  const lvl = main.querySelector("#f-level");
  const q = main.querySelector("#f-search");

  function draw() {
    const term = norm(q.value);
    const shown = bank.filter(
      (l) =>
        (!src.value || l.source === src.value) &&
        (!lvl.value || l.level === lvl.value) &&
        (!term || term.split(" ").every((t) => norm(`${l.title} ${l.summary || ""} ${(l.concepts || []).join(" ")}`).includes(t)))
    );
    el.innerHTML = shown.length
      ? shown
          .map(
            (l) => `<li class="bank-item">
              <a href="${lessonUrl(l.id, "guide")}">${highlight(l.title, q.value)}</a>
              <span class="tags">${tags(l)}</span>
              ${l.summary || l.student?.goal ? `<p>${highlight(l.summary || l.student?.goal, q.value)}</p>` : ""}
            </li>`
          )
          .join("")
      : `<li class="empty"><p>לא נמצאו שיעורים במאגר.</p></li>`;
    main.querySelector("#bank-count").textContent = `${shown.length} שיעורים`;
  }
  [src, lvl, q].forEach((x) => x.addEventListener("input", draw));
  draw();
}

function setupTabs(main) {
  const buttons = main.querySelectorAll(".tabs button");
  buttons.forEach((b) =>
    b.addEventListener("click", () => {
      buttons.forEach((x) => {
        x.setAttribute("aria-selected", x === b ? "true" : "false");
        document.getElementById(x.dataset.tab).hidden = x !== b;
      });
    })
  );
}

/* ------------------------------------------------------------------ */
/*  Lesson page                                                        */
/* ------------------------------------------------------------------ */

// MakeCode always opens in Hebrew: its editor takes the UI language from "lang=" in the URL,
// ahead of the user's saved setting. Works for project links (#pub:…) and for the plain editor.
function makecodeUrl(url) {
  try {
    const u = new URL(url);
    if (!/(^|\.)makecode\.microbit\.org$/.test(u.hostname)) return url;
    u.searchParams.set("lang", "he");
    return u.toString();
  } catch {
    return url;
  }
}

function codeHtml(links) {
  const programs = links.code || [];
  if (!programs.length) {
    if (!links.makecode) return "";
    return `<section class="lesson-section code-panel">
      <h2>${icon("code")}כותבים את הקוד</h2>
      <p class="code-help">פותחים פרויקט חדש ב-MakeCode ובונים את הקוד לפי השלבים.</p>
      <div class="code-actions"><a class="btn" href="${esc(makecodeUrl(links.makecode))}" target="_blank" rel="noopener">${icon("external")}פתיחת MakeCode</a></div>
    </section>`;
  }
  const items = programs
    .map(
      (p) => `<div class="program">
        ${p.label ? `<h3>${esc(p.label)}</h3>` : ""}
        <div class="code-actions">
          ${p.makecode ? `<a class="btn" href="${esc(makecodeUrl(p.makecode))}" target="_blank" rel="noopener">${icon("external")}פתיחה ב-MakeCode</a>` : ""}
          ${p.hex ? `<a class="btn secondary" href="${esc(p.hex)}" download>${icon("download")}הורדת קובץ HEX</a>` : ""}
        </div>
      </div>`
    )
    .join("");
  return `<section class="lesson-section code-panel">
    <h2>${icon("code")}הקוד המלא</h2>
    <p class="code-help">${programs.length > 1 ? "בשיעור הזה יש שתי תוכניות – כל אחת על לוח אחר. " : ""}פותחים את הקוד המוכן ב-MakeCode, או מורידים קובץ HEX וגוררים אותו לכונן <span class="ltr">MICROBIT</span>.</p>
    ${items}
  </section>`;
}

function guideHtml(l) {
  const g = l.guide || {};
  const parts = [];
  if (g.objectives?.length) parts.push(`<div><h3>מטרות</h3>${list(g.objectives)}</div>`);
  if (g.materials?.length) parts.push(`<div><h3>ציוד</h3>${list(g.materials)}</div>`);
  if (g.prep) parts.push(`<div><h3>הכנה מראש</h3><p>${fmt(g.prep)}</p></div>`);
  if (g.flow?.length) parts.push(`<div><h3>מהלך השיעור</h3>${list(g.flow, true)}</div>`);
  if (g.common_mistakes?.length) parts.push(`<div><h3>טעויות נפוצות</h3>${list(g.common_mistakes)}</div>`);
  if (g.extension) parts.push(`<div><h3>הרחבה לתלמידים מהירים</h3><p>${fmt(g.extension)}</p></div>`);
  if (!parts.length && l.summary) parts.push(`<div><p>${fmt(l.summary)}</p></div>`);
  return `<details class="guide-notes" open>
    <summary>${icon("clipboard")}<span>הערות למדריך</span>${g.duration ? `<span class="duration">${fmt(g.duration)}</span>` : ""}</summary>
    <div class="guide-grid">${parts.join("")}</div>
  </details>`;
}

// The lesson page serves both views: show the guide link and mark the current page to match.
function markNav(view) {
  const nav = document.querySelector(".site-header nav");
  if (!nav) return;
  if (view === "guide" && !nav.querySelector('a[href="guide.html"]'))
    nav.insertAdjacentHTML("beforeend", '<a href="guide.html">מדריכים</a>');
  const cur = nav.querySelector(`a[href="${view === "guide" ? "guide.html" : "student.html"}"]`);
  if (cur) cur.setAttribute("aria-current", "page");
}

function renderLesson(main, { schedule, lessons, sessionOf }) {
  const params = new URLSearchParams(location.search);
  const id = params.get("id");
  const view = params.get("view") === "guide" ? "guide" : "student";
  const l = lessons[id];
  markNav(view);
  if (!l) {
    main.innerHTML = `<div class="empty"><p><strong>השיעור לא נמצא.</strong></p><p><a href="student.html">חזרה לרשימת המפגשים</a></p></div>`;
    return;
  }
  document.title = `${l.title} | מעבדת מיקרוביט – טכנודע`;
  const session = sessionOf[id];
  const back = `${view === "guide" ? "guide.html" : "student.html"}${session ? `#${session.part}` : ""}`;
  const st = l.student || {};
  const links = l.links || {};

  // Other lessons in the same session, for moving on without going back to the list.
  const siblings = session ? (session.lessons || []).filter((x) => x !== id && lessons[x]) : [];

  let html = `<nav class="crumb"><a href="${back}">${icon("back")}${
    session ? `מפגש ${esc(session.num)}: ${esc(session.title)}` : view === "guide" ? "דף המדריך" : "כל המפגשים"
  }</a></nav>
    <header class="lesson-head">
      <h1>${esc(l.title)}</h1>
      <div class="tags">${tags(l)}</div>
    </header>`;

  if (view === "guide") {
    html += guideHtml(l);
    html += `<div class="view-divider"><span>מה התלמידים רואים</span><a href="${lessonUrl(id, "student")}">פתיחת דף התלמיד</a></div>`;
  }

  if (st.intro) html += `<p class="lead">${fmt(st.intro)}</p>`;
  if (st.goal) html += `<p class="goal">${icon("target")}<span><strong>היום נבנה:</strong> ${fmt(st.goal)}</span></p>`;
  if (st.concept) html += `<section class="lesson-section concept"><h2>${icon("sparkle")}רעיון חדש</h2><p>${fmt(st.concept)}</p></section>`;
  if (st.steps?.length) html += `<section class="lesson-section steps"><h2>שלב אחרי שלב</h2>${list(st.steps, true)}</section>`;
  if (l.images?.length)
    html += `<section class="lesson-section"><h2>${icon("image")}כך נראה הקוד</h2>${l.images
      .map((src) => `<img class="code-img" src="${esc(src)}" alt="תמונת הקוד של ${esc(l.title)}" loading="lazy">`)
      .join("")}</section>`;

  html += codeHtml(links);

  if (st.tip || st.challenge) {
    html += `<div class="extras">
      ${st.tip ? `<section class="extra tip"><h2>${icon("bulb")}טיפ</h2><p>${fmt(st.tip)}</p></section>` : ""}
      ${st.challenge ? `<section class="extra challenge"><h2>${icon("rocket")}אתגר</h2><p>${fmt(st.challenge)}</p></section>` : ""}
    </div>`;
  }

  if (siblings.length)
    html += `<nav class="next-up" aria-label="עוד במפגש הזה"><span>עוד במפגש הזה:</span>${siblings
      .map((x) => `<a href="${lessonUrl(x, view)}">${esc(lessons[x].title)}</a>`)
      .join("")}</nav>`;

  // Previous / next lesson in course order (bank lessons that aren't scheduled have none).
  const order = (schedule.sessions || []).flatMap((s) => (s.lessons || []).filter((x) => lessons[x]));
  const at = order.indexOf(id);
  if (at !== -1) {
    const prev = order[at - 1], next = order[at + 1];
    html += `<nav class="pager" aria-label="מעבר בין שיעורים">${
      prev ? `<a class="prev" href="${lessonUrl(prev, view)}"><small>${icon("back")}השיעור הקודם</small>${esc(lessons[prev].title)}</a>` : "<span></span>"
    }${next ? `<a class="next" href="${lessonUrl(next, view)}"><small>השיעור הבא${icon("back", "flip")}</small>${esc(lessons[next].title)}</a>` : ""}</nav>`;
  }

  const foot = [];
  if (links.source) foot.push(`<a href="${esc(links.source)}" target="_blank" rel="noopener">${icon("external")}השיעור המקורי</a>`);
  if (view === "guide" && links.slides) foot.push(`<a href="${esc(links.slides)}">${icon("download")}מצגת (pptx)</a>`);
  foot.push(`<button type="button" onclick="window.print()">${icon("printer")}הדפסה</button>`);
  html += `<div class="lesson-foot">${foot.join("")}</div>`;

  main.innerHTML = html;
}

document.addEventListener("DOMContentLoaded", async () => {
  const page = document.body.dataset.page;
  const main = document.querySelector("main");
  if (page === "home") return;
  let data;
  try {
    data = await loadAll();
  } catch (e) {
    main.innerHTML = `<div class="warning">${esc(e.message)}. אם פתחתם את הקובץ ישירות מהמחשב – צריך להריץ שרת מקומי (ראו README).</div>`;
    return;
  }
  if (page === "student") renderCourse(main, data, "student");
  if (page === "guide") {
    renderCourse(main, data, "guide");
    renderBank(main, data);
    setupTabs(main);
  }
  if (page === "lesson") renderLesson(main, data);
  warn(main, data.problems);
});
