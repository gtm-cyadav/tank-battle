// Checks that the Content-Security-Policy in index.html allows the inline import map (by its sha256 hash).
// RUN THIS AFTER ANY EDIT TO THE IMPORT MAP (every version bump, every new module):  node tests/check-csp.mjs --fix
//   without --fix it only checks (exit code 1 = the hash is stale: the browser would refuse the import map and the page would stay BLANK);
//   with --fix it rewrites the hash in index.html for you.
//   with --git it checks the copy git commits (`git show :index.html`: what is committed, or staged to be) instead of the file on disk; it never writes.
import { readFileSync, writeFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
const fromGit = process.argv.includes('--git');
if (fromGit && process.argv.includes('--fix')) { console.error('FAIL: --fix writes the file on disk; run it without --git, then git add index.html'); process.exit(1); }
const html = fromGit ? execFileSync('git', ['show', ':index.html'], { cwd: fileURLToPath(new URL('..', import.meta.url)), encoding: 'utf8' })
                     : readFileSync(new URL('../index.html', import.meta.url), 'utf8');
const where = fromGit ? 'the copy of index.html in git' : 'index.html';
const map = /<script type="importmap">([\s\S]*?)<\/script>/.exec(html);
const csp = /<meta http-equiv="Content-Security-Policy" content="([^"]*)"/.exec(html);
if (!map) { console.error('FAIL: no import map found in index.html'); process.exit(1); }
if (!csp) { console.error('FAIL: no Content-Security-Policy meta tag in index.html'); process.exit(1); }
// Hash the text the browser hashes: the HTML parser turns CR LF (and a lone CR) into LF before the CSP sees the script.
// A Windows checkout (core.autocrlf) has CR LF on disk while git and the live site have LF; hashing the raw bytes there
// gave a FAIL on a good file, and --fix wrote a hash the live page would refuse (blank page).
const hash = 'sha256-' + createHash('sha256').update(map[1].replace(/\r\n?/g, '\n')).digest('base64');
if (!csp[1].includes(`'${hash}'`)) {
  if (process.argv.includes('--fix')) {
    const fixed = html.replace(/'sha256-[A-Za-z0-9+/=]+'/, `'${hash}'`);
    if (fixed === html) { console.error('FAIL: no sha256 entry in the CSP to replace; add  \'' + hash + '\'  to script-src by hand'); process.exit(1); }
    writeFileSync(new URL('../index.html', import.meta.url), fixed);
    console.log('fixed: the CSP now has the import map hash ' + hash); process.exit(0);
  }
  console.error(`FAIL: the CSP in ${where} does not contain the import map's hash (the page would stay blank). Run:  node tests/check-csp.mjs --fix` + (fromGit ? ', then git add index.html' : '') + `\n  or put this in script-src:  '${hash}'`);
  process.exit(1);
}
console.log('ok: the CSP allows the import map (' + hash + ')' + (fromGit ? ' in ' + where : ''));
