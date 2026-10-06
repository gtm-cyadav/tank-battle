// The two-player side of the start screen, and everything the screen says about the link (brief section 3,
// "Two players"): create a room with a 4-letter code, join with the code, or drive alone; rejoin after a refresh
// or reopen; plain messages for a wrong code, a full room, a quiet or departed player, and the 60-second wait.
import { createLink, randomToken } from './net.js';
import { startPlaying, showStart, leaveToStart, enterFullscreen, refreshScreen, device } from './screen.js';
import { randomWeather } from './weather.js';
import { tipOn, tipOff } from './tips.js';
import { icon } from './icons.js';
import { say, end } from './say.js';
import { TESTING } from './debug.js';
import { cleanRoom } from './guard.js';

const $ = id => document.getElementById(id);
const WAIT = 60;                         // seconds a dropped player gets to come back
const TAB_KEY = 'tank-battle.room';      // this tab: survives a refresh
const PHONE_KEY = 'tank-battle.room.';   // + role, this phone: survives the game being closed
const LIVE = 4000;                       // a record touched more recently than this belongs to a tab still open

let game = null;       // hooks from main.js: start(o), remote(msg), paused(on), end(), finish(), pos(), snapshot(), summary(), over()
let room = null;       // { code, role: 'host' | 'guest', token, guestToken, phase: 'waiting' | 'playing', pos, match, t }
let stage = 'home';    // 'home' | 'creating' | 'joining' | 'rejoining' | 'playing' | 'ended'
let countdown = null;  // { until, el, done }
let downReason = null, downWasOffline = false;   // why the link is down; whether this phone went offline meanwhile

// ---- remembering the room, so a refresh or reopen can rejoin -------------------------------------------------
const store = (s, k, v) => { try { if (v === null) s.removeItem(k); else s.setItem(k, JSON.stringify(v)); } catch (e) { /* storage blocked */ } };
const recall = (s, k) => { try { return cleanRoom(JSON.parse(s.getItem(k))); } catch (e) { return null; } };   // security Stage 5: a stored record is checked before it is used
function saveRoom() {
  if (!room?.code || stage === 'rejoining' || stage === 'ended') return;
  if (room.role === 'guest' && room.phase !== 'playing') return;   // not in until the host says so
  room.pos = room.phase === 'playing' ? game.pos() : null;
  if (room.phase === 'playing') room.match = game.snapshot() || room.match || null;   // roles, scores and clock, for a refresh
  room.t = Date.now();
  store(sessionStorage, TAB_KEY, room);
  store(localStorage, PHONE_KEY + room.role, room);
}
function forgetRoom() {
  if (room) store(localStorage, PHONE_KEY + room.role, null);
  store(sessionStorage, TAB_KEY, null);
  room = null;
}
function findRoom() {
  const fresh = r => r?.code && (r.role === 'host' || r.role === 'guest') && Date.now() - r.t < WAIT * 1000;
  const mine = recall(sessionStorage, TAB_KEY);
  if (fresh(mine)) return mine;
  // the phone closed the game mid-match: take a recent room that no open tab is still using
  return ['host', 'guest'].map(r => recall(localStorage, PHONE_KEY + r))
    .filter(r => fresh(r) && Date.now() - r.t > LIVE).sort((a, b) => b.t - a.t)[0] || null;
}
setInterval(saveRoom, 1000);
addEventListener('pagehide', saveRoom);   // the clock to the moment of a refresh

// ---- the link ------------------------------------------------------------------------------------------------
const link = createLink({
  hosting(code) {
    room.code = code;
    room.key = link.key;
    saveRoom();
    if (stage === 'creating') showCode(code);
  },
  up(first) {
    room.guestToken = link.guestToken;
    if (stage === 'creating' || stage === 'joining' || stage === 'rejoining') {
      const back = stage === 'rejoining';
      room.phase = 'playing';
      stage = 'playing';
      tips('');
      stopCountdown();
      game.start({ mode: room.role, code: room.code, pos: back ? room.pos : null, match: back ? room.match : null });
      startPlaying(false);
      saveRoom();
      toast(back ? 'Back' : 'In', icon(back ? 'signal' : 'ready', 16));   // R4: an icon and one word (the room code is in the menu)
    } else if (stage === 'playing' && !first) {
      const mine = downReason === 'offline' || downWasOffline;   // it was this phone that lost the signal
      hideCard();
      game.paused(false);
      toast('Back', mine ? icon('signal', 16) : game.otherFace?.() || icon('ready', 16));   // R4: their face and "Back"
    }
  },
  down(reason) {
    if (stage !== 'playing') return;
    downReason = reason;
    downWasOffline = reason === 'offline';
    game.paused(true);
    showCard('wait');
    startCountdown($('link-count'), WAIT, () => {
      link.close();
      const why = game.over() ? 'No rematch.' : nobodyWon();   // lost on the match-over card: the result already stands
      if (navigator.onLine === false) endMatch('Still no signal', why);
      else endMatch('They did not come back', why);
    });
  },
  waiting() {
    if (stage === 'joining') $('join-msg').textContent = `Found room ${room.code}. The other player has the game in the background. It starts when they come back to it.`;
  },
  left() {
    if (stage === 'playing') endMatch('The other player left', game.over() ? 'No rematch.' : nobodyWon());
  },
  failed(kind) {
    const code = room?.code;
    if (stage === 'joining') {
      forgetRoom();
      stage = 'home';
      showJoin(JOIN_ERRORS[kind]?.(code) || JOIN_ERRORS.server());
    } else if (stage === 'playing' && kind === 'replaced') {
      endMatch('Game moved', 'This game carried on in another tab or window.');
    } else if (stage === 'creating' || stage === 'rejoining') {
      forgetRoom();
      stopCountdown();
      showBusy(JOIN_ERRORS[kind]?.(code) || JOIN_ERRORS.server(), null, 'back');
      stage = 'ended';
    }
  },
  // security Stage 3: someone with only the room code asks to join; the host decides (the invite link's key skips this question)
  request() {
    if (stage !== 'creating') { link.deny(); return; }
    $('create-text').textContent = 'Someone wants to join with the code. Let them in?';
    $('join-ask').hidden = false;
  },
  requestGone() { askDone(); },
  asking() { if (stage === 'joining') $('join-msg').textContent = 'Asking the host to let you in. Keep this open.'; },
  note(kind) {
    if (kind === 'version' && stage === 'creating') $('create-note').textContent = 'Someone tried to join with a different version of the game. Reload the page on both phones.';
  },
  message(m) { try { game.remote(m); } catch (e) { console.warn('Ignored a message that could not be handled.', e); } },   // security Stage 2: one bad message never breaks the game loop or the link
});

const JOIN_ERRORS = {
  nocode: c => `There is no game with the code ${c}. Check it with the other player.`,
  full: c => `Room ${c} already has two players.`,
  version: () => 'The two phones have different versions of the game. Reload the page on both phones, then try again.',
  noconnect: () => 'Found the room, but no answer from the other phone. Check the game is open on it, then try again. If it keeps failing, switch one phone between Wi-Fi and mobile data.',
  server: () => 'Could not reach the game server. Check the internet connection and try again.',
  replaced: () => 'This game carried on in another tab or window.',
  denied: c => `The host of room ${c} did not let you in. Ask them for the invite link.`,
};

// ---- start-screen panels -------------------------------------------------------------------------------------
const PANELS = ['home', 'solo', 'create', 'join', 'busy'];
function panel(name) {
  for (const p of PANELS) $('p-' + p).hidden = p !== name;
  $('start').dataset.panel = name;   // the install / keyboard hints only show next to the first panel
  tips(name);
}
// Stage 4B (loading tips): a silly line under the status while a phone is connecting or waiting (opening a room, waiting for the other player,
// looking for a room, rejoining). Not on the idle forms, not on an error.
function tips(name, waiting = true) {
  const on = (p, ok = true) => (name === p && ok ? tipOn : tipOff)($(p + '-tip'));
  on('create'); on('join', stage === 'joining'); on('busy', waiting);
}
const wantFullscreen = () => device.touch && device.canFullscreen && !device.homeScreen;

function toHome() {
  stopCountdown();
  stage = 'home';
  showStart();
  panel('home');
}
// the host's "Let in?" question is over (answered, timed out or the player left): the waiting text comes back
function askDone() {
  $('join-ask').hidden = true;
  if (stage === 'creating' && room?.code) $('create-text').textContent = 'Send the invite or say the code. Keep the game open.';
}
function showCode(code) {
  $('room-code').textContent = code;
  $('room-code').classList.remove('pending');
  $('create-text').textContent = 'Send the invite or say the code. Keep the game open.';
  $('invite').hidden = false;
}
// ---- R4 Part B (Chetan, 2026-10-03): the invite link. The room code goes in the part after "#" (never sent to any server, nothing else in it: no
// names). One tap: the phone's share sheet where it has one, else the link is copied. Opening the link fills in the code; the friend only taps Join.
// Security Stage 3: the link also carries the room key ("#join=ABCD.k3x9..."): a friend who opens it is let in without the host having to say yes. The key is in the part
// after "#" too, so it is never sent to any server.
export const inviteLink = (code, key) => `${location.origin}${location.pathname}#join=${code}${key ? '.' + key : ''}`;
export const codeFromLink = hash => (/^#join=([A-HJ-NP-Z]{4})(?:\.[0-9a-z]{3,40})?$/i.exec(hash || '') || [])[1]?.toUpperCase() || null;   // room codes never use I or O
export const keyFromLink = hash => (/^#join=[A-HJ-NP-Z]{4}\.([0-9a-z]{3,40})$/i.exec(hash || '') || [])[1]?.toLowerCase() || null;
let inviteT = 0;
// share the link (the phone's share sheet), else copy it: 'shared' | 'closed' (the share sheet was closed) | 'copied' | 'failed'
export async function shareInvite(code, key) {
  const url = inviteLink(code, key);
  if (navigator.share) {
    try { await navigator.share({ title: 'Tank Battle', text: `Tank Battle · ${code}`, url }); return 'shared'; }
    catch (e) { if (e?.name === 'AbortError') return 'closed'; }   // anything else: copy instead
  }
  try { await navigator.clipboard.writeText(url); return 'copied'; } catch (e) { /* no clipboard (an old browser, or not https): the old way */ }
  const t = document.createElement('textarea');
  t.value = url; t.setAttribute('readonly', ''); t.style.cssText = 'position:fixed;left:-999px;top:0;opacity:0';
  document.body.append(t); t.select();
  let ok = false;
  try { ok = document.execCommand('copy'); } catch (e) { ok = false; }
  t.remove();
  return ok ? 'copied' : 'failed';
}
async function invite() {
  const code = room?.code;
  if (!code || stage !== 'creating') return;
  const how = await shareInvite(code, room?.key), b = $('invite');
  if (how !== 'copied' && how !== 'failed') return;
  b.innerHTML = how === 'copied' ? icon('ready', 18) : icon('room', 18); b.append(how === 'copied' ? 'Copied' : code);   // copied: a tick; no way to copy: the code to say
  clearTimeout(inviteT); inviteT = setTimeout(() => { b.innerHTML = icon('invite', 18); b.append('Invite'); }, 2200);
}
// the link opened this page (or was opened in this tab while on the start screen): the Join panel with the code filled in, the address cleaned up
let linkCode = null, linkKey = null;   // the room code and key the opened invite link carried (a typed code has no key)
function joinFromLink() {
  const code = codeFromLink(location.hash), key = keyFromLink(location.hash);
  if (location.hash.startsWith('#join=')) { try { history.replaceState(history.state, '', location.pathname + location.search); } catch (e) { /* keep it */ } }
  if (!code || stage !== 'home') return false;
  linkCode = code; linkKey = key;
  $('code-in').value = code;
  showJoin();
  return true;
}
function showJoin(error = '') {
  panel('join');
  const busy = stage === 'joining';
  $('code-in').disabled = busy;
  $('join-go').disabled = busy || $('code-in').value.length !== 4;
  $('join-msg').textContent = busy ? `Looking for room ${room.code}.` : error;
  $('join-msg').classList.toggle('error', !!error);
}
// busy panel: a line of text, an optional countdown, and Leave (give up) or Back (start again)
function showBusy(text, withCountdown, button) {
  panel('busy');
  $('busy-text').textContent = text;
  $('busy-count').textContent = '';
  $('busy-leave').hidden = button !== 'leave';
  $('busy-back').hidden = button !== 'back';
  tips('busy', button === 'leave');
  if (withCountdown) startCountdown($('busy-count'), WAIT, withCountdown);
}

function create() {
  if (wantFullscreen()) enterFullscreen();
  room = { code: null, role: 'host', token: null, guestToken: null, phase: 'waiting' };
  stage = 'creating';
  panel('create');
  $('room-code').textContent = '····';
  $('room-code').classList.add('pending');
  $('invite').hidden = true;
  $('join-ask').hidden = true;
  $('create-text').textContent = 'Opening a room.';
  $('create-note').textContent = '';
  link.host();
}
function join() {
  const input = $('code-in'), code = input.value;
  if (code.length !== 4 || stage === 'joining') return;
  if (/[IO]/.test(code)) { showJoin('Room codes never use the letters I or O. Check it with the other player.'); return; }
  if (wantFullscreen()) enterFullscreen();
  input.blur();
  const key = linkKey && code === linkCode ? linkKey : null;   // the key belongs to the linked code only
  room = { code, role: 'guest', token: randomToken(), key, guestToken: null, phase: 'waiting' };
  stage = 'joining';
  showJoin();
  link.join({ code, token: room.token, key });
}
// Drive alone: the weather the player picked on the panel ('random' draws one each time)
let soloWx = 'random';
function showSoloWx() { for (const b of document.querySelectorAll('[data-wx]')) b.setAttribute('aria-pressed', b.dataset.wx === soloWx); }
function solo(role) {   // role: 'hunter' | 'hider', picked by the player; then the leader picker (Stage 3A)
  game.pickSolo((me, other) => {
    if (wantFullscreen()) enterFullscreen();
    stage = 'playing';
    game.start({ mode: 'solo', role, weather: soloWx === 'random' ? randomWeather() : soloWx, me, other });
    startPlaying(false);
  });
}
function rejoin(r) {
  room = { ...r };
  if (r.role === 'host' && r.phase === 'waiting') {   // refreshed while waiting for the other player: same code, keep waiting
    stage = 'creating';
    panel('create');
    showCode(r.code);
    $('create-note').textContent = '';
    link.host({ code: r.code, key: r.key, rejoin: true });
    return;
  }
  stage = 'rejoining';
  showBusy(`Rejoining room ${r.code}.`, () => {
    link.close();
    const code = room?.code;
    forgetRoom();
    stage = 'ended';
    showBusy(`Could not get back into room ${code}. The match is over.`, null, 'back');
  }, 'leave');
  if (r.role === 'host') link.host({ code: r.code, key: r.key, guestToken: r.guestToken, rejoin: true });
  else link.join({ code: r.code, token: r.token, key: r.key, rejoin: true });
}

// ---- in-game card (link lost, match over) and toasts ---------------------------------------------------------
const WAIT_TEXT = {
  quiet: ['Waiting for the other player', 'Their phone has gone quiet.'],
  closed: ['Waiting for the other player', 'The connection dropped.'],
  away: ['Waiting for the other player', 'They switched to another app.'],
  offline: ['No signal', 'This phone has lost its internet connection.'],
  reconnect: ['Reconnecting', 'The signal is back. Finding the other phone again.'],
};
function showCard(kind, title, text) {
  if (kind === 'wait') {
    const why = navigator.onLine === false ? 'offline' : downWasOffline ? 'reconnect' : downReason;
    [title, text] = WAIT_TEXT[why] || WAIT_TEXT.quiet;
  }
  $('link-t').textContent = title;
  $('link-p').textContent = text;
  $('link-count').textContent = '';
  $('link-leave').hidden = kind !== 'wait';
  $('link-back').hidden = kind === 'wait';
  $('link').hidden = false;
  refreshScreen();
}
function hideCard() {
  stopCountdown();
  $('link').hidden = true;
  refreshScreen();
}
for (const t of ['online', 'offline']) addEventListener(t, () => {
  if (stage !== 'playing' || $('link').hidden || $('link-leave').hidden) return;
  if (t === 'offline') downWasOffline = true;
  showCard('wait');
});

// a match ended early (left, or never came back): nobody wins, but say what the score was (Chetan's choice, 1d)
const nobodyWon = () => ['The match is over. Nobody won.', game.summary()].filter(Boolean).join(' ');
function endMatch(title, text) {
  forgetRoom();
  stage = 'ended';
  game.paused(true);
  game.finish();
  showCard('end', title, text);
}

let toasts = 0;
// R4: a notice is an icon (or a face) and at most one word; `ic` is the icon's page text from icons.js or main.js (never typed text).
// R4 Part B: it goes through the one-message queue (say.js) at the top rank: it cuts in on a bubble or a hint, waits for the ping number and the
// round flash, and never shows on top of another notice. opt: { ms (default 2.8 s), action: { label, run } } adds one small button (Auto-Low's Undo).
export function toast(text, ic = '', opt = {}) {
  const el = $('toast'), k = String(++toasts), key = 'toast:' + text + ic;
  say({ kind: 'toast', pri: 2, ms: opt.ms || 2800, key, wait: 10000,
    show() {
      el.innerHTML = ic;
      el.append(text);
      if (opt.action) {
        const b = document.createElement('button');
        b.type = 'button'; b.className = 'u'; b.textContent = opt.action.label;
        b.addEventListener('click', () => { opt.action.run(); end(key); });
        el.append(b);
      }
      el.dataset.k = k;
      el.classList.add('show');
    },
    hide() { el.classList.remove('show'); },
    on: () => el.classList.contains('show') && el.dataset.k === k });
}

function startCountdown(el, secs, done) {
  countdown = { until: Date.now() + secs * 1000, el, done };
  tick();
}
function stopCountdown() { countdown = null; }
function tick() {
  if (!countdown) return;
  const left = Math.max(0, Math.ceil((countdown.until - Date.now()) / 1000));
  countdown.el.textContent = `Giving up in ${left} s.`;
  if (left > 0) return;
  const done = countdown.done;
  countdown = null;
  done();
}
setInterval(tick, 250);

// ---- leaving ---------------------------------------------------------------------------------------------------
// Leave on purpose (leave prompt, or Leave on the waiting card): tell the other phone, forget the room.
export function leaveMatch() {
  if (room) link.leave();
  forgetRoom();
  backToStart();
}
function backToStart() {
  hideCard();
  game.end();
  leaveToStart();
  toHome();
}
// the phone switches app or locks the screen: tell the other player straight away, and again on return
// (at any stage: a phone can be rejoining or waiting in a room while out of sight)
document.addEventListener('visibilitychange', () => link.send({ t: document.hidden ? 'away' : 'here' }));

export const sendState = m => link.send(m);
export const isOnline = () => link.up;
if (TESTING) window.__tbLink = link;   // testing only (security Stage 4: not on the real site, see debug.js)

export function initLobby(hooks) {
  game = hooks;
  $('create').addEventListener('click', create);
  $('join').addEventListener('click', () => { $('code-in').value = ''; showJoin(); $('code-in').focus(); });
  $('solo').addEventListener('click', () => panel('solo'));
  $('solo-hunter').addEventListener('click', () => solo('hunter'));
  $('solo-hider').addEventListener('click', () => solo('hider'));
  $('solo-back').addEventListener('click', () => panel('home'));
  for (const b of document.querySelectorAll('[data-wx]')) b.addEventListener('click', () => { soloWx = b.dataset.wx; showSoloWx(); });
  showSoloWx();
  $('create-cancel').addEventListener('click', () => { link.close(); forgetRoom(); toHome(); });
  $('invite').addEventListener('click', invite);
  $('ask-allow').addEventListener('click', () => { link.allow(); askDone(); });
  $('ask-deny').addEventListener('click', () => { link.deny(); askDone(); });
  addEventListener('hashchange', joinFromLink);
  $('join-back').addEventListener('click', () => { link.close(); forgetRoom(); toHome(); });
  $('join-go').addEventListener('click', join);
  const input = $('code-in');
  input.addEventListener('input', () => {
    input.value = input.value.toUpperCase().replace(/[^A-Z]/g, '').slice(0, 4);
    if (input.value !== linkCode) linkKey = null;   // a different code was typed: the link's key no longer applies
    showJoin();
  });
  input.addEventListener('keydown', e => { if (e.key === 'Enter') join(); });
  $('busy-leave').addEventListener('click', () => { link.close(); forgetRoom(); toHome(); });
  $('busy-back').addEventListener('click', toHome);
  $('link-leave').addEventListener('click', leaveMatch);
  $('link-back').addEventListener('click', backToStart);
  // desktop testing: Enter on the first panel drives alone
  addEventListener('keydown', e => {
    if (e.code === 'Enter' && stage === 'home' && !$('p-home').hidden && !$('start').hidden && $('rotate').hidden && $('settings').hidden) solo('hunter');
  });

  const r = findRoom();
  if (r) { showStart(); rejoin(r); joinFromLink(); }   // a match to carry on wins over an invite (the link is only tidied away)
  else { toHome(); joinFromLink(); }
}
