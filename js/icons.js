// R4 declutter (Chetan, 2026-10-03): one icon set, drawn in code (no downloads), style B "filled" (chosen from tools/out/r4/r4_icons.png).
// Every icon is a 24 x 24 drawing in the colour of the text round it (currentColor); details inside a solid shape are cut out in --cut
// (the colour of whatever the icon sits on; dark by default). icon(name, size) returns the SVG as text for innerHTML.
// kinds: shape (solid), line (thick stroke), dot (solid), in (a stroked cut-out), inf (a solid cut-out)
const D = {
  sunny: [['circle', 'cx="12" cy="12" r="4.2"', 'shape'], ['path', 'd="M12 2.5v3M12 18.5v3M2.5 12h3M18.5 12h3M5.3 5.3l2.1 2.1M16.6 16.6l2.1 2.1M5.3 18.7l2.1-2.1M16.6 7.4l2.1-2.1"', 'line']],
  overcast: [['path', 'd="M7 18.5h10.5a4 4 0 0 0 .6-7.95A5.5 5.5 0 0 0 7.4 9.6 4.5 4.5 0 0 0 7 18.5z"', 'shape']],
  dusk: [['path', 'd="M6.5 16.5a5.5 5.5 0 0 1 11 0z"', 'shape'], ['path', 'd="M2.5 16.5h19M6 20.5h12M12 4.5v3M4.6 8.6l2 2M19.4 8.6l-2 2"', 'line']],
  rain: [['path', 'd="M7 14h10.5a3.7 3.7 0 0 0 .5-7.3A5 5 0 0 0 7.6 6 4 4 0 0 0 7 14z"', 'shape'], ['path', 'd="M8.6 16.8l-1.3 3.4M12.6 16.8l-1.3 3.4M16.6 16.8l-1.3 3.4"', 'line']],
  fog: [['path', 'd="M3 7.5h13M7 11.5h14M3 15.5h13M7 19.5h10"', 'line']],
  hunter: [['circle', 'cx="12" cy="12" r="6.8"', 'line'], ['path', 'd="M12 2v5M12 17v5M2 12h5M17 12h5"', 'line'], ['circle', 'cx="12" cy="12" r="1.5"', 'dot']],
  hider: [['path', 'd="M1.8 12C4.4 7.4 7.8 5.3 12 5.3s7.6 2.1 10.2 6.7c-2.6 4.6-6 6.7-10.2 6.7S4.4 16.6 1.8 12z"', 'shape'], ['circle', 'cx="12" cy="12" r="3.2"', 'in'], ['circle', 'cx="12" cy="12" r="1.2"', 'inf']],
  speedrun: [['circle', 'cx="12" cy="13.5" r="7.3"', 'shape'], ['path', 'd="M12 13.5V9.6M12 13.5l2.6 1.6"', 'in'], ['path', 'd="M9.5 3h5M12 3v3M18.3 6.6l1.6-1.6"', 'line']],
  cinematic: [['rect', 'x="3" y="10.5" width="18" height="10" rx="1"', 'shape'], ['path', 'd="M3.3 9.6 2.7 6.4l16.6-3 .6 3.2z"', 'shape'], ['path', 'd="M7.6 5.4l1.9 3.1M12.6 4.5l1.9 3.1"', 'in']],
  ghost: [['path', 'd="M5 21V11a7 7 0 0 1 14 0v10l-2.35-2-2.3 2-2.35-2-2.35 2-2.3-2z"', 'shape'], ['circle', 'cx="9.6" cy="11" r="1.25"', 'inf'], ['circle', 'cx="14.4" cy="11" r="1.25"', 'inf']],
  resume: [['path', 'd="M8 4.8l11 7.2-11 7.2z"', 'shape']],
  settings: [['circle', 'cx="12" cy="12" r="6.4"', 'shape'], ['path', 'd="M12 2.6v3M12 18.4v3M2.6 12h3M18.4 12h3M5.4 5.4l2 2M16.6 16.6l2 2M5.4 18.6l2-2M16.6 7.4l2-2"', 'line'], ['circle', 'cx="12" cy="12" r="2.8"', 'in']],
  surrender: [['path', 'd="M5 21.5V3"', 'line'], ['path', 'd="M5 4h12.5l-2.4 4 2.4 4H5z"', 'shape']],
  leave: [['path', 'd="M13.5 4H4.5v16h9"', 'line'], ['path', 'd="M9.5 12h11M17 8.5l3.5 3.5-3.5 3.5"', 'line']],
  home: [['path', 'd="M3.5 11.2 12 4l8.5 7.2"', 'line'], ['path', 'd="M6 10v10h12V10"', 'shape']],
  signal: [['path', 'd="M5 20v-3M9.7 20v-6M14.3 20v-9M19 20V8"', 'line']],
  ping: [['circle', 'cx="12" cy="12" r="8.5"', 'line'], ['circle', 'cx="12" cy="12" r="4.2"', 'line'], ['circle', 'cx="12" cy="12" r="1.4"', 'dot']],
  lock: [['rect', 'x="5" y="10.5" width="14" height="10" rx="1.5"', 'shape'], ['path', 'd="M8.2 10.5V8a3.8 3.8 0 0 1 7.6 0v2.5"', 'line']],
  ready: [['circle', 'cx="12" cy="12" r="9"', 'shape'], ['path', 'd="M7.6 12.4l3 3 5.8-6.3"', 'in']],
  info: [['circle', 'cx="12" cy="12" r="9"', 'shape'], ['path', 'd="M12 10.8v6"', 'in'], ['circle', 'cx="12" cy="7.6" r="1.15"', 'inf']],
  invite: [['circle', 'cx="17.5" cy="5.8" r="2.6"', 'shape'], ['circle', 'cx="6.5" cy="12" r="2.6"', 'shape'], ['circle', 'cx="17.5" cy="18.2" r="2.6"', 'shape'], ['path', 'd="M8.8 10.7l6.4-3.6M8.8 13.3l6.4 3.6"', 'line']],
  nudge: [['path', 'd="M6.5 17h11l-1.6-2.3V10a3.9 3.9 0 0 0-7.8 0v4.7z"', 'shape'], ['path', 'd="M10.3 19.6a1.9 1.9 0 0 0 3.4 0"', 'line']],
  wait: [['path', 'd="M6.5 3h11M6.5 21h11"', 'line'], ['path', 'd="M8 3.5c0 4 4 5.5 4 8.5s-4 4.5-4 8.5h8c0-4-4-5.5-4-8.5s4-4.5 4-8.5z"', 'shape']],
  again: [['path', 'd="M19.5 12.5A7.5 7.5 0 1 1 17 6.6"', 'line'], ['path', 'd="M20.6 3.2v6.2h-6.2z"', 'shape']],
  hit: [['path', 'd="M12 2l2.1 5.6 5.9-1.6-3.4 5 4.9 3.5-6 .6.5 6-4-4.5-4 4.5.5-6-6-.6 4.9-3.5-3.4-5 5.9 1.6z"', 'shape']],
  sound: [['path', 'd="M3.5 9h4l5-4.5v15l-5-4.5h-4z"', 'shape'], ['path', 'd="M16 8.6a5 5 0 0 1 0 6.8M18.6 6a8.6 8.6 0 0 1 0 12"', 'line']],
  graphics: [['rect', 'x="2.5" y="4.5" width="19" height="15" rx="1.5"', 'shape'], ['path', 'd="M5 17l4.6-5.2 3 3.2 2-2.1L18.5 17z"', 'inf'], ['circle', 'cx="15.8" cy="8.6" r="1.6"', 'inf']],
  map: [['path', 'd="M2.5 6l6.3-2.5 6.4 2.5 6.3-2.5V18l-6.3 2.5-6.4-2.5L2.5 20.5z"', 'shape'], ['path', 'd="M8.8 3.8v14M15.2 6.2v14"', 'in']],
  assist: [['path', 'd="M5.5 3h4.5v8.5a2 2 0 0 0 4 0V3h4.5v8.5a6.5 6.5 0 0 1-13 0z"', 'shape'], ['path', 'd="M5.5 7.5h4.5M14 7.5h4.5"', 'in']],
  chatter: [['path', 'd="M4 4.5h16A1.5 1.5 0 0 1 21.5 6v9.5A1.5 1.5 0 0 1 20 17h-9l-5 4v-4H4a1.5 1.5 0 0 1-1.5-1.5V6A1.5 1.5 0 0 1 4 4.5z"', 'shape'], ['circle', 'cx="8" cy="10.8" r="1.3"', 'inf'], ['circle', 'cx="12" cy="10.8" r="1.3"', 'inf'], ['circle', 'cx="16" cy="10.8" r="1.3"', 'inf']],
  drive: [['circle', 'cx="12" cy="12" r="8.6"', 'line'], ['path', 'd="M3.6 11h5.6M14.8 11h5.6M12 14.2v6.2"', 'line'], ['circle', 'cx="12" cy="11.6" r="2.8"', 'dot']],
  camera: [['path', 'd="M2.5 8h4.2l1.8-2.6h7l1.8 2.6h4.2v11.5h-19z"', 'shape'], ['circle', 'cx="12" cy="13.4" r="3.6"', 'in']],
  button: [['circle', 'cx="12" cy="12" r="9"', 'line'], ['circle', 'cx="12" cy="12" r="5.2"', 'dot']],
  room: [['path', 'd="M3 12.5V3.5h9l9.5 9.5-9 9z"', 'shape'], ['circle', 'cx="7.6" cy="8" r="1.7"', 'inf']],
  clock: [['circle', 'cx="12" cy="12" r="9"', 'shape'], ['path', 'd="M12 6.8V12l3.4 2.2"', 'in']],
  sliders: [['path', 'd="M6 3v18M18 3v18"', 'line'], ['rect', 'x="3" y="12" width="6" height="5" rx="1.5"', 'shape'], ['rect', 'x="15" y="6" width="6" height="5" rx="1.5"', 'shape']],
  ring: [['circle', 'cx="12" cy="12" r="9"', 'line'], ['circle', 'cx="12" cy="9" r="3.6"', 'dot']],
  turn: [['path', 'd="M5 12a7 7 0 1 1 2.1 5"', 'line'], ['path', 'd="M2.8 13.4 5 18.6l4.6-3.2z"', 'shape']],
  height: [['path', 'd="M12 4v16"', 'line'], ['path', 'd="M7 8.5 12 3l5 5.5zM7 15.5l5 5.5 5-5.5z"', 'shape']],
  width: [['path', 'd="M4 12h16"', 'line'], ['path', 'd="M8.5 7 3 12l5.5 5zM15.5 7l5.5 5-5.5 5z"', 'shape']],
  size: [['rect', 'x="3" y="3" width="18" height="18" rx="2"', 'line'], ['rect', 'x="8" y="8" width="8" height="8" rx="1"', 'shape']],
  side: [['rect', 'x="2.5" y="5" width="19" height="14" rx="2"', 'line'], ['rect', 'x="5" y="7.5" width="5" height="9" rx="1"', 'shape']],
};
const STYLE = {
  shape: 'fill="currentColor" stroke="currentColor" stroke-width="1.2" stroke-linejoin="round"',
  line: 'fill="none" stroke="currentColor" stroke-width="2.6"',
  dot: 'fill="currentColor"',
  in: 'fill="none" style="stroke:var(--cut,#1a201e)" stroke-width="2"',
  inf: 'style="fill:var(--cut,#1a201e)"',
};
const cache = new Map();
export const ICON_NAMES = Object.keys(D);
// the SVG text for an icon; size in CSS px (the box is square)
export function icon(name, size = 20) {
  const key = name + '/' + size;
  if (cache.has(key)) return cache.get(key);
  const parts = D[name];
  if (!parts) return '';
  const svg = `<svg class="ic" width="${size}" height="${size}" viewBox="0 0 24 24" aria-hidden="true" focusable="false">${parts.map(([t, a, k]) => `<${t} ${a} ${STYLE[k]}/>`).join('')}</svg>`;
  cache.set(key, svg);
  return svg;
}
// the weather's icon name (the five weathers have one each, named the same)
export const weatherIcon = name => (name in D ? name : 'overcast');
// Every element with data-ic="name" (data-s = size, default 18) gets that icon put in front of its own text, once.
export function fillIcons(root = document) {
  for (const el of root.querySelectorAll('[data-ic]')) {
    if (el.dataset.icDone) continue;
    el.dataset.icDone = '1';
    el.insertAdjacentHTML('afterbegin', icon(el.dataset.ic, +el.dataset.s || 18));
  }
}
