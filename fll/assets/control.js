// לוח בקרה למדריך: reads data/season.yml and renders phases, tasks, judging self-rating and links.
// Progress (checked tasks, ratings, notes) lives in this browser's localStorage, with export/import to a file.

const STORE_KEY = "fll-control-v1";
const DAY = 86400000;

const store = {
  get(k, d) { try { const v = localStorage.getItem(k); return v === null ? d : JSON.parse(v); } catch (e) { return d; } },
  set(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch (e) {} },
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
  return isNaN(d) ? null : d;
}
function showDate(d) {
  return `${d.getDate()}.${d.getMonth() + 1}`;
}
function today() {
  const n = new Date();
  return new Date(n.getFullYear(), n.getMonth(), n.getDate());
}
function safeUrl(u) {
  return /^(https?:\/\/|[\w.-]+\.html)/i.test(String(u ?? "")) ? u : "";
}
function isExternal(u) {
  return /^https?:\/\//i.test(u);
}

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
    if (p.from && !from) problems.push(`בשלב "${p.title}" התאריך from לא בפורמט 2026-10-20.`);
    if (p.to && !to) problems.push(`בשלב "${p.title}" התאריך to לא בפורמט 2026-10-20.`);
    const tasks = (p.tasks || []).filter(Boolean).map((t, ti) => {
      const id = t.id || `${pid}-${ti + 1}`;
      if (seen.has(id)) problems.push(`המזהה "${id}" מופיע פעמיים – לכל משימה צריך id אחר.`);
      seen.add(id);
      if (t.area && !areas[t.area]) problems.push(`במשימה "${id}" התחום "${t.area}" לא מוגדר ב-areas.`);
      const due = parseDate(t.due);
      if (t.due && !due) problems.push(`במשימה "${id}" התאריך due לא בפורמט 2026-10-20.`);
      return { ...t, id, due, phase: pid };
    });
    return { ...p, id: pid, from, to, tasks };
  });
  const comp = data.season?.competition || {};
  const compDate = parseDate(comp.date);
  if (!compDate) problems.push("בחלק season חסר תאריך תחרות (competition.date) בפורמט 2027-01-28.");
  return { season: data.season || {}, comp, compDate, areas, phases, judging: data.judging || [], levels: data.rating_levels || ["1", "2", "3", "4"], links: data.links || [], problems };
}

const state = Object.assign({ done: {}, ratings: {}, notes: {}, who: "all", area: "all", hideDone: false }, store.get(STORE_KEY, {}));
function save() { store.set(STORE_KEY, state); }

function phaseStatus(p, now) {
  if (p.to && now > p.to) return "done";
  if (p.from && now < p.from) return "later";
  return "now";
}
function dueState(t, now) {
  if (!t.due || state.done[t.id]) return "";
  if (t.due < now) return "late";
  if (t.due - now <= 14 * DAY) return "soon";
  return "";
}
function whoClass(who) {
  return /מדריך/.test(who || "") ? "who-guide" : /קבוצה/.test(who || "") ? "who-team" : "";
}

function taskHtml(t, S, now) {
  const area = S.areas[t.area];
  const ds = dueState(t, now);
  const link = t.link && safeUrl(t.link.url);
  const meta = [
    t.who ? `<span class="tg ${whoClass(t.who)}">${esc(t.who)}</span>` : "",
    area ? `<span class="tg">${esc(area.emoji || "")} ${esc(area.title)}</span>` : "",
    t.due ? `<span class="tg ${ds}">${ds === "late" ? "באיחור · " : ""}עד ${showDate(t.due)}</span>` : "",
    t.verify ? `<span class="tg verify" title="מידע שעוד לא אומת מול FIRST ישראל">⚠ לבדוק</span>` : "",
    link ? `<a class="tlink" href="${esc(link)}"${isExternal(link) ? ' target="_blank" rel="noopener"' : ""}>🔗 ${esc(t.link.title || "קישור")}</a>` : "",
  ].join("");
  return `<li data-id="${esc(t.id)}" data-who="${esc(t.who || "")}" data-area="${esc(t.area || "")}">
    <input type="checkbox" id="t-${esc(t.id)}" ${state.done[t.id] ? "checked" : ""}>
    <div class="t"><label for="t-${esc(t.id)}">${fmt(t.text)}</label><div class="meta">${meta}</div></div>
  </li>`;
}

function render(app, S) {
  const now = today();
  const all = S.phases.flatMap((p) => p.tasks);
  const daysLeft = S.compDate ? Math.max(0, Math.ceil((S.compDate - now) / DAY)) : null;

  let html = "";
  if (S.problems.length)
    html += `<div class="warnbox"><strong>⚠ יש בעיות בקובץ data/season.yml</strong> – העמוד מוצג, אבל כדאי לתקן:<ul>${S.problems.map((p) => `<li>${esc(p)}</li>`).join("")}</ul></div>`;

  // hero
  html += `<div class="hero"><div class="hero-grid"><div>
      <div class="tag">${esc(S.season.title || "")}</div>
      <h1>לוח בקרה למדריך</h1>
      ${S.season.intro ? `<p>${fmt(S.season.intro)}</p>` : ""}
      <div class="bigbar" role="progressbar" aria-label="התקדמות כללית" aria-valuemin="0" aria-valuemax="100"><div id="bigbar"></div></div>
      <div class="barlbl" id="barlbl"></div>
    </div>
    <div class="countdown" aria-live="polite">
      <div class="lbl">עד ${esc(S.comp.title || "התחרות")}${S.compDate ? ` (${showDate(S.compDate)}.${S.compDate.getFullYear()})` : ""}${S.comp.verify ? " ⚠" : ""}</div>
      <div class="num">${daysLeft ?? "–"}</div>
      <div class="lbl">${daysLeft != null ? `ימים · כ-${Math.ceil(daysLeft / 7)} שבועות` : "ימים"}</div>
    </div></div></div>`;

  // what now
  html += `<section id="now" class="block"><h2>מה עכשיו?</h2><div class="now-grid" id="nowGrid"></div></section>`;

  // phases
  const areaBtns = Object.values(S.areas)
    .map((a) => `<button type="button" class="fbtn" data-area="${esc(a.id)}">${esc(a.emoji || "")} ${esc(a.title)}</button>`)
    .join("");
  html += `<section id="phases" class="block"><h2>שלבי העונה</h2>
    <div class="toolbar" role="group" aria-label="סינון משימות">
      <span class="lbl">מי:</span>
      <button type="button" class="fbtn" data-who="all">כולם</button>
      <button type="button" class="fbtn" data-who="מדריך">מדריך</button>
      <button type="button" class="fbtn" data-who="קבוצה">קבוצה</button>
      <span class="sep"></span>
      <span class="lbl">תחום:</span>
      <button type="button" class="fbtn" data-area="all">הכול</button>${areaBtns}
      <span class="sep"></span>
      <button type="button" class="fbtn" id="hideDone">הסתרת משימות שבוצעו</button>
    </div>
    ${S.phases.map((p) => {
      const st = phaseStatus(p, now);
      const hasLate = p.tasks.some((t) => dueState(t, now) === "late");
      const dates = p.from && p.to ? `${showDate(p.from)} – ${showDate(p.to)}` : "";
      return `<details class="phase is-${st}" id="ph-${esc(p.id)}" ${st === "now" || hasLate ? "open" : ""}>
        <summary>
          <span class="emo" aria-hidden="true">${esc(p.emoji || "📌")}</span>
          <h3>${esc(p.title)}${st === "now" ? '<span class="pill-status now">עכשיו</span>' : st === "done" ? '<span class="pill-status done">הסתיים</span>' : ""}</h3>
          <span class="side"><b data-count="${esc(p.id)}"></b><small>בוצעו</small></span>
          <span class="dates">${dates}</span>
          <div class="progress"><div data-bar="${esc(p.id)}"></div></div>
        </summary>
        <div class="body">
          ${p.goal ? `<p class="goal">${fmt(p.goal)}</p>` : ""}
          <ul class="tasks">${p.tasks.map((t) => taskHtml(t, S, now)).join("")}</ul>
          <div class="notes"><label for="n-${esc(p.id)}">📝 הערות מדריך לשלב הזה</label>
            <textarea id="n-${esc(p.id)}" data-note="${esc(p.id)}" placeholder="מה עבד, מה לא, מה לזכור לפעם הבאה…">${esc(state.notes[p.id] || "")}</textarea></div>
        </div>
      </details>`;
    }).join("")}
  </section>`;

  // judging
  html += `<section id="judging" class="block"><h2>ארבעת תחומי השיפוט – דירוג עצמי</h2>
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

  // links
  html += `<section id="links" class="block"><h2>🔗 קישורים וקבצים</h2>${S.links.map((g) => `
    <h3>${esc(g.group || "")}</h3>
    <div class="links">${(g.items || []).map((it) => {
      const u = safeUrl(it.url);
      if (!u) return "";
      const ext = isExternal(u);
      return `<a class="link" href="${esc(u)}"${ext ? ' target="_blank" rel="noopener"' : ""}>
        <span class="ico" aria-hidden="true">${esc(it.emoji || "🔗")}</span>
        <span>${esc(it.title)}${it.verify ? ' <span class="tg verify">⚠ לבדוק</span>' : ""}<small>${esc(ext ? u.replace(/^https?:\/\/(www\.)?/, "") : u)}</small></span>
      </a>`;
    }).join("")}</div>`).join("")}
  </section>`;

  // backup
  html += `<section id="data" class="block"><h2>💾 גיבוי והעברה בין מכשירים</h2>
    <p>הסימונים, הדירוגים וההערות נשמרים <b>רק בדפדפן הזה</b>. כדי להעביר למחשב אחר או למדריך נוסף: שומרים לקובץ, ובמכשיר השני טוענים אותו.</p>
    <div class="data-actions">
      <button type="button" class="btn" id="exportBtn">⬇ שמירה לקובץ</button>
      <label class="btn ghost" for="importFile" style="cursor:pointer">⬆ טעינה מקובץ</label>
      <input type="file" id="importFile" accept="application/json,.json" hidden>
      <button type="button" class="btn ghost" id="printBtn">🖨 הדפסה</button>
      <button type="button" class="btn ghost" id="resetBtn">ניקוי כל הסימונים</button>
    </div>
    <div class="status-msg" id="statusMsg" role="status"></div>
  </section>`;

  html += `<footer>לוח בקרה למדריך · FIRST® LEGO® League. התוכן נערך בקובץ <span dir="ltr">fll/data/season.yml</span>.</footer>`;
  app.innerHTML = html;

  wire(app, S);
  refresh(app, S);
}

function refresh(app, S) {
  const now = today();
  const all = S.phases.flatMap((p) => p.tasks);
  const done = all.filter((t) => state.done[t.id]).length;
  const pct = all.length ? Math.round((done / all.length) * 100) : 0;
  app.querySelector("#bigbar").style.width = pct + "%";
  app.querySelector(".bigbar").setAttribute("aria-valuenow", pct);
  app.querySelector("#barlbl").textContent = `בוצעו ${done} מתוך ${all.length} משימות (${pct}%)`;

  for (const p of S.phases) {
    const d = p.tasks.filter((t) => state.done[t.id]).length;
    app.querySelector(`[data-count="${CSS.escape(p.id)}"]`).textContent = `${d}/${p.tasks.length}`;
    app.querySelector(`[data-bar="${CSS.escape(p.id)}"]`).style.width = (p.tasks.length ? (d / p.tasks.length) * 100 : 0) + "%";
  }

  // filters
  app.querySelectorAll("[data-who]").forEach((b) => b.setAttribute("aria-pressed", b.dataset.who === state.who));
  app.querySelectorAll(".fbtn[data-area]").forEach((b) => b.setAttribute("aria-pressed", b.dataset.area === state.area));
  app.querySelector("#hideDone").setAttribute("aria-pressed", state.hideDone);
  app.querySelectorAll(".tasks li").forEach((li) => {
    const okWho = state.who === "all" || li.dataset.who.includes(state.who);
    const okArea = state.area === "all" || li.dataset.area === state.area;
    const okDone = !(state.hideDone && state.done[li.dataset.id]);
    li.hidden = !(okWho && okArea && okDone);
  });

  // what now
  const current = S.phases.filter((p) => phaseStatus(p, now) === "now");
  const late = all.filter((t) => dueState(t, now) === "late").sort((a, b) => a.due - b.due);
  const soon = all.filter((t) => dueState(t, now) === "soon").sort((a, b) => a.due - b.due);
  const item = (t) => `<a class="phase-link" href="#ph-${esc(t.phase)}" data-open="${esc(t.phase)}">${fmt(t.text)}<small>עד ${showDate(t.due)} · ${esc(t.who || "")}</small></a>`;
  app.querySelector("#nowGrid").innerHTML = `
    <div class="card now-card current"><h3>📍 השלבים של עכשיו<span class="count">${current.length}</span></h3>${
      current.length ? current.map((p) => {
        const left = p.tasks.filter((t) => !state.done[t.id]).length;
        return `<a class="phase-link" href="#ph-${esc(p.id)}" data-open="${esc(p.id)}">${esc(p.emoji || "")} ${esc(p.title)}<small>${left ? `נשארו ${left} משימות` : "הכול בוצע ✓"}${p.to ? ` · עד ${showDate(p.to)}` : ""}</small></a>`;
      }).join("") : '<p class="empty">אין שלב פעיל היום.</p>'
    }</div>
    <div class="card now-card late"><h3>⏰ באיחור<span class="count">${late.length}</span></h3>${late.length ? late.map(item).join("") : '<p class="empty">אין משימות באיחור 👏</p>'}</div>
    <div class="card now-card soon"><h3>🗓️ בשבועיים הקרובים<span class="count">${soon.length}</span></h3>${soon.length ? soon.map(item).join("") : '<p class="empty">אין משימות עם תאריך יעד בשבועיים הקרובים.</p>'}</div>`;
}

function wire(app, S) {
  app.addEventListener("change", (e) => {
    const el = e.target;
    if (el.matches(".tasks input[type=checkbox]")) {
      const id = el.closest("li").dataset.id;
      if (el.checked) state.done[id] = true; else delete state.done[id];
      save(); refresh(app, S);
    } else if (el.dataset.rate) {
      state.ratings[el.dataset.rate] = +el.value;
      save();
    }
  });
  app.addEventListener("input", (e) => {
    if (e.target.dataset.note) { state.notes[e.target.dataset.note] = e.target.value; save(); }
  });
  app.addEventListener("click", (e) => {
    const b = e.target.closest("button, a[data-open]");
    if (!b) return;
    if (b.dataset.open) { const d = document.getElementById("ph-" + b.dataset.open); if (d) d.open = true; return; }
    if (b.dataset.who) { state.who = b.dataset.who; save(); refresh(app, S); }
    else if (b.dataset.area) { state.area = b.dataset.area; save(); refresh(app, S); }
    else if (b.id === "hideDone") { state.hideDone = !state.hideDone; save(); refresh(app, S); }
    else if (b.id === "printBtn") { app.querySelectorAll("details.phase").forEach((d) => (d.open = true)); window.print(); }
    else if (b.id === "exportBtn") exportState();
    else if (b.id === "resetBtn") {
      if (!confirm("למחוק את כל הסימונים, הדירוגים וההערות בדפדפן הזה?")) return;
      state.done = {}; state.ratings = {}; state.notes = {}; save(); render(app, S);
      msg("כל הסימונים נמחקו.");
    }
  });
  app.querySelector("#importFile").addEventListener("change", async (e) => {
    const f = e.target.files[0];
    if (!f) return;
    try {
      const d = JSON.parse(await f.text());
      if (!d || typeof d !== "object" || !d.done) throw new Error();
      state.done = d.done || {}; state.ratings = d.ratings || {}; state.notes = d.notes || {};
      save(); render(app, S);
      msg(`נטען מהקובץ ${f.name}.`);
    } catch (err) {
      msg("הקובץ לא נראה כמו גיבוי של לוח הבקרה – לא נטען כלום.");
    }
  });
}

function exportState() {
  const data = { saved: new Date().toISOString(), done: state.done, ratings: state.ratings, notes: state.notes };
  const a = document.createElement("a");
  a.href = URL.createObjectURL(new Blob([JSON.stringify(data, null, 2)], { type: "application/json" }));
  const d = today();
  a.download = `fll-control-${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}.json`;
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
    render(app, prepare(await loadSeason()));
  } catch (e) {
    app.innerHTML = `<div class="warnbox"><strong>⚠ ${esc(e.message)}</strong><br>אם פתחתם את הקובץ ישירות מהמחשב – צריך שרת מקומי (ראו README).</div>`;
  }
});
