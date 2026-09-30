// Weather (Stage 2A, brief section 3 "Weather setting"). Weather is gameplay: it sets how far the hunter can see the
// hider. Chosen by Chetan 2026-09-29 ("clear spread"): the share of the yard a hunter sees, measured on our map against
// overcast, is in brackets.
//   Sunny 30 m (122%), Overcast 25 m (100%, the Stage 1 view), Dusk 22 m (86%), Rain 20 m (77%), Fog 16 m (58%).
// The referee picks one at random for every round (fully random, repeats allowed; Chetan's choice), both phones use it.
// The hider fades from `fade` to `view` metres on the hunter's screen; the smog is total at `smog.far`, so walls stay
// visible a little further than the hider in every weather (as in Stage 1).
// No three.js in here: the rules (rules.js) and the tests use it too.

export const WEATHERS = {
  sunny: {
    label: 'Sunny', view: 30, fade: 21,
    smog: { color: 0xc6cfd3, top: 0x4c88c6, near: 0, far: 42, max: 0.95 },
    sunDisc: 1, sunDir: [-0.55, 0.2, 0.72], lightDir: [-0.5, 0.95, 0.65],
    sky: { col: 0xbcd4ea, ground: 0x5a5448, i: 1.55 }, sun: { col: 0xfff0d8, i: 2.3, soft: 1.5 },
    lamps: 0.12, floor: 0x9aa39e, wet: 0, dust: 1, rain: 0,
  },
  overcast: {
    label: 'Overcast', view: 25, fade: 18,
    smog: { color: 0xa9b1b4, top: 0xbfc6ca, near: 0, far: 34, max: 1 },
    sunDisc: 0, sunDir: [-0.55, 0.2, 0.72], lightDir: [-0.5, 0.95, 0.65],
    sky: { col: 0xdde2e5, ground: 0x7a766c, i: 1.95 }, sun: { col: 0xe6e9eb, i: 0.45, soft: 6 },
    lamps: 0.45, floor: 0x9aa39e, wet: 0, dust: 0.8, rain: 0,
  },
  dusk: {
    label: 'Dusk', view: 22, fade: 16,
    smog: { color: 0x6f6873, top: 0x28314d, near: 0, far: 30, max: 1 },
    sunDisc: 0.7, sunDir: [-0.85, 0.06, 0.52], lightDir: [-0.8, 0.32, 0.5], sunTint: [1.0, 0.55, 0.3],
    sky: { col: 0x9a9cc0, ground: 0x544844, i: 1.7 }, sun: { col: 0xff9a5c, i: 1.1, soft: 3 },
    lamps: 1, floor: 0x959c98, wet: 0, dust: 0.7, rain: 0,
  },
  rain: {
    label: 'Rain', view: 20, fade: 14,
    smog: { color: 0x7f898d, top: 0x939ca0, near: 0, far: 28, max: 1 },
    sunDisc: 0, sunDir: [-0.55, 0.2, 0.72], lightDir: [-0.5, 0.95, 0.65],
    sky: { col: 0xb0b9be, ground: 0x4a4a46, i: 1.7 }, sun: { col: 0xd6dde0, i: 0.3, soft: 6 },
    lamps: 0.75, floor: 0x7e8784, wet: 1, dust: 0.15, rain: 1,
  },
  fog: {
    label: 'Fog', view: 16, fade: 11,
    smog: { color: 0xc2c7c8, top: 0xd3d7d8, near: 0, far: 22, max: 1 },
    sunDisc: 0, sunDir: [-0.55, 0.2, 0.72], lightDir: [-0.5, 0.95, 0.65],
    sky: { col: 0xe6eaeb, ground: 0x8a877f, i: 2.0 }, sun: { col: 0xe8ebec, i: 0.25, soft: 8 },
    lamps: 0.65, floor: 0x9aa39e, wet: 0.35, dust: 0.5, rain: 0,
  },
};
export const WEATHER_NAMES = Object.keys(WEATHERS);
export const DEFAULT_WEATHER = 'overcast';
export const randomWeather = () => WEATHER_NAMES[Math.floor(Math.random() * WEATHER_NAMES.length)];
// "Fog, view 16 m." for the cards
export const weatherLine = name => { const w = WEATHERS[name] || WEATHERS[DEFAULT_WEATHER]; return `${w.label}. The hunter sees ${w.view} m.`; };
