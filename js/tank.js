// A plain placeholder tank (hull, tracks, turret, barrel) and its driving physics.
// The real Blender-modelled tank replaces the look in Stage 2; the driving stays.
import * as THREE from '../lib/three.module.js';
import { pushOutOfWalls } from './world.js';

export const TANK_RADIUS = 2.0;   // collision circle; the narrowest lanes are 6.5 m wide
export const COLORS = { hunter: 0xff7a1a, hider: 0x2f7bff };

export const DRIVE = {
  forward: 9,       // m/s
  reverse: 4.5,
  turn: 2.0,        // rad/s
  accel: 14,        // how quickly speed changes, m/s per second
};

export function makeTank(color) {
  const g = new THREE.Group();
  const paint = new THREE.MeshStandardMaterial({ color, roughness: 0.55, metalness: 0.35 });
  const dark = new THREE.MeshStandardMaterial({ color: 0x1c1f1e, roughness: 0.9 });
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

  add(new THREE.BoxGeometry(2.2, 0.8, 3.6), paint, 0, 0.85, 0);           // hull
  add(new THREE.BoxGeometry(0.55, 0.85, 3.9), dark, -1.25, 0.45, 0);      // tracks
  add(new THREE.BoxGeometry(0.55, 0.85, 3.9), dark, 1.25, 0.45, 0);
  add(new THREE.BoxGeometry(1.5, 0.6, 1.7), paint, 0, 1.55, -0.2);        // turret
  const barrel = add(new THREE.CylinderGeometry(0.11, 0.13, 2.4, 10), dark, 0, 1.55, 1.6);
  barrel.rotation.x = Math.PI / 2;

  const blob = new THREE.Mesh(                                             // soft contact shadow
    new THREE.CircleGeometry(2.3, 24),
    new THREE.MeshBasicMaterial({ color: 0x000000, transparent: true, opacity: 0.35, depthWrite: false }),
  );
  blob.rotation.x = -Math.PI / 2;
  blob.position.y = 0.02;
  g.add(blob);

  g.userData = { speed: 0, paint, dark, blob, barrel, recoil: 0 };
  return g;
}

// Firing kicks the barrel back, then it slides home: a clear sign on your own screen that a shot went off.
export function kick(tank) { tank.userData.recoil = 1; }
export function settleBarrel(tank, dt) {
  const u = tank.userData;
  if (u.recoil <= 0) return;
  u.recoil = Math.max(0, u.recoil - dt / 0.3);
  u.barrel.position.z = 1.6 - 0.45 * u.recoil * u.recoil;
}

// Paint the tank in a role's colour. wrecked: the hider was hit (charred grey, sagging to one side).
export function paintTank(tank, color, wrecked = false) {
  tank.userData.paint.color.setHex(wrecked ? 0x2b2e2c : color);
  tank.userData.paint.roughness = wrecked ? 0.95 : 0.55;
  tank.rotation.z = wrecked ? 0.06 : 0;   // a slight lean along its length
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
