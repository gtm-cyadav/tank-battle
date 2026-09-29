// Builds the 3-D yard: concrete floor with a faint grid, grey-green walls with an orange warning band,
// a sky, and a light haze in the distance. Plain materials for now; real textures arrive in Stage 2.
import * as THREE from '../lib/three.module.js';
import { WIDTH, DEPTH, wallBoxes } from './world.js';

// Looks. "sunny" is the blue-sky version Chetan picked in 1a; the first phone test found it far too bright, so
// "overcast" (medium: soft grey sky, no visible sun, gentle shadows) is the default since 2026-09-29.
// Stage 2 adds a weather setting (sunny, overcast, dusk, fog, rain) that picks from this list.
export const LOOKS = {
  sunny: { haze: 0xc4d3df, top: 0x3f7fc4, sunDisc: 1, skyCol: 0xbcd4ea, ground: 0x5a5448, sky: 1.7, sunCol: 0xfff0d8, sun: 2.8,
    shadowSoft: 1, fog: [30, 130] },
  overcast: { haze: 0xa9b1b4, top: 0xbfc6ca, sunDisc: 0, skyCol: 0xdde2e5, ground: 0x7a766c, sky: 1.95, sunCol: 0xe6e9eb, sun: 0.45,
    shadowSoft: 6, fog: [28, 125] },
};
const LIGHT = { floor: 0x9aa39e, wall: 0x7a857e, edge: 0x67716b };
const SUN_DIR = new THREE.Vector3(-0.55, 0.2, 0.72).normalize();   // where the sun disc sits in the sky
const LIGHT_DIR = new THREE.Vector3(-0.5, 0.95, 0.65).normalize();  // a bit higher, so alleys aren't all in shade

// Sky dome: blue overhead fading to pale haze at the horizon, with a sun disc and glow.
// Drawn around the camera at the far distance, so it never gets closer or clips.
function makeSky(look) {
  const mat = new THREE.ShaderMaterial({
    uniforms: {
      top: { value: new THREE.Color(look.top) },
      horizon: { value: new THREE.Color(look.haze) },
      sunDir: { value: SUN_DIR },
      sunDisc: { value: look.sunDisc },
    },
    vertexShader: `
      varying vec3 vDir;
      void main() {
        vDir = normalize(position);
        vec4 p = projectionMatrix * mat4(mat3(viewMatrix)) * vec4(position, 1.0);
        gl_Position = p.xyww;   // pin to the far plane
      }`,
    fragmentShader: `
      uniform vec3 top, horizon, sunDir;
      uniform float sunDisc;
      varying vec3 vDir;
      void main() {
        vec3 d = normalize(vDir);
        vec3 col = mix(horizon, top, pow(clamp(d.y, 0.0, 1.0), 0.55));
        float a = dot(d, sunDir);
        col += sunDisc * vec3(1.0, 0.93, 0.78) * (pow(max(a, 0.0), 60.0) * 0.45 + pow(max(a, 0.0), 8.0) * 0.12);  // glow
        col = mix(col, vec3(1.0, 0.98, 0.92), sunDisc * smoothstep(0.9985, 0.9992, a));                          // disc
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

function floorTexture() {
  const s = 256, cv = document.createElement('canvas');
  cv.width = cv.height = s;
  const g = cv.getContext('2d');
  g.fillStyle = '#8a8f8c';          // light base, tinted by the floor colour below
  g.fillRect(0, 0, s, s);
  for (let i = 0; i < 1400; i++) {   // concrete speckle
    const v = 110 + Math.random() * 60 | 0;
    g.fillStyle = `rgba(${v},${v + 4},${v + 2},0.5)`;
    g.fillRect(Math.random() * s, Math.random() * s, 2, 2);
  }
  g.strokeStyle = '#b2b9b4';
  g.lineWidth = 3;
  g.strokeRect(0, 0, s, s);          // grid line on every 5 m tile edge
  const t = new THREE.CanvasTexture(cv);
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.repeat.set(WIDTH / 5, DEPTH / 5);
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 4;
  return t;
}

export function buildArena(scene, lookName = 'overcast') {
  const look = LOOKS[lookName];
  scene.background = new THREE.Color(look.haze);
  scene.fog = new THREE.Fog(look.haze, ...look.fog);   // light distance haze, walls fade into the horizon
  scene.add(makeSky(look));

  const skyLight = new THREE.HemisphereLight(look.skyCol, look.ground, look.sky);
  const sun = new THREE.DirectionalLight(look.sunCol, look.sun);   // under overcast: weak, blurred shadows
  sun.position.copy(LIGHT_DIR).multiplyScalar(90);
  sun.castShadow = true;                              // walls throw shadows across the alleys
  sun.shadow.mapSize.set(2048, 2048);
  Object.assign(sun.shadow.camera, { left: -75, right: 75, top: 75, bottom: -75, near: 10, far: 200 });
  sun.shadow.bias = -0.0005;
  sun.shadow.normalBias = 0.05;
  sun.shadow.radius = look.shadowSoft;
  scene.add(skyLight, sun, sun.target);

  const floorMat = new THREE.MeshStandardMaterial({ map: floorTexture(), color: LIGHT.floor, roughness: 0.95 });
  const floor = new THREE.Mesh(new THREE.PlaneGeometry(WIDTH, DEPTH), floorMat);
  floor.rotation.x = -Math.PI / 2;
  floor.receiveShadow = true;
  scene.add(floor);

  const wallMat = new THREE.MeshStandardMaterial({ color: LIGHT.wall, roughness: 0.85, metalness: 0.05 });
  const edgeMat = new THREE.MeshStandardMaterial({ color: LIGHT.edge, roughness: 0.9, metalness: 0.05 });
  const bandMat = new THREE.MeshStandardMaterial({ color: 0xb4531c, roughness: 0.7 });
  // one mesh per material (3 draw calls for every wall on the map, which phones like)
  const inner = [], outer = [], bands = [];
  for (const b of wallBoxes()) {
    (b.h > 5 ? outer : inner).push([b.x, b.h / 2, b.z, b.w, b.h, b.d]);
    bands.push([b.x, 0.6, b.z, b.w + 0.04, 0.2, b.d + 0.04]);   // orange warning band near the base
  }
  for (const [list, mat] of [[inner, wallMat], [outer, edgeMat], [bands, bandMat]]) {
    const m = new THREE.Mesh(mergedBoxes(list), mat);
    m.castShadow = m.receiveShadow = true;
    scene.add(m);
  }
}

// Many boxes [x, y, z, width, height, depth] as a single geometry.
function mergedBoxes(list) {
  const pos = [], nrm = [], idx = [];
  for (const [x, y, z, w, h, d] of list) {
    const g = new THREE.BoxGeometry(w, h, d).translate(x, y, z);
    const base = pos.length / 3;
    pos.push(...g.attributes.position.array);
    nrm.push(...g.attributes.normal.array);
    for (const i of g.index.array) idx.push(base + i);
    g.dispose();
  }
  const out = new THREE.BufferGeometry();
  out.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  out.setAttribute('normal', new THREE.Float32BufferAttribute(nrm, 3));
  out.setIndex(idx);
  return out;
}
