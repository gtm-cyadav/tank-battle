// One message at a time: notices, speech bubbles and first-time hints go through this one queue, so two of them
// never pile up on the screen. One shows at a time; the rest wait their turn.
//   - Priority: a notice (pri 2) > a bubble (pri 1) > a hint (pri 0). A higher one that arrives cuts in: the one showing steps aside and comes back
//     afterwards with the time it had left (a hint is simply asked for again later). Same or lower priority waits, in order.
//   - The ping alarm always wins: while the big ping number counts down (html[data-bign]), and while the 1.5 s round-start flash shows (html[data-flash]),
//     nothing from the queue shows; the one that was showing is paused and carries on afterwards. main.js calls pump() when either changes.
//   - A message that waited too long (its `wait`, default 8 s) is dropped; `still()` false drops it too (a bubble whose round is over).
// Each item: { kind, pri, ms, show(), hide(), on() (still on screen? false once something else took it down), still?(), key?, wait?, done?(ms shown) }.
import { TESTING } from './debug.js';
const root = document.documentElement;
const now = () => performance.now();
let cur = null;            // the item on screen, or paused: { ...item, left (ms to go), since (when it last went up), up (on screen now), shownFor (ms) }
const queue = [];
let timer = 0;

const blocked = () => root.hasAttribute('data-bign') || root.hasAttribute('data-flash');

// take the current one off the screen, keeping the time it has left
function pause(c) {
  clearTimeout(timer);
  if (!c.up) return;
  const ran = now() - c.since;
  c.shownFor = (c.shownFor || 0) + ran; c.left = Math.max(0, c.left - ran); c.up = false;
  c.hide();
}
// the current one is over (or dropped): it is gone for good
function close() {
  const c = cur;
  if (!c) return;
  cur = null;
  pause(c);
  c.done?.(c.shownFor || 0);
}
function put(c) {
  cur = c;
  c.up = true; c.since = now();
  c.show();
  if (!c.on()) { c.up = false; c.left = 0; close(); return false; }   // nothing to show any more
  clearTimeout(timer);
  timer = setTimeout(() => { if (cur === c) { pause(c); c.left = 0; close(); pump(); } }, c.left);
  return true;
}
// the current one steps aside for a higher one: back in the queue at the front of its rank (a hint is just closed; it is asked for again later)
function stepAside() {
  const c = cur;
  pause(c);
  cur = null;
  if (c.left > 250 && c.pri > 0) queue.push({ ...c, at: now() - 60000, wait: 1e9 });
  else c.done?.(c.shownFor || 0);
}
// something outside took the current one down (a test, a new card): forget it
function settle() { if (cur?.up && !cur.on()) { cur.up = false; cur.left = 0; close(); } }

// Look at the queue: pause for the ping or the flash, show the next one.
export function pump() {
  settle();
  if (blocked()) { if (cur?.up) pause(cur); return; }
  const t = now();
  for (let i = queue.length - 1; i >= 0; i--) if (t - queue[i].at > (queue[i].wait ?? 8000) || (queue[i].still && !queue[i].still())) queue.splice(i, 1)[0].done?.(0);
  queue.sort((a, b) => b.pri - a.pri || a.at - b.at);
  if (cur && !cur.up) {   // paused: carry on, unless a higher one is waiting or it no longer applies
    if (queue[0] && queue[0].pri > cur.pri) stepAside();
    else if (cur.left > 250 && (!cur.still || cur.still())) { put(cur); return; }
    else { cur.left = 0; close(); }
  }
  while (!cur && queue.length) put(queue.shift());
}

// Put a message in the queue. It shows at once if nothing else is on screen (or it outranks what is).
export function say(item) {
  settle();
  item = { ...item, at: now(), left: item.ms, up: false, shownFor: 0 };
  if (item.key && cur?.key === item.key && cur.up) { cur.left = item.ms; put(cur); return; }   // the same notice again while it shows: drawn afresh, full time
  if (item.key && (cur?.key === item.key || queue.some(q => q.key === item.key))) return;   // the same notice is already waiting (or paused)
  if (cur && item.pri > cur.pri && !blocked()) stepAside();
  queue.push(item);
  pump();
}

// Drop every message of this kind, showing or waiting (e.g. all bubbles when a card comes up).
export function drop(kind) {
  for (let i = queue.length - 1; i >= 0; i--) if (queue[i].kind === kind) queue.splice(i, 1)[0].done?.(0);
  if (cur?.kind === kind) { cur.left = 0; close(); pump(); }
}
// End the current one early if it has this key (a hint whose thing was just done, a notice whose Undo was tapped)
export function end(key) { if (cur?.key === key) { cur.left = 0; close(); pump(); } }
export const showing = () => cur?.up ? cur.kind : null;
export const waiting = () => queue.map(q => q.kind);
if (TESTING) window.__say = { showing, waiting, pump };   // testing only (security Stage 4: not on the real site, see debug.js)
