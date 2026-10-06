// Two-player link over PeerJS and its free public broker (brief section 3): no server of our own.
// The phone that creates the game owns the room. Its broker ID is made from the 4-letter code, so the other
// phone can find it by code. After that the two phones talk directly, and each phone is in charge of its own
// tank, sending where it is about 20 times a second.
// Drop-outs: both phones send a small heartbeat every second, so a link with no news at all is dead ('down'), and
// the guest keeps knocking until it gets back in. A phone whose game is out of sight (switched app, screen off)
// says 'away' and later 'here'; that also counts as 'down' for the other phone, without touching the link.
// A refreshed page rejoins with the same code and player token (lobby.js keeps those for the tab).
// Who may take the second seat (security Stage 3): the 4-letter code alone is easy to guess or to be given away, so a new player needs EITHER the room key
// (a long random secret that travels only in the invite link) OR the host's tap on "Let in". A player who already holds the seat (same token) comes straight
// back in. Strangers are limited: a short time to say hello, and only a few waiting at once.
/* global Peer */

const PREFIX = 'gtm-tank-battle-v1-';                 // keeps our rooms apart from everyone else's on the shared broker
export const LETTERS = 'ABCDEFGHJKLMNPQRSTUVWXYZ';    // no I or O: they read as 1 and 0
export const VERSION = new URL(import.meta.url).searchParams.get('v') || 'local';
const BEAT = 1000;           // heartbeat, ms
const QUIET = 2500;          // ms without a message = link down
const RECYCLE = 5000;        // guest: a link this quiet is dead; drop it and knock again
const RETRY = 2500;          // ms between reconnect attempts
const OPEN_TIMEOUT = 12000;  // ms to wait for the other phone to answer a knock
const CHANNEL = { reliable: true, serialization: 'json' };
const TOKEN = /^[0-9a-z]{3,40}$/;   // what a player token or a room key looks like (randomToken makes these); anything else is not a player
const HELLO_TIMEOUT = 10000; // host: a connection that has not said hello (or been let in) in this long is closed
const APPROVE_TIMEOUT = 40000; // host: how long a "Let in?" question waits before it counts as "no"
const MAX_STRANGERS = 4;     // host: connections that are not our guest, open at once, at most
const MAX_PER_SEC = 150;     // security Stage 2: messages one link may send per second (a real game sends about 25); the rest are dropped

export const randomCode = () => Array.from({ length: 4 }, () => LETTERS[Math.floor(Math.random() * LETTERS.length)]).join('');
export const randomToken = () => Array.from(crypto.getRandomValues(new Uint32Array(3)), n => n.toString(36)).join('');
export const randomKey = randomToken;   // the room key (96 random bits), made the same way as a player token

// on: { hosting(code), up(first), down(reason), waiting(), left(), failed(kind), note(kind), message(msg), request(), requestGone(), asking() }
//   waiting: guest got in, but the host's game is in the background; 'up' follows when they come back
//   down reasons: 'quiet' | 'away' (they switched app) | 'offline' (this phone has no internet) | 'closed'
//   failed kinds: 'server' | 'nocode' | 'noconnect' | 'full' | 'version' | 'replaced' | 'denied'
//   host also gets: request() (a player with only the code wants in: answer with allow() or deny()), requestGone() (they gave up); guest also gets: asking() (the host was asked)
// tune: for tests only ({ helloTimeout, approveTimeout, maxStrangers })
export function createLink(on, tune = {}) {
  const T = { helloTimeout: HELLO_TIMEOUT, approveTimeout: APPROVE_TIMEOUT, maxStrangers: MAX_STRANGERS, ...tune };
  const L = { role: null, code: null, token: null, key: null, guestToken: null, rejoin: false, up: false, mute: false };
  // linked: this phone and the other one have said hello on `conn`. up: linked, hearing from them, and they're not away.
  let peer = null, conn = null, closed = true, linked = false, away = false, everUp = false, registered = false, codeTries = 0;
  let lastHeard = 0, retryTimer = 0, openTimer = 0;
  let pending = null;           // host: { c, token, away, timer } a player with only the code, waiting for allow() / deny()
  const strangers = new Set();  // host: open connections that are neither our guest nor the player being asked about

  const log = [];   // last events, for testing (window.__tbLink.log)
  const trace = (...a) => { log.push(`${(performance.now() / 1000).toFixed(1)} ${a.join(' ')}`); if (log.length > 200) log.shift(); };
  const emit = (name, ...args) => { if (name !== 'message') trace('emit', name, ...args); if (!closed) on[name]?.(...args); };
  const safeSend = (c, m) => { try { if (c?.open && !L.mute) c.send(m); } catch (e) { /* link already gone */ } };

  function finish() {
    closed = true;
    L.up = false;
    clearTimeout(retryTimer); clearTimeout(openTimer);
    if (pending) { clearTimeout(pending.timer); pending = null; }
    strangers.clear();
    const p = peer;
    peer = conn = null;
    if (p) setTimeout(() => p.destroy(), 300);   // a moment for a last 'bye' to go out
  }
  const fail = kind => { const f = on.failed; finish(); f?.(kind); };

  function linkUp() {
    clearTimeout(openTimer); clearTimeout(retryTimer);
    lastHeard = performance.now();
    if (L.up || away) return;
    L.up = true;
    const first = !everUp;
    everUp = true;
    emit('up', first);
  }
  function linkDown(reason) {
    if (L.up) { L.up = false; emit('down', reason); }
    if (reason !== 'closed') return;
    conn = null; linked = false;
    if (L.role !== 'guest') return;
    if (!everUp && !L.rejoin) fail('noconnect'); else later(knock);
  }
  const later = fn => { clearTimeout(retryTimer); retryTimer = setTimeout(fn, RETRY); };

  function newPeer(id) {
    const p = id ? new Peer(id, { debug: 0 }) : new Peer({ debug: 0 });
    p.on('disconnected', () => {   // lost the broker (not the other phone): keep trying to get it back
      const again = () => { if (!closed && p === peer && p.disconnected && !p.destroyed) { try { p.reconnect(); } catch (e) { /* retried below */ } setTimeout(again, RETRY * 2); } };
      setTimeout(again, RETRY);
    });
    p.on('error', e => onPeerError(p, e));
    return p;
  }

  function onPeerError(p, e) {
    trace('peer error', e.type, p === peer ? '' : '(old peer)');
    if (closed || p !== peer) return;
    if (e.type === 'peer-unavailable') {   // nobody holds that room code (wrong code, or the host is away)
      if (L.role !== 'guest') return;
      conn = null; clearTimeout(openTimer);
      if (!everUp && !L.rejoin) fail('nocode'); else later(knock);
    } else if (e.type === 'unavailable-id') {   // host: the room code is already taken on the broker
      p.destroy();
      if (L.rejoin) later(startHost);   // our own old page may still be holding it for a few seconds
      else if (++codeTries < 6) { L.code = randomCode(); startHost(); }
      else fail('server');
    } else if (!registered) {
      fail('server');   // never reached the broker at all
    }
  }

  function wire(c) {
    c.on('data', m => onData(c, m));
    c.on('close', () => {
      trace('link closed', c === conn ? '' : '(old link)');
      strangers.delete(c);
      if (pending?.c === c) { clearTimeout(pending.timer); pending = null; emit('requestGone'); }   // they gave up before we answered
      if (c === conn) linkDown('closed');
    });
    c.on('error', () => { if (c === conn) linkDown('closed'); });
  }

  // host: this connection is our guest now
  function seat(c, m) {
    strangers.delete(c);
    if (pending && pending.c !== c) { const p = pending; clearTimeout(p.timer); pending = null; safeSend(p.c, { t: 'full' }); setTimeout(() => p.c.close(), 500); emit('requestGone'); }   // the seat is taken now: the player who was waiting is told, the question goes away
    L.guestToken = m.token;
    if (conn && conn !== c) { const old = conn; safeSend(old, { t: 'replaced' }); setTimeout(() => old.close(), 500); }
    conn = c; linked = true; away = !!m.away;
    safeSend(c, { t: 'welcome', away: document.hidden });
    if (away) linkDown('away'); else linkUp();
  }
  // host: a new player with only the code. Ask the host (one question at a time); the player is told to wait.
  function ask(c, m) {
    if (pending) { safeSend(c, { t: 'full' }); setTimeout(() => c.close(), 500); return; }
    pending = { c, token: m.token, away: !!m.away, timer: setTimeout(() => { if (answer(false)) emit('requestGone'); }, T.approveTimeout) };
    safeSend(c, { t: 'wait' });
    emit('request');
  }
  function answer(yes) {
    const p = pending;
    if (!p) return false;
    clearTimeout(p.timer); pending = null;
    if (yes && p.c.open && !L.guestToken) seat(p.c, { token: p.token, away: p.away });   // (only if the seat is still free)
    else { safeSend(p.c, { t: 'denied' }); setTimeout(() => p.c.close(), 500); }
    return true;
  }

  // security Stage 2: a budget per connection (so a stranger flooding the host cannot use up the real guest's)
  const budgets = new WeakMap();
  function overBudget(c) {
    const now = performance.now();
    let b = budgets.get(c);
    if (!b) budgets.set(c, b = { from: now, n: 0 });
    if (now - b.from >= 1000) { b.from = now; b.n = 0; }
    return ++b.n > MAX_PER_SEC;
  }

  function onData(c, m) {
    if (closed || L.mute || !m || typeof m !== 'object') return;
    if (overBudget(c)) { if (L.role === 'host' && c !== conn) c.close(); return; }   // too many messages: dropped (a stranger is hung up on)
    if (m.t !== 'p' && m.t !== 's') trace('got', String(m.t).slice(0, 16), c === conn ? '' : '(other link)');   // (cut short: the other phone chooses this text)
    if (L.role === 'host' && c !== conn) {   // a knock from a phone that isn't (yet) our guest
      if (m.t !== 'hello') return;
      if (pending?.c === c) { safeSend(c, { t: 'wait' }); return; }   // the same player asking again: they are still waiting for the host's answer
      const refuse = kind => { safeSend(c, { t: kind }); setTimeout(() => c.close(), 500); };
      if (typeof m.token !== 'string' || !TOKEN.test(m.token)) { c.close(); return; }   // security Stage 3: not a player token, not a player (it used to be stored as it came)
      if (m.v !== VERSION) { refuse('version'); emit('note', 'version'); return; }
      if (L.guestToken && m.token !== L.guestToken) { refuse('full'); return; }   // the seat belongs to someone else
      if (L.guestToken) { seat(c, m); return; }                                    // our own guest, back again (a refresh, a new connection)
      // a new player. Security Stage 3: the second seat is no longer given to whoever knocks first. They need the room key (it travels in the invite link
      // only), or the host has to say yes.
      if (L.key && m.key === L.key) { seat(c, m); return; }
      if (m.key !== undefined && m.key !== null) { refuse('denied'); return; }      // a key, but not ours: someone is guessing
      ask(c, m);
      return;
    }
    if (c !== conn) return;
    lastHeard = performance.now();
    if (m.t === 'bye') { const f = on.left; finish(); f?.(); return; }
    if (m.t === 'replaced') { fail('replaced'); return; }
    if (L.role === 'guest' && !linked) {
      if (m.t === 'welcome') { linked = true; away = !!m.away; if (away) { clearTimeout(openTimer); emit('waiting'); } else linkUp(); }
      else if (m.t === 'full' || m.t === 'version' || m.t === 'denied') fail(m.t);
      else if (m.t === 'wait') {   // security Stage 3: the host is being asked to let us in; keep waiting for the answer
        clearTimeout(openTimer);
        openTimer = setTimeout(() => { if (c !== conn || linked) return; conn = null; c.close(); fail('noconnect'); }, T.approveTimeout + 5000);
        emit('asking');
      }
      return;
    }
    if (m.t === 'away') { away = true; linkDown('away'); return; }
    if (m.t === 'here') away = false;
    if (!L.up) linkUp();   // news again after a quiet or away spell
    if (m.t !== 'p' && m.t !== 'here') emit('message', m);
  }

  function startHost() {
    if (closed) return;
    registered = false;
    peer = newPeer(PREFIX + L.code);
    trace('host: registering', L.code);
    peer.on('open', () => { registered = true; emit('hosting', L.code); });
    peer.on('connection', c => {
      trace('host: incoming link');
      // security Stage 3: only a few unanswered connections at once. A full house drops the OLDEST silent one (never the player being asked about), so a
      // flood of silent connections can never keep a real player out: the newest connection always gets a place.
      if (strangers.size >= T.maxStrangers) {
        const oldest = [...strangers].find(s => s !== pending?.c);
        if (!oldest) { c.close(); return; }
        strangers.delete(oldest); oldest.close();
      }
      strangers.add(c);
      setTimeout(() => { if (c !== conn && pending?.c !== c) c.close(); }, T.helloTimeout);   // and none may sit there without saying hello
      wire(c);
    });
  }

  const sayHello = c => safeSend(c, { t: 'hello', token: L.token, v: VERSION, away: document.hidden, ...(L.key ? { key: L.key } : {}) });
  function knock() {   // guest: ask the host's phone for a link
    if (closed || !peer || peer.destroyed) return;
    if (!peer.open) { later(knock); return; }   // still (re)registering with the broker
    trace('guest: knock', L.code);
    const c = peer.connect(PREFIX + L.code, CHANNEL);
    conn = c; linked = false;
    wire(c);
    c.on('open', () => sayHello(c));
    clearTimeout(openTimer);
    openTimer = setTimeout(() => {
      if (c !== conn || linked) return;
      conn = null; c.close();
      if (!everUp && !L.rejoin) fail('noconnect'); else knock();
    }, OPEN_TIMEOUT);
  }

  // heartbeat out, silence check in: works even when the other phone vanishes without closing anything
  let beat = 0;
  setInterval(() => {
    if (closed) return;
    const now = performance.now(), quiet = now - lastHeard;
    if (now - beat >= BEAT - 50) {
      beat = now;
      if (linked) safeSend(conn, { t: 'p' });
      else if (L.role === 'guest' && conn?.open && Math.round(now / BEAT) % 2 === 0) sayHello(conn);   // knock still unanswered: say it again
    }
    if (L.up && quiet > QUIET) linkDown(navigator.onLine === false ? 'offline' : 'quiet');
    if (L.role === 'guest' && linked && conn && quiet > RECYCLE) {   // no heartbeat for 5 s: this link is dead
      const c = conn; conn = null; linked = false; c.close(); knock();
    }
  }, 250);
  // our own timers stop while the page is hidden; don't blame the other phone for that
  document.addEventListener('visibilitychange', () => { if (!document.hidden) lastHeard = performance.now(); });

  function reset(o) {
    if (!closed) finish();
    Object.assign(L, { up: false, rejoin: !!o.rejoin, code: o.code, token: o.token || null, key: o.key || null, guestToken: o.guestToken || null });
    closed = false; linked = false; away = false; everUp = false; registered = false; codeTries = 0;
    lastHeard = performance.now();
  }

  return {
    // o: { code?, key?, guestToken?, rejoin? }   (key: the room key; a new one is made if none is given)
    host(o = {}) { reset({ ...o, code: o.code || randomCode(), key: o.key || randomKey() }); L.role = 'host'; startHost(); },
    // o: { code, token, key?, rejoin? }   (key: from the invite link, if the player came that way)
    join(o) {
      reset(o); L.role = 'guest';
      peer = newPeer();
      peer.on('open', () => { registered = true; if (!conn) knock(); });
    },
    send(m) { if (linked) safeSend(conn, m); },
    leave() { safeSend(conn, { t: 'bye' }); finish(); },
    close: finish,
    get up() { return L.up; },
    get code() { return L.code; },
    get role() { return L.role; },
    get guestToken() { return L.guestToken; },
    get key() { return L.key; },
    allow() { return answer(true); },   // host: let the player who asked in
    deny() { return answer(false); },   // host: turn the player who asked away
    set mute(on) { L.mute = on; },   // testing only: pretend the signal is gone (nothing in, nothing out)
    log,
  };
}
