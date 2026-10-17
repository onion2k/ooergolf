# Ooergolf up the guardrails kit's checks

The survey of 17 October 2026, at commit 62bb0d0 with the kit v0.5.0 installed (uncommitted), and the order the
missing checks are to be added in. A box is ticked as its part lands with the check that proves it seen failing, as the
`guardrails` skill's phase 4 has it. Nothing here was timed: the machine's load average was 17 during the survey, so every
figure of cost below is an estimate and says so, except the quick check's, which is measured.

## Where it stands

| Check            | Now              | What is there, and what is not                                                                                                                                                                                                                                                                                                                                                                                                    |
| ---------------- | ---------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| quick check      | held, needs work | `.githooks/pre-commit` runs `check:quick`, git pointed at it by `prepare`. No secret scan in it. Under half a minute since box 1 (27 to 29 s, busy), the slow test files left to the full check; seen refusing four faults through `git commit`.                                                                                                                                                                                  |
| secrets          | held             | gitleaks over what is staged, in the hook, seen refusing a planted key; the history by hand (clean, 212 commits) until CI; GitHub's secret scanning and push protection on. The code reads no secret, so no `.env.example`.                                                                                                                                                                                                       |
| formatting       | held, needs work | Prettier 3, checked in `check:quick`, written by `npm run format`. `.prettierignore` leaves `test/saves/` and the generated files, and `.claude` (so the kit's skills), but not `guardrails/`. `.prettierrc.json`'s three settings have no reason beside them.                                                                                                                                                                    |
| lint             | held             | Type-aware rules, and the project's own: no `Math.random` or `console` in `src/`, a reason on every disable; each seen failing (box 3).                                                                                                                                                                                                                                                                                           |
| code scanning    | missing          | The repo is public, so CodeQL's default setup is free and needs no workflow; it is not on. Data from outside: the page's address (`?seed`, `?rung`, `?title`), the save in local storage.                                                                                                                                                                                                                                         |
| structure        | held             | ESLint's `no-restricted-imports`: the game without its picture or the renderer, artshape-physics through `physics.ts` alone, nothing importing the entries; `test/structure.test.ts`: nothing in a circle. Each seen failing (box 5).                                                                                                                                                                                             |
| dependencies     | held             | Lockfile committed, `npm ci` exact; audit (no advisories), licences and unused, each seen failing (box 4); Dependabot for security only, to be turned on in settings. The audit runs by hand until CI.                                                                                                                                                                                                                            |
| unit             | held             | 165 files, 2442 tests, seeded through `newGame(seed)`, with a 30 s timeout and its reason. The commits record mutation checks for new tests.                                                                                                                                                                                                                                                                                      |
| test API         | held, needs work | `window.game` in `src/debug.ts`, typed, with the smoke tests compiled against it, driving a real pointer. The smoke tests run against the dev server (`playwright.config.ts`'s `webServer` is `vite`), not the built game; only `perf` and `pwa` build `dist`.                                                                                                                                                                    |
| invariants       | held             | `checkInvariants` and the problems functions in `src/invariants.ts`, called by the fuzzer and by tests, each with tests that make it fire.                                                                                                                                                                                                                                                                                        |
| fuzzer           | held             | `scripts/fuzzer.ts`, seeded, replayed by `--seed`, counting what it reached (`checked`, `drawn`, `framed`) and failing a count of nothing.                                                                                                                                                                                                                                                                                        |
| determinism      | held             | `npm run determinism` and `test/determinism.test.ts`; `Game` can no longer be built without a seeded source (box 3).                                                                                                                                                                                                                                                                                                              |
| persisted shapes | held             | `test/saves/` and `test/saves.test.ts`, oldest first, with the last test failing a field the game writes that no file has.                                                                                                                                                                                                                                                                                                        |
| bounded          | held             | `scripts/leaks.ts`, ceilings and the steady judgement (`grew`), each tested in `test/leaks.test.ts`.                                                                                                                                                                                                                                                                                                                              |
| gates            | partly           | Budgets and baselines for perf, bench and pace. The pace and leaks judgements are unit-tested (`moved`, `grew`); the bench's and perf's judgements are written inline and are not. No record of the bench seen failing a physics made slower on purpose.                                                                                                                                                                          |
| look             | held             | `smoke/look.spec.ts` against `smoke/screens/`, and `look:metrics` floors. This GPU's pictures alone.                                                                                                                                                                                                                                                                                                                              |
| headers          | missing          | Netlify serves https://golf.ooer.com/ with `strict-transport-security` alone: no Content Security Policy, `frame-ancestors`, `X-Frame-Options`, `nosniff` or `Referrer-Policy`. No `public/_headers` or `netlify.toml`.                                                                                                                                                                                                           |
| verification     | partly           | A run of nothing fails (Vitest and Playwright both refuse an empty run; the fuzzer counts). The full check runs on this machine alone, and the smoke tests against the dev server.                                                                                                                                                                                                                                                |
| CI               | cannot apply yet | No workflows. It gains this check with its first.                                                                                                                                                                                                                                                                                                                                                                                 |
| landing          | partly           | Both hooks, git pointed at them by `prepare`; `main` is unprotected, so a change goes straight to it. The kit's `commit-msg` refuses this project's summaries (no full stop, some over 100 characters) until `/commit` or the hook gives way. Four branches merged and left (`claude/festive-dubinsky-4571bc` here; `ccr-7967f86a-owq4mh`, `ccr-8ad9fef3-ii7t91`, `ccr-9356eed0-d2lcns` on the remote), and no script lists them. |
| mutation         | held, by hand    | Recorded in the commits' bodies, as the kit asks; it is by hand everywhere.                                                                                                                                                                                                                                                                                                                                                       |

## Before any box

- [ ] The commit-message clash, the user's call: `/commit` ends its summary with a full stop and keeps it to 100
      characters, or the kit's `commit-msg` goes. Until then every `/commit` is refused by the hook.
- [ ] `guardrails/` in `.prettierignore` (the user's edit, by the installer's rule).

## The order

Each box is the check's smallest form in this project's tools, seen failing on the fault named beside it. The cost is
what it adds to the full check, an estimate in every case.

- [x] **1. The quick check under half a minute.** Done 17 October 2026. `check:quick` is `scripts/quick-check.sh`:
      prettier (cached by content), both type checks (incremental) and ESLint (four threads, no cache, since a type-aware
      answer can change with another file) side by side, then the quick unit tests. The 66 test files of two seconds or
      more, by their tests' time in one full run and by collect and tests alone for `tree-ground` and `lineofplay`, are
      `SLOW` in `vitest.config.ts`, run by `npm test` and by `npm run check` after the quick check, there on half the cores, since on all twelve five tests that time a course's making failed (66 files passed on six, in 115 s). Measured on a busy
      machine (Draw Things and another session's Chromium at work, load 4 to 7): the parts one after another 95 s (prettier
      5.1, types 3.9, lint 11.2, all 165 test files 74.7); the new check 27.1, 28.2 and 28.6 s warm, 36 s with no cache.
      To be timed again on a quiet machine. Seen failing through `git commit`, each refused with HEAD left at 62bb0d0: a
      file out of format (prettier named it), a type error (TS2322), `==` (eqeqeq) and a failing test (`FAIL |quick|`).
- [x] **2. Secrets.** Done 17 October 2026. `.githooks/pre-commit` runs
      `gitleaks git --pre-commit --redact --staged --verbose` before the quick check, and refuses the commit, saying how to
      install it, on a machine without gitleaks (seen: exit 1 with only `/usr/bin:/bin` on the PATH). Seen failing: a
      made-up AWS key of the scanner's shape (`AKIA` and sixteen of A to Z and 2 to 7), staged and refused in 0.4 s
      (`aws-access-token`, the file and line named, the key redacted, HEAD unmoved); a clean file staged, passed. The
      history scan, `gitleaks git`, in a throwaway clone: a key committed and deleted four commits back found, exit 1; the
      clone removed. The project's own history is clean. GitHub's secret scanning and push protection were already on. The
      history scan on every push is CI's, box 9. No `.env.example`, since the code reads no secret.
- [x] **3. Lint's own rules.** Done 17 October 2026. In `src/`: `no-restricted-properties` for `Math.random`, and
      `no-console`, the page's four lines that report a failure (`main.ts` twice, `install.ts`, `showcase.ts`) turned off on
      the line with their reasons. Everywhere: `house/directive-reason`, a local rule of a dozen lines in
      `eslint.config.js` in place of the eslint-comments plugin, so nothing was taken in. `Game`'s `random` is required (it
      fell back to `Math.random`); `main.ts` seeds it from `?seed=N` or `crypto.getRandomValues`, and four tests that built
      a game with no chance hand in `seeded(1)`. Seen failing on a planted file: `Math.random()`, `console.log`, a
      `eslint-disable-next-line` and a `/* eslint-disable */` with no reason, four errors; the same `Math.random()` in
      `scripts/` let through, so the rules reach `src/` alone.
- [x] **4. Dependencies.** Done 17 October 2026. The four advisories went first, each pin in a commit of its own:
      vitest ^3.2.7 to ^4.1.11 (tinypool's two critical, @vitest/mocker's moderate; not 5, which does not run on this
      machine's Node 23.4, and not 4.1.12, two days old; the lockfile written by npm 11.21.0 through npx, since npm 10.9.2
      crashed on vitest 4's optional peers), and source-map-js 1.2.1 to 1.2.2 in the lockfile (high). `npm audit` finds
      nothing. `npm run audit` and `npm run licences` are `scripts/deps-check.ts` over the judgements in `scripts/deps.ts`,
      which have six tests in `test/deps.test.ts`, each seen failing a fault put in it; the licences are a short script and
      not license-checker-rseidelsohn, whose version 5 asks for Node 24 and npm 11. `npm run unused` is knip 6.39.0 (taken
      in on purpose: ISC, kept by its author and released this month). `.github/dependabot.yml` stops version updates. Seen
      failing: `npm ci` on a lockfile behind package.json, "not in sync"; the lockfile from before source-map-js moved,
      audited, "fails: source-map-js, high"; a GPL package that ships, "copyleft: GPL-3.0"; `left-pad` listed and not
      imported, named by knip; the audit at `--registry http://127.0.0.1:9`, "no report", exit 1. Licences and unused are
      in `npm run check` (under a second); the audit needs the network and waits for CI (box 9). Left to the user: turning on
      Dependabot security updates in the repository's settings.
- [x] **5. Structure.** Done 17 October 2026, with no new dependency: dependency-cruiser 18 asks for Node 22, 24 or
      26, not this machine's 23.4, and core ESLint's `no-restricted-imports` holds what may import what, by file. In
      `eslint.config.js`: the game does not import the renderer nor the picture's modules (`PICTURE`: the page, `main`,
      `showcase`, `debug`, `hud`, `titlepage` and `install`, and what draws, `scene`, `ground`, `look`, `models` and the
      rest; `holemap`, which takes its colours from the models, joined it); only `physics.ts` imports artshape-physics;
      nothing imports `main.ts` or `showcase.ts`; a type alone is let through. Nothing in a circle is
      `test/structure.test.ts`, reading src with TypeScript's own parser and resolver. It found one, `arena.ts` and
      `zones.ts`, for the one constant `TILE`, which moved to `src/tile.ts`, re-exported by `arena.ts`. The game was found
      to reach nothing of the picture at any depth. Seen failing: `game.ts` importing `./scene`, the renderer and
      `./models/palette`, `arena.ts` importing artshape-physics and `scene.ts` importing `./main`, each named by its rule; a
      type of the renderer let through; the cycle put back, named "arena.ts -> zones.ts -> arena.ts". Every name in
      `PICTURE` is a file. In the quick check, at no cost to see.
- [ ] **6. Headers.** `public/_headers` for Netlify, with a CSP that lets the WebGPU page and its service worker run and
      allows no `'unsafe-inline'` script, `frame-ancestors 'none'`, `X-Frame-Options`, `nosniff` and a `Referrer-Policy`;
      and a test that reads them from a response. Vite's preview does not serve `_headers`, so the test reads the file
      the build copies into `dist` and a second reads the live site after a deploy. Proved by `'unsafe-inline'` added
      and `frame-ancestors` taken out. About 5 s.
- [ ] **7. The built game under test.** The smoke tests run against `dist` through Vite's preview, built first, as
      `perf` already does. Proved by a stale `dist` served and refused. 15 to 25 s for the build.
- [ ] **8. The gates' judgements.** The bench's and perf's comparisons moved out into functions with unit tests over and
      under their tolerance both ways; then the physics slowed on purpose past 20% and the bench seen to fail it. Under
      1 s.
- [ ] **9. CI.** A workflow on GitHub's runners for what needs no GPU: `npm ci`, `check:quick`, `gitleaks` over the whole
      history, the dependencies job, and `fuzz`, `determinism` and `pace:check`; `permissions: contents: read`, actions
      pinned as `ci.md` says. CodeQL's default setup turned on in the repository's settings (the user's to press). Smoke,
      look and perf need this machine's GPU and stay here, under _What is not held_. Proved by a branch made red and CI
      failing it, and by the planted shell and `innerHTML` faults of `code-scanning.md`. Nothing locally.
- [ ] **10. Landing.** A script that lists every branch whose commits are all on `main`; the four left now cleared, on the
      user's word. Proved by a branch merged and left, and listed.

## Proving what is there

Most of what is held was never recorded failing a fault put in on purpose. Each is proved once, as its check's _Seen
failing_ says, and the result written here:

- [ ] the fuzzer finds a planted bug (a stroke not counted), and its seed replays it
- [ ] determinism catches a `Math.random()` put into the game
- [ ] the save corpus fails with a field's default taken out
- [ ] leaks catches a cache that is never emptied, as still climbing under its ceiling
- [ ] the look fails on a palette colour moved a little
- [ ] an invariant newly added is seen found by the fuzzer with its bug put back
