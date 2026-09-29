// Tank Battle: game start-up and main loop.
import * as THREE from '../lib/three.module.js';
import { buildArena, LOOKS } from './arena.js';
import { makeTank, driveTank, blockByTank, COLORS, DRIVE, TANK_RADIUS } from './tank.js';
import { makeChaseCamera } from './camera.js';
import { readInput, clearTaps, setInputEnabled } from './input.js';
import { initScreen, refreshScreen, device } from './screen.js';
import { initLobby, leaveMatch, sendState } from './lobby.js';
import { settings, onSettings, initSettings } from './settings.js';
import { SPAWNS, ROWS, COLS, isWallCell, WIDTH, DEPTH, pushOutOfWalls } from './world.js';

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
const other = makeTank(COLORS.hider);   // the other player's tank (parked, when driving alone)
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
initScreen(setInputEnabled, leaveMatch);
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

// ---- two players (Stage 1c) ----------------------------------------------------------------------------------
// mode: 'solo' (drive alone, parked tank) | 'host' (created the room: orange, top-left) | 'guest' (joined: blue).
// Real hunter/hider roles arrive in 1d; until then the room's creator gets the hunter's orange and FIRE button.
let mode = 'solo';
const remote = { x: 0, z: 0, yaw: 0, speed: 0, at: 0, have: false, paused: false };
let sendClock = 0;
const SEND_EVERY = 0.05;   // 20 position updates a second

function startMatch({ mode: m, code, pos }) {
  mode = m;
  const me = mode === 'guest' ? 1 : 0;
  place(player, pos || SPAWNS[me]);
  place(other, SPAWNS[1 - me]);
  follow.reset();
  setRole(mode === 'guest' ? 'hider' : 'hunter');
  $('role').hidden = mode !== 'solo';   // the test switch would make the two phones disagree
  $('hud-room').textContent = code ? ` · Room ${code}` : '';
  $('leave-p').textContent = mode === 'solo' ? "You'll go back to the start screen." : 'The other player will be told you left.';
  Object.assign(remote, { have: false, paused: false });
  other.visible = mode === 'solo';   // the other tank appears with its first position update
  sendClock = 0;
}
function endMatch() {
  mode = 'solo';
  $('role').hidden = false;
  $('hud-room').textContent = '';
}
function onRemote(m) {
  if (m.t !== 's' || mode === 'solo') return;
  Object.assign(remote, { x: m.x, z: m.z, yaw: m.y, speed: m.v, at: performance.now() });
  if (!remote.have) {   // first news of the other tank: put it straight there
    remote.have = true;
    other.position.set(m.x, 0, m.z);
    other.rotation.y = m.y;
    other.visible = true;
  }
}
// Show the other tank smoothly: guess a little ahead from its last known speed, then glide towards that.
function moveOther(dt) {
  if (mode === 'solo' || !remote.have) return;
  const ahead = remote.paused ? 0 : Math.min(0.2, (performance.now() - remote.at) / 1000);
  let tx = remote.x + Math.sin(remote.yaw) * remote.speed * ahead, tz = remote.z + Math.cos(remote.yaw) * remote.speed * ahead;
  // never guess it into our tank: near us, only trust where it really was (so a parked tank is never nudged)
  const me = player.position, guess = Math.hypot(tx - me.x, tz - me.z);
  if (guess < TANK_RADIUS * 2 && Math.hypot(remote.x - me.x, remote.z - me.z) >= guess) { tx = remote.x; tz = remote.z; }
  const p = other.position, ex = tx - p.x, ez = tz - p.z;
  if (Math.hypot(ex, ez) > 6) {   // too far off (e.g. after a rejoin): jump
    p.x = tx; p.z = tz; other.rotation.y = remote.yaw;
  } else {
    const k = 1 - Math.exp(-15 * dt), dy = Math.atan2(Math.sin(remote.yaw - other.rotation.y), Math.cos(remote.yaw - other.rotation.y));
    p.x += ex * k; p.z += ez * k; other.rotation.y += dy * k;
  }
  pushOutOfWalls(p, TANK_RADIUS);
}
function sendMine(dt) {
  if (mode === 'solo') return;
  sendClock += dt;
  if (sendClock < SEND_EVERY) return;
  sendClock = 0;
  const p = player.position, r = v => Math.round(v * 100) / 100;
  sendState({ t: 's', x: r(p.x), z: r(p.z), y: Math.round(player.rotation.y * 1000) / 1000, v: r(player.userData.speed) });
}
initLobby({
  start: startMatch,
  end: endMatch,
  remote: onRemote,
  paused(on) { remote.paused = on; if (on) remote.speed = 0; },
  pos: () => ({ x: player.position.x, z: player.position.z, yaw: player.rotation.y }),
});

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
  const before = { x: player.position.x, z: player.position.z };
  driveTank(player, steer(inp, dt), dt);
  moveOther(dt);
  if (other.visible) blockByTank(player, other, before, dt);
  follow(player, dt);
  sendMine(dt);
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

window.__tb = { THREE, scene, camera, renderer, player, other, place, SPAWNS, follow, settings, remote, get mode() { return mode; }, get taps() { return taps; },
  step(n = 1, dt = 1 / 60) { for (let i = 0; i < n; i++) frame(dt, i === n - 1); } };   // for testing only
