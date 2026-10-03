// Wall art everywhere: graffiti and fake movie posters on every wall face you can see from the floor.
// This file is the DATA and the PLACEMENT only (no drawing, no three.js): props.js draws it. Everything here is a fixed function of the map, the lamps and
// the fixed graffiti (eggs.js), with a seeded generator, so both phones always see the same walls. Nothing here is random on its own (the tests check the source for it).
// All text: parody titles and plain references only, no lyrics.
// Cosmetic only: nothing solid, nothing the sight rule, the hits, the map checker, the aim assist or the chicken's ledge reads.
import { ROWS, COLS, isWallCell, cellX, cellZ } from './world.js';
import { GRAFFITI, graffitiSpot, CHICKEN } from './eggs.js';

// ---- the text ---------------------------------------------------------------------------------------------------------
// The first 11 are the fixed lines (eggs.js GRAFFITI keeps their places). Then 49 more (NEW_GRAFFITI). Every 5th of those (from the 3rd) is chalk.
export const NEW_GRAFFITI = [
  'This is fine.', 'It is Wednesday, my dudes.', 'One does not simply walk in.', 'Stonks. Only up.', 'Press F to pay respects.', 'Touch grass. There is no grass.',
  'Skill issue.', 'Error 404: exit not found.', 'Much wall. Very paint. Wow.', 'Reply all was a mistake.', 'Left on read since 1812.', 'Free hugs. Terms apply.',
  'Looking at another wall.', 'Not all heroes wear capes. Some wear treads.', 'Keep calm and reload.', 'The floor is lava. Change my mind.', 'Task failed successfully.',
  'Mogambo was mildly pleased.', 'How many tanks were there? Two.', 'All is well. Probably.', 'Interval. Popcorn on the left.', 'Slow motion starts here.',
  'Gabbar wants his wall back.', 'Pushpa was here. Fire, not flower.', 'Jaadu ki jhappi: tank edition.', 'I will be back. Reload pending.', 'I am inevitable. So is Tuesday.',
  'These are not the walls you are looking for.', 'Houston, we have a wall.', 'Why so serious? It is a wall.', 'There is no spoon. There is no exit either.',
  'Yer a tank, Harry.', 'I see dead pixels.',
  'Swifties for peace. Bring snacks.', 'Karma is a tank.', 'Shake it off. The turret is stuck.', 'Midnights are long. So is round three.', 'Summertime sadness. Armoured edition.',
  'Born to die. Reload in 1.5 seconds.', 'ARMY assembled. Bring snacks.', 'Smooth like butter. This wall is not.', 'Dynamite is not a legal weapon.',
  'Sad song playing in the next lane.', 'Believe it. The wall does not care.', 'Nani?! It was only a wall.', 'This wall is in its final form.',
  'The map is not to scale. Neither is the war.', 'Lost property: one tourist.', 'Roman roads lead here. They should not.',
];
// The 60 lines in one list: index < GRAFFITI.length is a fixed line (eggs.js), the rest are the generated ones.
export const POOL = [...GRAFFITI.map(g => g.text), ...NEW_GRAFFITI];
export const isChalk = i => i >= GRAFFITI.length && (i - GRAFFITI.length) % 5 === 2;

// the posters: title, tagline, style (A cinema one-sheet, B painted, C minimal dark) and the artwork (drawn in props.js)
export const POSTERS = [
  { title: 'The Godfather-in-Law', tag: 'He made them an offer. They said they would think about it.', style: 'A', art: 'sunhills' },
  { title: 'Dilwale Dulhania Late Jayenge', tag: 'The train leaves. Eventually.', style: 'B', art: 'burstpair' },
  { title: 'Midnight Rain Check', tag: 'An album about rescheduling.', style: 'C', art: 'moonblinds' },
  { title: 'Kitne Tank The?', tag: 'A film about counting.', style: 'B', art: 'bursttanks' },
  { title: 'Avengers: Afternoon Nap', tag: 'Earth\'s mightiest heroes. Back at four.', style: 'A', art: 'moonmug' },
  { title: 'Jurassic Parking', tag: 'Life finds a space. Eventually.', style: 'A', art: 'footprint' },
  { title: 'Interstellar Traffic', tag: 'Time is relative. So is the queue.', style: 'C', art: 'planet' },
  { title: 'R.R.R.', tag: 'Roar. Rest. Repeat.', style: 'B', art: 'threebars' },
  { title: 'Lana Del Rey-Bans', tag: 'An album recorded entirely in sunglasses.', style: 'C', art: 'shades' },
  { title: 'Butter: The Movie', tag: 'Smooth. Allegedly.', style: 'B', art: 'butter' },
  { title: 'Your Name Tag', tag: 'A film about a lost lanyard.', style: 'A', art: 'nametag' },
  { title: 'The Dark Knight Shift', tag: 'Some heroes work nights. Overtime is unpaid.', style: 'C', art: 'skyline' },
  { title: 'Tenet: Please Rewind', tag: 'Rewind the tape. Then the film.', style: 'C', art: 'hourglass' },
  { title: 'This Is Fine: The Movie', tag: 'Sit down. Have a coffee. Ignore the flames.', style: 'A', art: 'flamemug' },
];

// ---- how big a line of graffiti is -----------------------------------------------------------------------------------------
// Every line lives in a 4:1 cell (256 x 64 at High). Text longer than 17 characters breaks into two lines as evenly as the words allow. The letters are drawn
// about 0.3 m tall where the room allows; `ink` is the width of the writing in metres at that size (Plex Mono letters are 0.62 of their size wide).
export function graffitiLines(text) {
  if (text.length <= 17) return [text];
  const words = text.split(' '); let best = 1e9, out = [text];
  for (let k = 1; k < words.length; k++) { const a = words.slice(0, k).join(' '), b = words.slice(k).join(' '), d = Math.abs(a.length - b.length); if (d < best) { best = d; out = [a, b]; } }
  return out;
}
export const CELL_W = 256, CELL_H = 64;
export function graffitiSize(text) {
  const lines = graffitiLines(text), longest = Math.max(...lines.map(l => l.length));
  const px = Math.min(0.3 * CELL_H, (0.9 * CELL_W) / (longest * 0.62));   // the letter size in the cell
  const w = Math.min(5.2, (0.3 * CELL_W) / px);                           // the quad's width in metres, so the letters come out about 0.3 m
  return { lines, px, w, h: w / 4, ink: longest * 0.62 * px / CELL_W * w };
}
export const POSTER = { w: 2.2, h: 3.19, y: 2.35, cw: 160, ch: 232 };   // metres on the wall and pixels in the atlas (High)
export const GRAFFITI_Y = 2.1;

// ---- the faces ----------------------------------------------------------------------------------------------------------------
// A face is a straight run of wall squares with open floor along the same side. side is the side of the wall block that looks at floor (as in eggs.js graffiti).
// u0..u1 is the run along the wall in metres (x for N and S faces, z for W and E faces); `at` is the plane (z for N and S, x for W and E); (nx, nz) looks out of the wall.
export function wallFaces() {
  const faces = [], open = (r, c) => isWallCell(r, c);
  const push = (side, line, start, len) => {
    const N = side === 'N', S = side === 'S', W = side === 'W';
    if (N || S) faces.push({ side, line, start, len, u0: cellX(start), u1: cellX(start + len), at: N ? cellZ(line) : cellZ(line + 1), nx: 0, nz: N ? -1 : 1 });
    else faces.push({ side, line, start, len, u0: cellZ(start), u1: cellZ(start + len), at: W ? cellX(line) : cellX(line + 1), nx: W ? -1 : 1, nz: 0 });
  };
  for (const [side, dr] of [['N', -1], ['S', 1]]) for (let r = 0; r < ROWS; r++) for (let c = 0; c < COLS;) {
    if (isWallCell(r, c) && !open(r + dr, c)) { const s = c; while (c < COLS && isWallCell(r, c) && !open(r + dr, c)) c++; push(side, r, s, c - s); } else c++;
  }
  for (const [side, dc] of [['W', -1], ['E', 1]]) for (let c = 0; c < COLS; c++) for (let r = 0; r < ROWS;) {
    if (isWallCell(r, c) && !open(r, c + dc)) { const s = r; while (r < ROWS && isWallCell(r, c) && !open(r, c + dc)) r++; push(side, c, s, r - s); } else r++;
  }
  return faces.filter(f => f.len > 0 && !outsideFace(f));
}
// a face of the map's frame looking OUT of the arena (there is none: a frame wall has floor on one side only), kept for safety
const outsideFace = f => ((f.side === 'N' && f.line === 0) || (f.side === 'S' && f.line === ROWS - 1) || (f.side === 'W' && f.line === 0) || (f.side === 'E' && f.line === COLS - 1));

// ---- placement ----------------------------------------------------------------------------------------------------------------
const END = 0.45;      // m kept clear at each end of a face (corners)
const LAMP = 1.0;      // m kept clear on each side of a lamp (its housing and glow)
const GAP = 0.3;       // m between two pieces on the same face
const NEAR = { graffiti: 30, poster: 45 };   // the same line or poster is not repeated within this many metres if it can be helped
const POSTER_SHARE = 0.25;                   // about one face in four carries a poster

function rng(seed) {
  let a = seed >>> 0;
  return () => { a = (a + 0x6d2b79f5) >>> 0; let t = a; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
}
const shuffled = (n, rand) => { const a = Array.from({ length: n }, (_, i) => i); for (let i = n - 1; i > 0; i--) { const j = Math.floor(rand() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; } return a; };

// lamps: placeLamps() from lamps.js ({ x, z, ox, oz } on the wall face, looking out). Returns { pieces, faces, empty }.
// piece: { kind: 'graffiti' | 'poster', item (index into POOL or POSTERS), x, z, nx, nz, w, h, y, ink, face (index) }
// The layout is a fixed function of the lamps, worked out once (lamps.js needs it for the extra lamps, props.js draws it): the last answer is kept.
let lastKey = '', lastLayout = null;
export function layoutWallArt(lamps) {
  const key = lamps.map(l => `${l.x},${l.z},${l.ox},${l.oz}`).join(';');
  if (key === lastKey) return lastLayout;
  lastKey = key;
  return (lastLayout = layoutFor(lamps));
}
function layoutFor(lamps) {
  const faces = wallFaces(), rand = rng(20261001), pieces = [], empty = [];
  const choc = { x: cellX(CHICKEN.c + 1), z0: cellZ(CHICKEN.r), z1: cellZ(CHICKEN.r + 1) };   // the chicken's face: the east side of its block, kept clear
  // the fixed graffiti first: their places never move
  GRAFFITI.forEach((g, i) => {
    const s = graffitiSpot(g), fi = faces.findIndex(f => f.nx === s.nx && f.nz === s.nz && Math.abs((f.nx ? s.x - f.at : s.z - f.at)) < 0.01 && (f.nx ? s.z : s.x) > f.u0 && (f.nx ? s.z : s.x) < f.u1);
    pieces.push({ kind: 'graffiti', item: i, x: s.x, z: s.z, nx: s.nx, nz: s.nz, w: 5.2, h: 1.3, y: GRAFFITI_Y, ink: graffitiSize(g.text).ink * 5.2 / graffitiSize(g.text).w, face: fi, fixed: true });
  });
  const along = (f, p) => (f.nx ? p.z : p.x);   // where a piece (or lamp) sits along a face
  const recent = { graffiti: new Map(), poster: new Map() };   // item -> places it was put
  const bagG = shuffled(NEW_GRAFFITI.length, rand), bagP = shuffled(POSTERS.length, rand);
  let gi = 0, pi = 0, acc = rand();
  const farEnough = (kind, item, x, z, d) => (recent[kind].get(item) || []).every(p => Math.hypot(p[0] - x, p[1] - z) >= d);
  faces.forEach((f, fi) => {
    const L = f.u1 - f.u0;
    // what is already in the way along this face: [from, to] in metres along it
    const block = [];
    for (const p of pieces) if (p.face === fi) block.push([along(f, p) - p.ink / 2 - GAP, along(f, p) + p.ink / 2 + GAP]);
    for (const l of lamps) if (l.ox === f.nx && l.oz === f.nz && Math.abs((f.nx ? l.x : l.z) - f.at) < 0.05) block.push([along(f, l) - LAMP, along(f, l) + LAMP]);
    if (f.nx === 1 && Math.abs(f.at - choc.x) < 0.01) block.push([choc.z0 - 0.3, choc.z1 + 0.3]);
    const lo = f.u0 + END, hi = f.u1 - END;
    // how many pieces: 1 on short faces, 2 on the middling ones, a few more on the very long
    const want = L < 7 ? 1 : L < 30 ? 2 : Math.min(5, Math.round(L / 12));
    acc += POSTER_SHARE + (rand() - 0.5) * 0.3;
    const poster = acc >= 1; if (poster) acc -= 1;
    const free = (a, b) => a >= lo - 1e-9 && b <= hi + 1e-9 && block.every(([x, y]) => b <= x || a >= y);
    const kinds = Array.from({ length: want }, (_, k) => (poster && k === 0 ? 'poster' : 'graffiti'));
    let placed = 0;
    kinds.forEach((kind, k) => {
      // the k-th of `want` equal slots along the face; the piece goes as near the middle of its slot as the room allows
      const slotC = f.u0 + L * (k + 0.5) / want;
      const tries = kind === 'poster' ? POSTERS.length : NEW_GRAFFITI.length;
      for (const relax of [1, 0.5, 0]) {
        for (let t = 0; t < tries; t++) {
          const item = kind === 'poster' ? bagP[(pi + t) % POSTERS.length] : bagG[(gi + t) % NEW_GRAFFITI.length];
          const z = kind === 'poster' ? { w: POSTER.w, h: POSTER.h, ink: POSTER.w, y: POSTER.y } : (() => { const s = graffitiSize(NEW_GRAFFITI[item]); return { w: s.w, h: s.h, ink: s.ink, y: GRAFFITI_Y }; })();
          for (const shrink of kind === 'poster' ? [1] : [1, 0.85, 0.7]) {
            const ink = z.ink * shrink, half = ink / 2;
            // slide from the slot's middle outwards in 0.25 m steps, both ways
            for (let off = 0; off <= L / 2; off += 0.25) for (const sgn of off === 0 ? [1] : [1, -1]) {
              const c = slotC + sgn * off;
              if (!free(c - half, c + half)) continue;
              const px = f.nx ? f.at + f.nx * 0.03 : c, pz = f.nx ? c : f.at + f.nz * 0.03;
              if (!farEnough(kind, item, px, pz, NEAR[kind] * relax)) continue;
              pieces.push({ kind, item: kind === 'poster' ? item : GRAFFITI.length + item, x: px - f.nx * 0.03, z: pz - f.nz * 0.03, nx: f.nx, nz: f.nz, w: z.w * shrink, h: z.h * shrink, y: z.y, ink, face: fi });
              block.push([c - half - GAP, c + half + GAP]);
              (recent[kind].get(item) || recent[kind].set(item, []).get(item)).push([px, pz]);
              if (kind === 'poster') pi = (pi + t + 1) % POSTERS.length; else gi = (gi + t + 1) % NEW_GRAFFITI.length;
              placed++;
              return;
            }
          }
        }
      }
    });
    if (!pieces.some(p => p.face === fi)) empty.push(fi);
  });
  return { pieces, faces, empty };
}
