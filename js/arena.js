// Builds the 3-D yard: concrete floor, painted precast walls with a worn hazard band, rusty corrugated outer walls,
// wall lamps (lamps.js), a sky, lights and rain, and switches them between the five weathers (weather.js).
// Stage 2A: surfaces are drawn in code (textures.js), no downloads.
import * as THREE from '../lib/three.module.js';
import { WIDTH, DEPTH, ROWS, COLS, wallBoxes, isWallCell, WALL_H, EDGE_H } from './world.js';
import { CELL } from './map.js';
import { floorTexture, wallTexture, outerTexture, stripeTexture, yardShade } from './textures.js';
import { WEATHERS, DEFAULT_WEATHER } from './weather.js';
import { setSmog, smogU, SMOG_GLSL } from './vision.js';
import { createLamps } from './lamps.js';

const TILE = 2 * CELL;      // one floor / wall texture tile = 6.5 m, so joints meet the wall edges
const BAND = { y: 0.35, h: 0.38, tile: 1.3 };   // hazard band near the foot of every wall

// Sky dome: `top` overhead fading to the smog colour at the horizon, with a sun disc and glow.
// Drawn around the camera at the far distance, so it never gets closer or clips.
function makeSky() {
  const mat = new THREE.ShaderMaterial({
    uniforms: {
      top: { value: new THREE.Color() }, horizon: { value: new THREE.Color() },
      sunDir: { value: new THREE.Vector3(0, 1, 0) }, sunDisc: { value: 0 }, sunTint: { value: new THREE.Color(1, 0.93, 0.78) },
    },
    vertexShader: `
      varying vec3 vDir;
      void main() {
        vDir = normalize(position);
        vec4 p = projectionMatrix * mat4(mat3(viewMatrix)) * vec4(position, 1.0);
        gl_Position = p.xyww;   // pin to the far plane
      }`,
    fragmentShader: `
      uniform vec3 top, horizon, sunDir, sunTint;
      uniform float sunDisc;
      varying vec3 vDir;
      void main() {
        vec3 d = normalize(vDir);
        vec3 col = mix(horizon, top, pow(clamp(d.y, 0.0, 1.0), 0.55));
        float a = dot(d, sunDir);
        col += sunDisc * sunTint * (pow(max(a, 0.0), 60.0) * 0.45 + pow(max(a, 0.0), 6.0) * 0.16);   // glow
        col = mix(col, vec3(1.0, 0.97, 0.9), sunDisc * smoothstep(0.9985, 0.9992, a));               // disc
        gl_FragColor = vec4(col, 1.0);
        #include <colorspace_fragment>
      }`,
    side: THREE.BackSide,
    depthWrite: false,
  });
  const sky = new THREE.Mesh(new THREE.SphereGeometry(10, 32, 16), mat);
  sky.frustumCulled = false;
  sky.renderOrder = -1;
  return sky;
}

// Rain: streak sprites in a box that travels with the camera, moved entirely on the graphics chip (no per-frame work
// here). Sprites rather than lines: a line is one pixel wide whatever the screen, too thin to see on a sharp phone.
function makeRain(count) {
  const BOX = [36, 14, 36], pos = new Float32Array(count * 3), r = Math.random;
  for (let i = 0; i < count; i++) pos.set([r() * BOX[0], r() * BOX[1], r() * BOX[2]], i * 3);
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  const mat = new THREE.ShaderMaterial({
    uniforms: { ...smogU, uTime: { value: 0 }, uBox: { value: new THREE.Vector3(...BOX) }, uAlpha: { value: 0.4 }, uScale: { value: 600 } },
    vertexShader: `
      ${SMOG_GLSL}
      uniform float uTime, uScale; uniform vec3 uBox;
      varying float vA;
      void main() {
        vec3 fall = vec3(1.2, -17.0, 0.7);   // m/s, a little wind
        vec3 p = mod(position + fall * uTime - cameraPosition + uBox * 0.5, uBox) - uBox * 0.5 + cameraPosition;
        p.y = mod(position.y + fall.y * uTime, uBox.y);
        vec4 mv = viewMatrix * vec4(p, 1.0);
        gl_PointSize = min(160.0, 0.9 * uScale / max(0.5, -mv.z));   // a streak about 0.9 m long
        vA = 1.0 - smogAt(p);
        gl_Position = projectionMatrix * mv;
      }`,
    fragmentShader: `
      uniform float uAlpha; varying float vA;
      void main() {
        vec2 q = gl_PointCoord - 0.5;
        float x = q.x + q.y * 0.07;                        // leaning slightly with the wind
        float w = 0.018 + 0.012 * (0.5 - q.y);             // a hair wider at the bottom
        float a = smoothstep(w, w * 0.3, abs(x)) * smoothstep(0.5, 0.1, abs(q.y));
        gl_FragColor = vec4(0.86, 0.9, 0.93, a * uAlpha * vA);
      }`,
    transparent: true, depthWrite: false,
  });
  const rain = new THREE.Points(geo, mat);
  rain.frustumCulled = false;
  rain.renderOrder = 3;
  return rain;
}

// Shadows: the walls never move, so their shadows are drawn once per weather (sun direction) instead of every frame,
// which saved about 2.5 ms a frame. Tanks don't throw sun shadows (they keep the soft contact shadow under them),
// but still darken when they drive into a wall's shadow. Stage 1e already kept the hider's shadow off the hunter's screen.
let renderer = null;
export const useRenderer = r => { renderer = r; r.shadowMap.autoUpdate = false; r.shadowMap.needsUpdate = true; };
const shadowsDirty = () => { if (renderer) renderer.shadowMap.needsUpdate = true; };

export function buildArena(scene, quality = 'high') {
  const hi = quality === 'high';
  const sky = makeSky();
  scene.add(sky);

  const skyLight = new THREE.HemisphereLight();
  const sun = new THREE.DirectionalLight();
  sun.castShadow = true;                              // walls throw shadows across the alleys
  sun.shadow.mapSize.set(2048, 2048);
  // the box the shadows are drawn in, seen from the sun: just big enough for the whole arena (156 x 104 m)
  Object.assign(sun.shadow.camera, { left: -95, right: 95, top: 75, bottom: -75, near: 10, far: 220 });
  sun.shadow.bias = -0.0005;
  sun.shadow.normalBias = 0.05;
  scene.add(skyLight, sun, sun.target);

  // floor: 6.5 m concrete tiles, plus a whole-yard shade map (dark at the wall feet, big faint stains).
  // Surfaces are drawn in the background (textures.js) and put on when ready; plain colours until then.
  const floorGeo = new THREE.PlaneGeometry(WIDTH, DEPTH);
  floorGeo.setAttribute('uv1', floorGeo.attributes.uv.clone());   // 0..1 across the whole yard, for the shade map
  // (no bump map on the floor: it cost about 1 ms a frame on this laptop for a difference you can barely see)
  const floorMat = new THREE.MeshStandardMaterial({ color: 0x7c827e, roughness: 0.95 });
  const floor = new THREE.Mesh(floorGeo, floorMat);
  floor.rotation.x = -Math.PI / 2;
  floor.receiveShadow = true;
  scene.add(floor);

  // walls: one merged mesh per material (3 draw calls for every wall on the map, which phones like)
  const wallMat = new THREE.MeshStandardMaterial({ color: 0x75807a, roughness: 0.88, metalness: 0.02 });
  const edgeMat = new THREE.MeshStandardMaterial({ color: 0x5b6461, normalScale: new THREE.Vector2(1.2, 1.2), roughness: 0.7, metalness: 0.25 });
  const bandMat = new THREE.MeshStandardMaterial({ color: 0xb4531c, roughness: 0.75 });
  const inner = [], outer = [], bands = [];
  for (const b of wallBoxes()) {
    (b.h > 5 ? outer : inner).push([b.x, b.h / 2, b.z, b.w, b.h, b.d]);
    bands.push([b.x, BAND.y + BAND.h / 2, b.z, b.w + 0.04, BAND.h, b.d + 0.04]);
  }
  // texture coordinates in metres of wall: along the wall and up it, so no wall is ever stretched
  const uvWall = h => (x, y, z, n) => Math.abs(n[1]) > 0.5 ? [x / TILE, z / TILE] : [(Math.abs(n[0]) > 0.5 ? z : x) / TILE, y / h];
  const uvBand = (x, y, z, n) => [(Math.abs(n[0]) > 0.5 ? z : x) / BAND.tile, (y - BAND.y) / BAND.h];
  for (const [list, mat, uv] of [[inner, wallMat, uvWall(WALL_H)], [outer, edgeMat, uvWall(EDGE_H)], [bands, bandMat, uvBand]]) {
    const m = new THREE.Mesh(mergedBoxes(list, uv), mat);
    m.castShadow = m.receiveShadow = true;
    scene.add(m);
  }

  // the surfaces, drawn in the background: stripes first (tiny), then floor, walls, outer walls, floor shading
  let wet = 0, floorCol = 0x7c827e;   // set by the weather; used when the surfaces arrive
  const ready = (async () => {
    const size = hi ? 512 : 256;
    bandMat.map = await stripeTexture(); bandMat.color.set(0xffffff); bandMat.needsUpdate = true;
    const ft = await floorTexture(size);
    ft.map.repeat.set(WIDTH / TILE, DEPTH / TILE);
    floorMat.map = ft.map; floorMat.color.setHex(floorCol); floorMat.needsUpdate = true;
    const wt = await wallTexture(size);
    wallMat.map = wt.map; wallMat.normalMap = hi ? wt.normalMap : null; wallMat.color.setScalar(1 - 0.12 * wet); wallMat.needsUpdate = true;
    const ot = await outerTexture(size);
    edgeMat.map = ot.map; edgeMat.normalMap = hi ? ot.normalMap : null; edgeMat.color.set(0xffffff); edgeMat.needsUpdate = true;
    floorMat.aoMap = await yardShade(ROWS, COLS, CELL, isWallCell); floorMat.needsUpdate = true;
  })();
  const lamps = createLamps(scene);
  lamps.cases.castShadow = true;
  const rain = makeRain(hi ? 1400 : 600);
  rain.visible = false;
  scene.add(rain);

  let current = null, curWeather = null, tone = null;
  // Stage 4B (love / hate): the lights take a tint, warm pink for love (strong), a faint red for hate (subtle). Only the colour of the lights changes
  // (the sky, the smog and every distance stay as the weather made them, so nothing about who can see whom changes); it costs nothing to draw.
  const TONES = { love: { c: 0xff9fb8, k: 0.15 }, hate: { c: 0xff5a4a, k: 0.12 } };
  const lit = (hex, t) => { const c = new THREE.Color(hex); if (t) c.lerp(new THREE.Color(t.c), t.k); return c; };
  function applyLights() {
    const w = curWeather, t = tone && TONES[tone];
    if (!w) return;
    skyLight.color.copy(lit(w.sky.col, t)); skyLight.groundColor.copy(lit(w.sky.ground, t)); sun.color.copy(lit(w.sun.col, t));
  }
  // Switch the whole look to a weather: smog, sky, lights, lamp strength, wet floor, rain.
  function setWeather(name) {
    const w = WEATHERS[name] || WEATHERS[DEFAULT_WEATHER];
    current = name in WEATHERS ? name : DEFAULT_WEATHER;
    setSmog(scene, w.smog, sky.material);
    const u = sky.material.uniforms;
    u.sunDir.value.set(...w.sunDir).normalize();
    u.sunDisc.value = w.sunDisc;
    u.sunTint.value.setRGB(...(w.sunTint || [1, 0.93, 0.78]));
    curWeather = w; applyLights();
    skyLight.intensity = w.sky.i;
    sun.intensity = w.sun.i; sun.shadow.radius = w.sun.soft;
    sun.position.set(...w.lightDir).normalize().multiplyScalar(110);
    // wet: darker, smoother floor and walls (rain, and a little in fog)
    floorCol = w.floor; wet = w.wet;
    if (floorMat.map) floorMat.color.setHex(w.floor);
    floorMat.roughness = 0.95 - 0.4 * w.wet;
    if (wallMat.map) wallMat.color.setScalar(1 - 0.12 * w.wet);
    wallMat.roughness = 0.88 - 0.25 * w.wet;
    lamps.setLevel(w.lamps);
    shadowsDirty();
    rain.visible = !!w.rain;
    return w;
  }
  return {
    sky: sky.material, sun, lamps, setWeather,
    setTone(kind) { kind = kind in TONES ? kind : null; if (kind === tone) return; tone = kind; applyLights(); },
    ready,   // resolves when every surface is drawn (testing)
    get weather() { return current; },
    update(t, dt) { rain.material.uniforms.uTime.value = t; lamps.update(dt); },
    setScale(px) { rain.material.uniforms.uScale.value = px; lamps.setScale(px); },
  };
}

// Many boxes [x, y, z, width, height, depth] as a single geometry. uv(x, y, z, normal) gives each corner's
// texture coordinates from its position in the world.
function mergedBoxes(list, uv) {
  const pos = [], nrm = [], uvs = [], idx = [];
  for (const [x, y, z, w, h, d] of list) {
    const g = new THREE.BoxGeometry(w, h, d).translate(x, y, z);
    const base = pos.length / 3, p = g.attributes.position.array, n = g.attributes.normal.array;
    for (let i = 0; i < p.length; i += 3) uvs.push(...uv(p[i], p[i + 1], p[i + 2], [n[i], n[i + 1], n[i + 2]]));
    pos.push(...p);
    nrm.push(...n);
    for (const i of g.index.array) idx.push(base + i);
    g.dispose();
  }
  const out = new THREE.BufferGeometry();
  out.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  out.setAttribute('normal', new THREE.Float32BufferAttribute(nrm, 3));
  out.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
  out.setIndex(idx);
  return out;
}
