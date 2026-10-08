// Tiny first-time hints ("teach once, then never again"). Four moments, each shown once per phone and never again:
//   drive  - the two sliders (or the ring) the first time you drive (touch screens only),
//   hunter / hider - your goal in your first round as hunter, and as hider,
//   ping   - the first ping (the hider: "They see roughly here"; the hunter: "Hider is in the circle"),
//   ready  - the first Ready card.
// Each is a small pale pill with an icon and two or three words, a tail pointing at the thing; it stays 4 s, or goes as soon as you do the thing.
// It counts as seen once it has been on screen for 2 s (or you did the thing); then it never comes back. Settings > Hints > Show again brings
// them all back. They go through the one-message queue (say.js) at the lowest rank: any notice or bubble goes first. They never take touches.
// main.js decides WHEN (offerHint every frame while the moment holds) and WHAT (the words, the icon, the thing to point at).
import { say, end } from './say.js';
import { icon } from './icons.js';
import { TESTING } from './debug.js';

const KEY = 'tank-battle.hints.v1';
export const HINT_MS = 4000, SEEN_AFTER = 2000;
const $ = id => document.getElementById(id);
const load = () => { try { return JSON.parse(localStorage.getItem(KEY)) || {}; } catch (e) { return {}; } };
let seen = load();
const pending = new Set();
let active = null;   // { id, still } of the hint on screen
const save = () => { try { localStorage.setItem(KEY, JSON.stringify(seen)); } catch (e) { /* storage blocked: they show again next visit */ } };

export const hintSeen = id => !!seen[id];
export function markSeen(id) { if (!seen[id]) { seen[id] = 1; save(); } }
export function resetHints() { seen = {}; save(); }
// the player did the thing the hint is about: it is seen, and goes at once if it is showing
export function hintDone(id) { markSeen(id); end('hint:' + id); }

function margins() {
  const s = getComputedStyle($('safe')), n = k => parseFloat(s[k]) || 0;
  return { l: Math.max(12, n('paddingLeft')), r: Math.max(12, n('paddingRight')), t: Math.max(10, n('paddingTop')), b: Math.max(10, n('paddingBottom')) };
}
// what a pill keeps clear of: the corner map, the top-right buttons, the HUD row, FIRE / SPRINT, the sliders or the ring (all but the thing it points at)
const KEEP = ['cmap', 'menu-btn', 'gear', 'fs-again', 'action', 'stick', 'steer', 'ring-pad'];
function keepClear(anchor) {
  const out = [], card = document.documentElement.hasAttribute('data-card');   // while a card shows, the controls under it are off: only the HUD and the corner buttons count
  for (const el of [...(card ? ['cmap', 'menu-btn', 'gear', 'fs-again'] : KEEP).map($), $('rh')?.querySelector('.rh-top')]) {
    if (!el || el === anchor || el.hidden || getComputedStyle(el).display === 'none') continue;
    const r = el.getBoundingClientRect();
    if (r.width > 0 && r.height > 0) out.push(r);
  }
  return out;
}
const overlaps = (a, b) => !(a.r <= b.left || b.right <= a.l || a.b <= b.top || b.bottom <= a.t);
// put one pill next to a rectangle, on the first of `sides` where it fits the screen and covers nothing in `avoid` ('above' | 'below' | 'left' |
// 'right'); if no side is clear, the first side that fits the screen; the tail points at the middle of the rectangle
function place(pill, r, sides, avoid) {
  const W = innerWidth, H = innerHeight, m = margins(), pw = pill.offsetWidth, ph = pill.offsetHeight, gap = 10;
  const cx = (r.left + r.right) / 2, cy = (r.top + r.bottom) / 2;
  let best = null, fallback = null;
  for (const side of sides) {
    let x = side === 'left' ? r.left - gap - pw : side === 'right' ? r.right + gap : cx - pw / 2;
    let y = side === 'above' ? r.top - gap - ph : side === 'below' ? r.bottom + gap : cy - ph / 2;
    const fits = x >= m.l && x + pw <= W - m.r && y >= m.t && y + ph <= H - m.b;
    x = Math.max(m.l, Math.min(W - m.r - pw, x)); y = Math.max(m.t, Math.min(H - m.b - ph, y));
    const spot = { x, y, side }, box = { l: x - 4, t: y - 4, r: x + pw + 4, b: y + ph + 4 };
    if (fits && !avoid.some(a => overlaps(box, a))) { best = spot; break; }
    if (fits && !fallback) fallback = spot;
    if (!fallback && side === sides[sides.length - 1]) fallback = spot;
  }
  best ||= fallback;
  if (!best) return;
  pill.className = 'hpill ' + { above: 'dn', below: 'up', left: 'rt', right: 'lf' }[best.side];
  pill.style.left = best.x + 'px'; pill.style.top = best.y + 'px';
  pill.style.setProperty('--tx', Math.max(12, Math.min(pw - 12, cx - best.x)) + 'px');
  pill.style.setProperty('--ty', Math.max(10, Math.min(ph - 10, cy - best.y)) + 'px');
}

// Ask for a hint. parts: [{ text, ic, at: () => element (or null), sides }]; still(): the moment still holds (checked while it waits and shows).
// Nothing happens if it was seen, or is already waiting or showing.
export function offerHint(id, parts, still = () => true) {
  if (seen[id] || pending.has(id)) return;
  pending.add(id);
  const box = $('hints');
  say({
    kind: 'hint', pri: 0, ms: HINT_MS, key: 'hint:' + id, wait: 6000,
    still: () => !seen[id] && still(),
    show() {
      box.replaceChildren(...parts.map(p => { const el = document.createElement('span'); el.className = 'hpill'; el.innerHTML = icon(p.ic, 15); el.append(p.text); return el; }));
      box.hidden = false;
      parts.forEach((p, i) => {
        const a = p.at(), r = a?.getBoundingClientRect?.(), el = box.children[i];
        if (!(r && r.width > 0)) { el.hidden = true; return; }
        place(el, r, p.sides, [...keepClear(a), ...[...box.children].slice(0, i).map(c => c.getBoundingClientRect())]);   // and never on an earlier pill
      });
      box.dataset.id = id;
      active = { id, still };
    },
    hide() { box.hidden = true; box.replaceChildren(); delete box.dataset.id; active = null; },
    on: () => !box.hidden && box.dataset.id === id,
    done(ms) { pending.delete(id); if (ms >= SEEN_AFTER) markSeen(id); },
  });
}
// every frame (main.js): a hint whose moment is over (the card went, the ping ended) goes at once
export function hintsFrame() { if (active && !active.still()) end('hint:' + active.id); }
if (TESTING) window.__hints = { hintSeen, resetHints, get seen() { return { ...seen }; }, get pending() { return [...pending]; } };   // testing only (security Stage 4: not on the real site, see debug.js)
