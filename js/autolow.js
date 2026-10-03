// Auto-Low graphics. If the game runs under 24 frames a second for 5 s in a row while you play, it switches to Low
// once, with a small notice and an Undo (main.js). It never switches twice on the same phone (Settings remembers it), so it cannot flap.
// This part only counts: feed it each frame's real time and whether that frame counts (playing, in view, graphics High). One frame longer than
// half a second (a switch of app, a new weather being drawn) starts the count again, so only a steady low frame rate trips it.
export const AUTO_LOW = { fps: 24, secs: 5 };

export function createAutoLow({ fps = AUTO_LOW.fps, secs = AUTO_LOW.secs } = {}) {
  let span = 0, frames = 0, low = 0;
  const reset = () => { span = 0; frames = 0; low = 0; };
  return {
    // dt: seconds since the last frame; ok: this frame counts. True when the frame rate has stayed low for `secs` whole seconds.
    feed(dt, ok) {
      if (!ok || !(dt > 0) || dt > 0.5) { reset(); return false; }
      span += dt; frames++;
      if (span >= 1) { low = frames / span < fps ? low + 1 : 0; span = 0; frames = 0; }
      return low >= secs;
    },
    reset,
    get lowSeconds() { return low; },
  };
}
