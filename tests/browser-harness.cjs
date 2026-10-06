// Shared by the end-to-end tests: real Chromium, one browser context per "phone" (own storage), and a stand-in for the PeerJS broker (messages are routed
// between the pages by Node), so the REAL game code runs on both phones and no internet is needed. Needs Playwright with Chromium installed.
const path = require('path');
function loadPlaywright() {
  try { return require('playwright'); } catch (e) { return require(path.join(process.env.GLOBAL_NM || '', 'playwright')); }
}
// runs inside each page, before the game's own scripts: a stand-in for PeerJS that talks through window.__fpOut / __fpIn
const FAKE_PEER = () => {
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
module.exports = async function harness(url) {
  const { chromium } = loadPlaywright();
  const browser = await chromium.launch({ args: ['--no-sandbox', '--use-gl=swiftshader', '--enable-unsafe-swiftshader'] });
  const pages = [], results = []; let failed = 0;
  const h = global.__harness = {
    pages, browser, url,
    check(name, ok, extra = '') { results.push(`${ok ? '  ok  ' : 'FAIL  '}${name}${ok ? '' : '  ' + extra}`); if (!ok) failed++; },
    async phone(role) {   // a fresh browser context = a fresh phone
      const ctx = await browser.newContext({ viewport: { width: 900, height: 420 }, permissions: ['clipboard-read', 'clipboard-write'] });
      const page = await ctx.newPage();
      await page.exposeFunction('__fpOut', m => { for (const o of pages) if (o !== page) o.evaluate(x => window.__fpIn && window.__fpIn(x), m).catch(() => {}); });
      await page.route('**/lib/peerjs.min.js*', r => r.fulfill({ contentType: 'text/javascript', body: '' }));   // the real PeerJS must not load over our stand-in
      await page.addInitScript(FAKE_PEER);
      page.role = role; pages.push(page);
      page.errors = []; page.on('pageerror', e => page.errors.push(e.message));
      page.on('console', m => { if (/Content Security Policy|Refused to/i.test(m.text())) page.errors.push('CSP: ' + m.text().slice(0, 200)); });
      return page;
    },
    async open(p, u = url) { await p.goto(u, { waitUntil: 'load' }); await p.waitForFunction(() => !document.documentElement.hasAttribute('data-loading'), null, { timeout: 90000 }); },
    state: p => p.evaluate(() => document.documentElement.dataset.state),
    visible: (p, sel) => p.evaluate(s => { const e = document.querySelector(s); return !!e && !e.hidden && getComputedStyle(e).display !== 'none'; }, sel),
    wait: (p, fn, arg, ms = 15000) => p.waitForFunction(fn, arg, { timeout: ms }).then(() => true, () => false),
    async makeRoom(host) { await h.open(host); await host.click('#create'); await host.waitForSelector('#invite:not([hidden])', { timeout: 20000 }); return (await host.textContent('#room-code')).trim(); },
    async close(...ps) { for (const p of ps) { const i = pages.indexOf(p); if (i >= 0) pages.splice(i, 1); await p.context().close().catch(() => {}); } },   // free a finished section's phones (software rendering is slow)
    dump() { console.log(results.join('\n')); },   // what has been checked so far (used when a script stops with an error)
    async finish() {
      for (const p of pages) if (p.errors.length) { failed++; results.push('FAIL  problems on the ' + p.role + ' phone: ' + p.errors.slice(0, 3).join(' | ')); }
      console.log(results.join('\n') + `\n\n${failed ? failed + ' PROBLEM(S)' : 'all end-to-end checks passed'}`);
      await browser.close(); process.exit(failed ? 1 : 0);
    },
  };
  return h;
};
