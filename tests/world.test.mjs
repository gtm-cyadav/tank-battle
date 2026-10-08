// Tests for the geometry hardening in js/world.js (security Stage 2). Run: node tests/world.test.mjs
// The hostile cases run in a child process with a time limit: if the loops ever become unbounded again, the child is killed and the test FAILS (instead of hanging).
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { pushOutOfWalls, rayToWall, SPAWNS, WIDTH, DEPTH } from '../js/world.js';

let passed = 0;
const test = (name, fn) => { try { fn(); passed++; console.log('  ok  ' + name); } catch (e) { console.error('FAIL  ' + name + '\n' + (e.stack || e)); process.exitCode = 1; } };

test('pushOutOfWalls finishes quickly for absurd, huge and non-finite positions (child process, 8 s limit)', () => {
  const code = `
    import { pushOutOfWalls } from ${JSON.stringify(new URL('../js/world.js', import.meta.url).href)};
    const cases = [1e300, -1e300, 1e20, 1e16, 9007199254740993, Infinity, -Infinity, NaN, 3e15];
    for (const v of cases) for (const p of [{ x: v, z: 0 }, { x: 0, z: v }, { x: v, z: v }]) pushOutOfWalls(p, 2.5);
    console.log('done');`;
  const r = spawnSync(process.execPath, ['--input-type=module', '-e', code], { timeout: 8000, encoding: 'utf8' });
  assert.equal(r.error?.code, undefined, 'child did not finish in time (an unbounded loop is back): ' + r.error);
  assert.equal(r.status, 0, r.stderr);
  assert.match(r.stdout, /done/);
});
test('rayToWall: non-finite input gives 0 and never throws; a normal ray still works', () => {
  for (const v of [NaN, Infinity, -Infinity]) { assert.equal(rayToWall(v, 0, 1, 1), 0); assert.equal(rayToWall(0, 0, v, 1), 0); assert.equal(rayToWall(0, 0, 1, v), 0); }
  const s = SPAWNS[0], d = rayToWall(s.x, s.z, s.x, s.z + 400);
  assert.ok(Number.isFinite(d) && d > 0 && d < 400, 'a ray from a spawn spot must meet a wall: ' + d);
  assert.equal(rayToWall(1e300, 0, 1e300 + 1, 0), 0);   // far outside the yard: "inside a wall"
});
test('pushOutOfWalls leaves a tank at a spawn spot alone, and still pushes one out of a wall', () => {
  const p = { x: SPAWNS[0].x, z: SPAWNS[0].z };
  assert.equal(pushOutOfWalls(p, 2.5), false);
  const q = { x: -WIDTH / 2 + 0.5, z: 0 };   // half a metre inside the outer wall: must be pushed back
  assert.equal(pushOutOfWalls(q, 2.5), true);
  assert.ok(q.x >= -WIDTH / 2 + 2.5 - 1e-6 && Math.abs(q.z) < DEPTH);
});
console.log(`\n${passed} tests passed` + (process.exitCode ? ', SOME FAILED' : ''));
