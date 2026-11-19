// שער סיסמה ל"דפי מדריך" (מנעול רך) – משותף לכל הקורסים.
//
// ⚠ זו לא אבטחה אמיתית: האתר סטטי ואין שרת. השער מונע כניסה סתמית של תלמידים והורים, אבל מי שמבין בטכנולוגיה
//   יכול לעקוף אותו, וקבצי התוכן (YAML) נשארים נגישים למי שמכיר את הכתובת. לא מעלים לכאן מידע רגיש.
//
// איך מחברים לדף: שורה אחת בתוך <head>, לפני שאר הסקריפטים:
//   <script src="../shared/gate.js" data-home="../"></script>
//   data-when="view-guide"  – (לא חובה) נועל רק כשהכתובת כוללת ?view=guide (לדפים שמשרתים גם תלמידים וגם מדריכים)
//   data-home="../"         – (לא חובה) לאן מחזיר הקישור "חזרה לדף הבית"
//
// איך מחליפים סיסמה: מחשבים טביעת אצבע (SHA-256) של הסיסמה, ומדביקים אותה ב-PASSWORD_HASH למטה.
//   בטרמינל:  printf '%s' 'הסיסמה החדשה' | sha256sum
//   (הסיסמה עצמה לא נשמרת בקוד.) אחרי ההחלפה כולם יתבקשו להיכנס מחדש.
//
// הכניסה נזכרת עד סגירת הלשונית (sessionStorage), כך שמספיק להקליד פעם אחת בכל הדפים של האתר.

(function () {
  "use strict";

  var PASSWORD_HASH = "11f4b83df86e2be6e56e0bd667dbac88936a1a0bfa73e24238e61752f485df22";
  var STORE_KEY = "tnd-guide-gate-v1";

  var me = document.currentScript;
  var when = (me && me.getAttribute("data-when")) || "always";
  var home = (me && me.getAttribute("data-home")) || "./";

  // pages that serve both students and guides are locked only in the guide view
  if (when === "view-guide" && new URLSearchParams(location.search).get("view") !== "guide") return;

  try { if (sessionStorage.getItem(STORE_KEY) === PASSWORD_HASH) return; } catch (e) { /* private mode: ask every page */ }

  var root = document.documentElement;
  root.classList.add("gate-locked");

  var css = document.createElement("style");
  css.id = "gate-style";
  css.textContent = [
    "html.gate-locked body > *:not(#gate-overlay){display:none !important}",
    "#gate-overlay{position:fixed;inset:0;z-index:99999;display:flex;align-items:center;justify-content:center;padding:16px;",
    "background:#f4f6f5;color:#14201b;font-family:Rubik,'Open Sans',Arial,sans-serif;direction:rtl}",
    "#gate-overlay .gate-card{width:100%;max-width:380px;background:#fff;border:1.5px solid #c9d6d0;border-radius:14px;",
    "padding:24px 22px;text-align:center;box-shadow:0 6px 24px rgba(0,0,0,.08)}",
    "#gate-overlay h1{font-size:22px;margin:0 0 6px;color:#0f6b4f}",
    "#gate-overlay p{margin:0 0 14px;font-size:16px;line-height:1.5}",
    "#gate-overlay input{width:100%;font:inherit;font-size:18px;padding:10px 12px;border:1.5px solid #8a9a93;border-radius:10px;",
    "background:#fff;color:#14201b;text-align:center}",
    "#gate-overlay input:focus{outline:3px solid #0f6b4f;outline-offset:1px}",
    "#gate-overlay .gate-row{display:flex;gap:8px;margin-top:10px}",
    "#gate-overlay button{flex:1;font:inherit;font-size:17px;font-weight:700;padding:10px 12px;border-radius:10px;cursor:pointer;",
    "border:1.5px solid #0f6b4f;background:#0f6b4f;color:#fff}",
    "#gate-overlay button.ghost{flex:0 0 auto;background:#fff;color:#0f6b4f}",
    "#gate-overlay .gate-err{min-height:24px;margin:10px 0 0;font-size:15px;font-weight:700;color:#b3261e}",
    "#gate-overlay a{display:inline-block;margin-top:12px;font-size:15px;color:#0f6b4f}",
    "@media (prefers-color-scheme:dark){html[data-theme='dark'] #gate-overlay{background:#12201a;color:#eef5f1}",
    "html[data-theme='dark'] #gate-overlay .gate-card{background:#1a2c24;border-color:#3a5247}",
    "html[data-theme='dark'] #gate-overlay h1{color:#7fd6b5}",
    "html[data-theme='dark'] #gate-overlay input{background:#12201a;color:#eef5f1;border-color:#6f8a7d}",
    "html[data-theme='dark'] #gate-overlay a,html[data-theme='dark'] #gate-overlay button.ghost{color:#7fd6b5}",
    "html[data-theme='dark'] #gate-overlay button.ghost{background:#1a2c24;border-color:#7fd6b5}}"
  ].join("");
  document.head.appendChild(css);

  function sha256Hex(text) {
    var data = new TextEncoder().encode(text);
    return crypto.subtle.digest("SHA-256", data).then(function (buf) {
      return Array.prototype.map.call(new Uint8Array(buf), function (b) { return ("0" + b.toString(16)).slice(-2); }).join("");
    });
  }

  function unlock(overlay) {
    try { sessionStorage.setItem(STORE_KEY, PASSWORD_HASH); } catch (e) { /* ignore */ }
    root.classList.remove("gate-locked");
    overlay.remove();
    var st = document.getElementById("gate-style");
    if (st) st.remove();
  }

  function build() {
    var overlay = document.createElement("div");
    overlay.id = "gate-overlay";
    overlay.setAttribute("role", "dialog");
    overlay.setAttribute("aria-modal", "true");
    overlay.setAttribute("aria-labelledby", "gate-title");
    overlay.innerHTML =
      '<form class="gate-card" autocomplete="off">' +
      '<h1 id="gate-title">🔒 דף למדריכים</h1>' +
      '<p>הדף הזה מיועד למדריכים. הקלידו את הסיסמה כדי להיכנס.</p>' +
      '<input id="gate-pw" type="password" dir="auto" autocomplete="current-password" aria-label="סיסמה" placeholder="סיסמה">' +
      '<div class="gate-row"><button type="submit">כניסה</button>' +
      '<button type="button" class="ghost" id="gate-show" aria-pressed="false">הצגה</button></div>' +
      '<div class="gate-err" id="gate-err" role="alert" aria-live="assertive"></div>' +
      '<a href="' + home + '">חזרה לדף הבית</a>' +
      "</form>";
    document.body.appendChild(overlay);

    var form = overlay.querySelector("form");
    var input = overlay.querySelector("#gate-pw");
    var err = overlay.querySelector("#gate-err");
    var show = overlay.querySelector("#gate-show");

    show.addEventListener("click", function () {
      var visible = input.type === "text";
      input.type = visible ? "password" : "text";
      show.textContent = visible ? "הצגה" : "הסתרה";
      show.setAttribute("aria-pressed", String(!visible));
      input.focus();
    });

    form.addEventListener("submit", function (e) {
      e.preventDefault();
      err.textContent = "";
      if (!window.crypto || !crypto.subtle) {
        err.textContent = "לא ניתן לבדוק סיסמה בדפדפן הזה. פתחו את האתר בכתובת המלאה שלו (https).";
        return;
      }
      sha256Hex(input.value.trim()).then(function (h) {
        if (h === PASSWORD_HASH) { unlock(overlay); return; }
        err.textContent = "הסיסמה לא נכונה, נסו שוב.";
        input.select();
      });
    });

    input.focus();
  }

  if (document.body) build();
  else document.addEventListener("DOMContentLoaded", build);
})();
