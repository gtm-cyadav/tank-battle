// Tank Battle: game start-up and main loop.
import * as THREE from '../lib/three.module.js';
import { buildArena, LOOKS } from './arena.js';
import { makeTank, driveTank, blockByTank, paintTank, COLORS, DRIVE, TANK_RADIUS } from './tank.js';
import { makeChaseCamera } from './camera.js';
import { readInput, clearTaps, setInputEnabled } from './input.js';
import { initScreen, refreshScreen, device } from './screen.js';
import { initLobby, leaveMatch, sendState, toast } from './lobby.js';
import { createRules, RULES } from './rules.js';
import { createShots } from './shots.js';
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

let taps = 0;   // action presses so far (testing only)

// ---- two players (Stage 1c) ----------------------------------------------------------------------------------
// mode: 'solo' (drive alone, parked tank) | 'host' (created the room, starts top-left) | 'guest' (joined, bottom-right).
// Hunter or hider comes from the match rules (js/rules.js); when driving alone the player picks.
let mode = 'solo';
let soloRole = 'hunter';
const remote = { x: 0, z: 0, yaw: 0, speed: 0, at: 0, have: false, paused: false };
let sendClock = 0;
const SEND_EVERY = 0.05;   // 20 position updates a second

function startMatch({ mode: m, code, pos, match, role }) {
  mode = m;
  soloRole = role || 'hunter';
  const me = mode === 'guest' ? 1 : 0;
  place(player, pos || SPAWNS[me]);
  place(other, SPAWNS[1 - me]);
  follow.reset();
  freshRound();
  $('hud-room').textContent = code ? `Room ${code}` : '';
  $('leave-p').textContent = mode === 'solo' ? "You'll go back to the start screen." : 'The other player will be told you left.';
  Object.assign(remote, { have: false, paused: false });
  other.visible = mode === 'solo';   // the other tank appears with its first position update
  sendClock = 0;
  if (mode === 'solo') { rules.stop(); delete root.dataset.match; }
  else { root.dataset.match = ''; restoring = !!pos; rules.start(mode, match || null); }
  showRoles(rules.match && rules.match.phase !== 'play' && rules.match.phase !== 'toss' && rules.match.result?.how === 'hit');
}
function endMatch() {
  mode = 'solo';
  rules.stop();
  freshRound();
  delete root.dataset.match;
  $('hud-room').textContent = '';
}
function onRemote(m) {
  if (mode === 'solo' || rules.onMessage(m)) return;
  if (m.t === 'f') { incoming(m); return; }
  if (m.t !== 's') return;
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

// ---- the rules: roles, firing, sprint, rounds (Stage 1d) -----------------------------------------------------
const root = document.documentElement;
const rules = createRules({ send: sendState, changed: phaseChanged });
const shots = createShots(scene);
let restoring = false;     // carrying on after a refresh: leave the tanks where they were until the match moves on
let reload = 0;            // hunter: seconds until the next shot
let meter = 1;             // hider: sprint meter, 0 (empty) to 1 (full)
let spent = false;         // hider: the meter ran dry while the button was held; let go to sprint again
let sprinting = false;
let shotId = 0;
let soloWreck = 0;         // drive alone: seconds the practice tank stays wrecked after a hit
const opposite = role => role === 'hunter' ? 'hider' : 'hunter';

const myRole = () => mode === 'solo' ? soloRole : (rules.role() || (mode === 'guest' ? 'hider' : 'hunter'));
const inPlay = () => mode === 'solo' || (rules.match?.phase === 'play' && !rules.paused);
function freshRound() {
  shots.clear();
  reload = 0; meter = 1; spent = false; sprinting = false; soloWreck = 0;
}
// colours and the button label follow the role; wreckHider: the hider was hit this round
function showRoles(wreckHider = false) {
  const me = myRole(), them = opposite(me);
  root.dataset.role = me;
  $('action').querySelector('span').textContent = me === 'hunter' ? 'FIRE' : 'SPRINT';
  paintTank(player, COLORS[me], wreckHider && me === 'hider');
  paintTank(other, COLORS[them], wreckHider && them === 'hider');
}
// The referee moved the match on (coin toss, new round, round over, rematch). Runs on both phones.
function phaseChanged(m, before) {
  if (!m) return;
  const fresh = m.phase === 'toss' || m.phase === 'play';
  if (before) restoring = false;
  if (fresh && !restoring) {   // back to the starting corners
    const me = mode === 'guest' ? 1 : 0;
    place(player, SPAWNS[me]);
    place(other, SPAWNS[1 - me]);
    follow.reset();
  }
  if (fresh) freshRound();
  showRoles(!fresh && m.result?.how === 'hit');
  if (before && m.phase === 'play' && before.phase !== 'play') toast(`Round ${m.round}. You are the ${myRole()}.`);
}

function tryFire() {
  const m = rules.match;
  if (reload > 0 || !inPlay()) return;
  if (mode !== 'solo' && (m.t < RULES.headStart || m.t >= RULES.round)) return;
  const shot = { id: ++shotId, x: player.position.x, z: player.position.z, yaw: player.rotation.y };
  shots.fire(shot);
  reload = RULES.reload;
  if (mode !== 'solo') sendState({ t: 'f', mid: m.mid, r: m.round, e: m.t, id: shot.id, x: shot.x, z: shot.z, y: shot.yaw });
}
// A shot from the hunter's phone. It was fired a moment ago over there, so it starts that far along
// (at most half a second: after a longer hiccup the shot is shown late rather than jumping far ahead).
function incoming(f) {
  const m = rules.match;
  if (!m || m.phase !== 'play' || f.mid !== m.mid || f.r !== m.round || myRole() !== 'hider') return;
  shots.fire({ id: f.id, x: f.x, z: f.z, yaw: f.y }, Math.min(0.5, Math.max(0, m.t - f.e)));
}
// The tank a bullet can hit on this phone: only ever the hider's, never the hunter's.
// On the hider's phone that's its own tank, and only that phone's hits count (it knows exactly where it is).
function hiderTank() {
  const m = rules.match;
  if (mode === 'solo') return soloRole === 'hunter' && soloWreck <= 0 ? other : null;
  if (!m || m.phase !== 'play' || m.t >= RULES.round) return null;   // after 0:00 nothing can be hit
  return myRole() === 'hider' ? player : (other.visible ? other : null);
}
// Sprint: 50% faster while held and driving forward; a full meter lasts 3 s and refills in 6 s.
function sprint(inp, dt) {
  if (myRole() !== 'hider') return 1;
  if (!inp.action) spent = false;
  sprinting = inp.action && !spent && meter > 0 && inPlay() && drive.throttle > 0.05;
  if (sprinting) {
    meter = Math.max(0, meter - dt / RULES.sprintTime);
    if (meter === 0) spent = true;
  } else meter = Math.min(1, meter + dt / RULES.refill);
  return sprinting ? RULES.sprintBoost : 1;
}

// ---- round display, action button ring, and the coin toss / result / match over card -------------------------
const text = (id, v) => { const el = $(id); if (el.textContent !== v) el.textContent = v; };
const show = (id, on) => { const el = $(id); if (el.hidden !== on) return false; el.hidden = !on; return true; };
const clock = secs => { const s = Math.max(0, Math.ceil(secs - 1e-6)); return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`; };
let ringP = -1, btnOff = null;
function drawRound() {
  const m = rules.match, me = rules.side, them = me === 'host' ? 'guest' : 'host';
  // the button's ring: reload for FIRE, the sprint meter for SPRINT; greyed out when it can't be used
  const hunter = myRole() === 'hunter';
  const p = hunter ? 1 - reload / RULES.reload : meter;
  const off = hunter ? !(inPlay() && reload <= 0 && (mode === 'solo' || (m.t >= RULES.headStart && m.t < RULES.round))) : spent || meter <= 0 || !inPlay();
  if (Math.abs(p - ringP) > 0.004) { ringP = p; $('action').querySelector('.ring').style.setProperty('--p', p.toFixed(3)); }
  if (off !== btnOff) { btnOff = off; $('action').classList.toggle('off', off); }

  let blockChanged = false;
  show('rh', !!m);
  if (!m) { if (show('round', false)) { delete root.dataset.card; refreshScreen(); } return; }
  const role = myRole(), left = m.phase === 'play' ? RULES.round - m.t : m.result && m.phase !== 'toss' ? m.result.left : RULES.round;
  text('rh-role', role === 'hunter' ? 'Hunter' : 'Hider');
  text('rh-clock', clock(left));
  $('rh-clock').classList.toggle('low', m.phase === 'play' && left <= 10);
  text('rh-round', `Round ${m.round}`);
  text('rh-score', `You ${m.score[me]} – ${m.score[them]} Them`);
  // after a hit, a short beat to see the wreck before the card covers it
  const beat = (m.phase === 'break' || m.phase === 'over') && m.result?.how === 'hit' && m.t < 1.2;
  const wait = Math.ceil(RULES.headStart - m.t - 1e-6);
  text('rh-note', m.phase === 'play' && wait > 0 ? (role === 'hunter' ? `You can fire in ${wait} s.` : `The hunter can fire in ${wait} s.`)
    : beat ? (role === 'hunter' ? 'Direct hit.' : 'You were hit.') : '');

  const card = m.phase !== 'play' && !beat;
  blockChanged = show('round', card);
  if (blockChanged) { if (card) root.dataset.card = ''; else delete root.dataset.card; }
  if (card) {
    const r = m.result, won = r && r.win === me, iHunted = rules.hunterSide() === me;
    const how = !r ? '' : r.how === 'hit'
      ? (iHunted ? `Direct hit with ${clock(r.left)} left.` : `You were hit with ${clock(r.left)} left.`)
      : (iHunted ? 'Time ran out. No hit.' : `You stayed hidden for the full ${clock(RULES.round)}.`);
    const score = `Score: you ${m.score[me]}, them ${m.score[them]}.`;
    if (m.phase === 'toss') {
      text('rc-over', 'Coin toss');
      text('rc-t', iHunted ? 'You hunt first.' : 'You hide first.');
      text('rc-p', iHunted ? `The other player hides. They get a ${RULES.headStart}-second head start.` : `The other player hunts. You get a ${RULES.headStart}-second head start.`);
      text('rc-score', 'Best of 3. Roles swap every round.');
      text('rc-count', `Round 1 starts in ${Math.max(1, Math.ceil(RULES.toss - m.t))} s.`);
    } else if (m.phase === 'break') {
      text('rc-over', `Round ${m.round}`);
      text('rc-t', won ? 'You win the round.' : 'They win the round.');
      text('rc-p', how);
      text('rc-score', score);
      text('rc-count', `Round ${m.round + 1} starts in ${Math.max(1, Math.ceil(RULES.next - m.t))} s. You ${iHunted ? 'hide' : 'hunt'}.`);
    } else {
      text('rc-over', 'Match over');
      text('rc-t', won ? 'You win the match.' : 'They win the match.');
      text('rc-p', `Round ${m.round}: ${how.charAt(0).toLowerCase()}${how.slice(1)}`);
      text('rc-score', score);
      text('rc-count', m.again[me] ? 'Waiting for the other player.' : m.again[them] ? 'The other player wants to play again.' : '');
    }
    show('rc-buttons', m.phase === 'over');
    $('rc-again').disabled = !!m.again[me];
  }
  if (blockChanged) refreshScreen();   // the card stops the controls while it shows
}
$('rc-again').addEventListener('click', () => rules.playAgain());
$('rc-leave').addEventListener('click', leaveMatch);

initLobby({
  start: startMatch,
  end: endMatch,
  finish() { rules.stop(); shots.clear(); drawRound(); },   // the match ended early; the lobby shows why
  remote: onRemote,
  paused(on) { remote.paused = on; if (on) remote.speed = 0; rules.pause(on); },
  pos: () => ({ x: player.position.x, z: player.position.z, yaw: player.rotation.y }),
  snapshot: () => rules.snapshot(),
  over: () => rules.match?.phase === 'over',
  // the score when a match ends early: "Score at the time: you 1, them 0."
  summary() {
    const m = rules.match, me = rules.side, them = me === 'host' ? 'guest' : 'host';
    return m ? `Score at the time: you ${m.score[me]}, them ${m.score[them]}.` : '';
  },
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

// dt: the game step (capped, so a hiccup can't carry a tank through a wall). clockDt: real time passed, for the
// round clock, so a slow phone's clock doesn't fall behind.
function frame(dt, draw = true, clockDt = dt) {
  const inp = readInput();
  taps += inp.actionTaps;
  reload = Math.max(0, reload - dt);
  if (inp.actionTaps > 0 && myRole() === 'hunter') tryFire();
  clearTaps();
  const before = { x: player.position.x, z: player.position.z };
  const d = steer(inp, dt);
  if (mode !== 'solo' && rules.match?.phase !== 'play') { d.throttle = 0; d.turn = 0; }   // tanks wait between rounds
  d.boost = sprint(inp, dt);
  driveTank(player, d, dt);
  moveOther(dt);
  if (other.visible) blockByTank(player, other, before, dt);
  // bullets before the clock: a hit in the same instant the clock reaches 0:00 still counts
  const hit = shots.update(dt, hiderTank());
  if (hit && mode === 'solo') { soloWreck = 1.5; paintTank(other, COLORS.hider, true); toast('Hit.'); }
  else if (hit && myRole() === 'hider') rules.reportHit(rules.match.t);   // the hider's phone tells the referee
  if (soloWreck > 0 && (soloWreck -= dt) <= 0) paintTank(other, COLORS.hider);
  rules.tick(clockDt);
  follow(player, dt);
  sendMine(dt);
  if (!draw) return;
  drawRound();
  renderer.render(scene, camera);
  drawMinimap();
}
let last = performance.now();
renderer.setAnimationLoop(now => {
  const real = Math.min(1, (now - last) / 1000);
  last = now;
  frame(Math.min(0.05, real), true, real);
});

window.__tb = { THREE, scene, camera, renderer, player, other, place, SPAWNS, follow, settings, remote, rules, shots, RULES,   // for testing only
  get mode() { return mode; }, get taps() { return taps; }, get role() { return myRole(); },
  get meter() { return meter; }, get reload() { return reload; }, get sprinting() { return sprinting; },
  // stepped frames stand in for real ones, so the next real frame doesn't count that time again
  step(n = 1, dt = 1 / 60) { for (let i = 0; i < n; i++) frame(dt, i === n - 1); last = performance.now(); } };
