// Stage 3A: the flag (or, for eras with no flag, the banner or symbol) of each of the 36 leaders, drawn in code on a
// canvas. No pictures are downloaded. The same drawing is used on the picker's cards and as the cloth on the tank's
// mast (tank.js / models.js). Every flag is drawn in a 60 x 40 box (3:2); a flag can leave a corner clear
// (draw with alpha) and it stays see-through there (the Maratha pennant).
// Content lines (brief section 4): no swastika or hate symbol, no eagle, no protected emblem (no red cross or red
// crescent), and no sacred script (the Iraqi flag is drawn without its lettering rather than drawn wrongly).

const TAU = Math.PI * 2;

// ---- tiny drawing helpers (the box is 60 x 40) -----------------------------------------------------------------
const rect = (g, c, x, y, w, h) => { g.fillStyle = c; g.fillRect(x, y, w, h); };
const disc = (g, c, x, y, r) => { g.fillStyle = c; g.beginPath(); g.arc(x, y, r, 0, TAU); g.fill(); };
const ring = (g, c, x, y, r, w) => { g.strokeStyle = c; g.lineWidth = w; g.beginPath(); g.arc(x, y, r, 0, TAU); g.stroke(); };
const line = (g, c, w, ...p) => { g.strokeStyle = c; g.lineWidth = w; g.lineCap = 'round'; g.lineJoin = 'round'; g.beginPath(); g.moveTo(p[0], p[1]); for (let i = 2; i < p.length; i += 2) g.lineTo(p[i], p[i + 1]); g.stroke(); };
const poly = (g, c, ...p) => { g.fillStyle = c; g.beginPath(); g.moveTo(p[0], p[1]); for (let i = 2; i < p.length; i += 2) g.lineTo(p[i], p[i + 1]); g.closePath(); g.fill(); };
// a star with `n` points, outer radius r, inner radius r * k, one point at angle `a` (0 = pointing up)
function star(g, c, x, y, r, n = 5, k = 0.382, a = 0) {
  g.fillStyle = c; g.beginPath();
  for (let i = 0; i < n * 2; i++) {
    const rr = i % 2 ? r * k : r, t = a + (i * Math.PI) / n;
    g[i ? 'lineTo' : 'moveTo'](x + Math.sin(t) * rr, y - Math.cos(t) * rr);
  }
  g.closePath(); g.fill();
}
const hbands = (g, ...cols) => cols.forEach((c, i) => rect(g, c, 0, (40 / cols.length) * i - 0.01, 60, 40 / cols.length + 0.02));
const vbands = (g, ...cols) => cols.forEach((c, i) => rect(g, c, (60 / cols.length) * i - 0.01, 0, 60 / cols.length + 0.02, 40));
function spokes(g, c, x, y, r0, r1, n, w) { g.strokeStyle = c; g.lineWidth = w; g.lineCap = 'butt'; g.beginPath(); for (let i = 0; i < n; i++) { const t = (i / n) * TAU; g.moveTo(x + Math.cos(t) * r0, y + Math.sin(t) * r0); g.lineTo(x + Math.cos(t) * r1, y + Math.sin(t) * r1); } g.stroke(); }
const path = (g, c, d, x = 0, y = 0, s = 1) => { g.save(); g.translate(x, y); g.scale(s, s); g.fillStyle = c; g.fill(new Path2D(d)); g.restore(); };
const FLEUR = 'M0,-9 C3.2,-5.5 3.2,-1.5 0,3 C-3.2,-1.5 -3.2,-5.5 0,-9Z M-1,1.5 C-6,-6 -11.5,-3 -9.5,2.5 C-8.3,5.7 -4,6 -2,4.2Z M1,1.5 C6,-6 11.5,-3 9.5,2.5 C8.3,5.7 4,6 2,4.2Z M-5.2,4.6 h10.4 v1.9 h-10.4Z M-2.2,7 L0,11 L2.2,7Z';

// ---- the 36 ----------------------------------------------------------------------------------------------------
// what: 'flag' (a real national flag), 'symbol' (a banner or emblem for an era with no flag), 'invented' (a made-up state)
// note: what the picture is, in plain words (for the approval sheet)
const UJ_CLIP = 'M30,15 h30 v15 z v15 h-30 z h-30 v-15 z v-15 h30 z';
function unionJack(g) {
  g.save(); g.scale(1, 40 / 30);
  rect(g, '#00247d', 0, 0, 60, 30);
  line(g, '#ffffff', 6, 0, 0, 60, 30); line(g, '#ffffff', 6, 60, 0, 0, 30);
  g.save(); g.clip(new Path2D(UJ_CLIP)); line(g, '#cf142b', 4, 0, 0, 60, 30); line(g, '#cf142b', 4, 60, 0, 0, 30); g.restore();
  line(g, '#ffffff', 10, 30, 0, 30, 30); line(g, '#ffffff', 10, 0, 15, 60, 15);
  line(g, '#cf142b', 6, 30, 0, 30, 30); line(g, '#cf142b', 6, 0, 15, 60, 15);
  g.restore();
}
function usa(g) {
  for (let i = 0; i < 13; i++) rect(g, i % 2 ? '#ffffff' : '#b22234', 0, (40 / 13) * i - 0.01, 60, 40 / 13 + 0.02);
  const w = 24, h = (40 / 13) * 7;
  rect(g, '#3c3b6e', 0, 0, w, h);
  for (let r = 0; r < 9; r++) { const n = r % 2 ? 5 : 6; for (let i = 0; i < n; i++) star(g, '#ffffff', (r % 2 ? 2 * i + 2 : 2 * i + 1) * (w / 12), (r + 1) * (h / 10), 1.15); }
}
function ussr(g) {
  rect(g, '#cc0000', 0, 0, 60, 40);
  star(g, '#ffd700', 12, 8, 3.6);
  g.save(); g.translate(12, 22.5);
  const gold = '#ffd700';
  // hammer: a handle from lower left to upper right, a block across its top end
  line(g, gold, 1.7, -6.5, 8, 5.5, -7);
  g.save(); g.translate(5.5, -7); g.rotate(-0.62 + Math.PI / 2 * 0); g.fillStyle = gold; g.fillRect(-4.2, -1.5, 8.4, 3); g.restore();
  // sickle: a thick crescent, its handle at the lower right
  g.fillStyle = gold; g.beginPath(); g.arc(0, 1, 8.6, Math.PI * 0.95, Math.PI * 2.1); g.arc(1.3, 1.9, 6.9, Math.PI * 2.1, Math.PI * 0.95, true); g.closePath(); g.fill();
  line(g, gold, 1.9, 4.8, 8.2, 7.2, 12.4);
  g.restore();
}
function italyKingdom(g) {
  vbands(g, '#008c45', '#f4f5f0', '#cd212a');
  const x = 30, y = 20;
  g.fillStyle = '#f4f5f0'; g.beginPath(); g.moveTo(x - 7, y - 8); g.lineTo(x + 7, y - 8); g.lineTo(x + 7, y + 3); g.quadraticCurveTo(x + 7, y + 10, x, y + 12); g.quadraticCurveTo(x - 7, y + 10, x - 7, y + 3); g.closePath(); g.fill();
  g.save(); g.beginPath(); g.moveTo(x - 6, y - 7); g.lineTo(x + 6, y - 7); g.lineTo(x + 6, y + 3); g.quadraticCurveTo(x + 6, y + 9, x, y + 11); g.quadraticCurveTo(x - 6, y + 9, x - 6, y + 3); g.closePath(); g.clip();
  rect(g, '#cd212a', x - 7, y - 8, 14, 21); rect(g, '#f4f5f0', x - 1.2, y - 8, 2.4, 21); rect(g, '#f4f5f0', x - 7, y - 2.2, 14, 2.4); g.restore();
  poly(g, '#e0a800', x - 4.5, y - 9, x - 4.5, y - 13, x - 2.2, y - 11, x, y - 14, x + 2.2, y - 11, x + 4.5, y - 13, x + 4.5, y - 9);   // crown
}
function iraq2003(g) {
  hbands(g, '#ce1126', '#ffffff', '#000000');
  for (let i = -1; i <= 1; i++) star(g, '#007a3d', 30 + i * 9, 20, 3.1);
}
function northKorea(g) {
  const u = 40 / 24;
  rect(g, '#024fa2', 0, 0, 60, 40);
  rect(g, '#ffffff', 0, 4 * u, 60, 16 * u); rect(g, '#ed1c27', 0, 5 * u, 60, 14 * u);
  disc(g, '#ffffff', 21, 20, 8.6); star(g, '#ed1c27', 20.5, 20.4, 7.6);
}
function vergina(g) {
  rect(g, '#b4121b', 0, 0, 60, 40);
  g.fillStyle = '#e8b923';
  for (let i = 0; i < 16; i++) {
    const a = (i / 16) * TAU, r = i % 2 ? 11 : 15.5, w = 0.2;
    g.beginPath(); g.moveTo(30 + Math.cos(a - w) * 4.5, 20 + Math.sin(a - w) * 4.5); g.lineTo(30 + Math.cos(a) * r, 20 + Math.sin(a) * r); g.lineTo(30 + Math.cos(a + w) * 4.5, 20 + Math.sin(a + w) * 4.5); g.closePath(); g.fill();
  }
  disc(g, '#e8b923', 30, 20, 5.2); ring(g, '#b4121b', 30, 20, 2.6, 1.1);
}
function spqr(g) {
  rect(g, '#a4161a', 0, 0, 60, 40);
  g.strokeStyle = '#e2b53d'; g.lineWidth = 1.2; g.strokeRect(2.6, 2.6, 54.8, 34.8);
  g.fillStyle = '#e8c04a'; g.font = '700 15px Georgia, "Times New Roman", serif'; g.textAlign = 'center'; g.textBaseline = 'middle';
  g.fillText('SPQR', 30, 21.5);
}
function megacorp(g) {
  rect(g, '#10151f', 0, 0, 60, 40);
  ring(g, '#f2f4f6', 30, 20, 14, 1.8);
  poly(g, '#f2f4f6', 30, 8.5, 33.8, 15.5, 33.8, 26, 26.2, 26, 26.2, 15.5);      // rocket body
  poly(g, '#f2f4f6', 26.2, 20.5, 22.4, 28, 26.2, 26);                           // fins
  poly(g, '#f2f4f6', 33.8, 20.5, 37.6, 28, 33.8, 26);
  disc(g, '#10151f', 30, 17, 1.7);
  poly(g, '#8b97a6', 28, 27, 32, 27, 30, 32.5);
}
function neoAntarctica(g) {
  rect(g, '#7cc0e6', 0, 0, 60, 40);
  poly(g, '#f6fafc', 0, 32, 60, 28, 60, 40, 0, 40);
  poly(g, '#d9ecf6', 0, 32, 10, 24, 18, 31, 24, 27, 30, 32);
  // a penguin
  g.fillStyle = '#141a22'; g.beginPath(); g.ellipse(30, 22, 7, 10.5, 0, 0, TAU); g.fill();
  disc(g, '#141a22', 30, 9.5, 4.4);
  g.fillStyle = '#f6fafc'; g.beginPath(); g.ellipse(30, 24, 4.2, 7.6, 0, 0, TAU); g.fill();
  poly(g, '#f0b429', 32.2, 9.4, 36, 10.6, 32.2, 11.8);
  disc(g, '#f6fafc', 28.6, 8.6, 0.9);
  poly(g, '#f0b429', 26, 33, 30, 32, 29, 34.4); poly(g, '#f0b429', 31, 32, 35, 33, 32, 34.4);
  star(g, '#f0b429', 47, 9, 3.4);
}
function aiCouncil(g) {
  rect(g, '#0b0d10', 0, 0, 60, 40);
  g.strokeStyle = '#1e242c'; g.lineWidth = 0.6; g.beginPath(); for (let i = 1; i < 12; i++) { g.moveTo(i * 5, 0); g.lineTo(i * 5, 40); } for (let i = 1; i < 8; i++) { g.moveTo(0, i * 5); g.lineTo(60, i * 5); } g.stroke();
  ring(g, '#c4161c', 30, 20, 14, 1.8); ring(g, '#c4161c', 30, 20, 9.6, 1.2);
  disc(g, '#e02a2a', 30, 20, 6.4); disc(g, '#0b0d10', 30, 20, 2.6);
  for (const [x, y] of [[8, 8], [52, 8], [8, 32], [52, 32]]) disc(g, '#c4161c', x, y, 1.1);
}
function egyptEye(g) {
  rect(g, '#1c3f94', 0, 0, 60, 40);
  const gold = '#e6b422';
  g.strokeStyle = gold; g.lineWidth = 1.9; g.lineCap = 'round'; g.lineJoin = 'round';
  g.beginPath(); g.moveTo(12, 19); g.quadraticCurveTo(30, 6, 49, 19); g.quadraticCurveTo(30, 30, 12, 19); g.closePath(); g.stroke();   // the eye
  disc(g, gold, 32, 18.6, 5); disc(g, '#1c3f94', 32, 18.6, 2.2);
  line(g, gold, 2.4, 14, 12.5, 30, 7.5, 47, 12.5);                                    // the brow
  g.beginPath(); g.moveTo(22, 25); g.lineTo(21, 31); g.bezierCurveTo(21, 36, 15, 36, 15, 32); g.stroke();     // the tail with its curl
  line(g, gold, 1.9, 36, 26, 40, 33, 46, 33);
}
function mongol(g) {
  rect(g, '#121212', 0, 0, 60, 40);
  ring(g, '#c9a227', 30, 9, 3.6, 1.4);
  for (let i = 0; i < 9; i++) { const x = 30 + (i - 4) * 5.2; g.strokeStyle = '#f0f0ec'; g.lineWidth = 1.8; g.lineCap = 'round'; g.beginPath(); g.moveTo(30 + (i - 4) * 0.9, 12); g.quadraticCurveTo(30 + (i - 4) * 3.2, 22, x, 34); g.stroke(); }
  line(g, '#c9a227', 1.2, 26.5, 12.2, 33.5, 12.2);
}
function ashokaChakra(g) {
  rect(g, '#f2e6c8', 0, 0, 60, 40);
  g.strokeStyle = '#8c3a1f'; g.lineWidth = 1.2; g.strokeRect(2.6, 2.6, 54.8, 34.8);
  chakra(g, '#1f2f7a', 30, 20, 13.5);
}
function chakra(g, c, x, y, r) {
  ring(g, c, x, y, r, r * 0.11); disc(g, c, x, y, r * 0.17);
  spokes(g, c, x, y, r * 0.17, r * 0.96, 24, r * 0.05);
  g.fillStyle = c; for (let i = 0; i < 24; i++) { const t = ((i + 0.5) / 24) * TAU; g.beginPath(); g.arc(x + Math.cos(t) * r * 0.88, y + Math.sin(t) * r * 0.88, r * 0.045, 0, TAU); g.fill(); }
}
function india(g) {
  hbands(g, '#ff9933', '#ffffff', '#138808');
  chakra(g, '#000080', 30, 20, 5.1);
}
function pakistan(g) {
  rect(g, '#01411c', 0, 0, 60, 40); rect(g, '#ffffff', 0, 0, 15, 40);
  disc(g, '#ffffff', 37.4, 20, 10.6); disc(g, '#01411c', 40.6, 18.4, 9);
  star(g, '#ffffff', 44.6, 14.6, 4.6, 5, 0.382, 0.9);
}
function china(g) {
  rect(g, '#de2910', 0, 0, 60, 40);
  star(g, '#ffde00', 10, 10, 6);
  for (const [x, y] of [[20, 4], [24, 9], [24, 16], [20, 21]]) star(g, '#ffde00', x, y, 2, 5, 0.382, Math.atan2(x - 10, 10 - y) * -1 + Math.PI);
}
function carthage(g) {
  rect(g, '#4b1f74', 0, 0, 60, 40);
  const gold = '#e2b93d';
  ring(g, gold, 30, 8.6, 3.2, 1.7);
  line(g, gold, 2.2, 18, 16.5, 42, 16.5); line(g, gold, 2, 18, 12.5, 18, 16.5); line(g, gold, 2, 42, 12.5, 42, 16.5);
  poly(g, gold, 30, 17.6, 40, 35.5, 20, 35.5);
}
function raven(g) {
  rect(g, '#9c1f1c', 0, 0, 60, 40);
  g.strokeStyle = '#e8dcc0'; g.lineWidth = 1.1; g.strokeRect(2.6, 2.6, 54.8, 34.8);
  const k = '#0d0d0d';
  path(g, k, 'M28,22 C24,15 15,9 7,10 C10,12 11,14 11,16 C14,15 16,16 17,18.5 C20,17.5 22,18.5 23,21.5 C25,20.5 26.5,22 27.5,25 Z');
  path(g, k, 'M32,22 C36,15 45,9 53,10 C50,12 49,14 49,16 C46,15 44,16 43,18.5 C40,17.5 38,18.5 37,21.5 C35,20.5 33.5,22 32.5,25 Z');
  g.fillStyle = k; g.beginPath(); g.ellipse(30, 24, 4.4, 7.6, 0, 0, TAU); g.fill();               // body
  disc(g, k, 30, 13.6, 3.3);                                                                       // head
  poly(g, k, 27.2, 13, 24, 15.4, 27.8, 15.6);                                                     // beak
  poly(g, k, 26.5, 29, 33.5, 29, 35.5, 35.5, 32, 34, 30, 36, 28, 34, 24.5, 35.5);                 // tail
  disc(g, '#e8dcc0', 29, 12.8, 0.9);
}
function odaMon(g) {
  rect(g, '#161616', 0, 0, 60, 40);
  const gold = '#d9ab2c';
  ring(g, gold, 30, 20, 13.2, 1.4);
  for (let i = 0; i < 5; i++) { const t = (i / 5) * TAU - Math.PI / 2; disc(g, gold, 30 + Math.cos(t) * 6.4, 20 + Math.sin(t) * 6.4, 4.4); }
  disc(g, '#161616', 30, 20, 2.4);
}
function prussia(g) { hbands(g, '#0d0d0d', '#ffffff'); }
function fleurs(g) {
  rect(g, '#1c3f94', 0, 0, 60, 40);
  const gold = '#e6b422';
  path(g, gold, FLEUR, 30, 11.5, 0.95); path(g, gold, FLEUR, 16, 30, 0.8); path(g, gold, FLEUR, 44, 30, 0.8);
}
function triskele(g) {
  rect(g, '#1d4a2a', 0, 0, 60, 40);
  const gold = '#e0b431';
  g.strokeStyle = gold; g.lineWidth = 2.3; g.lineCap = 'round';
  for (let k = 0; k < 3; k++) {
    g.beginPath();
    for (let i = 0; i <= 30; i++) {
      const t = i / 30, r = 2 + 10.5 * t, a = k * (TAU / 3) - Math.PI / 2 + t * Math.PI * 1.15;
      g[i ? 'lineTo' : 'moveTo'](30 + Math.cos(a) * r, 20 + Math.sin(a) * r);
    }
    g.stroke();
    const a = k * (TAU / 3) - Math.PI / 2 + Math.PI * 1.15;
    g.strokeStyle = gold; g.beginPath(); g.arc(30 + Math.cos(a) * 12.5, 20 + Math.sin(a) * 12.5, 2.2, 0, TAU); g.stroke();
  }
}
function zulu(g) {
  rect(g, '#161616', 0, 0, 60, 40);
  line(g, '#c9c2b0', 1.1, 8, 34, 51, 6);                                    // spear shaft
  poly(g, '#c9c2b0', 49, 3.5, 55, 4.5, 51.5, 9.5);                          // spearhead
  g.fillStyle = '#efe6d2'; g.beginPath(); g.ellipse(30, 21, 9.4, 15, 0, 0, TAU); g.fill();     // the shield
  g.save(); g.beginPath(); g.ellipse(30, 21, 9.4, 15, 0, 0, TAU); g.clip();
  g.fillStyle = '#6b3d21'; g.beginPath(); g.ellipse(24.5, 14, 4, 6, 0.3, 0, TAU); g.fill(); g.beginPath(); g.ellipse(35.5, 28, 4.5, 6.5, 0.2, 0, TAU); g.fill(); g.beginPath(); g.ellipse(32, 9, 3, 3, 0, 0, TAU); g.fill();
  g.restore();
  line(g, '#3a2414', 1.3, 30, 5, 30, 37); line(g, '#3a2414', 1, 27.5, 12, 27.5, 30);
}
function cuba(g) {
  for (let i = 0; i < 5; i++) rect(g, i % 2 ? '#ffffff' : '#002a8f', 0, i * 8 - 0.01, 60, 8.02);
  poly(g, '#cf142b', 0, 0, 26, 20, 0, 40); star(g, '#ffffff', 8.6, 20, 5);
}
function ayyubid(g) {
  rect(g, '#f2c21b', 0, 0, 60, 40);
  g.strokeStyle = '#b8860b'; g.lineWidth = 1.1; g.strokeRect(2.6, 2.6, 54.8, 34.8);
  star(g, '#c8940a', 30, 20, 13, 8, 0.62); disc(g, '#f2c21b', 30, 20, 3.6);
}
function hunSword(g) {
  rect(g, '#4a1010', 0, 0, 60, 40);
  const w = '#ece7dc';
  poly(g, w, 28.6, 3, 31.4, 3, 32, 26, 28, 26);            // blade
  poly(g, w, 30, 1.6, 31.4, 3, 28.6, 3);
  line(g, w, 2.2, 22, 26.5, 38, 26.5);                     // guard
  line(g, w, 2.4, 30, 27, 30, 34);                         // grip
  disc(g, w, 30, 36, 2);
  g.strokeStyle = '#b8862c'; g.lineWidth = 1; g.strokeRect(2.6, 2.6, 54.8, 34.8);
}
function maratha(g) {   // a saffron swallow-tailed pennant on a see-through cloth
  g.clearRect(0, 0, 60, 40);
  poly(g, '#ff7a00', 0, 0, 60, 0, 44, 20, 60, 40, 0, 40);
}
function mughal(g) {
  rect(g, '#0d5a34', 0, 0, 60, 40);
  const gold = '#e2b93d';
  g.fillStyle = gold;
  for (let i = 0; i < 16; i++) { const a = (i / 16) * TAU, w = 0.16; g.beginPath(); g.moveTo(30 + Math.cos(a - w) * 8.4, 20 + Math.sin(a - w) * 8.4); g.lineTo(30 + Math.cos(a) * 15.4, 20 + Math.sin(a) * 15.4); g.lineTo(30 + Math.cos(a + w) * 8.4, 20 + Math.sin(a + w) * 8.4); g.closePath(); g.fill(); }
  disc(g, gold, 30, 20, 8); ring(g, '#0d5a34', 30, 20, 5, 1);
}

export const FLAGS = [null,   // index = the leader's number in the brief's list
  { draw: g => hbands(g, '#000000', '#ffffff', '#dd0000'), what: 'flag', note: 'Black-white-red, no symbol' },                   // 1 Germany, WW2
  { draw: unionJack, what: 'flag', note: 'Union Jack' },                                                                          // 2 Britain, WW2
  { draw: ussr, what: 'flag', note: 'Red flag, gold hammer, sickle and star' },                                                   // 3 Soviet Union
  { draw: italyKingdom, what: 'flag', note: 'Kingdom of Italy: green-white-red with the royal shield (red, white cross)' },      // 4 Italy, WW2
  { draw: usa, what: 'flag', note: 'Stars and Stripes, 50 stars' },                                                               // 5 USA, Cold War
  { draw: usa, what: 'flag', note: 'Stars and Stripes, 50 stars' },                                                               // 6 USA, modern
  { draw: g => hbands(g, '#ffffff', '#0039a6', '#d52b1e'), what: 'flag', note: 'White-blue-red' },                                // 7 Russia
  { draw: g => hbands(g, '#0057b7', '#ffd700'), what: 'flag', note: 'Blue and yellow' },                                          // 8 Ukraine
  { draw: iraq2003, what: 'flag', note: 'Red-white-black, three green stars. The green lettering in the middle is left out (sacred script)' },   // 9 Iraq, 2003
  { draw: northKorea, what: 'flag', note: 'Blue-red-blue, white disc with red star' },                                            // 10 North Korea
  { draw: g => vbands(g, '#0055a4', '#ffffff', '#ef4135'), what: 'flag', note: 'Tricolour, blue-white-red' },                     // 11 France, 1800s
  { draw: spqr, what: 'symbol', note: 'Roman banner, red with gold SPQR' },                                                       // 12 Rome, ancient
  { draw: megacorp, what: 'invented', note: 'Dark flag, white ring with a rocket' },                                              // 13 Megacorp State
  { draw: neoAntarctica, what: 'invented', note: 'Ice-blue flag, a penguin and a gold star' },                                    // 14 Neo-Antarctica
  { draw: aiCouncil, what: 'invented', note: 'Black grid, one red eye' },                                                         // 15 The AI Council
  { draw: spqr, what: 'symbol', note: 'Roman banner, red with gold SPQR (same as Caesar)' },                                      // 16 Rome, ancient (Brutus)
  { draw: egyptEye, what: 'symbol', note: 'Blue banner, gold Eye of Horus' },                                                     // 17 Egypt, ancient
  { draw: mongol, what: 'symbol', note: 'Black banner, the nine white horse-tails of the Mongol standard' },                      // 18 Mongol Empire
  { draw: ashokaChakra, what: 'symbol', note: 'Cream banner, blue 24-spoke wheel from the Ashoka pillars' },                      // 19 India, ancient
  { draw: india, what: 'flag', note: 'Saffron-white-green, blue wheel' },                                                         // 20 India, modern
  { draw: pakistan, what: 'flag', note: 'Green, white stripe, white crescent and star' },                                         // 21 Pakistan
  { draw: china, what: 'flag', note: 'Red, five yellow stars' },                                                                  // 22 China
  { draw: vergina, what: 'symbol', note: 'Red banner, gold sixteen-ray sun of the Macedonian kings' },                            // 23 Macedon
  { draw: carthage, what: 'symbol', note: 'Purple banner, gold sign of Tanit (Carthage\'s goddess)' },                            // 24 Carthage
  { draw: raven, what: 'symbol', note: 'Red banner, black raven (the Viking raven banner)' },                                     // 25 Vikings
  { draw: odaMon, what: 'symbol', note: 'Black banner, gold five-petal Oda family crest' },                                       // 26 Japan, feudal
  { draw: prussia, what: 'flag', note: 'Black over white (Prussia, the Kaiser\'s kingdom)' },                                     // 27 Germany, WW1
  { draw: fleurs, what: 'symbol', note: 'Blue banner, three gold fleurs-de-lis (royal France)' },                                 // 28 France, medieval
  { draw: triskele, what: 'symbol', note: 'Green banner, gold Celtic triple spiral' },                                            // 29 Britain, ancient
  { draw: zulu, what: 'symbol', note: 'Black banner, cowhide war shield and spear' },                                             // 30 Zulu Kingdom
  { draw: unionJack, what: 'flag', note: 'Union Jack' },                                                                          // 31 Britain, Victorian
  { draw: cuba, what: 'flag', note: 'Blue-white stripes, red triangle, white star' },                                             // 32 Cuba
  { draw: ayyubid, what: 'symbol', note: 'Yellow banner (the Ayyubid colour), gold eight-point star' },                           // 33 Ayyubid Sultanate
  { draw: hunSword, what: 'symbol', note: 'Dark red banner, white sword (the legendary Sword of the War-god)' },                  // 34 Hunnic Empire
  { draw: maratha, what: 'symbol', note: 'Saffron swallow-tailed pennant' },                                                      // 35 Maratha Empire
  { draw: mughal, what: 'symbol', note: 'Green banner, gold sun' },                                                               // 36 Mughal Empire
];

// Draw leader n's flag onto a canvas (any size, drawn 3:2 to fill it).
export function drawFlag(canvas, n) {
  const f = FLAGS[n];
  const g = canvas.getContext('2d');
  g.setTransform(1, 0, 0, 1, 0, 0);
  g.clearRect(0, 0, canvas.width, canvas.height);
  if (!f) return canvas;
  g.save();
  g.scale(canvas.width / 60, canvas.height / 40);
  f.draw(g);
  g.restore();
  return canvas;
}
const cache = new Map();
// A flag as a small picture (a canvas made once and kept) for the picker's cards.
export function flagCanvas(n, w = 96, h = 64) {
  const key = `${n}/${w}`;
  if (!cache.has(key)) { const c = document.createElement('canvas'); c.width = w; c.height = h; drawFlag(c, n); cache.set(key, c); }
  return cache.get(key);
}
