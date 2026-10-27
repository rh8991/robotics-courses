// An animated micro:bit drawn in SVG: its 5×5 LEDs cycle through pictures (beating heart, smile, arrows…).
// Buttons A and B on the drawing switch pictures by hand. With "reduce motion" on, it stays still.

(function () {
  // Each picture is 5 rows of 5: 1 = LED on.
  const PICTURES = {
    heart:  ["01010", "11111", "11111", "01110", "00100"],
    small:  ["00000", "01010", "01110", "00100", "00000"],
    happy:  ["00000", "01010", "00000", "10001", "01110"],
    yes:    ["00000", "00001", "00010", "10100", "01000"],
    up:     ["00100", "01110", "10101", "00100", "00100"],
    music:  ["00111", "00101", "00101", "11101", "11000"],
    duck:   ["01100", "11100", "01111", "01110", "00000"],
    diamond:["00100", "01010", "10001", "01010", "00100"],
  };
  // The automatic show: [picture, milliseconds].
  const SHOW = [
    ["heart", 500], ["small", 350], ["heart", 500], ["small", 350], ["heart", 900],
    ["happy", 1300], ["up", 1100], ["music", 1100], ["duck", 1300], ["diamond", 900], ["yes", 1300],
  ];
  const ORDER = Object.keys(PICTURES);
  const NS = "http://www.w3.org/2000/svg";

  function el(name, attrs, parent) {
    const e = document.createElementNS(NS, name);
    for (const k in attrs) e.setAttribute(k, attrs[k]);
    if (parent) parent.appendChild(e);
    return e;
  }

  function build(host) {
    const svg = el("svg", { viewBox: "0 0 360 300", class: "mb-art", role: "img", "aria-label": "איור של לוח micro:bit עם נורות שמציירות תמונות" });
    svg.setAttribute("direction", "ltr");
    const defs = el("defs", {}, svg);
    const glow = el("filter", { id: "mbGlow", x: "-50%", y: "-50%", width: "200%", height: "200%" }, defs);
    el("feGaussianBlur", { stdDeviation: "3.5", result: "b" }, glow);
    const merge = el("feMerge", {}, glow);
    el("feMergeNode", { in: "b" }, merge);
    el("feMergeNode", { in: "SourceGraphic" }, merge);

    // board + edge connector
    el("rect", { x: 10, y: 10, width: 340, height: 280, rx: 30, class: "mb-board" }, svg);
    el("rect", { x: 10, y: 236, width: 340, height: 54, rx: 0, class: "mb-edge-bg" }, svg);
    el("rect", { x: 10, y: 262, width: 340, height: 28, rx: 0, class: "mb-edge" }, svg);
    for (let i = 0; i < 22; i++) el("rect", { x: 22 + i * 14.7, y: 270, width: 8, height: 20, class: "mb-tooth" }, svg);
    [40, 105, 180, 255, 320].forEach((cx, i) => {
      el("circle", { cx, cy: 258, r: i === 2 ? 17 : 15, class: "mb-pad" }, svg);
      el("circle", { cx, cy: 258, r: i === 2 ? 8 : 7, class: "mb-hole" }, svg);
    });
    // "logo" touch sensor at the top
    el("ellipse", { cx: 180, cy: 36, rx: 20, ry: 11, class: "mb-logo" }, svg);

    // buttons A and B
    const buttons = {};
    [["A", 48], ["B", 312]].forEach(([name, cx]) => {
      const g = el("g", { class: "mb-btn", tabindex: "0", role: "button", "aria-label": name === "A" ? "כפתור A – התמונה הבאה" : "כפתור B – התמונה הקודמת" }, svg);
      el("rect", { x: cx - 26, y: 114, width: 52, height: 52, rx: 10, class: "mb-btn-base" }, g);
      el("circle", { cx, cy: 140, r: 16, class: "mb-btn-cap" }, g);
      const t = el("text", { x: cx, y: 96, class: "mb-label" }, g);
      t.textContent = name;
      buttons[name] = g;
    });

    // 5×5 LEDs
    const leds = [];
    for (let r = 0; r < 5; r++)
      for (let c = 0; c < 5; c++)
        leds.push(el("rect", { x: 112 + c * 28, y: 68 + r * 30, width: 12, height: 18, rx: 2, class: "mb-led" }, svg));

    host.prepend(svg);
    const hint = host.querySelector(".art-hint");
    if (hint) hint.hidden = false;
    return { leds, buttons };
  }

  function show(leds, name) {
    PICTURES[name].join("").split("").forEach((v, i) => {
      const on = v === "1";
      leds[i].classList.toggle("on", on);
      if (on) leds[i].setAttribute("filter", "url(#mbGlow)"); else leds[i].removeAttribute("filter");
    });
  }

  function start(host) {
    const { leds, buttons } = build(host);
    const still = matchMedia("(prefers-reduced-motion: reduce)").matches;
    let step = 0, timer = null, manual = ORDER.indexOf("heart");

    function tick() {
      const [name, ms] = SHOW[step % SHOW.length];
      show(leds, name);
      step++;
      timer = setTimeout(tick, ms);
    }
    // Pressing A/B takes over for a while, then the show resumes.
    function press(dir, g) {
      clearTimeout(timer);
      manual = (manual + dir + ORDER.length) % ORDER.length;
      show(leds, ORDER[manual]);
      g.classList.add("pressed");
      setTimeout(() => g.classList.remove("pressed"), 150);
      if (!still) timer = setTimeout(tick, 4000);
    }
    [["A", 1], ["B", -1]].forEach(([n, dir]) => {
      const g = buttons[n];
      g.addEventListener("click", () => press(dir, g));
      g.addEventListener("keydown", (e) => {
        if (e.key === "Enter" || e.key === " ") { e.preventDefault(); press(dir, g); }
      });
    });

    if (still) show(leds, "heart");
    else tick();
  }

  document.querySelectorAll("[data-microbit-art]").forEach(start);
})();
