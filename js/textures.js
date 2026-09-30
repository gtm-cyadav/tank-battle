// Surfaces drawn in code (Stage 2A): concrete floor, painted precast wall panels with rust runs and grime, corrugated
// rusty outer walls, worn hazard stripes, and a whole-yard shading map (dark where the floor meets the walls, plus
// big faint stains so the floor tiles don't visibly repeat). No downloads: all of it is made when the game loads.
// Every texture is tileable and drawn from a fixed seed, so it looks the same on both phones and on every visit.
// Drawing them all takes about a second on a laptop (more on a phone), so it's done in small slices between frames
// (every function here returns a promise): the start screen never freezes, the walls show plain colours until then.
import * as THREE from '../lib/three.module.js';

// ---- small toolkit ---------------------------------------------------------------------------------------------
function rng(seed) { let s = seed >>> 0; return () => ((s = (s * 1664525 + 1013904223) >>> 0) / 4294967296); }
// Tileable value noise: `period` cells across the texture, wraps at the edges.
function noise(period, rand) {
  const g = new Float32Array(period * period).map(() => rand());
  return (u, v) => {   // u, v in 0..1
    const x = u * period, y = v * period, x0 = Math.floor(x), y0 = Math.floor(y), fx = x - x0, fy = y - y0;
    const sx = fx * fx * (3 - 2 * fx), sy = fy * fy * (3 - 2 * fy);
    const at = (i, j) => g[((j % period + period) % period) * period + ((i % period + period) % period)];
    const a = at(x0, y0), b = at(x0 + 1, y0), c = at(x0, y0 + 1), d = at(x0 + 1, y0 + 1);
    return a + (b - a) * sx + (c - a) * sy + (a - b - c + d) * sx * sy;
  };
}
// Several octaves together, 0..1 (roughly).
function fbm(periods, rand) {
  const layers = periods.map(p => noise(p, rand));
  let total = 0; const w = periods.map((_, i) => { const x = 1 / (i + 1.5); total += x; return x; });
  return (u, v) => { let s = 0; for (let i = 0; i < layers.length; i++) s += layers[i](u, v) * w[i]; return s / total; };
}
const clamp = (v, a = 0, b = 1) => Math.max(a, Math.min(b, v));
const smooth = (a, b, v) => { const t = clamp((v - a) / (b - a)); return t * t * (3 - 2 * t); };

// Let the page breathe: after about 8 ms of drawing, wait for the next moment the browser is free.
// (A message to ourselves rather than a timer: timers wait at least 4 ms each, and much longer in a background tab.)
let sliceStart = 0;
const channel = new MessageChannel(), waiting = [];
channel.port1.onmessage = () => waiting.shift()?.();
const nextTask = () => new Promise(r => { waiting.push(r); channel.port2.postMessage(0); });
const breathe = async () => { if (performance.now() - sliceStart > 8) { await nextTask(); sliceStart = performance.now(); } };

// A texture built pixel by pixel. paint(u, v, out) sets out[0..2] (0..255 colour) and returns the height (0..1),
// used for the bumps in the normal map.
async function build(w, h, paint, { normal = 0 } = {}) {
  const cv = document.createElement('canvas'); cv.width = w; cv.height = h;
  const g = cv.getContext('2d'), img = g.createImageData(w, h), px = img.data, height = new Float32Array(w * h), c = [0, 0, 0];
  sliceStart = performance.now();
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    if (x === 0 && (y & 7) === 0) await breathe();
    const i = y * w + x;
    height[i] = paint((x + 0.5) / w, (y + 0.5) / h, c);
    px[i * 4] = clamp(c[0], 0, 255); px[i * 4 + 1] = clamp(c[1], 0, 255); px[i * 4 + 2] = clamp(c[2], 0, 255); px[i * 4 + 3] = 255;
  }
  g.putImageData(img, 0, 0);
  const tex = new THREE.CanvasTexture(cv);
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 4;
  let nrm = null;
  if (normal) {   // slopes of the height, wrapped at the edges
    const nc = document.createElement('canvas'); nc.width = w; nc.height = h;
    const ng = nc.getContext('2d'), ni = ng.createImageData(w, h), nd = ni.data;
    const H = (x, y) => height[((y + h) % h) * w + ((x + w) % w)];
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
      if (x === 0 && (y & 15) === 0) await breathe();
      const dx = (H(x + 1, y) - H(x - 1, y)) * normal, dy = (H(x, y + 1) - H(x, y - 1)) * normal, l = Math.hypot(dx, dy, 1), i = (y * w + x) * 4;
      nd[i] = (-dx / l * 0.5 + 0.5) * 255; nd[i + 1] = (dy / l * 0.5 + 0.5) * 255; nd[i + 2] = (1 / l * 0.5 + 0.5) * 255; nd[i + 3] = 255;
    }
    ng.putImageData(ni, 0, 0);
    nrm = new THREE.CanvasTexture(nc);
    nrm.wrapS = nrm.wrapT = THREE.RepeatWrapping;
    nrm.anisotropy = 4;
  }
  return { map: tex, normalMap: nrm, canvas: cv };
}

// ---- concrete floor: one tile = two map squares (6.5 m), joint lines on the tile edges (so they meet the walls) --
export async function floorTexture(size = 512) {
  const r = rng(11), big = fbm([3, 6], r), mid = fbm([12, 24], r), fine = noise(128, r), grit = noise(256, r), blot = fbm([5, 9], r);
  const J = 3 / size;   // joint half-width
  return build(size, size, (u, v, c) => {
    let b = 0.86 + 0.16 * (big(u, v) - 0.5) + 0.14 * (mid(u, v) - 0.5) + 0.08 * (fine(u, v) - 0.5);
    const gr = grit(u, v); if (gr > 0.83) b -= 0.1 * (gr - 0.83) / 0.17; else if (gr < 0.08) b += 0.05;
    const oil = smooth(0.66, 0.8, blot(u, v)); b *= 1 - 0.18 * oil;   // old oil and water stains
    const e = Math.min(u, 1 - u, v, 1 - v);                        // joint on the tile edge: a groove with a lit lip
    let h = 0.6 + 0.2 * mid(u, v);
    if (e < J) { b *= 0.55; h = 0.1; } else if (e < J * 2) { b *= 1.06; h = 0.5; }
    c[0] = 146 * b; c[1] = 148 * b; c[2] = 143 * b;
    c[0] += 6 * oil; c[1] += 3 * oil;                               // stains slightly warm
    return h;
  });   // no bump map for the floor (arena.js)
}

// ---- inner walls: painted precast panels, 6.5 m wide (two joints) x 4.5 m tall ---------------------------------
// v = 0 is the top of the wall, v = 1 the ground (canvas rows run downwards).
export async function wallTexture(size = 512) {
  const r = rng(23), var1 = fbm([4, 8], r), var2 = fbm([16, 32], r), chip = fbm([24, 48, 96], r), dirt = fbm([6, 14, 30], r);
  const streakN = noise(64, r), streakW = noise(9, r), bolt = [0.12, 0.62, 0.88];
  const PAINT = [118, 130, 122], BARE = [136, 138, 132], RUST = [116, 72, 44], GRIME = [52, 48, 40];
  return build(size, size, (u, v, c) => {
    const yUp = 1 - v;                                   // 0 at the ground, 1 at the top
    let col = [...PAINT], b = 1 + 0.08 * (var1(u, v) - 0.5) + 0.06 * (var2(u, v) - 0.5), h = 0.7;
    const ch = chip(u, v);
    const bare = smooth(0.7, 0.74, ch);                    // small flakes of paint gone, bare concrete showing
    if (bare > 0) { col = col.map((p, i) => p + (BARE[i] - p) * bare * 0.8); h = 0.7 - 0.2 * bare; }
    // rust runs from the bolts near the top, wobbling and fading downwards
    let rust = 0;
    for (const bx of bolt) {
      const w = 0.006 + 0.012 * streakW(bx * 3, v * 0.5), d = Math.abs(u - bx - 0.004 * (streakN(bx, v) - 0.5));
      if (d < w && v > 0.07) rust = Math.max(rust, (1 - d / w) * (1 - v) * 0.55 * (0.6 + 0.4 * streakN(u * 4, v * 2)));
      const bd = Math.hypot((u - bx) * 1.44, v - 0.07); if (bd < 0.008) { col = [70, 60, 52]; h = 0.95; rust = 0; }   // bolt head
    }
    // grime splashed up from the ground, with a ragged top edge; weather staining under the top edge
    const top = 0.2 + 0.12 * dirt(u, v * 0.4);
    const grime = smooth(top, 0.02, yUp) * 0.75 + smooth(0.9, 1, yUp) * 0.25;
    for (let i = 0; i < 3; i++) col[i] = col[i] * b;
    for (let i = 0; i < 3; i++) col[i] += (RUST[i] - col[i]) * rust;
    for (let i = 0; i < 3; i++) col[i] += (GRIME[i] - col[i]) * grime;
    // panel joints every 3.25 m (u = 0 and 0.5)
    if (v < 0.035) { for (let i = 0; i < 3; i++) col[i] = col[i] * 0.62 + 18; h = 0.9; }   // darker coping along the top
    else if (v < 0.045) { for (let i = 0; i < 3; i++) col[i] *= 0.5; h = 0.3; }            // and its shadow line
    const j = Math.min(Math.abs(u), Math.abs(u - 0.5), Math.abs(1 - u));
    if (j < 0.004) { for (let i = 0; i < 3; i++) col[i] *= 0.45; h = 0.1; } else if (j < 0.008) { for (let i = 0; i < 3; i++) col[i] *= 1.08; h = 0.55; }
    c[0] = col[0]; c[1] = col[1]; c[2] = col[2];
    return h;
  }, { normal: 2.5 });
}

// ---- outer walls: corrugated steel sheet, weathered paint and rust, 6.5 m wide x 7 m tall ------------------------
export async function outerTexture(size = 512) {
  const r = rng(37), rustN = fbm([5, 11, 23], r), runs = noise(96, r), vary = fbm([7, 15], r);
  const PAINT = [84, 96, 94], RUST = [118, 64, 34], DARK = [60, 40, 28];
  return build(size, size, (u, v, c) => {
    const yUp = 1 - v, rib = 0.5 + 0.5 * Math.cos(u * Math.PI * 2 * 32);   // 32 ribs across 6.5 m
    let rust = smooth(0.58, 0.72, rustN(u, v) + 0.25 * smooth(0.35, 0, yUp)); // rust patches, heavier near the ground
    rust = Math.max(rust, smooth(0.8, 0.95, runs(u, v * 0.15)) * 0.8);       // long vertical rust runs
    const col = PAINT.map((p, i) => (p + (RUST[i] - p) * rust) * (0.9 + 0.2 * vary(u, v)));
    const low = smooth(0.12, 0, yUp) * 0.6;                                    // splash line at the bottom
    for (let i = 0; i < 3; i++) col[i] += (DARK[i] - col[i]) * low;
    let h = rib;
    const girt = Math.min(Math.abs(yUp - 0.32), Math.abs(yUp - 0.7));          // two rows of fixings
    if (girt < 0.006) { h = 0.2; for (let i = 0; i < 3; i++) col[i] *= 0.7; }
    const seam = Math.min(Math.abs(u), Math.abs(u - 0.5), Math.abs(1 - u));   // sheet overlaps every 3.25 m
    if (seam < 0.005) { for (let i = 0; i < 3; i++) col[i] *= 0.55; h = 0; }
    c[0] = col[0] * (0.92 + 0.12 * rib); c[1] = col[1] * (0.92 + 0.12 * rib); c[2] = col[2] * (0.92 + 0.12 * rib);
    return h;
  }, { normal: 1.6 });
}

// ---- hazard band: worn orange and black diagonal stripes, one tile = 1.3 m of wall ------------------------------
export async function stripeTexture() {
  const r = rng(51), wear = fbm([8, 16, 32], r), grit = noise(64, r);
  return (await build(256, 64, (u, v, c) => {
    const s = ((u * 4 + v) % 1 + 1) % 1 < 0.5;   // 4 stripe pairs per tile, 45 degrees (tile is 4:1)
    let col = s ? [222, 104, 30] : [30, 31, 30];
    const w = wear(u, v);
    if (w > 0.72) col = col.map(p => p * 0.55 + 60);   // scuffed
    const d = 0.85 + 0.25 * grit(u, v);
    c[0] = col[0] * d; c[1] = col[1] * d; c[2] = col[2] * d;
    return 0.5;
  })).map;
}

// ---- whole-yard shading map for the floor (used as its ambient-shade map) ------------------------------------------
// Dark along the foot of every wall (where little sky reaches), plus a few huge soft stains that break up the repeat
// of the 6.5 m floor tile. isWall(r, c) and the grid size come from world.js. 4 texels per metre.
export async function yardShade(rows, cols, cell, isWall) {
  const per = 4, W = Math.round(cols * cell * per), H = Math.round(rows * cell * per);
  const mask = new Float32Array(W * H);
  sliceStart = performance.now();
  for (let y = 0; y < H; y++) { if ((y & 15) === 0) await breathe(); for (let x = 0; x < W; x++) mask[y * W + x] = isWall(Math.floor(y / per / cell), Math.floor(x / per / cell)) ? 1 : 0; }
  // three box blurs = a soft falloff about 1.5 m wide
  const tmp = new Float32Array(W * H), R = 3;
  for (let pass = 0; pass < 3; pass++) {
    await breathe();
    for (let y = 0; y < H; y++) { if ((y & 31) === 0) await breathe(); let s = 0; for (let x = -R; x <= R; x++) s += mask[y * W + clamp(x, 0, W - 1)];
      for (let x = 0; x < W; x++) { tmp[y * W + x] = s / (2 * R + 1); s += mask[y * W + Math.min(W - 1, x + R + 1)] - mask[y * W + Math.max(0, x - R)]; } }
    for (let x = 0; x < W; x++) { if ((x & 31) === 0) await breathe(); let s = 0; for (let y = -R; y <= R; y++) s += tmp[clamp(y, 0, H - 1) * W + x];
      for (let y = 0; y < H; y++) { mask[y * W + x] = s / (2 * R + 1); s += tmp[Math.min(H - 1, y + R + 1) * W + x] - tmp[Math.max(0, y - R) * W + x]; } }
  }
  const r = rng(77), stains = fbm([3, 7, 13], r);
  const cv = document.createElement('canvas'); cv.width = W; cv.height = H;
  const g = cv.getContext('2d'), img = g.createImageData(W, H), px = img.data;
  sliceStart = performance.now();
  for (let i = 0; i < W * H; i++) {
    if (i % 4096 === 0) await breathe();
    const x = i % W, y = (i / W) | 0;
    const ao = 1 - 0.62 * Math.min(1, mask[i] * 1.6), st = 1 - 0.22 * smooth(0.52, 0.75, stains(x / W, y / H));
    const v = clamp(ao * st * 255, 0, 255);
    px[i * 4] = px[i * 4 + 1] = px[i * 4 + 2] = v; px[i * 4 + 3] = 255;
  }
  g.putImageData(img, 0, 0);
  const t = new THREE.CanvasTexture(cv);
  t.channel = 1;   // the floor's second set of texture coordinates: 0..1 across the whole yard
  return t;
}
