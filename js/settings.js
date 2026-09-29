// Player settings (gear icon): control style, turning speed, joystick size and side, action button size and
// position, camera height and distance, corner map on or off (1e). Saved on the phone, so they survive closing the game.
// Requested after the first real-device test (2026-09-29): driving straight was hard and
// "up = forward" felt wrong, so point-to-drive is the default style.
const $ = id => document.getElementById(id);
const KEY = 'tank-battle.settings.v1';

export const DEFAULTS = {
  style: 'point',       // 'point' (push where you want to go) | 'sliders' (speed + steering sliders) | 'tank' (original)
  turnSpeed: 100,       // % of the normal turning speed
  stickSize: 100,       // % of the normal joystick size
  stickSide: 'left',    // which side the joystick (or speed slider) goes; the action button takes the other side
  btnSize: 100,         // % of the normal action button size
  btnHeight: 26,        // px up from the bottom edge
  btnEdge: 26,          // px in from the side edge
  camHeight: 3.0,       // m; the camera code still keeps it under the wall tops (fairness)
  camDistance: 7.5,     // m behind the tank
  map: 'on',            // corner map (walls and your own tank): 'on' | 'off'
};

// Slider ranges and labels. Camera height tops out at 3.8 m: with the squeeze rise it still stays under the 4.5 m walls.
const SLIDERS = {
  turnSpeed: { min: 50, max: 150, step: 5, show: v => v + '%' },
  stickSize: { min: 70, max: 140, step: 5, show: v => v + '%' },
  btnSize: { min: 70, max: 140, step: 5, show: v => v + '%' },
  btnHeight: { min: 10, max: 180, step: 2, show: v => v + ' px' },
  btnEdge: { min: 10, max: 180, step: 2, show: v => v + ' px' },
  camHeight: { min: 1.8, max: 3.8, step: 0.1, show: v => v.toFixed(1) + ' m' },
  camDistance: { min: 4, max: 10, step: 0.5, show: v => v.toFixed(1) + ' m' },
};
const CHOICES = { style: ['point', 'sliders', 'tank'], stickSide: ['left', 'right'], map: ['on', 'off'] };
const STYLE_NOTES = {
  point: 'Push the way you want to go. The tank turns to face it, then drives dead straight. Pull back to turn round.',
  sliders: 'One thumb slides up and down for speed, the other slides left and right to steer. The middle of the steering slider is dead straight.',
  tank: 'Up drives forward, down reverses, left and right turn on the spot.',
};

function load() {
  let saved = {};
  try { saved = JSON.parse(localStorage.getItem(KEY)) || {}; } catch (e) { /* private mode or blocked: use defaults */ }
  const s = { ...DEFAULTS };
  for (const k in SLIDERS) {
    const v = Number(saved[k]);
    if (Number.isFinite(v)) s[k] = Math.max(SLIDERS[k].min, Math.min(SLIDERS[k].max, v));
  }
  for (const k in CHOICES) if (CHOICES[k].includes(saved[k])) s[k] = saved[k];
  return s;
}

export const settings = load();
const listeners = [];
export const onSettings = fn => { listeners.push(fn); fn(settings); };

function changed() {
  try { localStorage.setItem(KEY, JSON.stringify(settings)); } catch (e) { /* can't save: still applies for this visit */ }
  for (const fn of listeners) fn(settings);
  render();
}

// ---- the panel ------------------------------------------------------------------------------------------------
function render() {
  for (const k in SLIDERS) {
    const input = $('set-' + k);
    input.value = settings[k];
    $('val-' + k).textContent = SLIDERS[k].show(settings[k]);
  }
  for (const k in CHOICES) {
    for (const b of document.querySelectorAll(`[data-set="${k}"]`)) b.setAttribute('aria-pressed', b.dataset.value === settings[k]);
  }
  $('style-note').textContent = STYLE_NOTES[settings.style];
  // wording follows the style: "Joystick" or "Speed slider"
  $('stick-title').textContent = settings.style === 'sliders' ? 'Sliders' : 'Joystick';
  $('stick-side-label').textContent = settings.style === 'sliders' ? 'Speed slider side' : 'Side';
}

export function initSettings(onOpenChange) {
  for (const k in SLIDERS) {
    const input = $('set-' + k);
    Object.assign(input, { min: SLIDERS[k].min, max: SLIDERS[k].max, step: SLIDERS[k].step });
    input.addEventListener('input', () => { settings[k] = Number(input.value); changed(); });
  }
  for (const b of document.querySelectorAll('[data-set]')) {
    b.addEventListener('click', () => { settings[b.dataset.set] = b.dataset.value; changed(); });
  }
  $('set-reset').addEventListener('click', () => { Object.assign(settings, DEFAULTS); changed(); });
  const open = on => {
    $('settings').hidden = !on;
    document.documentElement.toggleAttribute('data-settings', on);
    if (on) $('settings-panel').scrollTop = 0;
    onOpenChange(on);
  };
  for (const g of document.querySelectorAll('.gear')) g.addEventListener('click', () => open(true));
  $('set-done').addEventListener('click', () => open(false));
  render();
}
