// Player settings (gear icon): turning speed, slider size and side, action button size and
// position, camera height and distance, corner map on or off (1e), sound on or off and graphics high or low (2A). Saved on the phone, so they survive closing the game.
// Controls (2026-10-02, Chetan): the two fixed sliders are the only style. The old 'style' value that earlier versions saved
// (point-to-drive or tank) is simply never read, so a phone that saved either one loads with two sliders and no error.
// R3 (2026-10-02, Chetan): 'control' picks two sliders (the default) or the ring; anything else saved there loads as two sliders.
const $ = id => document.getElementById(id);
const KEY = 'tank-battle.settings.v1';

// An iPad-sized touch screen (shorter side 600 px or more) starts with the sliders and the button at 125%: they were drawn for a phone.
const TABLET = (() => { try { return matchMedia('(pointer: coarse)').matches && Math.min(screen.width, screen.height) >= 600; } catch (e) { return false; } })();

export const DEFAULTS = {
  turnSpeed: 100,       // % of the normal turning speed
  control: 'sliders',   // 'sliders' (speed + steering) | 'ring' (one round pad, tank-style)
  ringSize: TABLET ? 125 : 100,    // % of the normal ring size (150 px across)
  stickSize: TABLET ? 125 : 100,   // % of the normal slider size
  stickSide: 'left',    // which side the speed slider (or the ring) goes; the steering slider and the action button take the other side
  btnSize: TABLET ? 125 : 100,     // % of the normal action button size
  btnHeight: 26,        // px up from the bottom edge
  btnEdge: 26,          // px in from the side edge
  camHeight: 3.0,       // m; the camera code still keeps it under the wall tops (fairness)
  camDistance: 7.5,     // m behind the tank
  map: 'on',            // corner map (walls and your own tank): 'on' | 'off'
  sound: 'on',          // Stage 2A: 'on' | 'off' (mute)
  graphics: 'high',     // Stage 2A: 'high' | 'low' (low: no shadows, lower sharpness, fewer effects, for slow phones)
  assist: 'on',         // aim assist for the hunter (assist.js): 'on' | 'off'
  assistStrength: 'medium',   // 'light' | 'medium' | 'strong': the cone, 3 / 6 / 10 degrees
  chatter: 'full',      // R4: the leaders' speech bubbles (watching, bump, poke): 'full' (as before) | 'short' | 'off' (bubble.js chatter)
};

// Slider ranges and labels. Camera height tops out at 3.8 m: with the squeeze rise it still stays under the 4.5 m walls.
const SLIDERS = {
  turnSpeed: { min: 50, max: 150, step: 5, show: v => v + '%' },
  stickSize: { min: 70, max: 140, step: 5, show: v => v + '%' },
  ringSize: { min: 70, max: 140, step: 5, show: v => v + '%' },
  btnSize: { min: 70, max: 140, step: 5, show: v => v + '%' },
  btnHeight: { min: 10, max: 180, step: 2, show: v => v + ' px' },
  btnEdge: { min: 10, max: 180, step: 2, show: v => v + ' px' },
  camHeight: { min: 1.8, max: 3.8, step: 0.1, show: v => v.toFixed(1) + ' m' },
  camDistance: { min: 4, max: 10, step: 0.5, show: v => v.toFixed(1) + ' m' },
};
const CHOICES = { control: ['sliders', 'ring'], stickSide: ['left', 'right'], map: ['on', 'off'], sound: ['on', 'off'], graphics: ['high', 'low'], assist: ['on', 'off'], assistStrength: ['light', 'medium', 'strong'], chatter: ['full', 'short', 'off'] };

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
}

let openPanel = () => {};
export const openSettings = () => openPanel(true);   // from the in-game menu (1f)

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
  // R4: each row's long explanation sits behind a small "i" (closed until tapped; never saved)
  for (const b of document.querySelectorAll('.ib[data-note]')) b.addEventListener('click', () => { const n = $(b.dataset.note); n.hidden = !n.hidden; b.setAttribute('aria-expanded', String(!n.hidden)); });
  const open = on => {
    $('settings').hidden = !on;
    document.documentElement.toggleAttribute('data-settings', on);
    if (on) $('settings-panel').scrollTop = 0;
    onOpenChange(on);
  };
  openPanel = open;
  for (const g of document.querySelectorAll('.gear')) g.addEventListener('click', () => open(true));
  $('set-done').addEventListener('click', () => open(false));
  render();
}
