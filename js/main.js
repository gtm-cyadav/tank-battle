// Tank Battle: game start-up and main loop.
import * as THREE from '../lib/three.module.js';
import { buildArena, LOOKS } from './arena.js';
import { makeTank, driveTank, separateTanks, COLORS, DRIVE } from './tank.js';
import { makeChaseCamera } from './camera.js';
import { readInput, clearTaps, setInputEnabled } from './input.js';
import { initScreen, refreshScreen, device } from './screen.js';
import { settings, onSettings, initSettings } from './settings.js';
import { SPAWNS, ROWS, COLS, isWallCell, WIDTH, DEPTH } from './world.js';

const DEBUG = new URLSearchParams(location.search).has('debug');
const $ = id => document.getElementById(id);

const renderer = new THREE.WebGLRenderer({ canvas: $('c'), antialias: true, powerPreference: 'high-performance' });
renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFShadowMap;
const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(55, 1, 0.1, 160);
// Overcast is the default look. ?look=sunny shows the old sunny version (testing only, until the Stage 2 weather setting).
const LOOK = new URLSearchParams(location.search).get('look');
buildArena(scene, LOOK in LOOKS ? LOOK : 'overcast');

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
onSettings(s => follow.set(s.camHeight, s.camDistance));

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
initSettings(refreshScreen);
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

// Turn the player's input into throttle and turn for the tank.
// Point-to-drive: "up" means the way the camera faced when this push began (thumb down, or back out of the
// centre); the tank turns to the pushed direction and then holds it exactly, so it drives dead straight.
const SNAP = 0.21;   // pushes within about 12 degrees of straight up count as straight up
const HOLD = 0.06;   // thumb wobbles smaller than about 3 degrees don't change the heading
const drive = { throttle: 0, turn: 0 };
let aimRef = 0, aimLast = 0;
function steer(inp, dt) {
  const turnMul = settings.turnSpeed / 100;
  if (!inp.aim || dt <= 0) {
    drive.throttle = inp.throttle;
    drive.turn = inp.turn * turnMul;
    return drive;
  }
  let a = Math.abs(inp.aim.angle) < SNAP ? 0 : inp.aim.angle;
  if (inp.aimNew) aimRef = follow.yaw() ?? player.rotation.y;
  else if (Math.abs(a - aimLast) < HOLD) a = aimLast;
  aimLast = a;
  const target = aimRef - a;   // stick right = heading to the right = smaller yaw
  const diff = Math.atan2(Math.sin(target - player.rotation.y), Math.cos(target - player.rotation.y));
  // exactly the turn needed to land on the target this frame, but never faster than the turning speed setting
  drive.turn = Math.max(-turnMul, Math.min(turnMul, -diff / (DRIVE.turn * dt)));
  // slow down for sharp turns (turns on the spot when facing away, e.g. pulling the stick down = turn round)
  drive.throttle = inp.aim.strength * Math.max(0, Math.cos(diff));
  return drive;
}

function frame(dt, draw = true) {
  const inp = readInput();
  taps += inp.actionTaps;
  clearTaps();
  driveTank(player, steer(inp, dt), dt);
  separateTanks(player, other);
  follow(player, dt);
  if (!draw) return;
  renderer.render(scene, camera);
  drawMinimap();
}
let last = performance.now();
renderer.setAnimationLoop(now => {
  const dt = Math.min(0.05, (now - last) / 1000);
  last = now;
  frame(dt);
});

window.__tb = { THREE, scene, camera, renderer, player, other, place, SPAWNS, follow, settings, get taps() { return taps; },
  step(n = 1, dt = 1 / 60) { for (let i = 0; i < n; i++) frame(dt, i === n - 1); } };   // for testing only
