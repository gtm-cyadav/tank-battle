// The leader picker (Stage 3A, Chetan 2026-09-30): a full-screen list of all 36 leaders grouped by era, plus one Random
// card at the top. Each card shows a small look at the figure (a slice of one picture, models/faces.webp), the flag,
// the parody name and the country / era. Shown before each two-player match (after both phones are in, before the
// coin toss) and before Drive alone (where you also choose the parked tank's leader).
//   Two players: tap a card, then Ready; Change takes the Ready back until the other player is Ready too.
//   Drive alone: the tabs You / Parked tank say whose leader a tap sets; Start begins.
// The last choice is remembered on the phone. What the choice means for the match is rules.js (referee draws Random).
import { LEADERS, GROUPS, COUNT } from './leaders.js';
import { drawFlag } from './flags.js';

const $ = id => document.getElementById(id);
const KEY = 'tank-battle.pick';
const ATLAS = 6;   // faces.webp is 6 x 6 cells

let hooks = null;              // ready(n, ok), start(me, other), leave()
let solo = false, who = 'me';  // Drive alone: which tab
let choice = { me: 0, other: 0 };
let locked = false;            // two players: Ready is on
let built = false;
let theirs = false;

// remembered on the phone (localStorage); this tab's own copy (sessionStorage) wins, so a refresh mid-pick restores exactly what this tab had
const read = st => { try { const c = JSON.parse(st.getItem(KEY)); if (c && Number.isInteger(c.me) && Number.isInteger(c.other)) return c; } catch (e) { /* storage blocked */ } return null; };
const load = () => read(sessionStorage) || read(localStorage) || { me: 0, other: 0 };
const save = () => { for (const st of [localStorage, sessionStorage]) { try { st.setItem(KEY, JSON.stringify(choice)); } catch (e) { /* storage blocked */ } } };
export const savedChoice = () => load();
const cur = () => choice[solo ? who : 'me'];
const validN = n => Number.isInteger(n) && n >= 0 && n <= COUNT;

function facePos(el, n) {
  const i = n - 1, col = i % ATLAS, row = Math.floor(i / ATLAS);
  el.style.backgroundPosition = `${(col / (ATLAS - 1)) * 100}% ${(row / (ATLAS - 1)) * 100}%`;
}

function build() {
  if (built) return;
  built = true;
  const list = $('pk-list'), frag = document.createDocumentFragment();
  const card = n => {
    const b = document.createElement('button');
    b.type = 'button'; b.className = 'pk-card'; b.dataset.n = n; b.setAttribute('role', 'option');
    const face = document.createElement('i'); face.className = 'pk-face';
    const nm = document.createElement('b'), pl = document.createElement('span');
    if (n) {
      facePos(face, n);
      const f = document.createElement('canvas'); f.className = 'pk-fl'; f.width = 72; f.height = 48; drawFlag(f, n);
      nm.textContent = LEADERS[n].name; pl.textContent = LEADERS[n].place;
      b.append(face, f, nm, pl);
    } else {
      face.className = 'pk-face pk-rand'; face.textContent = '?';
      nm.textContent = 'Random'; pl.textContent = 'Drawn when the match starts';
      b.append(face, nm, pl);
    }
    return b;
  };
  const head = t => { const h = document.createElement('h3'); h.className = 'pk-h'; h.textContent = t; return h; };
  const rand = document.createElement('div'); rand.className = 'pk-grid'; rand.append(card(0));
  frag.append(rand);
  GROUPS.forEach((g, gi) => {
    const ns = []; for (let n = 1; n <= COUNT; n++) if (LEADERS[n].group === gi) ns.push(n);
    if (!ns.length) return;
    const wrap = document.createElement('section'); wrap.className = 'pk-group';
    const grid = document.createElement('div'); grid.className = 'pk-grid';
    for (const n of ns) grid.append(card(n));
    wrap.append(head(g), grid); frag.append(wrap);
  });
  list.append(frag);
  list.addEventListener('click', e => {
    const c = e.target.closest('.pk-card');
    if (!c || locked) return;
    pick(+c.dataset.n);
  });
}

function pick(n) {
  choice[solo ? who : 'me'] = n;
  save();
  render();
}

// the side panel and the highlighted card
function render() {
  const n = cur(), L = LEADERS[n];
  for (const c of $('pk-list').querySelectorAll('.pk-card')) {
    const on = +c.dataset.n === n;
    if (c.classList.contains('on') !== on) { c.classList.toggle('on', on); c.setAttribute('aria-selected', on); }
  }
  $('pk-name').textContent = n ? L.name : 'Random';
  $('pk-place').textContent = n ? L.place : 'A leader is drawn when the match starts.';
  const fig = $('pk-fig'); fig.classList.toggle('pk-rand', !n); fig.textContent = n ? '' : '?';
  if (n) facePos(fig, n);
  const fc = $('pk-flag'), g = fc.getContext('2d');
  if (n) drawFlag(fc, n); else g.clearRect(0, 0, fc.width, fc.height);
  fc.style.visibility = n ? 'visible' : 'hidden';
  $('pk-list').classList.toggle('locked', locked);
  const go = $('pk-go');
  go.textContent = solo ? 'Start' : locked ? 'Change' : 'Ready';
  go.classList.toggle('secondary', !solo && locked);
  $('pk-status').textContent = solo ? '' : locked ? (theirs ? 'Both ready.' : 'Waiting for the other player.') : theirs ? 'The other player is ready.' : '';
  for (const t of $('pk-tabs').querySelectorAll('button')) t.setAttribute('aria-pressed', t.dataset.who === who);
}

export const pickerOpen = () => !$('pick').hidden;

// Show the picker. Two players: the phone's remembered choice; ready = already Ready (a refresh mid-pick).
// Drive alone: opts.solo, with the remembered pair (or a testing override).
export function openPicker(opts = {}) {
  build();
  solo = !!opts.solo; who = 'me'; theirs = false;
  choice = load();
  if (validN(opts.me)) choice.me = opts.me;
  if (validN(opts.other)) choice.other = opts.other;
  locked = !solo && !!opts.ready;
  $('pk-over').textContent = solo ? 'Drive alone' : 'Choose your leader';
  $('pk-tabs').hidden = !solo;
  $('pk-leave').textContent = solo ? 'Back' : 'Leave';
  $('pick').hidden = false;
  render();
  hooks.changed?.();
  const on = $('pk-list').querySelector('.pk-card.on');
  if (on) on.scrollIntoView({ block: 'center' });
  else $('pk-list').scrollTop = 0;
}
export function closePicker() {
  if ($('pick').hidden) return;
  $('pick').hidden = true;
  hooks.changed?.();
}
// The referee's match said whether the other player is Ready (two players)
export function pickerSync(other) {
  if (theirs === other) return;
  theirs = other;
  if (pickerOpen()) render();
}
export const pickerChoice = () => ({ ...choice });

export function initPicker(h) {
  hooks = h;
  $('pk-go').addEventListener('click', () => {
    if (solo) { hooks.start(choice.me, choice.other); return; }
    locked = !locked;
    render();
    hooks.ready(choice.me, locked);
  });
  $('pk-leave').addEventListener('click', () => { if (solo) closePicker(); else hooks.leave(); });
  for (const t of $('pk-tabs').querySelectorAll('button')) t.addEventListener('click', () => { who = t.dataset.who; render(); const on = $('pk-list').querySelector('.pk-card.on'); on?.scrollIntoView({ block: 'nearest' }); });
}
