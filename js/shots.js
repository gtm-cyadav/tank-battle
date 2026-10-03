// Bullets: the hunter's shots fly straight at 40 m/s from the barrel, stop at the first wall, and can
// only ever hit the hider's tank (never the tank that fired them).
// Each bullet's path is worked out from the centre of the hunter's tank, so a barrel poking into a wall can't
// shoot through it, and a hider parked right against the barrel is still hit. Walls never move, so the distance
// to the wall is found once, when the bullet is fired.
import * as THREE from '../lib/three.module.js';
import { rayToWall, isWallAt, WIDTH, DEPTH } from './world.js';
import { RULES } from './rules.js';

const MUZZLE = 2.8;              // barrel tip, m in front of the tank's centre
const HEIGHT = 1.55;             // barrel height
const RADIUS = 0.16;             // bullet
const HALF = { x: 1.525, z: 1.95 };   // the tank's outline seen from above (hull and tracks), half width and length
const FAR = Math.hypot(WIDTH, DEPTH);            // corner to corner: no shot can fly further than this
const LIFE = FAR / RULES.bulletSpeed + 1;        // s; the arena is walled in, so every bullet meets a wall before this

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

// fx (effects.js + sound.js): { muzzle(x, y, z, dx, dz), wallHit(x, y, z, nx, nz) } for the flash, smoke,
// sparks and sounds.
export function createShots(scene, fx = { muzzle() {}, wallHit() {} }) {
  const live = [];
  // what a bullet looks like: a long bright streak with an orange glow at its head, so it reads against a grey sky
  // (a small pale box is too hard to see on a phone)
  const streak = new THREE.BoxGeometry(0.16, 0.16, 2.4).translate(0, 0, -1.2);   // head at the bullet, tail behind it
  const hot = new THREE.MeshBasicMaterial({ color: 0xfff0b8 });
  const glowTex = (() => {
    const c = document.createElement('canvas'); c.width = c.height = 64;
    const g = c.getContext('2d'), r = g.createRadialGradient(32, 32, 0, 32, 32, 32);
    r.addColorStop(0, 'rgba(255,236,170,1)'); r.addColorStop(0.35, 'rgba(255,150,40,0.85)'); r.addColorStop(1, 'rgba(255,120,20,0)');
    g.fillStyle = r; g.fillRect(0, 0, 64, 64);
    return new THREE.CanvasTexture(c);
  })();
  // the glow keeps the same size on screen however far the bullet flies (about a twentieth of the screen height)
  const glowMat = new THREE.SpriteMaterial({ map: glowTex, depthWrite: false, sizeAttenuation: false });

  // shot: { id, x, z, yaw } where and which way the hunter's tank was when it fired.
  // ahead: seconds the shot has already been flying (it was fired on the other phone a moment ago).
  function fire(shot, ahead = 0) {
    const dx = Math.sin(shot.yaw), dz = Math.cos(shot.yaw);
    const wall = rayToWall(shot.x, shot.z, shot.x + dx * FAR, shot.z + dz * FAR);
    const mesh = new THREE.Group();
    mesh.add(new THREE.Mesh(streak, hot));
    const glow = new THREE.Sprite(glowMat);
    glow.scale.setScalar(0.055);
    mesh.add(glow);
    mesh.rotation.y = shot.yaw;
    mesh.visible = false;
    scene.add(mesh);
    const b = { ...shot, dx, dz, wall, s: 0, extra: Math.max(0, ahead) * RULES.bulletSpeed, age: 0, mesh };
    live.push(b);
    if (ahead < 0.2 && wall > MUZZLE) fx.muzzle(shot.x + dx * MUZZLE, HEIGHT, shot.z + dz * MUZZLE, dx, dz);   // flash and smoke
    return b;
  }

  // Move every bullet on. target: the hider's tank (or null if it can't be hit right now).
  // quiet: the target can't be seen here (practice hunter shooting into the smog): no flash where it's hit.
  // Returns the bullet that hit it, if one did.
  function update(dt, target, quiet = false) {
    let hit = null;
    for (let i = live.length - 1; i >= 0; i--) {
      const b = live[i];
      const from = b.s, to = Math.min(b.s + RULES.bulletSpeed * dt + b.extra, b.wall);
      b.extra = 0; b.age += dt;
      const ax = b.x + b.dx * from, az = b.z + b.dz * from, bx = b.x + b.dx * to, bz = b.z + b.dz * to;
      const f = target && !hit ? touchesTank(target, ax, az, bx, bz) : -1;
      if (f >= 0) {
        const at = from + (to - from) * f;
        if (!quiet) b.at = { x: b.x + b.dx * at, z: b.z + b.dz * at };   // where it struck (the explosion goes here)
        hit = b; remove(i); continue;
      }
      b.s = to;
      if (b.s >= b.wall - 1e-6 || b.age > LIFE) {   // reached the wall
        const wx = b.x + b.dx * (b.wall - 0.2), wz = b.z + b.dz * (b.wall - 0.2);   // just in front of the wall face
        // which face it struck: the wall is across x if a small step along x from here lands in it
        const sx = Math.sign(b.dx), sz = Math.sign(b.dz), acrossX = sx && isWallAt(wx + sx * 0.4, wz) && !isWallAt(wx, wz + sz * 0.4);
        fx.wallHit(wx, HEIGHT, wz, acrossX ? -sx : 0, acrossX ? 0 : -sz || -sx);
        remove(i); continue;
      }
      const shown = Math.max(b.s, MUZZLE);
      b.mesh.position.set(b.x + b.dx * shown, HEIGHT, b.z + b.dz * shown);
      b.mesh.visible = shown < b.wall;
    }
    return hit;
  }
  function remove(i) { scene.remove(live[i].mesh); live.splice(i, 1); }
  function clear() { while (live.length) remove(live.length - 1); }

  return { fire, update, clear, get live() { return live; } };
}

