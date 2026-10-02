// Player input: two fixed sliders (speed, steering) OR one fixed ring, and one action button (FIRE for the hunter, SPRINT for the hider),
// plus the keyboard for desktop testing (arrows or WASD drive, Space is the action button).
// Nothing moves. A touch starts a slider or the ring only on its own track (and a thumb's width of grab room round it);
// the corner map, the figure's poke circle, every button and all the free space in the middle take no such touches.
// Controls changed 2026-10-02 (Chetan): point-to-drive and the original tank style are gone; fixed sliders only.
// R3 (Chetan, 2026-10-02): the ring is back as a second choice (Settings > Control), tank-style: up drives, down reverses, sideways turns.
import { settings, onSettings } from './settings.js';

const $ = id => document.getElementById(id);
const root = document.documentElement;
const DEAD = 0.14;          // speed slider: ignore tiny thumb wobbles (fraction of full push)
const STEER_DEAD = 0.18;    // steering slider: a wider middle band counts as dead straight
const TRAVEL = { speed: 48, steer: 56 };   // px of knob travel to full speed / full steering at 100% size (was 64 / 76)
const RING_DEAD = 0.2;      // ring: a resting thumb this close to the middle (fraction of full push) does nothing at all
const RING_TRAVEL = 0.3;    // ring: knob travel as a share of the ring's width (the knob is 0.4 of it, so its edge stops on the ring's edge)
const GRAB = 24;            // px of grab room round the ring (the same as the CSS ::before)

export const input = { throttle: 0, turn: 0, action: false, actionTaps: 0 };

let enabled = false;

// main.js lists the screen spots that must never start a slider (the poke circle, the corner-map box): (x, y) => true when blocked
let blocked = () => false;
export const setSliderBlocker = fn => { blocked = fn; };

// ---- keyboard -------------------------------------------------------------------------------------------------
const keys = new Set();
const GAME_KEYS = ['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'KeyW', 'KeyA', 'KeyS', 'KeyD', 'Space'];
addEventListener('keydown', e => {
  if (!GAME_KEYS.includes(e.code) || !enabled) return;
  e.preventDefault();
  if (e.code === 'Space' && !e.repeat) input.actionTaps++;
  keys.add(e.code);
});
addEventListener('keyup', e => keys.delete(e.code));

// keep receiving a finger's moves even when it slides off the element (can refuse, e.g. for simulated test touches)
const capture = (el, id) => { try { el.setPointerCapture(id); } catch (e) { /* carry on without capture */ } };

// ---- the sliders ----------------------------------------------------------------------------------------------
// ring: the fixed track (its CSS box, plus a grab margin that CSS adds as ::before, is the touch area). axis: 'y' speed, 'x' steering.
// The knob follows the thumb along the track, measured from the ring's own centre; it stops at the travel limit (= full push).
function makeSlider(ring, knob, axis) {
  const pad = { id: null, x: 0, y: 0, axis, travel: TRAVEL[axis === 'y' ? 'speed' : 'steer'] };

  function move(px, py) {
    const r = ring.getBoundingClientRect(), R = pad.travel;   // measured every time, so a screen that resizes under a held thumb can't skew it
    const v = Math.max(-1, Math.min(1, ((axis === 'y' ? py - (r.top + r.height / 2) : px - (r.left + r.width / 2)) / R) || 0));
    pad.x = axis === 'x' ? v : 0; pad.y = axis === 'y' ? v : 0;
    knob.style.transform = `translate(${pad.x * R}px, ${pad.y * R}px)`;
  }
  pad.release = () => {
    pad.id = null; pad.x = pad.y = 0;
    knob.style.transform = '';
    ring.classList.remove('active');
  };
  ring.addEventListener('pointerdown', e => {
    if (!enabled || pad.id !== null || blocked(e.clientX, e.clientY)) return;
    pad.id = e.pointerId;
    capture(ring, e.pointerId);
    ring.classList.add('active');
    move(e.clientX, e.clientY);
  });
  ring.addEventListener('pointermove', e => { if (e.pointerId === pad.id) move(e.clientX, e.clientY); });
  for (const t of ['pointerup', 'pointercancel', 'lostpointercapture']) {
    ring.addEventListener(t, e => { if (e.pointerId === pad.id) pad.release(); });
  }
  return pad;
}

const speed = makeSlider($('stick'), $('knob'), 'y');       // speed slider: up = forward, down = reverse, middle = stopped
const steer = makeSlider($('steer'), $('steer-knob'), 'x');   // steering slider: right = turn right, middle band = straight

// ---- the ring (R3) --------------------------------------------------------------------------------------------
// One fixed round pad. The knob follows the thumb from the ring's own centre and stops at its edge; a still thumb gives a still value.
// It starts only from a touch inside the ring plus its grab room (a round ::before, checked here too).
function makeRing(ring, knob) {
  const pad = { id: null, x: 0, y: 0 };
  const geo = () => { const r = ring.getBoundingClientRect(); return { cx: r.left + r.width / 2, cy: r.top + r.height / 2, d: r.width }; };
  function move(px, py) {
    const g = geo(), R = g.d * RING_TRAVEL;   // measured every time, like the sliders
    let x = (px - g.cx) / R || 0, y = (py - g.cy) / R || 0;
    const len = Math.hypot(x, y);
    if (len > 1) { x /= len; y /= len; }
    pad.x = x; pad.y = y;
    knob.style.transform = `translate(${x * R}px, ${y * R}px)`;
  }
  pad.release = () => {
    pad.id = null; pad.x = pad.y = 0;
    knob.style.transform = '';
    ring.classList.remove('active');
  };
  ring.addEventListener('pointerdown', e => {
    if (!enabled || pad.id !== null || blocked(e.clientX, e.clientY)) return;
    const g = geo();
    if (Math.hypot(e.clientX - g.cx, e.clientY - g.cy) > g.d / 2 + GRAB) return;
    pad.id = e.pointerId;
    capture(ring, e.pointerId);
    ring.classList.add('active');
    move(e.clientX, e.clientY);
  });
  ring.addEventListener('pointermove', e => { if (e.pointerId === pad.id) move(e.clientX, e.clientY); });
  for (const t of ['pointerup', 'pointercancel', 'lostpointercapture']) {
    ring.addEventListener(t, e => { if (e.pointerId === pad.id) pad.release(); });
  }
  return pad;
}
const ring = makeRing($('ring-pad'), $('ring-knob'));
const releaseAll = () => { for (const p of [speed, steer, ring]) if (p.id !== null) p.release(); };

// ---- action button (FIRE / SPRINT) ----------------------------------------------------------------------------
const btn = $('action');
let btnId = null;
btn.addEventListener('pointerdown', e => {
  if (!enabled || btnId !== null) return;
  btnId = e.pointerId;
  capture(btn, e.pointerId);   // sliding the thumb off the button keeps holding it (matters for sprint)
  input.actionTaps++;
});
for (const t of ['pointerup', 'pointercancel', 'lostpointercapture']) {
  btn.addEventListener(t, e => { if (e.pointerId === btnId) btnId = null; });
}

// ---- settings: sizes, side, button spot -----------------------------------------------------------------------
onSettings(s => {
  releaseAll();
  root.dataset.side = s.stickSide;
  root.dataset.control = s.control;
  root.style.setProperty('--ring-scale', s.ringSize / 100);
  const k = s.stickSize / 100;
  root.style.setProperty('--stick-scale', k);
  root.style.setProperty('--btn-scale', s.btnSize / 100);
  root.style.setProperty('--btn-height', s.btnHeight + 'px');
  root.style.setProperty('--btn-edge', s.btnEdge + 'px');
  speed.travel = TRAVEL.speed * k;
  steer.travel = TRAVEL.steer * k;
});

// ---- shared ---------------------------------------------------------------------------------------------------
// Turn input on or off (off while the start screen, settings, rotate message or leave prompt is showing).
export function setInputEnabled(on) {
  enabled = on;
  if (on) return;
  keys.clear();
  releaseAll();
  btnId = null;
  input.actionTaps = 0;
}
addEventListener('blur', () => { keys.clear(); releaseAll(); btnId = null; });

const deadzone = (v, dz = DEAD) => Math.abs(v) < dz ? 0 : Math.sign(v) * (Math.abs(v) - dz) / (1 - dz);
const clamp = v => Math.max(-1, Math.min(1, v));

// The ring as [throttle, turn]: nothing in the round dead middle; then the sliders' own dead bands, so a nearly straight push
// drives straight and a nearly sideways one turns on the spot; partly sideways = an arc. The rim is stretched to a square,
// so a push into a corner gives full speed and full turn together, the same as both sliders pushed all the way.
function ringValue() {
  const { x, y } = ring, len = Math.hypot(x, y);
  if (len < RING_DEAD) return [0, 0];
  const s = len / Math.max(Math.abs(x), Math.abs(y));
  return [deadzone(clamp(-y * s)), deadzone(clamp(x * s), STEER_DEAD)];
}

export function readInput() {
  const k = c => keys.has(c) ? 1 : 0;
  const [rt, rr] = ringValue();
  const throttle = Math.max(k('ArrowUp'), k('KeyW')) - Math.max(k('ArrowDown'), k('KeyS')) + deadzone(-speed.y) + rt;
  const turn = Math.max(k('ArrowRight'), k('KeyD')) - Math.max(k('ArrowLeft'), k('KeyA')) + deadzone(steer.x, STEER_DEAD) + rr;
  input.throttle = clamp(throttle);
  input.turn = clamp(turn);
  input.action = enabled && (keys.has('Space') || btnId !== null);
  btn.classList.toggle('pressed', input.action);
  return input;
}

export const inputEnabled = () => enabled;   // the poke (main.js) only listens while the controls are live

// Call once per frame after the game has used actionTaps.
export function clearTaps() { input.actionTaps = 0; }
