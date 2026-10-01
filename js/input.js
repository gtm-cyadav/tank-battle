// Player input: two fixed sliders (speed, steering) and one action button (FIRE for the hunter, SPRINT for the hider),
// plus the keyboard for desktop testing (arrows or WASD drive, Space is the action button).
// The sliders never move. A touch starts a slider only on that slider's own ring (and a thumb's width of grab room round it);
// the corner map, the figure's poke circle, every button and all the free space in the middle take no slider touches.
// Controls changed 2026-10-02 (Chetan): point-to-drive and the original tank style are gone; fixed sliders only.
import { settings, onSettings } from './settings.js';

const $ = id => document.getElementById(id);
const root = document.documentElement;
const DEAD = 0.14;          // speed slider: ignore tiny thumb wobbles (fraction of full push)
const STEER_DEAD = 0.18;    // steering slider: a wider middle band counts as dead straight
const TRAVEL = { speed: 48, steer: 56 };   // px of knob travel to full speed / full steering at 100% size (was 64 / 76)

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
const releaseAll = () => { if (speed.id !== null) speed.release(); if (steer.id !== null) steer.release(); };

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

export function readInput() {
  const k = c => keys.has(c) ? 1 : 0;
  const throttle = Math.max(k('ArrowUp'), k('KeyW')) - Math.max(k('ArrowDown'), k('KeyS')) + deadzone(-speed.y);
  const turn = Math.max(k('ArrowRight'), k('KeyD')) - Math.max(k('ArrowLeft'), k('KeyA')) + deadzone(steer.x, STEER_DEAD);
  input.throttle = clamp(throttle);
  input.turn = clamp(turn);
  input.action = enabled && (keys.has('Space') || btnId !== null);
  btn.classList.toggle('pressed', input.action);
  return input;
}

export const inputEnabled = () => enabled;   // the poke (main.js) only listens while the controls are live

// Call once per frame after the game has used actionTaps.
export function clearTaps() { input.actionTaps = 0; }
