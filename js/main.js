// Tank Battle: game start-up and main loop.
import * as THREE from '../lib/three.module.js';
import { buildArena } from './arena.js';
import { makeTank, driveTank, separateTanks, COLORS } from './tank.js';
import { makeChaseCamera } from './camera.js';
import { readInput, clearTaps, setInputEnabled } from './input.js';
import { initScreen, device } from './screen.js';
import { SPAWNS, ROWS, COLS, isWallCell, WIDTH, DEPTH } from './world.js';

const DEBUG = new URLSearchParams(location.search).has('debug');
const $ = id => document.getElementById(id);

const renderer = new THREE.WebGLRenderer({ canvas: $('c'), antialias: true, powerPreference: 'high-performance' });
renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFShadowMap;
const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(55, 1, 0.1, 160);
buildArena(scene);

function place(tank, spawn) {
  tank.position.set(spawn.x, 0, spawn.z);
  tank.rotation.y = spawn.yaw;
  tank.userData.speed = 0;
}
const player = makeTank(COLORS.hunter);
const other = makeTank(COLORS.hider);   // parked stand-in for the second player until Stage 1c
place(player, SPAWNS[0]);
place(other, SPAWNS[1]);
scene.add(player, other);

const follow = makeChaseCamera(camera);

function resize() {
  const w = innerWidth, h = innerHeight;
  renderer.setSize(w, h, false);
  camera.aspect = w / h;
  camera.updateProjectionMatrix();
}
addEventListener('resize', resize);
resize();

// Debug-only top-down map (add ?debug to the address). Never shown in a real match.
let drawMinimap = () => {};
if (DEBUG) {
  const mm = $('minimap'), g = mm.getContext('2d'), k = 2;
  mm.width = COLS * 4 * k; mm.height = ROWS * 4 * k; mm.hidden = false;
  const dot = (t, col) => {
    const x = (t.position.x / WIDTH + 0.5) * mm.width, y = (t.position.z / DEPTH + 0.5) * mm.height;
    g.fillStyle = col; g.beginPath(); g.arc(x, y, 5 * k, 0, 7); g.fill();
    g.strokeStyle = col; g.lineWidth = 2 * k; g.beginPath(); g.moveTo(x, y);
    g.lineTo(x + Math.sin(t.rotation.y) * 12 * k, y + Math.cos(t.rotation.y) * 12 * k); g.stroke();
  };
  const walls = document.createElement('canvas');   // draw the walls once, reuse every frame
  walls.width = mm.width; walls.height = mm.height;
  const wg = walls.getContext('2d');
  wg.fillStyle = '#1a201e'; wg.fillRect(0, 0, mm.width, mm.height);
  wg.fillStyle = '#6b766f';
  for (let r = 0; r < ROWS; r++) for (let c = 0; c < COLS; c++) if (isWallCell(r, c)) wg.fillRect(c * 4 * k, r * 4 * k, 4 * k, 4 * k);
  drawMinimap = () => {
    g.drawImage(walls, 0, 0);
    dot(player, '#ff7a1a'); dot(other, '#2f7bff');
  };
}

// Phone screen handling: input only reaches the tank while actually playing (not on the start screen,
// rotate message or leave prompt).
initScreen(setInputEnabled);
if (device.ipad) $('rotate-1').textContent = 'Turn your iPad sideways.';

// TEMPORARY (Stage 1b only): switch between the hunter's FIRE button and the hider's SPRINT button.
// Real roles, firing and the sprint meter arrive in Stage 1d, which removes this switch.
let role = 'hunter';
function setRole(r) {
  role = r;
  document.documentElement.dataset.role = r;
  $('role').querySelector('span').textContent = r === 'hunter' ? 'Hunter' : 'Hider';
  $('action').querySelector('span').textContent = r === 'hunter' ? 'FIRE' : 'SPRINT';
  player.traverse(m => { if (m.material?.color && m.material.color.getHex() === COLORS[r === 'hunter' ? 'hider' : 'hunter']) m.material.color.setHex(COLORS[r]); });
  other.traverse(m => { if (m.material?.color && m.material.color.getHex() === COLORS[r]) m.material.color.setHex(COLORS[r === 'hunter' ? 'hider' : 'hunter']); });
}
$('role').addEventListener('click', () => setRole(role === 'hunter' ? 'hider' : 'hunter'));
setRole('hunter');
let taps = 0;   // action presses so far (testing only)

let last = performance.now();
renderer.setAnimationLoop(now => {
  const dt = Math.min(0.05, (now - last) / 1000);
  last = now;
  const inp = readInput();
  taps += inp.actionTaps;
  clearTaps();
  driveTank(player, inp, dt);
  separateTanks(player, other);
  follow(player, dt);
  renderer.render(scene, camera);
  drawMinimap();
});

window.__tb = { THREE, scene, camera, renderer, player, other, place, SPAWNS, get taps() { return taps; } };   // for testing only
