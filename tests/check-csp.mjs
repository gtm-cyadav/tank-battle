// Checks that the Content-Security-Policy in index.html allows the inline import map (by its sha256 hash).
// Run after any edit to the import map (a version bump): `node tests/check-csp.mjs`. Exit code 1 = the hash is stale (the page would stay blank).
import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
const html = readFileSync(new URL('../index.html', import.meta.url), 'utf8');
const map = /<script type="importmap">([\s\S]*?)<\/script>/.exec(html);
const csp = /<meta http-equiv="Content-Security-Policy" content="([^"]*)"/.exec(html);
if (!map) { console.error('FAIL: no import map found in index.html'); process.exit(1); }
if (!csp) { console.error('FAIL: no Content-Security-Policy meta tag in index.html'); process.exit(1); }
const hash = 'sha256-' + createHash('sha256').update(map[1]).digest('base64');
if (!csp[1].includes(`'${hash}'`)) { console.error(`FAIL: the CSP does not contain the import map's hash. Put this in script-src:\n  '${hash}'`); process.exit(1); }
console.log('ok: the CSP allows the import map (' + hash + ')');
