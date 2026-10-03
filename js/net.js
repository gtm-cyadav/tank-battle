// Two-player link over PeerJS and its free public broker: no server of our own.
// The phone that creates the game owns the room. Its broker ID is made from the 4-letter code, so the other
// phone can find it by code. After that the two phones talk directly, and each phone is in charge of its own
// tank, sending where it is about 20 times a second.
// Drop-outs: both phones send a small heartbeat every second, so a link with no news at all is dead ('down'), and
// the guest keeps knocking until it gets back in. A phone whose game is out of sight (switched app, screen off)
// says 'away' and later 'here'; that also counts as 'down' for the other phone, without touching the link.
// A refreshed page rejoins with the same code and player token (lobby.js keeps those for the tab).
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

export const randomCode = () => Array.from({ length: 4 }, () => LETTERS[Math.floor(Math.random() * LETTERS.length)]).join('');
export const randomToken = () => Array.from(crypto.getRandomValues(new Uint32Array(3)), n => n.toString(36)).join('');

// on: { hosting(code), up(first), down(reason), waiting(), left(), failed(kind), note(kind), message(msg) }
//   waiting: guest got in, but the host's game is in the background; 'up' follows when they come back
//   down reasons: 'quiet' | 'away' (they switched app) | 'offline' (this phone has no internet) | 'closed'
//   failed kinds: 'server' | 'nocode' | 'noconnect' | 'full' | 'version' | 'replaced'
export function createLink(on) {
  const L = { role: null, code: null, token: null, guestToken: null, rejoin: false, up: false, mute: false };
  // linked: this phone and the other one have said hello on `conn`. up: linked, hearing from them, and they're not away.
  let peer = null, conn = null, closed = true, linked = false, away = false, everUp = false, registered = false, codeTries = 0;
  let lastHeard = 0, retryTimer = 0, openTimer = 0;

  const log = [];   // last events, for testing (window.__tbLink.log)
  const trace = (...a) => { log.push(`${(performance.now() / 1000).toFixed(1)} ${a.join(' ')}`); if (log.length > 200) log.shift(); };
  const emit = (name, ...args) => { if (name !== 'message') trace('emit', name, ...args); if (!closed) on[name]?.(...args); };
  const safeSend = (c, m) => { try { if (c?.open && !L.mute) c.send(m); } catch (e) { /* link already gone */ } };

  function finish() {
    closed = true;
    L.up = false;
    clearTimeout(retryTimer); clearTimeout(openTimer);
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
    c.on('close', () => { trace('link closed', c === conn ? '' : '(old link)'); if (c === conn) linkDown('closed'); });
    c.on('error', () => { if (c === conn) linkDown('closed'); });
  }

  function onData(c, m) {
    if (closed || L.mute || !m || typeof m !== 'object') return;
    if (m.t !== 'p' && m.t !== 's') trace('got', m.t, c === conn ? '' : '(other link)');
    if (L.role === 'host' && c !== conn) {   // a knock from a phone that isn't (yet) our guest
      if (m.t !== 'hello') return;
      const refuse = kind => { safeSend(c, { t: kind }); setTimeout(() => c.close(), 500); };
      if (m.v !== VERSION) { refuse('version'); emit('note', 'version'); return; }
      if (L.guestToken && m.token !== L.guestToken) { refuse('full'); return; }
      L.guestToken = m.token;
      if (conn) { const old = conn; safeSend(old, { t: 'replaced' }); setTimeout(() => old.close(), 500); }
      conn = c; linked = true; away = !!m.away;
      safeSend(c, { t: 'welcome', away: document.hidden });
      if (away) linkDown('away'); else linkUp();
      return;
    }
    if (c !== conn) return;
    lastHeard = performance.now();
    if (m.t === 'bye') { const f = on.left; finish(); f?.(); return; }
    if (m.t === 'replaced') { fail('replaced'); return; }
    if (L.role === 'guest' && !linked) {
      if (m.t === 'welcome') { linked = true; away = !!m.away; if (away) { clearTimeout(openTimer); emit('waiting'); } else linkUp(); }
      else if (m.t === 'full' || m.t === 'version') fail(m.t);
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
    peer.on('connection', c => { trace('host: incoming link'); wire(c); });
  }

  const sayHello = c => safeSend(c, { t: 'hello', token: L.token, v: VERSION, away: document.hidden });
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
    Object.assign(L, { up: false, rejoin: !!o.rejoin, code: o.code, token: o.token || null, guestToken: o.guestToken || null });
    closed = false; linked = false; away = false; everUp = false; registered = false; codeTries = 0;
    lastHeard = performance.now();
  }

  return {
    // o: { code?, guestToken?, rejoin? }
    host(o = {}) { reset({ ...o, code: o.code || randomCode() }); L.role = 'host'; startHost(); },
    // o: { code, token, rejoin? }
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
    set mute(on) { L.mute = on; },   // testing only: pretend the signal is gone (nothing in, nothing out)
    log,
  };
}
