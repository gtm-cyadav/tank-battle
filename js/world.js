// Grid helpers: turn the ASCII map into world positions, walls, collisions and sight lines.
// World axes: x = left/right across the 156 m, z = up/down the 104 m, y = height. Map centre is (0, 0).
import { CELL, MAP } from './map.js';

export const ROWS = MAP.length;
export const COLS = MAP[0].length;
export const WIDTH = COLS * CELL;   // 156 m
export const DEPTH = ROWS * CELL;   // 104 m
export const WALL_H = 4.5;          // inner walls, taller than the camera
export const EDGE_H = 7;            // outer wall

export const isWallCell = (r, c) => r < 0 || c < 0 || r >= ROWS || c >= COLS || MAP[r][c] === '#';
export const cellX = c => (c - COLS / 2) * CELL;   // left edge of column c
export const cellZ = r => (r - ROWS / 2) * CELL;   // top edge of row r
export const toCol = x => Math.floor(x / CELL + COLS / 2);
export const toRow = z => Math.floor(z / CELL + ROWS / 2);
export const isWallAt = (x, z) => isWallCell(toRow(z), toCol(x));

// Spawn spots: in the left-most alley of opposite corners, a few metres in, facing along the alley.
export const SPAWNS = [
  { x: cellX(2), z: cellZ(5), yaw: 0 },                // top-left, facing down the map (+z)
  { x: cellX(COLS - 2), z: cellZ(ROWS - 5), yaw: Math.PI },
];

// Merge wall squares into as few boxes as possible (rows of runs, then stack equal runs).
export function wallBoxes() {
  const edge = (r, c) => r === 0 || c === 0 || r === ROWS - 1 || c === COLS - 1;
  const boxes = [];
  for (const outer of [true, false]) {
    const open = new Map();   // "c0,c1" -> box being grown downwards
    for (let r = 0; r <= ROWS; r++) {
      const runs = [];
      for (let c = 0; r < ROWS && c < COLS; c++) {
        if (MAP[r][c] !== '#' || edge(r, c) !== outer) continue;
        const c0 = c;
        while (c + 1 < COLS && MAP[r][c + 1] === '#' && edge(r, c + 1) === outer) c++;
        runs.push(c0 + ',' + c);
      }
      for (const [key, box] of open) if (!runs.includes(key)) { boxes.push(box); open.delete(key); }
      for (const key of runs) {
        if (open.has(key)) open.get(key).r1 = r;
        else { const [c0, c1] = key.split(',').map(Number); open.set(key, { r0: r, r1: r, c0, c1, outer }); }
      }
    }
  }
  return boxes.map(b => ({
    x: (cellX(b.c0) + cellX(b.c1 + 1)) / 2, z: (cellZ(b.r0) + cellZ(b.r1 + 1)) / 2,
    w: (b.c1 - b.c0 + 1) * CELL, d: (b.r1 - b.r0 + 1) * CELL, h: b.outer ? EDGE_H : WALL_H,
  }));
}

const PAD = 12;   // security Stage 2: cells beyond the grid that pushOutOfWalls still looks at (see there)
// Push a circle (x, z, radius) out of any wall squares. Returns true if it touched a wall.
export function pushOutOfWalls(p, radius) {
  // security Stage 2: a position that is not a finite number (or is absurdly far out) must never decide how long the loops below run.
  // The cells are limited to the grid plus a 12-cell border (outside the grid counts as wall anyway), which changes nothing for any position a tank can really have.
  if (!Number.isFinite(p.x) || !Number.isFinite(p.z) || !Number.isFinite(radius)) return false;
  let hit = false;
  for (let pass = 0; pass < 3; pass++) {
    let moved = false;
    const r0 = Math.max(-PAD, toRow(p.z - radius)), r1 = Math.min(ROWS + PAD, toRow(p.z + radius));
    const c0 = Math.max(-PAD, toCol(p.x - radius)), c1 = Math.min(COLS + PAD, toCol(p.x + radius));
    for (let r = r0; r <= r1; r++) for (let c = c0; c <= c1; c++) {
      if (!isWallCell(r, c)) continue;
      const x0 = cellX(c), x1 = cellX(c + 1), z0 = cellZ(r), z1 = cellZ(r + 1);
      const nx = Math.max(x0, Math.min(p.x, x1)), nz = Math.max(z0, Math.min(p.z, z1));
      const dx = p.x - nx, dz = p.z - nz, d = Math.hypot(dx, dz);
      if (d >= radius) continue;
      if (d > 1e-6) {
        const push = (radius - d) / d;
        p.x += dx * push; p.z += dz * push;
      } else {
        // centre is on or inside the wall square: leave through the nearest face that opens onto floor
        const faces = [
          [p.x - x0, () => { p.x = x0 - radius; }, !isWallCell(r, c - 1)],
          [x1 - p.x, () => { p.x = x1 + radius; }, !isWallCell(r, c + 1)],
          [p.z - z0, () => { p.z = z0 - radius; }, !isWallCell(r - 1, c)],
          [z1 - p.z, () => { p.z = z1 + radius; }, !isWallCell(r + 1, c)],
        ].filter(f => f[2]).sort((a, b) => a[0] - b[0]);
        if (faces.length) faces[0][1]();
      }
      hit = moved = true;
    }
    if (!moved) break;
  }
  return hit;
}

// Walk along the grid from (x0, z0) towards (x1, z1). Returns the distance to the first wall,
// or the full distance if the line is clear. Used by the camera now; bullets and sight lines later.
export function rayToWall(x0, z0, x1, z1) {
  if (!Number.isFinite(x0) || !Number.isFinite(z0) || !Number.isFinite(x1) || !Number.isFinite(z1)) return 0;   // security Stage 2: no maths on NaN / Infinity
  const dx = x1 - x0, dz = z1 - z0, len = Math.hypot(dx, dz);
  if (len < 1e-6) return 0;
  const ux = dx / len, uz = dz / len;
  let c = toCol(x0), r = toRow(z0);
  if (isWallCell(r, c)) return 0;
  const stepC = ux > 0 ? 1 : -1, stepR = uz > 0 ? 1 : -1;
  const tDeltaX = ux !== 0 ? Math.abs(CELL / ux) : Infinity;
  const tDeltaZ = uz !== 0 ? Math.abs(CELL / uz) : Infinity;
  let tMaxX = ux !== 0 ? ((ux > 0 ? cellX(c + 1) : cellX(c)) - x0) / ux : Infinity;
  let tMaxZ = uz !== 0 ? ((uz > 0 ? cellZ(r + 1) : cellZ(r)) - z0) / uz : Infinity;
  // (the yard is walled in, so a ray from inside it meets a wall within ROWS + COLS steps; the cap only matters for a start point far outside it)
  for (let step = 0, max = 2 * (ROWS + COLS) + 16; step < max; step++) {
    let t;
    if (tMaxX < tMaxZ) { t = tMaxX; tMaxX += tDeltaX; c += stepC; }
    else { t = tMaxZ; tMaxZ += tDeltaZ; r += stepR; }
    if (t >= len) return len;
    if (isWallCell(r, c)) return t;
  }
  return len;
}
