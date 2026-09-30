// Sound (Stage 2A): a light set of short CC0 clips (audio/, list in the brief's asset log), played through Web Audio.
// - Nothing plays, and no audio is even set up, before the player's first tap or key press (browsers, iPhone above
//   all, only allow sound to start from a tap; the first tap also "unlocks" it on iOS).
// - Mute switch in Settings. Silent whenever the game is out of sight (switched app, screen locked, other tab).
// - Hearing follows sight (Chetan, 2026-09-29, "only what you see"): the other tank's engine is heard only while it is
//   in view; the hunter's shots are heard on both phones, louder when close, but with no left/right direction.
// Loops (engine, sprint, rain, lamp hum, heartbeat) are set every frame by frame(); one-off sounds by play().

const FILES = ['engine', 'lamp', 'rain', 'sprint', 'shot', 'impact', 'explosion', 'heartbeat', 'tick', 'ping', 'tap', 'zap'];
const VERSION = new URL(import.meta.url).searchParams.get('v') || 'local';

let ctx = null, master = null, muted = false, wanted = false;   // wanted: the player has tapped, so sound may run
const buffers = {};
const loops = {};
let loading = null;

function load() {
  if (loading) return loading;
  loading = Promise.all(FILES.map(async name => {
    try {
      const data = await (await fetch(`audio/${name}.wav?v=${VERSION}`)).arrayBuffer();
      buffers[name] = await new Promise((ok, bad) => ctx.decodeAudioData(data, ok, bad));   // callback form: older Safari
    } catch (e) { /* a missing clip just stays silent */ }
  }));
  return loading;
}

// Should the audio be running right now?
const live = () => wanted && !muted && !document.hidden;
function sync() {
  if (!ctx) return;
  if (live()) { if (ctx.state !== 'running') ctx.resume().catch(() => {}); }
  else if (ctx.state === 'running') ctx.suspend().catch(() => {});
}

// First tap or key: create the audio, play one silent sample (the iOS unlock), start loading the clips.
function unlock() {
  wanted = true;
  if (!ctx) {
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return;
    ctx = new AC();
    master = ctx.createGain();
    master.gain.value = 0.9;
    // a gentle limiter, so a shot and an explosion together never crackle on a phone speaker
    const comp = ctx.createDynamicsCompressor();
    comp.threshold.value = -10; comp.ratio.value = 6; comp.attack.value = 0.003; comp.release.value = 0.2;
    master.connect(comp).connect(ctx.destination);
    const s = ctx.createBufferSource();
    s.buffer = ctx.createBuffer(1, 1, 22050);
    s.connect(ctx.destination);
    s.start(0);
    load();
  }
  sync();
}
// every tap keeps trying: iOS can leave the audio "interrupted" after a phone call or the lock screen
for (const t of ['touchend', 'pointerup', 'click', 'keydown']) addEventListener(t, unlock, { capture: true, passive: true });
document.addEventListener('visibilitychange', sync);
addEventListener('pagehide', () => { if (ctx && ctx.state === 'running') ctx.suspend().catch(() => {}); });
addEventListener('pageshow', sync);

export function setMuted(on) { muted = on; sync(); }

// One-off sound. gain 0..1, rate = playback speed (pitch), pan -1 (left) .. 1 (right).
export function play(name, gain = 1, rate = 1, pan = 0) {
  if (!live() || !ctx || ctx.state !== 'running' || !buffers[name] || gain <= 0.005) return;
  const s = ctx.createBufferSource(), g = ctx.createGain();
  s.buffer = buffers[name];
  s.playbackRate.value = rate;
  g.gain.value = gain;
  let node = s.connect(g);
  if (pan && ctx.createStereoPanner) { const p = ctx.createStereoPanner(); p.pan.value = pan; node = node.connect(p); }
  node.connect(master);
  s.start();
}

// A looping sound, faded smoothly to the gain and speed asked for (0 = off, and then it stops using the phone).
function loop(name, gain, rate = 1, pan = 0) {
  let l = loops[name];
  if (gain <= 0.003) {
    if (l && !l.stopping) {
      l.stopping = true;
      l.g.gain.setTargetAtTime(0, ctx.currentTime, 0.08);
      l.s.stop(ctx.currentTime + 0.5);
      delete loops[name];
    }
    return;
  }
  if (!buffers[name]) return;
  if (!l) {
    const s = ctx.createBufferSource(), g = ctx.createGain(), p = ctx.createStereoPanner ? ctx.createStereoPanner() : null;
    s.buffer = buffers[name]; s.loop = true;
    g.gain.value = 0;
    s.connect(g); (p ? g.connect(p) : g).connect(master);
    s.start(0, Math.random() * buffers[name].duration);   // different place in the loop each time: less repetitive
    l = loops[name] = { s, g, p };
  }
  l.g.gain.setTargetAtTime(gain, ctx.currentTime, 0.06);
  l.s.playbackRate.setTargetAtTime(rate, ctx.currentTime, 0.06);
  if (l.p) l.p.pan.setTargetAtTime(pan, ctx.currentTime, 0.06);
}

// Volume by distance (m): full up close, fading out by `far`.
export const byDistance = (d, far = 70, floor = 0) => Math.max(floor, Math.pow(Math.max(0, 1 - d / far), 1.6));

// Every frame. s = {
//   speed (own tank, m/s), throttle (0..1), sprint (true while sprinting),
//   other: null or { speed, dist, pan, fade } (only while the other tank is in view),
//   rain (0/1), lamp: { d, level } nearest lamp, heart (0 = off, else 0..1 how close to 0:00), quiet (true between rounds, cards),
//   off (true on the start screen: every loop stops, e.g. after Quit to menu, 1f) }
export function frame(s) {
  if (!ctx || ctx.state !== 'running') return;
  const on = s.off ? 0 : 1, q = on * (s.quiet ? 0.35 : 1);
  const sp = Math.min(1.8, Math.abs(s.speed) / 9);
  loop('engine', (0.22 + 0.2 * sp + 0.1 * s.throttle) * q, 0.78 + 0.32 * sp);
  loop('sprint', s.sprint ? 0.45 * on : 0, 1.1);
  const o = s.other;
  // the other tank's engine: its own loop voice (a second copy of the clip, lower and further away)
  if (o && on) otherEngine(0.32 * byDistance(o.dist, 40) * o.fade * q, 0.72 + 0.3 * Math.min(1.8, Math.abs(o.speed) / 9), o.pan);
  else otherEngine(0);
  loop('rain', s.rain ? 0.3 * on : 0, 1);
  loop('lamp', s.lamp ? 0.18 * on * s.lamp.level * byDistance(s.lamp.d, 14) : 0, 1);
  loop('heartbeat', s.heart ? (0.55 + 0.35 * s.heart) * on : 0, 1 + 0.25 * s.heart);
}
let other = null;
function otherEngine(gain, rate = 1, pan = 0) {
  if (gain <= 0.003) { if (other) { other.g.gain.setTargetAtTime(0, ctx.currentTime, 0.08); other.s.stop(ctx.currentTime + 0.5); other = null; } return; }
  if (!buffers.engine) return;
  if (!other) {
    const s = ctx.createBufferSource(), g = ctx.createGain(), p = ctx.createStereoPanner ? ctx.createStereoPanner() : null;
    s.buffer = buffers.engine; s.loop = true; g.gain.value = 0;
    s.connect(g); (p ? g.connect(p) : g).connect(master);
    s.start(0, Math.random() * buffers.engine.duration);
    other = { s, g, p };
  }
  other.g.gain.setTargetAtTime(gain, ctx.currentTime, 0.06);
  other.s.playbackRate.setTargetAtTime(rate, ctx.currentTime, 0.06);
  if (other.p) other.p.pan.setTargetAtTime(pan, ctx.currentTime, 0.06);
}

// testing only: what state the audio is in
export const soundState = () => ({ made: !!ctx, state: ctx?.state || 'none', wanted, muted, hidden: document.hidden,
  loaded: Object.keys(buffers).length, loops: Object.keys(loops).concat(other ? ['engine (other)'] : []) });
