// The match rules (brief section 3, "Rules" and "Rules detail"): hunter and hider, a 3:00 round clock with a
// 20-second head start, best of 3 with roles swapping every round, and Play again.
// Who decides what, so both phones always agree:
//   - The phone that created the room is the referee. It alone tosses the coin, keeps the round number, scores,
//     clock and results, and sends all of that to the other phone twice a second (and at once on any change).
//   - The hider's phone decides whether a bullet hit, because it knows exactly where its own tank is. It tells the
//     referee, which counts the hit only if it landed before the clock reached 0:00.
//   - The hunter's phone decides when it may fire (head start, reload) and tells the other phone about each shot.
// The clock stops while the link is down (the 60-second wait), on both phones.
// Surrender (1f, Chetan 2026-09-30): giving up loses the whole match at once; the other player wins and the score stays
// as it was. Only the referee ends the match, so both phones always show the same result:
//   - the referee's own player gives up: the referee ends the match there and then and tells the other phone;
//   - the other phone's player gives up: that phone asks the referee (asked again every 0.5 s until the referee's match
//     shows it over) and shows nothing new until the answer arrives. Whatever reached the referee first counts: a hit
//     or 0:00 the referee had already judged stands, and a request that arrives after the match is over is ignored.
// Leader choice (Stage 3A, Chetan 2026-09-30): every match starts with the phase 'pick', before the coin toss. Each
// player chooses a leader (1-36) or Random (0) and taps Ready. The choices stay private to the phones until the
// referee has both: it draws any Random (one draw, anywhere in 1-36, the two players may get the same leader), puts
// the result in the match (`lead`) and moves on to the coin toss. Both phones use `lead` and nothing else, so they
// always agree (also after a refresh, a rejoin or Play again); nobody is told a leader was Random.
//   - the other phone sends its choice { t: 'c', mid, s, n, ok } and resends it every 0.5 s until the referee's match
//     shows the same Ready state; s (a rising number) puts old messages in order;
//   - the referee's match shows only who is Ready, never who chose what.
// Stage 4B (Chetan, 2026-10-01): three more things the match carries, all decided by the referee and read by both phones:
//   - `log`: one short record per finished round (who hunted, who won and how, the clock, bumps, chicken, tourist, whether the hider was
//     seen, shots fired, badges). The end-of-match awards are a fixed function of it (lines.js awardsFor), so both phones print the same ones;
//   - `ducks`: a bit per round (bit 0 = round 1) that is a rubber-duck round. Five taps in the corner map box on either phone ask for the NEXT
//     round (message `dk`, resent until the match shows it); a tap that comes after that round has started is ignored;
//   - `theme`: null, or the love / hate theme { k, s, w, l, x } (kind and the four messages, already decrypted on the phone that typed the
//     phrase). It is put in the match at the start (the referee's own phone, or the other phone's message `th`) and then kept through
//     Play again until somebody leaves. The phrase and the encrypted texts never reach this file.
// Round-end flow (Chetan, 2026-10-02): between rounds there is no automatic start any more. The break shows three screens in a row, the same
// on both phones because they follow the referee's break clock: the score screen (from the hit's wreck beat until 5 s), the taunt screen
// (until 10 s), then the Ready card (the next round's intro). The next round starts when BOTH players have tapped Ready, or, if one never
// does, 60 s after the first tap plus a visible 10 s countdown. The referee decides all of it and writes it into the match:
//   - `go` { host, guest }: who has tapped Ready for the next round; `goAt`: the break clock at the first tap (-1 = nobody yet).
//     The other phone sends { t: 'rd', mid, r } and sends it again every 0.5 s until the referee's match shows it; a Ready cannot be taken back.
//   - the round starts on the referee (startRound), exactly as the old automatic start did, so the clock, the head start, the pings and the
//     weather all start fresh at that moment on both phones. The break clock stops while the link is down, so the countdown waits too.
//   - Nudge: the player who is Ready may nudge the other one (at most once every 10 s): { t: 'nd', mid, r, k } straight to the other phone,
//     which shows its own copy of the nudging leader's fixed line (lines.js NUDGE). Nothing typed is ever sent.
// The match-over screen uses the same first two screens (score, taunt) before the match-over card; a surrender goes straight to the card.
// Hunter ping (Stage 1e): every 45 s of round time the hunter's corner map shows, for 4 s, a rough circle the hider is
// somewhere inside; the hider gets a 3-second countdown first and sees the same circle.
//   - When: the round clock, which the referee owns (so never in the head start, between rounds or while paused).
//   - Where: only the hider's phone knows exactly where the hider is, so it draws the circle (hider inside, never at the
//     centre) and gives it to the referee, which puts it in the match for both phones. After the 4 s the circle is
//     dropped from the match on both phones.

import { randomWeather } from './weather.js';
import { shotEffects, badgesOf } from './eggs.js';
import { cleanMatch, cleanTheme } from './guard.js';   // security Stage 1: whatever the other phone (or the browser's saved copy) gives us is rebuilt here first

export const RULES = {
  round: 180,        // s on the clock (was 120; raised with the 1.3x bigger map, Chetan, 2026-09-29)
  headStart: 20,     // s before the hunter can fire (was 15; same reason)
  toss: 7,           // s from the coin toss to round 1: the toss card, then the intro card (Stage 3B; was 4). Round 1 still starts by itself.
  tossCard: 3,       // s the coin-toss card shows before the intro card takes over (Stage 3B)
  scoreCard: 5,      // s into the break (or the match over) the score screen shows; then the taunt screen (round-end flow, 2026-10-02)
  readyCard: 10,     // s into the break the Ready card takes over (the match over: the match-over card)
  stallWait: 60,     // s after the first Ready tap before the late countdown shows
  stallShow: 10,     // s of late countdown ("Starting anyway in N s"); then the round starts anyway
  nudgeGap: 10,      // s between two nudges from the same player
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
  leaders: 36,       // leaders to pick from (Stage 3A); choice 0 = Random
  rounds: 3,         // rounds in a match at most (best of 3)
  speedrun: 20,      // s of hunting time (after the head start) a hit must come inside to earn the Speedrun badge (Stage 4A)
  bumpHold: 0.25,    // s the two tanks must stay touching before it counts as a bump (Stage 4A)
  bumpGap: 20,       // s of round time between two bump lines
  bumpMax: 3,        // bump lines in one round, at most
};

// What the match carries for the easter eggs (Stage 4A). All of it is decided by the referee phone alone and read by both,
// so a refresh, a rejoin or a role swap can never replay or change anything:
//   gold      the hunter's shot stopped against the chicken's block this round (the tank trim is gold until the next round)
//   silver    the hider's tank drove up to the chicken this round (the hider's trim is silver until the next round)
//   bump      how many bump lines have been spoken this round; bumpAt: round clock when the last one was
//   sorry     1 once a shot has passed the tourist this round
//   seen      the hider's phone said, at some moment of this round, that the hunter may have seen it (for the Ghost badge)
//   lastShot  round clock when the hunter's last shot left the gun (-1 = none; for the Cinematic escape badge)
//   shots     how many shots the hunter has fired this round (for the awards)
const EGG0 = { gold: false, silver: false, bump: 0, bumpAt: -99, sorry: 0, seen: false, lastShot: -1, shots: 0 };
const eggKey = m => m ? `${m.mid}/${m.round}/${m.gold ? 1 : 0}${m.silver ? 1 : 0}/${m.bump | 0}/${m.sorry | 0}` : '';

// Ping number n happens this many seconds into the round, or null if there is no such ping (after the round ends,
// or inside the head start).
export function pingTime(n) {
  const at = n * RULES.pingEvery;
  return n >= 1 && at > RULES.headStart && at < RULES.round ? at : null;
}

const other = side => side === 'host' ? 'guest' : 'host';

// Stage 4B: the theme in the match must be exactly this shape (the texts are plain strings; nothing else is let through).
// Security Stage 1: it now lives in guard.js (which also strips control and direction-changing characters); same name and shape as before.
export { cleanTheme };
// The round a tap on the duck code would change: the next one (round 1 during the coin toss, round + 1 in a round or its break),
// or 0 when there is none (the last round, the match over, the leader picker).
export const nextRoundOf = m => !m ? 0 : m.phase === 'toss' ? 1 : (m.phase === 'play' || m.phase === 'break') && m.round < RULES.rounds ? m.round + 1 : 0;
// Is round r (default: the match's current one) a rubber-duck round?
export const isDuckRound = (m, r = m?.round) => !!m && r >= 1 && (((m.ducks | 0) >> (r - 1)) & 1) === 1;
// Round-end flow: which screen the break (or the match over) shows at the match's clock: 'beat' (the wreck after a hit), 'score', 'taunt',
// then 'ready' (break) or 'final' (match over). A surrender shows 'final' at once. Both phones work it out from the shared match.
export function cardView(m) {
  if (!m) return null;
  if (m.phase === 'toss') return m.t >= RULES.tossCard ? 'intro' : 'toss';
  if (m.phase !== 'break' && m.phase !== 'over') return null;
  const r = m.result;
  if (m.phase === 'over' && (!r || r.how === 'gaveup')) return 'final';
  if (r?.how === 'hit' && m.t < 1.2) return 'beat';
  return m.t < RULES.scoreCard ? 'score' : m.t < RULES.readyCard ? 'taunt' : m.phase === 'over' ? 'final' : 'ready';
}
// Seconds until a stalled wait starts the round anyway (Infinity until somebody is Ready)
export const stallLeft = m => m?.phase === 'break' && m.goAt >= 0 ? m.goAt + RULES.stallWait + RULES.stallShow - m.t : Infinity;
const GO0 = () => ({ go: { host: false, guest: false }, goAt: -1 });

// match (the referee's copy is the real one; the other phone holds a copy):
//   mid: match number (goes up with each Play again), round: 1-3, first: who hunted round 1 ('host' | 'guest'),
//   score: { host, guest }, phase: 'toss' | 'play' | 'break' | 'over', t: seconds into this phase,
//   result: last round's { win, how: 'hit' | 'time', left (seconds on the clock) } or null; after a surrender
//     { win (the match winner), how: 'gaveup', by (who gave up), left },
//   again: { host, guest } who has tapped Play again,
//   ping: the circle of the ping showing now { n, x, z } (centre, m), or null,
//   wx: this round's weather (Stage 2A: drawn at random by the referee for every round, both phones use it),
//   next: during the break, the next round's weather (shown on the card first), else null.
//   result.at: where the hider was hit { x, z } (for the explosion on the hunter's phone), when known
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
  let want = { n: 0, ok: false, s: 0 }, wantClock = 0;   // this phone's choice: leader (0 = Random), Ready, message number
  let theirs = null;                  // referee: the other phone's choice { n, ok, s } (private, never put in the match)
  let quitMid = 0, quitClock = 0;     // other phone: asked the referee to end this match as a surrender (asked again until it's over)
  let due = [];                       // referee: eggs waiting for a bullet to arrive { at (round clock), k: 'gold' | 'sorry' }
  let honkSent = null;                // hider's phone (not the referee): told the referee it drove up to the chicken { mid, r, clock }
  let seenSent = null;                // hider's phone (not the referee): told the referee the hunter may have seen it { mid, r, clock }
  let armed = null, themeClock = 0;   // other phone: the theme its player typed (decrypted), sent to the referee until the match shows one
  let duckSent = null;                // other phone: asked the referee for a duck round { mid, n, clock } (asked again until the match shows it)
  let goSent = null, goSeen = false;  // other phone: tapped Ready for the next round { mid, r, clock } (resent until the referee's own match shows it)
  let againSeen = false;              // other phone: the referee's own match shows our Play again tap
  let life = 0;                       // seconds this phone's rules have run (for the nudge's 10 s gap)
  let nudgeAt = -99, nudgeK = 0, nudgeHeard = -99;   // last nudge sent (life), how many sent, last one shown here

  const referee = () => side === 'host';
  const key = m => m ? `${m.mid}/${m.round}/${m.phase}` : '';
  const copy = m => m && JSON.parse(JSON.stringify(m));
  const phaseLength = m => ({ toss: RULES.toss, play: RULES.round })[m.phase] ?? Infinity;   // a break lasts until both are Ready (round-end flow)

  function set(next) {
    const before = match;
    match = next;
    if (key(before) !== key(match)) hooks.changed(match, before);
    if (eggKey(before) !== eggKey(match)) hooks.eggs?.(match, before);
  }
  function broadcast() {
    beat = 0;
    if (referee() && match) hooks.send({ t: 'm', m: match, run: !paused });
  }

  // ---- referee only -----------------------------------------------------------------------------------------
  function newMatch(mid) {
    theirs = null; want = { n: want.n, ok: false, s: want.s };
    set({ mid, round: 1, first: Math.random() < 0.5 ? 'host' : 'guest', score: { host: 0, guest: 0 },
      phase: 'pick', t: 0, result: null, again: { host: false, guest: false }, ping: null, wx: randomWeather(), next: null,
      ready: { host: false, guest: false }, lead: null, ...EGG0, ...GO0(),
      log: [], ducks: 0, theme: match?.theme || cleanTheme(hooks.theme?.()) });
    due = [];
    broadcast();
  }
  // both Ready: draw any Random and go to the coin toss
  function resolvePick() {
    if (!match || match.phase !== 'pick' || !match.ready.host || !match.ready.guest || !theirs?.ok || !want.ok) return;
    const draw = n => n || 1 + Math.floor(Math.random() * RULES.leaders);
    set({ ...match, phase: 'toss', t: 0, lead: { host: draw(want.n), guest: draw(theirs.n) } });
    broadcast();
  }
  function startRound(n) {
    due = [];
    set({ ...match, round: n, phase: 'play', t: 0, ping: null, wx: match.next || match.wx, next: null, ...EGG0, ...GO0() });
    broadcast();
  }
  function endRound(win, how, t, at) {
    const score = { ...match.score, [win]: match.score[win] + 1 };
    const over = score[win] >= RULES.wins;
    const result = { win, how, left: Math.max(0, RULES.round - t) };
    if (at) result.at = at;
    const badges = badgesOf(how, result.left, !!match.seen, match.lastShot ?? -1, RULES);   // written once, here, so both phones read the same
    if (badges.length) result.badges = badges;
    due = [];
    // one short record of the round for the end-of-match awards (Stage 4B)
    const log = [...(match.log || []), { h: hunterSide(), w: win, how, l: Math.round(result.left * 10) / 10, b: match.bump | 0, g: match.gold ? 1 : 0, s: match.silver ? 1 : 0,
      so: match.sorry | 0, sn: match.seen ? 1 : 0, sh: match.shots | 0, bd: badges }];
    set({ ...match, score, log, phase: over ? 'over' : 'break', t: 0, result, ping: null, next: over ? null : randomWeather(), ...GO0() });
    broadcast();
  }
  // `who` gives up: the other player wins the match at once; the score stays as it was (Chetan's choice, 1f)
  function giveUp(who) {
    if (!match || match.phase === 'over') return;
    const left = match.phase === 'play' ? Math.max(0, RULES.round - match.t) : match.result?.left ?? RULES.round;
    due = [];
    set({ ...match, phase: 'over', t: 0, result: { win: other(who), how: 'gaveup', by: who, left }, ping: null, next: null });
    broadcast();
  }
  // a hit reported by the hider's phone (this one or the other): counts only in the same round, before 0:00
  function judgeHit(h) {
    if (!match || match.phase !== 'play' || h.mid !== match.mid || h.r !== match.round) return;
    if (!(h.e >= 0 && h.e < RULES.round)) return;
    endRound(hunterSide(), 'hit', h.e, Number.isFinite(h.x) && Number.isFinite(h.z) ? { x: h.x, z: h.z } : null);
  }

  // ---- round-end flow (referee only): a Ready tap from `who`. The first one starts the stall clock (never before the Ready card). ----
  function goReady(who) {
    if (!match || match.phase !== 'break' || match.go?.[who]) return;
    const go = { ...(match.go || { host: false, guest: false }), [who]: true };
    set({ ...match, go, goAt: match.goAt >= 0 ? match.goAt : Math.max(match.t, RULES.readyCard) });
    broadcast();
  }

  // ---- easter eggs (Stage 4A, referee only) ------------------------------------------------------------------
  // A shot of the hunter's, from this phone or the other: where its bullet ends and whether it passes the tourist are fixed
  // by the shot and the clock, so they are worked out here once and put in the match for both phones.
  function noteShot(f) {
    if (!match || match.phase !== 'play' || paused || f.mid !== match.mid || f.r !== match.round) return;
    if (![f.x, f.z, f.y, f.e].every(Number.isFinite) || !(f.e >= RULES.headStart && f.e < RULES.round)) return;
    match.lastShot = Math.max(match.lastShot ?? -1, f.e);
    match.shots = (match.shots | 0) + 1;
    const fx = shotEffects({ x: f.x, z: f.z, yaw: f.y }, f.e, match.mid, match.round, RULES.bulletSpeed);
    if (fx.chicken && !match.gold && !due.some(d => d.k === 'gold')) due.push({ at: Math.max(fx.arrive, match.t), k: 'gold' });
    if (fx.sorry !== null && !match.sorry && !due.some(d => d.k === 'sorry')) due.push({ at: Math.max(fx.sorry, match.t), k: 'sorry' });
  }
  function dueEggs() {
    if (!due.length || match.phase !== 'play') return;
    const now = due.filter(d => d.at <= match.t);
    if (!now.length) return;
    due = due.filter(d => d.at > match.t);
    const next = { ...match };
    for (const d of now) { if (d.k === 'gold') next.gold = true; else next.sorry = 1; }
    set(next);
    broadcast();
  }
  // the two tanks have stayed touching: a bump line, if the gap since the last one and the round's limit allow
  function noteBump() {
    if (!match || match.phase !== 'play' || paused || (match.bump | 0) >= RULES.bumpMax || match.t - (match.bumpAt ?? -99) < RULES.bumpGap) return false;
    set({ ...match, bump: (match.bump | 0) + 1, bumpAt: match.t });
    broadcast();
    return true;
  }
  // the hider's phone: the hunter may have seen it. The referee notes it; the other phone tells the referee until it shows.
  function noteSeen() {
    if (!match || match.phase !== 'play' || hunterSide() === side || match.seen) return;
    if (referee()) { set({ ...match, seen: true }); broadcast(); }
    else if (!seenSent || seenSent.mid !== match.mid || seenSent.r !== match.round) { seenSent = { mid: match.mid, r: match.round, clock: 0 }; hooks.send({ t: 'sn', mid: match.mid, r: match.round }); }
  }

  // the hider's phone: it drove up to the chicken (it alone knows exactly where it is). The referee notes it; the other phone tells it until it shows.
  function noteHonk() {
    if (!match || match.phase !== 'play' || paused || hunterSide() === side || match.silver) return;
    if (referee()) { set({ ...match, silver: true }); broadcast(); }
    else if (!honkSent || honkSent.mid !== match.mid || honkSent.r !== match.round) { honkSent = { mid: match.mid, r: match.round, clock: 0 }; hooks.send({ t: 'hn', mid: match.mid, r: match.round }); }
  }

  // ---- Stage 4B: duck rounds and the theme (referee) ---------------------------------------------------------
  function setDuck(n) {
    if (!match || n !== nextRoundOf(match)) return false;
    if (!isDuckRound(match, n)) { set({ ...match, ducks: (match.ducks | 0) | (1 << (n - 1)) }); broadcast(); }
    return true;
  }
  function setTheme(p) {
    const th = cleanTheme(p);
    if (!match || match.theme || !th || match.phase === 'over') return false;
    set({ ...match, theme: th });
    broadcast();
    return true;
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
    life += dt;
    if (!referee() && match.phase === 'over') {
      if (!paused) match.t += dt;
      quitMid = 0;
      if (againMid === match.mid && !againSeen && (againClock += dt) > 1) { againClock = 0; hooks.send({ t: 'a', mid: againMid }); }   // resent until the referee's match shows it
      return;
    }
    if (!referee()) {   // the copy runs its own clock between the referee's messages, but never ends a phase itself
      heard += dt;
      if (!paused && heard < 1.5) match.t = Math.min(match.t + dt, phaseLength(match) + (match.phase === 'play' ? RULES.grace : 0));
      if ((pingClock += dt) > 2) { pingClock = 0; hooks.send({ t: 'ping', k: performance.now() }); }
      if (pendingHit && (hitClock += dt) > 0.5) { hitClock = 0; hooks.send(pendingHit); }   // resent until the referee rules
      if (quitMid !== match.mid) quitMid = 0;   // a Play again or new match: that surrender is done
      else if ((quitClock += dt) > 0.5) { quitClock = 0; hooks.send({ t: 'g', mid: quitMid }); }   // asked again until the referee ends it
      if (heard < 1.5) pings(dt);
      if (honkSent && !match.silver && match.phase === 'play' && honkSent.mid === match.mid && honkSent.r === match.round && (honkSent.clock += dt) > 0.5) { honkSent.clock = 0; hooks.send({ t: 'hn', mid: honkSent.mid, r: honkSent.r }); }
      if (seenSent && !match.seen && match.phase === 'play' && seenSent.mid === match.mid && seenSent.r === match.round && (seenSent.clock += dt) > 0.5) { seenSent.clock = 0; hooks.send({ t: 'sn', mid: seenSent.mid, r: seenSent.r }); }
      if (match.phase === 'pick' && match.ready.guest !== want.ok && (wantClock += dt) > 0.5) sendChoice();   // resent until the referee shows it
      if (armed && match.theme) armed = null;                                                            // the match has its theme (ours or the referee's)
      else if (armed && match.phase !== 'over' && heard < 1.5 && (themeClock += dt) > 0.5) { themeClock = 0; hooks.send({ t: 'th', mid: match.mid, p: armed }); }
      if (goSent) {   // tapped Ready: asked again until the referee's own match shows it; done when the round has moved on
        if (match.phase !== 'break' || goSent.mid !== match.mid || goSent.r !== match.round) goSent = null;
        else if (!goSeen && heard < 1.5 && (goSent.clock += dt) > 0.5) { goSent.clock = 0; hooks.send({ t: 'rd', mid: goSent.mid, r: goSent.r }); }
      }
      if (duckSent) {   // asked for a duck round: asked again until the match shows it, dropped when that round is no longer the next one
        if (duckSent.mid !== match.mid || nextRoundOf(match) !== duckSent.n || isDuckRound(match, duckSent.n)) duckSent = null;
        else if ((duckSent.clock += dt) > 0.5) { duckSent.clock = 0; hooks.send({ t: 'dk', mid: duckSent.mid, n: duckSent.n }); }
      }
      return;
    }
    if (paused) return;
    match.t += dt;
    if (match.phase === 'toss' && match.t >= RULES.toss) startRound(1);
    // the next round: both players Ready (never before the Ready card shows), or the stalled wait has run out
    else if (match.phase === 'break' && match.t >= RULES.readyCard && ((match.go?.host && match.go?.guest) || stallLeft(match) <= 0)) startRound(match.round + 1);
    else if (match.phase === 'play' && match.t >= RULES.round) {
      // if the hider is on the other phone, give its hit message a moment to arrive
      const hiderHere = hunterSide() !== side;
      if (hiderHere || match.t >= RULES.round + RULES.grace) endRound(other(hunterSide()), 'time', RULES.round);
    }
    pings(dt);
    dueEggs();
    if ((beat += dt) >= 0.5) broadcast();
  }

  function sendChoice() { wantClock = 0; if (!want.s) return; hooks.send({ t: 'c', mid: match.mid, s: want.s, n: want.n, ok: want.ok }); }

  function onMessage(m) {
    if (m.t === 'c') {
      if (referee() && match?.phase === 'pick' && m.mid === match.mid && !(theirs && m.s <= theirs.s) && Number.isInteger(m.n) && m.n >= 0 && m.n <= RULES.leaders) {
        theirs = { n: m.n, ok: !!m.ok, s: m.s };
        match.ready.guest = theirs.ok;
        resolvePick();
        if (match.phase === 'pick') broadcast();
      }
      return true;
    }
    if (m.t === 'ping' && referee()) { hooks.send({ t: 'pong', k: m.k }); return true; }
    if (m.t === 'pong') { delay = delay * 0.7 + Math.min(0.3, (performance.now() - m.k) / 2000) * 0.3; return true; }
    if (m.t === 'h' && referee()) { if (match && hunterSide() === 'host') judgeHit(m); return true; }   // only the hider's phone reports hits
    if (m.t === 'a' && referee()) { playAgain('guest', m.mid); return true; }
    if (m.t === 'rd') { if (referee() && match && m.mid === match.mid && m.r === match.round) goReady('guest'); return true; }   // the other phone is Ready
    if (m.t === 'nd') {   // the other player nudged: shown only while this phone is still on its Ready card and the nudger is Ready; never more than once a gap
      const them = other(side);
      if (match?.phase === 'break' && m.mid === match.mid && m.r === match.round && match.go?.[them] && !match.go?.[side] && match.t >= RULES.readyCard - 0.5 && life - nudgeHeard >= RULES.nudgeGap - 1) { nudgeHeard = life; hooks.nudged?.(them); }
      return true;
    }
    if (m.t === 'g') { if (referee() && match && m.mid === match.mid) giveUp('guest'); return true; }   // the other phone gave up
    if (m.t === 'pc') { if (referee()) takeCircle(m); return true; }
    if (m.t === 'hn') { if (referee() && match?.phase === 'play' && m.mid === match.mid && m.r === match.round && hunterSide() === 'host' && !match.silver && !paused) { set({ ...match, silver: true }); broadcast(); } return true; }
    if (m.t === 'sn') { if (referee() && match?.phase === 'play' && m.mid === match.mid && m.r === match.round && hunterSide() === 'host' && !match.seen) { set({ ...match, seen: true }); broadcast(); } return true; }
    if (m.t === 'th') { if (referee()) setTheme(m.p); return true; }
    if (m.t === 'dk') { if (referee() && match && m.mid === match.mid && Number.isInteger(m.n) && !paused) setDuck(m.n); return true; }
    if (m.t === 'f') { if (referee() && match && hunterSide() !== 'host') noteShot(m); return false; }   // the hunter's shot: the referee looks at it, main.js draws it
    if (m.t === 'm' && !referee()) {
      const clean = cleanMatch(m.m, RULES);   // security Stage 1: the referee is not trusted either; a match that does not fit the shape is ignored
      if (!clean) return true;
      heard = 0;
      const next = copy(clean);
      if (m.run) next.t += delay;   // it has moved on by the time the message lands
      if (pendingHit && (next.mid !== pendingHit.mid || next.round !== pendingHit.r || next.phase !== 'play')) pendingHit = null;
      againSeen = next.phase === 'over' && againMid === next.mid && !!next.again?.guest;
      if (next.phase === 'over' && againMid === next.mid) next.again.guest = true;   // our tap may still be on its way
      goSeen = !!goSent && next.phase === 'break' && goSent.mid === next.mid && goSent.r === next.round && !!next.go?.guest;
      if (goSent && next.phase === 'break' && goSent.mid === next.mid && goSent.r === next.round) next.go = { ...(next.go || {}), guest: true };   // ours may still be on its way
      if (next.phase === 'pick' && match && (match.mid !== next.mid || match.phase !== 'pick')) want = { ...want, ok: false };   // a new match: choose again
      if (next.phase === 'pick' && next.ready.guest !== want.ok) wantClock = 1;   // a choice waiting for the match goes out at once
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
      side = s; paused = false; pendingHit = null; againMid = 0; quitMid = 0; delay = 0.05; heard = 0; match = null; mine = null;
      want = { n: 0, ok: false, s: 0 }; wantClock = 0; theirs = null; due = []; seenSent = null; honkSent = null; armed = null; duckSent = null;
      goSent = null; goSeen = false; againSeen = false; nudgeAt = -99; nudgeHeard = -99;
      const keep = saved && cleanMatch(saved, RULES);   // security Stage 1: the copy saved in the browser is checked too
      if (keep) set(copy(keep));
      // a refresh after tapping Ready: the tap is in the saved copy; ask the referee again until its match shows it (it may never have arrived)
      if (s === 'guest' && match?.phase === 'break' && match.go?.guest) goSent = { mid: match.mid, r: match.round, clock: 1 };
      if (referee()) {
        if (match?.phase === 'pick') match.ready.guest = false;   // its private choice was lost: it sends it again
        if (!match) newMatch(1); else broadcast();
      }
    },
    stop() { side = null; match = null; pendingHit = null; mine = null; quitMid = 0; theirs = null; due = []; seenSent = null; honkSent = null; armed = null; duckSent = null; goSent = null; },
    pause(on) { paused = on; if (!on) broadcast(); },
    tick,
    onMessage,
    // the hider's phone saw a bullet hit its own tank, `e` seconds into the round, at `at` { x, z } (optional)
    reportHit(e, at) {
      if (!match || match.phase !== 'play' || e >= RULES.round || hunterSide() === side) return;
      const h = { t: 'h', mid: match.mid, r: match.round, e };
      if (at) { h.x = Math.round(at.x * 100) / 100; h.z = Math.round(at.z * 100) / 100; }
      if (referee()) judgeHit(h);
      else if (!pendingHit) { pendingHit = h; hitClock = 0; hooks.send(h); }
    },
    playAgain() { if (match) playAgain(side, match.mid); },
    // Round-end flow: this phone's player taps Ready on the Ready card. False if there is nothing to be Ready for (or already Ready).
    readyUp() {
      if (!match || match.phase !== 'break' || match.go?.[side] || quitMid === match.mid) return false;
      if (referee()) { goReady(side); return true; }
      goSent = { mid: match.mid, r: match.round, clock: 0 }; goSeen = false;
      match.go = { ...(match.go || {}), guest: true };   // shown at once; the referee's match confirms it
      hooks.send({ t: 'rd', mid: match.mid, r: match.round });
      return true;
    },
    // Nudge the other player (only while this player is Ready and the other is not, at most once every 10 s). True if it was sent.
    nudge() {
      if (!match || match.phase !== 'break' || !match.go?.[side] || match.go?.[other(side)] || match.t < RULES.readyCard - 0.5 || life - nudgeAt < RULES.nudgeGap) return false;
      nudgeAt = life;
      hooks.send({ t: 'nd', mid: match.mid, r: match.round, k: ++nudgeK });
      return true;
    },
    // seconds until this player may nudge again (0 = now)
    get nudgeWait() { return Math.max(0, RULES.nudgeGap - (life - nudgeAt)); },
    // Stage 4A (this phone's game tells the rules): the hunter fired on this phone (referee only looks at it), the tanks have
    // stayed touching (referee only), the hider's phone says the hunter may have seen it (either phone).
    noteShot(f) { if (referee()) noteShot(f); },
    noteBump() { return referee() && noteBump(); },
    noteSeen,
    noteHonk,
    // Stage 4B. The other phone's player typed the secret phrase: its (decrypted) theme goes to the referee until the match shows one.
    armTheme(p) { if (!referee()) { armed = cleanTheme(p); themeClock = 1; } },
    // This phone's player finished the five taps: ask for the next round to be a duck round. Returns that round's number, or 0 if there is none.
    noteDuck() {
      if (!match || paused || quitMid === match.mid) return 0;
      const n = nextRoundOf(match);
      if (!n) return 0;
      if (referee()) return setDuck(n) ? n : 0;
      duckSent = { mid: match.mid, n, clock: 0 };
      hooks.send({ t: 'dk', mid: match.mid, n });
      return n;
    },
    get theme() { return match?.theme || null; },
    // this phone's choice of leader (n: 1-36, or 0 = Random) and whether it is Ready. Only in the pick phase.
    choose(n, ok) {
      if (!match && !referee()) { want = { n, ok: !!ok, s: Math.max(want.s + 1, Date.now()) }; return false; }   // asked before the referee's first message: kept, sent once the match is here
      if (!match || match.phase !== 'pick') return false;
      want = { n, ok: !!ok, s: Math.max(want.s + 1, Date.now()) };
      if (referee()) { match.ready.host = want.ok; resolvePick(); if (match.phase === 'pick') broadcast(); }
      else sendChoice();
      return true;
    },
    get ready() { return match?.ready?.[side] ?? false; },
    // the leader numbers this phone's match uses: { me, them }, or null until the coin toss
    leaders() { return match?.lead ? { me: match.lead[side], them: match.lead[other(side)] } : null; },
    // this phone's player gives up the match (Surrender in the menu). False if there is nothing to give up.
    giveUp() {
      if (!match || match.phase === 'over' || quitMid === match.mid) return false;
      if (referee()) giveUp(side);
      else { quitMid = match.mid; quitClock = 0; hooks.send({ t: 'g', mid: quitMid }); }
      return true;
    },
    // the other phone gave up and is waiting for the referee to end the match (its tank stays still meanwhile)
    get givingUp() { return !!match && quitMid === match.mid && match.phase !== 'over'; },
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
