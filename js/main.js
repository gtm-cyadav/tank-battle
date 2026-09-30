// Tank Battle: game start-up and main loop.
import * as THREE from '../lib/three.module.js';
import { buildArena, useRenderer } from './arena.js';
import { makeTank, driveTank, blockByTank, paintTank, kick, settleBarrel, COLORS, DRIVE, TANK_RADIUS } from './tank.js';
import { makeChaseCamera } from './camera.js';
import { readInput, clearTaps, setInputEnabled } from './input.js';
import { initScreen, refreshScreen, device } from './screen.js';
import { initLobby, leaveMatch, sendState, toast } from './lobby.js';
import { VERSION } from './net.js';
import { createRules, RULES } from './rules.js';
import { createShots } from './shots.js';
import { settings, onSettings, initSettings } from './settings.js';
import { SPAWNS, ROWS, COLS, isWallCell, WIDTH, DEPTH, pushOutOfWalls } from './world.js';
import { smogAt, inSight, fade, VIEW } from './vision.js';
import { createCornerMap } from './cornermap.js';
import { createEffects } from './effects.js';
import { play, frame as soundFrame, setMuted, byDistance, soundState } from './sound.js';
import { WEATHERS, DEFAULT_WEATHER, weatherLine } from './weather.js';

const DEBUG = new URLSearchParams(location.search).has('debug');
const $ = id => document.getElementById(id);

const renderer = new THREE.WebGLRenderer({ canvas: $('c'), antialias: true, powerPreference: 'high-performance' });
renderer.shadowMap.enabled = settings.graphics === 'high';
renderer.shadowMap.type = THREE.PCFShadowMap;
useRenderer(renderer);   // wall shadows drawn once per weather, not every frame (arena.js)
const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(55, 1, 0.1, 200);   // sees to the far corner of the arena (187 m)
// Graphics High / Low (Settings, Stage 2A): surfaces are drawn once at load in the quality saved at that moment;
// shadows, sharpness and the amount of effects follow the setting straight away.
const arena = buildArena(scene, settings.graphics);
const fx = createEffects(scene, camera, settings.graphics);

// Weather (Stage 2A): the round's weather sets the look and how far the hunter sees (vision.js VIEW), the same on both
// phones (the referee draws it, rules.js). Drive alone: the player picks. ?weather=<name> forces one (testing only).
const WX_TEST = new URLSearchParams(location.search).get('weather');
let weather = null;
let otherFade = 1;
function useWeather(name) {
  if (!(name in WEATHERS)) name = DEFAULT_WEATHER;
  if (name === weather) return;
  weather = name;
  const w = arena.setWeather(name);
  VIEW.range = w.view; VIEW.fadeFrom = w.fade;
  fx.setWeather(w);
  otherFade = -1;   // re-fade the other tank with the new distances
  showRoom();
}
let roomCode = '';
function showRoom() {
  const w = WEATHERS[weather] || WEATHERS[DEFAULT_WEATHER];
  $('hud-room').textContent = [roomCode ? `Room ${roomCode}` : '', `${w.label} ${w.view} m`].filter(Boolean).join(' · ');
}
useWeather(DEFAULT_WEATHER);

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
  renderer.setPixelRatio(Math.min(devicePixelRatio, settings.graphics === 'high' ? 2 : 1.25));
  renderer.setSize(w, h, false);
  camera.aspect = w / h;
  camera.updateProjectionMatrix();
  // point sprites (effects, lamp glows) are sized in metres: pixels per metre at 1 m away
  const px = renderer.getDrawingBufferSize(new THREE.Vector2()).y / (2 * Math.tan(THREE.MathUtils.degToRad(camera.fov) / 2));
  fx.setScale(px); arena.setScale(px);
}
addEventListener('resize', resize);
resize();
let quality = settings.graphics;
onSettings(s => {
  setMuted(s.sound === 'off');
  if (s.graphics === quality) return;
  quality = s.graphics;
  renderer.shadowMap.enabled = quality === 'high';
  renderer.shadowMap.needsUpdate = true;
  scene.traverse(o => { if (o.material) o.material.needsUpdate = true; });   // shadows on or off needs the shaders rebuilt
  fx.setQuality(quality);
  resize();
});

// Debug-only top-down map with both tanks (add ?debug to the address). Drive alone only: it never shows, and is
// never drawn, in a real match (it would show the hider).
let drawMinimap = () => {};
if (DEBUG) {
  const mm = $('minimap'), g = mm.getContext('2d'), k = 2;
  mm.width = COLS * 4 * k; mm.height = ROWS * 4 * k;
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
  const css = role => role === 'hunter' ? '#ff7a1a' : '#2f7bff';
  drawMinimap = () => {
    mm.hidden = mode !== 'solo';
    if (mm.hidden) return;
    g.drawImage(walls, 0, 0);
    dot(player, css(myRole())); dot(other, css(opposite(myRole())));
  };
}

// Phone screen handling: input only reaches the tank while actually playing (not on the start screen,
// rotate message or leave prompt).
initScreen(setInputEnabled, leaveMatch);
initSettings(refreshScreen);
if (device.ipad) $('rotate-1').textContent = 'Turn your iPad sideways.';
$('spec').textContent = `Build ${VERSION} · Yard 156 x 104 m · Best of 3`;

let taps = 0;   // action presses so far (testing only)

// ---- two players (Stage 1c) ----------------------------------------------------------------------------------
// mode: 'solo' (drive alone, parked tank) | 'host' (created the room, starts top-left) | 'guest' (joined, bottom-right).
// Hunter or hider comes from the match rules (js/rules.js); when driving alone the player picks.
let mode = 'solo';
let soloRole = 'hunter';
// vis: on the hunter's phone, the hider's phone last said it may be in sight (it sends { h: 1 } and no position otherwise)
const remote = { x: 0, z: 0, yaw: 0, speed: 0, cx: NaN, cz: NaN, at: 0, have: false, vis: false, paused: false };
let sendClock = 0;
const SEND_EVERY = 0.05;   // 20 position updates a second

let weatherPick = null;   // drive alone: the weather the player picked
function startMatch({ mode: m, code, pos, match, role, weather: wx }) {
  mode = m;
  weatherPick = wx || null;
  fx.clear(); wreck = null;
  soloRole = role || 'hunter';
  const me = mode === 'guest' ? 1 : 0;
  place(player, pos || SPAWNS[me]);
  place(other, SPAWNS[1 - me]);
  follow.reset();
  freshRound();
  roomCode = code || '';
  if (mode === 'solo') useWeather(WX_TEST || weatherPick || DEFAULT_WEATHER);
  else if (match?.wx) useWeather(match.wx);
  showRoom();
  $('leave-p').textContent = mode === 'solo' ? "You'll go back to the start screen." : 'The other player will be told you left.';
  Object.assign(remote, { have: false, vis: false, paused: false });   // the other tank appears with its first position update
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
  roomCode = '';
  fx.clear(); wreck = null;
  showRoom();
}
function onRemote(m) {
  if (mode === 'solo' || rules.onMessage(m)) return;
  if (m.t === 'f') { incoming(m); return; }
  if (m.t !== 's') return;
  if (m.h) { remote.vis = false; return; }   // the hider's phone: the hunter can't see it (no position sent)
  if (m.k !== posKey()) return;   // sent before one phone moved on to the next round (roles may have swapped)
  const jump = !remote.have || !remote.vis;   // first news, or back in sight: put it straight there
  Object.assign(remote, { x: m.x, z: m.z, yaw: m.y, speed: m.v, cx: m.cx, cz: m.cz, at: performance.now(), have: true, vis: true });
  if (jump) { other.position.set(m.x, 0, m.z); other.rotation.y = m.y; }
}
const posKey = () => rules.match ? `${rules.match.mid}/${rules.match.round}` : '';
const pose = t => ({ x: t.position.x, z: t.position.z, yaw: t.rotation.y });
// Show the other tank smoothly: guess a little ahead from its last known speed, then glide towards that.
function moveOther(dt) {
  if (mode === 'solo' || !remote.have || !remote.vis) return;
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
  // the hider: while the hunter can't see it, say so, and never where it is (brief: anti-cheat)
  if (myRole() === 'hider' && !hunterSees()) { sendState({ t: 's', h: 1 }); return; }
  const p = player.position, r = v => Math.round(v * 100) / 100;
  const m = { t: 's', k: posKey(), x: r(p.x), z: r(p.z), y: Math.round(player.rotation.y * 1000) / 1000, v: r(player.userData.speed) };
  if (myRole() === 'hunter') { m.cx = r(camera.position.x); m.cz = r(camera.position.z); }   // the hider's phone judges sight from here too
  sendState(m);
}
// Hider's phone: may the hunter see any part of this tank? Judged from the hunter's last message (its tank and its
// camera), and held on for a moment after the line is lost, so the tank never flickers at a corner.
let lastSeen = -1e9;
function hunterSees() {
  if (!remote.have) return false;
  const now = performance.now();
  if (inSight({ x: remote.x, z: remote.z, yaw: remote.yaw, cx: remote.cx, cz: remote.cz }, pose(player))) lastSeen = now;
  return now - lastSeen < VIEW.hold * 1000;
}

// Whether, and how solidly, the other tank shows on this screen.
// Hunter: the hider only while its phone says it may be in sight (drive alone: worked out here), fading out towards
// the edge of the view. Hider: the hunter always (walls still hide it, like anything else).
function sight() {
  const hunter = myRole() === 'hunter';
  let show;
  if (!hunter) show = mode === 'solo' || remote.have;
  else if (mode === 'solo') show = inSight({ ...pose(player), cx: camera.position.x, cz: camera.position.z }, pose(other));
  else show = remote.have && remote.vis && performance.now() - remote.at < 1500;
  const f = !hunter ? 1 : show ? fade(Math.hypot(other.position.x - player.position.x, other.position.z - player.position.z)) : 0;
  other.visible = show && f > 0;
  if (f !== otherFade) { otherFade = f; setFade(f); }
}
// Fading: the tank turns see-through as one solid shape. A depth-only copy of each part is drawn first (after the
// walls), so only the tank's front surface shows, never its inside parts through each other.
const DEPTH_ONLY = new THREE.MeshBasicMaterial({ colorWrite: false });
const ghosts = other.children.filter(o => o.isMesh && o !== other.userData.blob).map(o => {
  const g = new THREE.Mesh(o.geometry, DEPTH_ONLY);
  g.renderOrder = 1; g.visible = false;
  o.add(g);
  return g;
});
function setFade(f) {
  const u = other.userData, see = f < 1;
  for (const m of [u.paint, u.dark]) { m.opacity = f; if (m.transparent !== see) { m.transparent = see; m.needsUpdate = true; } }
  for (const g of ghosts) g.visible = see;
  u.blob.material.opacity = 0.35 * f;
}
// On the hunter's screen the hider's tank fades out at the edge of the view. On the hider's screen the hunter's tank never fades in the smog.
function dressOther(asHider) {
  const u = other.userData;
  for (const m of [u.paint, u.dark, u.blob.material]) if (m.fog !== asHider) { m.fog = asHider; m.needsUpdate = true; }
  // (no tank throws a sun shadow since Stage 2A, see tank.js, so the hider's shadow can't give it away either)
  otherFade = 1; setFade(1);
}

// ---- the rules: roles, firing, sprint, rounds (Stage 1d) -----------------------------------------------------
const root = document.documentElement;
const rules = createRules({ send: sendState, changed: phaseChanged, where: () => ({ x: player.position.x, z: player.position.z }) });
// shots: flash, smoke, sparks (effects.js) and sounds. Hearing follows sight (Chetan, 2026-09-29): the other player's
// shot is heard louder when close, but with no left/right direction.
const shots = createShots(scene, {
  muzzle(x, y, z, dx, dz) { fx.muzzle(x, y, z, dx, dz); },
  wallHit(x, y, z, nx, nz) {
    fx.wallHit(x, y, z, nx, nz);
    play('impact', 0.7 * byDistance(Math.hypot(x - player.position.x, z - player.position.z), 60, 0.05), 0.9 + Math.random() * 0.2);
  },
});
let wreck = null;   // { x, z } where the hider's wreck smokes this round (for the dark smoke column)
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
  dressOther(me === 'hunter');
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
  if (fresh) { freshRound(); remote.vis = false; wreck = null; }   // nothing of the other tank until its phone says it's in sight
  if (fresh) useWeather(m.wx);   // the round's weather (between rounds the last round's stays until the next starts)
  // the hider was just hit: explosion where it happened, on both phones, and a shake
  if (before && before.phase === 'play' && (m.phase === 'break' || m.phase === 'over') && m.result?.how === 'hit') {
    const hider = myRole() === 'hider';
    const at = hider ? { x: player.position.x, z: player.position.z } : m.result.at || (other.visible ? { x: other.position.x, z: other.position.z } : null);
    if (at) boom(at, hider);
  }
  showRoles(!fresh && m.result?.how === 'hit');
  if (before && m.phase === 'play' && before.phase !== 'play') toast(`Round ${m.round}. You are the ${myRole()}.`);
}

// The hider's tank blowing up at `at` { x, z }. mine: it's this phone's own tank.
function boom(at, mine) {
  wreck = at;
  fx.explosion(at.x, at.z);
  const d = Math.hypot(at.x - player.position.x, at.z - player.position.z);
  fx.kick(mine ? 1.1 : 0.9 * byDistance(d, 60, 0.15));
  play('explosion', mine ? 1 : byDistance(d, 110, 0.2), 0.95 + Math.random() * 0.1);
}
function tryFire() {
  const m = rules.match;
  if (reload > 0 || !inPlay()) return;
  if (mode !== 'solo' && (m.t < RULES.headStart || m.t >= RULES.round)) return;
  const shot = { id: ++shotId, x: player.position.x, z: player.position.z, yaw: player.rotation.y };
  shots.fire(shot);
  kick(player);
  fx.kick(0.3);
  play('shot', 0.95, 0.95 + Math.random() * 0.1);
  reload = RULES.reload;
  if (mode !== 'solo') sendState({ t: 'f', mid: m.mid, r: m.round, e: m.t, id: shot.id, x: shot.x, z: shot.z, y: shot.yaw });
}
// A shot from the hunter's phone. It was fired a moment ago over there, so it starts that far along
// (at most half a second: after a longer hiccup the shot is shown late rather than jumping far ahead).
function incoming(f) {
  const m = rules.match;
  if (!m || m.phase !== 'play' || f.mid !== m.mid || f.r !== m.round || myRole() !== 'hider') return;
  shots.fire({ id: f.id, x: f.x, z: f.z, yaw: f.y }, Math.min(0.5, Math.max(0, m.t - f.e)));
  kick(other);
  // heard on the hider's phone: louder when close, never with a direction
  play('shot', byDistance(Math.hypot(f.x - player.position.x, f.z - player.position.z), 130, 0.18), 0.95 + Math.random() * 0.1);
}
// The tank a bullet can hit on this phone: only ever the hider's, never the hunter's.
// On the hider's phone that's its own tank, and only that phone's hits count (it knows exactly where it is).
function hiderTank() {
  const m = rules.match;
  if (mode === 'solo') return soloRole === 'hunter' && soloWreck <= 0 ? other : null;   // practice: the smog doesn't stop bullets
  if (!m || m.phase !== 'play' || m.t >= RULES.round) return null;   // after 0:00 nothing can be hit
  // hunter's phone: bullets only stop on a hider it can see (just for show; the hider's phone judges the real hit)
  return myRole() === 'hider' ? player : (other.visible && otherFade > 0.5 ? other : null);
}
// Sprint: 75% faster while held and driving forward; a full meter lasts 3 s and refills in 6 s.
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
  const pv = rules.pingView();   // hunter ping: the hider's countdown, then the circle on both maps
  const ping = !pv ? '' : pv.warn ? `Ping in ${pv.warn}.` : role === 'hider' ? 'Pinged. The hunter sees this circle.'
    : pv.circle ? 'Ping. The hider is somewhere in the circle.' : '';
  text('rh-note', m.phase === 'play' && wait > 0 ? (role === 'hunter' ? `You can fire in ${wait} s.` : `The hunter can fire in ${wait} s.`)
    : beat ? (role === 'hunter' ? 'Direct hit.' : 'You were hit.') : ping);

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
      text('rc-wx', weatherLine(m.wx));
    } else if (m.phase === 'break') {
      text('rc-over', `Round ${m.round}`);
      text('rc-t', won ? 'You win the round.' : 'They win the round.');
      text('rc-p', how);
      text('rc-score', score);
      text('rc-count', `Round ${m.round + 1} starts in ${Math.max(1, Math.ceil(RULES.next - m.t))} s. You ${iHunted ? 'hide' : 'hunt'}.`);
      text('rc-wx', m.next ? weatherLine(m.next) : '');
    } else {
      text('rc-over', 'Match over');
      text('rc-t', won ? 'You win the match.' : 'They win the match.');
      text('rc-p', `Round ${m.round}: ${how.charAt(0).toLowerCase()}${how.slice(1)}`);
      text('rc-score', score);
      text('rc-count', m.again[me] ? 'Waiting for the other player.' : m.again[them] ? 'The other player wants to play again.' : '');
      text('rc-wx', '');
    }
    show('rc-buttons', m.phase === 'over');
    $('rc-again').disabled = !!m.again[me];
  }
  if (blockChanged) refreshScreen();   // the card stops the controls while it shows
}
$('rc-again').addEventListener('click', () => rules.playAgain());

// Corner map: walls and your own tank only (never the other player), plus the ping circle while a ping shows.
// Switched off in Settings, it still appears for a ping.
const cmap = createCornerMap($('cmap'));
addEventListener('resize', () => cmap.refit());
let mapOn = null, mapPinged = false;
function drawMap() {
  const pv = mode === 'solo' ? null : rules.pingView(), c = pv?.circle || null;
  const on = settings.map === 'on' || !!pv;
  if (on !== mapOn) { mapOn = on; $('cmap').hidden = !on; root.toggleAttribute('data-map', on); cmap.refit(); }
  if (!!c !== mapPinged) { mapPinged = !!c; $('cmap').classList.toggle('pinged', mapPinged); }
  if (on) cmap.draw({ ...pose(player), role: myRole() }, c, c ? 0.5 + 0.5 * Math.sin(performance.now() / 180) : 0);
  drawAlarm(myRole() === 'hider' ? pv : null);
  const count = pv?.warn || 0;
  if (count && count !== lastCount && myRole() === 'hider') play('tick', 0.8, 1 + (3 - count) * 0.08);
  lastCount = count;
  if (!!c && !lastCircle) play('ping', 0.8);
  lastCircle = !!c;
}
let lastCount = 0, lastCircle = false;
// Hider's ping alarm: red from every edge. Countdown: a pulse on each count, each one stronger (3, 2, 1). Pinged: one
// sharp red flash over the whole view, then steady red edges, breathing slowly, until the ping ends.
let alarmA = -1, alarmF = -1, alarmOn = false;
function drawAlarm(pv) {
  let a = 0, f = 0;
  if (pv?.warn) {
    const into = pv.warn - pv.until;                       // 0..1 through this count
    a = [0.9, 0.72, 0.55][Math.min(2, pv.warn - 1)] * (0.35 + 0.65 * Math.exp(-4 * into));
  } else if (pv && 'since' in pv) {
    f = Math.max(0, 1 - pv.since / 0.35);                  // the flash, gone in a third of a second
    a = 0.8 + 0.12 * Math.sin(pv.since * Math.PI * 1.5);
  }
  a = Math.round(a * 100) / 100; f = Math.round(f * 100) / 100;
  if (a !== alarmA) { alarmA = a; $('alarm').style.opacity = a; }
  if (f !== alarmF) { alarmF = f; $('alarm').style.setProperty('--flash', f); }
  const on = a > 0;
  if (on !== alarmOn) { alarmOn = on; $('rh-note').classList.toggle('alarm', on); $('cmap').classList.toggle('alarm', on); }
}
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
  sight();
  if (other.visible) blockByTank(player, other, before, dt);
  // bullets before the clock: a hit in the same instant the clock reaches 0:00 still counts
  const hit = shots.update(dt, hiderTank(), mode === 'solo' && !(other.visible && otherFade > 0.5));
  if (hit && mode === 'solo') { soloWreck = 1.5; paintTank(other, COLORS.hider, true); toast('Hit.'); boom({ x: other.position.x, z: other.position.z }, false); }
  else if (hit && myRole() === 'hider') rules.reportHit(rules.match.t, { x: player.position.x, z: player.position.z });   // the hider's phone tells the referee
  if (soloWreck > 0 && (soloWreck -= dt) <= 0) { paintTank(other, COLORS.hider); wreck = null; }
  rules.tick(clockDt);
  settleBarrel(player, dt); settleBarrel(other, dt);
  follow(player, dt);
  sendMine(dt);
  effects(dt, clockDt);
  if (!draw) return;
  drawRound();
  smogAt(player.position.x, player.position.z);
  fx.applyShake(dt);   // turns the camera a touch (never moves it, so it can't peek round a wall)
  renderer.render(scene, camera);
  drawMap();
  drawMinimap();
}
// Effects and sounds for this frame. Dust behind the other tank, and its engine, only while it shows on this screen.
let clockT = 0;
function effects(dt, clockDt) {
  clockT += clockDt;
  arena.update(clockT, dt);
  const me = player.position;
  fx.dust('me', player, player.userData.speed, dt);
  const seen = other.visible && otherFade > 0.3;
  const oSpeed = mode === 'solo' ? 0 : remote.speed;
  if (seen && mode !== 'solo') fx.dust('other', other, oSpeed, dt);
  if (wreck) fx.wreckSmoke('wreck', wreck.x, wreck.z, dt);
  fx.update(dt, me.x, me.z);
  const m = rules.match, left = m?.phase === 'play' ? RULES.round - m.t : Infinity;
  const quiet = mode !== 'solo' && m?.phase !== 'play';
  let otherSound = null;
  if (seen && mode !== 'solo') {
    const dx = other.position.x - me.x, dz = other.position.z - me.z, cy = follow.yaw() ?? player.rotation.y;
    // left/right from the camera's facing: positive = to the right
    const side = -(dx * Math.cos(cy) - dz * Math.sin(cy)) / Math.max(1, Math.hypot(dx, dz));
    otherSound = { speed: oSpeed, dist: Math.hypot(dx, dz), pan: side * 0.7, fade: Math.max(0, otherFade) };
  }
  const near = arena.lamps.nearest(me.x, me.z);
  soundFrame({ speed: player.userData.speed, throttle: Math.abs(drive.throttle), sprint: sprinting, other: otherSound,
    rain: WEATHERS[weather]?.rain || 0, lamp: { d: near.d, level: arena.lamps.level }, heart: left <= 10 && left > 0 ? Math.max(0.01, (10 - left) / 10) : 0, quiet });
}
// a faulty lamp fizzing near you
arena.lamps.onZap(l => {
  const d = Math.hypot(l.x - player.position.x, l.z - player.position.z);
  if (d < 20) play('zap', 0.55 * byDistance(d, 20) * Math.max(0.3, arena.lamps.level), 0.9 + Math.random() * 0.2);
});
// every button: a quiet click
document.addEventListener('click', e => { if (e.target.closest('button')) play('tap', 0.5); }, { capture: true });

let last = performance.now();
renderer.setAnimationLoop(now => {
  // never below 0: a frame stamped before the last test step would otherwise run time backwards (tank thrown through walls)
  const real = Math.max(0, Math.min(1, (now - last) / 1000));
  last = now;
  frame(Math.min(0.05, real), true, real);
});

window.__tb = { THREE, scene, camera, renderer, player, other, place, SPAWNS, follow, settings, remote, rules, shots, RULES, arena, fx, VIEW, useWeather, soundState,   // for testing only
  get weather() { return weather; },
  get mode() { return mode; }, get taps() { return taps; }, get role() { return myRole(); },
  get meter() { return meter; }, get reload() { return reload; }, get sprinting() { return sprinting; },
  // stepped frames stand in for real ones, so the next real frame doesn't count that time again
  step(n = 1, dt = 1 / 60) { for (let i = 0; i < n; i++) frame(dt, i === n - 1); last = performance.now(); } };
