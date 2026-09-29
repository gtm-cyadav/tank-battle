// Player input, boiled down to throttle (-1 back .. 1 forward), turn (-1 left .. 1 right) and one action button
// (FIRE for the hunter, SPRINT for the hider). Two sources, merged every frame:
//   phone: floating joystick on the left half of the screen + a round action button on the right;
//   desktop testing: arrows or WASD to drive, Space for the action button.
const $ = id => document.getElementById(id);

const STICK_R = 56;         // px the knob can travel from the centre
const DEAD = 0.14;          // ignore tiny thumb wobbles (fraction of full push)
const EDGE = 14;            // keep the whole joystick ring this far inside the screen

export const input = { throttle: 0, turn: 0, action: false, actionTaps: 0 };

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

// ---- touch joystick -------------------------------------------------------------------------------------------
const zone = $('stick-zone'), ring = $('stick'), knob = $('knob'), btn = $('action');
const stick = { id: null, ox: 0, oy: 0, x: 0, y: 0 };   // ox/oy = ring centre, x/y = knob offset (-1..1)
// notch / rounded-corner margins, measured from a hidden element padded with env(safe-area-inset-*)
const inset = side => parseFloat(getComputedStyle($('safe'))['padding-' + side]) || 0;

// keep receiving a finger's moves even when it slides off the element (can refuse, e.g. for simulated test touches)
const capture = (el, id) => { try { el.setPointerCapture(id); } catch (e) { /* carry on without capture */ } };

function placeRing(cx, cy) {
  const r = STICK_R + 24 + EDGE;   // ring radius plus margin
  stick.ox = Math.max(inset('left') + r, Math.min(innerWidth / 2, cx));
  stick.oy = Math.max(r, Math.min(innerHeight - inset('bottom') - r, cy));
  ring.style.transform = `translate(${stick.ox}px, ${stick.oy}px)`;
}

function moveKnob(px, py) {
  let dx = px - stick.ox, dy = py - stick.oy;
  const d = Math.hypot(dx, dy);
  if (d > STICK_R) {
    // thumb went past the edge: drag the whole joystick along behind it, so reversing is instant
    placeRing(px - dx / d * STICK_R, py - dy / d * STICK_R);
    dx = px - stick.ox; dy = py - stick.oy;
  }
  const len = Math.min(1, Math.hypot(dx, dy) / STICK_R) || 0;
  const ang = Math.atan2(dy, dx);
  stick.x = Math.cos(ang) * len; stick.y = Math.sin(ang) * len;
  knob.style.transform = `translate(${stick.x * STICK_R}px, ${stick.y * STICK_R}px)`;
}

function releaseStick() {
  stick.id = null; stick.x = stick.y = 0;
  knob.style.transform = '';
  ring.classList.remove('active');
  ring.style.transform = '';   // back to its resting spot (set in CSS)
}

zone.addEventListener('pointerdown', e => {
  if (!enabled || stick.id !== null) return;
  stick.id = e.pointerId;
  capture(zone, e.pointerId);
  ring.classList.add('active');
  placeRing(e.clientX, e.clientY);
  moveKnob(e.clientX, e.clientY);
});
zone.addEventListener('pointermove', e => { if (e.pointerId === stick.id) moveKnob(e.clientX, e.clientY); });
for (const t of ['pointerup', 'pointercancel', 'lostpointercapture']) {
  zone.addEventListener(t, e => { if (e.pointerId === stick.id) releaseStick(); });
}

// ---- action button (FIRE / SPRINT) ----------------------------------------------------------------------------
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

// ---- shared ---------------------------------------------------------------------------------------------------
// Turn input on or off (off while the start screen, rotate message or leave prompt is showing). Off drops everything held.
export function setInputEnabled(on) {
  enabled = on;
  if (on) return;
  keys.clear();
  if (stick.id !== null) releaseStick();
  btnId = null;
  input.actionTaps = 0;
}
addEventListener('blur', () => { keys.clear(); if (stick.id !== null) releaseStick(); btnId = null; });

const deadzone = v => Math.abs(v) < DEAD ? 0 : Math.sign(v) * (Math.abs(v) - DEAD) / (1 - DEAD);

export function readInput() {
  const k = c => keys.has(c) ? 1 : 0;
  const kbThrottle = Math.max(k('ArrowUp'), k('KeyW')) - Math.max(k('ArrowDown'), k('KeyS'));
  const kbTurn = Math.max(k('ArrowRight'), k('KeyD')) - Math.max(k('ArrowLeft'), k('KeyA'));
  const clamp = v => Math.max(-1, Math.min(1, v));
  input.throttle = clamp(kbThrottle + deadzone(-stick.y));   // stick up = forward
  input.turn = clamp(kbTurn + deadzone(stick.x));
  input.action = enabled && (keys.has('Space') || btnId !== null);
  btn.classList.toggle('pressed', input.action);
  return input;
}

// Call once per frame after the game has used actionTaps.
export function clearTaps() { input.actionTaps = 0; }
