// Checks that the Content-Security-Policy in index.html allows the inline import map (by its sha256 hash).
// RUN THIS AFTER ANY EDIT TO THE IMPORT MAP (every version bump, every new module):  node tests/check-csp.mjs --fix
//   without --fix it only checks (exit code 1 = the hash is stale: the browser would refuse the import map and the page would stay BLANK);
//   with --fix it rewrites the hash in index.html for you.
import { readFileSync, writeFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
const html = readFileSync(new URL('../index.html', import.meta.url), 'utf8');
const map = /<script type="importmap">([\s\S]*?)<\/script>/.exec(html);
const csp = /<meta http-equiv="Content-Security-Policy" content="([^"]*)"/.exec(html);
if (!map) { console.error('FAIL: no import map found in index.html'); process.exit(1); }
if (!csp) { console.error('FAIL: no Content-Security-Policy meta tag in index.html'); process.exit(1); }
const hash = 'sha256-' + createHash('sha256').update(map[1]).digest('base64');
if (!csp[1].includes(`'${hash}'`)) {
  if (process.argv.includes('--fix')) {
    const fixed = html.replace(/'sha256-[A-Za-z0-9+/=]+'/, `'${hash}'`);
    if (fixed === html) { console.error('FAIL: no sha256 entry in the CSP to replace; add  \'' + hash + '\'  to script-src by hand'); process.exit(1); }
    writeFileSync(new URL('../index.html', import.meta.url), fixed);
    console.log('fixed: the CSP now has the import map hash ' + hash); process.exit(0);
  }
  console.error(`FAIL: the CSP does not contain the import map's hash (the page would stay blank). Run:  node tests/check-csp.mjs --fix\n  or put this in script-src:  '${hash}'`);
  process.exit(1);
}
console.log('ok: the CSP allows the import map (' + hash + ')');
