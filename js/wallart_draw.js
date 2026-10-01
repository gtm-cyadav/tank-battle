// Wall art everywhere (Chetan, 2026-10-01): the DRAWING of the graffiti and the fake posters, all in code (no downloads). wallart.js decides what goes where; this
// file paints one atlas texture (every line of graffiti and every poster once) and builds ONE mesh of small quads that stand 3 cm off the walls: one draw call for all of it
// (the 4A graffiti was already one). Low graphics paint the same atlas at half size: the same pieces in the same places on every phone, only less detailed.
// Muted on purpose: paper is faded and grimy, paint is a shade lighter than the wall, nothing shines.
import * as THREE from '../lib/three.module.js';
import { POOL, POSTERS, POSTER, CELL_W, CELL_H, graffitiSize, isChalk } from './wallart.js';


const FONT = (w, s) => `${w} ${s}px "Plex Mono", ui-monospace, Menlo, Consolas, monospace`;
const seeded = n => { let s = (n * 7919 + 13) >>> 0; return () => ((s = (s * 1664525 + 1013904223) >>> 0) / 4294967296); };

// ---- graffiti ----------------------------------------------------------------------------------------------------------------
// stencil: faint pale writing with a hint of depth and a few runs of paint (the 4A look). chalk: thin, wobbly, each letter a little off, a smudge behind.
function drawGraffiti(g, text, i, x0, y0, k) {
  const CW = CELL_W * k, CH = CELL_H * k, { lines, px } = graffitiSize(text), size = px * k;
  g.textAlign = 'center'; g.textBaseline = 'middle';
  const cx = x0 + CW / 2, lh = size * 1.12, top = y0 + CH / 2 - (lines.length - 1) * lh / 2, longest = Math.max(...lines.map(l => l.length));
  if (isChalk(i)) {
    const step = size * 0.62, rand = seeded(i + 1);
    g.font = FONT(400, size);
    lines.forEach((l, n) => {
      const sx = cx - (l.length * step) / 2 + step / 2, y = top + n * lh;
      g.fillStyle = 'rgba(236,238,232,0.09)'; g.fillRect(cx - l.length * step / 2 - step * 0.3, y - size * 0.6, l.length * step + step * 0.6, size * 1.2);   // a chalky smudge behind
      for (let c = 0; c < l.length; c++) {
        g.save(); g.translate(sx + c * step, y + (rand() - 0.5) * size * 0.2); g.rotate((rand() - 0.5) * 0.18);
        g.fillStyle = `rgba(236,238,232,${0.38 + rand() * 0.2})`; g.fillText(l[c], 0, 0); g.restore();
      }
    });
    g.fillStyle = 'rgba(236,238,232,0.4)'; g.fillRect(cx - longest * step * 0.4, top + (lines.length - 0.35) * lh, longest * step * 0.8, Math.max(1, 1.2 * k));
    return;
  }
  g.font = FONT(500, size);
  lines.forEach((l, n) => {
    g.fillStyle = 'rgba(28,32,30,0.20)'; g.fillText(l, cx + 0.75 * k, top + n * lh + 0.75 * k);
    g.fillStyle = 'rgba(226,232,226,0.48)'; g.fillText(l, cx, top + n * lh);
  });
  const rand = seeded(i + 1); g.fillStyle = 'rgba(224,230,224,0.24)';
  for (let d = 0; d < 3; d++) g.fillRect(cx + (rand() - 0.5) * longest * size * 0.55, top + (lines.length - 0.5) * lh, Math.max(1, 0.8 * k), (3 + rand() * 7) * k);
}

// ---- posters -------------------------------------------------------------------------------------------------------------------
const PAL = {
  A: { bg: '#d9cfb4', a: '#c0583a', b: '#4a5a52', dark: '#2d3a34', light: '#e6dcc0', ink: '#26302b', sub: '#3d4640' },
  B: { bg: '#c9803a', a: '#e0b25a', b: '#3d7d76', c: '#a8444a', dark: '#2d3a3a', light: '#f2e3b8', ink: '#f2e3b8', sub: '#f2e3b8' },
  C: { bg: '#242a2f', a: '#5a6a8a', b: '#8a5a6a', dark: '#242a2f', light: '#c9cfd2', ink: '#c9cfd2', sub: '#8f979b' },
};
const circle = (g, x, y, r, fill) => { g.fillStyle = fill; g.beginPath(); g.arc(x, y, r, 0, 6.2832); g.fill(); };
const rect = (g, x, y, w, h, fill) => { g.fillStyle = fill; g.fillRect(x, y, w, h); };
const poly = (g, pts, fill) => { g.fillStyle = fill; g.beginPath(); pts.forEach(([x, y], i) => (i ? g.lineTo(x, y) : g.moveTo(x, y))); g.closePath(); g.fill(); };
function burst(g, cx, cy, R, fill, n = 28) { g.fillStyle = fill; g.beginPath(); for (let i = 0; i < n; i++) { const r = i % 2 ? R * 0.52 : R, a = i / n * 6.2832; g.lineTo(cx + Math.cos(a) * r, cy + Math.sin(a) * r); } g.closePath(); g.fill(); }
function mug(g, x, y, w, h, fill, dark) { rect(g, x, y, w, h, fill); g.strokeStyle = fill; g.lineWidth = w * 0.12; g.beginPath(); g.arc(x + w, y + h * 0.45, h * 0.28, -1.4, 1.4); g.stroke(); rect(g, x, y, w, h * 0.12, dark); }
function tankShape(g, x, y, s, fill) { rect(g, x - s * 0.5, y, s, s * 0.32, fill); rect(g, x - s * 0.28, y - s * 0.2, s * 0.5, s * 0.22, fill); rect(g, x + s * 0.2, y - s * 0.14, s * 0.55, s * 0.07, fill); }

// the artwork, in the top 58 per cent of the poster: art(g, W, H, p). Plain shapes only.
const ART = {
  sunhills(g, W, H, p) {
    circle(g, W / 2, H * 0.4, W * 0.3, p.a); rect(g, 0, H * 0.4, W, H * 0.2, p.bg);
    poly(g, [[0, H * 0.58], [W * 0.3, H * 0.38], [W * 0.55, H * 0.5], [W * 0.8, H * 0.35], [W, H * 0.5], [W, H * 0.58]], p.b);
    rect(g, W * 0.44, H * 0.3, W * 0.05, W * 0.14, p.dark); circle(g, W * 0.465, H * 0.29, W * 0.035, p.dark);   // a lone figure
  },
  burstpair(g, W, H, p) {
    burst(g, W / 2, H * 0.34, W * 0.55, p.a); circle(g, W * 0.38, H * 0.34, W * 0.16, p.b); circle(g, W * 0.63, H * 0.35, W * 0.15, p.c);
    rect(g, W * 0.33, H * 0.42, W * 0.1, W * 0.2, p.dark); rect(g, W * 0.58, H * 0.43, W * 0.1, W * 0.2, p.dark);
  },
  moonblinds(g, W, H, p) {
    const gr = g.createLinearGradient(0, H * 0.06, 0, H * 0.54); gr.addColorStop(0, p.a); gr.addColorStop(1, p.b); circle(g, W / 2, H * 0.32, W * 0.34, gr);
    rect(g, 0, H * 0.4, W, H * 0.02, p.bg); rect(g, 0, H * 0.45, W, H * 0.015, p.bg); rect(g, 0, H * 0.49, W, H * 0.01, p.bg);
  },
  bursttanks(g, W, H, p) {
    burst(g, W / 2, H * 0.3, W * 0.58, p.a);
    for (let i = 0; i < 3; i++) tankShape(g, W * (0.26 + i * 0.24), H * (0.3 + 0.03 * (i % 2)), W * 0.26, p.dark);
    for (let i = 0; i < 3; i++) circle(g, W * (0.26 + i * 0.24), H * 0.16, W * 0.025, p.light);   // the count
  },
  moonmug(g, W, H, p) {
    circle(g, W * 0.5, H * 0.24, W * 0.26, p.a); circle(g, W * 0.6, H * 0.2, W * 0.24, p.bg);   // a crescent
    mug(g, W * 0.3, H * 0.34, W * 0.34, H * 0.18, p.dark, p.b);
  },
  footprint(g, W, H, p) {
    g.strokeStyle = p.dark; g.lineWidth = W * 0.025; g.strokeRect(W * 0.2, H * 0.08, W * 0.6, H * 0.46);   // the parking bay
    rect(g, W * 0.46, H * 0.44, W * 0.08, H * 0.08, p.dark);
    for (const [dx, dy, r] of [[-0.14, 0, 0.07], [0, -0.06, 0.08], [0.14, 0, 0.07]]) { g.fillStyle = p.a; g.beginPath(); g.ellipse(W * (0.5 + dx), H * (0.2 + dy), W * r * 0.8, H * r * 1.0, 0, 0, 6.2832); g.fill(); }
    g.fillStyle = p.a; g.beginPath(); g.ellipse(W * 0.5, H * 0.33, W * 0.17, H * 0.1, 0, 0, 6.2832); g.fill();
  },
  planet(g, W, H, p) {
    const gr = g.createLinearGradient(0, H * 0.1, 0, H * 0.5); gr.addColorStop(0, p.a); gr.addColorStop(1, p.b); circle(g, W / 2, H * 0.3, W * 0.22, gr);
    g.strokeStyle = p.light; g.lineWidth = W * 0.025; g.beginPath(); g.ellipse(W / 2, H * 0.3, W * 0.4, H * 0.06, -0.25, 0, 6.2832); g.stroke();
    for (let i = 0; i < 9; i++) circle(g, W * (0.1 + i * 0.1), H * 0.55, W * 0.02, p.light);   // the queue
  },
  threebars(g, W, H, p) {
    burst(g, W / 2, H * 0.3, W * 0.56, p.a);
    [0.5, 0.62, 0.74].forEach((hh, i) => rect(g, W * (0.22 + i * 0.22), H * (0.55 - hh * 0.5), W * 0.16, H * hh * 0.5, p.dark));
  },
  shades(g, W, H, p) {
    const gr = g.createLinearGradient(0, H * 0.1, 0, H * 0.55); gr.addColorStop(0, p.b); gr.addColorStop(1, p.a); circle(g, W / 2, H * 0.55, W * 0.4, gr); rect(g, 0, H * 0.55, W, H * 0.05, p.bg);
    g.fillStyle = p.light; g.beginPath(); g.roundRect(W * 0.12, H * 0.22, W * 0.32, H * 0.13, W * 0.05); g.roundRect(W * 0.56, H * 0.22, W * 0.32, H * 0.13, W * 0.05); g.fill();
    g.fillStyle = p.bg; g.beginPath(); g.roundRect(W * 0.15, H * 0.235, W * 0.26, H * 0.1, W * 0.04); g.roundRect(W * 0.59, H * 0.235, W * 0.26, H * 0.1, W * 0.04); g.fill();
    rect(g, W * 0.44, H * 0.25, W * 0.12, H * 0.015, p.light);
  },
  butter(g, W, H, p) {
    burst(g, W / 2, H * 0.3, W * 0.56, p.a, 24);
    g.fillStyle = '#d9c08a'; g.beginPath(); g.roundRect(W * 0.2, H * 0.2, W * 0.6, H * 0.22, W * 0.06); g.fill();   // the toast
    g.fillStyle = '#e8cf6a'; g.fillRect(W * 0.34, H * 0.24, W * 0.32, H * 0.08); rect(g, W * 0.34, H * 0.24, W * 0.32, H * 0.015, '#f4e6a0');   // the butter
  },
  nametag(g, W, H, p) {
    circle(g, W * 0.34, H * 0.2, W * 0.1, p.dark); rect(g, W * 0.24, H * 0.29, W * 0.2, H * 0.22, p.dark);
    circle(g, W * 0.66, H * 0.2, W * 0.1, p.b); rect(g, W * 0.56, H * 0.29, W * 0.2, H * 0.22, p.b);
    g.strokeStyle = p.a; g.lineWidth = W * 0.015; g.beginPath(); g.moveTo(W * 0.4, H * 0.3); g.lineTo(W * 0.5, H * 0.4); g.lineTo(W * 0.6, H * 0.3); g.stroke();
    rect(g, W * 0.4, H * 0.4, W * 0.2, H * 0.1, p.a); rect(g, W * 0.43, H * 0.43, W * 0.14, H * 0.012, p.light); rect(g, W * 0.43, H * 0.46, W * 0.1, H * 0.012, p.light);
  },
  skyline(g, W, H, p) {
    circle(g, W * 0.64, H * 0.22, W * 0.2, p.light);
    [[0, 0.5, 0.16], [0.14, 0.38, 0.12], [0.26, 0.46, 0.18], [0.44, 0.34, 0.1], [0.54, 0.44, 0.16], [0.7, 0.3, 0.12], [0.82, 0.42, 0.18]].forEach(([x, top, w]) => rect(g, W * x, H * top, W * w, H * (0.58 - top), p.dark));
  },
  hourglass(g, W, H, p) {
    poly(g, [[W * 0.28, H * 0.08], [W * 0.72, H * 0.08], [W * 0.54, H * 0.3], [W * 0.46, H * 0.3]], p.a); poly(g, [[W * 0.46, H * 0.3], [W * 0.54, H * 0.3], [W * 0.72, H * 0.52], [W * 0.28, H * 0.52]], p.b);
    g.strokeStyle = p.light; g.lineWidth = W * 0.02; g.beginPath(); g.moveTo(W * 0.26, H * 0.08); g.lineTo(W * 0.74, H * 0.08); g.moveTo(W * 0.26, H * 0.52); g.lineTo(W * 0.74, H * 0.52); g.stroke();
  },
  flamemug(g, W, H, p) {
    mug(g, W * 0.3, H * 0.36, W * 0.34, H * 0.17, p.dark, p.b);
    for (const [dx, hh] of [[0.32, 0.16], [0.46, 0.22], [0.58, 0.14]]) { g.fillStyle = p.a; g.beginPath(); g.moveTo(W * dx, H * 0.36); g.quadraticCurveTo(W * (dx - 0.07), H * (0.36 - hh * 0.5), W * (dx + 0.02), H * (0.36 - hh)); g.quadraticCurveTo(W * (dx + 0.09), H * (0.36 - hh * 0.4), W * (dx + 0.07), H * 0.36); g.fill(); }
  },
};

function wrapText(g, text, maxW) {
  const words = text.split(' '), lines = []; let line = '';
  for (const w of words) { const t = line ? line + ' ' + w : w; if (g.measureText(t).width > maxW && line) { lines.push(line); line = w; } else line = t; }
  lines.push(line); return lines;
}
// one poster into a W x H canvas context: paper, artwork, title, tagline, then the weathering (stains, folds, fade, a torn corner that shows the wall)
function drawPoster(g, def, W, H, n) {
  const p = PAL[def.style], rand = seeded(n + 100), k = W / 160;
  g.clearRect(0, 0, W, H);
  g.fillStyle = p.bg; g.fillRect(0, 0, W, H);
  if (def.style === 'B') { /* the teal band for the title comes after the art */ }
  ART[def.art](g, W, H, p);
  if (def.style === 'B') rect(g, 0, H * 0.6, W, H * 0.4, p.b);
  g.textAlign = 'center'; g.textBaseline = 'alphabetic';
  // title: as big as fits in three lines
  const upper = def.title.toUpperCase(), weight = def.style === 'C' ? 500 : 700; let size = W * (def.style === 'C' ? 0.085 : 0.1), lines;
  for (; size > W * 0.05; size -= W * 0.004) { g.font = FONT(weight, size); lines = wrapText(g, upper, W * 0.9); if (lines.length <= 3 && lines.every(l => g.measureText(l).width <= W * 0.9)) break; }
  const y0 = H * (def.style === 'A' ? 0.64 : def.style === 'B' ? 0.7 : 0.74), lh = size * 1.15;
  g.save(); if (def.style === 'B') { g.translate(W / 2, y0); g.rotate(-0.05); g.translate(-W / 2, -y0); }
  g.font = FONT(weight, size); g.fillStyle = p.ink; g.strokeStyle = '#7a2d2d'; g.lineWidth = 2 * k; g.lineJoin = 'round';
  lines.forEach((l, i) => { if (def.style === 'B') g.strokeText(l, W / 2, y0 + i * lh); g.fillText(l, W / 2, y0 + i * lh); });
  g.restore();
  const ts = W * 0.052; g.font = FONT(400, ts); g.fillStyle = p.sub;
  wrapText(g, def.tag, W * 0.84).forEach((l, i) => g.fillText(l, W / 2, y0 + lines.length * lh + ts * 0.5 + i * ts * 1.25));
  if (def.style === 'A') { g.strokeStyle = p.ink; g.lineWidth = 1.5 * k; g.strokeRect(3 * k, 3 * k, W - 6 * k, H - 6 * k); }
  // weathering
  for (let i = 0; i < 40; i++) { g.fillStyle = `rgba(70,55,35,${rand() * 0.07})`; g.beginPath(); g.arc(rand() * W, rand() * H, (1.5 + rand() * 7) * k, 0, 6.2832); g.fill(); }
  g.strokeStyle = 'rgba(0,0,0,0.16)'; g.lineWidth = Math.max(1, k * 0.8); g.beginPath(); g.moveTo(0, H / 2); g.lineTo(W, H / 2); g.moveTo(W / 2, 0); g.lineTo(W / 2, H); g.stroke();   // fold lines
  g.fillStyle = 'rgba(255,255,255,0.08)'; g.fillRect(0, H / 2 + 1, W, Math.max(1, k * 0.8));
  const fade = g.createLinearGradient(0, 0, 0, H); fade.addColorStop(0, 'rgba(130,140,135,0.16)'); fade.addColorStop(1, 'rgba(60,66,62,0.26)'); g.fillStyle = fade; g.fillRect(0, 0, W, H);   // sun-faded top, grimy bottom
  if (def.style === 'B') { g.fillStyle = 'rgba(118,124,120,0.14)'; g.fillRect(0, 0, W, H); }   // the painted ones are the loudest, so they get an extra veil of grey
  g.save(); g.globalCompositeOperation = 'destination-out'; poly(g, [[W, H], [W - 0.2 * W, H], [W, H - 0.15 * H]], '#000'); g.restore();   // a torn corner
}

// ---- the atlas and the mesh -------------------------------------------------------------------------------------------------
// layout: layoutWallArt(...). quality 'high' | 'low' (half size, same pieces).
export function makeWallArt(layout, quality = 'high') {
  const k = quality === 'high' ? 1 : 0.5, GC = 4, GR = Math.ceil(POOL.length / GC);
  const cw = CELL_W * k, ch = CELL_H * k, pw = POSTER.cw * k, ph = POSTER.ch * k, PC = Math.floor(1024 * k / pw), PR = Math.ceil(POSTERS.length / PC);
  const W = 1024 * k, H = ch * GR + ph * PR;
  const canvas = document.createElement('canvas'); canvas.width = W; canvas.height = H;
  const paint = () => {
    const g = canvas.getContext('2d'); g.clearRect(0, 0, W, H);
    POOL.forEach((text, i) => drawGraffiti(g, text, i, (i % GC) * cw, Math.floor(i / GC) * ch, k));
    const tmp = document.createElement('canvas'); tmp.width = pw; tmp.height = ph; const t = tmp.getContext('2d');
    POSTERS.forEach((def, j) => {
      drawPoster(t, def, pw, ph, j);
      g.globalAlpha = 0.92; g.drawImage(tmp, (j % PC) * pw, ch * GR + Math.floor(j / PC) * ph); g.globalAlpha = 1;   // paper a touch see-through: muted
    });
  };
  paint();
  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace; tex.anisotropy = 4;
  document.fonts?.load('500 40px "Plex Mono"').then(() => Promise.all([document.fonts.load('700 40px "Plex Mono"'), document.fonts.load('400 40px "Plex Mono"')])).then(() => { paint(); tex.needsUpdate = true; }).catch(() => {});
  const pos = [], uv = [], nrm = [], idx = [];
  for (const q of layout.pieces) {
    const rx = q.nz, rz = -q.nx, base = pos.length / 3, cx = q.x + q.nx * 0.03, cz = q.z + q.nz * 0.03;
    let u0, u1, v0, v1;
    if (q.kind === 'graffiti') { const col = q.item % GC, row = Math.floor(q.item / GC); u0 = col * cw / W; u1 = (col + 1) * cw / W; v1 = 1 - row * ch / H; v0 = 1 - (row + 1) * ch / H; }
    else { const col = q.item % PC, row = Math.floor(q.item / PC), y = ch * GR + row * ph; u0 = col * pw / W; u1 = (col + 1) * pw / W; v1 = 1 - y / H; v0 = 1 - (y + ph) / H; }
    for (const [s, vy] of [[-1, q.y - q.h / 2], [1, q.y - q.h / 2], [1, q.y + q.h / 2], [-1, q.y + q.h / 2]]) { pos.push(cx + rx * s * q.w / 2, vy, cz + rz * s * q.w / 2); nrm.push(q.nx, 0, q.nz); }
    uv.push(u0, v0, u1, v0, u1, v1, u0, v1);
    idx.push(base, base + 1, base + 2, base, base + 2, base + 3);
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  geo.setAttribute('normal', new THREE.Float32BufferAttribute(nrm, 3));
  geo.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  geo.setIndex(idx);
  const mat = new THREE.MeshStandardMaterial({ map: tex, transparent: true, depthWrite: false, roughness: 0.95, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2 });
  const mesh = new THREE.Mesh(geo, mat);
  mesh.renderOrder = 1; mesh.frustumCulled = false;
  mesh.userData = { atlas: { w: W, h: H }, pieces: layout.pieces.length };
  return mesh;
}
