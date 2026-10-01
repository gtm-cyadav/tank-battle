// The tank: its look (plain boxes until the Blender model has loaded, models.js), its driving physics, the fade on
// the hunter's screen, and the leader's bobblehead wobbling on the turret (Stage 2B).
import * as THREE from '../lib/three.module.js';
import { pushOutOfWalls } from './world.js';

export const TANK_RADIUS = 2.0;   // collision circle; the narrowest lanes are 6.5 m wide
export const COLORS = { hunter: 0xff7a1a, hider: 0x2f7bff };
// Stage 2B: the models' paint is a little muted and grimy (the vertex colours darken it further towards the ground)
const PAINT = { [COLORS.hunter]: 0xd8671f, [COLORS.hider]: 0x3a6fd0 };
const WRECK = 0x2b2e2c;

export const DRIVE = {
  forward: 9,       // m/s
  reverse: 4.5,
  turn: 2.0,        // rad/s
  accel: 14,        // how quickly speed changes, m/s per second
};

export function makeTank(color) {
  const g = new THREE.Group();
  // every material this tank uses (the fade and the smog switch go through all of them)
  const paint = new THREE.MeshStandardMaterial({ color: PAINT[color] ?? color, roughness: 0.72, metalness: 0.25, vertexColors: true });
  const dark = new THREE.MeshStandardMaterial({ color: 0x6a6c68, roughness: 0.85, metalness: 0.4, vertexColors: true });
  const fig = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.62, metalness: 0, vertexColors: true });
  const figMetal = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.35, metalness: 0.75, vertexColors: true });
  const add = (geo, mat, x, y, z) => {
    const m = new THREE.Mesh(geo, mat);
    m.position.set(x, y, z);
    // Stage 2A: sun shadows are drawn once per weather (arena.js), so a moving tank can't throw one (it would stay
    // behind at the spot where it was drawn). The soft contact shadow below does that job; tanks still receive shadows.
    m.castShadow = false;
    m.receiveShadow = true;
    g.add(m);
    return m;
  };
  // plain boxes until the model has loaded (they share the materials, so white vertex colours are added)
  const white = geo => { geo.setAttribute('color', new THREE.Float32BufferAttribute(new Array(geo.attributes.position.count * 3).fill(1), 3)); return geo; };
  const boxes = [
    add(white(new THREE.BoxGeometry(2.2, 0.8, 3.6)), paint, 0, 0.85, 0),           // hull
    add(white(new THREE.BoxGeometry(0.55, 0.85, 3.9)), dark, -1.25, 0.45, 0),      // tracks
    add(white(new THREE.BoxGeometry(0.55, 0.85, 3.9)), dark, 1.25, 0.45, 0),
    add(white(new THREE.BoxGeometry(1.5, 0.6, 1.7)), paint, 0, 1.55, -0.2),        // turret
  ];
  const barrel = add(white(new THREE.CylinderGeometry(0.11, 0.13, 2.4, 10).rotateX(Math.PI / 2)), dark, 0, 1.55, 1.6);
  boxes.push(barrel);

  const blob = new THREE.Mesh(                                             // soft contact shadow
    new THREE.CircleGeometry(2.3, 24),
    new THREE.MeshBasicMaterial({ color: 0x000000, transparent: true, opacity: 0.35, depthWrite: false }),
  );
  blob.rotation.x = -Math.PI / 2;
  blob.position.y = 0.02;
  g.add(blob);

  g.userData = { speed: 0, paint, dark, fig, figMetal, mats: [paint, dark, fig, figMetal], blob, barrel, barrelZ: 1.6, recoil: 0,
    boxes, figure: [], head: null, leader: 0, model: false, changed: true, fade: 1, ghosts: [],
    bob: { vx: 0, vz: 0, px: NaN, pz: NaN, yaw: 0, rx: 0, rz: 0, wx: 0, wz: 0, t: Math.random() * 10, wreck: false } };
  return g;
}

// Firing kicks the barrel back, then it slides home: a clear sign on your own screen that a shot went off.
export function kick(tank) { tank.userData.recoil = 1; nudge(tank, -1.2, 0); }
export function settleBarrel(tank, dt) {
  const u = tank.userData;
  if (u.recoil <= 0) return;
  u.recoil = Math.max(0, u.recoil - dt / 0.3);
  u.barrel.position.z = u.barrelZ - 0.45 * u.recoil * u.recoil;
}

// Paint the tank in a role's colour. wrecked: the hider was hit (charred grey, sagging to one side, figure scorched).
export function paintTank(tank, color, wrecked = false) {
  const u = tank.userData;
  u.paint.color.setHex(wrecked ? WRECK : PAINT[color] ?? color);
  u.paint.roughness = wrecked ? 0.95 : 0.72;
  u.wrecked = wrecked;
  u.clothMat?.color.setHex(wrecked ? 0x4a4744 : 0xffffff);
  u.fig.color.setHex(wrecked ? 0x4a4744 : 0xffffff);
  u.figMetal.color.setHex(wrecked ? 0x4a4744 : 0xffffff);
  tank.rotation.z = wrecked ? 0.06 : 0;   // a slight lean along its length
  if (wrecked && !u.bob.wreck) shakeHead(tank, 1);
  u.bob.wreck = wrecked;
}

// Stage 4A (the chicken): the hunter's tank wears gold trim for the rest of the round. Only the steel parts (tracks, barrel, hatches,
// the flag mast) turn gold, so the orange role paint stays as readable as ever. Plain matte colour, nothing glowing.
// The hider has its own version (the chicken, 2026-10-01): silver trim when its tank drove up to the chicken.
const STEEL = 0x6a6c68, GOLD = 0xffd45a, SILVER = 0xe4eaee;
export function setTrim(tank, kind) {   // kind: 'gold' | 'silver' | null
  const u = tank.userData;
  if ((u.trim || null) === (kind || null)) return;
  u.trim = kind || null;
  u.dark.color.setHex(kind === 'gold' ? GOLD : kind === 'silver' ? SILVER : STEEL);
  u.dark.metalness = kind ? 0.2 : 0.4;
  u.dark.roughness = kind === 'gold' ? 0.38 : kind === 'silver' ? 0.3 : 0.85;
}

// ---- fading on the hunter's screen (Stage 1e, all parts since 2B) ---------------------------------------------
// The tank turns see-through as one solid shape: a depth-only copy of each part is drawn first (after the walls), so
// only the tank's front surface shows, never its inner parts (figure, props, turret) through each other.
const DEPTH_ONLY = new THREE.MeshBasicMaterial({ colorWrite: false });
function refreshGhosts(tank) {
  const u = tank.userData;
  for (const g of u.ghosts) g.parent?.remove(g);
  u.ghosts = [];
  const meshes = [];
  tank.traverse(o => { if (o.isMesh && o !== u.blob && !o.userData.ghost && !o.userData.noGhost) meshes.push(o); });
  for (const o of meshes) {
    const g = new THREE.Mesh(o.geometry, DEPTH_ONLY);
    g.userData.ghost = true;
    g.renderOrder = 1; g.visible = u.fade < 1;
    g.castShadow = g.receiveShadow = false;
    o.add(g);
    u.ghosts.push(g);
  }
  u.changed = false;
}
export function setFade(tank, f) {
  const u = tank.userData, see = f < 1;
  u.fade = f;
  if (u.changed) refreshGhosts(tank);
  for (const m of u.mats) { m.opacity = f; if (m.transparent !== see) { m.transparent = see; m.needsUpdate = true; } }
  for (const g of u.ghosts) g.visible = see;
  u.blob.material.opacity = 0.35 * f;
}
// smog on: this tank fades into the smog like the rest of the world (off: the hunter's tank on the hider's screen)
export function setFog(tank, on) {
  const u = tank.userData;
  for (const m of [...u.mats, u.blob.material]) if (m.fog !== on) { m.fog = on; m.needsUpdate = true; }
}

// ---- the bobblehead: wobbles when driving, a big shake when hit, a tiny bob at rest ---------------------------
// The head sits on a spring at the neck. It leans against the tank's acceleration (back when speeding up, forward
// when braking, outwards in a turn), the tracks' rumble jiggles it while moving, and it slowly bobs when parked.
const K = 70, DAMP = 5.5, LEAN = 0.028, MAX = 0.42;
export function nudge(tank, fwd, side) { const b = tank.userData.bob; b.wx += fwd; b.wz += side; }
export function shakeHead(tank, amount) {
  const b = tank.userData.bob, a = Math.random() * Math.PI * 2;
  b.wx += Math.cos(a) * 9 * amount; b.wz += Math.sin(a) * 9 * amount;
  b.shake = Math.max(b.shake || 0, amount);
}
export function bobble(tank, dt) {
  const u = tank.userData, b = u.bob;
  if (!u.head || dt <= 0) return;
  const p = tank.position, yaw = tank.rotation.y;
  // velocity from how the tank moved (works the same for the other player's tank, which is moved by messages)
  if (!Number.isFinite(b.px) || Math.hypot(p.x - b.px, p.z - b.pz) > 3) { b.px = p.x; b.pz = p.z; b.vx = b.vz = 0; b.yaw = yaw; }
  const vx = (p.x - b.px) / dt, vz = (p.z - b.pz) / dt, k = 1 - Math.exp(-dt / 0.08);
  const ax = (vx - b.vx) / 0.08 * k, az = (vz - b.vz) / 0.08 * k;   // smoothed acceleration
  b.vx += (vx - b.vx) * k; b.vz += (vz - b.vz) * k;
  b.px = p.x; b.pz = p.z; b.yaw = yaw;
  const s = Math.sin(yaw), c = Math.cos(yaw);
  const aFwd = ax * s + az * c, aSide = ax * c - az * s;   // in the tank's frame (side: towards the tank's +x)
  const speed = Math.hypot(b.vx, b.vz);
  const tx = Math.max(-MAX, Math.min(MAX, -aFwd * LEAN)), tz = Math.max(-MAX, Math.min(MAX, aSide * LEAN));
  // the spring, stepped in small pieces so a slow frame can't make it fly off
  const n = Math.ceil(dt / (1 / 120)), h = dt / n;
  const damp = b.shake > 0 ? DAMP * 0.45 : DAMP;
  for (let i = 0; i < n; i++) {
    if (speed > 1) { b.wx += (Math.random() - 0.5) * speed * 0.9 * h * 10; b.wz += (Math.random() - 0.5) * speed * 0.6 * h * 10; }
    b.wx += (-K * (b.rx - tx) - damp * b.wx) * h; b.wz += (-K * (b.rz - tz) - damp * b.wz) * h;
    b.rx += b.wx * h; b.rz += b.wz * h;
  }
  b.rx = Math.max(-MAX, Math.min(MAX, b.rx)); b.rz = Math.max(-MAX, Math.min(MAX, b.rz));
  if (b.shake > 0) b.shake = Math.max(0, b.shake - dt / 2);
  b.t += dt;
  const idle = Math.max(0, 1 - speed / 2);
  const droop = b.wreck ? 0.22 : 0;   // a wreck's head hangs forward a little
  const f = u.flip ?? 1;   // the lean is worked out along the tank; the figure may stand turned round in the hatch
  u.head.rotation.set(f * b.rx + droop + idle * 0.02 * Math.sin(b.t * 1.7), idle * 0.05 * Math.sin(b.t * 0.6), f * b.rz + idle * 0.015 * Math.sin(b.t * 1.3));
  u.head.position.y = u.headRest.y + idle * 0.008 * Math.sin(b.t * 2.2);
  if (u.float) {   // props floating over the turret drift up and down
    u.float.position.y = u.floatRest.y + 0.05 * Math.sin(b.t * 1.6);
    u.float.rotation.y = 0.3 * Math.sin(b.t * 0.5);
  }
}

// The flag's cloth waves along its length, more the faster the tank goes (flag.js / models.js FLAG): it moves in the
// tank's front-to-back direction by at most FLAG.amp, so it stays inside the tank's outline. t: seconds.
export function waveFlag(tank, t, dt) {
  const u = tank.userData, c = u.cloth;
  if (!c) return;
  const pos = c.geometry.attributes.position, base = u.clothBase, W = u.clothW, amp = (0.05 + 0.07 * Math.min(1, Math.abs(u.speed) / 9)) * W;   // the wave scales with the cloth
  for (let i = 0; i < pos.count; i++) {
    const x = base[i * 3], y = base[i * 3 + 1], k = x / W;
    pos.setZ(i, amp * k * (Math.sin(x * 10 - t * 7 + y * 3.5) * 0.75 + Math.sin(x * 18 - t * 11) * 0.25));
    pos.setY(i, y - 0.035 * k * k);
  }
  pos.needsUpdate = true;
  c.geometry.computeVertexNormals();
}

// Forward is +z when yaw is 0. throttle and turn are -1..1 (turn +1 = right). boost: sprint multiplier (hider).
export function driveTank(tank, input, dt) {
  const s = tank.userData;
  const target = input.throttle >= 0 ? input.throttle * DRIVE.forward * (input.boost || 1) : input.throttle * DRIVE.reverse;
  const step = DRIVE.accel * dt;
  s.speed += Math.max(-step, Math.min(step, target - s.speed));
  tank.rotation.y -= input.turn * DRIVE.turn * dt;   // right always swings the nose right, even reversing

  const p = tank.position, before = { x: p.x, z: p.z };
  p.x += Math.sin(tank.rotation.y) * s.speed * dt;
  p.z += Math.cos(tank.rotation.y) * s.speed * dt;
  if (pushOutOfWalls(p, TANK_RADIUS)) {
    // lose speed in proportion to how much the wall blocked us, so sliding along walls still works
    const moved = Math.hypot(p.x - before.x, p.z - before.z), wanted = Math.abs(s.speed * dt);
    if (wanted > 1e-6) s.speed *= Math.min(1, moved / wanted);
  }
}

// Tanks are solid and can't shove each other (Chetan's choice, Stage 1c). Each phone only ever moves its own
// tank, and only undoes its own tank's move into the other one: if the other tank drives into yours, it's the
// other phone that stops it, so a laggy link can never push your tank around.
// before = where `tank` was at the start of this frame. Slides round the other tank rather than sticking.
// If both players drive into each other at the same moment, each phone saw the other a split second late and
// they end up slightly inside each other; then each phone eases its own tank back by half, so they settle touching.
export function blockByTank(tank, other, before, dt) {
  const p = tank.position, o = other.position, min = TANK_RADIUS * 2;
  const d = Math.hypot(p.x - o.x, p.z - o.z), d0 = Math.hypot(before.x - o.x, before.z - o.z);
  const limit = Math.min(min, d0);   // no closer than touching, or than we already were
  if (d >= limit - 1e-6) return settle(tank, other, dt);
  const nx = d > 1e-6 ? (p.x - o.x) / d : -Math.sin(tank.rotation.y), nz = d > 1e-6 ? (p.z - o.z) / d : -Math.cos(tank.rotation.y);
  p.x = o.x + nx * limit;
  p.z = o.z + nz * limit;
  pushOutOfWalls(p, TANK_RADIUS);
  if (Math.hypot(p.x - o.x, p.z - o.z) < limit - 0.01) {   // wedged between the other tank and a wall: don't move
    p.x = before.x; p.z = before.z;
    tank.userData.speed = 0;
    return true;
  }
  // driving into the other tank loses speed, glancing off it keeps most of it
  const s = tank.userData, into = -(Math.sin(tank.rotation.y) * nx + Math.cos(tank.rotation.y) * nz) * Math.sign(s.speed);
  if (into > 0) s.speed *= 1 - into;
  settle(tank, other, dt);
  return true;
}
function settle(tank, other, dt) {
  const p = tank.position, o = other.position, min = TANK_RADIUS * 2, d = Math.hypot(p.x - o.x, p.z - o.z);
  if (d >= min - 0.01 || d < 1e-6) return false;
  const out = Math.min((min - d) / 2, 1.5 * dt);   // half the overlap, at walking pace
  p.x += (p.x - o.x) / d * out;
  p.z += (p.z - o.z) / d * out;
  pushOutOfWalls(p, TANK_RADIUS);
  return true;
}
