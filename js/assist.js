// Aim assist for the hunter. When the hunter fires, the shot's direction may be
// bent a few degrees towards a target the hunter can SEE, with a small lead for a moving target. The bent direction is the one in the
// shot message, so both phones draw the same shot and the referee judges the same shot. Hits are still judged on the hider's phone.
// Privacy rule (the whole point): the targets handed in here must be only what this phone already shows on screen: the hider when it is drawn
// solidly (the same condition that stops a bullet on it), the chicken's ledge when there is a clear line to it. Nothing here asks the
// other phone for anything, so a hidden hider can never be revealed by a bend (main.js passes no hider target when it is hidden).
// No three.js in here: the tests use it too.

export const STRENGTHS = { light: 3, medium: 6, strong: 10 };   // the cone, in degrees: the aim must be within it, and the bend is never more than it
const RAD = Math.PI / 180;
const wrap = a => Math.atan2(Math.sin(a), Math.cos(a));

// Where to aim at a target moving at (vx, vz) so a bullet of speed `c` fired from (sx, sz) meets it: the bearing (same convention as the
// tanks' yaw: 0 = +z, positive towards +x), or null if no meeting is possible.
export function leadBearing(sx, sz, tx, tz, vx, vz, c) {
  const px = tx - sx, pz = tz - sz;
  const a = vx * vx + vz * vz - c * c, b = 2 * (px * vx + pz * vz), k = px * px + pz * pz;
  let t;
  if (Math.abs(a) < 1e-9) t = b !== 0 ? -k / b : -1;
  else {
    const d = b * b - 4 * a * k;
    if (d < 0) return null;
    const r = Math.sqrt(d), t1 = (-b - r) / (2 * a), t2 = (-b + r) / (2 * a);
    t = Math.min(...[t1, t2].filter(x => x > 0), Infinity);
  }
  if (!(t > 0) || !Number.isFinite(t)) return null;
  return Math.atan2(px + vx * t, pz + vz * t);
}

// shot: { x, z, yaw } (where the hunter's tank is and where the barrel points). targets: [{ x, z, vx, vz }] (vx = vz = 0 for the chicken).
// opts: { on, strength ('light' | 'medium' | 'strong'), speed (the bullet's m/s) }.
// Returns the yaw to fire at. With the assist off, or nothing inside the cone, that is exactly the yaw it was given.
export function assistYaw(shot, targets, { on = true, strength = 'medium', speed = 40 } = {}) {
  if (!on || !targets || !targets.length) return shot.yaw;
  const cone = (STRENGTHS[strength] ?? STRENGTHS.medium) * RAD;
  let best = null;
  for (const t of targets) {
    const direct = Math.atan2(t.x - shot.x, t.z - shot.z);
    const lead = leadBearing(shot.x, shot.z, t.x, t.z, t.vx || 0, t.vz || 0, speed);
    // the aim counts as "at it" if it is inside the cone of the line to the target as drawn now, or of the line that includes the lead
    const e = Math.min(Math.abs(wrap(shot.yaw - direct)), lead === null ? Infinity : Math.abs(wrap(shot.yaw - lead)));
    if (e > cone) continue;
    const want = wrap((lead === null ? direct : lead) - shot.yaw);
    const bend = Math.max(-cone, Math.min(cone, want));   // never more than the cone
    if (!best || e < best.e) best = { e, bend };
  }
  return best ? shot.yaw + best.bend : shot.yaw;
}
