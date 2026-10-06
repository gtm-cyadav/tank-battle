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
    check('the key is gone from the address bar', !/\.[0-9a-z]{6,}/.test(await B.evaluate(() => location.hash)), await B.evaluate(() => location.hash)); }

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
    check('after "Let in" both phones are in the game', await both(A, B), `${await state(A)} / ${await state(B)}`); }

  // 3. code only: Not now
  { const A = await h.phone('host'), B = await h.phone('guest');
    const code = await makeRoom(A);
    await open(B); await B.click('#join'); await B.fill('#code-in', code); await B.click('#join-go');
    await wait(A, () => !document.getElementById('join-ask').hidden);
    await A.click('#ask-deny');
    check('"Not now" tells the guest', await wait(B, () => /did not let you in/.test(document.getElementById('join-msg').textContent)));
    check('the question goes away on the host', !(await visible(A, '#join-ask')));
    check('the host is still waiting (room open)', (await state(A)) !== 'playing' && await visible(A, '#room-code')); }

  await h.finish();
})().catch(e => { console.error('SCRIPT ERROR', e); process.exit(2); });
