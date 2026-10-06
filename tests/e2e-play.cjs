// End-to-end check of a real match between two phones (security Stage 4), in real Chromium (see browser-harness.cjs): through the leader pick, the coin toss and
// the head start, then shooting. Checks that ordinary play works, and that the hider's phone refuses shots a real hunter could not fire.
// Run:  node tests/e2e-play.cjs http://127.0.0.1:8765/index.html    (about 1.5 minutes: the head start is 20 s of real time)
// Uses the window.__tb / __tbLink test hooks, which exist because the page is opened from localhost (js/debug.js).
const harness = require('./browser-harness.cjs');
(async () => {
  const h = await harness(process.argv[2] || 'http://127.0.0.1:8765/index.html');
  const { check, wait } = h;
  const A = await h.phone('host'), B = await h.phone('guest');
  const code = await h.makeRoom(A);
  await A.click('#invite'); await A.waitForTimeout(400);
  await h.open(B, await A.evaluate(() => navigator.clipboard.readText()));
  await B.click('#join-go');
  check('both phones join the match', await wait(A, () => document.documentElement.dataset.state === 'playing') && await wait(B, () => document.documentElement.dataset.state === 'playing'));

  // the leader pick: both tap Ready; then the coin toss (7 s) and the match is on
  for (const p of [A, B]) { await p.waitForSelector('#pk-go', { state: 'visible', timeout: 30000 }); await p.click('#pk-go'); }
  const inPlay = p => wait(p, () => document.documentElement.hasAttribute('data-match') && document.getElementById('pick').hidden && document.getElementById('round').hidden, null, 40000);
  check('after both are Ready the round starts on both phones', await inPlay(A) && await inPlay(B));
  const roleOf = p => p.evaluate(() => window.__tb.role);
  const [ra, rb] = [await roleOf(A), await roleOf(B)];
  check('one phone hunts and the other hides', new Set([ra, rb]).size === 2 && [ra, rb].includes('hunter'), `${ra} / ${rb}`);
  const [hunter, hider] = ra === 'hunter' ? [A, B] : [B, A];

  // count the bullets that appear on the hider's phone (a bullet = a Group of exactly two children, added to the scene)
  await hider.evaluate(() => { window.__bullets = 0; const add = window.__tb.scene.add.bind(window.__tb.scene); window.__tb.scene.add = (...o) => { for (const x of o) if (x && x.isGroup && x.children.length === 2) window.__bullets++; return add(...o); }; });
  const bullets = () => hider.evaluate(() => window.__bullets);
  const clockLeft = p => p.evaluate(() => { const [m, s] = document.getElementById('rh-clock').textContent.split(':').map(Number); return m * 60 + s; });
  const sendFake = (n, e0, de) => hunter.evaluate(([n, e0, de]) => { for (let i = 0; i < n; i++) window.__tbLink.send({ t: 'f', mid: 1, r: 1, e: e0 + i * de, id: 900 + i, x: 0, z: 0, y: 0.5 }); }, [n, e0, de]);

  check('no bullets before anything is fired', (await bullets()) === 0);
  // --- during the head start the hider's phone must refuse every shot ---
  const left0 = await clockLeft(hunter), eNow = 180 - left0;
  check('it is still the head start', eNow < 19, 'clock says ' + eNow + ' s into the round');
  await sendFake(10, 5, 1.5); await hunter.waitForTimeout(600);
  check('10 shots sent during the head start: none appears on the hider\'s phone', (await bullets()) === 0, 'bullets: ' + await bullets());

  // --- wait out the head start, then a real shot must get through ---
  const over = await wait(hunter, () => { const [m, s] = document.getElementById('rh-clock').textContent.split(':').map(Number); return m * 60 + s <= 180 - 21; }, null, 45000);
  check('the head start ends', over);
  await hunter.waitForTimeout(1500);
  const before = await bullets();
  await hunter.evaluate(() => window.__tb.tryFire());
  check('a real shot from the hunter appears on the hider\'s phone', await wait(hider, b => window.__bullets > b, before, 4000), 'bullets: ' + await bullets());

  // --- a flood of shots (rapid fire, made-up times) lets at most a few through ---
  const base = await bullets();
  const eNow2 = 180 - await clockLeft(hunter);
  await sendFake(60, eNow2 - 2, 0.05); await hunter.waitForTimeout(800);
  const got = (await bullets()) - base;
  check('60 rapid-fire shots: at most 3 reach the hider\'s phone', got <= 3, 'got ' + got);

  // --- ordinary play kept working: the game on both phones is still alive and in sync ---
  await hunter.waitForTimeout(1500);
  check('the hunter\'s clock still runs', (await clockLeft(hunter)) < left0);
  check('both phones still show the same round clock (within 2 s)', Math.abs(await clockLeft(A) - await clockLeft(B)) <= 2, `${await clockLeft(A)} vs ${await clockLeft(B)}`);
  await h.finish();
})().catch(e => { console.error('SCRIPT ERROR', e); process.exit(2); });
