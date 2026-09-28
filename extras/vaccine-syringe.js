// Vaccine progress syringe for Frank's home page.
// Standalone module: reads content/timeline.json, mounts after the home hero,
// and draws a 3D syringe whose liquid sloshes with a small wave simulation.

const CSS = `
.vx{margin:0 0 1.6rem;padding:1.2rem 1.3rem 1.1rem;overflow:hidden}
.vx-head{display:flex;align-items:flex-end;justify-content:space-between;gap:1rem;flex-wrap:wrap}
.vx-kicker{color:var(--clay-deep);margin:0 0 .15rem}
.vx-title{margin:0;font-size:1.5rem;line-height:1.15;font-weight:620}
.vx-pct{font-size:2.3rem;line-height:1;font-weight:680;color:var(--clay-deep);font-variation-settings:"opsz" 144,"SOFT" 45,"WONK" 1}
.vx-stage{position:relative;margin:.6rem auto 0;max-width:820px;touch-action:pan-y;cursor:grab;-webkit-user-select:none;user-select:none}
.vx-stage:active{cursor:grabbing}
.vx-stage canvas{display:block;width:100%;height:132px}
.vx-hint{margin:.1rem 0 .8rem;color:var(--ink-faint);text-transform:none;letter-spacing:.02em;display:flex;align-items:center;gap:.6rem;flex-wrap:wrap}
.vx-motion{font:inherit;color:var(--clay-deep);background:var(--clay-wash);border:1px solid var(--clay-soft);border-radius:999px;padding:.15rem .7rem;cursor:pointer}
.vx-list{list-style:none;margin:0;padding:0;display:grid;gap:.45rem;font-size:.95rem}
.vx-list li{display:flex;align-items:baseline;gap:.6rem}
.vx-dot{flex:0 0 auto;width:.95rem;height:.95rem;border-radius:50%;transform:translateY(.12rem);display:inline-flex;align-items:center;justify-content:center}
.vx-dot.done{background:var(--sage-deep)}
.vx-dot.todo{border:2px solid var(--clay)}
.vx-dot svg{width:.65rem;height:.65rem}
.vx-date{font-family:var(--font-mono);font-size:.78rem;color:var(--ink-soft);min-width:4.6rem}
.vx-name{color:var(--ink)}
.vx-where{color:var(--ink-faint);font-size:.85rem}
.vx-list li.todo .vx-name{color:var(--ink-soft)}
.vx-sr{position:absolute;width:1px;height:1px;overflow:hidden;clip:rect(0 0 0 0);white-space:nowrap}
`;

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
const fmtDate = (iso) => {
  const [, m, d] = iso.split("-").map(Number);
  return `${MONTHS[m - 1]} ${d}`;
};

// Dose colors along the barrel, left to right.
const LIQUID = ["#ff4f8b", "#ff9f1c", "#ffd23f", "#2ec4b6", "#3a86ff", "#8338ec"];

const reduceMotion = matchMedia("(prefers-reduced-motion: reduce)").matches;

let data = null;
async function loadVisits() {
  if (data) return data;
  const res = await fetch("content/timeline.json", { cache: "no-cache" });
  const all = await res.json();
  data = all
    .filter((e) => e.type === "vaccine")
    .sort((a, b) => a.date.localeCompare(b.date))
    .map((e) => ({
      date: e.date,
      label: e.short || e.title,
      done: e.status === "done",
      approx: !!e.approximate && e.status !== "done",
      where: e.location || "",
    }));
  return data;
}

function buildCard(visits) {
  const total = visits.length;
  const done = visits.filter((v) => v.done).length;
  const pct = Math.round((done / total) * 100);
  const next = visits.find((v) => !v.done);

  const el = document.createElement("section");
  el.className = "vx card";
  el.setAttribute("aria-label", "Vaccine progress");
  const check = `<svg viewBox="0 0 12 12" aria-hidden="true"><path d="M2.5 6.3l2.3 2.3 4.7-5" fill="none" stroke="#fff" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg>`;
  el.innerHTML = `
    <div class="vx-head">
      <div>
        <p class="mono vx-kicker">Vaccine progress</p>
        <h2 class="vx-title">${done === total ? "Fully vaccinated" : `${done} of ${total} puppy visits done`}</h2>
      </div>
      <div class="vx-pct" aria-hidden="true">${pct}%</div>
    </div>
    <div class="vx-stage"><canvas role="img" aria-label="Syringe ${pct} percent full. ${done} of ${total} vaccine visits done.${next ? ` Next: ${next.label}, ${next.approx ? "about " : ""}${fmtDate(next.date)}.` : ""}"></canvas></div>
    <p class="mono vx-hint"><span class="vx-hint-text">Drag the syringe to slosh it.</span></p>
    <ol class="vx-list">
      ${visits
        .map(
          (v) => `<li class="${v.done ? "done" : "todo"}">
            <span class="vx-dot ${v.done ? "done" : "todo"}">${v.done ? check : ""}<span class="vx-sr">${v.done ? "Done" : "Upcoming"}</span></span>
            <span class="vx-date">${v.approx ? "~" : ""}${fmtDate(v.date)}</span>
            <span><span class="vx-name">${v.label}</span>${v.where ? ` <span class="vx-where">${v.where}</span>` : ""}</span>
          </li>`
        )
        .join("")}
    </ol>`;
  return el;
}

// ---------------------------------------------------------------------------
// Syringe renderer + fluid sim
// ---------------------------------------------------------------------------
function startSyringe(card, visits) {
  const stage = card.querySelector(".vx-stage");
  const canvas = stage.querySelector("canvas");
  const ctx = canvas.getContext("2d");
  const hint = card.querySelector(".vx-hint");
  const hintText = card.querySelector(".vx-hint-text");

  const total = visits.length;
  const targetP = visits.filter((v) => v.done).length / total;
  let p = reduceMotion ? targetP : 0; // displayed fill fraction
  let pVel = 0;
  let introStarted = reduceMotion;

  const G = 1800; // px/s^2, "gravity" in screen space
  const C_WAVE = 360; // px/s wave speed
  const DAMP = 0.9;
  const VISC = 70;

  let W = 0, H = 132, dpr = 1;
  let geo = null;

  // Surface heights, relative to rest level (px, +down)
  let h = new Float32Array(0), v = new Float32Array(0);
  let N = 0;

  // Container motion (drag), in px
  let ox = 0, oxVel = 0, dragging = false, dragStartX = 0, dragStartOx = 0;
  let lastOx = 0, lastOxVel = 0, axDrag = 0, axIntro = 0;

  // Scroll
  let lastScroll = scrollY, lastScrollVel = 0, ayScroll = 0;

  // Device motion: effective gravity in canvas px/s^2
  let motionOn = false, gx = 0, gy = G, sensorSign = 1, flipTimer = 0;

  const bubbles = [];
  let t0 = performance.now(), last = t0, running = false, raf = 0, visible = false;

  function layout() {
    const r = canvas.getBoundingClientRect();
    W = Math.max(260, r.width);
    dpr = Math.min(window.devicePixelRatio || 1, 2.5);
    canvas.width = Math.round(W * dpr);
    canvas.height = Math.round(H * dpr);
    const R = Math.max(19, Math.min(29, W * 0.058));
    const cy = R + 22;
    const needle0 = 8;
    const hubL = W * 0.05;
    const needleL = W * 0.09;
    const bx0 = needle0 + needleL + hubL;
    const bx1 = W * 0.8;
    const wall = 3;
    const sw = Math.max(10, R * 0.5);
    const ix0 = bx0 + wall + 1;
    const ix1 = bx1 - 2;
    const top = cy - R + wall;
    const bot = cy + R - wall;
    geo = {
      R, cy, needle0, hubL, needleL, bx0, bx1, wall, sw, ix0, ix1, top, bot,
      travel: ix1 - sw - ix0,
      restY: bot - (bot - top) * 0.72,
    };
  }

  const liquidEnd = () => geo.ix0 + p * geo.travel;

  function resample(newN) {
    if (newN === N) return;
    const nh = new Float32Array(newN), nv = new Float32Array(newN);
    for (let i = 0; i < newN; i++) {
      if (N < 2) break;
      const u = (i / Math.max(1, newN - 1)) * (N - 1);
      const a = Math.floor(u), b = Math.min(N - 1, a + 1), f = u - a;
      nh[i] = h[a] * (1 - f) + h[b] * f;
      nv[i] = v[a] * (1 - f) + v[b] * f;
    }
    h = nh; v = nv; N = newN;
  }

  function effGravity() {
    let ex = motionOn ? gx : 0;
    let ey = motionOn ? gy : G;
    ex -= axDrag + axIntro;
    ey -= ayScroll * 0.25;
    return [ex, ey];
  }

  function step(dt) {
    // Intro fill animation, spring toward target
    if (introStarted && !reduceMotion) {
      const k = 16, d = 7.5;
      const acc = k * (targetP - p) - d * pVel;
      pVel += acc * dt;
      p += pVel * dt;
      if (p < 0) p = 0;
      // The plunger pulling acts like a horizontal acceleration on the liquid
      axIntro = -acc * geo.travel * 0.35;
    }

    // Drag spring back
    if (!dragging) {
      const acc = -220 * ox - 13 * oxVel;
      oxVel += acc * dt;
      ox += oxVel * dt;
    }

    const L = liquidEnd() - geo.ix0;
    if (L < 6) { resample(0); return; }
    resample(Math.max(8, Math.min(72, Math.round(L / 4))));
    const dx = L / (N - 1);

    const [ex, ey] = effGravity();
    let slope = -ex / Math.max(ey, G * 0.3);
    slope = Math.max(-1.4, Math.min(1.4, slope));
    const c = C_WAVE * Math.sqrt(Math.max(0.25, Math.min(2.2, ey / G)));
    const c2 = (c * c) / (dx * dx);
    const vis = VISC / (dx * dx);

    const a = new Float32Array(N);
    for (let i = 0; i < N; i++) {
      const hl = i > 0 ? h[i - 1] : h[0] - slope * dx;
      const hr = i < N - 1 ? h[i + 1] : h[N - 1] + slope * dx;
      const vl = i > 0 ? v[i - 1] : v[0];
      const vr = i < N - 1 ? v[i + 1] : v[N - 1];
      a[i] = c2 * (hl - 2 * h[i] + hr) + vis * (vl - 2 * v[i] + vr) - DAMP * v[i];
    }
    let mean = 0;
    for (let i = 0; i < N; i++) {
      v[i] += a[i] * dt;
      h[i] += v[i] * dt;
      mean += h[i];
    }
    mean /= N;
    const lo = geo.top + 1.5 - geo.restY, hi = geo.bot - 1.5 - geo.restY;
    for (let i = 0; i < N; i++) {
      h[i] -= mean;
      if (h[i] < lo) { h[i] = lo; if (v[i] < 0) v[i] *= -0.25; }
      if (h[i] > hi) { h[i] = hi; if (v[i] > 0) v[i] *= -0.25; }
    }

    // Bubbles
    for (let i = bubbles.length - 1; i >= 0; i--) {
      const b = bubbles[i];
      b.vy += (-ey * 0.06 - b.vy) * Math.min(1, dt * 6);
      b.x += (ex * 0.02 + Math.sin((b.y + b.seed) * 0.15) * 6) * dt;
      b.y += b.vy * dt;
      const end = liquidEnd() - 2;
      if (b.x < geo.ix0 + b.r) b.x = geo.ix0 + b.r;
      if (b.x > end - b.r) b.x = end - b.r;
      if (b.y - b.r <= surfaceAt(b.x) || b.x >= end) bubbles.splice(i, 1);
    }
  }

  function surfaceAt(x) {
    if (N < 2) return geo.bot;
    const L = liquidEnd() - geo.ix0;
    const u = Math.max(0, Math.min(1, (x - geo.ix0) / L)) * (N - 1);
    const a = Math.floor(u), b = Math.min(N - 1, a + 1), f = u - a;
    return geo.restY + h[a] * (1 - f) + h[b] * f;
  }

  function spawnBubbles(n) {
    const end = liquidEnd();
    if (end - geo.ix0 < 20) return;
    for (let i = 0; i < n && bubbles.length < 26; i++) {
      bubbles.push({
        x: geo.ix0 + 6 + Math.random() * (end - geo.ix0 - 12),
        y: geo.bot - 3 - Math.random() * 4,
        r: 1 + Math.random() * 2.4,
        vy: -20 - Math.random() * 30,
        seed: Math.random() * 100,
      });
    }
  }

  function splash(strength) {
    for (let i = 0; i < N; i++) v[i] += (Math.random() - 0.5) * strength;
  }

  // ------------------------------- drawing --------------------------------
  function rr(x, y, w, hh, r) {
    ctx.beginPath();
    ctx.roundRect ? ctx.roundRect(x, y, w, hh, r) : ctx.rect(x, y, w, hh);
  }

  function cylGrad(y0, y1, stops) {
    const g = ctx.createLinearGradient(0, y0, 0, y1);
    stops.forEach(([o, c]) => g.addColorStop(o, c));
    return g;
  }

  function draw(time) {
    const g = geo;
    const { R, cy } = g;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, W, H);

    // Soft shadow on the "table"
    ctx.save();
    const sh = ctx.createRadialGradient(W * 0.5 + ox, cy + R + 7, 4, W * 0.5 + ox, cy + R + 7, W * 0.45);
    sh.addColorStop(0, "rgba(51,36,26,0.16)");
    sh.addColorStop(1, "rgba(51,36,26,0)");
    ctx.fillStyle = sh;
    ctx.beginPath();
    ctx.ellipse(W * 0.47 + ox, cy + R + 7, W * 0.45, 5, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();

    ctx.save();
    ctx.translate(ox, 0);

    const sEnd = liquidEnd();
    const sx = sEnd;
    const thumbX = g.bx1 + 14 + (W - 18 - g.bx1 - 14) * (0.25 + 0.75 * p);

    // Needle
    const nx0 = g.needle0, nx1 = g.needle0 + g.needleL + 2;
    ctx.fillStyle = cylGrad(cy - 1.6, cy + 1.6, [[0, "#6f7a80"], [0.35, "#f1f5f6"], [1, "#59636a"]]);
    ctx.beginPath();
    ctx.moveTo(nx0, cy + 1.4);
    ctx.lineTo(nx0 + 7, cy - 1.5);
    ctx.lineTo(nx1, cy - 1.5);
    ctx.lineTo(nx1, cy + 1.5);
    ctx.closePath();
    ctx.fill();

    // Hub (colored cap) + tapered shoulder
    const hx0 = nx1 - 2, hx1 = g.bx0 + 2;
    ctx.fillStyle = cylGrad(cy - R * 0.45, cy + R * 0.45, [[0, "#e07a45"], [0.3, "#f6b48a"], [0.7, "#b8501f"], [1, "#8c3a13"]]);
    ctx.beginPath();
    ctx.moveTo(hx0, cy - R * 0.22);
    ctx.lineTo(hx0 + g.hubL * 0.45, cy - R * 0.3);
    ctx.lineTo(hx0 + g.hubL * 0.45, cy - R * 0.42);
    ctx.lineTo(hx1 - 4, cy - R * 0.42);
    ctx.lineTo(hx1, cy - R * 0.6);
    ctx.lineTo(hx1, cy + R * 0.6);
    ctx.lineTo(hx1 - 4, cy + R * 0.42);
    ctx.lineTo(hx0 + g.hubL * 0.45, cy + R * 0.42);
    ctx.lineTo(hx0 + g.hubL * 0.45, cy + R * 0.3);
    ctx.lineTo(hx0, cy + R * 0.22);
    ctx.closePath();
    ctx.fill();

    // Barrel back wall
    const barrelPath = () => {
      ctx.beginPath();
      ctx.moveTo(g.bx0 + 6, cy - R);
      ctx.lineTo(g.bx1, cy - R);
      ctx.lineTo(g.bx1, cy + R);
      ctx.lineTo(g.bx0 + 6, cy + R);
      ctx.quadraticCurveTo(g.bx0 - 2, cy + R, g.bx0 - 2, cy + R * 0.55);
      ctx.lineTo(g.bx0 - 2, cy - R * 0.55);
      ctx.quadraticCurveTo(g.bx0 - 2, cy - R, g.bx0 + 6, cy - R);
      ctx.closePath();
    };
    barrelPath();
    ctx.fillStyle = cylGrad(cy - R, cy + R, [[0, "rgba(255,255,255,0.55)"], [0.5, "rgba(255,255,255,0.22)"], [1, "rgba(220,205,180,0.45)"]]);
    ctx.fill();

    // Plunger rod inside + outside the barrel
    const rodH = R * 0.44;
    ctx.fillStyle = cylGrad(cy - rodH / 2, cy + rodH / 2, [[0, "#fbf6ec"], [0.45, "#e9dfca"], [1, "#b9aa8c"]]);
    ctx.fillRect(sx + g.sw - 1, cy - rodH / 2, thumbX - sx - g.sw, rodH);
    ctx.fillStyle = "rgba(90,70,50,0.18)";
    ctx.fillRect(sx + g.sw - 1, cy - 0.75, thumbX - sx - g.sw, 1.5);

    // Liquid
    if (N >= 2) {
      ctx.save();
      rr(g.ix0, g.top, g.ix1 - g.ix0, g.bot - g.top, 3);
      ctx.clip();

      const L = sEnd - g.ix0;
      const liquidPath = (offset = 0) => {
        ctx.beginPath();
        ctx.moveTo(g.ix0, g.bot + 2);
        for (let i = 0; i < N; i++) {
          const x = g.ix0 + (i / (N - 1)) * L;
          // meniscus lift at the walls
          const edge = Math.min(i, N - 1 - i);
          const men = edge === 0 ? -2.2 : edge === 1 ? -0.8 : 0;
          ctx.lineTo(x, g.restY + h[i] + men + offset);
        }
        ctx.lineTo(sEnd, g.bot + 2);
        ctx.closePath();
      };

      // Base color, one hue per dose segment
      const lg = ctx.createLinearGradient(g.ix0, 0, g.ix0 + g.travel, 0);
      LIQUID.forEach((c, i) => lg.addColorStop(i / (LIQUID.length - 1), c));
      liquidPath();
      ctx.fillStyle = lg;
      ctx.fill();

      // Cylinder shading on the liquid
      ctx.save();
      liquidPath();
      ctx.clip();
      ctx.fillStyle = cylGrad(g.top, g.bot, [[0, "rgba(255,255,255,0.35)"], [0.35, "rgba(255,255,255,0.05)"], [0.75, "rgba(0,0,0,0.1)"], [1, "rgba(40,10,40,0.38)"]]);
      ctx.fillRect(g.ix0, g.top - 10, L + 2, g.bot - g.top + 20);

      // Moving caustic shimmer
      const tt = time / 1000;
      for (let k = 0; k < 2; k++) {
        const cx = g.ix0 + ((tt * (18 + k * 11) + k * 140) % (L + 120)) - 60;
        const cg = ctx.createLinearGradient(cx - 30, 0, cx + 30, 0);
        cg.addColorStop(0, "rgba(255,255,255,0)");
        cg.addColorStop(0.5, "rgba(255,255,255,0.16)");
        cg.addColorStop(1, "rgba(255,255,255,0)");
        ctx.fillStyle = cg;
        ctx.fillRect(cx - 30, g.top, 60, g.bot - g.top);
      }

      // Bubbles
      for (const b of bubbles) {
        ctx.beginPath();
        ctx.arc(b.x, b.y, b.r, 0, Math.PI * 2);
        ctx.fillStyle = "rgba(255,255,255,0.25)";
        ctx.fill();
        ctx.strokeStyle = "rgba(255,255,255,0.75)";
        ctx.lineWidth = 0.8;
        ctx.stroke();
      }
      ctx.restore();

      // Far side of the surface (seen slightly from above) and sheen line
      ctx.beginPath();
      for (let i = 0; i < N; i++) {
        const x = g.ix0 + (i / (N - 1)) * L;
        const y = g.restY + h[i];
        i ? ctx.lineTo(x, y) : ctx.moveTo(x, y);
      }
      for (let i = N - 1; i >= 0; i--) {
        const x = g.ix0 + (i / (N - 1)) * L;
        ctx.lineTo(x, g.restY + h[i] + 4.5);
      }
      ctx.closePath();
      ctx.fillStyle = "rgba(255,255,255,0.22)";
      ctx.fill();

      ctx.beginPath();
      for (let i = 0; i < N; i++) {
        const x = g.ix0 + (i / (N - 1)) * L;
        const y = g.restY + h[i] + 0.5;
        i ? ctx.lineTo(x, y) : ctx.moveTo(x, y);
      }
      ctx.strokeStyle = "rgba(255,255,255,0.85)";
      ctx.lineWidth = 1.3;
      ctx.stroke();
      ctx.restore();
    }

    // Rubber stopper
    {
      const st = g.top - 0.5, sb = g.bot + 0.5;
      rr(sx, st, g.sw, sb - st, 3);
      ctx.fillStyle = cylGrad(st, sb, [[0, "#4a3f3a"], [0.28, "#6d615a"], [0.55, "#2c2421"], [1, "#171210"]]);
      ctx.fill();
      ctx.fillStyle = "rgba(0,0,0,0.35)";
      for (let k = 1; k < 3; k++) ctx.fillRect(sx + (g.sw * k) / 3 - 0.6, st, 1.2, sb - st);
    }

    // Glass front: highlights and edges
    barrelPath();
    ctx.lineWidth = 1.2;
    ctx.strokeStyle = "rgba(99,80,63,0.45)";
    ctx.stroke();
    ctx.save();
    barrelPath();
    ctx.clip();
    ctx.fillStyle = cylGrad(cy - R, cy + R, [
      [0, "rgba(51,36,26,0.14)"],
      [0.12, "rgba(255,255,255,0.0)"],
      [0.2, "rgba(255,255,255,0.75)"],
      [0.27, "rgba(255,255,255,0.1)"],
      [0.8, "rgba(255,255,255,0)"],
      [0.9, "rgba(255,255,255,0.28)"],
      [1, "rgba(51,36,26,0.16)"],
    ]);
    ctx.fillRect(g.bx0 - 4, cy - R, g.bx1 - g.bx0 + 6, 2 * R);
    ctx.restore();

    // Graduation scale printed on the glass
    ctx.strokeStyle = "rgba(51,36,26,0.4)";
    ctx.lineWidth = 1;
    const minor = total * 4;
    for (let k = 0; k <= minor; k++) {
      const x = Math.round(g.ix0 + (k / minor) * g.travel) + 0.5;
      const major = k % 4 === 0;
      ctx.beginPath();
      ctx.moveTo(x, g.top + 1);
      ctx.lineTo(x, g.top + (major ? 9 : 5));
      ctx.stroke();
    }

    // Open end of the barrel (ellipse) and finger flange
    ctx.beginPath();
    ctx.ellipse(g.bx1, cy, R * 0.18, R, 0, 0, Math.PI * 2);
    ctx.strokeStyle = "rgba(99,80,63,0.45)";
    ctx.stroke();
    const fh = R * 2.9;
    rr(g.bx1 - 1, cy - fh / 2, 7, fh, 3.5);
    ctx.fillStyle = cylGrad(cy - fh / 2, cy + fh / 2, [[0, "#fbf6ec"], [0.3, "#efe6d4"], [1, "#b9aa8c"]]);
    ctx.fill();
    ctx.strokeStyle = "rgba(99,80,63,0.35)";
    ctx.stroke();

    // Thumb rest
    const th = R * 2.2;
    rr(thumbX - 1, cy - th / 2, 8, th, 4);
    ctx.fillStyle = cylGrad(cy - th / 2, cy + th / 2, [[0, "#fbf6ec"], [0.3, "#efe6d4"], [1, "#b9aa8c"]]);
    ctx.fill();
    ctx.stroke();

    // Milestone markers
    ctx.textAlign = "center";
    for (let k = 1; k <= total; k++) {
      const vis = visits[k - 1];
      const x = g.ix0 + (k / total) * g.travel;
      const my = cy + R + 13;
      ctx.strokeStyle = "rgba(51,36,26,0.35)";
      ctx.beginPath();
      ctx.moveTo(x, cy + R + 1);
      ctx.lineTo(x, my - 6);
      ctx.stroke();
      ctx.beginPath();
      ctx.arc(x, my, 5.5, 0, Math.PI * 2);
      if (vis.done) {
        ctx.fillStyle = "#52603c";
        ctx.fill();
        ctx.strokeStyle = "#fff";
        ctx.lineWidth = 1.6;
        ctx.beginPath();
        ctx.moveTo(x - 2.6, my + 0.2);
        ctx.lineTo(x - 0.7, my + 2.1);
        ctx.lineTo(x + 2.8, my - 1.8);
        ctx.stroke();
        ctx.lineWidth = 1;
      } else {
        ctx.fillStyle = "#fdf7ea";
        ctx.fill();
        ctx.strokeStyle = "#b8501f";
        ctx.lineWidth = 1.8;
        ctx.stroke();
        ctx.lineWidth = 1;
      }
      const tight = g.travel / total < 64;
      ctx.font = `500 ${tight ? 9.5 : 11}px "IBM Plex Mono", ui-monospace, monospace`;
      ctx.fillStyle = vis.done ? "#33241a" : "#8c3a13";
      ctx.fillText(`${vis.approx && !tight ? "~" : ""}${fmtDate(vis.date)}`, x, my + 20);
      ctx.font = '400 9.5px "IBM Plex Mono", ui-monospace, monospace';
      ctx.fillStyle = "#8a7562";
      ctx.fillText(`DOSE ${k}`, x, my + 32);
    }

    // Finish flag above the last marker
    const fx = g.ix0 + g.travel;
    ctx.strokeStyle = "rgba(51,36,26,0.45)";
    ctx.beginPath();
    ctx.moveTo(fx, cy - R - 1);
    ctx.lineTo(fx, cy - R - 18);
    ctx.stroke();
    ctx.font = '500 9.5px "IBM Plex Mono", ui-monospace, monospace';
    ctx.textAlign = "right";
    const label = "FULLY VACCINATED";
    const tw = ctx.measureText(label).width;
    ctx.fillStyle = p >= 0.999 ? "#52603c" : "#b8501f";
    rr(fx - tw - 10, cy - R - 19, tw + 10, 13, 2);
    ctx.fill();
    ctx.fillStyle = "#fff";
    ctx.fillText(label, fx - 5, cy - R - 9.5);

    ctx.restore();
  }

  // ------------------------------- loop -----------------------------------
  function frame(now) {
    raf = 0;
    let fdt = Math.min(0.05, (now - last) / 1000);
    last = now;
    if (fdt <= 0) fdt = 1 / 60;

    // Container accel from drag (finite differences, smoothed)
    const oxv = (ox - lastOx) / fdt;
    const oxa = (oxv - lastOxVel) / fdt;
    lastOx = ox;
    lastOxVel = oxv;
    const axTarget = Math.max(-9000, Math.min(9000, oxa));
    axDrag += (axTarget - axDrag) * 0.5;

    // Page scroll accel (the card moves on screen when the page scrolls)
    const sv = (scrollY - lastScroll) / fdt;
    const sa = -(sv - lastScrollVel) / fdt;
    lastScroll = scrollY;
    lastScrollVel = sv;
    ayScroll += (Math.max(-12000, Math.min(12000, sa)) - ayScroll) * 0.4;
    if (Math.abs(sa) > 5000) splash(Math.min(40, Math.abs(sa) / 600));

    const subs = Math.ceil(fdt / (1 / 240));
    const dt = fdt / subs;
    for (let s = 0; s < subs; s++) step(dt);

    if (Math.random() < fdt * 0.35) spawnBubbles(1);
    if (Math.abs(axTarget) > 3500) spawnBubbles(2);

    draw(now);
    if (running) raf = requestAnimationFrame(frame);
  }

  function setRunning(on) {
    running = on && visible && !document.hidden && canvas.isConnected;
    if (running && !raf) {
      last = performance.now();
      raf = requestAnimationFrame(frame);
    }
  }

  // ------------------------------- input ----------------------------------
  stage.addEventListener("pointerdown", (e) => {
    enableMotion();
    dragging = true;
    dragStartX = e.clientX;
    dragStartOx = ox;
    oxVel = 0;
    stage.setPointerCapture(e.pointerId);
  });
  stage.addEventListener("pointermove", (e) => {
    if (!dragging) return;
    const raw = dragStartOx + (e.clientX - dragStartX);
    const lim = Math.min(70, W * 0.12);
    ox = lim * Math.tanh(raw / lim);
  });
  const endDrag = () => {
    if (!dragging) return;
    dragging = false;
    oxVel = lastOxVel;
  };
  stage.addEventListener("pointerup", endDrag);
  stage.addEventListener("pointercancel", endDrag);

  function onMotion(e) {
    const a = e.accelerationIncludingGravity;
    if (!a || a.x == null) return;
    // Rotate device axes into screen axes
    const ang = ((screen.orientation && screen.orientation.angle) || window.orientation || 0) * (Math.PI / 180);
    const cx = a.x * Math.cos(ang) + a.y * Math.sin(ang);
    const cyv = -a.x * Math.sin(ang) + a.y * Math.cos(ang);
    // Effective gravity for the fluid is the opposite of the sensed reaction force.
    let sx = -cx * sensorSign, sy = cyv * sensorSign;
    // Auto calibrate sign: people hold phones top up, so gravity should point down the screen.
    if (sy < -3) {
      flipTimer += 1;
      if (flipTimer > 20) { sensorSign *= -1; flipTimer = 0; sx = -sx; sy = -sy; }
    } else flipTimer = 0;
    const k = G / 9.81;
    gx += (sx * k - gx) * 0.35;
    gy += (sy * k - gy) * 0.35;
    if (!motionOn) {
      motionOn = true;
      hintText.textContent = "Tilt your phone or drag the syringe.";
      const btn = hint.querySelector(".vx-motion");
      if (btn) btn.remove();
    }
  }

  let motionAsked = false;
  function enableMotion() {
    if (motionAsked || typeof DeviceMotionEvent === "undefined") return;
    motionAsked = true;
    if (typeof DeviceMotionEvent.requestPermission === "function") {
      DeviceMotionEvent.requestPermission()
        .then((r) => { if (r === "granted") addEventListener("devicemotion", onMotion); })
        .catch(() => {});
    }
  }

  if (typeof DeviceMotionEvent !== "undefined") {
    if (typeof DeviceMotionEvent.requestPermission === "function") {
      if (matchMedia("(pointer: coarse)").matches) {
        const btn = document.createElement("button");
        btn.type = "button";
        btn.className = "vx-motion";
        btn.textContent = "Enable tilt";
        btn.addEventListener("click", enableMotion);
        hint.appendChild(btn);
      }
    } else {
      addEventListener("devicemotion", onMotion);
    }
  }

  // ------------------------------- lifecycle ------------------------------
  layout();
  const ro = new ResizeObserver(() => { layout(); draw(performance.now()); });
  ro.observe(stage);

  const io = new IntersectionObserver((entries) => {
    visible = entries[0].isIntersecting;
    if (visible && !introStarted) {
      introStarted = true;
    }
    setRunning(true);
  }, { threshold: 0.2 });
  io.observe(canvas);

  const onVis = () => setRunning(true);
  document.addEventListener("visibilitychange", onVis);

  // Stop everything if React removes the card.
  const gone = setInterval(() => {
    if (!canvas.isConnected) {
      clearInterval(gone);
      running = false;
      if (raf) cancelAnimationFrame(raf);
      ro.disconnect();
      io.disconnect();
      document.removeEventListener("visibilitychange", onVis);
      removeEventListener("devicemotion", onMotion);
    }
  }, 1000);

  if (document.fonts) document.fonts.ready.then(() => draw(performance.now()));
  draw(performance.now());
}

// ---------------------------------------------------------------------------
// Mounting into the React app
// ---------------------------------------------------------------------------
function injectCss() {
  if (document.getElementById("vx-style")) return;
  const s = document.createElement("style");
  s.id = "vx-style";
  s.textContent = CSS;
  document.head.appendChild(s);
}

let mounting = false;
async function tryMount() {
  const hero = document.querySelector(".home-page .home-hero");
  if (!hero || mounting || document.querySelector(".home-page .vx")) return;
  mounting = true;
  try {
    const visits = await loadVisits();
    if (!visits.length || !hero.isConnected || document.querySelector(".home-page .vx")) return;
    injectCss();
    const card = buildCard(visits);
    hero.insertAdjacentElement("afterend", card);
    startSyringe(card, visits);
  } catch (err) {
    console.warn("Vaccine syringe failed to load", err);
  } finally {
    mounting = false;
  }
}

new MutationObserver(tryMount).observe(document.getElementById("root") || document.body, {
  childList: true,
  subtree: true,
});
tryMount();
