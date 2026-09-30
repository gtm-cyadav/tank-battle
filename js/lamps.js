// Wall lamps (Stage 2A): industrial lamps on the walls, about every 12 m, each with a glow and a pool of light on the
// floor. Most are warm sodium lamps, some cold tubes; about one in five is faulty and flickers now and then (with a
// buzz, sound.js). Weather sets how strong they are (nearly off in sunshine, full at dusk).
// Cheap on phones: no real lights. All glows are one draw call, all pools one, all housings one.
import * as THREE from '../lib/three.module.js';
import { ROWS, COLS, isWallCell, cellX, cellZ } from './world.js';
import { CELL } from './map.js';
import { smogU, SMOG_GLSL } from './vision.js';

const HEIGHT = 3.7, SPACING = 12;
const SODIUM = [1.0, 0.68, 0.34], TUBE = [0.78, 0.88, 1.0];

function rng(seed) { let s = seed >>> 0; return () => ((s = (s * 1664525 + 1013904223) >>> 0) / 4294967296); }

// Where the lamps go: the middle of a wall face next to open floor, no two closer than SPACING. Same on every phone.
function placeLamps() {
  const cand = [], r = rng(5);
  for (let i = 0; i < ROWS; i++) for (let j = 0; j < COLS; j++) {
    if (isWallCell(i, j)) continue;
    for (const [di, dj] of [[-1, 0], [1, 0], [0, -1], [0, 1]]) {
      if (!isWallCell(i + di, j + dj)) continue;
      const cx = cellX(j) + CELL / 2, cz = cellZ(i) + CELL / 2;   // floor square's centre
      cand.push({ x: cx + dj * CELL / 2, z: cz + di * CELL / 2, ox: -dj, oz: -di, k: r() });   // on the wall face, facing out
    }
  }
  cand.sort((a, b) => a.k - b.k);
  const out = [];
  for (const c of cand) if (out.every(o => Math.hypot(o.x - c.x, o.z - c.z) >= SPACING)) out.push(c);
  return out;
}

export function createLamps(scene) {
  const list = placeLamps(), n = list.length, r = rng(9);
  const glowPos = new Float32Array(n * 3), glowCol = new Float32Array(n * 3), level = new Float32Array(n);
  const poolPos = [], poolUv = [], poolCol = [], poolLevel = new Float32Array(n * 4), idx = [];
  const housings = [];
  list.forEach((l, i) => {
    l.col = r() < 0.72 ? SODIUM : TUBE;
    l.faulty = r() < 0.2;
    l.next = 2 + r() * 10;     // faulty: seconds until its next flicker
    l.burst = 0; l.flip = 0; l.on = 1;
    glowPos.set([l.x + l.ox * 0.45, HEIGHT - 0.12, l.z + l.oz * 0.45], i * 3);
    glowCol.set(l.col, i * 3);
    // pool: 8 m out from the wall by 7 m along it, starting at the wall
    const ax = l.oz, az = -l.ox;   // along the wall
    const base = poolPos.length / 3;
    for (const [s, t] of [[0, -1], [0, 1], [1, 1], [1, -1]]) {
      poolPos.push(l.x + l.ox * (0.1 + s * 8) + ax * t * 3.5, 0.025, l.z + l.oz * (0.1 + s * 8) + az * t * 3.5);
      poolUv.push(s, t); poolCol.push(...l.col);
    }
    idx.push(base, base + 1, base + 2, base, base + 2, base + 3);
    housings.push([l.x + l.ox * 0.22, HEIGHT, l.z + l.oz * 0.22, Math.abs(ax) * 0.7 + Math.abs(l.ox) * 0.44, 0.2, Math.abs(az) * 0.7 + Math.abs(l.oz) * 0.44]);
  });

  const weather = { value: 0.5 };
  // glows: soft round sprites that keep their size in metres (a bright core in a wide halo); fade in the smog, but
  // keep a faint halo, as lamps do in fog
  const glowGeo = new THREE.BufferGeometry();
  glowGeo.setAttribute('position', new THREE.BufferAttribute(glowPos, 3));
  glowGeo.setAttribute('aCol', new THREE.BufferAttribute(glowCol, 3));
  glowGeo.setAttribute('aLevel', new THREE.BufferAttribute(level, 1));
  const scaleU = { value: 600 };
  const glowMat = new THREE.ShaderMaterial({
    uniforms: { ...smogU, uScale: scaleU, uWeather: weather },
    vertexShader: `
      ${SMOG_GLSL}
      attribute vec3 aCol; attribute float aLevel;
      uniform float uScale, uWeather;
      varying vec3 vCol; varying float vA;
      void main() {
        vec4 mv = modelViewMatrix * vec4(position, 1.0);
        gl_PointSize = min(512.0, 3.2 * uScale / -mv.z);
        vCol = aCol; vA = aLevel * uWeather * (1.0 - 0.75 * smogAt(position));
        gl_Position = projectionMatrix * mv;
      }`,
    fragmentShader: `
      varying vec3 vCol; varying float vA;
      void main() {
        float r = length(gl_PointCoord - 0.5) * 2.0;
        float halo = pow(max(0.0, 1.0 - r), 2.2) * 0.55, core = smoothstep(0.22, 0.0, r);
        gl_FragColor = vec4(mix(vCol, vec3(1.0), core * 0.7) * (halo + core) * vA, 1.0);
      }`,
    blending: THREE.AdditiveBlending, transparent: true, depthWrite: false,
  });
  const glows = new THREE.Points(glowGeo, glowMat);
  glows.frustumCulled = false;
  glows.renderOrder = 2;

  const poolGeo = new THREE.BufferGeometry();
  poolGeo.setAttribute('position', new THREE.Float32BufferAttribute(poolPos, 3));
  poolGeo.setAttribute('aUv', new THREE.Float32BufferAttribute(poolUv, 2));
  poolGeo.setAttribute('aCol', new THREE.Float32BufferAttribute(poolCol, 3));
  poolGeo.setAttribute('aLevel', new THREE.BufferAttribute(poolLevel, 1));
  poolGeo.setIndex(idx);
  const poolMat = new THREE.ShaderMaterial({
    uniforms: { ...smogU, uWeather: weather },
    vertexShader: `
      ${SMOG_GLSL}
      attribute vec2 aUv; attribute vec3 aCol; attribute float aLevel;
      uniform float uWeather;
      varying vec2 vUv; varying vec3 vCol; varying float vA;
      void main() {
        vUv = aUv; vCol = aCol; vA = aLevel * uWeather * (1.0 - smogAt(position));
        gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
      }`,
    fragmentShader: `
      varying vec2 vUv; varying vec3 vCol; varying float vA;
      void main() {
        // brightest a metre or two out from the wall, fading out in an oval
        float d = length(vec2((vUv.x - 0.22) * 1.3, vUv.y * 0.95));
        float f = pow(max(0.0, 1.0 - d), 1.8) * smoothstep(0.0, 0.08, vUv.x);
        gl_FragColor = vec4(vCol * f * vA * 0.6, 1.0);
      }`,
    blending: THREE.AdditiveBlending, transparent: true, depthWrite: false, side: THREE.DoubleSide,
  });
  const pools = new THREE.Mesh(poolGeo, poolMat);
  pools.frustumCulled = false;
  pools.renderOrder = 1;

  // housings: small dark metal boxes on the wall
  const hp = [], hn = [], hi = [];
  for (const [x, y, z, w, h, d] of housings) {
    const g = new THREE.BoxGeometry(w, h, d).translate(x, y, z), b = hp.length / 3;
    hp.push(...g.attributes.position.array); hn.push(...g.attributes.normal.array);
    for (const i of g.index.array) hi.push(b + i);
    g.dispose();
  }
  const hGeo = new THREE.BufferGeometry();
  hGeo.setAttribute('position', new THREE.Float32BufferAttribute(hp, 3));
  hGeo.setAttribute('normal', new THREE.Float32BufferAttribute(hn, 3));
  hGeo.setIndex(hi);
  const cases = new THREE.Mesh(hGeo, new THREE.MeshStandardMaterial({ color: 0x2a2d2c, roughness: 0.6, metalness: 0.5 }));
  scene.add(pools, cases, glows);

  let onZap = () => {};
  function update(dt) {
    for (let i = 0; i < n; i++) {
      const l = list[i];
      if (l.faulty) {
        if (l.burst > 0) {   // flickering: on and off at random every few hundredths of a second
          l.burst -= dt; l.flip -= dt;
          if (l.flip <= 0) { l.on = l.on > 0.5 ? 0.05 + Math.random() * 0.2 : 1; l.flip = 0.03 + Math.random() * 0.09; }
          if (l.burst <= 0) { l.on = 1; l.next = 3 + Math.random() * 10; }
        } else if ((l.next -= dt) <= 0) {
          l.burst = 0.25 + Math.random() * 1.1; l.flip = 0;
          onZap(l);
        }
      }
      level[i] = l.on;
      poolLevel[i * 4] = poolLevel[i * 4 + 1] = poolLevel[i * 4 + 2] = poolLevel[i * 4 + 3] = l.on;
    }
    glowGeo.attributes.aLevel.needsUpdate = true;
    poolGeo.attributes.aLevel.needsUpdate = true;
  }
  return {
    list,
    cases,
    update,
    setLevel(v) { weather.value = v; },
    get level() { return weather.value; },
    setScale(px) { scaleU.value = px; },   // screen height in pixels / (2 tan(fov / 2)): keeps glows sized in metres
    onZap(fn) { onZap = fn; },
    // the closest lamp to (x, z) and how far it is
    nearest(x, z) { let best = null, d = Infinity; for (const l of list) { const e = Math.hypot(l.x - x, l.z - z); if (e < d) { d = e; best = l; } } return { lamp: best, d }; },
  };
}
