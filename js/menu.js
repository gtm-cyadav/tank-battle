// In-game menu (1f, Chetan 2026-09-30): a round three-line button in the top-right corner (the gear sits one place in).
//   Two players: Resume, Settings, Surrender (asks first), Leave match (asks first).
//   Drive alone: Resume, Settings, Quit to menu (no question).
// While it's open only this player's controls stop (the tank rolls to a stop, stick and button are ignored). The round
// clock, the other player, shots, pings, weather and sound all carry on (Chetan: the clock does not stop), so opening
// it never gives either player an edge. A new card (coin toss, round result, match over), the waiting card or leaving
// the game closes it. Esc opens and closes it on a computer. It is never saved, so a refresh comes back with it closed.
import { isPlaying, refreshScreen } from './screen.js';
import { openSettings } from './settings.js';

const $ = id => document.getElementById(id);
const root = document.documentElement;
// hooks from main.js: solo() (driving alone), canGiveUp() (a match to give up), over() (match-over card), giveUp(), leave()
let game = null;
let asking = null;   // null (the menu itself) | 'surrender' | 'leave': the "are you sure" question showing

const ASK = {
  surrender: ['Give up the whole match?', 'The other player wins.', 'Surrender'],
  leave: ['Leave the match?', 'The other player will be told.', 'Leave'],
};

export const menuOpen = () => !$('menu').hidden;
const blur = () => document.activeElement?.blur?.();   // so Space (FIRE) can't press a menu button left in focus

function render() {
  const solo = game.solo();
  $('menu-main').hidden = !!asking;
  $('menu-ask').hidden = !asking;
  if (asking) {
    const [t, p, yes] = ASK[asking];
    $('ask-t').textContent = t; $('ask-p').textContent = p; $('ask-yes').textContent = yes;
    return;
  }
  $('menu-p').textContent = solo ? 'Your tank waits until you resume.' : game.over() ? 'The match is over.' : 'The clock keeps running. Your tank waits until you resume.';
  $('menu-surrender').hidden = solo || !game.canGiveUp();
  $('menu-leave').hidden = solo;
  $('menu-quit').hidden = !solo;
}

function open() {
  if (menuOpen() || !isPlaying() || !$('rotate').hidden || !$('leave').hidden || !$('settings').hidden || !$('link').hidden) return;
  asking = null;
  render();
  $('menu').hidden = false;
  root.toggleAttribute('data-menu', true);
  blur();
  refreshScreen();   // this player's controls stop while it shows
}
export function closeMenu() {
  if (!menuOpen()) return;
  asking = null;
  $('menu').hidden = true;
  root.toggleAttribute('data-menu', false);
  blur();
  refreshScreen();
}
function ask(what) { asking = what; render(); blur(); }

// Every frame (main.js): shut it if the game ended under it or the waiting card came up; keep Surrender up to date.
export function menuFrame() {
  if (!menuOpen()) return;
  if (!isPlaying() || !$('link').hidden) { closeMenu(); return; }
  if (!asking) {
    const hide = game.solo() || !game.canGiveUp();
    if ($('menu-surrender').hidden !== hide) render();
  } else if (asking === 'surrender' && !game.canGiveUp()) { asking = null; render(); }
}

export function initMenu(hooks) {
  game = hooks;
  $('menu-btn').addEventListener('click', () => { if (menuOpen()) closeMenu(); else open(); });
  $('menu').addEventListener('click', e => { if (e.target === $('menu')) closeMenu(); });   // a tap beside the card = Resume
  $('menu-resume').addEventListener('click', closeMenu);
  $('menu-settings').addEventListener('click', () => { closeMenu(); openSettings(); });   // Done goes straight back to the game
  $('menu-surrender').addEventListener('click', () => ask('surrender'));
  $('menu-leave').addEventListener('click', () => ask('leave'));
  $('menu-quit').addEventListener('click', () => { closeMenu(); game.leave(); });
  $('ask-no').addEventListener('click', () => { asking = null; render(); blur(); });
  $('ask-yes').addEventListener('click', () => {
    const what = asking;
    closeMenu();
    if (what === 'surrender') game.giveUp();
    else if (what === 'leave') game.leave();
  });
  // Esc: closes whatever sits on top (leave prompt = Stay, settings = Done, the question = Cancel), else opens or shuts the menu
  addEventListener('keydown', e => {
    if (e.key !== 'Escape' || e.repeat || !isPlaying() || !$('rotate').hidden) return;
    e.preventDefault();
    if (!$('leave').hidden) $('stay').click();
    else if (!$('settings').hidden) $('set-done').click();
    else if (!$('link').hidden) return;
    else if (asking) $('ask-no').click();
    else if (menuOpen()) closeMenu();
    else open();
  });
}
