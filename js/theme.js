// Stage 4B (Chetan, 2026-10-01): the secret love and hate modes. Typed into the small "Secret" box on the start screen, NOT the room-code box.
//
// PRIVACY (a hard rule: the game is a public web page). Nothing readable about the modes is in this file or anywhere in the code:
//   - js/secret.js holds, for each mode, only an AES-GCM encrypted blob (and its random salt and iv). The key is made from the typed phrase
//     with PBKDF2-SHA-256 at 600,000 rounds, so every guess costs real time. There is no separate stored hash: the encryption's own check
//     tag is the test, so a wrong phrase simply fails to open the blob. The blob holds the mode's kind and its messages.
//   - unlock() always does exactly the same work, whatever was typed: an empty box, a wrong phrase and a right one all derive both keys and
//     try both blobs, and only the right one opens anything. Nothing on screen differs between an empty box and a wrong phrase.
//   - The phrases and the messages are only in PROJECT.md (section 11) and tools/make_secret.html, which are never published.
// What a determined person could still learn: the file tells them there are two modes and how big the messages are; with enough computing
// time they could try phrases against the blobs, so a short phrase can be guessed by someone who tries the obvious ones (the slow key
// derivation makes each try cost time, it does not make a guess impossible).
//
// Both phones: the phone that typed the phrase opens the blob and hands the (decrypted) theme to the referee, which puts it in the match
// (rules.js `theme`), so both phones always show the same thing; nothing here is sent between the phones directly.
import { SECRET } from './secret.js';
import { seeded } from './eggs.js';
import { RULES } from './rules.js';

const $ = id => document.getElementById(id);
export const normalize = s => String(s || '').toLowerCase().replace(/[^a-z0-9]+/g, '');
const b64 = s => Uint8Array.from(atob(s), c => c.charCodeAt(0));
const AAD = new TextEncoder().encode('tank-battle-secret-v1');

async function open(mode, pw) {
  const base = await crypto.subtle.importKey('raw', pw, 'PBKDF2', false, ['deriveKey']);
  const key = await crypto.subtle.deriveKey({ name: 'PBKDF2', salt: b64(mode.salt), iterations: SECRET.n, hash: 'SHA-256' }, base, { name: 'AES-GCM', length: 256 }, false, ['decrypt']);
  try {
    return JSON.parse(new TextDecoder().decode(await crypto.subtle.decrypt({ name: 'AES-GCM', iv: b64(mode.iv), additionalData: AAD }, key, b64(mode.data))));
  } catch (e) { return null; }   // the wrong phrase: the check tag does not match
}
// The theme { k, s, w, l, x } the phrase opens, or null. The same work for every input (see above).
export async function unlock(phrase) {
  const pw = new TextEncoder().encode('tb:' + normalize(phrase));
  const all = await Promise.all(SECRET.modes.map(m => open(m, pw).catch(() => null)));
  return all.find(Boolean) || null;
}

// ---- the box and what it arms ------------------------------------------------------------------------------------------------
let armed = null;
export const getArmed = () => armed;
export function disarm() { armed = null; document.documentElement.removeAttribute('data-armed'); }
// Wire the box. A right phrase arms the theme for the next match (the start screen takes on its look); anything else, including nothing, does nothing at all.
export function initSecretBox(onArm) {
  const input = $('secret-in');
  if (!input) return;
  let busy = false;
  const submit = async () => {
    if (busy) return;
    busy = true;
    const v = input.value;
    input.value = '';
    input.blur();
    const t = await unlock(v).catch(() => null);
    busy = false;
    if (!t) return;
    armed = t;
    document.documentElement.dataset.armed = t.k;
    onArm?.(t);
  };
  input.addEventListener('keydown', e => { if (e.key === 'Enter') { e.preventDefault(); submit(); } });
  input.addEventListener('change', () => { if (input.value) submit(); });
}

// ---- the look: hearts, tints, cracks, flashes (CSS in index.html, driven by data-theme on the page) -----------------------------
// Love (strong): warm light, a pink glow, hearts floating up (not on Low graphics). Hate (subtle): a faint red tint, thin cracks in the corners, a brief
// red flash now and then. Both leave the orange and blue tanks easy to tell apart. All of it only paints over the picture or tints the tanks and lights;
// nothing here knows where a tank is, so it can never show one.
export function buildHearts() {
  const box = $('th-hearts');
  if (!box || box.childElementCount) return;
  const r = seeded(7, 7, 7);
  for (let i = 0; i < 16; i++) {
    const h = document.createElement('i');
    h.style.cssText = `left:${Math.round(r() * 96)}%;--s:${Math.round(14 + r() * 22)}px;--d:${(7 + r() * 5).toFixed(1)}s;--w:${(-r() * 12).toFixed(1)}s;--x:${Math.round((r() - 0.5) * 60)}px`;
    box.appendChild(h);
  }
}
// The red flashes of the hate theme: a fixed schedule from the match number and the round, so both phones flash together. A flash is one soft
// pulse (never a flicker, never more than one every ten seconds or so).
export const FLASH = { first: 12, gap: 16, jitter: 5, length: 0.5 };
const TIMES = new Map();
export function flashTimes(mid, round) {
  const key = mid * 10 + round;
  if (!TIMES.has(key)) {
    if (TIMES.size > 40) TIMES.clear();
    const r = seeded(mid, round, 5), out = [];
    for (let t = FLASH.first + r() * 6; t < RULES.round - 8; t += FLASH.gap + (r() - 0.5) * 2 * FLASH.jitter) out.push(t);
    TIMES.set(key, out);
  }
  return TIMES.get(key);
}
// 0..1: how bright a flash is `t` seconds into the round
export function flashAt(mid, round, t) {
  for (const f of flashTimes(mid, round)) { const u = t - f; if (u >= 0 && u < FLASH.length) return (1 - u / FLASH.length) ** 2; }
  return 0;
}
