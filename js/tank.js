// A plain placeholder tank (hull, tracks, turret, barrel) and its driving physics.
// The real Blender-modelled tank replaces the look in Stage 2; the driving stays.
import * as THREE from '../lib/three.module.js';
import { pushOutOfWalls } from './world.js';

export const TANK_RADIUS = 2.0;   // collision circle; lanes are 5 m wide
export const COLORS = { hunter: 0xff7a1a, hider: 0x2f7bff };

const DRIVE = {
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
    m.castShadow = m.receiveShadow = true;
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

  g.userData = { speed: 0 };
  return g;
}

// Forward is +z when yaw is 0. throttle and turn are -1..1 (turn +1 = right).
export function driveTank(tank, input, dt) {
  const s = tank.userData;
  const target = input.throttle >= 0 ? input.throttle * DRIVE.forward : input.throttle * DRIVE.reverse;
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

// Keep two tanks from driving through each other.
export function separateTanks(a, b) {
  const dx = b.position.x - a.position.x, dz = b.position.z - a.position.z;
  const d = Math.hypot(dx, dz), min = TANK_RADIUS * 2;
  if (d >= min || d < 1e-6) return false;
  const push = (min - d) / 2 / d;
  a.position.x -= dx * push; a.position.z -= dz * push;
  b.position.x += dx * push; b.position.z += dz * push;
  pushOutOfWalls(a.position, TANK_RADIUS);
  pushOutOfWalls(b.position, TANK_RADIUS);
  return true;
}
