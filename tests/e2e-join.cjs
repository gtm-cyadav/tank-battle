// End-to-end check of the join screens (security Stage 3) in real Chromium: two pages = two phones, joined through the REAL lobby code (see browser-harness.cjs).
// Run:  node tests/e2e-join.cjs http://127.0.0.1:8765/index.html     (serve the folder first, e.g.  npx http-server -p 8765 -s -c-1 .  )
// Set GLOBAL_NM to the folder that holds the playwright package if it is not found. SHOTS=<dir> also saves a picture of the host's question.
const harness = require('./browser-harness.cjs');
(async () => {
  const h = await harness(process.argv[2] || 'http://127.0.0.1:8765/index.html');
  const { check, open, state, visible, wait, makeRoom } = h;
  const both = async (A, B) => await wait(A, () => document.documentElement.dataset.state === 'playing') && await wait(B, () => document.documentElement.dataset.state === 'playing');

  // 1. the invite link carries the key; a friend who opens it gets in with no question
  { const A = await h.phone('host'), B = await h.phone('guest');
    const code = await makeRoom(A);
    await A.click('#invite'); await A.waitForTimeout(400);
    const link = await A.evaluate(() => navigator.clipboard.readText());
    check('the invite link has the form #join=CODE.key', new RegExp(`#join=${code}\\.[0-9a-z]{3,40}$`).test(link), link);
    await open(B, link);
    check('opening the link fills in the code', (await B.inputValue('#code-in')) === code);
    await B.click('#join-go');
    check('with the key, both phones are in the game', await both(A, B), `${await state(A)} / ${await state(B)}`);
    check('the host was never asked', !(await visible(A, '#join-ask')));
    check('the key is gone from the address bar', !/\.[0-9a-z]{6,}/.test(await B.evaluate(() => location.hash)), await B.evaluate(() => location.hash)); await h.close(A, B); }

  // 2. code only: the host sees the question; Let in
  { const A = await h.phone('host'), B = await h.phone('guest');
    const code = await makeRoom(A);
    await open(B); await B.click('#join'); await B.fill('#code-in', code); await B.click('#join-go');
    const asked = await wait(A, () => !document.getElementById('join-ask').hidden);
    check('typing only the code makes the host see "Let in?"', asked);
    if (process.env.SHOTS) await A.screenshot({ path: process.env.SHOTS + '/host-asked.png' });   // (optional) a picture of the question, for a human to look at
    check('the guest is told it is waiting', await wait(B, () => /Asking the host/.test(document.getElementById('join-msg').textContent)));
    check('the guest is NOT in yet', (await state(B)) !== 'playing');
    await A.click('#ask-allow');
    check('after "Let in" both phones are in the game', await both(A, B), `${await state(A)} / ${await state(B)}`); await h.close(A, B); }

  // 3. code only: Not now
  { const A = await h.phone('host'), B = await h.phone('guest');
    const code = await makeRoom(A);
    await open(B); await B.click('#join'); await B.fill('#code-in', code); await B.click('#join-go');
    await wait(A, () => !document.getElementById('join-ask').hidden);
    await A.click('#ask-deny');
    check('"Not now" tells the guest', await wait(B, () => /did not let you in/.test(document.getElementById('join-msg').textContent)));
    check('the question goes away on the host', !(await visible(A, '#join-ask')));
    check('the host is still waiting (room open)', (await state(A)) !== 'playing' && await visible(A, '#room-code')); await h.close(A, B); }

  // 4. a refresh puts a player straight back (security Stage 5 checks the saved room record before using it)
  { const A = await h.phone('host'), B = await h.phone('guest');
    await makeRoom(A); await A.click('#invite'); await A.waitForTimeout(400);
    await open(B, await A.evaluate(() => navigator.clipboard.readText())); await B.click('#join-go');
    await both(A, B);
    await B.waitForTimeout(2500);   // (the room is saved once a second)
    await B.reload({ waitUntil: 'domcontentloaded', timeout: 90000 });
    check('the guest refreshes and is back in the game', await wait(B, () => document.documentElement.dataset.state === 'playing', null, 60000), await state(B));
    check('the host is not left waiting after the guest\'s refresh', await wait(A, () => document.getElementById('link').hidden, null, 30000));
    await A.waitForTimeout(2500);
    await A.reload({ waitUntil: 'domcontentloaded', timeout: 90000 });
    check('the host refreshes and is back in the game', await wait(A, () => document.documentElement.dataset.state === 'playing', null, 60000), await state(A));
    check('the guest is let back in by the refreshed host (no question asked)', await wait(B, () => document.getElementById('link').hidden, null, 40000) && !(await visible(A, '#join-ask'))); await h.close(A, B); }

  // 5. the game does not run inside another page (clickjacking), but does at the top level
  { const ctx = await h.browser.newContext(); const page = await ctx.newPage();
    const real = h.url.replace('127.0.0.1', '127.0.0.2');   // an address that is not "testing" (see js/debug.js)
    await page.setContent(`<iframe id="f" src="${real}" style="width:900px;height:420px"></iframe>`);
    await page.waitForTimeout(8000);
    const frame = page.frames().find(f => f.url().startsWith(real.split('/index')[0]));
    const hidden = frame ? await frame.evaluate(() => getComputedStyle(document.documentElement).display === 'none') : null;
    check('inside a foreign frame the game hides itself and does not start', hidden === true, 'display none: ' + hidden);
    const top = await ctx.newPage(); await top.goto(real, { waitUntil: 'domcontentloaded', timeout: 90000 }); await top.waitForTimeout(4000);
    check('at the top level the same address runs normally', await top.evaluate(() => document.documentElement.dataset.state === 'start' && getComputedStyle(document.documentElement).display !== 'none')); }

  await h.finish();
})().catch(e => { global.__harness?.dump(); console.error('SCRIPT ERROR', e); process.exit(2); });
