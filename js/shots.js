// Bullets (Stage 1d): the hunter's shots fly straight at 40 m/s from the barrel, stop at the first wall, and can
// only ever hit the hider's tank (never the tank that fired them).
// Each bullet's path is worked out from the centre of the hunter's tank, so a barrel poking into a wall can't
// shoot through it, and a hider parked right against the barrel is still hit. Walls never move, so the distance
// to the wall is found once, when the bullet is fired.
import * as THREE from '../lib/three.module.js';
import { rayToWall } from './world.js';
import { RULES } from './rules.js';

const MUZZLE = 2.8;              // barrel tip, m in front of the tank's centre
const HEIGHT = 1.55;             // barrel height
const RADIUS = 0.16;             // bullet
const HALF = { x: 1.525, z: 1.95 };   // the tank's outline seen from above (hull and tracks), half width and length
const LIFE = 5;                  // s; the arena is walled in, so every bullet meets a wall well before this

// Does the stretch from a to b (x, z) touch the tank's outline, grown by the bullet's size?
// Returns how far along (0 to 1) it first touches, or -1.
export function touchesTank(tank, ax, az, bx, bz) {
  const p = tank.position, c = Math.cos(tank.rotation.y), s = Math.sin(tank.rotation.y);
  const local = (x, z) => { const dx = x - p.x, dz = z - p.z; return [dx * c - dz * s, dx * s + dz * c]; };   // into the tank's own frame
  const [x0, z0] = local(ax, az), [x1, z1] = local(bx, bz);
  const hx = HALF.x + RADIUS, hz = HALF.z + RADIUS;
  let t0 = 0, t1 = 1;
  for (const [o, d, h] of [[x0, x1 - x0, hx], [z0, z1 - z0, hz]]) {
    if (Math.abs(d) < 1e-9) { if (Math.abs(o) > h) return -1; continue; }
    let ta = (-h - o) / d, tb = (h - o) / d;
    if (ta > tb) [ta, tb] = [tb, ta];
    t0 = Math.max(t0, ta); t1 = Math.min(t1, tb);
    if (t0 > t1) return -1;
  }
  return t0;
}

export function createShots(scene) {
  const live = [];
  const tracer = new THREE.BoxGeometry(RADIUS * 1.1, RADIUS * 1.1, 0.9);
  const hot = new THREE.MeshBasicMaterial({ color: 0xffe9b0 });
  const puffGeo = new THREE.SphereGeometry(1, 12, 8);
  const puffs = [];

  function puff(x, y, z, size, color, time) {
    const m = new THREE.Mesh(puffGeo, new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.9, depthWrite: false }));
    m.position.set(x, y, z);
    m.scale.setScalar(size * 0.3);
    m.userData = { age: 0, time, size };
    scene.add(m);
    puffs.push(m);
  }

  // shot: { id, x, z, yaw } where and which way the hunter's tank was when it fired.
  // ahead: seconds the shot has already been flying (it was fired on the other phone a moment ago).
  function fire(shot, ahead = 0) {
    const dx = Math.sin(shot.yaw), dz = Math.cos(shot.yaw), far = 200;
    const wall = rayToWall(shot.x, shot.z, shot.x + dx * far, shot.z + dz * far);
    const mesh = new THREE.Mesh(tracer, hot);
    mesh.rotation.y = shot.yaw;
    mesh.visible = false;
    scene.add(mesh);
    const b = { ...shot, dx, dz, wall, s: 0, extra: Math.max(0, ahead) * RULES.bulletSpeed, age: 0, mesh };
    live.push(b);
    if (ahead < 0.2 && wall > MUZZLE) puff(shot.x + dx * MUZZLE, HEIGHT, shot.z + dz * MUZZLE, 0.45, 0xffd28a, 0.08);   // muzzle flash
    return b;
  }

  // Move every bullet on. target: the hider's tank (or null if it can't be hit right now).
  // Returns the bullet that hit it, if one did.
  function update(dt, target) {
    let hit = null;
    for (let i = live.length - 1; i >= 0; i--) {
      const b = live[i];
      const from = b.s, to = Math.min(b.s + RULES.bulletSpeed * dt + b.extra, b.wall);
      b.extra = 0; b.age += dt;
      const ax = b.x + b.dx * from, az = b.z + b.dz * from, bx = b.x + b.dx * to, bz = b.z + b.dz * to;
      const f = target && !hit ? touchesTank(target, ax, az, bx, bz) : -1;
      if (f >= 0) {
        const at = from + (to - from) * f;
        puff(b.x + b.dx * at, HEIGHT, b.z + b.dz * at, 1.1, 0xfff1d0, 0.25);
        hit = b; remove(i); continue;
      }
      b.s = to;
      if (b.s >= b.wall - 1e-6 || b.age > LIFE) {   // reached the wall
        if (b.wall > MUZZLE * 0.5) puff(b.x + b.dx * b.wall, HEIGHT, b.z + b.dz * b.wall, 0.5, 0xd9d2c0, 0.15);
        remove(i); continue;
      }
      const shown = Math.max(b.s, MUZZLE);
      b.mesh.position.set(b.x + b.dx * shown, HEIGHT, b.z + b.dz * shown);
      b.mesh.visible = shown < b.wall;
    }
    for (let i = puffs.length - 1; i >= 0; i--) {
      const m = puffs[i], u = m.userData;
      u.age += dt;
      const k = u.age / u.time;
      if (k >= 1) { scene.remove(m); m.material.dispose(); puffs.splice(i, 1); continue; }
      m.scale.setScalar(u.size * (0.3 + 0.7 * k));
      m.material.opacity = 0.9 * (1 - k);
    }
    return hit;
  }
  function remove(i) { scene.remove(live[i].mesh); live.splice(i, 1); }
  function clear() { while (live.length) remove(live.length - 1); }

  return { fire, update, clear, get live() { return live; } };
}

