// Stage 2B: the Blender-made tank and the leaders' bobbleheads (models/*.glb, built by scripts in Blender).
// - models/tank.glb: the tank body (paint + dark steel) and the barrel (its own piece, so it can kick back).
// - models/bNN.glb, NN = the leader's number in the brief's list: 'fig_body' (the figure below the neck, origin at
//   the hatch), 'fig_head' (origin at the neck, so it can wobble), 'fig_props' (things fixed to the tank: teacup,
//   flag, trim), and if needed 'fig_barrel' (props riding on the barrel) and 'fig_float' (props over the turret).
//   The figure is modelled facing forward; here it is turned round to face the player (Chetan, 2026-09-30) and the
//   other player's figure is drawn bigger (1.3 m instead of 1.0 m, so it can be told apart further away); props
//   are never turned or grown.
// Colours are painted into the models as vertex colours; each tank gets its own few materials (paint, dark steel,
// figure, figure metal), so the hider's whole tank can fade as one on the hunter's screen (main.js) and be repainted
// per role. Nothing throws a sun shadow (see tank.js).
import * as THREE from '../lib/three.module.js';
import { GLTFLoader } from '../lib/loaders/GLTFLoader.js';
import { drawFlag } from './flags.js';

const V = new URL(import.meta.url).searchParams.get('v') || 'local';
const url = name => new URL(`../models/${name}.glb?v=${V}`, import.meta.url).href;
const loader = new GLTFLoader();

// The leaders built so far (numbers from the brief's section 6). Stage 3 replaces the temporary test picking.
export const READY = Array.from({ length: 36 }, (_, i) => i + 1);   // all 36 built (2026-09-30)
export const LEADER_COUNT = 36;

let tankModel = null, tankPromise = null;
export function loadTank() {
  return tankPromise ||= loader.loadAsync(url('tank')).then(g => (tankModel = g.scene));
}
const leaders = new Map();   // number -> Promise of the model's scene
export function loadLeader(n) {
  if (!leaders.has(n)) leaders.set(n, loader.loadAsync(url(`b${String(n).padStart(2, '0')}`)).then(g => g.scene).catch(e => { leaders.delete(n); throw e; }));
  return leaders.get(n);
}

// Which of the tank's own materials a model part uses, by the material name given in Blender.
function pick(u, name) {
  if (name.startsWith('tb_paint')) return u.paint;
  if (name.startsWith('tb_dark')) return u.dark;
  if (name.startsWith('fig_metal')) return u.figMetal;
  return u.fig;
}
// A copy of a model part wearing this tank's materials (the geometry itself is shared, never copied).
function dress(u, src) {
  const out = src.clone(true);
  out.traverse(o => {
    if (!o.isMesh) return;
    o.material = Array.isArray(o.material) ? o.material.map(m => pick(u, m.name)) : pick(u, o.material.name);
    o.castShadow = false;
    o.receiveShadow = true;
  });
  return out;
}

// Swap the tank's plain boxes for the Blender tank (once it has loaded). The barrel's pivot stays where the old
// barrel's centre was, so the recoil and the shots behave exactly as before.
export function applyTank(tank) {
  if (!tankModel || tank.userData.model) return false;
  const u = tank.userData;
  for (const o of u.boxes) tank.remove(o);
  const body = dress(u, tankModel.getObjectByName('tank_body'));
  const barrel = dress(u, tankModel.getObjectByName('tank_barrel'));
  tank.add(body, barrel);
  u.barrel = barrel; u.barrelZ = barrel.position.z;
  u.boxes = [body, barrel];
  u.model = true;
  if (u.leaderScene) attachLeader(tank, u.leader, u.leaderScene);
  u.changed = true;
  syncDuck(tank);   // a duck round that began before the tank had loaded
  return true;
}

// ---- the rubber duck (Stage 4B, Chetan 2026-10-01): models/duck.glb, built by tools/blender/build_duck.py -----------------------
// A duck round draws every tank as this duck instead of the tank body. Nothing else changes: the collision circle, the outline the sight
// rule and the bullets use, and the barrel's pivot and tip are the tank's (the duck's bill IS the barrel: it takes the barrel's place, so
// the recoil, the muzzle flash and the shots come from the same spot). The duck's body wears the tank's paint (orange hunter, blue hider),
// its wheels the steel (so gold and silver trim still show), its eyes and bill the figure material; all of them are the tank's own materials,
// so the fade, the smog and the wreck work as for any tank. The flag moves to the duck's back so the mast does not float beside it.
let duckModel = null, duckPromise = null;
export function loadDuck() {
  return duckPromise ||= loader.loadAsync(url('duck')).then(g => (duckModel = g.scene)).catch(e => { duckPromise = null; throw e; });
}
const DUCK_FLAG = { dx: -0.8, dz: 0.27 };   // the flag's mast and cloth on the duck's back (moved from the tank's rear corner)
function moveFlag(u, on) {
  if (!u.mast || !u.cloth) return;
  const k = on ? 1 : 0;
  u.mast.position.set(FLAG.mastX + k * DUCK_FLAG.dx, (FLAG.mastBase + FLAG.mastTop) / 2, FLAG.mastZ + k * DUCK_FLAG.dz);
  u.cloth.position.set(FLAG.mastX - 0.03 + k * DUCK_FLAG.dx, FLAG.mastTop - 0.05 - FLAG.h, FLAG.mastZ + k * DUCK_FLAG.dz);
}
// Ask for this tank to be a duck (on) or a tank (off). Safe to call at any time: it takes effect as soon as both models are loaded.
export function setDuck(tank, on) {
  const u = tank.userData;
  u.wantDuck = !!on;
  if (on && !duckModel) loadDuck().then(() => syncDuck(tank)).catch(e => console.warn('duck model', e));
  syncDuck(tank);
}
function syncDuck(tank) {
  const u = tank.userData, want = !!u.wantDuck && !!duckModel && !!u.model;
  if (want === !!u.duck) return;
  const [body, barrel] = u.boxes.slice(0, 2);
  if (want) {
    const duck = dress(u, duckModel.getObjectByName('duck_body'));
    const bill = duckModel.getObjectByName('duck_bill');
    tank.add(duck);
    body.visible = false;
    u.tankBarrelGeo = barrel.geometry; u.tankBarrelMat = barrel.material;
    barrel.geometry = bill.geometry; barrel.material = u.fig;   // the bill takes the barrel's place: same pivot, same recoil
    u.duck = duck;
  } else {
    tank.remove(u.duck);
    body.visible = true;
    barrel.geometry = u.tankBarrelGeo; barrel.material = u.tankBarrelMat;
    u.duck = null;
  }
  moveFlag(u, want);
  u.changed = true;   // the fade's depth-only copies are made again for the new parts
}

const FACE_YOU = Math.PI;   // the figure turned round in the hatch, facing back along the tank (towards its own camera)

// Put leader n's bobblehead on a tank (loads it first if needed). size: 1 = 1.0 m figure. Returns a promise.
export function setLeader(tank, n, size = 1) {
  const u = tank.userData;
  if (u.leader === n && u.figSize === size) return Promise.resolve();
  u.leader = n; u.figSize = size;
  return loadLeader(n).then(scene => { if (u.leader === n) attachLeader(tank, n, scene); },
    e => { if (u.leader === n) u.leader = 0; throw e; });   // failed: a later call may try again
}
// Take the bobblehead off (two-player match starting: the other phone's own leader arrives with its first message).
export function clearLeader(tank) {
  const u = tank.userData;
  for (const o of u.figure) o.parent?.remove(o);
  dropFlag(u);
  u.figure = []; u.head = u.float = null; u.leader = 0; u.leaderScene = null; u.changed = true;
}

// ---- the flag (Stage 3A): a short mast at the back of the tank with a waving cloth showing the leader's flag ------
// The mast stands at the rear right corner and the cloth flies inwards across the deck, facing backwards (so the chaser
// reads it). Everything stays inside the tank's outline that bullets and the sight rule use (x within +-1.525 m, not
// further than 1.95 m behind the centre), waves included, so the flag can never show through a wall. The cloth is one of
// the tank's own materials, so it fades and takes the smog with the rest of the tank.
// (3a-2, Chetan: the first size, 1.0 x 0.67 m, took away from the game: now about 70% of it)
export const FLAG = { mastX: 1.42, mastZ: -1.72, mastBase: 0.95, mastTop: 2.36, w: 0.7, h: 0.467, cols: 8, rows: 3, amp: 0.085 };
const flagTex = new Map();
function flagTexture(n) {
  if (!flagTex.has(n)) {
    const c = document.createElement('canvas'); c.width = 192; c.height = 128; drawFlag(c, n);
    const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 4;
    flagTex.set(n, t);
  }
  return flagTex.get(n);
}
function dropFlag(u) {
  if (u.clothMat) { u.mats = u.mats.filter(m => m !== u.clothMat); u.clothMat.dispose(); }
  u.cloth = u.clothMat = u.clothBase = u.mast = null;
}
function attachFlag(tank, n) {
  const u = tank.userData, F = FLAG;
  dropFlag(u);
  const mastGeo = new THREE.CylinderGeometry(0.028, 0.04, F.mastTop - F.mastBase, 6);
  mastGeo.setAttribute('color', new THREE.Float32BufferAttribute(new Array(mastGeo.attributes.position.count * 3).fill(0.85), 3));
  const mast = new THREE.Mesh(mastGeo, u.dark);
  mast.position.set(F.mastX, (F.mastBase + F.mastTop) / 2, F.mastZ);
  mast.receiveShadow = true;
  const geo = new THREE.PlaneGeometry(F.w, F.h, F.cols, F.rows).translate(F.w / 2, F.h / 2, 0);
  u.clothMat = new THREE.MeshLambertMaterial({ map: flagTexture(n), side: THREE.DoubleSide, alphaTest: 0.5 });
  u.mats.push(u.clothMat);
  const cloth = new THREE.Mesh(geo, u.clothMat);
  cloth.userData.noGhost = true;   // a single sheet: no depth-only copy (it would fill in a pennant's notch)
  cloth.position.set(F.mastX - 0.03, F.mastTop - 0.05 - F.h, F.mastZ);
  cloth.rotation.y = Math.PI;      // faces backwards; the cloth then flies towards the middle of the tank
  cloth.frustumCulled = false;
  u.cloth = cloth; u.mast = mast; u.clothW = F.w; u.clothBase = geo.attributes.position.array.slice();
  tank.add(mast, cloth); u.figure.push(mast, cloth);
  if (u.duck) moveFlag(u, true);
  if (u.fade < 1) { u.clothMat.transparent = true; u.clothMat.opacity = u.fade; }
  if (u.wrecked) u.clothMat.color.setHex(0x4a4744);
}
function attachLeader(tank, n, scene) {
  const u = tank.userData;
  for (const o of u.figure) o.parent?.remove(o);
  u.figure = [];
  u.leaderScene = scene;
  attachFlag(tank, n);
  const part = name => { const o = scene.getObjectByName(name); return o ? dress(u, o) : null; };
  const body = part('fig_body'), head = part('fig_head'), props = part('fig_props'), onBarrel = part('fig_barrel'), float = part('fig_float');
  // the figure: body and head in one group standing in the hatch, turned to face back and sized
  const fig = new THREE.Group();
  const hatch = body ? body.position.clone() : new THREE.Vector3(0, 1.9, -0.5);
  fig.position.copy(hatch);
  fig.rotation.y = FACE_YOU;
  fig.scale.setScalar(u.figSize || 1);
  if (body) { body.position.set(0, 0, 0); fig.add(body); }
  if (head) { head.position.sub(hatch); fig.add(head); }
  tank.add(fig); u.figure.push(fig);
  u.flip = Math.cos(FACE_YOU);   // -1: the head's lean (worked out along the tank) is mirrored inside the turned figure
  if (props) { tank.add(props); u.figure.push(props); }
  if (onBarrel) {   // modelled around the barrel's pivot, so it rides the recoil
    onBarrel.position.set(0, 0, 0);
    u.barrel.add(onBarrel); u.figure.push(onBarrel);
  }
  if (float) { tank.add(float); u.figure.push(float); }
  u.head = head; u.float = float;
  u.headRest = head ? head.position.clone() : null;
  u.floatRest = float ? float.position.clone() : null;
  u.changed = true;
}

// Count what a tank draws (testing and the performance report).
export function tankStats(tank) {
  let tris = 0, draws = 0;
  tank.traverseVisible(o => {
    if (!o.isMesh || o.userData.ghost) return;
    const g = o.geometry, n = g.index ? g.index.count : g.attributes.position.count;
    const groups = g.groups.length || 1;
    tris += n / 3; draws += groups;
  });
  return { tris, draws };
}
