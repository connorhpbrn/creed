"use client";

// Minimal, dependency-free confetti. A single shared canvas is created lazily
// on the first burst; particles are simple rotating rects under gravity, and
// the animation loop stops itself once they've all faded. Ported from the
// maintainer's prototype, scaled down a touch for the in-app accent picker.

type Particle = {
  x: number;
  y: number;
  vx: number;
  vy: number;
  rot: number;
  vr: number;
  size: number;
  life: number;
  maxLife: number;
  color: string;
};

let canvas: HTMLCanvasElement | null = null;
let ctx: CanvasRenderingContext2D | null = null;
const particles: Particle[] = [];
let raf = 0;

function resize() {
  if (!canvas || !ctx) return;
  // Cap the backing resolution at 1x. Per-frame cost (clearing, painting, and
  // compositing this full-viewport layer over the dialog's backdrop blur)
  // scales with the pixel count, and fast-moving solid-colour confetti rects
  // get no visible benefit from retina resolution - so 1x is ~75% less work
  // than 2x with no perceptible change to the effect.
  const dpr = 1;
  canvas.width = Math.floor(window.innerWidth * dpr);
  canvas.height = Math.floor(window.innerHeight * dpr);
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
}

function ensureCanvas() {
  if (canvas) return;
  canvas = document.createElement("canvas");
  // will-change/translateZ force the canvas onto its own GPU compositor layer.
  // Without it, repainting a full-viewport canvas that sits over the dialog's
  // backdrop-blur overlay makes the browser re-run that expensive blur every
  // frame (the source of the "lag" - it never happens for the color picker,
  // which fires with no blur present). Isolated, the canvas just composites
  // over the already-computed blur. `contain` keeps its paints self-scoped.
  canvas.style.cssText =
    "position:fixed;inset:0;width:100%;height:100%;pointer-events:none;z-index:9998;will-change:transform;transform:translateZ(0);backface-visibility:hidden;contain:layout paint;";
  ctx = canvas.getContext("2d");
  document.body.appendChild(canvas);
  resize();
  window.addEventListener("resize", resize);
}

// Drop the shared canvas once a burst ends so its promoted GPU compositor layer
// (will-change/translateZ) and the resize listener are not retained for the
// rest of the session. ensureCanvas recreates it lazily on the next burst.
function teardown() {
  if (canvas) {
    canvas.remove();
    window.removeEventListener("resize", resize);
  }
  canvas = null;
  ctx = null;
  raf = 0;
}

function loop() {
  if (!ctx || !canvas) {
    raf = 0;
    return;
  }
  ctx.clearRect(0, 0, canvas.width, canvas.height);

  for (let i = particles.length - 1; i >= 0; i--) {
    const p = particles[i];
    p.life++;
    p.vy += 0.16; // gravity
    p.vx *= 0.99;
    p.vy *= 0.99;
    p.x += p.vx;
    p.y += p.vy;
    p.rot += p.vr;

    const t = p.life / p.maxLife;
    if (t >= 1) {
      particles.splice(i, 1);
      continue;
    }

    ctx.save();
    ctx.globalAlpha = t < 0.7 ? 1 : 1 - (t - 0.7) / 0.3;
    ctx.translate(p.x, p.y);
    ctx.rotate(p.rot);
    ctx.fillStyle = p.color;
    ctx.fillRect(-p.size / 2, -p.size / 2, p.size, p.size * 0.6);
    ctx.restore();
  }

  if (particles.length) {
    raf = requestAnimationFrame(loop);
  } else {
    teardown();
  }
}

export function fireConfetti(x: number, y: number, color: string) {
  if (typeof window === "undefined") return;
  if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;

  ensureCanvas();

  // Smaller burst than the prototype: fewer, slightly smaller particles, a
  // shorter arc, so it reads as a small celebratory pop from the swatch
  // rather than a full-screen cannon.
  const count = 14;
  for (let i = 0; i < count; i++) {
    const angle = -Math.PI / 2 + (Math.random() - 0.5) * Math.PI * 0.9;
    const speed = 2 + Math.random() * 4;
    particles.push({
      x,
      y,
      vx: Math.cos(angle) * speed,
      vy: Math.sin(angle) * speed,
      rot: Math.random() * Math.PI,
      vr: (Math.random() - 0.5) * 0.3,
      size: 3 + Math.random() * 3,
      life: 0,
      maxLife: 42 + Math.random() * 24,
      color,
    });
  }

  if (!raf) raf = requestAnimationFrame(loop);
}

// Bright, multicoloured palette for the welcome celebration - all pulled from
// the app's section accent palette (see lib/creed-data.ts accentColorMap).
const WELCOME_COLORS = [
  "#DC2626", // red
  "#EAB308", // yellow
  "#16A34A", // green
  "#EA580C", // orange
  "#2563EB", // blue
  "#7C3AED", // purple
  "#DB2777", // pink
];

// Two simultaneous side bursts that arc up and inward - a "poof" from each edge
// of the screen. Fired when the welcome pop-up first appears. Same lightweight
// particle system as fireConfetti, just more particles and a directional angle.
export function fireWelcomeConfetti() {
  if (typeof window === "undefined") return;
  if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;

  ensureCanvas();

  const w = window.innerWidth;
  const y = window.innerHeight * 0.6;
  const perSide = 50;

  const spawn = (x: number, baseAngle: number) => {
    for (let i = 0; i < perSide; i++) {
      const angle = baseAngle + (Math.random() - 0.5) * Math.PI * 0.5;
      const speed = 6 + Math.random() * 12;
      particles.push({
        x,
        y: y + (Math.random() - 0.5) * 50,
        vx: Math.cos(angle) * speed,
        vy: Math.sin(angle) * speed,
        rot: Math.random() * Math.PI,
        vr: (Math.random() - 0.5) * 0.38,
        size: 4 + Math.random() * 5,
        life: 0,
        maxLife: 60 + Math.random() * 40,
        color: WELCOME_COLORS[(Math.random() * WELCOME_COLORS.length) | 0],
      });
    }
  };

  // Left edge -> up and to the right; right edge -> up and to the left.
  spawn(0, -Math.PI / 2 + Math.PI * 0.28);
  spawn(w, -Math.PI / 2 - Math.PI * 0.28);

  if (!raf) raf = requestAnimationFrame(loop);
}
