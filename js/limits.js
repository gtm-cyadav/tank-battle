// Security Stage 4 (SECURITY_FIX_LOG.md): what a phone is willing to believe about the OTHER phone's tank, judged by what can really happen in the game.
// A modified page can say anything, and nothing here can stop a determined cheater (each phone still knows its own tank best). But the cheapest tricks
// stop working: a tank that jumps across the yard, a camera far from its tank, a gun that fires without reloading, during the head start, or from a
// spot where the hunter's tank is not. All numbers are set well above anything a real game does, so a normal game is never touched.
// Pure functions, no game state: tests/limits.test.mjs checks them (including that real driving and real shooting always pass).
export const LIMITS = {
  speed: 16,         // m/s: the fastest any tank can go (forward is 9; the hider's sprint is 1.75 x that = 15.75)
  credit: 48,        // m: movement saved up while a tank was quiet or its messages were late (a stall of up to 2.5 s at sprint speed, then the burst that follows)
  camera: 12,        // m: how far the hunter's camera may be from its tank (the furthest setting is 10)
  shotNear: 10,      // m: a shot must start this close to where the hunter's tank was last seen (it drives 9 m/s at most)
  headStartGrace: 0.5, // s: the two phones' round clocks may differ a little
  future: 1.0,       // s: a shot may claim to be this far ahead of this phone's clock (the same clock difference)
  old: 3.0,          // s: a shot older than this is not a live shot (a long stall); it is dropped, not shown late
  reloadGrace: 0.4,  // s: shots may be this much closer together than the reload time (clock corrections)
};

// One tank's movement, judged message by message. A tank was at `from` and now says it is at `to`: that is believed if it is a possible move, else the tank
// is taken as far towards `to` as it could have driven. (A made-up jump becomes a fast drive, never a teleport.)
// The allowance comes from TIME only: speed x the seconds since the last message, saved up to `credit` metres. So late messages that arrive in a burst
// are fine (the time they were late is saved up), but sending lots of messages in a short time gives no extra room.
export function createStepLimiter(L = LIMITS) {
  let credit = L.credit, last = null;
  return {
    // a new start (first news of the tank, back in sight, a new round): the next step is judged from here
    reset(now) { credit = L.credit; last = Number.isFinite(now) ? now : null; },
    // now: seconds, from any steady clock (performance.now() / 1000)
    step(from, to, now) {
      const dt = last === null || !Number.isFinite(now) ? 0 : Math.max(0, now - last);
      if (Number.isFinite(now)) last = now;
      credit = Math.min(L.credit, credit + L.speed * dt);
      const dx = to.x - from.x, dz = to.z - from.z, d = Math.hypot(dx, dz);
      if (!(d > credit)) { credit -= d; return { x: to.x, z: to.z }; }
      const k = credit / d;
      credit = 0;
      return { x: from.x + dx * k, z: from.z + dz * k };
    },
  };
}

// Is the hunter's camera a believable distance from the hunter's tank? (The hider's phone uses the camera to decide whether it can be seen.)
export const cameraOk = (tank, cam, L = LIMITS) => Number.isFinite(cam?.x) && Number.isFinite(cam?.z) && Math.hypot(cam.x - tank.x, cam.z - tank.z) <= L.camera;

// The hider's phone asks this about every shot the other phone says it fired. rules: the RULES object (headStart, reload).
//   allow(f, clock, from) -> true if the shot is possible
//     f      the shot { mid, r, e (round clock when it left the gun), x, z }
//     clock  this phone's own copy of the round clock now
//     from   where the hunter's tank was last seen { x, z }, or null if not known yet
export function createShotGate(rules, L = LIMITS) {
  let key = '', lastE = -Infinity;
  return {
    allow(f, clock, from) {
      const k = f.mid + '/' + f.r;
      if (k !== key) { key = k; lastE = -Infinity; }                                   // a new round: the gun starts fresh
      if (!Number.isFinite(clock)) return false;
      if (clock < rules.headStart - L.headStartGrace || f.e < rules.headStart - L.headStartGrace) return false;   // the head start is still on
      if (f.e > clock + L.future || clock - f.e > L.old) return false;                  // from the future, or far too old
      if (f.e - lastE < rules.reload - L.reloadGrace) return false;                     // faster than the gun reloads
      if (from && Math.hypot(f.x - from.x, f.z - from.z) > L.shotNear) return false;    // not from where the hunter's tank is
      lastE = f.e;
      return true;
    },
  };
}
