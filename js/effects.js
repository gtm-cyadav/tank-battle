// Visual effects: muzzle flash and smoke, sparks and dust where a shot hits a wall, the explosion when the
// hider is hit (flash, fireball, sparks, a column of dark smoke that keeps rising off the wreck), dust behind moving
// tanks, a few big drifting banks of smoke round the player, and screen shake.
// Cheap on phones: every particle is a point sprite; all the glowing ones are one draw call, all the smoky ones another.
// Nothing here ever changes what either player is allowed to see: main.js only asks for dust behind the other tank while
// that tank is in view, and the shake turns the camera slightly without moving it (so it never peeks round a wall).
import * as THREE from '../lib/three.module.js';
import { smogU, SMOG_GLSL } from './vision.js';

function pool(max, additive, scaleU) {
  const pos = new Float32Array(max * 3), col = new Float32Array(max * 3), size = new Float32Array(max), alpha = new Float32Array(max);
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(pos, 3).setUsage(THREE.DynamicDrawUsage));
  geo.setAttribute('aCol', new THREE.BufferAttribute(col, 3).setUsage(THREE.DynamicDrawUsage));
  geo.setAttribute('aSize', new THREE.BufferAttribute(size, 1).setUsage(THREE.DynamicDrawUsage));
  geo.setAttribute('aAlpha', new THREE.BufferAttribute(alpha, 1).setUsage(THREE.DynamicDrawUsage));
  geo.setDrawRange(0, 0);
  const mat = new THREE.ShaderMaterial({
    uniforms: { ...smogU, uScale: scaleU },
    vertexShader: `
      ${SMOG_GLSL}
      attribute vec3 aCol; attribute float aSize, aAlpha;
      uniform float uScale;
      varying vec3 vCol; varying float vA, vFog, vSeed;
      void main() {
        vec4 mv = modelViewMatrix * vec4(position, 1.0);
        gl_PointSize = min(480.0, aSize * uScale / max(0.2, -mv.z));
        vCol = aCol; vA = aAlpha; vFog = smogAt(position);
        vSeed = (position.x + position.z) * 1.7;   // turns each puff's lumps a little as it drifts
        gl_Position = projectionMatrix * mv;
      }`,
    fragmentShader: additive ? `
      varying vec3 vCol; varying float vA, vFog;
      void main() {
        float r = length(gl_PointCoord - 0.5) * 2.0;
        float f = pow(max(0.0, 1.0 - r), 1.6);
        gl_FragColor = vec4(vCol * f * vA * (1.0 - vFog), 1.0);
      }` : `
      ${SMOG_GLSL}
      varying vec3 vCol; varying float vA, vFog, vSeed;
      void main() {
        vec2 p = gl_PointCoord - 0.5;
        float r = length(p) * 2.0;
        // a lumpy puff rather than a perfect disc
        float lump = 0.82 + 0.18 * sin(atan(p.y, p.x) * 5.0 + vSeed);
        float f = smoothstep(1.0, 0.25, r / lump);
        gl_FragColor = vec4(mix(vCol, fogColor, vFog), f * vA);
      }`,
    blending: additive ? THREE.AdditiveBlending : THREE.NormalBlending,
    transparent: true, depthWrite: false,
  });
  const points = new THREE.Points(geo, mat);
  points.frustumCulled = false;
  points.renderOrder = additive ? 5 : 4;
  // particle state, one slot each
  const P = Array.from({ length: max }, () => ({ live: false }));
  let next = 0;
  function add(o) {
    for (let k = 0; k < max; k++) {   // first free slot (or the oldest, when full)
      const i = (next + k) % max;
      if (!P[i].live || k === max - 1) { next = (i + 1) % max; Object.assign(P[i], { live: true, age: 0, drag: 0, grav: 0, fadeIn: 0.1 }, o); return; }
    }
  }
  // extras: sprites that just sit there this frame { x, y, z, s, a, c } (the drifting smoke banks)
  function update(dt, extras = []) {
    let n = 0;
    for (const e of extras) {
      if (n >= max || e.a <= 0.001) continue;
      pos[n * 3] = e.x; pos[n * 3 + 1] = e.y; pos[n * 3 + 2] = e.z;
      col[n * 3] = e.c[0]; col[n * 3 + 1] = e.c[1]; col[n * 3 + 2] = e.c[2];
      size[n] = e.s; alpha[n] = e.a; n++;
    }
    for (const p of P) {
      if (!p.live) continue;
      p.age += dt;
      const k = p.age / p.life;
      if (k >= 1 || n >= max) { p.live = k < 1; continue; }
      const d = Math.exp(-p.drag * dt);
      p.vx *= d; p.vz *= d; p.vy = p.vy * d - p.grav * dt;
      p.x += p.vx * dt; p.y += p.vy * dt; p.z += p.vz * dt;
      if (p.y < 0.05 && p.grav > 0) { p.y = 0.05; p.vy *= -0.3; }
      pos[n * 3] = p.x; pos[n * 3 + 1] = p.y; pos[n * 3 + 2] = p.z;
      const c0 = p.c0, c1 = p.c1 || p.c0;
      col[n * 3] = c0[0] + (c1[0] - c0[0]) * k; col[n * 3 + 1] = c0[1] + (c1[1] - c0[1]) * k; col[n * 3 + 2] = c0[2] + (c1[2] - c0[2]) * k;
      size[n] = p.s0 + (p.s1 - p.s0) * (1 - (1 - k) * (1 - k));
      alpha[n] = p.a * Math.min(1, k / p.fadeIn) * Math.pow(1 - k, 1.4);
      n++;
    }
    geo.setDrawRange(0, n);
    for (const a of ['position', 'aCol', 'aSize', 'aAlpha']) { const at = geo.attributes[a]; at.needsUpdate = true; at.clearUpdateRanges(); at.addUpdateRange(0, n * at.itemSize); }
    return n;
  }
  const clear = () => { for (const p of P) p.live = false; };
  return { points, add, update, clear };
}

const hex = h => [(h >> 16 & 255) / 255, (h >> 8 & 255) / 255, (h & 255) / 255];
const R = (a, b) => a + Math.random() * (b - a);

export function createEffects(scene, camera, quality = 'high') {
  const scaleU = { value: 600 };
  let hi = quality === 'high';
  const glow = pool(260, true, scaleU), smoke = pool(hi ? 420 : 220, false, scaleU);
  scene.add(smoke.points, glow.points);
  const dustCol = { value: hex(0xa39b8b) };
  let dustAmount = 1;

  // ---- one-off bursts --------------------------------------------------------------------------------------------
  function muzzle(x, y, z, dx, dz) {
    glow.add({ x, y, z, vx: dx * 2, vy: 0, vz: dz * 2, life: 0.07, s0: 1.4, s1: 2.6, a: 1.4, c0: [1, 0.9, 0.62], fadeIn: 0.01 });
    for (let i = 0; i < 4; i++) glow.add({ x, y, z, vx: dx * R(6, 14) + R(-1, 1), vy: R(-0.3, 0.6), vz: dz * R(6, 14) + R(-1, 1),
      drag: 8, life: R(0.08, 0.16), s0: 0.5, s1: 1.4, a: 1, c0: [1, 0.72, 0.3], c1: [0.8, 0.25, 0.05], fadeIn: 0.01 });
    const n = hi ? 7 : 4;
    for (let i = 0; i < n; i++) smoke.add({ x: x + dx * R(0.2, 1.4), y: y + R(-0.1, 0.2), z: z + dz * R(0.2, 1.4),
      vx: dx * R(1, 4) + R(-0.6, 0.6), vy: R(0.3, 1), vz: dz * R(1, 4) + R(-0.6, 0.6), drag: 1.6,
      life: R(1.2, 2.2), s0: R(0.6, 1), s1: R(2.8, 4.2), a: R(0.3, 0.45), c0: hex(0x9a9b96), c1: hex(0xb4b4ae) });
  }
  // a shot hitting a wall: (x, y, z) just in front of the wall face, (nx, nz) pointing out of the wall
  function wallHit(x, y, z, nx, nz) {
    glow.add({ x, y, z, vx: 0, vy: 0, vz: 0, life: 0.09, s0: 1.2, s1: 2.2, a: 1.3, c0: [1, 0.85, 0.55], fadeIn: 0.01 });
    for (let i = 0; i < (hi ? 12 : 6); i++) {
      const a = R(0, Math.PI * 2), s = R(4, 11);
      glow.add({ x, y, z, vx: nx * s * 0.8 + Math.cos(a) * s * 0.6, vy: R(1, 6), vz: nz * s * 0.8 + Math.sin(a) * s * 0.6, grav: 14, drag: 1,
        life: R(0.25, 0.6), s0: 0.14, s1: 0.08, a: 1.2, c0: [1, 0.8, 0.45], c1: [1, 0.4, 0.1], fadeIn: 0.01 });
    }
    for (let i = 0; i < (hi ? 6 : 3); i++) smoke.add({ x: x + nx * R(0, 0.6), y: y + R(-0.3, 0.3), z: z + nz * R(0, 0.6),
      vx: nx * R(0.5, 2.5) + R(-0.5, 0.5), vy: R(0.1, 0.8), vz: nz * R(0.5, 2.5) + R(-0.5, 0.5), drag: 1.5,
      life: R(1, 1.8), s0: 0.6, s1: R(2.2, 3.4), a: R(0.35, 0.5), c0: dustCol.value });
  }
  // a shot landed on the chicken's block. A bright flash on the block's face at barrel height (x, y, z) and a puff of pale
  // feathers from the chicken (fx, fy, fz) that drift down slowly. Looks only.
  function chickenHit(x, y, z, fx, fy, fz) {
    glow.add({ x, y, z, vx: 0, vy: 0, vz: 0, life: 0.2, s0: 3.4, s1: 5.2, a: 1.6, c0: [1, 0.93, 0.7], fadeIn: 0.01 });
    for (let i = 0; i < (hi ? 6 : 3); i++) glow.add({ x, y, z, vx: R(2, 6), vy: R(-1, 3), vz: R(-3, 3), grav: 8, drag: 1.2, life: R(0.2, 0.45), s0: 0.14, s1: 0.08, a: 1.1, c0: [1, 0.85, 0.55], c1: [1, 0.5, 0.15], fadeIn: 0.01 });
    for (let i = 0; i < (hi ? 16 : 8); i++) smoke.add({ x: fx + R(-0.4, 0.4), y: fy + R(-0.5, 0.6), z: fz + R(-0.5, 0.5),
      vx: R(0.5, 3.2), vy: R(1, 4), vz: R(-2.5, 2.5), grav: 1.3, drag: 1.1,
      life: R(1.8, 3.2), s0: R(0.45, 0.65), s1: R(0.4, 0.55), a: 0.95, c0: hex(0xece6d6), c1: hex(0xcfc8b6), fadeIn: 0.02 });
  }
  // the hider's tank blowing up (x, z on the ground)
  function explosion(x, z) {
    glow.add({ x, y: 1.4, z, vx: 0, vy: 0, vz: 0, life: 0.18, s0: 6, s1: 10, a: 1.5, c0: [1, 0.92, 0.7], fadeIn: 0.01 });
    for (let i = 0; i < (hi ? 16 : 9); i++) {
      const a = R(0, Math.PI * 2), s = R(1.5, 5);
      glow.add({ x: x + R(-0.6, 0.6), y: R(0.8, 1.8), z: z + R(-0.6, 0.6), vx: Math.cos(a) * s, vy: R(1.5, 5), vz: Math.sin(a) * s, drag: 2.2,
        life: R(0.5, 1.0), s0: R(1.2, 2), s1: R(3.5, 5.5), a: 1.1, c0: [1, 0.78, 0.35], c1: [0.7, 0.18, 0.04], fadeIn: 0.02 });
    }
    for (let i = 0; i < (hi ? 26 : 12); i++) {
      const a = R(0, Math.PI * 2), s = R(5, 15);
      glow.add({ x, y: 1.3, z, vx: Math.cos(a) * s, vy: R(3, 11), vz: Math.sin(a) * s, grav: 16, drag: 0.6,
        life: R(0.5, 1.3), s0: 0.18, s1: 0.1, a: 1.3, c0: [1, 0.85, 0.5], c1: [1, 0.35, 0.08], fadeIn: 0.01 });
    }
    for (let i = 0; i < (hi ? 18 : 9); i++) smoke.add({ x: x + R(-1.2, 1.2), y: R(0.8, 2.5), z: z + R(-1.2, 1.2),
      vx: R(-1.2, 1.2), vy: R(1.2, 3.2), vz: R(-1.2, 1.2), drag: 0.9,
      life: R(2.5, 4.5), s0: R(1.5, 2.5), s1: R(5.5, 8.5), a: R(0.55, 0.8), c0: hex(0x2f2c29), c1: hex(0x55524d), fadeIn: 0.05 });
  }

  // ---- steady emitters (called every frame) -------------------------------------------------------------------------
  const acc = new Map();
  const due = (key, rate, dt) => { const v = (acc.get(key) || 0) + rate * dt; const n = Math.floor(v); acc.set(key, v - n); return n; };
  // dust kicked up behind a tank's tracks. key: which tank; speed in m/s
  function dust(key, tank, speed, dt) {
    const s = Math.abs(speed);
    if (s < 1.5 || dustAmount <= 0) return;
    const n = due(key, s * (hi ? 1.6 : 0.8) * dustAmount, dt);
    const fx = Math.sin(tank.rotation.y), fz = Math.cos(tank.rotation.y), back = Math.sign(speed) * -1.9;
    for (let i = 0; i < n; i++) {
      const side = Math.random() < 0.5 ? -1.25 : 1.25;
      smoke.add({ x: tank.position.x + fx * back + fz * side + R(-0.3, 0.3), y: 0.35, z: tank.position.z + fz * back - fx * side + R(-0.3, 0.3),
        vx: -fx * s * 0.12 + R(-0.4, 0.4), vy: R(0.2, 0.7), vz: -fz * s * 0.12 + R(-0.4, 0.4), drag: 1.8,
        life: R(1, 1.8), s0: 0.6, s1: R(2.2, 3.2), a: 0.42 * Math.min(1, dustAmount), c0: dustCol.value });
    }
  }
  // dark smoke rising off a wreck
  function wreckSmoke(key, x, z, dt) {
    for (let i = 0, n = due(key, hi ? 6 : 3, dt); i < n; i++) smoke.add({ x: x + R(-0.8, 0.8), y: 1.6, z: z + R(-0.8, 0.8),
      vx: R(-0.3, 0.3) + 0.4, vy: R(1.4, 2.4), vz: R(-0.3, 0.3), drag: 0.4,
      life: R(2.5, 3.8), s0: 1, s1: R(4, 6), a: 0.5, c0: hex(0x2b2927), c1: hex(0x5a5752), fadeIn: 0.08 });
  }

  // ---- drifting banks of smoke round the player (decoration only, very faint) -------------------------------------------
  const drift = [];
  let DRIFT = hi ? 6 : 0;
  let driftCol = hex(0xb9bcb8), driftA = 0.1;
  function driftAround(cx, cz, dt) {
    while (drift.length < DRIFT) drift.push({ x: 0, z: 0, y: 0, vx: 0, vz: 0, s: 0, age: 1e9, life: 1 });
    for (const d of drift) {
      d.age += dt;
      if (d.age > d.life || Math.hypot(d.x - cx, d.z - cz) > 34) {
        const a = R(0, Math.PI * 2), r = R(8, 30);
        Object.assign(d, { x: cx + Math.cos(a) * r, z: cz + Math.sin(a) * r, y: R(1, 3.5), vx: R(0.3, 0.9), vz: R(-0.3, 0.3), s: R(9, 15), age: 0, life: R(10, 18) });
      }
      d.x += d.vx * dt; d.z += d.vz * dt;
    }
  }
  // drawn with the smoke, fading in and out over each bank's life
  const driftSprites = () => drift.map(d => ({ x: d.x, y: d.y, z: d.z, s: d.s, c: driftCol, a: driftA * Math.sin(Math.PI * Math.min(1, d.age / d.life)) }));

  // ---- screen shake: small turns of the camera that die away ---------------------------------------------------------
  let shake = 0, t = 0;
  const kick = amount => { shake = Math.min(1.2, shake + amount); };
  function applyShake(dt) {
    t += dt;
    if (shake <= 0.001) { shake = 0; return; }
    const s = shake * shake * 0.05;
    camera.rotateX(Math.sin(t * 47) * s); camera.rotateY(Math.sin(t * 39 + 1.3) * s); camera.rotateZ(Math.sin(t * 31 + 2.1) * s * 0.6);
    shake = Math.max(0, shake - dt * 1.8);
  }

  let lastCount = 0;
  function update(dt, cx, cz) {
    driftAround(cx, cz, dt);
    return (lastCount = glow.update(dt) + smoke.update(dt, driftSprites()));
  }
  return {
    muzzle, wallHit, chickenHit, explosion, dust, wreckSmoke, kick, applyShake, update,
    get lastCount() { return lastCount; },   // particles drawn last frame (testing)
    setScale(px) { scaleU.value = px; },
    clear() { glow.clear(); smoke.clear(); shake = 0; },
    // Graphics High / Low: Low makes fewer particles and no drifting smoke banks
    setQuality(q) { hi = q === 'high'; DRIFT = hi ? 6 : 0; drift.length = Math.min(drift.length, DRIFT); },
    // weather: how much dust the tracks raise, dust colour, drifting smoke colour and strength
    setWeather(w) {
      dustAmount = w.dust;
      driftCol = hex(w.smog.color);
      driftA = w.rain ? 0.05 : 0.09;
    },
  };
}
