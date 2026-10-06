// End-to-end check of the join screens (security Stage 3) in real Chromium: two pages = two phones, joined through the REAL lobby code.
// Only the PeerJS broker is faked (messages are routed between the pages by this script), so no internet is needed.
// Needs Playwright with Chromium (not part of the plain-node tests). Run:  node tests/e2e-join.cjs http://127.0.0.1:8765/index.html
//   (serve the folder first, e.g.  npx http-server -p 8765 -s -c-1 .  )   Set GLOBAL_NM to the folder holding the playwright package if it is not found.
const path = require('path');
let chromium;
try { ({ chromium } = require('playwright')); } catch (e) { ({ chromium } = require(path.join(process.env.GLOBAL_NM || '', 'playwright'))); }
const URL_ = process.argv[2] || 'http://127.0.0.1:8765/index.html';
const FAKE_PEER = () => {   // runs inside each page, before the game's own scripts: a stand-in for PeerJS that talks through window.__fpOut / __fpIn
  const peers = new Map(), conns = new Map(); let n = 0;
  class Emitter { on(e, f) { (this.h ||= {})[e] = [...(this.h[e] || []), f]; return this; } fire(e, ...a) { for (const f of this.h?.[e] || []) f(...a); } }
  class Conn extends Emitter {
    constructor(peer, cid, remote) { super(); Object.assign(this, { peer, cid, remote, open: false }); conns.set(peer.id + '|' + cid, this); }
    send(m) { if (!this.open) throw new Error('closed'); window.__fpOut({ kind: 'data', to: this.remote, cid: this.cid, payload: JSON.parse(JSON.stringify(m)) }); }
    close() { if (!this.open) return; this.open = false; window.__fpOut({ kind: 'close', to: this.remote, cid: this.cid }); setTimeout(() => this.fire('close'), 0); }
  }
  window.Peer = class Peer extends Emitter {
    constructor(id) { super(); this.id = id || 'p' + Math.random().toString(36).slice(2, 10); this.open = false; this.destroyed = false; this.disconnected = false; setTimeout(() => { peers.set(this.id, this); this.open = true; this.fire('open', this.id); }, 0); }
    connect(id) {
      const c = new Conn(this, 'c' + ++n + Math.random().toString(36).slice(2, 6), id);
      window.__fpOut({ kind: 'connect', to: id, from: this.id, cid: c.cid });
      setTimeout(() => { if (!c.open) this.fire('error', { type: 'peer-unavailable' }); }, 400);
      return c;
    }
    reconnect() {} destroy() { this.destroyed = true; peers.delete(this.id); for (const [k, c] of conns) if (k.startsWith(this.id + '|')) c.close(); }
  };
  window.__fpIn = m => {
    if (m.kind === 'connect') { const p = peers.get(m.to); if (!p) return; const c = new Conn(p, m.cid, m.from); c.open = true; window.__fpOut({ kind: 'accept', to: m.from, cid: m.cid }); p.fire('connection', c); }
    else { const c = conns.get(m.to + '|' + m.cid); if (!c) return;
      if (m.kind === 'accept') { c.open = true; c.fire('open'); } else if (m.kind === 'data') c.fire('data', m.payload); else if (m.kind === 'close') { c.open = false; c.fire('close'); } }
  };
};
(async () => {
  const browser = await chromium.launch({ args: ['--no-sandbox', '--use-gl=swiftshader', '--enable-unsafe-swiftshader'] });
  const pages = [], results = []; let failed = 0;
  const check = (name, ok, extra = '') => { results.push(`${ok ? '  ok  ' : 'FAIL  '}${name}${ok ? '' : '  ' + extra}`); if (!ok) failed++; };
  async function phone(role) {   // a fresh browser context = a fresh phone (own storage)
    const ctx = await browser.newContext({ viewport: { width: 900, height: 420 }, permissions: ['clipboard-read', 'clipboard-write'] });
    const page = await ctx.newPage();
    await page.exposeFunction('__fpOut', m => { for (const o of pages) if (o !== page) o.evaluate(x => window.__fpIn && window.__fpIn(x), m).catch(() => {}); });
    await page.route('**/lib/peerjs.min.js*', r => r.fulfill({ contentType: 'text/javascript', body: '' }));   // the real PeerJS must not load over our stand-in
    await page.addInitScript(FAKE_PEER);
    page.role = role; pages.push(page);
    page.errors = []; page.on('pageerror', e => page.errors.push(e.message));
    return page;
  }
  const open = async (p, url = URL_) => { await p.goto(url, { waitUntil: 'load' }); await p.waitForFunction(() => !document.documentElement.hasAttribute('data-loading'), null, { timeout: 90000 }); };
  const state = p => p.evaluate(() => document.documentElement.dataset.state);
  const visible = (p, sel) => p.evaluate(s => { const e = document.querySelector(s); return !!e && !e.hidden && getComputedStyle(e).display !== 'none'; }, sel);
  const wait = (p, fn, arg, ms = 15000) => p.waitForFunction(fn, arg, { timeout: ms }).then(() => true, () => false);
  const makeRoom = async (host) => { await open(host); await host.click('#create'); await host.waitForSelector('#invite:not([hidden])', { timeout: 20000 }); return (await host.textContent('#room-code')).trim(); };

  // 1. the invite link carries the key; a friend who opens it gets in with no question
  { const A = await phone('host'), B = await phone('guest');
    const code = await makeRoom(A);
    await A.click('#invite'); await A.waitForTimeout(400);
    const link = await A.evaluate(() => navigator.clipboard.readText());
    check('the invite link has the form #join=CODE.key', new RegExp(`#join=${code}\\.[0-9a-z]{3,40}$`).test(link), link);
    await open(B, link);
    check('opening the link fills in the code', (await B.inputValue('#code-in')) === code);
    await B.click('#join-go');
    const both = await wait(A, () => document.documentElement.dataset.state === 'playing') && await wait(B, () => document.documentElement.dataset.state === 'playing');
    check('with the key, both phones are in the game', both, `${await state(A)} / ${await state(B)}`);
    check('the host was never asked', !(await visible(A, '#join-ask')));
    check('the key is gone from the address bar', !/\.[0-9a-z]{6,}/.test(await B.evaluate(() => location.hash)), await B.evaluate(() => location.hash)); }

  // 2. code only: the host sees the question; Let in
  { const A = await phone('host'), B = await phone('guest');
    const code = await makeRoom(A);
    await open(B); await B.click('#join'); await B.fill('#code-in', code); await B.click('#join-go');
    const asked = await wait(A, () => !document.getElementById('join-ask').hidden);
    check('typing only the code makes the host see "Let in?"', asked);
    if (process.env.SHOTS) await A.screenshot({ path: process.env.SHOTS + '/host-asked.png' });   // (optional) a picture of the question, for a human to look at
    check('the guest is told it is waiting', await wait(B, () => /Asking the host/.test(document.getElementById('join-msg').textContent)));
    check('the guest is NOT in yet', (await state(B)) !== 'playing');
    await A.click('#ask-allow');
    const both = await wait(A, () => document.documentElement.dataset.state === 'playing') && await wait(B, () => document.documentElement.dataset.state === 'playing');
    check('after "Let in" both phones are in the game', both, `${await state(A)} / ${await state(B)}`); }

  // 3. code only: Not now
  { const A = await phone('host'), B = await phone('guest');
    const code = await makeRoom(A);
    await open(B); await B.click('#join'); await B.fill('#code-in', code); await B.click('#join-go');
    await wait(A, () => !document.getElementById('join-ask').hidden);
    await A.click('#ask-deny');
    check('"Not now" tells the guest', await wait(B, () => /did not let you in/.test(document.getElementById('join-msg').textContent)));
    check('the question goes away on the host', !(await visible(A, '#join-ask')));
    check('the host is still waiting (room open)', (await state(A)) !== 'playing' && await visible(A, '#room-code')); }

  for (const p of pages) if (p.errors.length) { failed++; results.push('FAIL  page errors on the ' + p.role + ': ' + p.errors.slice(0, 3).join(' | ')); }
  console.log(results.join('\n') + `\n\n${failed ? failed + ' PROBLEM(S)' : 'all end-to-end checks passed'}`);
  await browser.close(); process.exit(failed ? 1 : 0);
})().catch(e => { console.error('SCRIPT ERROR', e); process.exit(2); });
