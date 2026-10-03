// Fake industrial fans on the wall tops: a square box fan in a steel frame, standing on two feet on top of a wall, its five blades turning slowly
// (one turn in 5 s). Six of them: four on the long walls round the plaza (mirrored like the map) and two on the outer wall, mid-west and mid-east.
// Cosmetic only. Nothing reads them: not the sight rule, the hits, the map checker, the corner map or the aim assist. They stand on the wall
// tops inside the wall's own footprint, the frame starting 0.35 m above the top (4.85 m on an inner wall, 7.35 m on the outer wall), and the
// camera never goes above 4.1 m, so no view line or shot (1.55 m) can reach them. They throw no shadows and make no sound.
// Cheap on phones: all frames are one merged mesh, all blades one instanced mesh (6 matrices a frame); the grilles are a third mesh on High.
// Low graphics: no grilles and the blades stand still.
import * as THREE from '../lib/three.module.js';
import { mergeGeometries } from '../lib/utils/BufferGeometryUtils.js';
import { cellX, cellZ, COLS, WALL_H, EDGE_H } from './world.js';
import { CELL } from './map.js';

export const FAN = { size: 2.4, depth: 0.6, feet: 0.35, turn: 5 };   // frame size and depth (m), feet height (m), seconds per turn
const top = (r, c, y) => ({ x: cellX(c) + CELL / 2, z: cellZ(r) + CELL / 2, y });
// where: on top of a wall square; axis 'z' = the blades face north / south (the wall runs east-west), 'x' = they face east / west
export const FANS = [
  { ...top(6, 19, WALL_H), axis: 'z' }, { ...top(6, 28, WALL_H), axis: 'z' },
  { ...top(25, 19, WALL_H), axis: 'z' }, { ...top(25, 28, WALL_H), axis: 'z' },
  { x: cellX(0) + CELL / 2, z: 0, y: EDGE_H, axis: 'x' }, { x: cellX(COLS - 1) + CELL / 2, z: 0, y: EDGE_H, axis: 'x' },
];
export const fanBottom = f => f.y + FAN.feet;   // the frame's lowest edge (the feet stand on the wall top)

export function createFans(scene, quality = 'high') {
  const S = FAN.size, D = FAN.depth, F = FAN.feet, hubY = F + S / 2;
  const steel = new THREE.MeshStandardMaterial({ color: 0x5c625f, roughness: 0.55, metalness: 0.6 });
  const dark = new THREE.MeshStandardMaterial({ color: 0x23272a, roughness: 0.7, metalness: 0.4 });
  const blade = new THREE.MeshStandardMaterial({ color: 0x8b918d, roughness: 0.5, metalness: 0.5, side: THREE.DoubleSide });
  const box = (w, h, d, x, y, z) => new THREE.BoxGeometry(w, h, d).translate(x, y, z);
  // one fan's parts in its own frame (x along the wall, y up, the blades facing +z / -z), then placed and merged
  const frameParts = () => [
    box(0.3, F, 1.4, -S / 2 + 0.3, F / 2, 0), box(0.3, F, 1.4, S / 2 - 0.3, F / 2, 0),                    // feet
    box(S, 0.16, D, 0, F + 0.08, 0), box(S, 0.16, D, 0, F + S - 0.08, 0),                                   // frame, bottom and top
    box(0.16, S, D, -S / 2 + 0.08, hubY, 0), box(0.16, S, D, S / 2 - 0.08, hubY, 0),                        // frame, sides
    new THREE.TorusGeometry(1.02, 0.07, 4, 20).translate(0, hubY, D / 2 - 0.05),                             // the ring round the blades
    new THREE.TorusGeometry(1.02, 0.07, 4, 20).translate(0, hubY, -D / 2 + 0.05),
  ];
  const grilleParts = () => Array.from({ length: 7 }, (_, i) => box(0.04, S - 0.3, 0.04, (i - 3) * 0.3, hubY, D / 2 + 0.02));
  const place = (f, g) => { const m = new THREE.Matrix4().makeRotationY(f.axis === 'x' ? Math.PI / 2 : 0).setPosition(f.x, f.y, f.z); return g.applyMatrix4(m); };
  const merged = (parts, mat) => {
    const geos = FANS.flatMap(f => parts().map(g => { const n = g.index ? g.toNonIndexed() : g; if (n !== g) g.dispose(); n.deleteAttribute('uv'); return place(f, n); }));
    const mesh = new THREE.Mesh(mergeGeometries(geos), mat);
    geos.forEach(g => g.dispose());
    mesh.matrixAutoUpdate = false;
    return mesh;
  };
  const frames = merged(frameParts, steel), grilles = merged(grilleParts, dark);
  // the blades: a hub and five blades, one instance per fan, turned about its own axis each frame
  const rotorParts = [new THREE.CylinderGeometry(0.18, 0.18, 0.3, 12).rotateX(Math.PI / 2)];
  for (let i = 0; i < 5; i++) rotorParts.push(new THREE.BoxGeometry(0.34, 0.95, 0.04).rotateY(0.45).translate(0, 0.55, 0).rotateZ(i * Math.PI * 2 / 5));
  const rotorGeo = mergeGeometries(rotorParts.map(g => { const n = g.toNonIndexed(); g.dispose(); n.deleteAttribute('uv'); return n; }));
  const rotors = new THREE.InstancedMesh(rotorGeo, blade, FANS.length);
  rotors.frustumCulled = false;   // the instances are spread over the whole yard
  const base = FANS.map(f => new THREE.Matrix4().makeRotationY(f.axis === 'x' ? Math.PI / 2 : 0).setPosition(f.x, f.y + hubY, f.z));
  const spin = new THREE.Matrix4(), m = new THREE.Matrix4();
  let moving = true;
  const turn = t => FANS.forEach((f, i) => { rotors.setMatrixAt(i, m.multiplyMatrices(base[i], spin.makeRotationZ(t * Math.PI * 2 / FAN.turn + i * 1.3))); rotors.instanceMatrix.needsUpdate = true; });
  turn(0);
  for (const o of [frames, grilles, rotors]) { o.castShadow = false; o.receiveShadow = false; }
  scene.add(frames, grilles, rotors);
  const setQuality = q => { moving = q === 'high'; grilles.visible = moving; };
  setQuality(quality);
  return {
    parts: [frames, grilles, rotors],
    update(t) { if (moving) turn(t); },
    setQuality,
    get moving() { return moving; },
  };
}
