// Limited view (Stage 1e, brief section 3 "Vision"): the smog, who can see whom, and the hider's tank fading out at
// the edge of the hunter's view.
// - The smog is measured flat along the ground from your own tank (not from the camera), so "25 m" means 25 m from
//   the hunter in every direction, straight ahead or at the edge of the screen.
// - The hunter sees the hider only with a clear line and within VIEW.range. The hider's phone decides this (it knows
//   exactly where it is, and the hunter's phone sends where the hunter and its camera are), and only then sends its
//   position, so a hidden hider's position never reaches the hunter's phone.
// - The hider always sees the hunter: on the hider's phone the hunter's tank never fades in the smog (walls still block it).
import * as THREE from '../lib/three.module.js';
import { rayToWall, isWallCell, isWallAt, cellX, cellZ, ROWS, COLS } from './world.js';

export const VIEW = {
  range: 25,     // m from the hunter's tank: the hider is gone beyond this
  fadeFrom: 18,  // m: the hider starts to fade out here
  margin: 6,     // m: the hider's phone sends its position up to range + margin, so a closing hunter sees it fade in, not pop in
  hold: 0.4,     // s: keeps sending this long after the line is lost, so a tank sliding behind a corner doesn't flicker
};

// Smog looks (colour, where it starts and where it is total). The sky's horizon takes the smog colour, so far walls melt into it.
// The smog starts right at your tank and thickens gradually, so the ground fades into it instead of ending at a ledge.
export const SMOGS = {
  grey: { color: 0xa9b1b4, top: 0xbfc6ca, near: 0, far: 34, max: 1 },
  greyfar: { color: 0xa9b1b4, top: 0xbfc6ca, near: 0, far: 70, max: 0.92 },
  dust: { color: 0xa39b8b, top: 0xb8b3a8, near: 0, far: 34, max: 1 },
  dark: { color: 0x737b77, top: 0x959c99, near: 0, far: 30, max: 1 },
  none: { color: 0xa9b1b4, top: 0xbfc6ca, near: 28, far: 125, max: 1 },   // the 1d light haze, for comparison
};

// ---- the smog: three.js fog, but measured flat from a centre point -------------------------------------------
const center = { value: new THREE.Vector2() };
const strength = { value: 1 };
THREE.ShaderChunk.fog_pars_vertex = '#ifdef USE_FOG\n\tvarying float vFogDepth;\n\tvarying vec2 vFogXZ;\n#endif';
// world position from the view position: the camera's rotation undone, plus the camera's place
THREE.ShaderChunk.fog_vertex = '#ifdef USE_FOG\n\tvFogDepth = - mvPosition.z;\n\tvFogXZ = ( cameraPosition + transpose( mat3( viewMatrix ) ) * mvPosition.xyz ).xz;\n#endif';
THREE.ShaderChunk.fog_pars_fragment = '#ifdef USE_FOG\n\tuniform vec3 fogColor;\n\tuniform float fogNear;\n\tuniform float fogFar;\n\tuniform vec2 smogCenter;\n\tuniform float smogMax;\n\tvarying float vFogDepth;\n\tvarying vec2 vFogXZ;\n#endif';
THREE.ShaderChunk.fog_fragment = '#ifdef USE_FOG\n\tfloat fogFactor = smogMax * smoothstep( fogNear, fogFar, length( vFogXZ - smogCenter ) );\n\tgl_FragColor.rgb = mix( gl_FragColor.rgb, fogColor, fogFactor );\n#endif';
// every material gets the two extra smog settings (shared, so moving the centre moves it everywhere)
THREE.Material.prototype.onBeforeCompile = function (shader) { shader.uniforms.smogCenter = center; shader.uniforms.smogMax = strength; };

// sky: the arena's sky material (its horizon follows the smog colour)
export function setSmog(scene, name, sky) {
  const s = SMOGS[name] || SMOGS.grey;
  scene.fog = new THREE.Fog(s.color, s.near, s.far);
  scene.background = new THREE.Color(s.color);
  strength.value = s.max;
  if (sky) { sky.uniforms.horizon.value.setHex(s.color); sky.uniforms.top.value.setHex(s.top); }
}
export const smogAt = (x, z) => center.value.set(x, z);

// ---- who can see whom ------------------------------------------------------------------------------------------
// The walls are tall boxes and the camera stays under their tops, so "can the hunter see it" is a question on the flat
// map: is there a clear straight line from where the hunter looks to any part of the hider's tank outline?
// Answered exactly, not by trying a handful of points (a first version did, and missed the tank through thin slits
// between two wall corners): if any part is visible, then some visible line either ends at a corner of the outline
// or just grazes a wall corner. So those are the only lines worth trying.

// The hider's tank outline seen from above: hull and tracks 3.05 m wide, from 1.95 m behind the centre to the barrel
// tip 2.8 m in front (the barrel pokes out past the hull, and can show round a corner on its own), grown by half a
// metre for safety.
const HALF_X = 1.525 + 0.5, HALF_Z = (1.95 + 2.8) / 2 + 0.5, MID_Z = (2.8 - 1.95) / 2;   // MID_Z: outline centre ahead of the tank's
// Every point on the map where walls have a corner (worked out once; walls never move).
const CORNERS = [];
for (let i = 0; i <= ROWS; i++) for (let j = 0; j <= COLS; j++) {
  const a = isWallCell(i - 1, j - 1), b = isWallCell(i - 1, j), c = isWallCell(i, j - 1), d = isWallCell(i, j), n = a + b + c + d;
  if (n === 1 || n === 3 || (n === 2 && a === d)) CORNERS.push([cellX(j), cellZ(i)]);
}
// How far along the line from (ex, ez) in direction (dx, dz) it first enters the outline, or -1 if it misses it.
function enters(t, ex, ez, dx, dz) {
  const ox = ex - t.x, oz = ez - t.z;
  const lx = ox * t.c - oz * t.s, lz = ox * t.s + oz * t.c - MID_Z, ux = dx * t.c - dz * t.s, uz = dx * t.s + dz * t.c;   // into the tank's own frame
  let t0 = 0, t1 = Infinity;
  for (const [o, u, h] of [[lx, ux, HALF_X], [lz, uz, HALF_Z]]) {
    if (Math.abs(u) < 1e-12) { if (Math.abs(o) > h) return -1; continue; }
    let a = (-h - o) / u, b = (h - o) / u;
    if (a > b) [a, b] = [b, a];
    t0 = Math.max(t0, a); t1 = Math.min(t1, b);
    if (t0 > t1) return -1;
  }
  return t0;
}
// Does the line from the eye at angle `ang` reach the outline before any wall?
function reaches(t, ex, ez, ang) {
  const dx = Math.cos(ang), dz = Math.sin(ang), at = enters(t, ex, ez, dx, dz);
  return at >= 0 && (at < 1e-6 || rayToWall(ex, ez, ex + dx * (at + 1e-3), ez + dz * (at + 1e-3)) >= at - 1e-4);
}
// Is any part of the outline visible from this eye?
function seenFrom(t, ex, ez) {
  if (isWallAt(ex, ez)) return false;   // a guessed spot inside a wall sees nothing (and must not see through it)
  const base = Math.atan2(t.z - ez, t.x - ex), rel = a => Math.atan2(Math.sin(a - base), Math.cos(a - base));
  let lo = 0, hi = 0, far = 0;
  for (const [cx, cz] of t.corners) {   // the outline's angular span from here (it never wraps: the eye is outside it)
    const r = rel(Math.atan2(cz - ez, cx - ex));
    lo = Math.min(lo, r); hi = Math.max(hi, r); far = Math.max(far, Math.hypot(cx - ex, cz - ez));
    if (reaches(t, ex, ez, base + r * 0.999)) return true;   // towards the corner, a hair inside the outline
  }
  if (reaches(t, ex, ez, base)) return true;
  for (const [wx, wz] of CORNERS) {   // lines just either side of each wall corner inside that span
    const d = Math.hypot(wx - ex, wz - ez);
    if (d > far || d < 1e-6) continue;
    const r = rel(Math.atan2(wz - ez, wx - ex));
    if (r < lo || r > hi) continue;
    if (reaches(t, ex, ez, base + r - 1e-4) || reaches(t, ex, ez, base + r + 1e-4)) return true;
  }
  return false;
}
// Where the hunter looks from: its tank and its camera (which sits behind the tank and can see round a corner the
// tank hasn't reached), plus where both may have got to since the hunter's last message (up to 3 m further on, and a
// little to each side), so a hider coming into view shows at once instead of a moment late.
function eyes(h) {
  const fx = Math.sin(h.yaw), fz = Math.cos(h.yaw), E = [];
  const add = (x, z) => { for (const a of [0, 1.5, 3]) E.push([x + fx * a, z + fz * a]); };
  add(h.x, h.z);
  E.push([h.x + fz * 1.2, h.z - fx * 1.2], [h.x - fz * 1.2, h.z + fx * 1.2]);
  if (Number.isFinite(h.cx) && Number.isFinite(h.cz)) add(h.cx, h.cz);
  return E;
}

// hunter: { x, z, yaw, cx, cz } (cx, cz = its camera), hider: { x, z, yaw }.
// True if the hunter may be able to see any part of the hider: a clear line and within range + margin.
export function inSight(hunter, hider, reach = VIEW.range + VIEW.margin) {
  if (Math.hypot(hider.x - hunter.x, hider.z - hunter.z) > reach) return false;
  const c = Math.cos(hider.yaw), s = Math.sin(hider.yaw);
  const corners = [[-1, -1], [1, -1], [1, 1], [-1, 1]].map(([u, v]) => { const lx = u * HALF_X, lz = v * HALF_Z + MID_Z; return [hider.x + lx * c + lz * s, hider.z - lx * s + lz * c]; });
  const t = { x: hider.x, z: hider.z, c, s, corners };
  for (const [ex, ez] of eyes(hunter)) if (seenFrom(t, ex, ez)) return true;
  return false;
}

// How solid the hider's tank looks on the hunter's screen at this distance from the hunter's tank: 1 up close, 0 at range.
export function fade(dist) {
  if (dist <= VIEW.fadeFrom) return 1;
  if (dist >= VIEW.range) return 0;
  const k = (dist - VIEW.fadeFrom) / (VIEW.range - VIEW.fadeFrom);
  return 1 - k * k * (3 - 2 * k);
}
