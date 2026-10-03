// Loading tips. A quiet line of silly text under the status while a phone connects, waits for the other
// player or waits for the models to load. The texts are in lines.js (TIPS). They are random and local to each phone: they carry
// no game information, so the two phones need not agree. One shuffled bag feeds every line that is showing, so a tip never repeats before all have shown.
import { tipBag } from './lines.js';

const EVERY = 3400;    // ms each tip stays
const FADE = 350;      // ms to fade out before the next one
const next = tipBag();
const active = new Set();
let timer = 0;

function rotate() {
  for (const el of active) {
    el.classList.add('swap');
    setTimeout(() => { if (active.has(el)) { el.textContent = next(); el.classList.remove('swap'); } }, FADE);
  }
}
export function tipOn(el) {
  if (!el || active.has(el)) return;
  active.add(el);
  el.classList.remove('swap');
  el.textContent = next();
  if (!timer) timer = setInterval(rotate, EVERY);
}
export function tipOff(el) {
  if (!el) return;
  active.delete(el);
  el.textContent = '';
  el.classList.remove('swap');
  if (!active.size && timer) { clearInterval(timer); timer = 0; }
}
