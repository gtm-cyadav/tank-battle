// The match rules (brief section 3, "Rules" and "Rules detail"): hunter and hider, a 3:00 round clock with a
// 20-second head start, best of 3 with roles swapping every round, and Play again.
// Who decides what, so both phones always agree:
//   - The phone that created the room is the referee. It alone tosses the coin, keeps the round number, scores,
//     clock and results, and sends all of that to the other phone twice a second (and at once on any change).
//   - The hider's phone decides whether a bullet hit, because it knows exactly where its own tank is. It tells the
//     referee, which counts the hit only if it landed before the clock reached 0:00.
//   - The hunter's phone decides when it may fire (head start, reload) and tells the other phone about each shot.
// The clock stops while the link is down (the 60-second wait), on both phones.
// Hunter ping (Stage 1e): every 45 s of round time the hunter's corner map shows, for 4 s, a rough circle the hider is
// somewhere inside; the hider gets a 3-second countdown first and sees the same circle.
//   - When: the round clock, which the referee owns (so never in the head start, between rounds or while paused).
//   - Where: only the hider's phone knows exactly where the hider is, so it draws the circle (hider inside, never at the
//     centre) and gives it to the referee, which puts it in the match for both phones. After the 4 s the circle is
//     dropped from the match on both phones.

export const RULES = {
  round: 180,        // s on the clock (was 120; raised with the 1.3x bigger map, Chetan, 2026-09-29)
  headStart: 20,     // s before the hunter can fire (was 15; same reason)
  toss: 4,           // s the coin-toss card shows before round 1
  next: 6,           // s the round result shows before the next round
  grace: 0.8,        // s the referee waits after 0:00 for a hit from the other phone that landed just in time
  wins: 2,           // round wins that take the match
  bulletSpeed: 40,   // m/s
  reload: 1.5,       // s
  sprintTime: 3,     // s a full sprint meter lasts
  refill: 6,         // s for an empty meter to fill up
  sprintBoost: 1.75, // sprint speed = 1.75 x normal (was 1.5; Chetan found it slow, 2026-09-29)
  pingEvery: 45,     // s of round time between pings: at 0:45, 1:30, 2:15 (2:15, 1:30, 0:45 left)
  pingShow: 4,       // s the circle shows
  pingWarn: 3,       // s of countdown the hider gets first
  pingSize: 25,      // m across
};

// Ping number n happens this many seconds into the round, or null if there is no such ping (after the round ends,
// or inside the head start).
export function pingTime(n) {
  const at = n * RULES.pingEvery;
  return n >= 1 && at > RULES.headStart && at < RULES.round ? at : null;
}

const other = side => side === 'host' ? 'guest' : 'host';

// match (the referee's copy is the real one; the other phone holds a copy):
//   mid: match number (goes up with each Play again), round: 1-3, first: who hunted round 1 ('host' | 'guest'),
//   score: { host, guest }, phase: 'toss' | 'play' | 'break' | 'over', t: seconds into this phase,
//   result: last round's { win, how: 'hit' | 'time', left (seconds on the clock) } or null,
//   again: { host, guest } who has tapped Play again,
//   ping: the circle of the ping showing now { n, x, z } (centre, m), or null
// hooks: send(msg), changed(match, before) whenever phase, round or match number change, and on start,
//   where() this phone's tank { x, z } (the hider's phone uses it to draw the ping circle)
export function createRules(hooks) {
  let side = null;         // this phone: 'host' (referee) or 'guest'
  let match = null;
  let paused = false;
  let beat = 0;            // referee: time since the last state message
  let delay = 0.05;        // other phone: one-way message time, from ping replies (s)
  let heard = 0;           // other phone: seconds since the referee's last state message
  let pingClock = 0, pendingHit = null, hitClock = 0;
  let againMid = 0, againClock = 0;   // other phone: tapped Play again for this match (resent until the referee has it)
  let mine = null, circleClock = 0;   // hider's phone: the circle it drew for the current ping { mid, r, n, x, z }

  const referee = () => side === 'host';
  const key = m => m ? `${m.mid}/${m.round}/${m.phase}` : '';
  const copy = m => m && JSON.parse(JSON.stringify(m));
  const phaseLength = m => ({ toss: RULES.toss, play: RULES.round, break: RULES.next })[m.phase] ?? Infinity;

  function set(next) {
    const before = match;
    match = next;
    if (key(before) !== key(match)) hooks.changed(match, before);
  }
  function broadcast() {
    beat = 0;
    if (referee() && match) hooks.send({ t: 'm', m: match, run: !paused });
  }

  // ---- referee only -----------------------------------------------------------------------------------------
  function newMatch(mid) {
    set({ mid, round: 1, first: Math.random() < 0.5 ? 'host' : 'guest', score: { host: 0, guest: 0 },
      phase: 'toss', t: 0, result: null, again: { host: false, guest: false }, ping: null });
    broadcast();
  }
  function startRound(n) {
    set({ ...match, round: n, phase: 'play', t: 0, ping: null });
    broadcast();
  }
  function endRound(win, how, t) {
    const score = { ...match.score, [win]: match.score[win] + 1 };
    const over = score[win] >= RULES.wins;
    set({ ...match, score, phase: over ? 'over' : 'break', t: 0, result: { win, how, left: Math.max(0, RULES.round - t) }, ping: null });
    broadcast();
  }
  // a hit reported by the hider's phone (this one or the other): counts only in the same round, before 0:00
  function judgeHit(h) {
    if (!match || match.phase !== 'play' || h.mid !== match.mid || h.r !== match.round) return;
    if (!(h.e >= 0 && h.e < RULES.round)) return;
    endRound(hunterSide(), 'hit', h.e);
  }

  // ---- both phones ------------------------------------------------------------------------------------------
  const hunterSide = (m = match) => m.round % 2 === 1 ? m.first : other(m.first);

  // The ping whose 4 s are running now: its number, or 0.
  function pingNow() {
    const n = Math.floor(match.t / RULES.pingEvery), at = pingTime(n);
    return at !== null && match.t < at + RULES.pingShow ? n : 0;
  }
  // Run after the clock moved: drop a finished ping's circle; on the hider's phone, draw the circle when a ping starts.
  function pings(dt) {
    if (!match || match.phase !== 'play' || paused) return;
    const n = pingNow();
    if (match.ping) {   // its 4 s are over: gone on both phones (a circle that arrives a moment early is kept)
      const at = pingTime(match.ping.n);
      if (at === null || match.t >= at + RULES.pingShow) { match.ping = null; if (referee()) broadcast(); }
    }
    if (!n || hunterSide() === side) return;
    const same = c => c && c.mid === match.mid && c.r === match.round && c.n === n;
    if (!same(mine) && match.ping?.n === n) mine = { mid: match.mid, r: match.round, ...match.ping };   // after a refresh
    if (!same(mine)) {
      const w = hooks.where?.();
      if (!w) return;
      // somewhere between 30% and 70% of the radius away from the hider, in any direction
      const a = Math.random() * 2 * Math.PI, d = RULES.pingSize / 2 * (0.3 + 0.4 * Math.random()), r2 = v => Math.round(v * 100) / 100;
      mine = { mid: match.mid, r: match.round, n, x: r2(w.x + Math.cos(a) * d), z: r2(w.z + Math.sin(a) * d) };
      sendCircle();
    } else if (!referee() && match.ping?.n !== n && (circleClock += dt) > 0.5) sendCircle();   // resent until the referee has it
  }
  function sendCircle() {
    circleClock = 0;
    const c = { n: mine.n, x: mine.x, z: mine.z };
    if (referee()) { match.ping = c; broadcast(); }
    else hooks.send({ t: 'pc', mid: mine.mid, r: mine.r, ...c });
  }
  // referee: a circle from the other phone, counted only if that phone is the hider's and the ping is running
  function takeCircle(c) {
    if (!match || match.phase !== 'play' || hunterSide() !== 'host' || c.mid !== match.mid || c.r !== match.round) return;
    const at = pingTime(c.n);
    if (at === null || match.t < at - 1 || match.t >= at + RULES.pingShow || match.ping?.n === c.n) return;
    if (!Number.isFinite(c.x) || !Number.isFinite(c.z)) return;
    match.ping = { n: c.n, x: c.x, z: c.z };
    broadcast();
  }

  function tick(dt) {
    if (!match) return;
    if (!referee() && match.phase === 'over') {
      if (!paused) match.t += dt;
      if (againMid === match.mid && !match.again.guest && (againClock += dt) > 1) { againClock = 0; hooks.send({ t: 'a', mid: againMid }); }
      return;
    }
    if (!referee()) {   // the copy runs its own clock between the referee's messages, but never ends a phase itself
      heard += dt;
      if (!paused && heard < 1.5) match.t = Math.min(match.t + dt, phaseLength(match) + (match.phase === 'play' ? RULES.grace : 0));
      if ((pingClock += dt) > 2) { pingClock = 0; hooks.send({ t: 'ping', k: performance.now() }); }
      if (pendingHit && (hitClock += dt) > 0.5) { hitClock = 0; hooks.send(pendingHit); }   // resent until the referee rules
      if (heard < 1.5) pings(dt);
      return;
    }
    if (paused) return;
    match.t += dt;
    if (match.phase === 'toss' && match.t >= RULES.toss) startRound(1);
    else if (match.phase === 'break' && match.t >= RULES.next) startRound(match.round + 1);
    else if (match.phase === 'play' && match.t >= RULES.round) {
      // if the hider is on the other phone, give its hit message a moment to arrive
      const hiderHere = hunterSide() !== side;
      if (hiderHere || match.t >= RULES.round + RULES.grace) endRound(other(hunterSide()), 'time', RULES.round);
    }
    pings(dt);
    if ((beat += dt) >= 0.5) broadcast();
  }

  function onMessage(m) {
    if (m.t === 'ping' && referee()) { hooks.send({ t: 'pong', k: m.k }); return true; }
    if (m.t === 'pong') { delay = delay * 0.7 + Math.min(0.3, (performance.now() - m.k) / 2000) * 0.3; return true; }
    if (m.t === 'h' && referee()) { if (match && hunterSide() === 'host') judgeHit(m); return true; }   // only the hider's phone reports hits
    if (m.t === 'a' && referee()) { playAgain('guest', m.mid); return true; }
    if (m.t === 'pc') { if (referee()) takeCircle(m); return true; }
    if (m.t === 'm' && !referee()) {
      heard = 0;
      const next = copy(m.m);
      if (m.run) next.t += delay;   // it has moved on by the time the message lands
      if (pendingHit && (next.mid !== pendingHit.mid || next.round !== pendingHit.r || next.phase !== 'play')) pendingHit = null;
      if (next.phase === 'over' && againMid === next.mid) next.again.guest = true;   // our tap may still be on its way
      set(next);
      return true;
    }
    return false;
  }

  function playAgain(who, mid) {
    if (!match || match.phase !== 'over' || mid !== match.mid) return;
    if (!referee()) { match.again.guest = true; againMid = mid; againClock = 0; hooks.send({ t: 'a', mid }); return; }
    match.again[who] = true;
    if (match.again.host && match.again.guest) newMatch(match.mid + 1);
    else broadcast();
  }

  return {
    RULES,
    // side: 'host' | 'guest'; saved: the match to carry on with after a refresh (or null for a new one)
    start(s, saved) {
      side = s; paused = false; pendingHit = null; againMid = 0; delay = 0.05; heard = 0; match = null; mine = null;
      if (saved) set(copy(saved));
      if (referee()) { if (!match) newMatch(1); else broadcast(); }
    },
    stop() { side = null; match = null; pendingHit = null; mine = null; },
    pause(on) { paused = on; if (!on) broadcast(); },
    tick,
    onMessage,
    // the hider's phone saw a bullet hit its own tank, `e` seconds into the round
    reportHit(e) {
      if (!match || match.phase !== 'play' || e >= RULES.round || hunterSide() === side) return;
      const h = { t: 'h', mid: match.mid, r: match.round, e };
      if (referee()) judgeHit(h);
      else if (!pendingHit) { pendingHit = h; hitClock = 0; hooks.send(h); }
    },
    playAgain() { if (match) playAgain(side, match.mid); },
    get match() { return match; },
    get side() { return side; },
    get paused() { return paused; },
    role() { return match && side ? (hunterSide() === side ? 'hunter' : 'hider') : null; },
    hunterSide: () => match && hunterSide(),
    snapshot: () => copy(match),
    // What the ping shows on this phone right now: null, { warn: whole seconds left, until: exact seconds left }
    // (hider's countdown), or { circle: { x, z, r } or null (not here yet), since: seconds it has shown } while it shows.
    pingView() {
      if (!match || match.phase !== 'play' || paused) return null;
      const n = Math.floor((match.t + RULES.pingWarn) / RULES.pingEvery), at = pingTime(n);
      if (at === null || match.t >= at + RULES.pingShow) return null;
      const hider = hunterSide() !== side;
      const c = hider ? (mine && mine.mid === match.mid && mine.r === match.round ? mine : null) : match.ping;
      const have = c && c.n === n;
      // a circle already here stays up if the referee's clock nudges this phone's clock back a moment (no blink)
      if (match.t < at && !(have && match.t > at - 0.3)) return hider ? { warn: Math.ceil(at - match.t - 1e-6), until: at - match.t } : null;
      return { circle: have ? { x: c.x, z: c.z, r: RULES.pingSize / 2 } : null, since: Math.max(0, match.t - at) };
    },
  };
}
