// עמוד הצבעות: reads data/vote.yml and runs show-of-hands votes in class (projector-friendly).
// Each poll: 💡 suggestions → ✋ vote (the guide clicks the count) → 🏆 result. Everything is saved
// automatically in this browser (localStorage). The logo topic is three small polls + a ready AI prompt.
// Helpers (store/esc/fmt/theme/YAML warnings) are copied from control.js until the shared engine (M2).

const STORE_KEY = "fll-vote-v1";
const CONTROL_KEY = "fll-control-v1"; // the control board's saved marks – used to tick a task when a vote is decided

const store = {
  get(k, d) { try { const v = localStorage.getItem(k); return v === null ? d : JSON.parse(v); } catch (e) { return d; } },
  set(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); return true; } catch (e) { return false; } },
};

/* theme toggle – shared with the other FLL pages */
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

/* full screen for the projector */
(function () {
  const btn = document.getElementById("fsBtn");
  if (!document.documentElement.requestFullscreen) { btn.hidden = true; return; }
  btn.addEventListener("click", () => {
    if (document.fullscreenElement) document.exitFullscreen();
    else document.documentElement.requestFullscreen().catch(() => {});
  });
  document.addEventListener("fullscreenchange", () => {
    document.body.classList.toggle("fs", !!document.fullscreenElement);
    btn.setAttribute("aria-pressed", !!document.fullscreenElement);
  });
})();

function esc(s) {
  return String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);
}
function fmt(s) {
  return esc(s).replace(/\*\*(.+?)\*\*/g, "<strong>$1</strong>");
}
function uid() {
  return "o" + Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
}
function showDate(iso) {
  const d = new Date(iso);
  return isNaN(d) ? "" : `${d.getDate()}.${d.getMonth() + 1}.${d.getFullYear()}`;
}

/* ---------- content ---------- */
// used only if data/vote.yml can't be loaded – the page still works, with empty topics
const FALLBACK = {
  topics: [
    { id: "name", title: "שם הקבוצה", emoji: "🏷️", question: "איך תיקרא הקבוצה שלנו?", task: "team-name" },
    { id: "problem", title: "בעיה לחקר", emoji: "🔎", question: "איזו בעיה נחקור?", task: "res-choose" },
    { id: "focus", title: "מיקוד החקר", emoji: "🎯", question: "על איזה חלק של הבעיה נתמקד?", after: "problem" },
    { id: "missions", title: "משימות במשחק הרובוט", emoji: "🤖", question: "באילו משימות נתחיל?", keep: 3, task: "str-runs" },
  ],
};

async function loadContent() {
  try {
    const res = await fetch("data/vote.yml", { cache: "no-cache" });
    if (!res.ok) throw new Error(`לא הצלחתי לטעון את הקובץ data/vote.yml (${res.status}) – העמוד עובד בלי רעיונות להשראה.`);
    const text = await res.text();
    try {
      return { data: jsyaml.load(text) || {}, problems: [] };
    } catch (e) {
      const line = e.mark ? ` (בערך בשורה ${e.mark.line + 1})` : "";
      throw new Error(`יש טעות כתיבה בקובץ data/vote.yml${line}. בדקו רווחים בתחילת השורה ומירכאות. בינתיים העמוד עובד בלי רעיונות להשראה.`);
    }
  } catch (e) {
    return { data: FALLBACK, problems: [e.message] };
  }
}

// Turn the YAML into a flat list of polls; collect problems instead of breaking the page.
function prepare(data, problems) {
  const asList = (v, where) => {
    if (v === undefined || v === null) return [];
    if (Array.isArray(v)) return v.filter((x) => x !== null && x !== undefined);
    problems.push(`ב-${where} צריך רשימה (כל שורה מתחילה ב-"-").`);
    return [];
  };
  const keepOf = (v, where) => {
    if (v === undefined || v === null) return 1;
    const n = Number(v);
    if (Number.isInteger(n) && n >= 1 && n <= 20) return n;
    problems.push(`ב-${where} השדה keep צריך להיות מספר שלם (1, 2, 3…). כרגע: "${v}".`);
    return 1;
  };
  const optionOf = (o, where) => {
    if (typeof o === "string" || typeof o === "number") return { text: String(o) };
    if (o && typeof o === "object" && o.name) {
      let hex = o.hex ? String(o.hex).trim() : "";
      if (hex && !/^#[0-9a-f]{3}([0-9a-f]{3})?$/i.test(hex)) {
        problems.push(`ב-${where} הצבע "${o.hex}" של "${o.name}" לא בפורמט #14b8a6.`);
        hex = "";
      }
      return { text: String(o.name), en: o.en ? String(o.en) : "", hex, emoji: o.emoji ? String(o.emoji) : "" };
    }
    problems.push(`ב-${where} יש אפשרות בלי name.`);
    return null;
  };

  const topics = [];
  const polls = {};
  const seen = new Set();
  const missions = asList(data.robot_missions, "robot_missions").map((m) => String(m));
  const logo = data.logo || null;

  asList(data.topics, "topics").forEach((t, i) => {
    if (!t.id) { problems.push(`לנושא מספר ${i + 1} ("${t.title || ""}") אין id – הוא לא מוצג.`); return; }
    if (seen.has(t.id)) { problems.push(`המזהה "${t.id}" מופיע פעמיים ב-topics.`); return; }
    seen.add(t.id);
    const topic = { id: String(t.id), title: t.title || t.id, emoji: t.emoji || "🗳️", question: t.question || t.title || "", polls: [] };
    if (t.id === "logo") {
      if (!logo) { problems.push('יש נושא "logo" אבל אין חלק logo בקובץ – הנושא לא מוצג.'); return; }
      asList(logo.parts, "logo → parts").forEach((p, pi) => {
        if (!p.id) { problems.push(`לחלק מספר ${pi + 1} של הלוגו אין id.`); return; }
        const id = `logo-${p.id}`;
        polls[id] = {
          id, part: String(p.id), topic: topic.id, title: p.title || p.id, emoji: p.emoji || "🎨",
          question: p.question || p.title || "", keep: keepOf(p.keep, `logo → ${p.id}`), task: "",
          prefill: asList(p.options, `logo → ${p.id} → options`).map((o) => optionOf(o, `logo → ${p.id}`)).filter(Boolean),
          ideas: [], prompts: [], note: p.note || "",
        };
        topic.polls.push(id);
      });
      topic.prompt_en = logo.prompt_en || "Logo: {symbol}, colors {colors}, style {style}, no text.";
      topic.prompt_he = logo.prompt_he || "לוגו: {symbol}, צבעים {colors}, סגנון {style}, בלי טקסט.";
    } else {
      const ideas = asList(t.ideas, `topics → ${t.id} → ideas`).map((o) => optionOf(o, `topics → ${t.id}`)).filter(Boolean);
      if (t.id === "missions") missions.forEach((m) => ideas.push({ text: m }));
      polls[topic.id] = {
        id: topic.id, topic: topic.id, title: topic.title, emoji: topic.emoji, question: topic.question,
        keep: keepOf(t.keep, `topics → ${t.id}`), task: t.task ? String(t.task) : "", after: t.after ? String(t.after) : "",
        prefill: [], ideas, prompts: asList(t.prompts, `topics → ${t.id} → prompts`).map(String), note: t.note || "",
      };
      topic.polls.push(topic.id);
    }
    if (topic.polls.length) topics.push(topic);
  });
  for (const p of Object.values(polls)) {
    if (p.after && !polls[p.after]) problems.push(`בנושא "${p.id}" השדה after מצביע על "${p.after}", שלא קיים.`);
  }
  return { topics, polls, problems };
}

/* ---------- saved state (automatic) ---------- */
const vstate = Object.assign({ polls: {}, topic: null, part: {} }, store.get(STORE_KEY, {}));
let toastTimer;
function save(quiet) {
  const ok = store.set(STORE_KEY, vstate);
  if (quiet && ok) return;
  const el = document.getElementById("toast");
  el.textContent = ok ? "✓ נשמר" : "⚠ הדפדפן לא מאפשר לשמור (חלון פרטי?) – ההצבעות יימחקו בסגירה";
  el.classList.toggle("bad", !ok);
  el.classList.add("show");
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => el.classList.remove("show"), ok ? 1300 : 5000);
}
function newOption(o) {
  return { id: uid(), text: o.text, en: o.en || "", hex: o.hex || "", emoji: o.emoji || "", votes: 0, locked: false, lockedVotes: 0, out: false };
}
// the saved state of one poll, created on first use (logo parts start with their options already in)
function ps(poll) {
  let s = vstate.polls[poll.id];
  if (!s) {
    s = vstate.polls[poll.id] = { stage: poll.prefill.length ? "vote" : "ideas", options: poll.prefill.map(newOption), present: null, round: 1, keep: poll.keep, decidedAt: null };
  }
  if (!s.keep) s.keep = poll.keep;
  return s;
}

/* ---------- vote maths ---------- */
function ranking(s) {
  const locked = s.options.filter((o) => o.locked).sort((a, b) => b.lockedVotes - a.lockedVotes);
  const active = s.options.filter((o) => !o.locked && !o.out).sort((a, b) => b.votes - a.votes);
  return [...locked, ...active];
}
function analyze(s) {
  const r = ranking(s);
  const keep = Math.min(s.keep, r.length);
  const winners = r.slice(0, keep);
  let tie = null;
  if (r.length > keep && keep > 0) {
    const a = r[keep - 1], b = r[keep];
    if (!a.locked && !b.locked && a.votes === b.votes) tie = r.filter((o) => !o.locked && !o.out && o.votes === a.votes);
  }
  const voting = s.options.filter((o) => !o.locked && !o.out);
  const total = voting.reduce((n, o) => n + o.votes, 0);
  return { r, winners, tie, total, voting };
}
// decided = reached the result stage, someone voted, and no tie on the edge of the winners
function decided(s) {
  if (!s || s.stage !== "result") return null;
  const a = analyze(s);
  return a.total > 0 && !a.tie && a.winners.length ? a.winners : null;
}

/* ---------- rendering ---------- */
let C; // prepared content

function topicStatus(topic) {
  const all = topic.polls.map((id) => vstate.polls[id]);
  const done = topic.polls.map((id) => decided(vstate.polls[id]));
  if (done.every(Boolean)) {
    return { cls: "done", text: topic.polls.length === 1 ? "✓ " + done[0].map((o) => o.text).join(", ") : "✓ הוחלט" };
  }
  if (all.some((s) => s && (s.options.length || s.stage !== "ideas"))) return { cls: "doing", text: "בתהליך…" };
  return { cls: "", text: "עוד לא התחלנו" };
}

function show() {
  const app = document.getElementById("app");
  let html = "";
  if (C.problems.length)
    html += `<div class="warnbox"><strong>⚠ יש בעיות בקובץ data/vote.yml</strong> – העמוד מוצג, אבל כדאי לתקן:<ul>${C.problems.map((p) => `<li>${esc(p)}</li>`).join("")}</ul></div>`;
  html += `<div class="vhero"><h1>🗳️ מחליטים ביחד</h1>
    <p>הילדים מציעים, מצביעים בהרמת ידיים, והמדריך סופר ומקליק. הכול נשמר לבד.</p></div>`;
  html += `<nav class="topics" aria-label="נושאים להצבעה">${C.topics.map((t) => {
    const st = topicStatus(t);
    return `<a href="#${esc(t.id)}" class="topic ${st.cls}" ${t.id === vstate.topic ? 'aria-current="page"' : ""}>
      <span class="temo" aria-hidden="true">${esc(t.emoji)}</span><b>${esc(t.title)}</b><small>${esc(st.text)}</small></a>`;
  }).join("")}<a href="#summary" class="topic sum ${vstate.topic === "summary" ? "" : ""}" ${vstate.topic === "summary" ? 'aria-current="page"' : ""}>
      <span class="temo" aria-hidden="true">📋</span><b>ההחלטות שלנו</b><small>סיכום והדפסה</small></a></nav>`;

  if (vstate.topic === "summary") html += summaryHtml();
  else {
    const topic = C.topics.find((t) => t.id === vstate.topic) || C.topics[0];
    if (topic) html += topicHtml(topic);
  }
  html += `<footer>הצבעות · FIRST® LEGO® League. הרעיונות להשראה נערכים בקובץ <span dir="ltr">fll/data/vote.yml</span>.</footer>`;
  app.innerHTML = html;
  // animate the result bars from 0
  requestAnimationFrame(() => app.querySelectorAll(".bar > i[data-w]").forEach((i) => (i.style.width = i.dataset.w + "%")));
}

function topicHtml(topic) {
  if (topic.polls.length === 1) return pollHtml(C.polls[topic.polls[0]]);
  // the logo: switch between its parts + the AI prompt
  const cur = vstate.part[topic.id] && topic.polls.includes(vstate.part[topic.id]) ? vstate.part[topic.id] : topic.polls[0];
  return `<div class="parts" role="group" aria-label="חלקי ${esc(topic.title)}">${topic.polls.map((id) => {
      const p = C.polls[id], d = decided(vstate.polls[id]);
      return `<button type="button" class="part ${id === cur ? "on" : ""} ${d ? "done" : ""}" data-part="${esc(id)}" data-topic="${esc(topic.id)}" aria-pressed="${id === cur}">
        ${esc(p.emoji)} ${esc(p.title)}${d ? ` <small>✓ ${esc(d.map((o) => o.text).join(" + "))}</small>` : ""}</button>`;
    }).join("")}</div>
    ${pollHtml(C.polls[cur])}
    ${logoPromptHtml(topic)}`;
}

function optLabel(o) {
  return `${o.hex ? `<span class="sw" style="background:${esc(o.hex)}" aria-hidden="true"></span>` : ""}${o.emoji ? `<span aria-hidden="true">${esc(o.emoji)}</span> ` : ""}${esc(o.text)}`;
}

function pollHtml(poll) {
  const s = ps(poll);
  const steps = [["ideas", "💡 הצעות"], ["vote", "✋ הצבעה"], ["result", "🏆 תוצאה"]];
  const si = steps.findIndex((x) => x[0] === s.stage);
  let after = "";
  if (poll.after) {
    const ap = C.polls[poll.after];
    const d = decided(vstate.polls[poll.after]);
    after = d
      ? `<p class="after">${esc(ap ? ap.title : "")}: <b>${esc(d.map((o) => o.text).join(", "))}</b></p>`
      : `<p class="after warn">💡 כדאי קודם להחליט על <a href="#${esc(poll.after)}">${esc(ap ? ap.title : poll.after)}</a>.</p>`;
  }
  let body = "";
  if (s.stage === "ideas") body = ideasStage(poll, s);
  else if (s.stage === "vote") body = voteStage(poll, s);
  else body = resultStage(poll, s);
  return `<section class="poll stage-${s.stage}" id="poll" data-poll="${esc(poll.id)}">
    <div class="qhead">
      <h2 class="question">${esc(poll.question)}</h2>
      ${after}
      <ol class="steps">${steps.map(([k, label], i) => `<li class="${i === si ? "on" : i < si ? "past" : ""}">
        <button type="button" data-stage="${k}" ${i === si ? 'aria-current="step"' : ""} ${k !== "ideas" && s.options.length < 2 ? "disabled" : ""}>${label}</button></li>`).join("")}</ol>
    </div>
    ${body}
    <div class="poll-foot"><button type="button" class="linkbtn" data-act="reset">↺ התחלה מחדש של "${esc(poll.title)}"</button></div>
  </section>`;
}

function ideasStage(poll, s) {
  const have = new Set(s.options.map((o) => o.text.trim()));
  const ideas = [...poll.ideas, ...poll.prefill];
  return `
    ${poll.note ? `<p class="note">ℹ️ ${fmt(poll.note)}</p>` : ""}
    ${poll.prompts.length ? `<ul class="prompts" aria-label="שאלות שעוזרות לחשוב">${poll.prompts.map((q) => `<li>💭 ${fmt(q)}</li>`).join("")}</ul>` : ""}
    <form class="addform" data-form="add">
      <label for="addInput" class="sr">הצעה חדשה</label>
      <input id="addInput" type="text" maxlength="80" autocomplete="off" placeholder="מקלידים הצעה של ילד ולוחצים Enter…">
      <button type="submit" class="btn">＋ הוספה</button>
    </form>
    ${s.options.length ? `<ol class="opts-list">${s.options.map((o, i) => `<li>
        <span class="num">${i + 1}</span><span class="otext">${optLabel(o)}</span>
        <button type="button" class="icon-btn" data-act="edit" data-id="${o.id}" title="תיקון" aria-label="תיקון ההצעה ${esc(o.text)}">✏️</button>
        <button type="button" class="icon-btn" data-act="del" data-id="${o.id}" title="מחיקה" aria-label="מחיקת ההצעה ${esc(o.text)}">✕</button>
      </li>`).join("")}</ol>` : '<p class="empty">עוד אין הצעות. מקשיבים לילדים ומקלידים – או מציצים ברעיונות להשראה.</p>'}
    ${ideas.length ? `<details class="ideas"><summary>💡 רעיונות להשראה (${ideas.length})</summary><div class="chips">${ideas.map((o, i) => {
      const used = have.has(o.text.trim());
      return `<button type="button" class="chip" data-idea="${i}" ${used ? "disabled" : ""}>${optLabel(o)}${used ? " ✓" : ""}</button>`;
    }).join("")}</div></details>` : ""}
    <div class="poll-nav"><span></span>
      <button type="button" class="btn big" data-stage="vote" ${s.options.length < 2 ? "disabled" : ""}>להצבעה ←</button></div>
    ${s.options.length < 2 ? '<p class="hint">צריך לפחות שתי הצעות כדי להצביע.</p>' : ""}`;
}

function voteStage(poll, s) {
  const a = analyze(s);
  const locked = s.options.filter((o) => o.locked);
  const perKid = s.keep > 1 ? `כל ילד יכול להרים יד עד ${s.keep} פעמים.` : "כל ילד מרים יד פעם אחת.";
  const max = s.present ? s.present * (s.keep > 1 ? s.keep : 1) : null;
  return `
    <div class="votebar">
      <label>כמה ילדים היום? <input type="number" min="0" max="99" inputmode="numeric" data-act="present" value="${s.present ?? ""}" placeholder="—"></label>
      <span class="counted ${max !== null && a.total > max ? "over" : ""}">נספרו <b>${a.total}</b> קולות${max !== null ? ` מתוך ${max} אפשריים` : ""}</span>
      <span class="hint">${perKid} במקלדת: 1–9 מוסיף קול, Shift+מספר מוריד.</span>
    </div>
    ${s.round > 1 ? `<p class="note">⚖️ <b>סבב הכרעה ${s.round - 1}</b> – מצביעים שוב, רק בין ההצעות שהיו בתיקו.${locked.length ? ` כבר נבחרו: ${locked.map((o) => esc(o.text)).join(", ")}.` : ""}</p>` : ""}
    <div class="vgrid">${a.voting.map((o, i) => `<div class="vcard" data-id="${o.id}">
        <span class="num">${i + 1}</span>
        <div class="vtext">${optLabel(o)}</div>
        <div class="vcount" aria-live="polite">${o.votes}</div>
        <div class="vbtns">
          <button type="button" class="vbtn minus" data-act="dec" data-id="${o.id}" aria-label="פחות קול ל${esc(o.text)}" ${o.votes ? "" : "disabled"}>−</button>
          <button type="button" class="vbtn plus" data-act="inc" data-id="${o.id}" aria-label="עוד קול ל${esc(o.text)}">+</button>
        </div>
      </div>`).join("")}</div>
    <div class="poll-nav">
      <button type="button" class="btn ghost" data-stage="ideas">→ להצעות</button>
      <button type="button" class="btn big" data-stage="result" ${a.total ? "" : "disabled"}>לתוצאה 🏆</button>
    </div>
    ${a.total ? `<p class="center"><button type="button" class="linkbtn" data-act="zero">לאפס את הקולות ולהצביע מחדש</button></p>` : '<p class="hint center">סופרים ידיים ולוחצים + ליד כל הצעה.</p>'}`;
}

function resultStage(poll, s) {
  const a = analyze(s);
  const maxV = Math.max(1, ...a.r.map((o) => (o.locked ? o.lockedVotes : o.votes)));
  const winSet = new Set(a.winners.map((o) => o.id));
  const tieSet = new Set((a.tie || []).map((o) => o.id));
  const bars = a.r.concat(s.options.filter((o) => o.out)).map((o) => {
    const v = o.locked ? o.lockedVotes : o.votes;
    const cls = tieSet.has(o.id) ? "tie" : winSet.has(o.id) && !a.tie ? "win" : winSet.has(o.id) ? "win" : o.out ? "out" : "";
    return `<li class="${cls}"><span class="blabel">${winSet.has(o.id) && !tieSet.has(o.id) ? "🏆 " : ""}${optLabel(o)}</span>
      <span class="bar"><i data-w="${(v / maxV) * 100}" style="width:0"></i></span><b class="bval">${o.out ? "—" : v}</b></li>`;
  }).join("");

  let banner = "";
  if (!a.total) banner = '<div class="note warn">עוד לא נספרו קולות. חוזרים להצבעה.</div>';
  else if (a.tie) {
    const sure = a.winners.filter((o) => !tieSet.has(o.id));
    banner = `<div class="tiebox">
      <h3>⚖️ תיקו!</h3>
      <p>${sure.length ? `נבחרו: <b>${sure.map((o) => esc(o.text)).join(", ")}</b>. ` : ""}יש תיקו בין: <b>${a.tie.map((o) => esc(o.text)).join(" · ")}</b>.</p>
      <div class="row">
        <button type="button" class="btn big" data-act="runoff">סבב הכרעה ←</button>
        ${s.keep > 1 ? `<button type="button" class="btn ghost" data-act="keep+">לשמור ${s.keep + 1} במקום ${s.keep}</button>` : ""}
      </div></div>`;
  } else {
    const ctl = readControl();
    const taskDone = poll.task && ctl.done && ctl.done[poll.task];
    banner = `<div class="winner">
      <div class="confetti" aria-hidden="true">${Array.from("🎉✨🎊⭐".repeat(3)).map((c, i) => `<span style="--i:${i}">${c}</span>`).join("")}</div>
      ${s.keep === 1
        ? `<div class="wlabel">בחרנו:</div><div class="wname">${optLabel(a.winners[0])}</div>`
        : `<div class="wlabel">בחרנו:</div><ol class="wlist">${a.winners.map((o) => `<li>${optLabel(o)}</li>`).join("")}</ol>`}
      ${s.decidedAt ? `<div class="wdate">הוחלט ב-${showDate(s.decidedAt)}</div>` : ""}
      ${poll.task ? (taskDone
        ? '<p class="marked">✓ המשימה מסומנת בלוח הבקרה</p>'
        : `<button type="button" class="btn" data-act="mark">✓ לסמן את המשימה בלוח הבקרה</button>`) : ""}
    </div>`;
  }
  return `${banner}
    ${s.keep > 1 || poll.id === "missions" ? `<div class="keepctl">כמה לשמור?
      <button type="button" class="vbtn minus small" data-act="keep-" ${s.keep <= 1 ? "disabled" : ""} aria-label="פחות">−</button>
      <b>${s.keep}</b>
      <button type="button" class="vbtn plus small" data-act="keep+" ${s.keep >= a.r.length ? "disabled" : ""} aria-label="יותר">+</button></div>` : ""}
    <ol class="bars">${bars}</ol>
    <div class="poll-nav">
      <button type="button" class="btn ghost" data-stage="vote">→ לתקן את הספירה</button>
      ${nextTopicBtn(poll)}
    </div>`;
}

function nextTopicBtn(poll) {
  const topic = C.topics.find((t) => t.id === poll.topic);
  if (topic && topic.polls.length > 1) {
    const i = topic.polls.indexOf(poll.id);
    if (i < topic.polls.length - 1) return `<button type="button" class="btn big" data-part="${esc(topic.polls[i + 1])}" data-topic="${esc(topic.id)}">ל${esc(C.polls[topic.polls[i + 1]].title)} ←</button>`;
  }
  const ti = C.topics.indexOf(topic);
  const next = C.topics[ti + 1];
  return next ? `<a class="btn big" href="#${esc(next.id)}">ל${esc(next.title)} ←</a>` : `<a class="btn big" href="#summary">📋 לסיכום ←</a>`;
}

/* ---------- logo prompt ---------- */
function logoChoice(topic) {
  const get = (part) => {
    const id = topic.polls.find((x) => C.polls[x].part === part);
    return id ? decided(vstate.polls[id]) : null;
  };
  return { colors: get("colors"), symbol: get("symbol"), style: get("style") };
}
function fill(tpl, ch, lang) {
  const word = (list, joiner) => (list ? list.map((o) => (lang === "en" && o.en ? o.en : o.text)).join(joiner) : "…");
  return tpl
    .replace("{symbol}", word(ch.symbol, ", "))
    .replace("{colors}", word(ch.colors, lang === "en" ? " and " : " ו"))
    .replace("{style}", word(ch.style, ", "));
}
function teamName() {
  const d = C.polls.name ? decided(vstate.polls.name) : null;
  return d ? d[0].text : "";
}
function logoPromptHtml(topic) {
  const ch = logoChoice(topic);
  const missing = [["colors", "צבעים"], ["symbol", "סמל"], ["style", "סגנון"]].filter(([k]) => !ch[k]).map(([, n]) => n);
  const c1 = ch.colors?.[0]?.hex || "var(--surface-2)", c2 = ch.colors?.[1]?.hex || c1;
  const sym = ch.symbol?.[0];
  const name = teamName();
  return `<section class="card logo-ai">
    <h3>✨ הלוגו שלנו – בקשה מוכנה לכלי AI</h3>
    <div class="logo-grid">
      <div class="mock" style="--c1:${esc(c1)};--c2:${esc(c2)}" aria-label="תצוגה מקדימה פשוטה של הלוגו">
        <div class="mock-badge"><span>${sym ? esc(sym.emoji || "⭐") : "❓"}</span></div>
        <div class="mock-name">${name ? esc(name) : "שם הקבוצה"}</div>
      </div>
      <div class="prompt-box">
        ${missing.length ? `<p class="note warn">עוד לא נבחרו: ${missing.join(", ")}. הבקשה תתמלא אחרי ההצבעה.</p>` : ""}
        <label for="promptEn">הבקשה (באנגלית – הכלים מבינים אותה טוב יותר):</label>
        <textarea id="promptEn" dir="ltr" readonly rows="4">${esc(fill(topic.prompt_en, ch, "en"))}</textarea>
        <div class="row"><button type="button" class="btn" data-act="copy">📋 העתקה</button><span class="copied" id="copied" role="status"></span></div>
        <p class="he">מה כתוב שם: ${esc(fill(topic.prompt_he, ch, "he"))}</p>
        <p class="hint">מדביקים את הבקשה בכלי ליצירת תמונות שמותר לכם להשתמש בו. <b>השם לא נכנס לתמונה</b> – כלי AI כותבים עברית משובשת. את שם הקבוצה מוסיפים אחר כך (למשל ב-Canva).</p>
      </div>
    </div>
  </section>`;
}

/* ---------- summary ---------- */
function summaryHtml() {
  const rows = C.topics.map((t) => {
    if (t.polls.length > 1) {
      const ch = logoChoice(t);
      const parts = t.polls.map((id) => {
        const d = decided(vstate.polls[id]);
        return `<li>${esc(C.polls[id].title)}: ${d ? d.map((o) => optLabel(o)).join(" + ") : '<span class="muted">עוד לא הוחלט</span>'}</li>`;
      }).join("");
      const ready = ch.colors && ch.symbol && ch.style;
      return `<li class="srow"><h3>${esc(t.emoji)} ${esc(t.title)}</h3><ul>${parts}</ul>
        ${ready ? `<p class="prompt-print" dir="ltr">${esc(fill(t.prompt_en, ch, "en"))}</p>` : ""}</li>`;
    }
    const s = vstate.polls[t.polls[0]];
    const d = decided(s);
    return `<li class="srow"><h3>${esc(t.emoji)} ${esc(t.title)}</h3>
      ${d ? (d.length === 1 ? `<p class="sval">${optLabel(d[0])}</p>` : `<ol>${d.map((o) => `<li>${optLabel(o)}</li>`).join("")}</ol>`) : '<p class="muted">עוד לא הוחלט</p>'}
      ${d && s.decidedAt ? `<small class="muted">הוחלט ב-${showDate(s.decidedAt)}</small>` : ""}</li>`;
  }).join("");
  return `<section class="poll summary"><div class="qhead"><h2 class="question">📋 ההחלטות שלנו</h2></div>
    <ul class="slist">${rows}</ul>
    <div class="poll-nav"><span></span><button type="button" class="btn" data-act="print">🖨 הדפסה (ליומן ההנדסי)</button></div>
  </section>`;
}

/* ---------- actions ---------- */
function currentPoll() {
  const el = document.querySelector("[data-poll]");
  return el ? C.polls[el.dataset.poll] : null;
}
function readControl() {
  return store.get(CONTROL_KEY, {}) || {};
}
function redraw(focusSel) {
  const y = window.scrollY;
  show();
  window.scrollTo(0, y);
  if (focusSel) document.querySelector(focusSel)?.focus();
}
function vote(poll, id, delta) {
  const s = ps(poll);
  const o = s.options.find((x) => x.id === id);
  if (!o || o.locked || o.out) return;
  o.votes = Math.max(0, o.votes + delta);
  save(true);
  redraw();
  const card = document.querySelector(`.vcard[data-id="${id}"]`);
  if (card) { card.classList.remove("bump"); void card.offsetWidth; card.classList.add(delta > 0 ? "bump" : "dip"); }
}
function setStage(poll, stage) {
  const s = ps(poll);
  if (stage !== "ideas" && s.options.length < 2) return;
  s.stage = stage;
  if (stage === "result") {
    const a = analyze(s);
    s.decidedAt = a.total && !a.tie ? new Date().toISOString() : null;
  }
  save();
  redraw();
  document.getElementById("poll")?.scrollIntoView({ block: "start" });
}

function wire() {
  const app = document.getElementById("app");
  app.addEventListener("submit", (e) => {
    if (e.target.dataset.form !== "add") return;
    e.preventDefault();
    const poll = currentPoll();
    const input = e.target.querySelector("input");
    const text = input.value.trim();
    if (!poll || !text) return;
    const s = ps(poll);
    if (s.options.some((o) => o.text.trim() === text)) { input.select(); return; }
    s.options.push(newOption({ text }));
    save();
    redraw("#addInput");
  });
  app.addEventListener("click", (e) => {
    const b = e.target.closest("button");
    if (!b || b.disabled) return;
    const poll = currentPoll();
    if (b.dataset.part) {
      vstate.part[b.dataset.topic] = b.dataset.part; save(true); show();
      document.getElementById("poll")?.scrollIntoView({ block: "start" });
      return;
    }
    if (b.dataset.stage && poll) return setStage(poll, b.dataset.stage);
    if (b.dataset.idea !== undefined && poll) {
      const s = ps(poll);
      const o = [...poll.ideas, ...poll.prefill][+b.dataset.idea];
      if (o && !s.options.some((x) => x.text.trim() === o.text.trim())) { s.options.push(newOption(o)); save(); }
      const open = app.querySelector("details.ideas")?.open;
      redraw();
      if (open) app.querySelector("details.ideas").open = true;
      return;
    }
    const act = b.dataset.act;
    if (!act) return;
    if (act === "print") return window.print();
    if (!poll) return;
    const s = ps(poll);
    if (act === "inc") vote(poll, b.dataset.id, 1);
    else if (act === "dec") vote(poll, b.dataset.id, -1);
    else if (act === "del") {
      const o = s.options.find((x) => x.id === b.dataset.id);
      if (o && (o.votes === 0 || confirm(`למחוק את "${o.text}"? יש לה כבר קולות.`))) {
        s.options = s.options.filter((x) => x !== o); save(); redraw();
      }
    } else if (act === "edit") {
      const o = s.options.find((x) => x.id === b.dataset.id);
      const t = o && prompt("תיקון ההצעה:", o.text);
      if (o && t && t.trim()) { o.text = t.trim(); if (!poll.prefill.length) o.en = ""; save(); redraw(); }
    } else if (act === "zero") {
      if (!confirm("לאפס את כל הקולות ולהצביע מחדש?")) return;
      s.options.forEach((o) => { o.votes = 0; o.locked = false; o.lockedVotes = 0; o.out = false; });
      s.round = 1; s.decidedAt = null; save(); redraw();
    } else if (act === "runoff") {
      const a = analyze(s);
      if (!a.tie) return;
      const score = a.tie[0].votes;
      s.options.forEach((o) => {
        if (o.locked || o.out) return;
        if (o.votes > score) { o.locked = true; o.lockedVotes = o.votes; }
        else if (o.votes === score) o.votes = 0;
        else o.out = true;
      });
      s.round++; s.stage = "vote"; s.decidedAt = null; save(); redraw();
      document.getElementById("poll")?.scrollIntoView({ block: "start" });
    } else if (act === "keep+" || act === "keep-") {
      s.keep = Math.max(1, s.keep + (act === "keep+" ? 1 : -1));
      const a = analyze(s);
      s.decidedAt = a.total && !a.tie ? s.decidedAt || new Date().toISOString() : null;
      save(); redraw();
    } else if (act === "mark") {
      const ctl = readControl();
      ctl.done = ctl.done || {};
      ctl.done[poll.task] = true;
      store.set(CONTROL_KEY, ctl);
      save(); redraw();
    } else if (act === "copy") {
      copyPrompt();
    } else if (act === "reset") {
      if (!confirm(`להתחיל את "${poll.title}" מחדש? ההצעות והקולות של הנושא הזה יימחקו.`)) return;
      delete vstate.polls[poll.id]; save(); redraw();
    }
  });
  app.addEventListener("change", (e) => {
    if (e.target.dataset.act !== "present") return;
    const poll = currentPoll();
    if (!poll) return;
    const n = parseInt(e.target.value, 10);
    ps(poll).present = Number.isFinite(n) && n > 0 ? Math.min(n, 99) : null;
    save(true); redraw();
  });
  // 1–9 adds a vote to that option, Shift+number takes one away (vote stage only, not while typing)
  document.addEventListener("keydown", (e) => {
    if (e.ctrlKey || e.metaKey || e.altKey) return;
    if (e.target instanceof Element && e.target.closest("input, textarea, select, [contenteditable]")) return;
    const m = /^(?:Digit|Numpad)([1-9])$/.exec(e.code);
    const poll = currentPoll();
    if (!m || !poll || ps(poll).stage !== "vote") return;
    const opt = analyze(ps(poll)).voting[+m[1] - 1];
    if (!opt) return;
    e.preventDefault();
    vote(poll, opt.id, e.shiftKey ? -1 : 1);
  });
  window.addEventListener("hashchange", () => { route(); show(); window.scrollTo(0, 0); });
}

async function copyPrompt() {
  const ta = document.getElementById("promptEn");
  const out = document.getElementById("copied");
  try {
    await navigator.clipboard.writeText(ta.value);
  } catch (e) {
    ta.select();
    try { document.execCommand("copy"); } catch (e2) { out.textContent = "לא הצלחתי להעתיק – מסמנים את הטקסט ומעתיקים ידנית."; return; }
  }
  out.textContent = "✓ הועתק";
  setTimeout(() => (out.textContent = ""), 2500);
}

function route() {
  const h = decodeURIComponent(location.hash.slice(1));
  if (h === "summary" || C.topics.some((t) => t.id === h)) vstate.topic = h;
  else if (!C.topics.some((t) => t.id === vstate.topic) && vstate.topic !== "summary") vstate.topic = C.topics[0]?.id || "summary";
  save(true);
}

document.addEventListener("DOMContentLoaded", async () => {
  const app = document.getElementById("app");
  try {
    const { data, problems } = await loadContent();
    C = prepare(data, problems);
    route();
    wire();
    show();
  } catch (e) {
    console.error(e);
    app.innerHTML = `<div class="warnbox"><strong>⚠ ${esc(e.message)}</strong><br>אם פתחתם את הקובץ ישירות מהמחשב – צריך שרת מקומי (ראו README).</div>`;
  }
});
