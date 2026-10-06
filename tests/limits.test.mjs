// Tests for js/limits.js (security Stage 4). Run: node tests/limits.test.mjs
// Two kinds: (1) REAL PLAY IS NEVER TOUCHED: simulated driving at top speed with network stalls and bursts, and shooting every 1.5 s with clock differences,
// must pass unchanged. (2) CHEATS ARE REFUSED: teleports, a far camera, rapid fire, shots in the head start, shots from far away, bursts.
import assert from 'node:assert/strict';
import { createStepLimiter, cameraOk, createShotGate, LIMITS } from '../js/limits.js';
import { RULES } from '../js/rules.js';
import { DRIVE } from '../js/tank.js';

let passed = 0;
const test = (name, fn) => { try { fn(); passed++; console.log('  ok  ' + name); } catch (e) { console.error('FAIL  ' + name + '\n' + (e.stack || e)); process.exitCode = 1; } };

test('the limits really are above what the game allows (so real play cannot hit them)', () => {
  assert.ok(LIMITS.speed >= DRIVE.forward * RULES.sprintBoost, 'speed limit below the hider\'s sprint');
  assert.ok(LIMITS.shotNear > DRIVE.forward * 0.5, 'shot distance limit too tight for a moving hunter');
});

// ---- real play ----
test('driving flat out for 20 s, 20 updates a second, passes through the step limiter unchanged', () => {
  let real = { x: 0, z: 0 }, seen = { x: 0, z: 0 }; const lim = createStepLimiter(); lim.reset(0);
  for (let i = 0; i < 400; i++) {
    real = { x: real.x + DRIVE.forward * RULES.sprintBoost * 0.05, z: real.z + 1 * 0.05 };   // even at sprint speed
    seen = lim.step(seen, real, (i + 1) * 0.05);
    assert.deepEqual(seen, real, 'a real move was altered at step ' + i);
  }
});
test('real driving with network stalls and bursts is never altered (the step limiter)', () => {
  let seed = 7; const rnd = () => (seed = (seed * 1664525 + 1013904223) >>> 0) / 4294967296;
  let real = { x: 0, z: 0 }, seen = { x: 0, z: 0 }, clock = 0, lastArrive = 0;
  const arrivals = [];
  for (let i = 0; i < 2000; i++) {   // the sender moves at sprint speed and sends every 50 ms; the network delays messages unevenly but keeps their order
    real = { x: real.x + 15 * 0.05 * Math.cos(i / 50), z: real.z + 15 * 0.05 * Math.sin(i / 50) };
    clock += 0.05;
    const delay = rnd() < 0.02 ? 1 + rnd() * 2 : rnd() * 0.15;   // sometimes a 1-3 s stall
    const arrive = Math.max(lastArrive, clock + delay); lastArrive = arrive;
    arrivals.push({ pos: real, arrive });
  }
  const lim = createStepLimiter(); lim.reset(0);
  for (const a of arrivals) { const out = lim.step(seen, a.pos, a.arrive); assert.deepEqual(out, a.pos, 'a real move was altered'); seen = out; }
});
test('real shooting: a shot every 1.5 s from the hunter\'s tank, with the clocks 0.4 s apart, is allowed', () => {
  for (const skew of [-0.4, 0, 0.4]) {
    const gate = createShotGate(RULES);
    let ok = 0;
    for (let e = RULES.headStart; e < RULES.round; e += RULES.reload) if (gate.allow({ mid: 1, r: 1, e, x: 5, z: 5 }, e + skew + 0.1, { x: 6, z: 5 })) ok++;
    assert.equal(ok, Math.ceil((RULES.round - RULES.headStart) / RULES.reload), 'a real shot was refused with skew ' + skew);
  }
});
test('the first shot right as the head start ends is allowed', () => {
  assert.equal(createShotGate(RULES).allow({ mid: 1, r: 1, e: RULES.headStart, x: 0, z: 0 }, RULES.headStart - 0.2, null), true);
});
test('a new round starts the gun fresh (round 2 may shoot at 20 s again)', () => {
  const g = createShotGate(RULES);
  assert.equal(g.allow({ mid: 1, r: 1, e: 170, x: 0, z: 0 }, 170.1, null), true);
  assert.equal(g.allow({ mid: 1, r: 2, e: 20, x: 0, z: 0 }, 20.1, null), true);
});
test('the step limiter copes with odd clocks (it never throws or returns non-numbers)', () => {
  for (const now of [0, -1, NaN, Infinity, 1e9, undefined]) { const lim = createStepLimiter(); lim.reset(0); const o = lim.step({ x: 0, z: 0 }, { x: 1, z: 1 }, now); assert.ok(Number.isFinite(o.x) && Number.isFinite(o.z), 'now=' + now); }
});

// ---- cheats ----
test('a teleport becomes a fast drive: the tank only gets as far as it could have driven', () => {
  const lim = createStepLimiter(); lim.reset(0);
  const out = lim.step({ x: 0, z: 0 }, { x: 1000, z: 0 }, 0.05);
  assert.ok(out.x > 0 && out.x <= LIMITS.credit + LIMITS.speed * 0.05 + 1e-9, 'moved ' + out.x);
  assert.equal(out.z, 0);
  let seen = { x: 0, z: 0 }; const l2 = createStepLimiter(); l2.reset(0);
  for (let i = 1; i <= 20; i++) seen = l2.step(seen, { x: 1000, z: 0 }, i * 0.05);   // keeps asking for 1000 m; one second later it has gone at most credit + 1 s of driving
  assert.ok(seen.x <= LIMITS.credit + LIMITS.speed * 1 + 1e-9, 'went ' + seen.x + ' m in a second');
});
test('spamming many messages in a short time gives no extra room (the allowance comes from time only)', () => {
  const lim = createStepLimiter(); lim.reset(0); let seen = { x: 0, z: 0 };
  for (let i = 0; i < 5000; i++) seen = lim.step(seen, { x: 1e6, z: 0 }, 0.001 * i);   // 5000 messages in 5 s
  assert.ok(seen.x <= LIMITS.credit + LIMITS.speed * 5 + 1e-6, 'went ' + seen.x + ' m in 5 s');
});
test('a long quiet spell saves up at most `credit` metres (no saving up for a huge dash)', () => {
  const lim = createStepLimiter(); lim.reset(0);
  const out = lim.step({ x: 0, z: 0 }, { x: 1000, z: 0 }, 3600);   // an hour of quiet, then a jump
  assert.ok(out.x <= LIMITS.credit + 1e-9, 'dashed ' + out.x + ' m');
});
test('the camera must be near its tank', () => {
  assert.equal(cameraOk({ x: 0, z: 0 }, { x: 8, z: 0 }), true);
  assert.equal(cameraOk({ x: 0, z: 0 }, { x: 50, z: 0 }), false);
  assert.equal(cameraOk({ x: 0, z: 0 }, { x: NaN, z: 0 }), false);
  assert.equal(cameraOk({ x: 0, z: 0 }, undefined), false);
});
test('rapid fire is refused (shots closer together than the reload time allows)', () => {
  const g = createShotGate(RULES); let ok = 0;
  for (let i = 0; i < 100; i++) if (g.allow({ mid: 1, r: 1, e: 30 + i * 0.05, x: 0, z: 0 }, 35, null)) ok++;
  assert.ok(ok <= 4, 'let through ' + ok + ' of 100 rapid shots');
});
test('a burst of shots with made-up times (spaced like real ones, but all sent at once) lets only a few through', () => {
  const g = createShotGate(RULES); let ok = 0;
  for (let i = 0; i < 200; i++) if (g.allow({ mid: 1, r: 1, e: 30 + (i - 100) * RULES.reload, x: 0, z: 0 }, 30.2, null)) ok++;
  assert.ok(ok <= 4, 'let through ' + ok + ' of 200');
});
test('shots in the head start are refused', () => {
  const g = createShotGate(RULES);
  assert.equal(g.allow({ mid: 1, r: 1, e: 5, x: 0, z: 0 }, 5.1, null), false);
  assert.equal(g.allow({ mid: 1, r: 1, e: 25, x: 0, z: 0 }, 5.1, null), false, 'the phone\'s own clock says it is still the head start');
});
test('shots from the future, or long ago, are refused', () => {
  const g = createShotGate(RULES);
  assert.equal(g.allow({ mid: 1, r: 1, e: 90, x: 0, z: 0 }, 60, null), false);
  assert.equal(g.allow({ mid: 1, r: 1, e: 30, x: 0, z: 0 }, 60, null), false);
});
test('a shot that starts far from where the hunter\'s tank was seen is refused (no shooting from anywhere on the map)', () => {
  const g = createShotGate(RULES);
  assert.equal(g.allow({ mid: 1, r: 1, e: 40, x: 60, z: 40 }, 40.1, { x: 0, z: 0 }), false);
  assert.equal(g.allow({ mid: 1, r: 1, e: 42, x: 3, z: 2 }, 42.1, { x: 0, z: 0 }), true);
});
test('a non-number clock is refused', () => { assert.equal(createShotGate(RULES).allow({ mid: 1, r: 1, e: 40, x: 0, z: 0 }, undefined, null), false); });

console.log(`\n${passed} tests passed` + (process.exitCode ? ', SOME FAILED' : ''));
