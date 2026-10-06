# Security fix log: Tank Battle

Written for the person (or the "master" Claude Code session) who will review and push these changes.
Everything here is on branch **`claude/admiring-johnson-pbx8xn`**, on top of commit **`cad78e3`** (the `r4-4` build).
No pull request has been opened. Nothing was merged into `main`.

---

## 0. At a glance

| | |
|---|---|
| What was done | A security review of the whole game, then fixes in 5 stages (+1 self-review fix). |
| Commits | 6 code commits + this log (list in section 8). Range to take: `cad78e3..HEAD`. |
| Files | 14 game files touched (11 changed + 3 new modules), 8 new test files. +439 / -59 lines of game code (tests not counted). |
| Tests | 4 node test files (**48 checks**), 2 real-browser test files (**29 checks**), a CSP check, plus a boot test. All pass on the final commit. |
| Game design | Unchanged. Same rules, same screens. One visible change: a player who joins by typing only the 4-letter code now needs the host to tap "Let in" (section 4, decision A). |
| Biggest risk of these changes | The new Content-Security-Policy (section 1, items 1 and 2). It could only be tested in desktop Chromium. |

### How to bring this into `main`
1. `git fetch origin claude/admiring-johnson-pbx8xn` and review the diff `cad78e3..origin/claude/admiring-johnson-pbx8xn`.
2. If the branch was NOT pushed (check with `git ls-remote origin claude/admiring-johnson-pbx8xn`), the commits are in the session that made them. Ask that session to push the branch; the commits are listed in section 8.
3. Run the checks in section 6, do the device test in section 1, then merge (a pull request is the normal way).

---

## 1. READ THIS BEFORE DEPLOYING

1. **Every time the import map in `index.html` changes (every version bump, every new module), run `node tests/check-csp.mjs --fix`.**
   The Content-Security-Policy allows the inline import map by its hash. If the hash is stale, the browser refuses the import map and the page stays **blank**.
   `node tests/check-csp.mjs` (without `--fix`) only checks and exits with code 1 when stale. Put it in whatever script does the version bump.
   *Rollback in one step:* delete the `<meta http-equiv="Content-Security-Policy" ...>` line near the top of `index.html`. Nothing else depends on it.
2. **Test on a real iPhone (Safari) and a real Android phone before releasing.** I could only test in desktop Chromium (headless, software rendering).
   Specifically check: the page loads (the import-map hash is honoured), the start screen shows, two phones can join and play, the invite link works.
   The CSP also allows `https://0.peerjs.com` and `wss://0.peerjs.com` (the PeerJS broker). I could not reach that broker from the sandbox, so **a real two-phone game over the real internet has not been run on this code.** Do one.
3. **New modules must be in the version bump.** `js/guard.js`, `js/limits.js`, `js/debug.js` are in the import map with the same `?v=r4-4` tag as every other module. If your bump script rewrites `?v=r4-4` by pattern it handles them; if it has a fixed file list, add these three.
4. **Your private test tools** (`tools/`, git-ignored, not in this repo) that use `window.__tb`, `window.__tbLink`, `window.__hints` or `window.__say`:
   they still work when the page is opened from `localhost`, `127.0.0.1`, a file, or with `?debug` in the address. They do NOT exist on the real site any more (section 3, stage 4).
5. **The secret love/hate modes were not touched** (I do not have the phrase or the messages). See section 5.

---

## 2. What was wrong and what happened to it

Numbers match my review report ("find hacks and security breach loopholes").

| # | Finding | Severity | Fixed in | Status |
|---|---|---|---|---|
| 1 | Room creator could run script in the joiner's page: the match score from the host went into `innerHTML` unchecked, no CSP | High | sec-1 | **Fixed** (3 layers) |
| 2 | An opponent could freeze your tab with absurd coordinates; shots and positions unchecked; no cap on bullets or messages | High | sec-1, sec-2 | **Fixed** |
| 3 | Room access: first player to knock got the seat; 4-letter code guessable; token stored unchecked; unlimited idle connections | High | sec-3, sec-3b | **Fixed** (design choice A) |
| 4 | Cheating by design (rapid fire, shooting in the head start, shooting from anywhere, teleporting pose used to find the hider) | Medium | sec-4 | **Reduced** (cannot be fully fixed without a server) |
| 5 | A hostile host could crash a guest with odd values (`constructor` as a weather name, etc.) or skew its clock | Medium | sec-1, sec-2 | **Fixed** |
| 6 | Debug log kept peer-controlled strings of any length | Medium | sec-2 | **Fixed** |
| 7 | Guest can push text onto the host's screen via the theme message | Low | sec-1 (partly) | **Reduced** (control characters stripped; plain text still possible) |
| 8 | Secret-mode ciphertext is public (offline guessing of the phrase) | Low | n/a | **Not changed** (section 5) |
| 9 | WebRTC shows each player's IP to the other; public broker/STUN see room codes | Low | n/a | **Not changed** (section 5) |
| 10 | Hardening: debug globals in production, clickjacking, stored room record trusted | Low | sec-4, sec-5 | **Fixed** |

Honest note on finding 1: I found it by reading the code (`main.js` built HTML from a peer-supplied value). I did **not** write or run an attack against it. The fix is verified the other way round: tests show hostile values are refused by the validator and the page still loads under the new CSP.
Finding 2 *was* proven on the old code: the old `world.js` never finishes on an absurd coordinate (killed by a 6-second timeout), the new one returns at once (section 3, stage 2).

---

## 3. Stage by stage: what, why, where

Line numbers are for the final commit.

### Stage 1: nothing from the other phone is believed until it is rebuilt (commit `dca47a3`)

**Why.** The other phone, including the room creator who acts as referee, can be a modified page. Every message and the referee's whole "match" object was used as sent. One field reached `innerHTML`.

**What and where.**
- **NEW `js/guard.js`**: the one place where peer data is checked.
  - `cleanMessage()` (line 152): every message type the game uses has a fixed list of fields, fixed number ranges and fixed text lengths. The result is a brand-new object, so extra fields and odd keys such as `__proto__` never get through. Unknown message types are dropped.
  - `cleanMatch()` (line 89): rebuilds the referee's match: phase, round, score, result, ping, weather, leader numbers, log, badges, theme, etc. Anything that does not fit means the whole message is ignored.
  - `cleanTheme()` (line 45): moved here from `rules.js`; now also strips control characters and text-direction overrides.
  - It takes the `RULES` object as a parameter, so it imports nothing from `rules.js` (no import cycle).
- **`js/main.js` `onRemote()` (line 227)**: every inbound message goes through `cleanMessage` first.
- **`js/main.js` line 722**: the match-over score now uses `${m.score[me] | 0}` so only a number can reach `innerHTML` (the old bug). This is a second layer in case validation is ever bypassed.
- **`js/rules.js`**: the guest rebuilds the referee's match with `cleanMatch` (line 415); the match saved in the browser is checked the same way on restart (line 448); `cleanTheme` is re-exported (line 106) so nothing else had to change.
- **`js/icons.js` (lines 62, 69), `js/arena.js` (line 176), `js/main.js` (lines 71, 619)**: `Object.hasOwn(...)` instead of `name in table`. The `in` operator also accepts inherited names such as `"constructor"`, which made `icon()` throw.
- **`index.html` line 8: Content-Security-Policy `<meta>`.** Only the site's own scripts run, plus the inline import map (by hash). Inline event handlers and injected script cannot run. Inline styles stay allowed because the game sets style attributes. Network is limited to the site and the PeerJS broker. **NEW `tests/check-csp.mjs`** keeps the hash honest (see section 1).

**Verified.** `tests/guard.test.mjs`: a whole real match (all phases, 3 rounds, surrender, duck round, theme) driven through the real `createRules` passes `cleanMatch` **unchanged** (so a legitimate game cannot be broken); every message type the game sends passes unchanged; hostile scores such as `"<img src=x onerror=...>"`, `Infinity`, objects, unknown weathers, huge numbers, odd keys are refused or neutralised. Page boots and a solo game starts under the CSP with no violations; identical to the pre-change boot.

### Stage 2: no absurd number can hang the game; limits on bullets and message volume (commit `dabd3ac`)

**Why.** `pushOutOfWalls` loops over map cells computed from a position. With a huge coordinate the loop counter stops changing and the loop never ends, which freezes the tab. Bullets and messages had no ceiling.

**What and where.**
- **`js/world.js`**: `pushOutOfWalls` (line 54) refuses non-finite input and limits the cells it visits to the grid plus a 12-cell border (`PAD`, line 52). `rayToWall` (line 91) refuses non-finite input and has a step cap (line 104).
- **`js/shots.js`**: at most 64 bullets in the air (`MAX_LIVE`, line 16; check at line 57). A real hunter has about 4.
- **`js/net.js`**: each connection may send at most 150 messages a second (`MAX_PER_SEC`, line 27; `overBudget`, line 149); a stranger who goes over is hung up on, the real guest's budget is separate. Text from the peer in the debug trace is cut to 16 characters.
- **`js/lobby.js` line 125**: a message that throws is logged and ignored; it can no longer break the link or the game loop.
- **`js/rules.js` line 398**: the clock offset from `pong` replies stays between 0 and 0.3 s (it could go negative).

**Verified.**
- `tests/world.test.mjs`: hostile coordinates finish quickly (child process with a time limit). **The same input on the old `world.js` was killed by the 6-second timeout (infinite loop).**
- I compared old and new `pushOutOfWalls` / `rayToWall` on **400,000 random cases** inside the yard and up to 8 m beyond its walls (the most the validator lets through): **0 differences**, so normal driving is unchanged. (My first, narrower clamp did change results outside the walls; the regression check caught it and I widened the border to 12 cells.)
- Firing 5,000 shots in a real browser leaves exactly 64 live bullets; firing works again after clearing.

### Stage 3: the second seat is no longer first-come (commits `1f91105`, then fix-ups in `a6ca2df`)

**Why.** The host gave the guest seat to the first `hello` that arrived. Room codes are 4 letters (331,776 possibilities), the broker tells you whether a code exists, and codes get shared in chats. So a stranger could take your friend's seat. The player token was also stored without checking its type, and the host kept every idle connection forever.

**What and where.**
- **`js/net.js`**
  - A new player needs **either the room key** (random, 96 bits, carried only in the invite link after `#`) **or the host's tap on "Let in"** (`createLink`, line 39; key check line 171; `ask`/`answer`/`seat`, lines 122-145).
  - A player who already holds the seat (same token) comes straight back in (refresh, reconnect).
  - A wrong key is refused at once. A token must look like `[0-9a-z]{3,40}` (`TOKEN`, line 23). One question at a time. An unanswered question counts as "no" after 40 s.
  - Connections that do not say hello within 10 s are closed; at most 4 silent connections are held (`peer.on('connection')`, line 202). When full, the **oldest** silent one is dropped so a flood can never keep a real player out.
  - The guest waits patiently while the host is asked (line 183).
- **`js/lobby.js`**: invite link is now `#join=CODE.key` (`inviteLink`, line 174; `keyFromLink`, line 176). The key is read **before** the address bar is cleaned (line 203 on). A typed code carries no key (line 251). Host and guest keep the key in their saved room so a refresh works (lines 275, 286). Host sees the question through `request()` (line 115) and `askDone()` (line 160); guest message "did not let you in" (line 135).
- **`index.html`**: "Let in" / "Not now" buttons (`#join-ask`, line 666) and a little spacing (line 273).

**Self-review fixes (`a6ca2df`).** Reading my own diff I found two real flaws, both fixed with tests:
1. If a key-holder took the seat while a code-only player was still waiting for the host's answer, tapping "Let in" afterwards would have swapped the waiting stranger into the seat and thrown the real player out. Now the waiting player is told the room is full and the question disappears; `allow()` also checks the seat is still free.
2. Rejecting the *newest* connection when 4 silent ones are open would let an attacker hold the slots. Now the oldest silent connection is dropped instead.

**Verified.**
- `tests/net.test.mjs` (15 checks, real `net.js` against an in-memory PeerJS stand-in): key join without a question; code-only asks the host; allow/deny; timeout counts as "no"; wrong key refused; full room; same player returns; 10 kinds of bad token refused; silent-connection limits; flooding stranger hung up on while the real guest is unaffected; ordinary traffic (60 messages/s) never throttled; one question at a time; player leaves while asked; version mismatch; the two flaws above.
- `tests/e2e-join.cjs` (18 checks, **two real browser phones through the real lobby screens**): link has the key; key join needs no tap; typed code shows the question; "Let in" works; "Not now" tells the guest; refresh of the guest and of the host both rejoin without a question. I looked at a screenshot of the host's question; it matches the existing style.

### Stage 4: believe only what is possible about the other tank (commit `9ec9160`)

**Why.** Each phone is the authority on its own tank (a P2P game with no server). The hider's phone accepted any shot message: no reload check, no head-start check, any starting point. The hider decides whether to show itself based on the hunter's *reported* position and camera, so false positions could be used to find it.

**What and where.**
- **NEW `js/limits.js`** (pure functions, no game state)
  - `createShotGate` (line 48): a shot is refused if it is in the head start, from the future or more than 3 s old, closer to the last shot than the reload allows, or starts more than 10 m from where the hunter's tank was last seen.
  - `createStepLimiter` (line 21): the other tank's movement is judged by a **time-based allowance** (16 m/s x elapsed time, saved up to 48 m for network stalls). A made-up jump becomes a fast drive, never a teleport, and sending many messages gives no extra room.
  - `cameraOk` (line 41): the hunter's camera must be within 12 m of its tank.
  - All numbers are above anything the real game does (forward 9 m/s, sprint 15.75 m/s, camera at most 10 m back).
- **`js/main.js` `onRemote()` (lines 227-245)** uses them; shots are dropped unless this phone is the hider (`shotGate`, `stepper`, line 246).
- **`js/guard.js`**: the speed field of a position message is limited to 20 m/s.
- **NEW `js/debug.js`**: `window.__tb`, `__tbLink`, `__hints`, `__say` now exist only on localhost / file / `?debug` (`main.js` line 1102, `lobby.js` line 390, `hints.js` line 97, `say.js` line 89).
- **`index.html`**: the three new modules are in the import map; CSP hash updated; `check-csp.mjs` gained `--fix`.

**Verified.**
- `tests/limits.test.mjs` (17 checks). The important half is "real play is never touched": 20 s of flat-out sprinting, and 2,000 positions with random 1-3 s network stalls and bursts, pass through the limiter **unchanged**; real shots every 1.5 s with the two clocks 0.4 s apart are all allowed. The other half: teleports, spam, rapid fire, bursts of made-up times, shots in the head start, shots from far away, bad clocks are refused.
- The test caught a flaw in my first design (a per-message allowance let 20 quick messages cover 76 m). I replaced it with the time-based allowance above.
- `tests/e2e-play.cjs` (11 checks, **two real phones play a real match** through the leader pick, coin toss and head start): 10 fake shots during the head start produce **0** bullets on the hider's phone; a real shot from the hunter appears; 60 rapid-fire shots produce at most 3; both clocks stay in sync.
  **The same test on the code from before this stage fails: 10 of 10 head-start shots and 60 of 60 flood shots became bullets.** So the test genuinely detects the problem.
- Hooks checked in a browser: absent on `http://127.0.0.2`, present with `?debug` and on `127.0.0.1`.

### Stage 5: stored room record checked, clickjacking (commit `e9d7bb0`)

- **`js/guard.js` `cleanRoom()` (line 54)** checks the room record the lobby keeps in `sessionStorage` / `localStorage` (code, tokens, key, phase, position, saved match) before a refresh rejoins from it. **`js/lobby.js` `recall()` (line 27)** uses it. Anything that can write to the page's storage can no longer steer the game.
- **`js/main.js` line 43**: the game refuses to run inside another page (an invisible frame over someone else's buttons). The site cannot send `X-Frame-Options` (static hosting), so the page does it itself. Not active on localhost / file / `?debug` so test setups using frames keep working.
- **Verified** in a real browser: inside a frame from another address the game hides itself and does not start; at top level the same address runs normally; refresh-rejoin still works for both players.

---

## 4. Decisions I made for you (change them if you disagree)

**A. Keep 4-letter codes; add the room key + host approval (stage 3).**
Alternatives: (1) longer codes, e.g. 8 letters: simplest and secure, but harder to say aloud; (2) only cheap hardening (token checks, timeouts) and accept that a stranger with the code can take the seat.
*Why A:* the invite link (the main way people join) stays one tap with no extra step; only typed-code joining gets one tap from the host, who is already looking at the waiting screen.
*Where to change:* `js/net.js` lines 165-173 (`hello` handling) and `js/lobby.js` `request()`.

**B. Content-Security-Policy with a hash for the inline import map (stage 1).** It protects against any future injection bug, but it needs the maintenance step in section 1. Alternative: skip the CSP (delete one line); the injection bug itself is fixed either way.

**C. Cheat limits are generous on purpose (stage 4).** Every number is well above real play (section 3). Tighter numbers would catch more cheating but risk throttling a slow network. They are in `LIMITS` at the top of `js/limits.js`.

**D. Test hooks stay available on localhost and with `?debug` (stage 4)**, so your own tests keep working. `?debug` is not a secret; it only stops them being there by accident.

---

## 5. NOT fixed, and why

1. **The hider's phone decides its own hits and whether to show itself.** A modified hider client can be invulnerable or invisible. With no server there is no neutral judge; the stage 4 limits only stop the hunter's side of it. Real fix = a server (or a trusted referee).
2. **The room creator is the referee** and decides scores and results. The guest cannot check them. The stage 1 validator only guarantees they have a sane shape.
3. **Theme text from the guest** (`th` message, up to 4 x 240 plain characters) can still be shown on the host's screen. It is text only (no script), control characters are stripped. A real fix needs integrity data from your private generator for the secret modes.
4. **Secret love/hate modes** (`js/secret.js`): the encrypted blobs are public in the repo, so anyone can try phrases offline (PBKDF2 600,000 rounds slows them, but the phrase is lowercased and stripped to letters and digits, so a short or guessable phrase falls). The repo history is clean (the plain messages and `PROJECT.md` / `tools/` were never committed; `secret.js` appears in one commit, ciphertext only). **Use a long passphrase (5 or more random words) and regenerate with your private script if the current one is guessable. Old blobs stay in git history, so treat an old guessable phrase as exposed.** I cannot do this: I do not have the phrase or the messages.
5. **Privacy:** the other player always sees your IP address (WebRTC). The public PeerJS broker and Google's STUN server see room codes and IPs. The broker also relays the key exchange, so a malicious broker could intercept it. Option: self-host the PeerJS broker.
6. **Impersonating the host** during its refresh: someone who knows the code could register the free room ID for a moment. After stage 1 such an impostor cannot run script in the guest, and link joiners could be protected further with a key proof in `welcome`. I did not add it (small gain, more protocol). Typed-code joiners cannot verify the host.
7. **Vendored libraries:** three.js is r186 (current). The PeerJS build in `lib/peerjs.min.js` has no version string in it; please check it against the release you downloaded it from and update if old.
8. **Not tested:** real iPhone/Android, the real PeerJS broker over the internet (see section 1).

---

## 6. Tests and how to run them

Needs Node 22+ (no install). Run from the repo root.

| Command | What it proves | Checks |
|---|---|---|
| `node tests/guard.test.mjs` | Validator accepts every real match/message, refuses hostile ones; room record check | 13 |
| `node tests/world.test.mjs` | Absurd coordinates cannot hang the game (child process with time limit) | 3 |
| `node tests/limits.test.mjs` | Real driving/shooting never throttled; cheats refused | 17 |
| `node tests/net.test.mjs` | Join rules, limits and timeouts of the real `net.js` (in-memory PeerJS) | 15 |
| `node tests/check-csp.mjs [--fix]` | The CSP matches the import map | 1 |
| `node tests/e2e-join.cjs <url>` | Real lobby on two real browser phones: key, approval, refresh, framing | 18 |
| `node tests/e2e-play.cjs <url>` | A real match on two real phones; cheat shots refused, real shot works | 11 |

The two `e2e-*.cjs` tests need Playwright with Chromium (set `GLOBAL_NM` to the folder holding the `playwright` package if it is not found) and a local server, e.g. `npx http-server -p 8765 -s -c-1 .` then `node tests/e2e-join.cjs http://127.0.0.1:8765/index.html`. They use a stand-in for the PeerJS broker (`tests/browser-harness.cjs`) so no internet is needed. `e2e-play` takes about 1.5 minutes. Software rendering is slow, so allow time.

Other checks done by hand during the work (not kept as files): boot of the page and a solo game under the CSP with no violations; old-vs-new geometry comparison on 400,000 cases (0 differences); the same match test against the pre-stage-4 code (fails as it should); test hooks absent/present by address.

---

## 7. File inventory

**New game modules:** `js/guard.js` (validator), `js/limits.js` (shot gate, step limiter, camera check), `js/debug.js` (testing flag).

**Changed game files:**

| File | Change |
|---|---|
| `index.html` | CSP meta (line 8); 3 modules in import map (lines 914, 917, 923); host "Let in" buttons (line 666) and style (line 273) |
| `js/main.js` | `onRemote` cleaning + shot gate + movement limit (227-245); `innerHTML` score fix (722); `hasOwn` (71, 619); frame-buster (43); test hook gate (1102) |
| `js/rules.js` | uses `cleanMatch` for guest and saved match (415, 448); re-exports `cleanTheme` (106); pong clamp (398) |
| `js/net.js` | room key, host approval, token check, stranger limits, message budget, trace clipping |
| `js/lobby.js` | invite link with key, "Let in" UI, key kept for rejoin, `cleanRoom` on storage, error containment, hook gate |
| `js/world.js` | bounded loops and non-finite guards (52-104) |
| `js/shots.js` | 64-bullet cap (16, 57) |
| `js/icons.js`, `js/arena.js` | `Object.hasOwn` |
| `js/hints.js`, `js/say.js` | test hooks gated by `TESTING` |

**New test files:** `tests/guard.test.mjs`, `tests/world.test.mjs`, `tests/limits.test.mjs`, `tests/net.test.mjs`, `tests/check-csp.mjs`, `tests/browser-harness.cjs`, `tests/e2e-join.cjs`, `tests/e2e-play.cjs`.

**Not touched:** all assets (`models/`, `audio/`, `fonts/`, `icons/`), `lib/` (vendored three.js and PeerJS), `js/secret.js`, `js/theme.js`, game rules and design.

---

## 8. Commits (oldest first; base is `cad78e3`)

| Commit | Stage | Summary |
|---|---|---|
| `dca47a3` | sec-1 | peer-data validator, innerHTML hole closed, CSP, `hasOwn` |
| `dabd3ac` | sec-2 | bounded geometry loops, bullet cap, message budget, contained errors |
| `1f91105` | sec-3 | room key in invite link, host approval, token and stranger limits |
| `9ec9160` | sec-4 | shot gate, movement and camera limits, test hooks off the real site |
| `a6ca2df` | sec-3b | self-review fixes (seat swap, slot hogging) |
| `e9d7bb0` | sec-5 | stored room record check, frame-buster, extra browser tests |
| (this commit) | docs | this log |

To take everything: `git cherry-pick cad78e3..HEAD` onto the target branch, or merge the branch.

---

## 9. Environment used for verification

Node 22.22; Chromium 1194 (headless, software GL) driven by Playwright; static server `http-server`. The PeerJS broker was replaced by an in-memory stand-in (node tests) or a message router between pages (browser tests), because the sandbox blocks the real broker. Nothing was deployed, and no external system was touched (the only files outside the repository were scratch files in the session's temporary folder).
