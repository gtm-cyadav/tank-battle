// Stage 4A (Chetan, 2026-10-01): the things the easter eggs put in the yard, drawn in code (no downloads, no models).
//   - the stone chicken on top of one wall block (a single merged mesh: one draw call),
//   - the wall graffiti: faint writing on a few wall faces (one merged mesh and one small texture: one draw call),
//   - the lost tourist (three meshes while he is on screen, one on Low graphics; hidden when he is not in the round),
//   - the sweat drops on the hider's bobblehead in the last ten seconds.
// None of it is solid, none of it is known to the sight rule, the hits or the map checker, and each draws exactly what the
// shared match says (main.js feeds it the round clock), so both phones show the same thing.
// The look is Chetan's pick "A. quiet and worn" (2026-10-01): a weathered stone chicken, a tourist in a beige jacket with a red
// cap, faint stencil writing a shade lighter than the wall.
import * as THREE from '../lib/three.module.js';
import { mergeGeometries } from '../lib/utils/BufferGeometryUtils.js';
import { chickenLedge, LEDGE, GRAFFITI, GRAFFITI_SIZE, graffitiSpot } from './eggs.js';

// one coloured piece: a geometry moved into place and painted in one colour (vertex colours, so all pieces share a material)
function piece(geo, color, { x = 0, y = 0, z = 0, sx = 1, sy = 1, sz = 1, rx = 0, ry = 0, rz = 0 } = {}) {
  const g = geo.index ? geo.toNonIndexed() : geo;
  const m = new THREE.Matrix4().compose(new THREE.Vector3(x, y, z), new THREE.Quaternion().setFromEuler(new THREE.Euler(rx, ry, rz)), new THREE.Vector3(sx, sy, sz));
  g.applyMatrix4(m);
  const c = new THREE.Color(color), n = g.attributes.position.count, col = new Float32Array(n * 3);
  for (let i = 0; i < n; i++) { col[i * 3] = c.r; col[i * 3 + 1] = c.g; col[i * 3 + 2] = c.b; }
  g.setAttribute('color', new THREE.BufferAttribute(col, 3));
  g.deleteAttribute('uv');
  return g;
}
const merged = list => mergeGeometries(list, false);
const SPHERE = (r = 1) => new THREE.SphereGeometry(r, 12, 8);
const BOX = (w, h, d) => new THREE.BoxGeometry(w, h, d);
const CONE = (r, h, seg = 8) => new THREE.CylinderGeometry(0, r, h, seg);
const CYL = (r, h, seg = 8) => new THREE.CylinderGeometry(r, r, h, seg);
const stone = () => new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.92, metalness: 0.02 });

// ---- the chicken --------------------------------------------------------------------------------------------------
function makeChicken() {
  const STONE = 0x9aa09c, DARK = 0x7d847f, COMB = 0xb4531c, BEAK = 0xa89b86, EYE = 0x3b423e;
  const parts = [
    piece(BOX(1.15, 0.22, 0.95), DARK, { y: 0.11 }),                                                    // plinth
    piece(SPHERE(0.5), STONE, { y: 0.88, sy: 0.82, sz: 1.2 }),                                          // body
    piece(CONE(0.3, 0.75, 7), STONE, { y: 1.12, z: -0.62, rx: -1.05 }),                                  // tail
    piece(CONE(0.2, 0.55, 7), DARK, { y: 0.96, z: -0.6, rx: -1.3, sx: 0.8 }),                              // tail underside
    piece(SPHERE(0.23), STONE, { y: 1.5, z: 0.4 }),                                                     // head
    piece(CONE(0.075, 0.22, 6), BEAK, { y: 1.46, z: 0.67, rx: Math.PI / 2 }),                          // beak
    piece(SPHERE(0.075), COMB, { y: 1.77, z: 0.36 }), piece(SPHERE(0.085), COMB, { y: 1.79, z: 0.43 }), piece(SPHERE(0.07), COMB, { y: 1.75, z: 0.5 }),   // comb
    piece(SPHERE(0.06), COMB, { y: 1.34, z: 0.56 }),                                                    // wattle
    piece(SPHERE(0.032), EYE, { x: 0.2, y: 1.55, z: 0.5 }), piece(SPHERE(0.032), EYE, { x: -0.2, y: 1.55, z: 0.5 }),
    piece(CYL(0.045, 0.4, 6), DARK, { x: 0.17, y: 0.38, z: 0.1 }), piece(CYL(0.045, 0.4, 6), DARK, { x: -0.17, y: 0.38, z: 0.1 }),                      // legs
    piece(BOX(1.4, 0.23, 1.04), DARK, { y: -0.115, z: -0.058 }),                                        // the ledge it stands on (juts 1.05 m out of the wall, 0.3 m thick)
  ];
  const mesh = new THREE.Mesh(merged(parts), stone());
  mesh.receiveShadow = false;
  const g = new THREE.Group();
  g.add(mesh);
  const at = chickenLedge();
  g.position.set(at.x + 0.45, at.y, at.z);   // on the ledge: 0.45 m out from the east face of its block
  g.rotation.y = Math.PI / 2;                // looks straight out over the plaza (east), the way a hunter comes at it
  g.scale.setScalar(1.3);
  return g;
}

// ---- the arrow under the chicken: faint stencil paint like the graffiti, an arrow pointing up and "Shoot the chicken" -----------------------------
function drawArrow(canvas) {
  const g = canvas.getContext('2d'), W = canvas.width, H = canvas.height;
  g.clearRect(0, 0, W, H);
  g.fillStyle = 'rgba(226,232,226,0.62)';
  g.beginPath(); g.moveTo(H * 0.5, H * 0.06); g.lineTo(H * 0.96, H * 0.58); g.lineTo(H * 0.04, H * 0.58); g.closePath(); g.fill();   // the arrowhead
  g.fillRect(H * 0.34, H * 0.55, H * 0.32, H * 0.4);                                                                                    // and its shaft
  g.font = `500 ${H * 0.5}px "Plex Mono", ui-monospace, Menlo, Consolas, monospace`;
  g.textAlign = 'left'; g.textBaseline = 'middle';
  g.fillStyle = 'rgba(28,32,30,0.2)'; g.fillText('Shoot the chicken', H + 3, H * 0.5 + 3);
  g.fillStyle = 'rgba(226,232,226,0.62)'; g.fillText('Shoot the chicken', H + 0, H * 0.5);
}
function makeArrow(quality) {
  const k = quality === 'high' ? 1 : 0.5, canvas = document.createElement('canvas');
  canvas.width = 1024 * k; canvas.height = (1024 * LEDGE.arrowH / LEDGE.arrowW) * k;
  drawArrow(canvas);
  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace; tex.anisotropy = 4;
  document.fonts?.load('500 40px "Plex Mono"').then(() => { drawArrow(canvas); tex.needsUpdate = true; }).catch(() => {});
  const at = chickenLedge();
  const mesh = new THREE.Mesh(new THREE.PlaneGeometry(LEDGE.arrowW, LEDGE.arrowH),
    new THREE.MeshStandardMaterial({ map: tex, transparent: true, depthWrite: false, roughness: 0.95, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2 }));
  mesh.position.set(at.x + 0.03, LEDGE.arrowY, at.z);
  mesh.rotation.y = Math.PI / 2;   // faces east, out of the wall
  mesh.renderOrder = 1;
  return mesh;
}

// ---- the graffiti -------------------------------------------------------------------------------------------------
// One small atlas of the writing (faint paint, lighter than the wall), and one mesh of quads standing 3 cm off the wall.
function drawGraffiti(canvas, scale) {
  const g = canvas.getContext('2d'), CW = 512 * scale, CH = 128 * scale, cols = 2;
  g.clearRect(0, 0, canvas.width, canvas.height);
  g.textAlign = 'center'; g.textBaseline = 'middle';
  GRAFFITI.forEach((item, i) => {
    const x0 = (i % cols) * CW, y0 = Math.floor(i / cols) * CH;
    const words = item.text.split(' '), lines = [item.text];
    if (item.text.length > 17) {   // two lines, split as evenly as the words allow
      let best = 1e9;
      for (let k = 1; k < words.length; k++) { const a = words.slice(0, k).join(' '), b = words.slice(k).join(' '), d = Math.abs(a.length - b.length); if (d < best) { best = d; lines.splice(0, 2, a, b); } }
    }
    const longest = Math.max(...lines.map(l => l.length)), size = Math.min(0.3 * CH, (0.9 * CW) / (longest * 0.62));
    g.font = `500 ${size}px "Plex Mono", ui-monospace, Menlo, Consolas, monospace`;
    const cx = x0 + CW / 2, lh = size * 1.12, top = y0 + CH / 2 - (lines.length - 1) * lh / 2;
    lines.forEach((l, k) => {
      g.fillStyle = 'rgba(28,32,30,0.20)'; g.fillText(l, cx + 1.5 * scale, top + k * lh + 1.5 * scale);   // a hint of depth
      g.fillStyle = 'rgba(226,232,226,0.48)'; g.fillText(l, cx, top + k * lh);
    });
    // a few thin runs of paint under the writing
    let seed = (i + 1) * 7919;
    const r = () => ((seed = (seed * 1664525 + 1013904223) >>> 0) / 4294967296);
    g.fillStyle = 'rgba(224,230,224,0.24)';
    for (let d = 0; d < 3; d++) g.fillRect(cx + (r() - 0.5) * longest * size * 0.55, top + (lines.length - 0.5) * lh, Math.max(1, scale * 1.6), (6 + r() * 14) * scale);
  });
}
function makeGraffiti(quality) {
  const scale = quality === 'high' ? 1 : 0.5, cols = 2, rows = Math.ceil(GRAFFITI.length / cols);
  const canvas = document.createElement('canvas'); canvas.width = 512 * scale * cols; canvas.height = 128 * scale * rows;
  drawGraffiti(canvas, scale);
  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace; tex.anisotropy = 4;
  document.fonts?.load('500 40px "Plex Mono"').then(() => { drawGraffiti(canvas, scale); tex.needsUpdate = true; }).catch(() => {});
  const pos = [], uv = [], nrm = [], idx = [];
  const { w, h, y } = GRAFFITI_SIZE;
  GRAFFITI.forEach((item, i) => {
    const s = graffitiSpot(item), rx = s.nz, rz = -s.nx, base = pos.length / 3;
    const cx = s.x + s.nx * 0.03, cz = s.z + s.nz * 0.03;
    const u0 = (i % cols) / cols, u1 = u0 + 1 / cols, v1 = 1 - Math.floor(i / cols) / rows, v0 = v1 - 1 / rows;
    for (const [k, vy] of [[-1, y - h / 2], [1, y - h / 2], [1, y + h / 2], [-1, y + h / 2]]) {
      pos.push(cx + rx * k * w / 2, vy, cz + rz * k * w / 2); nrm.push(s.nx, 0, s.nz);
    }
    uv.push(u0, v0, u1, v0, u1, v1, u0, v1);
    idx.push(base, base + 1, base + 2, base, base + 2, base + 3);
  });
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  geo.setAttribute('normal', new THREE.Float32BufferAttribute(nrm, 3));
  geo.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  geo.setIndex(idx);
  const mat = new THREE.MeshStandardMaterial({ map: tex, transparent: true, depthWrite: false, roughness: 0.95, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2 });
  const mesh = new THREE.Mesh(geo, mat);
  mesh.renderOrder = 1;
  mesh.frustumCulled = false;
  return mesh;
}

// ---- the tourist --------------------------------------------------------------------------------------------------
function makeTourist(quality) {
  const JACKET = 0xc8b88a, TROUSER = 0x6b6a5e, SKIN = 0xe0b99a, CAP = 0xb4331c, CAMERA = 0x2a2d2b, LENS = 0x7f8a95;
  const body = merged([
    piece(BOX(0.44, 0.62, 0.27), JACKET, { y: 1.12 }),                                                  // jacket
    piece(BOX(0.46, 0.18, 0.29), TROUSER, { y: 0.82 }),                                                 // belt line, trousers
    piece(BOX(0.1, 0.1, 0.42), JACKET, { x: 0.2, y: 1.28, z: 0.2 }), piece(BOX(0.1, 0.1, 0.42), JACKET, { x: -0.2, y: 1.28, z: 0.2 }),   // arms out to the camera
    piece(BOX(0.22, 0.14, 0.1), CAMERA, { y: 1.5, z: 0.4 }), piece(CYL(0.045, 0.08, 8), LENS, { y: 1.5, z: 0.47, rx: Math.PI / 2 }),
    piece(SPHERE(0.125), SKIN, { y: 1.6 }),                                                             // head
    piece(SPHERE(0.13), CAP, { y: 1.65, sy: 0.7 }), piece(BOX(0.2, 0.025, 0.14), CAP, { y: 1.62, z: 0.14 }),   // cap and peak
  ]);
  const legGeo = merged([piece(BOX(0.16, 0.8, 0.2), TROUSER, { y: -0.4 })]);   // hangs from the hip, so it swings from there
  const mat = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.85 });
  const g = new THREE.Group(), rig = new THREE.Group();
  const bodyMesh = new THREE.Mesh(body, mat);
  rig.add(bodyMesh);
  const legs = [-0.1, 0.1].map(x => { const l = new THREE.Mesh(legGeo, mat); l.position.set(x, 0.8, 0); rig.add(l); return l; });
  g.add(rig);
  g.visible = false;
  g.userData = { rig, legs, swing: quality === 'high' };
  return g;
}

// ---- all of it ----------------------------------------------------------------------------------------------------
export function createProps(scene, quality = 'high') {
  const chicken = makeChicken(), graffiti = makeGraffiti(quality), tourist = makeTourist(quality), arrow = makeArrow(quality);
  scene.add(chicken, graffiti, tourist, arrow);
  let hop = -1;   // seconds into the chicken's hop (cluck), or -1
  return {
    chicken, graffiti, tourist, arrow,
    // the chicken clucks: a short hop and a ruffle
    cluck() { hop = 0; },
    // call every frame. pose: touristAt(...) for the round clock, or null. dt: seconds.
    update(pose, dt) {
      if (hop >= 0) {
        hop += dt;
        const k = hop / 1.1, up = k < 1 ? Math.abs(Math.sin(k * Math.PI * 3)) * 0.3 * (1 - k) : 0;
        chicken.children[0].position.y = up;
        chicken.children[0].rotation.z = k < 1 ? Math.sin(hop * 38) * 0.05 * (1 - k) : 0;
        if (k >= 1) hop = -1;
      }
      const t = tourist, u = t.userData;
      if (!pose || pose.scale <= 0.01) { t.visible = false; return; }
      t.visible = true;
      t.position.set(pose.x, 0, pose.z);
      t.rotation.y = pose.yaw;
      t.scale.setScalar(Math.max(0.01, pose.scale));
      const phase = pose.d / 0.7 * Math.PI, walking = pose.photo < 0;
      if (u.swing) { u.legs[0].rotation.x = walking ? Math.sin(phase) * 0.55 : 0; u.legs[1].rotation.x = walking ? -Math.sin(phase) * 0.55 : 0; }
      u.rig.position.y = walking ? Math.abs(Math.sin(phase)) * 0.03 : 0;
      u.rig.rotation.x = walking ? 0 : -0.12 * Math.sin(Math.min(1, pose.photo * 4) * Math.PI / 2);   // leans back to take the picture
    },
    setQuality(q) {
      tourist.userData.swing = q === 'high';
      if (q !== 'high') for (const l of tourist.userData.legs) l.rotation.x = 0;
    },
  };
}

// ---- sweat on the hider's bobblehead (the last ten seconds) -----------------------------------------------------------
// Three pale drops running down the front of the head. They belong to the tank (so they hide with it, fade with it and take the
// smog with it) and stay inside its outline, so they can never show through a wall or tell the hunter anything.
const DROP = new THREE.SphereGeometry(0.07, 8, 6);
export function setSweat(tank, on, t = 0) {
  const u = tank.userData;
  if (on && !u.head) return;
  if (!on) {
    if (u.sweat) { for (const d of u.sweat) tank.remove(d); u.mats = u.mats.filter(m => m !== u.sweatMat); u.sweatMat.dispose(); u.sweat = u.sweatMat = null; }
    return;
  }
  if (!u.sweat) {
    u.sweatMat = new THREE.MeshStandardMaterial({ color: 0x86c4ff, roughness: 0.2, metalness: 0 });
    u.mats.push(u.sweatMat);
    u.sweat = [0, 1, 2].map(i => { const m = new THREE.Mesh(DROP, u.sweatMat); m.userData.noGhost = true; m.scale.set(1, 1.5, 1); tank.add(m); return m; });
    if (u.fade < 1) { u.sweatMat.transparent = true; u.sweatMat.opacity = u.fade; }
  }
  const s = u.figSize || 1, fig = u.head.parent;   // the figure's group is turned round to face the camera (models.js), so find the neck in the tank's own frame
  fig.updateMatrix();
  const neck = u.head.position.clone().applyMatrix4(fig.matrix);
  u.sweat.forEach((d, i) => {
    const k = ((t * 1.1 + i / 3) % 1);   // each drop runs down its own side of the face, then starts again
    d.position.set(neck.x + (i - 1) * 0.17 * s, neck.y + (0.62 - k * 0.5) * s, neck.z - 0.3 * s);
    d.visible = k < 0.95;
  });
}
