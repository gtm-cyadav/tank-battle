// Tests for js/guard.js (security Stage 1) and its use in rules.js. Run: node tests/guard.test.mjs   (no install needed, Node 22+)
// 1. COMPATIBILITY: every match a real referee produces, in every phase of a whole match, must pass cleanMatch unchanged. (If this fails, the
//    validator would be throwing away something the game really uses, and a real game would break.)
// 2. HOSTILE INPUT: malformed or oversized values, odd types and odd keys are rejected or neutralised.
import assert from 'node:assert/strict';
import { cleanMatch, cleanMessage, cleanTheme } from '../js/guard.js';
import { createRules, RULES } from '../js/rules.js';

let passed = 0;
const test = (name, fn) => { try { fn(); passed++; console.log('  ok  ' + name); } catch (e) { console.error('FAIL  ' + name + '\n' + (e.stack || e)); process.exitCode = 1; } };
const json = v => JSON.parse(JSON.stringify(v));

// ---- 1. a whole real match through the real rules --------------------------------------------------------------------------
function referee(theme = null) {
  const sent = [], seen = [];
  const rules = createRules({ send: m => sent.push(json(m)), changed: m => seen.push(json(m)), eggs: () => {}, nudged: () => {}, where: () => ({ x: 0, z: 0 }), theme: () => theme });
  return { rules, sent, seen };
}
const everyMatch = ({ rules, sent }) => sent.filter(m => m.t === 'm').map(m => m.m).concat(rules.match ? [json(rules.match)] : []);
const step = (rules, secs) => { for (let i = 0; i < Math.round(secs / 0.05); i++) rules.tick(0.05); };

test('every match a real referee sends passes cleanMatch unchanged (whole match, 3 rounds, theme, duck, surrender)', () => {
  const r = referee({ k: 'love', s: 'hello', w: 'you won', l: 'you lost', x: 'the end' });
  r.rules.start('host', null);
  const m0 = r.rules.match;
  assert.equal(m0.phase, 'pick');
  r.rules.choose(5, true);
  r.rules.onMessage({ t: 'c', mid: m0.mid, s: 1700000000000, n: 0, ok: true });   // the other phone's leader (Random)
  assert.equal(r.rules.match.phase, 'toss');
  step(r.rules, 7.1);                                     // toss -> round 1
  assert.equal(r.rules.match.phase, 'play');
  r.rules.noteDuck();                                     // a duck round next
  r.rules.noteShot({ t: 'f', mid: m0.mid, r: 1, e: 25, id: 1, x: 10, z: 10, y: 1 });
  step(r.rules, 30);
  const mid = r.rules.match.mid;
  // the guest is the hider in round 1 when the host hunts; report a hit from the guest
  const hunter = r.rules.hunterSide();
  if (hunter === 'host') r.rules.onMessage({ t: 'h', mid, r: 1, e: 40, x: 3, z: 4 }); else r.rules.reportHit(40, { x: 3, z: 4 });
  assert.equal(r.rules.match.phase, 'break');
  step(r.rules, 11);
  r.rules.readyUp(); r.rules.onMessage({ t: 'rd', mid, r: 1 });
  step(r.rules, 0.2);
  assert.equal(r.rules.match.round, 2);
  step(r.rules, RULES.round + 2);                         // round 2 runs out: the hider wins on time
  step(r.rules, 11);
  r.rules.readyUp(); r.rules.onMessage({ t: 'rd', mid, r: 2 });
  step(r.rules, 0.2);
  r.rules.giveUp();                                       // a surrender: the 'gaveup' result with `by`
  assert.equal(r.rules.match.phase, 'over');
  step(r.rules, 1);
  const all = everyMatch(r);
  assert.ok(all.length > 20, 'expected many broadcasts, got ' + all.length);
  for (const m of all) assert.deepEqual(cleanMatch(m, RULES), m, 'cleanMatch changed a real match in phase ' + m.phase);
  const phases = new Set(all.map(m => m.phase));
  for (const p of ['pick', 'toss', 'play', 'break', 'over']) assert.ok(phases.has(p), 'phase never seen: ' + p);
});

test('every message type the game really sends survives cleanMessage unchanged', () => {
  const good = [
    { t: 's', k: '1/1', x: 12.5, z: -3, y: 1.2, v: 4 }, { t: 's', k: '1/1', x: 12.5, z: -3, y: 1.2, v: 4, cx: 1, cz: 2 }, { t: 's', h: 1 },
    { t: 'f', mid: 1, r: 2, e: 33.3, id: 7, x: 1, z: 2, y: 3 },
    { t: 'h', mid: 1, r: 1, e: 50 }, { t: 'h', mid: 1, r: 1, e: 50, x: 1.5, z: 2.5 },
    { t: 'c', mid: 1, s: 1700000000000, n: 12, ok: true }, { t: 'ping', k: 12345.5 }, { t: 'pong', k: 12345.5 },
    { t: 'a', mid: 3 }, { t: 'g', mid: 3 }, { t: 'rd', mid: 1, r: 2 }, { t: 'hn', mid: 1, r: 2 }, { t: 'sn', mid: 1, r: 2 }, { t: 'nd', mid: 1, r: 2, k: 4 },
    { t: 'pc', mid: 1, r: 1, n: 2, x: 5, z: 6 }, { t: 'th', mid: 1, p: { k: 'hate', s: 'a', w: 'b', l: 'c', x: 'd' } }, { t: 'dk', mid: 1, n: 2 },
  ];
  for (const m of good) assert.deepEqual(cleanMessage(json(m), RULES), m, 'changed or rejected: ' + JSON.stringify(m));
});

// ---- 2. hostile input ------------------------------------------------------------------------------------------------------
const base = () => { const r = referee(); r.rules.start('host', null); return json(r.rules.match); };   // a fresh real match (the pick phase)

test('a score or anything else that is not a plain number is refused (the old innerHTML hole)', () => {
  const m = base();
  for (const bad of ['<img src=x onerror=alert(1)>', '1', null, 1.5, -1, 99, [], {}, NaN, Infinity]) {
    const x = json(m); x.score.guest = bad; x.phase = 'over';
    assert.equal(cleanMatch(x, RULES), null, 'accepted score ' + JSON.stringify(bad));
  }
});
test('unknown weather, phase, side, leader, badge, ping and log entries are refused', () => {
  const bad = [m => { m.wx = 'constructor'; }, m => { m.wx = '__proto__'; }, m => { m.next = 'toString'; }, m => { m.phase = 'x'; }, m => { m.first = 'me'; }, m => { m.round = 4; },
    m => { m.lead = { host: 99, guest: 1 }; }, m => { m.lead = { host: 'a', guest: 1 }; }, m => { m.ping = { n: 1, x: 'a', z: 1 }; },
    m => { m.log = [{ h: 'host' }]; }, m => { m.log = new Array(50).fill(0); }, m => { m.result = { win: 'host', how: 'hit', left: 5, badges: ['constructor'] }; },
    m => { m.result = { win: 'x', how: 'hit', left: 5 }; }, m => { m.t = 'now'; }, m => { m.mid = -1; }, m => { m.ducks = 99; }, m => { m.again = { host: 1, guest: 0 }; }];
  for (const f of bad) { const m = base(); f(m); assert.equal(cleanMatch(m, RULES), null, f.toString()); }
  assert.equal(cleanMatch(null, RULES), null); assert.equal(cleanMatch('x', RULES), null); assert.equal(cleanMatch([], RULES), null);
});
test('extra fields and odd keys never get through', () => {
  const m = base(); m.evil = '<b>'; m.score.__proto__ = { x: 1 }; m.log = [];
  const raw = JSON.parse(JSON.stringify(m).replace('"score":', '"__proto__":{"polluted":1},"score":'));
  const c = cleanMatch(raw, RULES);
  assert.ok(c); assert.equal('evil' in c, false); assert.equal(({}).polluted, undefined); assert.equal(Object.getPrototypeOf(c), Object.prototype); assert.equal(Object.hasOwn(c, '__proto__'), false);
});
test('positions: non-numbers refused, huge or infinite values clamped to the yard', () => {
  for (const v of ['1', null, NaN, undefined, {}, [], true]) assert.equal(cleanMessage({ t: 's', k: '1/1', x: v, z: 0, y: 0, v: 0 }, RULES), null, 'accepted x=' + String(v));
  // JSON text can carry numbers that parse to Infinity (1e999): a message with one is refused outright
  for (const field of ['x', 'z', 'y', 'v']) {
    const raw = JSON.parse('{"t":"s","k":"1/1","x":0,"z":0,"y":0,"v":0}'.replace(`"${field}":0`, `"${field}":1e999`));
    assert.equal(raw[field], Infinity); assert.equal(cleanMessage(raw, RULES), null, field + '=Infinity was accepted');
  }
  // huge but finite numbers are pulled back to the yard (this is what used to be able to hang the other phone's game loop)
  const c = cleanMessage(JSON.parse('{"t":"s","k":"1/1","x":1e300,"z":-1e300,"y":1e300,"v":1e9}'), RULES);
  assert.ok(c); for (const k of ['x', 'z', 'y', 'v']) assert.ok(Number.isFinite(c[k]), k + ' not finite');
  assert.ok(Math.abs(c.x) < 100 && Math.abs(c.z) < 100 && Math.abs(c.v) <= 20);
});
test('a garbage theme in a match is neutralised to "no theme" (never kept)', () => {
  const m = base(); m.theme = 'x'; assert.equal(cleanMatch(m, RULES).theme, null);
  m.theme = { k: 'love', s: 'hi', w: 'a', l: 'b', x: 'c' }; assert.deepEqual(cleanMatch(m, RULES).theme, m.theme);
});
test('shots: bad or missing fields refused; the shot is rebuilt with only its own fields', () => {
  assert.equal(cleanMessage({ t: 'f', mid: 1, r: 1, e: 30, id: 1, x: 'a', z: 0, y: 0 }, RULES), null);
  assert.equal(cleanMessage({ t: 'f', mid: 1, r: 1, e: NaN, id: 1, x: 0, z: 0, y: 0 }, RULES), null);
  assert.equal(cleanMessage({ t: 'f', mid: 1, r: 9, e: 30, id: 1, x: 0, z: 0, y: 0 }, RULES), null);
  const c = cleanMessage({ t: 'f', mid: 1, r: 1, e: 30, id: 1, x: 0, z: 0, y: 0, extra: 'x' }, RULES);
  assert.deepEqual(Object.keys(c).sort(), ['e', 'id', 'mid', 'r', 't', 'x', 'y', 'z']);
});
test('unknown types, inherited names, non-objects and arrays are dropped', () => {
  for (const m of [null, undefined, 1, 'x', [], { t: 'constructor' }, { t: '__proto__' }, { t: 'toString' }, { t: 'hello' }, { t: 5 }, {}, { t: 'bye' }]) assert.equal(cleanMessage(m, RULES), null, JSON.stringify(m));
});
test('the leader choice number "s" cannot be made Infinity (it would block later choices)', () => {
  const c = cleanMessage(JSON.parse('{"t":"c","mid":1,"s":1e999,"n":3,"ok":true}'), RULES);
  assert.ok(c === null || Number.isFinite(c.s));
});
test('theme text: only plain text, 240 characters, control and direction characters removed', () => {
  const t = cleanTheme({ k: 'love', s: 'a‮b\u0000c\nd'.padEnd(500, 'z'), w: 5, l: null, x: {} });
  assert.equal(t.s.length <= 240, true); assert.equal(/[‮\u0000]/.test(t.s), false); assert.ok(t.s.startsWith('abc\nd'));
  assert.equal(t.w, ''); assert.equal(t.l, ''); assert.equal(t.x, '');
  assert.equal(cleanTheme({ k: 'other' }), null); assert.equal(cleanTheme(null), null);
});
test('rules.js ignores a hostile match on the guest side and keeps its own', () => {
  const guest = createRules({ send() {}, changed() {}, eggs() {}, nudged() {}, where: () => ({ x: 0, z: 0 }) });
  guest.start('guest', null);
  const real = base();
  guest.onMessage({ t: 'm', m: real, run: true });
  assert.equal(guest.match.mid, real.mid);
  const evil = json(real); evil.phase = 'over'; evil.score.guest = '<img src=x onerror=alert(1)>';
  guest.onMessage({ t: 'm', m: evil, run: true });
  assert.equal(guest.match.phase, real.phase, 'the hostile match replaced the real one');
  assert.equal(typeof guest.match.score.guest, 'number');
});

console.log(`\n${passed} tests passed` + (process.exitCode ? ', SOME FAILED' : ''));
