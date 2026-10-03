// Tank Battle: game start-up and main loop.
import * as THREE from '../lib/three.module.js';
import { buildArena, useRenderer } from './arena.js';
import { makeTank, driveTank, blockByTank, paintTank, kick, settleBarrel, setFade, setFog, setTrim, setAura, bobble, shakeHead, waveFlag, COLORS, TANK_RADIUS } from './tank.js';
import { loadTank, applyTank, setLeader, clearLeader, setDuck, READY } from './models.js';
import { initPicker, openPicker, closePicker, pickerOpen, pickerSync, savedChoice } from './picker.js';
import { nameOf, shortName } from './leaders.js';
import { drawFlag } from './flags.js';
import { quoteFor, watchLine, tagline, bumpPair, pokeLine, headlineFor, awardsFor, nudgeLine, CLUCK, SORRY, REMATCH, QUACK, DUCK_ROUND } from './lines.js';

import { createProps, setSweat } from './props.js';
import { touristAt, BADGE_NAMES, chickenSpot, chickenLedge, HONK_RANGE } from './eggs.js';
import { assistYaw } from './assist.js';
import { showBubble, hideBubble, chatter } from './bubble.js';
import { icon, weatherIcon, fillIcons } from './icons.js';
import { makeChaseCamera } from './camera.js';
import { readInput, clearTaps, setInputEnabled, inputEnabled, setSliderBlocker } from './input.js';
import { initScreen, refreshScreen, device, isPlaying } from './screen.js';
import { initMenu, closeMenu, menuFrame } from './menu.js';
import { initLobby, leaveMatch, sendState, toast } from './lobby.js';
import { VERSION } from './net.js';
import { createRules, RULES, isDuckRound, nextRoundOf, cardView, stallLeft } from './rules.js';
import { initSecretBox, getArmed, disarm, buildHearts, flashAt } from './theme.js';
import { tipOn, tipOff } from './tips.js';
import { createShots } from './shots.js';
import { settings, onSettings, initSettings, setSettings } from './settings.js';
import { pump } from './say.js';
import { offerHint, hintDone, hintSeen, hintsFrame } from './hints.js';
import { createAutoLow } from './autolow.js';
import { SPAWNS, ROWS, COLS, isWallCell, WIDTH, DEPTH, pushOutOfWalls, rayToWall } from './world.js';
import { smogAt, inSight, fade, VIEW } from './vision.js';
import { createCornerMap } from './cornermap.js';
import { createEffects } from './effects.js';
import { play, frame as soundFrame, setMuted, byDistance, soundState } from './sound.js';
import { WEATHERS, DEFAULT_WEATHER } from './weather.js';

const DEBUG = new URLSearchParams(location.search).has('debug');
const $ = id => document.getElementById(id);
fillIcons();   // R4: the icons in the page's buttons and rows (icons.js, drawn in code)

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
// Stage 4A: the chicken, the wall graffiti and the lost tourist (props.js); what they do comes from the shared match
const props = createProps(scene, settings.graphics);

// Weather (Stage 2A): the round's weather sets the look and how far the hunter sees (vision.js VIEW), the same on both
// phones (the referee draws it, rules.js). Drive alone: the player picks. ?weather=<name> forces one (testing only).
const WX_TEST = new URLSearchParams(location.search).get('weather');
let weather = null;
let myLeader = 0, otherLeader = 0;   // the leader numbers on the two tanks (0 = none yet)
let otherFade = 1;
function useWeather(name) {
  if (!(name in WEATHERS)) name = DEFAULT_WEATHER;
  if (name === weather) return;
  weather = name;
  const w = arena.setWeather(name);
  VIEW.range = w.view; VIEW.fadeFrom = w.fade;
  fx.setWeather(w);
  otherFade = -1;   // re-fade the other tank with the new distances
}
let roomCode = '';   // shown in the menu (R4); the HUD draws the weather and the faces itself
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

// Stage 2B: the Blender tank replaces the plain boxes as soon as it has loaded; each tank carries a leader's bobblehead
// and (Stage 3A) that leader's flag on a mast. Who wears what comes from the leader picker (picker.js): in a two-player
// match from the referee's match (rules.js `lead`, so both phones always agree); Drive alone from the picker's choice.
// ?leader=N and ?other=N (N = the number in the brief's list) only set what Drive alone's picker starts on, for testing.
loadTank().then(() => { applyTank(player); applyTank(other); otherFade = -1; }).catch(e => console.warn('tank model', e));
// Stage 4B (loading tips): a silly line on the start screen while the tank model and the surfaces are still loading (it appears only if that takes a moment)
tipOn($('home-tip'));
Promise.all([loadTank().catch(() => {}), arena.ready.catch(() => {})]).then(() => { tipOff($('home-tip')); document.documentElement.removeAttribute('data-loading'); });
const QS = new URLSearchParams(location.search);
const randomLeader = () => READY[Math.floor(Math.random() * READY.length)];
// the other player's figure is drawn 1.3 m tall on this screen (Chetan, 2026-09-30), your own 1.0 m
const wearLeader = (tank, n) => setLeader(tank, n, tank === other ? 1.3 : 1).then(() => { if (tank === other) otherFade = -1; }).catch(e => console.warn('leader model', n, e));
function dressLeaders(me, them) {
  if (me !== myLeader) { myLeader = me; if (me) wearLeader(player, me); else clearLeader(player); }
  if (them !== otherLeader) { otherLeader = them; if (them) wearLeader(other, them); else clearLeader(other); }
}

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
const heartsOff = s => $('th-hearts').toggleAttribute('data-off', s.graphics !== 'high');   // Stage 4B: no floating hearts on Low graphics
buildHearts(); heartsOff(settings);
onSettings(s => {
  heartsOff(s);
  setMuted(s.sound === 'off');
  if (s.graphics === quality) return;
  quality = s.graphics;
  renderer.shadowMap.enabled = quality === 'high';
  renderer.shadowMap.needsUpdate = true;
  scene.traverse(o => { if (o.material) o.material.needsUpdate = true; });   // shadows on or off needs the shaders rebuilt
  fx.setQuality(quality);
  props.setQuality(quality);
  arena.setQuality(quality);   // Part B: the extra lamps and the turning fans are High only
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
initSecretBox();   // Stage 4B: the Secret box on the start screen (theme.js)
if (device.ipad) $('rotate-1').textContent = 'Turn your iPad sideways.';
$('spec').textContent = `Build ${VERSION}`;   // R4: the build only (the yard size and "best of 3" were extra words)

let flagT = 0;   // seconds, for the flags' waving
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
function startMatch({ mode: m, code, pos, match, role, weather: wx, me: pickMe, other: pickOther }) {
  mode = m;
  weatherPick = wx || null;
  fx.clear(); wreck = null; clearEggs();
  soloRole = role || 'hunter';
  const me = mode === 'guest' ? 1 : 0;
  place(player, pos || SPAWNS[me]);
  place(other, SPAWNS[1 - me]);
  follow.reset();
  freshRound();
  roomCode = code || '';
  if (mode === 'solo') useWeather(WX_TEST || weatherPick || DEFAULT_WEATHER);
  else if (match?.wx) useWeather(match.wx);
  $('leave-p').textContent = mode === 'solo' ? "You'll go back to the start screen." : 'The other player will be told you left.';
  Object.assign(remote, { have: false, vis: false, paused: false });   // the other tank appears with its first position update
  // Drive alone: the picker's two choices (Random drawn now). Two players: nobody yet, the leaders come with the coin toss.
  myLeader = otherLeader = -1;
  if (mode === 'solo') dressLeaders(pickMe || randomLeader(), pickOther || randomLeader());
  else dressLeaders(0, 0);
  hideBubble();
  if (mode === 'solo' && chatter('watch', settings.chatter, 1)) { const n = myLeader, role = soloRole, ok = () => mode === 'solo' && myLeader === n && soloRole === role; setTimeout(() => { if (ok()) showBubble(watchLine(n, role), { still: ok }); }, 500); }   // a preview of the line (Drive alone has no rounds)
  sendClock = 0;
  if (mode === 'solo') { rules.stop(); delete root.dataset.match; }
  else { root.dataset.match = ''; restoring = !!pos; rules.start(mode, match || null); if (mode === 'guest' && getArmed()) rules.armTheme(getArmed()); }
  showRoles(rules.match && rules.match.phase !== 'play' && rules.match.phase !== 'toss' && rules.match.result?.how === 'hit');
}
function endMatch() {
  closePicker();
  mode = 'solo';
  rules.stop();
  freshRound();
  delete root.dataset.match;
  roomCode = '';
  fx.clear(); wreck = null; clearEggs();
  disarm();   // Stage 4B: leaving ends the secret theme; type the phrase again for the next match
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
  const sees = myRole() === 'hider' && hunterSees();
  if (sees && rules.match?.phase === 'play' && !rules.paused) rules.noteSeen();   // Ghost badge: it was seen, even if only for a moment
  if (myRole() === 'hider' && !sees) { sendState({ t: 's', h: 1 }); return; }
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
  if (f !== otherFade || other.userData.changed) { otherFade = f; setFade(other, f); }
}
// Fading (tank.js setFade): the whole tank, figure and props turn see-through as one solid shape.
// On the hunter's screen the hider's tank fades out at the edge of the view. On the hider's screen the hunter's tank never fades in the smog.
function dressOther(asHider) {
  setFog(other, asHider);
  // (no tank throws a sun shadow since Stage 2A, see tank.js, so the hider's shadow can't give it away either)
  otherFade = 1; setFade(other, 1);
}

// ---- the rules: roles, firing, sprint, rounds (Stage 1d) -----------------------------------------------------
const root = document.documentElement;
const rules = createRules({ send: sendState, changed: phaseChanged, eggs: eggsChanged, nudged, where: () => ({ x: player.position.x, z: player.position.z }), theme: () => getArmed() });
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
const inPlay = () => mode === 'solo' || (rules.match?.phase === 'play' && !rules.paused && !rules.givingUp);
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
  applyGold();
}
// ---- easter eggs (Stage 4A): all of it follows the shared match, nothing is decided on this phone except the poke ----------
// The gold trim: the hunter's tank, this round, once its shot has stopped against the chicken's block.
// The hider's trim is silver once its tank has driven up to the chicken (checked by the hider's own phone, see honkCheck).
function applyGold() {
  const m = rules.match, on = mode !== 'solo' && !!m, hunterTank = myRole() === 'hunter' ? player : other, hiderTank = hunterTank === player ? other : player;
  setTrim(hunterTank, on && m.gold ? 'gold' : null); setTrim(hiderTank, on && m.silver ? 'silver' : null);
}
function clearEggs() {
  setTrim(player, null); setTrim(other, null); setSweat(player, false); setSweat(other, false);
  props.update(null, 0);
}
// The referee moved an egg on (gold, a bump, the tourist said sorry). `before` is null on the first call (start, refresh,
// rejoin): then only the state is shown, never a bubble. A bubble shows only when the counter goes up inside the same round.
function eggsChanged(m, before) {
  applyGold();
  if (!before || before.mid !== m.mid || before.round !== m.round || m.phase !== 'play') return;
  const showBubble = text => roundBubble(text, sameRound(m));   // R4 Part B: a bubble that has to wait is dropped once the round is over
  if (m.gold && !before.gold) { props.cluck(); const l = chickenLedge(); fx.chickenHit(l.x + 0.08, 1.55, l.z, l.x + 0.5, l.y + 1.3, l.z); showBubble(CLUCK); }   // the cue: a flash on the block and a puff of feathers (both phones)
  else if (m.silver && !before.silver) { if (myRole() === 'hider') { props.cluck(); showBubble(CLUCK); } }   // only on the hider's own phone: the hunter must not learn where the hider is
  else if ((m.sorry | 0) > (before.sorry | 0)) showBubble(SORRY);
  else if ((m.bump | 0) > (before.bump | 0)) {
    const pair = bumpPair(m.lead, rules.hunterSide()), lines = chatter('bump', settings.chatter);   // R4 Chatter: Full both lines, Short the first, Off none
    if (pair && lines) showBubble(pair.slice(0, lines).map(p => `${shortName(p.who)}: “${p.text}”`).join('\n'));
  }
}
const THEME_BUBBLE = 8000;   // ms the themed start message stays
const roundBubble = (text, still) => showBubble(text, { still });
const sameRound = m => { const mid = m.mid, round = m.round; return () => { const c = rules.match; return !!c && c.mid === mid && c.round === round && c.phase === 'play'; }; };   // (the match, not the mode: Drive alone has none)
// The referee moved the match on (coin toss, new round, round over, rematch). Runs on both phones.
function phaseChanged(m, before) {
  if (!m) return;
  if (m.phase !== 'play') { closeMenu(); hideBubble(); }   // a card is coming (coin toss, round result, match over): it replaces the menu
  if (m.phase === 'pick') {   // Stage 3A: choose a leader before the coin toss (a refresh mid-pick keeps a Ready already given)
    const ready = !!m.ready?.[rules.side];
    openPicker({ ready });
    if (ready) rules.choose(savedChoice().me, true);
  } else closePicker();
  if (m.lead) { const l = rules.leaders(); dressLeaders(l.me, l.them); }   // the same on both phones (the referee's draw)
  const fresh = m.phase === 'toss' || m.phase === 'play';
  if (before) restoring = false;
  if (fresh && !restoring) {   // back to the starting corners
    const me = mode === 'guest' ? 1 : 0;
    place(player, SPAWNS[me]);
    place(other, SPAWNS[1 - me]);
    follow.reset();
  }
  if (fresh) { freshRound(); remote.vis = false; wreck = null; setSweat(player, false); setSweat(other, false); }   // nothing of the other tank until its phone says it's in sight
  if (fresh) useWeather(m.wx);   // the round's weather (between rounds the last round's stays until the next starts)
  // the hider was just hit: explosion where it happened, on both phones, and a shake
  if (before && before.phase === 'play' && (m.phase === 'break' || m.phase === 'over') && m.result?.how === 'hit') {
    const hider = myRole() === 'hider';
    const at = hider ? { x: player.position.x, z: player.position.z } : m.result.at || (other.visible ? { x: other.position.x, z: other.position.z } : null);
    if (at) boom(at, hider);
  }
  showRoles(!fresh && m.result?.how === 'hit');
  if (before && m.phase === 'play' && before.phase !== 'play') {
    flashRole(myRole(), m.round);   // R4: the role icon and the round dashes for 1.5 s (was "Round N. You are the hunter.")
    // Stage 3B: the leader on your tank says why it is watching you, once, on your screen only. Only at the start of the round
    // (a phone that comes back late into a round, or refreshes, never replays it).
    if (m.t < 2) {
      const th = m.theme, mid = m.mid, round = m.round, talk = chatter('watch', settings.chatter, round) > 0, still = sameRound(m);   // R4 Chatter: Short = round 1 only, Off = never
      // Stage 4B: the first round of a themed room opens with the theme's message (both phones, about 8 s of the head start); the watching line follows it
      // (R4 Part B: both wait for the 1.5 s round flash in the one-message queue; the watching line queues behind the theme message)
      if (th?.s && mid === 1 && round === 1) {
        showBubble(th.s, { ms: THEME_BUBBLE, theme: th.k, still, wait: 12000 });
        if (talk) setTimeout(() => { if (still()) showBubble(watchLine(rules.leaders()?.me, myRole()), { still, wait: 12000 }); }, THEME_BUBBLE + 700);
      } else if (talk) showBubble(watchLine(rules.leaders()?.me, myRole()), { still });
    }
  }
}

// The hider's tank blowing up at `at` { x, z }. mine: it's this phone's own tank.
function boom(at, mine) {
  wreck = at;
  shakeHead(myRole() === 'hider' || mode === 'solo' && soloRole === 'hider' ? player : other, 1);
  fx.explosion(at.x, at.z);
  const d = Math.hypot(at.x - player.position.x, at.z - player.position.z);
  fx.kick(mine ? 1.1 : 0.9 * byDistance(d, 60, 0.15));
  play('explosion', mine ? 1 : byDistance(d, 110, 0.2), 0.95 + Math.random() * 0.1);
}
// Aim assist: only what this hunter's own screen shows. The hider counts only while it is drawn solidly (the same test that lets a bullet stop on it, hiderTank);
// hidden or faded out it is simply not in the list, so a bend can never point at a hider the hunter cannot see. The chicken's ledge is a fixed place (public),
// counted when there is a clear line to it inside the view distance.
function assistTargets() {
  const out = [];
  if (myRole() === 'hunter' && other.visible && otherFade > 0.5 && !(mode === 'solo' && soloWreck > 0)) {
    const v = mode === 'solo' ? 0 : remote.paused ? 0 : remote.speed, yaw = other.rotation.y;
    out.push({ x: other.position.x, z: other.position.z, vx: Math.sin(yaw) * v, vz: Math.cos(yaw) * v });
  }
  const c = chickenLedge(), px = player.position.x, pz = player.position.z, d = Math.hypot(c.x - px, c.z - pz);
  if (d > 1 && d <= VIEW.range && rayToWall(px, pz, c.x + 0.05, c.z) >= Math.hypot(c.x + 0.05 - px, c.z - pz) - 1e-3) out.push({ x: c.x + 0.05, z: c.z, vx: 0, vz: 0 });
  return out;
}
function tryFire() {
  const m = rules.match;
  if (reload > 0 || !inPlay()) return;
  if (mode !== 'solo' && (m.t < RULES.headStart || m.t >= RULES.round)) return;
  // Aim assist (assist.js): the direction that goes into the shot message, so both phones draw the same shot. Off, or no target in the cone = the barrel's own direction.
  const shot = { id: ++shotId, x: player.position.x, z: player.position.z, yaw: 0 };
  shot.yaw = assistYaw({ x: shot.x, z: shot.z, yaw: player.rotation.y }, assistTargets(), { on: settings.assist === 'on', strength: settings.assistStrength, speed: RULES.bulletSpeed });
  shots.fire(shot);
  kick(player);
  fx.kick(0.3);
  play('shot', 0.95, 0.95 + Math.random() * 0.1);
  reload = RULES.reload;
  if (mode !== 'solo') {
    const f = { t: 'f', mid: m.mid, r: m.round, e: m.t, id: shot.id, x: shot.x, z: shot.z, y: shot.yaw };
    sendState(f);
    rules.noteShot(f);   // the referee looks at every shot for the chicken, the tourist and the Cinematic escape badge
  }
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
  if (sprinting && rules.match && !hintSeen('hider')) hintDone('hider');   // R4 Part B: they found SPRINT
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
let ringP = -1, btnOff = null, shownAwards = '';
const otherSide = s => s === 'host' ? 'guest' : 'host';
function drawRound() {
  const m = rules.match, me = rules.side;
  // the button's ring: reload for FIRE, the sprint meter for SPRINT; greyed out when it can't be used
  const hunter = myRole() === 'hunter';
  const p = hunter ? 1 - reload / RULES.reload : meter;
  const off = hunter ? !(inPlay() && reload <= 0 && (mode === 'solo' || (m.t >= RULES.headStart && m.t < RULES.round))) : spent || meter <= 0 || !inPlay();
  if (Math.abs(p - ringP) > 0.004) { ringP = p; $('action').querySelector('.ring').style.setProperty('--p', p.toFixed(3)); }
  if (off !== btnOff) { btnOff = off; $('action').classList.toggle('off', off); }

  show('rh', !!m || mode === 'solo');   // R4: Drive alone shows your face and the weather (no clock, no score)
  drawHud(m, me);
  if (!m) {
    show('bign', false); show('cmap-ping', false); if (show('round', false)) { delete root.dataset.card; refreshScreen(); }
    hudIdle(`solo|${myRole()}|${weather}|${myLeader},${otherLeader}|${soloWreck > 0}`, !(mode === 'solo' && isPlaying()));
    hintsNow(null, null);
    return;
  }
  const them = otherSide(me);
  const role = rules.role() || myRole(), left = m.phase === 'play' ? RULES.round - m.t : m.result && m.phase !== 'toss' ? m.result.left : RULES.round;   // in a match the role is the match's
  text('rh-clock', clock(left));
  const lastTen = m.phase === 'play' && left <= 10 && left > 0;
  $('rh-clock').classList.toggle('low', lastTen);
  if (lastTen) $('rh-clock').style.setProperty('--beat', (0.95 - 0.35 * (10 - left) / 10).toFixed(2) + 's');
  // Round-end flow (2026-10-02): which screen shows comes from the match's clock (rules.js cardView), so both phones show the same one.
  // After a hit, a short beat to see the wreck before the score screen covers it.
  const view = localView(m, cardView(m)), beat = view === 'beat';   // R4 Part B: this phone may have tapped on past the score or taunt screen
  const wait = Math.ceil(RULES.headStart - m.t - 1e-6);
  // R4: the one small tag under the HUD: the head-start lock and its seconds (both players), or "Hit" in the wreck's beat
  const note = m.phase === 'play' && wait > 0 ? 'lock' + wait : beat ? 'hit' + role : '';
  if (note !== noteKey) {
    noteKey = note;
    $('rh-note').className = 'tagc' + (beat ? ' hit' + (role === 'hider' ? ' me' : '') : '');
    $('rh-note').innerHTML = !note ? '' : beat ? icon('hit', 16) + 'Hit' : icon('lock', 15) + wait;
  }
  // R4: the ping. The hider's countdown is one big red number (the red edges stay); while the circle shows, a ring sits at the corner map's corner (both players)
  const pv = rules.pingView(), big = role === 'hider' && pv?.warn ? String(pv.warn) : '';
  show('bign', !!big); text('bign', big);
  if (root.hasAttribute('data-bign') !== !!big) { root.toggleAttribute('data-bign', !!big); pump(); }   // the ping number wins: the one-message queue pauses while it shows (say.js)
  show('cmap-ping', !!pv && !pv.warn);

  const card = !!view && !beat;
  const blockChanged = show('round', card);
  if (blockChanged) { if (card) root.dataset.card = ''; else delete root.dataset.card; }
  const shownView = card ? drawCard(m, view, me, them) : view;
  if (blockChanged) refreshScreen();   // the card stops the controls while it shows
  // R4 Part B, tap to skip: which screen this phone shows and since when; the "Tap >" mark after 1.5 s on the score or taunt screen
  const vk = `${cardKey(m)}/${shownView || ''}`;
  if (vk !== viewOn.k) viewOn = { k: vk, view: shownView || '', at: clockT };
  show('sc-skip', shownView === 'score' && canSkip()); show('tt-skip', shownView === 'taunt' && canSkip());
  // R4 Part B, the HUD fades when idle: anything the HUD shows changing wakes it; never in a ping, the head-start lock, the hit beat or the last ten seconds
  const L = rules.leaders() || {};
  hudIdle(`${m.mid}|${m.round}|${m.phase}|${m.score[me]}-${m.score[them]}|${role}|${m.wx}|${L.me},${L.them}|${note}|${pv ? pv.warn || 'c' : ''}`,
    m.phase !== 'play' || wait > 0 || !!pv || lastTen || rules.paused);
  hintsNow(m, shownView);
}
// ---- R4 Part B (Chetan, 2026-10-03): HUD idle fade, tap to skip, first-time hints ---------------------------------------------------
const IDLE_AFTER = 5;   // s without a change before the faces and the weather tag fade (the clock stays)
let hudSig = '', hudSince = 0;
function hudIdle(sig, keepUp) {
  if (sig !== hudSig) { hudSig = sig; hudSince = clockT; }
  const idle = !keepUp && clockT - hudSince >= IDLE_AFTER;
  if ($('rh').classList.contains('idle') !== idle) $('rh').classList.toggle('idle', idle);
}
// Tap to skip: the score and taunt screens move on with a tap once they have shown for 1.5 s. Only this phone moves on (score -> taunt -> the Ready
// card, or the match-over card); the shared match is untouched, so the next round still needs both Ready taps and never starts before the break's
// usual 10 s (rules.js), and an early Again waits for those 10 s too (againAt). The Ready card itself is exactly as before.
const SKIP_AFTER = 1.5;
const STEPS = ['score', 'taunt', 'ready', 'final'];
const cardKey = m => `${m.mid}/${m.round}/${m.phase}`;
let skipTo = null;                          // { key, view }: this phone tapped on to `view` for this break
let viewOn = { k: '', view: '', at: 0 };    // the screen this phone shows and since when (game clock)
let againAt = 0;                            // match id of an Again tapped before the usual 10 s; sent when the match clock gets there
function localView(m, view) {
  if (!skipTo || skipTo.key !== cardKey(m) || !STEPS.includes(view)) return view;
  return STEPS.indexOf(skipTo.view) > STEPS.indexOf(view) ? skipTo.view : view;
}
const canSkip = () => (viewOn.view === 'score' || viewOn.view === 'taunt') && clockT - viewOn.at >= SKIP_AFTER;
function skipCard() {
  const m = rules.match;
  if (!m || !canSkip()) return false;   // (the match, not the mode: Drive alone has none)
  const r = m.result, last = m.phase === 'over' ? 'final' : 'ready';
  const taunt = viewOn.view === 'score' && r?.how !== 'gaveup' && !!quoteFor(r, m.lead);
  skipTo = { key: cardKey(m), view: taunt ? 'taunt' : last };
  drawRound();
  return true;
}
addEventListener('pointerdown', e => {
  if (!isPlaying() || $('round').hidden || e.target.closest?.('button') || ['settings', 'menu', 'link', 'leave', 'rotate'].some(id => !$(id).hidden)) return;
  skipCard();
}, true);
// First-time hints (hints.js): the moments. Each is offered every frame while it holds; hints.js shows it once per phone, through the queue.
const cardUp = () => !$('round').hidden;
function hintsNow(m, view) {
  hintsFrame();
  if (!isPlaying() || pickerOpen() || ['settings', 'menu', 'link', 'leave', 'rotate'].some(id => !$(id).hidden)) return;
  const role = (m && rules.role()) || myRole(), touch = root.classList.contains('touch');   // the match's role (never the mode)
  // 1. the sliders (or the ring), the first time you drive
  if (touch && inPlay() && !cardUp() && (!m || m.phase === 'play') && !hintSeen('drive')) {
    const still = () => inPlay() && !cardUp();
    offerHint('drive', settings.control === 'ring'
      ? [{ text: 'Drive', ic: 'drive', at: () => $('ring-pad'), sides: ['above', 'right', 'left'] }]
      : [{ text: 'Speed', ic: 'height', at: () => $('stick'), sides: ['above', 'right', 'left'] }, { text: 'Steer', ic: 'width', at: () => $('steer'), sides: ['above', 'left', 'right'] }], still);
  }
  if (!m) return;   // the rest are two-player moments (read from the match, never the mode)
  // 2. your goal, your first round as hunter and as hider
  if (m.phase === 'play' && !rules.paused) {
    if (role === 'hunter') offerHint('hunter', [{ text: 'Find them. One hit.', ic: 'hunter', at: () => $('rh'), sides: ['below'] }], () => rules.match?.phase === 'play' && rules.role() === 'hunter');
    else if (touch) offerHint('hider', [{ text: 'Hold to sprint', ic: 'hider', at: () => $('action'), sides: settings.stickSide === 'right' ? ['right', 'above', 'below'] : ['left', 'above', 'below'] }],
      () => rules.match?.phase === 'play' && rules.role() === 'hider');
  }
  // 3. the first ping: the circle on the corner map
  if (rules.pingView()?.circle) offerHint('ping', [{ text: role === 'hider' ? 'They see roughly here' : 'Hider is in the circle', ic: 'ping', at: () => $('cmap-ping'), sides: ['right', 'below'] }], () => !!rules.pingView()?.circle);
  // 4. the first Ready card (this phone not Ready yet)
  if (view === 'ready' && !m.go?.[rules.side]) offerHint('ready', [{ text: 'Both tap Ready', ic: 'ready', at: () => $('rd-go'), sides: ['below', 'above', 'right'] }],
    () => !$('rdy').hidden && !$('round').hidden && !rules.match?.go?.[rules.side]);
}
// ---- R4 declutter (Chetan, 2026-10-03): the edge HUD (layout B, faces out) and the icon-first cards ---------------------------------
// Faces, roles, pips and the weather come from the match both phones share (rules.leaders(), the score, the round, the round's weather), so no
// message is added and both phones always draw the same.
let noteKey = null;
const htmlK = (id, h) => { const el = $(id); if (el.__h !== h) { el.__h = h; el.innerHTML = h; } };
const wxTag = (name, size) => { const w = WEATHERS[name] || WEATHERS[DEFAULT_WEATHER]; return icon(weatherIcon(name), size) + w.view; };
// the round dashes (done, now, to come) and the score pips (rounds won of the two needed)
function rounds(id, round) { const el = $(id); if (el.__k === round) return; el.__k = round; [...el.children].forEach((b, i) => { b.className = i + 1 < round ? 'done' : i + 1 === round ? 'now' : ''; }); }
function pips(id, won) { const el = $(id); if (el.__k === won) return; el.__k = won; [...el.children].forEach((b, i) => { b.className = i < won ? 'on' : ''; }); }
// a face with its role ring and badge: <pre>-w<i> (the frame), -f<i> (the face), -r<i> (the badge)
function whoOn(pre, i, n, role) {
  const w = $(`${pre}-w${i}`);
  if (w.dataset.role !== role) { w.dataset.role = role; $(`${pre}-r${i}`).innerHTML = icon(role, 13); }
  if (n > 0) faceOn($(`${pre}-f${i}`), n);
}
function winLose(pre, won) { $(`${pre}-w0`).classList.toggle('win', won); $(`${pre}-w0`).classList.toggle('lose', !won); $(`${pre}-w1`).classList.toggle('win', !won); $(`${pre}-w1`).classList.toggle('lose', won); }
function drawHud(m, me) {
  // in a match the roles and faces come from the match itself; Drive alone from the picker's two choices
  const role = (m && rules.role()) || myRole(), L = m ? rules.leaders() || { me: 0, them: 0 } : { me: myLeader, them: otherLeader };
  whoOn('rh', 0, L.me, role); whoOn('rh', 1, L.them, opposite(role));
  if (m) { pips('rh-s0', m.score[me] | 0); pips('rh-s1', m.score[otherSide(me)] | 0); rounds('rh-rp', m.round); }
  htmlK('rh-wx', wxTag(weather, 16));
}
// the round-start flash: the role icon in a disc and the round dashes, 1.5 s (in place of "Round 2. You are the hunter.")
let flashT = 0;
function flashRole(role, round) {
  const el = $('flash');
  el.dataset.role = role;
  el.innerHTML = `<span class="disc">${icon(role, 34)}</span><span class="rp">${[1, 2, 3].map(i => `<b class="${i < round ? 'done' : i === round ? 'now' : ''}"></b>`).join('')}</span>`;
  el.hidden = false; el.style.animation = 'none'; void el.offsetWidth; el.style.animation = '';
  root.toggleAttribute('data-flash', true); pump();   // while it shows, the head-start tag steps aside (index.html) and the one-message queue waits (say.js)
  clearTimeout(flashT); flashT = setTimeout(() => { el.hidden = true; root.toggleAttribute('data-flash', false); pump(); }, 1550);
}
$('cmap-ping').innerHTML = icon('ping', 18);
// A leader's face in a round frame:// A leader's face in a round frame: one cell of the picker's picture, zoomed 1.12x onto the head (the same crop at any frame size)
const faceShown = new WeakMap();
const facePos = n => { const i = n - 1, col = i % 6, row = Math.floor(i / 6); return `${((1.12 * col + 0.06) / 5.72 * 100).toFixed(3)}% ${((1.12 * row - 0.0296) / 5.72 * 100).toFixed(3)}%`; };
function faceOn(el, n) {
  if (!n || faceShown.get(el) === n) return;
  faceShown.set(el, n);
  el.style.backgroundPosition = facePos(n);
}
// the same face as page text (the awards, the rematch status, a notice)
const faceHtml = n => n > 0 ? `<i class="face" style="background-position:${facePos(n)}"></i>` : '';
const flagShown = {};
function flagOn(id, n) { if (n && flagShown[id] !== n) { flagShown[id] = n; drawFlag($(id), n); } }
function chips(id, list) {
  const key = list.join(',');
  if ($(id).dataset.k === key) return;
  $(id).dataset.k = key;
  $(id).hidden = !list.length;
  $(id).replaceChildren(...list.map(b => { const e = document.createElement('span'); e.innerHTML = icon(b, 14); e.append(BADGE_NAMES[b] || b); return e; }));   // R4: the badge's icon, then its name (names unchanged)
}
const CARDS = ['ti', 'rdy', 'sc', 'tt', 'fin'];
function drawCard(m, view, me, them) {
  const r = m.result, won = !!r && r.win === me, iHunted = rules.hunterSide() === me;
  const quote = (view === 'taunt' || view === 'score') && r?.how !== 'gaveup' ? quoteFor(r, m.lead) : null;   // who speaks comes from the match, so both phones read the same
  if (view === 'taunt' && !quote) view = 'score';   // (an unknown leader has no line: the score stays up)
  // the winner's role colour that round: orange if the hunter won, blue if the hider survived
  const winRole = r && r.how !== 'gaveup' ? (r.win === rules.hunterSide() ? 'hunter' : 'hider') : 'hunter';
  if ($('round').dataset.win !== winRole) $('round').dataset.win = winRole;
  const L = rules.leaders() || { me: myLeader, them: otherLeader };
  const card = view === 'toss' || view === 'intro' ? 'ti' : view === 'ready' ? 'rdy' : view === 'score' ? 'sc' : view === 'taunt' ? 'tt' : 'fin';
  for (const id of CARDS) show(id, id === card);
  const shown = { ti: view, rdy: 'ready', sc: 'score', tt: 'taunt', fin: 'final' }[card];

  if (card === 'ti') {   // R4: the coin toss and the intro are one card; who hunts round 1 shows as the role badges
    whoOn('ti', 0, L.me, iHunted ? 'hunter' : 'hider'); whoOn('ti', 1, L.them, iHunted ? 'hider' : 'hunter');
    flagOn('ti-fl0', L.me); flagOn('ti-fl1', L.them);
    htmlK('ti-wx', wxTag(m.wx, 18));
    rounds('ti-rp', 1);
    htmlK('ti-n', icon('clock', 18) + Math.max(1, Math.ceil(RULES.toss - m.t)));
    text('ti-duck', isDuckRound(m, 1) ? DUCK_ROUND : '');
    return shown;
  }
  if (card === 'rdy') {   // the Ready card: faces, flags, names and taglines (the joke stays here), the next round's weather, Ready
    const nextRound = m.round + 1, hunts = !iHunted;
    rounds('rdy-rp', nextRound);
    whoOn('rdy', 0, L.me, hunts ? 'hunter' : 'hider'); whoOn('rdy', 1, L.them, hunts ? 'hider' : 'hunter');
    introSide(0, L.me); introSide(1, L.them);
    text('rc-duck', isDuckRound(m, nextRound) ? DUCK_ROUND : '');   // Stage 4B: ducks next round (both phones read it from the match)
    drawReady(m, nextRound, me, them);
    return shown;
  }
  if (card === 'sc') {   // the score screen: the winner's face big, the score big, how (icon + time), the badges (the referee wrote them into the result)
    const over = m.phase === 'over', mine = iHunted ? 'hunter' : 'hider';
    text('sc-l', over ? 'Match' : '');
    show('sc-rp', !over); rounds('sc-rp', m.round);
    whoOn('sc', 0, L.me, mine); whoOn('sc', 1, L.them, opposite(mine)); winLose('sc', won);
    text('sc-n0', String(m.score[me])); text('sc-n1', String(m.score[them]));
    $('sc-n0').classList.toggle('w', won); $('sc-n1').classList.toggle('w', !won);
    // a hit: the burst and the time left (hunter's colour); time out: the eye and the full round (hider's colour)
    const hit = r?.how === 'hit';
    if ($('sc-how').dataset.k !== (hit ? 'hunter' : 'hider')) { $('sc-how').dataset.k = hit ? 'hunter' : 'hider'; $('sc-how').className = 'mini ' + (hit ? 'hunter' : 'hider'); }
    htmlK('sc-how', !r ? '' : hit ? icon('hit', 18) + clock(r.left) : icon('hider', 18) + clock(RULES.round));
    chips('sc-badges', r?.badges || []);
    return shown;
  }
  if (card === 'tt') {   // the speaking leader's face, the quote in a bubble, the newspaper headline in small text (unchanged)
    faceOn($('tt-face'), quote.who);
    text('tt-q', `“${quote.text}”`);
    text('tt-news', headlineFor(r, m.lead, rules.hunterSide(), m.mid, m.round, RULES.round - r.left - RULES.headStart) || '');
    return shown;
  }
  // the match-over card (view 'final'): after the score and taunt screens, or at once after a surrender (1f)
  const gave = r?.how === 'gaveup', mine = iHunted ? 'hunter' : 'hider';
  text('fin-t', gave ? (r.by === me ? 'You gave up. They win the match.' : 'They gave up. You win the match.') : '');   // rare: a full sentence
  whoOn('fin', 0, L.me, mine); whoOn('fin', 1, L.them, opposite(mine)); winLose('fin', won);
  htmlK('fin-score', `<span class="${won ? 'w' : ''}">${m.score[me]}</span><i> – </i><span class="${won ? '' : 'w'}">${m.score[them]}</span>`);
  // who wants a rematch: their face with the "again" sign; after your own tap, their face with the hourglass
  const early = againAt === m.mid;   // R4 Part B: Again tapped before the usual 10 s (tap to skip); sent when the clock gets there
  const st = m.again[them] ? 'again' : m.again[me] || early ? 'wait' : '';
  htmlK('fin-st', st ? faceHtml(L.them) + icon(st, 14) : '');
  // Stage 4A: the rematch taunt for the loser. Stage 4B: the end-of-match awards (none after a surrender) and the secret theme's end message;
  // all fixed functions of the match both phones share, so both phones print the same. R4: each award shows the leader's face, not the name.
  const over = m.phase === 'over';
  const taunt = over && r && r.how !== 'gaveup' && !won;
  if (show('rc-taunt', taunt) || taunt) text('rc-taunt', taunt ? REMATCH : '');
  const aw = over ? awardsFor(m) : null, akey = aw ? aw.map(a => `${a.side}${a.who}${a.name}`).join('|') : '';
  show('rc-awards', !!aw);
  if (akey !== shownAwards) {
    shownAwards = akey;
    $('rc-awards').replaceChildren(...(aw || []).map(a => { const p = document.createElement('p'), b = document.createElement('b'); b.textContent = a.name; p.innerHTML = faceHtml(a.who); p.append(b); return p; }));
  }
  const th = over ? m.theme : null, msg = th ? [won ? th.w : th.l, th.x].filter(Boolean).join('\n') : '';
  show('rc-theme', !!msg); text('rc-theme', msg);
  // with extras (taunt, awards, theme message) the card has two columns: the result and the buttons on the left, the extras on the right
  const wide = over && (taunt || !!aw || !!msg);
  if ($('fin').classList.contains('wide') !== wide) $('fin').classList.toggle('wide', wide);
  $('rc-again').disabled = !!m.again[me] || early;
  return shown;
}
// The Ready card's row: Ready, the next round's weather, the late countdown, Nudge (only for the player who is Ready), or a nudge just received.
// Who is Ready shows as a badge on the faces: a green tick on a Ready player, the hourglass on the other player's face while you wait.
let nudgeIn = null;   // { mid, r, n (the nudging leader), until (ms) }
function drawReady(m, nextRound, me, them) {
  const mine = !!m.go?.[me], theirs = !!m.go?.[them], left = stallLeft(m);
  if ($('rd-go').disabled !== mine) $('rd-go').disabled = mine;
  const badge = (id, k) => { if ($(id).__s !== k) { $(id).__s = k; $(id).className = 'st ' + k; $(id).innerHTML = k ? icon(k === 'ok' ? 'ready' : 'wait', k === 'ok' ? 18 : 15) : ''; } };
  badge('rdy-s0', mine ? 'ok' : ''); badge('rdy-s1', theirs ? 'ok' : mine ? 'wait' : '');
  htmlK('rd-wx', m.next ? wxTag(m.next, 18) : '');
  htmlK('rd-late', left <= RULES.stallShow ? icon('clock', 17) + Math.max(1, Math.ceil(left - 1e-6)) : '');   // "starting anyway in N s"
  const canNudge = mine && !theirs && m.t >= RULES.readyCard - 0.5;   // R4 Part B: a Ready card reached early by tap to skip has no Nudge until the usual time
  show('rd-nudge', canNudge);
  if (canNudge) { const w = rules.nudgeWait > 0; if ($('rd-nudge').disabled !== w) $('rd-nudge').disabled = w; htmlK('rd-nudge', icon('nudge', 16) + (w ? 'Nudged' : 'Nudge')); }
  const said = !!nudgeIn && nudgeIn.mid === m.mid && nudgeIn.r === m.round && !mine && performance.now() < nudgeIn.until;
  show('rd-bub', said); show('rd-wx', !said);
}
// The other player nudged (rules.js checked it is for this Ready card): a tick and their leader's line, inside the card, for 4 s
function nudged(who) {
  const m = rules.match, n = m?.lead?.[who], line = nudgeLine(n);
  if (!line) return;
  nudgeIn = { mid: m.mid, r: m.round, n, until: performance.now() + 4000 };
  faceOn($('rd-face'), n); text('rd-said', line);
  play('tick', 0.8, 1.1);
}
$('rd-go').addEventListener('click', () => { rules.readyUp(); hintDone('ready'); });
$('rd-nudge').addEventListener('click', () => rules.nudge());
$('rc-again').addEventListener('click', () => {
  const m = rules.match;
  if (m?.phase === 'over' && cardView(m) !== 'final') { againAt = m.mid; drawRound(); }   // reached early by tap to skip: held until the shared match shows it (10 s; a surrender at once)
  else rules.playAgain();
});

// The Ready card's two columns (0 = you, 1 = the other player): flag, parody name, tagline (lines.js). R4: the country / era line went (the flag says it)
const introShown = [0, 0];
function introSide(i, n) {
  if (!(n > 0) || introShown[i] === n) return;
  introShown[i] = n;
  drawFlag($(`vs-f${i}`), n);
  text(`vs-n${i}`, nameOf(n)); text(`vs-t${i}`, `“${tagline(n)}”`);
}

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
  if (on !== alarmOn) { alarmOn = on; $('cmap').classList.toggle('alarm', on); }
}
$('rc-leave').addEventListener('click', leaveMatch);

// In-game menu (1f): Resume, Settings, Surrender / Leave match (two players) or Quit to menu (drive alone).
initMenu({
  solo: () => mode === 'solo',
  over: () => rules.match?.phase === 'over',
  canGiveUp: () => mode !== 'solo' && !!rules.match && rules.match.phase !== 'over' && !rules.givingUp,
  giveUp: () => rules.giveUp(),
  leave: leaveMatch,
  room: () => mode === 'solo' ? '' : roomCode,   // R4: the room code lives in the menu
});

// Leader picker (Stage 3A): ready(n, ok) is a two-player choice, start() begins Drive alone.
let soloGo = null;
initPicker({
  ready: (n, ok) => rules.choose(n, ok),
  leave: () => { $('leave').hidden = false; refreshScreen(); },   // the same "Leave the game?" question as a back-swipe
  start: (me, other) => soloGo?.(me, other),
  changed: () => refreshScreen(),
});

initLobby({
  pickSolo(go) {   // Drive alone: choose both leaders, then go
    soloGo = (me, them) => { closePicker(); soloGo = null; go(me, them); };
    openPicker({ solo: true, me: parseInt(QS.get('leader'), 10), other: parseInt(QS.get('other'), 10) });
  },
  start: startMatch,
  end: endMatch,
  finish() { closePicker(); rules.stop(); shots.clear(); drawRound(); },   // the match ended early; the lobby shows why
  remote: onRemote,
  otherFace: () => faceHtml(otherLeader),   // R4: "The other player is back." is their face and "Back"
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

// Turn the player's input into throttle and turn for the tank (speed slider or the ring's up / down = throttle, steering slider or the ring's sideways = turn,
// scaled by the turning speed setting).
const drive = { throttle: 0, turn: 0 };
function steer(inp) {
  drive.throttle = inp.throttle;
  drive.turn = inp.turn * (settings.turnSpeed / 100);
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
  const d = steer(inp);
  if (mode !== 'solo' && (rules.match?.phase !== 'play' || rules.givingUp)) { d.throttle = 0; d.turn = 0; }   // tanks wait between rounds (and after giving up)
  if ((Math.abs(d.throttle) > 0.15 || Math.abs(d.turn) > 0.15) && root.classList.contains('touch') && !hintSeen('drive')) hintDone('drive');   // R4 Part B: they found the sliders
  const am = rules.match;
  if (againAt && (!am || am.phase !== 'over' || am.mid !== againAt)) againAt = 0;
  else if (againAt && cardView(am) === 'final') { againAt = 0; rules.playAgain(); }   // R4 Part B: an early Again, now at the usual time
  d.boost = sprint(inp, dt);
  driveTank(player, d, dt);
  moveOther(dt);
  sight();
  if (other.visible) blockByTank(player, other, before, dt);
  // bullets before the clock: a hit in the same instant the clock reaches 0:00 still counts
  const hit = shots.update(dt, hiderTank(), mode === 'solo' && !(other.visible && otherFade > 0.5));
  if (hit && mode === 'solo') { soloWreck = 1.5; paintTank(other, COLORS.hider, true); toast('Hit', icon('hit', 16)); boom({ x: other.position.x, z: other.position.z }, false); }
  else if (hit && myRole() === 'hider') rules.reportHit(rules.match.t, { x: player.position.x, z: player.position.z });   // the hider's phone tells the referee
  if (soloWreck > 0 && (soloWreck -= dt) <= 0) { paintTank(other, COLORS.hider); wreck = null; }
  rules.tick(clockDt);
  bumpCheck(clockDt);
  honkCheck();
  syncLook();
  syncDuck();
  settleBarrel(player, dt); settleBarrel(other, dt);
  bobble(player, dt); if (other.visible) bobble(other, dt);
  flagT += dt; waveFlag(player, flagT); if (other.visible) waveFlag(other, flagT);
  if (mode !== 'solo' && rules.match?.phase === 'pick') pickerSync(!!rules.match.ready?.[rules.side === 'host' ? 'guest' : 'host']);
  follow(player, dt);
  sendMine(dt);
  effects(dt, clockDt);
  menuFrame();
  if (!draw) return;
  drawRound();
  smogAt(player.position.x, player.position.z);
  fx.applyShake(dt);   // turns the camera a touch (never moves it, so it can't peek round a wall)
  if (!pickerOpen()) renderer.render(scene, camera);   // the picker covers the whole screen: don't draw behind it
  drawMap();
  drawMinimap();
}
// ---- Stage 4B: the secret theme and the rubber duck, both read from the shared match ----------------------------------------------
// The theme (love / hate) is in the match from the start (rules.js `theme`), so both phones always show the same look. It shows only in a two-player
// match; on the start screen a phrase that worked tints the screen for the next match. Love is strong, hate is subtle (Chetan, 2026-10-01).
// Everything here only paints over the picture, tints the lights or glows the tanks' own paint: it never knows where a tank is.
let lookKind = null, lookFlash = -1;
function syncLook() {
  const m = rules.match, playing = isPlaying() && mode !== 'solo';
  const kind = playing ? m?.theme?.k || null : !isPlaying() ? getArmed()?.k || null : null;
  if (kind !== lookKind) {
    lookKind = kind;
    if (kind) root.dataset.theme = kind; else delete root.dataset.theme;
    arena.setTone(kind);
    setAura(player, kind); setAura(other, kind);
  }
  const f = kind === 'hate' && playing && m.phase === 'play' && !rules.paused ? Math.round(flashAt(m.mid, m.round, m.t) * 50) / 50 : 0;
  if (f !== lookFlash) { lookFlash = f; $('fx-theme').style.setProperty('--flash', f); }
}
// Rubber-duck rounds: every tank on both phones is the duck for the round the match says (rules.js `ducks`), from the moment the round starts until the
// next round's start (the wreck after a hit stays a duck). The duck keeps the tank's collision circle, outline and barrel tip (models.js).
let duckNow = null;
function syncDuck() {
  const m = rules.match, on = mode !== 'solo' && !!m && (m.phase === 'play' || m.phase === 'break' || m.phase === 'over') && isDuckRound(m);
  if (on === duckNow) return;
  duckNow = on;
  setDuck(player, on); setDuck(other, on);
}
// Five quick taps inside the corner map box (top-left, there even when the map is off) ask for a duck round next round. A tap is a touch under 0.3 s that
// moves under 12 px; five of them within 3 seconds count. Two-player match only; the cards, the menu and the settings are not "in the game", so no taps there.
const duckTaps = [];
let duckFrom = null;
const duckOK = () => mode !== 'solo' && isPlaying() && !!rules.match && nextRoundOf(rules.match) > 0 && !rules.paused && !rules.givingUp
  && ['settings', 'menu', 'link', 'leave', 'rotate', 'pick'].every(id => $(id).hidden);
addEventListener('pointerdown', e => {
  duckFrom = null;
  if (!duckOK() || e.target.closest?.('#round .card')) return;   // 5b (review): a tap on a round card is the card's (tap to skip), never a duck tap, even where the card covers the box
  const r = $('cmap-box').getBoundingClientRect();
  if (e.clientX >= r.left && e.clientX <= r.right && e.clientY >= r.top && e.clientY <= r.bottom) duckFrom = { id: e.pointerId, t: performance.now(), x: e.clientX, y: e.clientY };
}, true);
addEventListener('pointerup', e => {
  const d = duckFrom;
  if (!d || e.pointerId !== d.id) return;
  duckFrom = null;
  const now = performance.now();
  if (now - d.t > 300 || Math.hypot(e.clientX - d.x, e.clientY - d.y) > 12 || !duckOK()) return;
  duckTaps.push(now);
  while (duckTaps.length && now - duckTaps[0] > 3000) duckTaps.shift();
  if (duckTaps.length >= 5) {
    duckTaps.length = 0;
    if (rules.noteDuck()) toast(QUACK);
  }
}, true);
addEventListener('pointercancel', () => { duckFrom = null; }, true);

// Bump (Stage 4A): the referee phone watches the two tanks. Touching for a quarter of a second counts; rules.js allows one bump line
// every 20 s of round time and three a round. Both phones then read the bump from the match and show the same two lines.
// Honk (2026-10-01): the hider's own phone knows exactly where its tank is, so it alone notices when it has driven up to the
// chicken and tells the referee (rules.noteHonk). Nothing else changes: no sight, speed or hit rule looks at it.
function honkCheck() {
  if (mode === 'solo' || myRole() !== 'hider' || rules.match?.phase !== 'play' || rules.paused || rules.match.silver) return;
  const c = chickenSpot();
  if (Math.hypot(player.position.x - c.x, player.position.z - c.z) < HONK_RANGE) rules.noteHonk();
}
let touchT = 0;
function bumpCheck(dt) {
  if (mode === 'solo' || rules.side !== 'host' || rules.match?.phase !== 'play' || rules.paused || !other.visible) { touchT = 0; return; }
  const d = Math.hypot(other.position.x - player.position.x, other.position.z - player.position.z);
  touchT = d < TANK_RADIUS * 2 + 0.25 ? touchT + dt : 0;
  if (touchT >= RULES.bumpHold) rules.noteBump();
}
// The last ten seconds (Stage 4A): the hider's head sweats, the hunter's head shakes. Both read the round clock, so both phones agree.
let shakeT = 0;
function lastTen(dt, left, play) {
  const on = mode !== 'solo' && play && left <= 10 && left > 0;
  const hider = myRole() === 'hider' ? player : other, hunter = myRole() === 'hider' ? other : player;
  if (!on) { if (hider.userData.sweat) setSweat(hider, false); if (hunter.userData.sweat) setSweat(hunter, false); shakeT = 0; return; }
  if (settings.graphics === 'high') setSweat(hider, true, clockT);
  if ((shakeT -= dt) <= 0) { shakeT = 0.55; shakeHead(hunter, 0.3); }
}
// Bobblehead poke (Stage 4A): a quick tap right on your own figure gives a random line from your leader (own screen only).
// A tap is a touch that lasts under 0.3 s and moves under 12 px, so holding or sliding there still drives exactly as before.
let pokeFrom = null, pokeLast = '', pokeAt = 0;
function headCircle() {
  const h = player.userData.head;
  if (!h) return null;
  const p = new THREE.Vector3();
  h.getWorldPosition(p); p.y += 0.28;   // about the middle of the face
  const c = p.clone().project(camera);
  if (c.z > 1 || Math.abs(c.x) > 1.2 || Math.abs(c.y) > 1.2) return null;
  const W = innerWidth, H = innerHeight, cx = (c.x * 0.5 + 0.5) * W, cy = (0.5 - c.y * 0.5) * H;
  const side = new THREE.Vector3().setFromMatrixColumn(camera.matrixWorld, 0).multiplyScalar(0.55);
  const e = p.clone().add(side).project(camera);
  return { cx, cy, r: Math.max(28, Math.abs((e.x * 0.5 + 0.5) * W - cx)) };
}
const pokeOK = () => mode !== 'solo' && rules.match?.phase === 'play' && !rules.paused && !rules.givingUp && isPlaying() && inputEnabled();
// Where a slider or the ring must never start (controller changes and R3, 2026-10-02): the poke circle on your own figure (two-player matches) and the corner-map box
// (where the five duck taps go, there even when the map is off). The buttons need no entry: they sit on top of the controls and take the touch themselves.
setSliderBlocker((x, y) => {
  const c = mode !== 'solo' ? headCircle() : null;
  if (c && Math.hypot(x - c.cx, y - c.cy) <= c.r) return true;
  const r = $('cmap-box').getBoundingClientRect();
  return r.width > 0 && x >= r.left && x <= r.right && y >= r.top && y <= r.bottom;
});
addEventListener('pointerdown', e => {
  pokeFrom = null;
  if (!pokeOK() || e.target.closest?.('button')) return;   // a press on FIRE / SPRINT or a corner button is theirs
  const c = headCircle();
  if (c && Math.hypot(e.clientX - c.cx, e.clientY - c.cy) <= c.r) pokeFrom = { id: e.pointerId, t: performance.now(), x: e.clientX, y: e.clientY };
}, true);
addEventListener('pointerup', e => {
  const d = pokeFrom;
  if (!d || e.pointerId !== d.id) return;
  pokeFrom = null;
  if (performance.now() - d.t > 300 || Math.hypot(e.clientX - d.x, e.clientY - d.y) > 12 || !pokeOK() || performance.now() - pokeAt < 1500) return;
  const line = pokeLine(rules.leaders()?.me, pokeLast);
  if (!line) return;
  pokeAt = performance.now(); pokeLast = line;
  if (chatter('poke', settings.chatter)) showBubble(line, { pri: 1.5 });   // R4 Chatter: Off = no bubble (the head still wobbles); R4 Part B: the answer to a tap cuts in on another bubble
  shakeHead(player, 0.7);
  play('tick', 0.5, 0.85);
}, true);
addEventListener('pointercancel', () => { pokeFrom = null; }, true);

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
  props.update(mode !== 'solo' && m?.phase === 'play' ? touristAt(m.mid, m.round, m.t) : null, dt);
  lastTen(dt, left, m?.phase === 'play' && !rules.paused);
  const quiet = mode !== 'solo' && m?.phase !== 'play';
  let otherSound = null;
  if (seen && mode !== 'solo') {
    const dx = other.position.x - me.x, dz = other.position.z - me.z, cy = follow.yaw() ?? player.rotation.y;
    // left/right from the camera's facing: positive = to the right
    const side = -(dx * Math.cos(cy) - dz * Math.sin(cy)) / Math.max(1, Math.hypot(dx, dz));
    otherSound = { speed: oSpeed, dist: Math.hypot(dx, dz), pan: side * 0.7, fade: Math.max(0, otherFade) };
  }
  const near = arena.lamps.nearest(me.x, me.z);
  soundFrame({ off: !isPlaying(), speed: player.userData.speed, throttle: Math.abs(drive.throttle), sprint: sprinting, other: otherSound,
    rain: WEATHERS[weather]?.rain || 0, lamp: { d: near.d, level: arena.lamps.level }, heart: left <= 10 && left > 0 ? Math.max(0.01, (10 - left) / 10) : 0, quiet });
}
// a faulty lamp fizzing near you
arena.lamps.onZap(l => {
  const d = Math.hypot(l.x - player.position.x, l.z - player.position.z);
  if (d < 20 && isPlaying()) play('zap', 0.55 * byDistance(d, 20) * Math.max(0.3, arena.lamps.level), 0.9 + Math.random() * 0.2);
});
// every button: a quiet click
document.addEventListener('click', e => { if (e.target.closest('button')) play('tap', 0.5); }, { capture: true });

// R4 Part B (Chetan, 2026-10-03): Auto-Low graphics. Under 24 frames a second for 5 s in a row while playing (a round in play, or Drive alone; no card,
// menu, Settings or picker; the game in view) switches to Low ONCE, with a small notice and an Undo for 6 s. It never switches again on this phone
// (settings.autoLow = 'used'), whatever the Undo or Settings say afterwards, so it cannot flap.
const autoLow = createAutoLow();
function autoLowFrame(real) {
  if (settings.autoLow !== 'on' || settings.graphics !== 'high') { autoLow.reset(); return false; }
  const ok = isPlaying() && !document.hidden && inPlay() && (!rules.match || rules.match.phase === 'play') && !cardUp() && !pickerOpen()
    && ['settings', 'menu', 'link', 'leave', 'rotate'].every(id => $(id).hidden);
  if (!autoLow.feed(real, ok)) return false;
  autoLow.reset();
  setSettings({ graphics: 'low', autoLow: 'used' });
  toast('Low', icon('graphics', 16), { ms: 6000, action: { label: 'Undo', run: () => setSettings({ graphics: 'high' }) } });
  return true;
}

let last = performance.now();
renderer.setAnimationLoop(now => {
  // never below 0: a frame stamped before the last test step would otherwise run time backwards (tank thrown through walls)
  const real = Math.max(0, Math.min(1, (now - last) / 1000));
  last = now;
  frame(Math.min(0.05, real), true, real);
  autoLowFrame(real);
});

window.__tb = { drawRound, flashRole, skipCard, autoLowFrame, autoLow, get viewOn() { return viewOn; }, get skipTo() { return skipTo; }, get againAt() { return againAt; }, get clockT() { return clockT; }, setLeaders(me, them) { myLeader = me; otherLeader = them; }, assistTargets, tryFire, THREE, scene, props, get lookKind() { return lookKind; }, get duckNow() { return duckNow; }, setAura, setDuck, getArmed, disarm, showBubble, hideBubble, camera, renderer, player, other, place, wearLeader, get myLeader() { return myLeader; }, get otherLeader() { return otherLeader; }, SPAWNS, follow, settings, remote, rules, shots, RULES, arena, fx, VIEW, useWeather, soundState,   // for testing only
  get weather() { return weather; },
  get mode() { return mode; }, get taps() { return taps; }, get role() { return myRole(); },
  get meter() { return meter; }, get reload() { return reload; }, get sprinting() { return sprinting; },
  // stepped frames stand in for real ones, so the next real frame doesn't count that time again
  step(n = 1, dt = 1 / 60) { for (let i = 0; i < n; i++) frame(dt, i === n - 1); last = performance.now(); } };
