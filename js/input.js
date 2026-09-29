// Player input. Three control styles, picked in settings (js/settings.js):
//   point   (default): floating joystick; push the way you want to go. Gives an aim angle + strength.
//   sliders:           speed slider under one thumb (up/down), steering slider under the other (left/right).
//   tank    (original): floating joystick; up = forward, down = reverse, sideways = turn on the spot.
// Plus one action button (FIRE for the hunter, SPRINT for the hider), and the keyboard for desktop testing:
// arrows or WASD drive tank-style in every mode, Space is the action button.
import { settings, onSettings } from './settings.js';

const $ = id => document.getElementById(id);
const root = document.documentElement;
const DEAD = 0.14;          // ignore tiny thumb wobbles (fraction of full push)
const STEER_DEAD = 0.18;    // steering slider / tank-style sideways: a wider middle band counts as dead straight
const EDGE = 14;            // keep controls this far inside the screen

// aim: point style only, { angle (radians, 0 = up, + = right), strength 0..1 } or null when the stick is centred.
// aimNew: true on the frame a fresh push starts (thumb down, or back out of the centre), so the game can take
// "up" to mean the way the camera faces right now.
export const input = { throttle: 0, turn: 0, aim: null, aimNew: false, action: false, actionTaps: 0 };

let enabled = false;

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

// ---- floating pads (joystick, speed slider, steering slider) --------------------------------------------------
// notch / rounded-corner margins, measured from a hidden element padded with env(safe-area-inset-*)
const inset = side => parseFloat(getComputedStyle($('safe'))['padding-' + side]) || 0;
// keep receiving a finger's moves even when it slides off the element (can refuse, e.g. for simulated test touches)
const capture = (el, id) => { try { el.setPointerCapture(id); } catch (e) { /* carry on without capture */ } };

// A pad appears under the thumb inside its zone. axis: 'both' (joystick), 'y' (speed slider), 'x' (steering slider).
function makePad(zone, ring, knob) {
  const pad = { id: null, ox: 0, oy: 0, x: 0, y: 0, axis: 'both', travel: 56, fresh: false };

  function place(cx, cy) {
    const hw = ring.offsetWidth / 2 + EDGE, hh = ring.offsetHeight / 2 + EDGE;
    const z = zone.getBoundingClientRect();
    pad.ox = Math.max(Math.max(z.left, inset('left')) + hw, Math.min(Math.min(z.right, innerWidth - inset('right')) - hw, cx));
    pad.oy = Math.max(hh, Math.min(innerHeight - inset('bottom') - hh, cy));
    ring.style.transform = `translate(${pad.ox}px, ${pad.oy}px)`;
  }
  function move(px, py) {
    let dx = pad.axis === 'y' ? 0 : px - pad.ox, dy = pad.axis === 'x' ? 0 : py - pad.oy;
    const d = Math.hypot(dx, dy), R = pad.travel;
    if (d > R) {
      // thumb went past the edge: drag the whole pad along behind it, so reversing is instant
      place(pad.ox + dx - dx / d * R, pad.oy + dy - dy / d * R);
      dx = pad.axis === 'y' ? 0 : px - pad.ox; dy = pad.axis === 'x' ? 0 : py - pad.oy;
    }
    const len = Math.min(1, Math.hypot(dx, dy) / R) || 0, ang = Math.atan2(dy, dx);
    pad.x = Math.cos(ang) * len; pad.y = Math.sin(ang) * len;
    knob.style.transform = `translate(${pad.x * R}px, ${pad.y * R}px)`;
  }
  pad.release = () => {
    pad.id = null; pad.x = pad.y = 0;
    knob.style.transform = '';
    ring.classList.remove('active');
    ring.style.transform = '';   // back to its resting spot (set in CSS)
  };
  zone.addEventListener('pointerdown', e => {
    if (!enabled || pad.id !== null) return;
    pad.id = e.pointerId; pad.fresh = true;
    capture(zone, e.pointerId);
    ring.classList.add('active');
    place(e.clientX, e.clientY);
    move(e.clientX, e.clientY);
  });
  zone.addEventListener('pointermove', e => { if (e.pointerId === pad.id) move(e.clientX, e.clientY); });
  for (const t of ['pointerup', 'pointercancel', 'lostpointercapture']) {
    zone.addEventListener(t, e => { if (e.pointerId === pad.id) pad.release(); });
  }
  return pad;
}

const stick = makePad($('stick-zone'), $('stick'), $('knob'));      // joystick, or the speed slider in sliders style
const steer = makePad($('steer-zone'), $('steer'), $('steer-knob'));   // steering slider (sliders style only)
steer.axis = 'x';

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

// ---- settings: style, sizes, sides, button spot ---------------------------------------------------------------
onSettings(s => {
  if (stick.id !== null) stick.release();
  if (steer.id !== null) steer.release();
  root.dataset.style = s.style;
  root.dataset.side = s.stickSide;
  const k = s.stickSize / 100;
  root.style.setProperty('--stick-scale', k);
  root.style.setProperty('--btn-scale', s.btnSize / 100);
  root.style.setProperty('--btn-height', s.btnHeight + 'px');
  root.style.setProperty('--btn-edge', s.btnEdge + 'px');
  stick.axis = s.style === 'sliders' ? 'y' : 'both';
  stick.travel = (s.style === 'sliders' ? 64 : 56) * k;
  steer.travel = 76 * k;
});

// ---- shared ---------------------------------------------------------------------------------------------------
// Turn input on or off (off while the start screen, settings, rotate message or leave prompt is showing).
export function setInputEnabled(on) {
  enabled = on;
  if (on) return;
  keys.clear();
  if (stick.id !== null) stick.release();
  if (steer.id !== null) steer.release();
  btnId = null;
  input.actionTaps = 0;
}
addEventListener('blur', () => { keys.clear(); if (stick.id !== null) stick.release(); if (steer.id !== null) steer.release(); btnId = null; });

const deadzone = (v, dz = DEAD) => Math.abs(v) < dz ? 0 : Math.sign(v) * (Math.abs(v) - dz) / (1 - dz);
const clamp = v => Math.max(-1, Math.min(1, v));

export function readInput() {
  const k = c => keys.has(c) ? 1 : 0;
  let throttle = Math.max(k('ArrowUp'), k('KeyW')) - Math.max(k('ArrowDown'), k('KeyS'));
  let turn = Math.max(k('ArrowRight'), k('KeyD')) - Math.max(k('ArrowLeft'), k('KeyA'));
  const style = settings.style;
  const hadAim = input.aim !== null;
  input.aim = null;

  if (style === 'point') {
    const strength = deadzone(Math.hypot(stick.x, stick.y));
    if (strength > 0) input.aim = { angle: Math.atan2(stick.x, -stick.y), strength };
  } else if (style === 'sliders') {
    throttle += deadzone(-stick.y);
    turn += deadzone(steer.x, STEER_DEAD);
  } else {   // tank
    throttle += deadzone(-stick.y);
    turn += deadzone(stick.x, STEER_DEAD);
  }
  input.aimNew = input.aim !== null && (!hadAim || stick.fresh);
  stick.fresh = false;
  input.throttle = clamp(throttle);
  input.turn = clamp(turn);
  input.action = enabled && (keys.has('Space') || btnId !== null);
  btn.classList.toggle('pressed', input.action);
  return input;
}

// Call once per frame after the game has used actionTaps.
export function clearTaps() { input.actionTaps = 0; }
