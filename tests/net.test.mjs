// Tests for who may join a room (js/net.js, security Stages 2 and 3). Run: node tests/net.test.mjs
// The real net.js runs against a tiny in-memory stand-in for PeerJS (no network): a host and guests (real createLink instances), plus "raw" strangers
// that send whatever bytes they like, like a modified page would.
import assert from 'node:assert/strict';

// ---- an in-memory PeerJS --------------------------------------------------------------------------------------------------
const peers = new Map();   // the "broker": id -> peer
let anon = 0;
const later = fn => setTimeout(fn, 0);
class Emitter {
  on(e, f) { (this.h ||= {})[e] = [...(this.h[e] || []), f]; return this; }
  fire(e, ...a) { for (const f of this.h?.[e] || []) f(...a); }
}
class Conn extends Emitter {
  constructor(peer) { super(); this.peer = peer; this.open = false; this.other = null; }
  send(m) { if (!this.open) throw new Error('closed'); const o = this.other, copy = JSON.parse(JSON.stringify(m)); later(() => o.open && o.fire('data', copy)); }
  close() { if (!this.open) return; const o = this.other; this.open = false; later(() => { this.fire('close'); if (o.open) { o.open = false; o.fire('close'); } }); }
}
class FakePeer extends Emitter {
  constructor(id) {
    super();
    this.id = id || 'anon-' + ++anon; this.open = false; this.destroyed = false; this.disconnected = false; this.conns = new Set();
    later(() => {
      if (peers.has(this.id)) { this.fire('error', { type: 'unavailable-id' }); return; }
      peers.set(this.id, this); this.open = true; this.fire('open', this.id);
    });
  }
  connect(id) {
    const mine = new Conn(this), target = peers.get(id);
    this.conns.add(mine);
    if (!target) { later(() => this.fire('error', { type: 'peer-unavailable' })); return mine; }
    const theirs = new Conn(target); mine.other = theirs; theirs.other = mine; target.conns.add(theirs);
    later(() => { mine.open = theirs.open = true; target.fire('connection', theirs); mine.fire('open'); });
    return mine;
  }
  reconnect() {}
  destroy() { this.destroyed = true; if (peers.get(this.id) === this) peers.delete(this.id); for (const c of this.conns) c.close(); }   // (real PeerJS closes the peer's links too)
}
globalThis.Peer = FakePeer;
globalThis.document = { hidden: false, addEventListener() {} };
const { createLink, VERSION } = await import('../js/net.js');
const ROOM_ID = code => 'gtm-tank-battle-v1-' + code;

// ---- helpers --------------------------------------------------------------------------------------------------------------
let passed = 0;
const sleep = ms => new Promise(r => setTimeout(r, ms));
const until = async (cond, what, ms = 3000) => { const t = Date.now(); while (!cond()) { if (Date.now() - t > ms) throw new Error('timed out waiting for: ' + what); await sleep(5); } };
const open = [];
function host(tune) {
  const ev = { up: 0, requests: 0, gone: 0, failed: [], notes: [], messages: [], left: 0 };
  const link = createLink({ hosting() { ev.hosting = true; }, up() { ev.up++; }, request() { ev.requests++; }, requestGone() { ev.gone++; }, failed: k => ev.failed.push(k), note: k => ev.notes.push(k), message: m => ev.messages.push(m), left() { ev.left++; } }, tune);
  link.host({ code: 'WXYZ' });
  open.push(link);
  return { link, ev, ready: () => until(() => ev.hosting, 'the host to register') };
}
function guest(token, key, code = 'WXYZ') {
  const ev = { up: 0, asking: 0, failed: [], messages: [] };
  const link = createLink({ up() { ev.up++; }, asking() { ev.asking++; }, failed: k => ev.failed.push(k), message: m => ev.messages.push(m) });
  link.join({ code, token, key });
  open.push(link);
  return { link, ev };
}
// a stranger that talks to the host directly with raw messages
async function raw() {
  const p = new FakePeer(); await until(() => p.open, 'a stranger peer');
  const c = p.connect(ROOM_ID('WXYZ')), got = [], s = { c, got, closed: false };
  c.on('data', m => got.push(m)); c.on('close', () => { s.closed = true; });
  await until(() => c.open || s.closed, 'the stranger link to open (or to be refused)');   // the host may hang up at once
  return s;
}
const test = async (name, fn) => { try { await fn(); passed++; console.log('  ok  ' + name); } catch (e) { console.error('FAIL  ' + name + '\n' + (e.stack || e)); process.exitCode = 1; } finally { for (const l of open.splice(0)) l.close(); peers.clear(); await sleep(350); } };
const GOOD = 'abc123def456';

// ---- the tests ------------------------------------------------------------------------------------------------------------
await test('invite link key: the guest is let in with no question to the host', async () => {
  const h = host(); await h.ready();
  const g = guest(GOOD, h.link.key);
  await until(() => h.ev.up === 1 && g.ev.up === 1, 'both up');
  assert.equal(h.ev.requests, 0, 'the host was asked although the key was right');
  assert.equal(h.link.guestToken, GOOD);
});
await test('code only: the host is asked; allow() lets the player in', async () => {
  const h = host(); await h.ready();
  const g = guest(GOOD, null);
  await until(() => h.ev.requests === 1, 'the host to be asked');
  await until(() => g.ev.asking >= 1, 'the guest to be told it is waiting');
  assert.equal(h.ev.up, 0); assert.equal(g.ev.up, 0, 'the guest got in before the host said yes');
  assert.equal(h.link.allow(), true);
  await until(() => h.ev.up === 1 && g.ev.up === 1, 'both up after allow');
});
await test('code only: deny() turns the player away and the seat stays free', async () => {
  const h = host(); await h.ready();
  const g = guest(GOOD, null);
  await until(() => h.ev.requests === 1, 'the host to be asked');
  assert.equal(h.link.deny(), true);
  await until(() => g.ev.failed.includes('denied'), 'the guest to be told no');
  assert.equal(h.link.guestToken, null); assert.equal(h.ev.up, 0);
  const g2 = guest('second999', h.link.key);   // the seat is still free for someone with the key
  await until(() => g2.ev.up === 1, 'a later guest with the key to get in');
});
await test('an unanswered question counts as "no" after the time limit and the host is told it is gone', async () => {
  const h = host({ approveTimeout: 200 }); await h.ready();
  const g = guest(GOOD, null);
  await until(() => h.ev.requests === 1, 'asked');
  await until(() => g.ev.failed.includes('denied') && h.ev.gone === 1, 'timeout -> denied and requestGone');
  assert.equal(h.link.guestToken, null);
});
await test('a wrong room key is refused at once, with no question to the host', async () => {
  const h = host(); await h.ready();
  const g = guest(GOOD, 'wrongkey123');
  await until(() => g.ev.failed.includes('denied'), 'denied');
  assert.equal(h.ev.requests, 0); assert.equal(h.link.guestToken, null);
});
await test('the first guest holds the seat; a stranger is told the room is full; the same player may come back', async () => {
  const h = host(); await h.ready();
  const g = guest(GOOD, h.link.key);
  await until(() => g.ev.up === 1, 'guest up');
  const other = guest('other777', h.link.key);   // even WITH the key: the seat is taken
  await until(() => other.ev.failed.includes('full'), 'the second player to be told "full"');
  assert.equal(h.link.guestToken, GOOD, 'the seat changed hands');
  const again = guest(GOOD, null);   // the same player (same token), e.g. after a refresh: straight back in, no question
  await until(() => again.ev.up === 1, 'the same player to return');
  assert.equal(h.ev.requests, 0);
});
await test('a token that is not a plain id (number, object, too short, odd characters, too long) is not a player', async () => {
  const h = host(); await h.ready();
  for (const token of [5, {}, [], null, undefined, 'ab', 'has space!', '<img src=x>', 'a'.repeat(200), '__proto__']) {
    const s = await raw();
    s.c.send({ t: 'hello', token, v: VERSION });
    await until(() => s.closed, 'the link to be closed for token ' + JSON.stringify(token));
  }
  assert.equal(h.link.guestToken, null, 'a bad token was stored as the guest token'); assert.equal(h.ev.requests, 0); assert.equal(h.ev.up, 0);
});
await test('a stranger that never says hello is hung up on; too many open strangers are refused at once', async () => {
  const h = host({ helloTimeout: 250, maxStrangers: 2 }); await h.ready();
  const a = await raw(), b = await raw(), c = await raw(), d = await raw();
  await until(() => c.closed && d.closed, 'the extra strangers to be closed');
  assert.equal(a.closed, false); assert.equal(b.closed, false);
  await until(() => a.closed && b.closed, 'silent strangers to time out');
});
await test('a stranger who floods the host is hung up on; the real guest is not affected', async () => {
  const h = host(); await h.ready();
  const g = guest(GOOD, h.link.key); await until(() => g.ev.up === 1, 'guest up');
  const s = await raw();
  for (let i = 0; i < 600; i++) { try { s.c.send({ t: 'ping', k: i }); } catch (e) { break; } }
  await until(() => s.closed, 'the flooding stranger to be closed');
  g.link.send({ t: 'ping', k: 1 });
  await until(() => h.ev.messages.some(m => m.t === 'ping'), 'the real guest to still get through');
  assert.equal(h.link.up, true);
});
await test('an ordinary busy game is never throttled (about 60 messages a second for a few seconds)', async () => {
  const h = host(); await h.ready();
  const g = guest(GOOD, h.link.key); await until(() => g.ev.up === 1, 'guest up');
  for (let s = 0; s < 3; s++) { for (let i = 0; i < 60; i++) g.link.send({ t: 's', k: '1/1', x: i, z: 0, y: 0, v: 0 }); await sleep(1000); }
  assert.equal(h.ev.messages.filter(m => m.t === 's').length, 180, 'real traffic was dropped');
});
await test('only one question at a time: a second code-only player is told the room is full', async () => {
  const h = host(); await h.ready();
  const g1 = guest(GOOD, null); await until(() => h.ev.requests === 1, 'first asked');
  const g2 = guest('second999', null);
  await until(() => g2.ev.failed.includes('full'), 'the second to be told "full"');
  assert.equal(h.ev.requests, 1);
  h.link.deny(); await until(() => g1.ev.failed.includes('denied'), 'first denied');
});
await test('if the asking player leaves, the host is told the question is gone', async () => {
  const h = host(); await h.ready();
  const g = guest(GOOD, null); await until(() => h.ev.requests === 1, 'asked');
  g.link.close(); await until(() => h.ev.gone === 1, 'requestGone');
  assert.equal(h.link.allow(), false, 'allow() after the player left must do nothing');
});
await test('a different game version is refused before anything else (and a note reaches the host)', async () => {
  const h = host(); await h.ready();
  const s = await raw();
  s.c.send({ t: 'hello', token: GOOD, v: 'some-other-version' });
  await until(() => s.got.some(m => m.t === 'version'), 'a version reply');
  assert.deepEqual(h.ev.notes, ['version']); assert.equal(h.link.guestToken, null);
});

console.log(`\n${passed} tests passed` + (process.exitCode ? ', SOME FAILED' : ''));
process.exit(process.exitCode || 0);
