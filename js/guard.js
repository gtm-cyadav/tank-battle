// Security hardening, Stage 1 (see SECURITY_FIX_LOG.md): the one place where everything that arrives from the other phone is checked.
// The other phone is NOT trusted: a modified page can send anything. So every message is rebuilt here from scratch, field by field,
// with a fixed shape and fixed limits, before any other code sees it. A message that does not fit is dropped (null). Nothing in a
// rebuilt message is ever the other phone's own object, so extra or odd fields (and odd keys such as "__proto__") never get through.
//   cleanMessage(m, lim)  one message from the link ({ t: 'm' | 's' | 'f' | ... }) -> a clean copy, or null
//   cleanMatch(m, lim)    the referee's match state (also used for a match saved in the browser) -> a clean copy, or null
//   cleanTheme(p)         the love / hate theme: plain, length-limited text only
//   cleanRoom(r)          the room record the lobby keeps in the browser (for a refresh / reopen): a clean copy, or null
// lim: the RULES object from rules.js (round, rounds, wins, leaders, bumpMax). It is passed in so this file imports nothing from rules.js.
import { WEATHER_NAMES } from './weather.js';
import { BADGE_NAMES } from './eggs.js';
import { WIDTH, DEPTH } from './world.js';

const isObj = v => v !== null && typeof v === 'object' && !Array.isArray(v);
const SIDES = new Set(['host', 'guest']);
const PHASES = new Set(['pick', 'toss', 'play', 'break', 'over']);
const HOWS = new Set(['hit', 'time', 'gaveup']);
const WX = new Set(WEATHER_NAMES);
const BADGES = new Set(Object.keys(BADGE_NAMES));
const MARGIN = 8;   // m outside the walls a position may still be (it is clamped to this, never trusted further out)

// integer in [lo, hi] or undefined; number (finite, clamped to [lo, hi]) or undefined. undefined = "does not fit".
const int = (v, lo, hi) => Number.isInteger(v) && v >= lo && v <= hi ? v : undefined;
const num = (v, lo, hi) => typeof v === 'number' && Number.isFinite(v) ? Math.min(hi, Math.max(lo, v)) : undefined;
const bool = v => typeof v === 'boolean' ? v : undefined;
const bit = v => int(v, 0, 1);
const px = v => num(v, -WIDTH / 2 - MARGIN, WIDTH / 2 + MARGIN);   // a world x / z (clamped to the yard and a little beyond)
const pz = v => num(v, -DEPTH / 2 - MARGIN, DEPTH / 2 + MARGIN);
const yaw = v => num(v, -1000, 1000);
const oneOf = set => v => typeof v === 'string' && set.has(v) ? v : undefined;
const side = oneOf(SIDES);
// a value that may be absent (undefined -> the default) or null (allowed when `nullable`); anything else must pass f
const opt = (v, def, f) => v === undefined ? def : f(v);
const ok = (...vs) => vs.every(v => v !== undefined);

// { host, guest } where both pass f
const pair = (v, f) => { if (!isObj(v)) return undefined; const host = f(v.host), guest = f(v.guest); return ok(host, guest) ? { host, guest } : undefined; };
// { x, z } inside the yard, or undefined
const spot = v => { if (!isObj(v)) return undefined; const x = px(v.x), z = pz(v.z); return ok(x, z) ? { x, z } : undefined; };
const badges = v => { if (!Array.isArray(v) || v.length > 4 || !v.every(b => typeof b === 'string' && BADGES.has(b))) return undefined; return v.slice(); };

// ---- the theme (Stage 4B): plain strings, cut to 240 characters, with control and direction-changing characters taken out ----
const TEXT_BAD = /[\u0000-\u0009\u000b-\u001f\u007f‎‏‪-‮⁦-⁩]/g;   // keeps \n only
const text = v => typeof v === 'string' ? v.replace(TEXT_BAD, '').slice(0, 240) : '';
export function cleanTheme(p) {
  if (!isObj(p) || (p.k !== 'love' && p.k !== 'hate')) return null;
  return { k: p.k, s: text(p.s), w: text(p.w), l: text(p.l), x: text(p.x) };
}

// ---- the room record kept in the browser (lobby.js: sessionStorage / localStorage), used to rejoin after a refresh ------------------------------------------
// Same-origin data, but anything that can write to the page's storage must not be able to steer the game: the code, the tokens, the position and the saved
// match are all checked before they are used. (The match inside is rebuilt by cleanMatch when the rules start.)
const TOKEN = /^[0-9a-z]{3,40}$/;
export function cleanRoom(r) {
  if (!isObj(r)) return null;
  const tok = v => v === null || v === undefined ? null : typeof v === 'string' && TOKEN.test(v) ? v : undefined;
  const code = typeof r.code === 'string' && /^[A-HJ-NP-Z]{4}$/.test(r.code) ? r.code : undefined;
  const role = side(r.role), phase = oneOf(new Set(['waiting', 'playing']))(r.phase), t = num(r.t, 0, 1e15);
  const token = tok(r.token), key = tok(r.key), guestToken = tok(r.guestToken);
  const pos = r.pos === null || r.pos === undefined ? null : isObj(r.pos) ? (() => { const x = px(r.pos.x), z = pz(r.pos.z), y = yaw(r.pos.yaw); return ok(x, z, y) ? { x, z, yaw: y } : undefined; })() : undefined;
  const match = r.match === null || r.match === undefined ? null : isObj(r.match) ? r.match : undefined;   // (rebuilt by cleanMatch later)
  if (!ok(code, role, phase, t, token, key, guestToken, pos, match)) return null;
  return { code, role, phase, t, token, key, guestToken, pos, match };
}

// ---- the referee's match ----------------------------------------------------------------------------------------------
function cleanResult(r, lim) {
  if (r === null) return null;
  if (!isObj(r)) return undefined;
  const win = side(r.win), how = oneOf(HOWS)(r.how), left = num(r.left, 0, lim.round);
  if (!ok(win, how, left)) return undefined;
  const out = { win, how };   // keys in the referee's own order (rules.js: a surrender is { win, how, by, left }), so the guest's copy is the referee's to the byte
  if (r.by !== undefined) { const by = side(r.by); if (by === undefined) return undefined; out.by = by; }
  out.left = left;
  if (r.at !== undefined) { const at = spot(r.at); if (at === undefined) return undefined; out.at = at; }
  if (r.badges !== undefined) { const b = badges(r.badges); if (b === undefined) return undefined; out.badges = b; }
  return out;
}
function cleanLog(list, lim) {
  if (!Array.isArray(list) || list.length > lim.rounds) return undefined;
  const out = [];
  for (const r of list) {
    if (!isObj(r)) return undefined;
    const e = { h: side(r.h), w: side(r.w), how: oneOf(HOWS)(r.how), l: num(r.l, 0, lim.round), b: int(r.b, 0, 100), g: bit(r.g), s: bit(r.s), so: bit(r.so), sn: bit(r.sn), sh: int(r.sh, 0, 1e6), bd: badges(r.bd) };
    if (!ok(...Object.values(e))) return undefined;
    out.push(e);
  }
  return out;
}
export function cleanMatch(m, lim) {
  if (!isObj(m)) return null;
  const mid = int(m.mid, 0, 1e9), round = int(m.round, 1, lim.rounds), t = num(m.t, -60, 36000);
  const first = side(m.first), phase = oneOf(PHASES)(m.phase);
  const score = pair(m.score, v => int(v, 0, lim.wins)), again = pair(m.again, bool), ready = pair(m.ready, bool);
  const wx = oneOf(WX)(m.wx);
  const result = opt(m.result, null, v => cleanResult(v, lim));
  const next = opt(m.next, null, v => v === null ? null : oneOf(WX)(v));
  const lead = opt(m.lead, null, v => v === null ? null : pair(v, n => int(n, 0, lim.leaders)));
  const ping = opt(m.ping, null, v => { if (v === null) return null; if (!isObj(v)) return undefined; const n = int(v.n, 1, 20), s = spot(v); return ok(n, s) ? { n, x: s.x, z: s.z } : undefined; });
  const go = opt(m.go, { host: false, guest: false }, v => pair(v, bool));
  const log = opt(m.log, [], v => cleanLog(v, lim));
  const theme = opt(m.theme, null, v => v === null ? null : cleanTheme(v));
  const gold = opt(m.gold, false, bool), silver = opt(m.silver, false, bool), seen = opt(m.seen, false, bool);
  const bump = opt(m.bump, 0, v => int(v, 0, 100)), bumpAt = opt(m.bumpAt, -99, v => num(v, -100, 36000));
  const sorry = opt(m.sorry, 0, bit), lastShot = opt(m.lastShot, -1, v => num(v, -1, 36000)), shots = opt(m.shots, 0, v => int(v, 0, 1e6));
  const goAt = opt(m.goAt, -1, v => num(v, -1, 36000)), ducks = opt(m.ducks, 0, v => int(v, 0, (1 << lim.rounds) - 1));
  if (!ok(mid, round, t, first, phase, score, again, ready, wx, result, next, lead, ping, go, log, theme, gold, silver, seen, bump, bumpAt, sorry, lastShot, shots, goAt, ducks)) return null;
  return { mid, round, first, score, phase, t, result, again, ping, wx, next, ready, lead, gold, silver, bump, bumpAt, sorry, seen, lastShot, shots, go, goAt, log, ducks, theme };
}

// ---- messages from the other phone ------------------------------------------------------------------------------------------
// one entry per message type: the fields it may carry. The returned object has exactly these fields and nothing else.
const TYPES = {
  m: (m, lim) => { const mm = cleanMatch(m.m, lim); return mm ? { t: 'm', m: mm, run: m.run === true } : undefined; },
  s: m => {   // the other tank's place: or just { h: 1 } (the hider's phone: "you can't see me")
    if (m.h) return { t: 's', h: 1 };
    const k = typeof m.k === 'string' && m.k.length <= 32 ? m.k : undefined, x = px(m.x), z = pz(m.z), y = yaw(m.y), v = num(m.v, -20, 20);   // (the fastest tank, a sprinting hider, is about 16 m/s)
    if (!ok(k, x, z, y, v)) return undefined;
    const out = { t: 's', k, x, z, y, v };
    if (m.cx !== undefined || m.cz !== undefined) { const cx = px(m.cx), cz = pz(m.cz); if (!ok(cx, cz)) return undefined; out.cx = cx; out.cz = cz; }
    return out;
  },
  f: (m, lim) => {   // a shot
    const mid = int(m.mid, 0, 1e9), r = int(m.r, 1, lim.rounds), e = num(m.e, 0, 36000), id = int(m.id, 0, 1e9), x = px(m.x), z = pz(m.z), y = yaw(m.y);
    return ok(mid, r, e, id, x, z, y) ? { t: 'f', mid, r, e, id, x, z, y } : undefined;
  },
  h: (m, lim) => {   // a hit, from the hider's phone
    const mid = int(m.mid, 0, 1e9), r = int(m.r, 1, lim.rounds), e = num(m.e, 0, 36000);
    if (!ok(mid, r, e)) return undefined;
    const out = { t: 'h', mid, r, e };
    if (m.x !== undefined || m.z !== undefined) { const x = px(m.x), z = pz(m.z); if (ok(x, z)) { out.x = x; out.z = z; } }   // the spot is optional: a bad one is left out
    return out;
  },
  c: (m, lim) => {   // the other phone's leader choice
    const mid = int(m.mid, 0, 1e9), s = num(m.s, 0, 1e15), n = int(m.n, 0, lim.leaders), okk = bool(m.ok);
    return ok(mid, s, n, okk) ? { t: 'c', mid, s, n, ok: okk } : undefined;
  },
  ping: m => { const k = num(m.k, 0, 1e13); return k === undefined ? undefined : { t: 'ping', k }; },
  pong: m => { const k = num(m.k, 0, 1e13); return k === undefined ? undefined : { t: 'pong', k }; },
  a: m => { const mid = int(m.mid, 0, 1e9); return mid === undefined ? undefined : { t: 'a', mid }; },
  g: m => { const mid = int(m.mid, 0, 1e9); return mid === undefined ? undefined : { t: 'g', mid }; },
  rd: (m, lim) => { const mid = int(m.mid, 0, 1e9), r = int(m.r, 1, lim.rounds); return ok(mid, r) ? { t: 'rd', mid, r } : undefined; },
  hn: (m, lim) => { const mid = int(m.mid, 0, 1e9), r = int(m.r, 1, lim.rounds); return ok(mid, r) ? { t: 'hn', mid, r } : undefined; },
  sn: (m, lim) => { const mid = int(m.mid, 0, 1e9), r = int(m.r, 1, lim.rounds); return ok(mid, r) ? { t: 'sn', mid, r } : undefined; },
  nd: (m, lim) => { const mid = int(m.mid, 0, 1e9), r = int(m.r, 1, lim.rounds), k = int(m.k, 0, 1e9); return ok(mid, r, k) ? { t: 'nd', mid, r, k } : undefined; },
  pc: (m, lim) => {   // the hider's ping circle
    const mid = int(m.mid, 0, 1e9), r = int(m.r, 1, lim.rounds), n = int(m.n, 1, 20), x = px(m.x), z = pz(m.z);
    return ok(mid, r, n, x, z) ? { t: 'pc', mid, r, n, x, z } : undefined;
  },
  th: m => { const mid = int(m.mid, 0, 1e9), p = cleanTheme(m.p); return mid === undefined || !p ? undefined : { t: 'th', mid, p }; },
  dk: (m, lim) => { const mid = int(m.mid, 0, 1e9), n = int(m.n, 1, lim.rounds); return ok(mid, n) ? { t: 'dk', mid, n } : undefined; },
};
export function cleanMessage(m, lim) {
  if (!isObj(m) || typeof m.t !== 'string' || !Object.hasOwn(TYPES, m.t)) return null;
  return TYPES[m.t](m, lim) || null;
}
