# Ooergolf up the guardrails kit's checks

The survey of 17 October 2026, at commit 62bb0d0 with the kit v0.5.0 installed (uncommitted), and the order the
missing checks are to be added in. A box is ticked as its part lands with the check that proves it seen failing, as the
`guardrails` skill's phase 4 has it. Nothing here was timed: the machine's load average was 17 during the survey, so every
figure of cost below is an estimate and says so, except the quick check's, which is measured.

## Where it stands

| Check            | Now              | What is there, and what is not                                                                                                                                                                                                                                 |
| ---------------- | ---------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| quick check      | held, needs work | `.githooks/pre-commit` runs `check:quick`, git pointed at it by `prepare`. No secret scan in it. Under half a minute since box 1 (27 to 29 s, busy), the slow test files left to the full check; seen refusing four faults through `git commit`.               |
| secrets          | held             | gitleaks over what is staged, in the hook, seen refusing a planted key; the history by hand before a push (clean, 212 commits); GitHub's secret scanning and push protection on. The code reads no secret, so no `.env.example`.                               |
| formatting       | held, needs work | Prettier 3, checked in `check:quick`, written by `npm run format`. `.prettierignore` leaves `test/saves/` and the generated files, and `.claude` (so the kit's skills), but not `guardrails/`. `.prettierrc.json`'s three settings have no reason beside them. |
| lint             | held             | Type-aware rules, and the project's own: no `Math.random` or `console` in `src/`, a reason on every disable; each seen failing (box 3).                                                                                                                        |
| code scanning    | missing          | The repo is public, so CodeQL's default setup is free and needs no workflow; it is not on. Data from outside: the page's address (`?seed`, `?rung`, `?title`), the save in local storage.                                                                      |
| structure        | held             | ESLint's `no-restricted-imports`: the game without its picture or the renderer, artshape-physics through `physics.ts` alone, nothing importing the entries; `test/structure.test.ts`: nothing in a circle. Each seen failing (box 5).                          |
| dependencies     | held             | Lockfile committed, `npm ci` exact; audit (no advisories), licences and unused, each seen failing (box 4); Dependabot for security only, to be turned on in settings. The audit runs by hand before a push.                                                    |
| unit             | held             | 165 files, 2442 tests, seeded through `newGame(seed)`, with a 30 s timeout and its reason. The commits record mutation checks for new tests.                                                                                                                   |
| test API         | held             | `window.game` in `src/debug.ts`, typed; the smoke tests drive the built game through it with a real pointer (box 7).                                                                                                                                           |
| invariants       | held             | `checkInvariants` and the problems functions in `src/invariants.ts`, called by the fuzzer and by tests, each with tests that make it fire.                                                                                                                     |
| fuzzer           | held             | `scripts/fuzzer.ts`, seeded, replayed by `--seed`, counting what it reached (`checked`, `drawn`, `framed`) and failing a count of nothing.                                                                                                                     |
| determinism      | held             | `npm run determinism` and `test/determinism.test.ts`; `Game` can no longer be built without a seeded source (box 3).                                                                                                                                           |
| persisted shapes | held             | `test/saves/` and `test/saves.test.ts`, oldest first, with the last test failing a field the game writes that no file has.                                                                                                                                     |
| bounded          | held             | `scripts/leaks.ts`, ceilings and the steady judgement (`grew`), each tested in `test/leaks.test.ts`.                                                                                                                                                           |
| gates            | held             | Budgets and baselines for perf, bench and pace; every judgement unit-tested (`moved`, `grew`, `benchVerdict`, `movedFrom`) and the bench seen failing a slowed physics (box 8).                                                                                |
| look             | held             | `smoke/look.spec.ts` against `smoke/screens/`, and `look:metrics` floors. This GPU's pictures alone.                                                                                                                                                           |
| headers          | held             | `dist/_headers` written by the build; `smoke/headers.spec.ts` boots the built game under it; `npm run headers:live` reads the deployed page. Each seen failing (box 6).                                                                                        |
| verification     | partly           | A run of nothing fails; every smoke run tests a build of the code as it stands (box 7). On this machine alone, no CI by choice; frame costs that double now and then.                                                                                          |
| CI               | cannot apply     | No workflows, by the user's choice (18 October 2026): the checks run on this machine before a push (box 9).                                                                                                                                                    |
| landing          | held             | Both hooks, seen refusing; `npm run branches` lists anything merged and left, in check (box 10); `main` unprotected, so no required checks to hold.                                                                                                            |
| mutation         | held, by hand    | Recorded in the commits' bodies, as the kit asks; it is by hand everywhere.                                                                                                                                                                                    |

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
      history scan is run by hand before a push (box 9 dropped). No `.env.example`, since the code reads no secret.
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
      in `npm run check` (under a second); the audit needs the network and is run by hand before a push (box 9 dropped). Left to the user: turning on
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
- [x] **6. Headers.** Built 17 October 2026; seen on the live site once deployed. The policy is said once, in
      `scripts/headers.ts`, and the build writes it into `dist/_headers` (a plugin in `vite.config.ts`, as the service
      worker is): `default-src`, `script-src`, `connect-src`, `worker-src` and `manifest-src` `'self'`, `style-src 'self'`
      and the built page's one inline stylesheet by its hash (worked out each build), `img-src 'self' data:` for the
      stylesheet's three SVG masks, `object-src 'none'`, `base-uri 'self'`, `form-action 'none'` and `frame-ancestors 'none'`;
      with `X-Frame-Options: DENY`, `nosniff` and `Referrer-Policy: strict-origin-when-cross-origin`. HSTS is
      Netlify's. What the page loads was read first: one module script of its own, the one stylesheet, no WebAssembly, no
      evaluation, nothing from another origin, and the live page the build to the byte, nothing injected.
      `test/headers.test.ts` holds the judgement (five tests); `smoke/headers.spec.ts` serves the built game with the
      file's headers through Vite's preview and boots it under them, the title, a drive on The Links, the shop and the
      service worker, failing on any refusal the browser reports. Seen failing: `'unsafe-inline'` in `script-src` and
      `frame-ancestors` taken out, each "the page as served"; the build not writing the file, "ENOENT dist/_headers"; the
      stylesheet's hash and `data:` images taken out, "refused by the policy". `npm run headers:live` against
      https://golf.ooer.com/ before the deploy: "4 wrong", exit 1. About 7 s in the smoke run.
- [x] **7. The built game under test.** Done 17 October 2026. `playwright.config.ts` builds `dist` from the code as it
      stands at the start of every run and serves it with Vite's preview, so no run tests a stale build or the dev
      server's transforms; the models' showcase, a bench that never ships and is not in the build, keeps a dev server of
      its own ten ports up (5204 was another project's). `perf`, `pwa` and `headers` use the run's build, and
      `smoke/build.ts` went. Ordinary tests open the page with `?sw=0`, the worker being the app and headers tests'
      business. On the build: 420 of 430 passed, perf within its baseline (boot 318 to 267 ms); the ten were eight frame
      costs (see below), a grass frame cost and `phone-start-install`. That picture had failed by the same count on the
      dev server before PR #5: Chrome scales the strip's small maps differently until they are decoded, and the test
      waited for loaded, not painted; it now awaits each image's `decode()` and two frames, which moved `phone-start` and
      `phone-start-career` (written again and looked at) and holds all 26 start and phone pictures twice running. Seen
      failing: the fresh save's coins changed in `src/progress.ts` with no build by hand, and the run built and failed on
      `"coins":7`. Open, and the next thing to find: frame costs that double now and then on the same code (Home Waters'
      tee 9.67 ms once, then 4.62 to 4.97 five times, quiet), so the smoke run is not seen wholly green.
- [x] **8. The gates' judgements.** Done 18 October 2026. How the bench and perf judge a figure against its baseline
      is `scripts/gates.ts` (`benchVerdict`, `movedFrom`), which both now call, the tolerances staying beside their
      measured wobble in `bench.ts` and `smoke/perf.spec.ts`. `test/gates.test.ts` hands each figures over and under
      the tolerance both ways (eight tests): the bench's share and slack, a slower machine taken out by the reference,
      perf's share or slack whichever is more, quicker as much a change as slower, a figure not in the baseline. Each
      seen failing a fault put in it: the bench's slack ignored, its share ignored, perf counting only slower, perf's slack
      dropped. And the bench itself seen failing a physics made slower on purpose, a tenth of a millisecond spun before
      each world step: both scenarios "SLOWER" (+55936% and +1068%), exit 1; put back, it passes. As `AGENTS.md` says,
      the bench's 0.05 ms slack is above what its scenarios cost (0.001 and 0.03 ms), so it fails only a physics several
      times dearer.
- [-] **9. CI.** Dropped 18 October 2026 at the user's word: "Running the CI workflow on Github isn't needed. It can run
  locally before a push." No workflow, no CodeQL, and the checks a workflow would have run (the history's secret
  scan, the audit, the full check) are run here before a push, as `AGENTS.md` says under _What is not held_.
- [x] **10. Landing.** Done 18 October 2026. `npm run branches` (`scripts/branches.ts`, run by `branches-check.ts`)
      lists every local branch, branch on the remote and worktree whose commits are all on the default branch, which it
      reads from the remote's own HEAD and never takes to be `main`, with how each is cleared, and fails while there is
      any; it is in `npm run check`. `test/branches.test.ts` makes a repository of its own with a remote whose default is
      `trunk`, a branch merged and left, one not merged, and a worktree on each, and sees only the merged ones listed, and
      nothing once they are cleared (four tests); each seen failing a fault put in it (a branch not merged counted, the
      default assumed `main`, a worktree not merged counted). On this repository it listed five, after a fetch: the worktree
      `.claude/worktrees/festive-dubinsky-4571bc` (clean, at 6853008, on main), the branch `claude/festive-dubinsky-4571bc`,
      and `ccr-7967f86a-owq4mh`, `ccr-8ad9fef3-ii7t91` and `ccr-9356eed0-d2lcns` on GitHub, all cleared at the user's word;
      now it lists nothing. The hooks were seen refusing in boxes 1 and 2; protection does not apply, `main` being
      unprotected, so a change goes straight to it.

## Proving what is there

Most of what is held was never recorded failing a fault put in on purpose. Each is proved once, as its check's _Seen
failing_ says, and the result written here:

- [ ] the fuzzer finds a planted bug (a stroke not counted), and its seed replays it
- [ ] determinism catches a `Math.random()` put into the game
- [ ] the save corpus fails with a field's default taken out
- [ ] leaks catches a cache that is never emptied, as still climbing under its ceiling
- [ ] the look fails on a palette colour moved a little
- [ ] an invariant newly added is seen found by the fuzzer with its bug put back
