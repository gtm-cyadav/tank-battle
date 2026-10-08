// Corner map: the whole yard, top-left, the same way up for both players.
// It shows the walls and your own tank only, never the other player; during a ping it also shows the ping circle.
// Top-left, about 150 x 100 px on an 812-wide phone. Can be switched off in Settings.
import { ROWS, COLS, WIDTH, DEPTH, isWallCell } from './world.js';

const COLORS = { hunter: '#ff7a1a', hider: '#2f7bff' };

export function createCornerMap(canvas) {
  const g = canvas.getContext('2d');
  const walls = document.createElement('canvas');
  let w = 0, h = 0, k = 1;

  // (re)draw the walls once per size: floor dark, walls light, like the arena seen from above
  function fit() {
    if (w) return;
    const r = canvas.getBoundingClientRect();
    k = Math.min(3, devicePixelRatio || 1);
    const nw = Math.round(r.width * k), nh = Math.round(r.height * k);
    if (!nw || !nh) return;   // not on screen yet
    w = canvas.width = walls.width = nw; h = canvas.height = walls.height = nh;
    const wg = walls.getContext('2d'), cw = w / COLS, ch = h / ROWS;
    wg.fillStyle = 'rgba(22, 27, 25, 0.9)'; wg.fillRect(0, 0, w, h);
    wg.fillStyle = '#9aa39e';
    for (let r = 0; r < ROWS; r++) for (let c = 0; c < COLS; c++) {
      // whole pixels, so neighbouring wall squares join without hairline gaps
      if (isWallCell(r, c)) wg.fillRect(Math.floor(c * cw), Math.floor(r * ch), Math.ceil((c + 1) * cw) - Math.floor(c * cw), Math.ceil((r + 1) * ch) - Math.floor(r * ch));
    }
  }
  const mx = x => (x / WIDTH + 0.5) * w, mz = z => (z / DEPTH + 0.5) * h;

  // me: { x, z, yaw, role }; ping: { x, z, r } (m) or null; beat: 0..1 for the ping's pulse
  function draw(me, ping, beat = 0) {
    fit();
    if (!w) return;
    g.drawImage(walls, 0, 0);
    if (ping) {
      const pr = ping.r / WIDTH * w;
      g.beginPath(); g.arc(mx(ping.x), mz(ping.z), pr, 0, Math.PI * 2);
      g.fillStyle = `rgba(143, 184, 255, ${0.22 + 0.12 * beat})`; g.fill();
      g.lineWidth = 1.5 * k; g.strokeStyle = '#b9d2ff'; g.stroke();
    }
    // your tank: a small arrow pointing the way it faces (forward is +z at yaw 0, so down the map)
    const x = mx(me.x), y = mz(me.z), fx = Math.sin(me.yaw), fy = Math.cos(me.yaw), s = 5.5 * k;
    g.beginPath();
    g.moveTo(x + fx * s * 1.3, y + fy * s * 1.3);
    g.lineTo(x - fx * s * 0.8 + fy * s * 0.85, y - fy * s * 0.8 - fx * s * 0.85);
    g.lineTo(x - fx * s * 0.35, y - fy * s * 0.35);
    g.lineTo(x - fx * s * 0.8 - fy * s * 0.85, y - fy * s * 0.8 + fx * s * 0.85);
    g.closePath();
    g.fillStyle = COLORS[me.role]; g.fill();
    g.lineWidth = 1.2 * k; g.strokeStyle = '#f2f5f3'; g.stroke();
  }
  return { draw, refit() { w = h = 0; } };   // refit: after the screen size changed
}
