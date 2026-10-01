// Stage 3B (Chetan, 2026-10-01): the "watching" speech bubble. Once at the start of a round, on your own screen only, a small
// bubble near the top for 4 seconds, then gone. It never takes touches. It is placed where it covers nothing: it looks for
// the highest spot (then the most central) that clears the round chip and its ping-text slot, the corner map, the room
// label, the top-right buttons, a notice, the action button and the joystick / sliders where they rest, and stays inside the
// notch margins. If a very cramped layout leaves no clear spot (the biggest button and stick at once on a small phone), it
// takes the least bad one and says so in data-clear="no" (testing only).
const $ = id => document.getElementById(id);
const SHOW = 4000, GAP = 6;   // ms on screen; px of air kept round every other thing
// How much it matters to cover each thing: HARD things (the clock, ping text, corner map, buttons, the action button, fixed sliders) are
// never covered if any spot avoids them; SOFT things (the room label, a notice, the faint resting ring of the floating joystick) are only
// covered when no spot clears everything, which happens only with the biggest button and joystick pushed well into the screen.
export const HARD = 100, SOFT = 1;

let timer = 0;

const visible = el => el && !el.hidden && getComputedStyle(el).display !== 'none' && getComputedStyle(el).visibility !== 'hidden';
const box = (el, w = HARD) => { const r = el.getBoundingClientRect(); return r.width > 0 && r.height > 0 ? { l: r.left, t: r.top, r: r.right, b: r.bottom, w } : null; };
const hit = (a, c) => !(a.r <= c.l || c.r <= a.l || a.b <= c.t || c.b <= a.t);

// every rectangle the bubble must stay clear of (the ping text's slot is kept free even while it is empty)
export function obstacles() {
  const out = [], add = (id, ok = true) => { const el = $(id); if (ok && visible(el)) { const b = box(el); if (b) out.push(b); } };
  const chip = $('rh').querySelector('.chip');
  if (visible($('rh')) && chip) {
    const c = box(chip);
    if (c) {
      out.push(c);
      const cx = (c.l + c.r) / 2, note = $('rh-note'), nb = note.textContent ? box(note) : null;
      out.push(nb ? { l: Math.min(nb.l, cx - 165), r: Math.max(nb.r, cx + 165), t: c.b, b: Math.max(nb.b, c.b + 36), w: HARD } : { l: cx - 165, r: cx + 165, t: c.b, b: c.b + 36, w: HARD });
    }
  }
  add('cmap'); add('menu-btn'); add('gear'); add('fs-again'); add('action');
  add('steer');
  const sliders = document.documentElement.dataset.style === 'sliders';
  const soft = (id, ok = true) => { const el = $(id); if (ok && visible(el)) { const b = box(el, SOFT); if (b) out.push(b); } };
  soft('hud'); soft('toast', $('toast').classList.contains('show'));
  if (sliders) add('stick'); else soft('stick');   // the speed slider is a fixed control; the joystick floats to wherever the thumb lands
  return out;
}

function margins() {
  const s = getComputedStyle($('safe')), n = k => parseFloat(s[k]) || 0;
  return { l: Math.max(12, n('paddingLeft')), r: Math.max(12, n('paddingRight')), t: Math.max(10, n('paddingTop')), b: Math.max(10, n('paddingBottom')) };
}

// the best spot for a bubble of this size: { x, y, clear } (the first clear one, highest then most central; if none is clear,
// the one that covers the least)
function place(w, h, avoid, m, low = 0.55) {
  const W = innerWidth, H = innerHeight, tail = 8;
  const top = Math.max(m.t, 0), bottomMax = H * low;
  let best = null;
  for (let y = top; y + h + tail <= bottomMax; y += 3) {
    for (let k = 0; k < 120; k++) {
      const x = W / 2 - w / 2 + (k % 2 ? 1 : -1) * Math.ceil(k / 2) * 6;
      if (x < m.l || x + w > W - m.r) continue;
      const r = { l: x - GAP, t: y - GAP, r: x + w + GAP, b: y + h + tail + GAP };
      let area = 0;
      for (const o of avoid) if (hit(r, o)) area += o.w * (Math.min(r.r, o.r) - Math.max(r.l, o.l)) * (Math.min(r.b, o.b) - Math.max(r.t, o.t));
      if (!area) return { x, y, clear: true };
      if (!best || area < best.area) best = { x, y, area, hard: avoid.some(o => o.w >= HARD && hit(r, o)) };
    }
  }
  return best && { ...best, clear: false };
}

export function showBubble(text) {
  const el = $('bubble');
  if (!el || !text) return;
  clearTimeout(timer);
  el.textContent = text;
  el.hidden = false; el.classList.remove('show');   // laid out (and see-through) so it can be measured
  const m = margins(), avoid = obstacles(), room = innerWidth - m.l - m.r;
  let spot = null, size = null;
  for (const maxw of [280, 230, 185, 150, 120]) {
    el.style.maxWidth = Math.min(maxw, room) + 'px';
    el.style.left = '0px'; el.style.top = '0px';
    const r = el.getBoundingClientRect();
    const s = place(r.width, r.height, avoid, m);
    if (s && (!spot || (s.clear && !spot.clear) || (!s.clear && !spot.clear && s.area < spot.area))) { spot = s; size = r; }
    if (spot?.clear) break;
  }
  if (!spot?.clear) {   // Stage 4A: the two-leader bump bubble is taller; if nothing near the top clears everything, look further down the screen too
    for (const maxw of [280, 230, 185]) {
      el.style.maxWidth = Math.min(maxw, room) + 'px';
      el.style.left = '0px'; el.style.top = '0px';
      const r = el.getBoundingClientRect();
      const s = place(r.width, r.height, avoid, m, 0.85);
      if (s && (!spot || (s.clear && !spot.clear) || (!s.clear && !spot.clear && s.area < spot.area))) { spot = s; size = r; }
      if (spot?.clear) break;
    }
  }
  if (!spot) { el.style.left = m.l + 'px'; el.style.top = m.t + 'px'; spot = { x: m.l, y: m.t, clear: false }; size = el.getBoundingClientRect(); }
  el.style.maxWidth = Math.min(size.width, room) + 'px';   // keep the width it was measured at
  el.style.left = spot.x + 'px'; el.style.top = spot.y + 'px';
  el.style.setProperty('--tx', Math.max(14, Math.min(size.width - 14, innerWidth / 2 - spot.x)) + 'px');   // the tail points at the middle of the screen
  el.dataset.clear = spot.clear ? 'yes' : spot.hard ? 'no' : 'soft';   // 'soft': only the room label, a notice or the resting joystick ring are under it
  el.hidden = false;
  void el.offsetWidth;
  el.classList.add('show');
  timer = setTimeout(hideBubble, SHOW);
}
export function hideBubble() {
  clearTimeout(timer);
  const el = $('bubble');
  if (!el) return;
  el.classList.remove('show');
  el.hidden = true;
}
export const bubbleShowing = () => { const el = $('bubble'); return !!el && !el.hidden; };
