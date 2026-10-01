// Stage 4A (Chetan, 2026-10-01): the in-match easter eggs, as plain functions of the match both phones already share.
// Nothing here draws anything (props.js does) and nothing here is random on its own: every "random" thing comes from a
// seeded generator fed with the match number and round, so the two phones always work out the same answer.
//   - the secret chicken on top of one wall block (shooting that block makes it cluck and turns the hunter's trim gold),
//   - the lost tourist (route, timing and "Sorry!" when a shot passes near),
//   - the wall graffiti (where each line goes),
//   - the badges on the result card.
// The referee phone (the room creator's) alone decides what has happened (rules.js); the other phone only reads it.
import { CELL } from './map.js';
import { cellX, cellZ, rayToWall, toRow, toCol, WALL_H } from './world.js';

// ---- the chicken ----------------------------------------------------------------------------------------------------
// One end block of the wall at the mouth of the plaza (row 9, column 18). It stands on top of it, 4.5 m up. A bullet that
// stops against that block (any of its faces) is "a shot at the chicken": bullets fly at barrel height, the chicken is above.
export const CHICKEN = { r: 9, c: 18 };
export const HONK_RANGE = 6;   // m: a hider's tank this close to the chicken makes it cluck (Chetan, 2026-10-01: the hider's way to meet the egg)
export const chickenSpot = () => ({ x: cellX(CHICKEN.c) + CELL / 2, z: cellZ(CHICKEN.r) + CELL / 2, y: WALL_H });

// ---- a small seeded generator (mulberry32), so both phones draw the same "random" numbers ----------------------------
export function seeded(mid, round, salt = 0) {
  let a = (Math.imul(mid | 0, 73856093) ^ Math.imul(round | 0, 19349663) ^ Math.imul(salt | 0, 83492791) ^ 0x9e3779b9) >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// ---- the lost tourist -----------------------------------------------------------------------------------------------
// He walks along the foot of one wall in a long lane, 1.2 m from it, stops twice for a photo, and is gone at the end of
// the lane. Chetan chose a lane floor (2026-10-01) over the wall tops: tanks drive straight through him (nothing is
// solid), so he can never block a lane, and nothing about the sight rule, the hits or the map checker knows he exists.
// Lanes are cells of the map: H = along a row (side N: the wall is above, S: below), V = along a column (W / E).
export const ROUTES = [
  { k: 'H', side: 'N', r: 1, a: 10, b: 17 },   // along the top edge
  { k: 'H', side: 'S', r: 5, a: 15, b: 21 },
  { k: 'V', side: 'W', c: 10, a: 10, b: 21 },
  { k: 'V', side: 'E', c: 37, a: 10, b: 21 },
  { k: 'H', side: 'N', r: 26, a: 15, b: 21 },
  { k: 'H', side: 'S', r: 30, a: 10, b: 17 },
  { k: 'V', side: 'E', c: 46, a: 10, b: 21 },
  { k: 'V', side: 'W', c: 1, a: 10, b: 21 },
];
export const TOURIST = {
  chance: 0.75,    // share of rounds he turns up in
  earliest: 25,    // s into the round (clock) he may first appear
  latest: 110,     // and the last moment
  speed: 1.3,      // m/s
  stop: 2.5,       // s of each of his two photo stops
  gap: 1.2,        // m from the wall
  near: 3.0,       // m: a bullet passing this close makes him say sorry
  fade: 0.5,       // s he takes to pop in and out at the ends of his walk
};
// the two end points of a route in the world [x0, z0, x1, z1]
export function routeLine(i) {
  const R = ROUTES[i], g = TOURIST.gap, end = 0.9;
  if (R.k === 'H') {
    const z = R.side === 'N' ? cellZ(R.r) + g : cellZ(R.r + 1) - g;
    return [cellX(R.a) + end, z, cellX(R.b + 1) - end, z];
  }
  const x = R.side === 'W' ? cellX(R.c) + g : cellX(R.c + 1) - g;
  return [x, cellZ(R.a) + end, x, cellZ(R.b + 1) - end];
}
// His plan for this round, or null if he stays away: which lane, which way, when he sets off.
export function touristPlan(mid, round) {
  const rand = seeded(mid, round, 1);
  const come = rand(), start = rand(), route = Math.floor(rand() * ROUTES.length), flip = rand() < 0.5;
  if (come >= TOURIST.chance) return null;
  let [x0, z0, x1, z1] = routeLine(route);
  if (flip) [x0, z0, x1, z1] = [x1, z1, x0, z0];
  const len = Math.hypot(x1 - x0, z1 - z0), T = TOURIST;
  return { route, x0, z0, x1, z1, len, t0: T.earliest + start * (T.latest - T.earliest), dur: len / T.speed + 2 * T.stop };
}
const PLANS = new Map();
function plan(mid, round) {
  const key = mid * 100 + round;
  if (!PLANS.has(key)) { if (PLANS.size > 40) PLANS.clear(); PLANS.set(key, touristPlan(mid, round)); }
  return PLANS.get(key);
}
// Where he is `t` seconds into the round: null (not there), or { x, z, yaw, d (m walked), photo (0..1 through a stop, or -1),
// scale (0..1, popping in and out) }.
export function touristAt(mid, round, t) {
  const p = plan(mid, round);
  if (!p) return null;
  let u = t - p.t0;
  if (u < 0 || u > p.dur) return null;
  const T = TOURIST, stops = [0.35 * p.len, 0.7 * p.len];
  let d = 0, photo = -1;
  for (let i = 0; i <= stops.length; i++) {
    const end = i < stops.length ? stops[i] : p.len, walk = (end - d) / T.speed;
    if (u < walk) { d += u * T.speed; u = -1; break; }
    u -= walk; d = end;
    if (i === stops.length) break;
    if (u < T.stop) { photo = u / T.stop; u = -1; break; }
    u -= T.stop;
  }
  const k = Math.min(1, d / p.len), x = p.x0 + (p.x1 - p.x0) * k, z = p.z0 + (p.z1 - p.z0) * k;
  const left = p.dur - (t - p.t0), scale = Math.max(0, Math.min(1, Math.min(t - p.t0, left) / T.fade));
  return { x, z, yaw: Math.atan2(p.x1 - p.x0, p.z1 - p.z0), d, photo, scale };
}

// ---- a shot, seen by the referee ------------------------------------------------------------------------------------
// shot: { x, z, yaw } where the hunter's tank was when it fired, e: seconds into the round it fired, speed: the bullet's
// m/s. Returns { arrive: seconds into the round the bullet reaches its wall, chicken: true if that wall is the chicken's
// block, sorry: seconds into the round it passes the tourist (or null) }.
export function shotEffects(shot, e, mid, round, speed) {
  const dx = Math.sin(shot.yaw), dz = Math.cos(shot.yaw), FAR = 400;
  const wall = rayToWall(shot.x, shot.z, shot.x + dx * FAR, shot.z + dz * FAR);
  const ex = shot.x + dx * (wall + 0.05), ez = shot.z + dz * (wall + 0.05);
  const chicken = toRow(ez) === CHICKEN.r && toCol(ex) === CHICKEN.c;
  let sorry = null;
  if (plan(mid, round)) {
    for (let s = 0; s <= wall && sorry === null; s += 0.5) {
      const at = e + s / speed, p = touristAt(mid, round, at);
      if (p && p.scale > 0.3 && Math.hypot(shot.x + dx * s - p.x, shot.z + dz * s - p.z) < TOURIST.near) sorry = at;
    }
  }
  return { arrive: e + wall / speed, chicken, sorry };
}

// ---- badges (shown on the result card, both phones read the same list the referee wrote) -----------------------------
// how: 'hit' | 'time'; left: seconds on the clock when it ended; seen: the hider's phone said at some moment that the hunter
// may have seen it; lastShot: seconds into the round the hunter's last shot left the gun (-1 = none).
//   speedrun        a hit less than 20 s of hunting time (after the head start) into the round
//   ghost           the hider survived and was never seen
//   cinematic       the hider survived and the hunter's last shot left the gun with 1 s or less on the clock
export function badgesOf(how, left, seen, lastShot, rules) {
  const out = [];
  if (how === 'hit') {
    if (rules.round - left - rules.headStart < rules.speedrun) out.push('speedrun');
  } else if (how === 'time') {
    if (!seen) out.push('ghost');
    if (lastShot >= rules.round - 1 && lastShot < rules.round + 0.5) out.push('cinematic');
  }
  return out;
}
export const BADGE_NAMES = { speedrun: 'Speedrun', cinematic: 'Cinematic escape', ghost: 'Ghost' };

// ---- the wall graffiti ----------------------------------------------------------------------------------------------
// The first three lines are Chetan's; the rest were approved with the Stage 4A texts (see the brief, section 16).
// Each placement: which wall face (N / S / W / E = the side of the wall block that faces floor), the first cell of that
// run of wall, and how many cells along the run the centre of the writing sits. The map test (tools/test_eggs.js) checks that every one
// stands on a real, exposed wall face at least 5.2 m long.
export const GRAFFITI = [
  { text: 'Nothing to see here', face: 'E', r: 9, c: 38, along: 4.5 },
  { text: 'The Ides of March was a Tuesday', face: 'W', r: 9, c: 9, along: 9.5 },
  { text: 'Winter is coming (again)', face: 'S', r: 3, c: 21, along: 3 },
  { text: 'Tea is at four. The war can wait.', face: 'N', r: 25, c: 16, along: 3 },
  { text: 'Birbal was here. He explained everything.', face: 'S', r: 25, c: 15, along: 3.5 },
  { text: 'Elephants: please do not feed.', face: 'N', r: 6, c: 26, along: 3.5 },
  { text: 'Mountain forts. Zero Wi-Fi.', face: 'W', r: 12, c: 3, along: 4 },
  { text: 'Wet paint. Possibly since 44 BC.', face: 'E', r: 12, c: 44, along: 4 },
  { text: 'Free carpet. Roll it yourself.', face: 'N', r: 28, c: 21, along: 3 },
  { text: 'Look up. No, higher.', face: 'S', r: 9, c: 16, along: 1.5 },
  { text: 'Tourists: the exit is not this way.', face: 'W', r: 10, c: 38, along: 8 },
];
export const GRAFFITI_SIZE = { w: 5.2, h: 1.3, y: 2.1 };   // m of wall one piece of writing covers (4:1)
// the centre of a piece of writing and which way its face looks: { x, z, nx, nz }
export function graffitiSpot(g) {
  const w = GRAFFITI_SIZE.w;
  if (g.face === 'N' || g.face === 'S') {
    const x = cellX(g.c) + g.along * CELL, z = g.face === 'N' ? cellZ(g.r) : cellZ(g.r + 1);
    return { x, z, nx: 0, nz: g.face === 'N' ? -1 : 1, w };
  }
  const z = cellZ(g.r) + g.along * CELL, x = g.face === 'W' ? cellX(g.c) : cellX(g.c + 1);
  return { x, z, nx: g.face === 'W' ? -1 : 1, nz: 0, w };
}
