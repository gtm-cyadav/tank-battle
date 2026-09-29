// Everything about the phone screen itself (brief section 3, "Full screen"):
// start screen with the right full-screen hint per device (its buttons live in lobby.js), turn-your-phone-sideways message,
// "Leave the game?" prompt on back-swipe, and blocking browser zoom / pull-to-refresh / long-press menus.
const $ = id => document.getElementById(id);
const root = document.documentElement;

// ---- which device are we on? ----------------------------------------------------------------------------------
const ua = navigator.userAgent;
const isIPad = /iPad/.test(ua) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);   // iPadOS says "Mac"
const isIPhone = /iPhone|iPod/.test(ua);
const isAndroid = /Android/.test(ua);
export const device = {
  // a phone or tablet (not a touchscreen laptop): gets the on-screen controls and the rotate message. ?touch forces it for testing.
  touch: isIPad || isIPhone || isAndroid || matchMedia('(pointer: coarse)').matches || new URLSearchParams(location.search).has('touch'),
  ios: isIPad || isIPhone,
  iphone: isIPhone,
  ipad: isIPad,
  android: isAndroid,
  // opened from the home-screen icon: already full screen, nothing to do
  homeScreen: navigator.standalone === true || matchMedia('(display-mode: standalone), (display-mode: fullscreen)').matches,
  canFullscreen: !!(document.fullscreenEnabled || document.webkitFullscreenEnabled),
};
const isFullscreen = () => !!(document.fullscreenElement || document.webkitFullscreenElement);

export async function enterFullscreen() {
  try {
    if (root.requestFullscreen) await root.requestFullscreen({ navigationUI: 'hide' });
    else if (root.webkitRequestFullscreen) root.webkitRequestFullscreen();
  } catch (e) { /* refused, e.g. not from a tap: play on in the window */ }
  try { await screen.orientation?.lock?.('landscape'); } catch (e) { /* only Android supports this; iOS relies on the rotate message */ }
}

// ---- stop the browser treating game touches as page gestures -------------------------------------------------
function blockBrowserGestures() {
  const stop = e => e.preventDefault();
  // pull-to-refresh and page scrolling (CSS overscroll-behavior covers most browsers; this covers older iOS)
  document.addEventListener('touchmove', e => { if (!e.target.closest('.scrolls, input')) e.preventDefault(); }, { passive: false });
  for (const t of ['gesturestart', 'gesturechange', 'gestureend']) document.addEventListener(t, stop);   // iOS pinch zoom
  document.addEventListener('dblclick', stop);        // double-tap zoom
  document.addEventListener('contextmenu', stop);     // long-press menu / "save image"
  document.addEventListener('selectstart', stop);
  // iOS still zooms on a quick second tap unless the first tap's end is cancelled; skip real buttons so they still click
  let lastEnd = 0;
  document.addEventListener('touchend', e => {
    const now = e.timeStamp;
    if (now - lastEnd < 350 && !e.target.closest('button, input, label')) e.preventDefault();
    lastEnd = now;
  }, { passive: false });
}

// ---- screens ----------------------------------------------------------------------------------------------------
let state = 'start';   // 'start' | 'playing'
let onChange = () => {};
const blocked = () => state !== 'playing' || !$('rotate').hidden || !$('leave').hidden || !$('settings').hidden || !$('link').hidden || !$('round').hidden;
const notify = () => {
  root.dataset.state = state;
  $('fs-again').hidden = !(state === 'playing' && device.canFullscreen && !device.homeScreen && !isFullscreen());
  onChange(!blocked());
};

// Phones and tablets that can go full screen do so when Create game, Join or Drive alone is tapped.
export function showStart() {
  // pick the start-screen hint for this device
  const fsButton = device.canFullscreen && !device.homeScreen;
  $('hint-iphone').hidden = !(device.iphone && !device.homeScreen);
  $('hint-ipad').hidden = !(device.ipad && !device.homeScreen && fsButton);
  $('hint-keys').hidden = device.touch;
  $('start').hidden = false;
  state = 'start';
  notify();
}

export function startPlaying(fullscreen) {
  if (fullscreen) enterFullscreen();
  $('start').hidden = true;
  state = 'playing';
  history.pushState({ tb: 'game' }, '');   // a spare history step, so a back-swipe lands on our prompt instead of leaving
  notify();
}

// Portrait on a phone or tablet: cover everything with the rotate message (iOS can't lock orientation).
function checkOrientation() {
  const portrait = device.touch && innerHeight > innerWidth;
  if (portrait === !$('rotate').hidden) return;
  $('rotate').hidden = !portrait;
  notify();
}

// Back-swipe / back button while playing: ask first.
addEventListener('popstate', () => {
  if (state !== 'playing') return;
  history.pushState({ tb: 'game' }, '');   // re-arm straight away, so a second swipe can't slip past the prompt
  $('leave').hidden = false;
  notify();
});
// Refresh or closing the tab while playing: the browser shows its own "Leave site?" box (not on iPhone).
addEventListener('beforeunload', e => { if (state === 'playing') { e.preventDefault(); e.returnValue = ''; } });

// Back to the start screen from a match, dropping the spare history step the match added.
export function leaveToStart() {
  if (state === 'playing') history.back();
  showStart();
}

// onLeave: the player chose Leave on the "Leave the game?" prompt.
export function initScreen(changed, onLeave) {
  onChange = changed;
  root.classList.toggle('touch', device.touch);
  // touchscreen laptop: show the on-screen controls from the first real touch
  addEventListener('pointerdown', e => { if (e.pointerType === 'touch') root.classList.add('touch'); }, { capture: true });
  blockBrowserGestures();

  $('fs-again').addEventListener('click', enterFullscreen);
  $('stay').addEventListener('click', () => { $('leave').hidden = true; notify(); });
  $('go').addEventListener('click', () => {
    $('leave').hidden = true;
    onLeave();   // drops the spare step we re-armed (so a further back-swipe leaves the page) and shows the start screen
  });
  for (const t of ['fullscreenchange', 'webkitfullscreenchange']) document.addEventListener(t, notify);

  addEventListener('resize', checkOrientation);
  screen.orientation?.addEventListener?.('change', checkOrientation);
  checkOrientation();
}

export const isPlaying = () => state === 'playing';
export const refreshScreen = () => notify();   // e.g. after the settings panel opens or closes
