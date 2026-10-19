# Ooergolf: working on it

Golf in 3D on the top-down mechanic (aim, set the power, let go): three courses of minigolf through obstacles and six of
golf proper with a bag of clubs, fewest strokes to the cup. TypeScript, Vite, and WebGPU through
[artshape-render](https://github.com/onion2k/artshape-render), with the physics from
[artshape-physics](https://github.com/onion2k/artshape-physics). The README says what the game is, `DESIGN.md` what it is
to be and `LOOK.md` what it is to look like; this file says how it is changed, and `HOW-IT-WORKS.md` is the reference it
points to: each course, what each gate holds today, every module, the test API in full and what is not there yet.

Read guardrails/GUARDRAILS.md before changing anything: @guardrails/GUARDRAILS.md

<!--
Written 17 October 2026 from commit 62bb0d0, from the guardrails kit's template (v0.5.0) and the CLAUDE.md that was here,
whose reference sections moved to HOW-IT-WORKS.md word for word. Keep this file to two hundred lines or so: a module's
own story goes in HOW-IT-WORKS.md, what was tried in the commit, and a figure in the file a tool holds it in.
-->

## The factory

This repo is a line that turns ideas into a browser game that loads fast, draws fast and has no bugs, one feature at a
time, and it holds those three as numbers. Every piece of work goes down the same line: a spec agreed, tests written and
seen failing, the change built, and then, once, at the end, every gate it can reach run, the result looked at and the
report made with evidence. A gate red at the end is fixed at its cause, never skipped with `--no-verify` and never made
green by moving its baseline.

- **Bug free:** every rule that must always hold is in `src/invariants.ts`, and the fuzzer hunts for it. A bug found
  becomes a test that would have caught it and, where it is a rule, an invariant; there is no list of known issues. The
  same seed gives the same game, so every failure can be played again.
- **Loads fast:** boot and the gzipped download, by `npm run perf` in headless Chromium.
- **Draws fast:** a frame at the standard view, by the same gate, and the physics' by `npm run bench`. A feature that
  cannot fit the budget gets a rung of the quality ladder (`src/quality.ts`) to step down to, not a pass.

## Commands

    npm run dev            the game at http://localhost:5200 (PORT=n for another; the smoke tests take PORT too, 5201 by default)
    git commit             the pre-commit hook: gitleaks over what is staged (gitleaks 8 on the PATH; the hook refuses without it), then check:quick
    gitleaks git --redact  the whole history scanned for secrets, by hand before a push (clean at 212 commits on 17 October 2026)
    npm run check:quick    formatting, types and lint side by side, then the quick unit tests (the pre-commit hook; ~28 s)
    npm run check          all of it: check:quick, the slow unit tests, fuzz, determinism, leaks:check, pace:check, bench, smoke (~15 min)
    npm test               every unit test, quick and slow (Vitest, test/)
    npm run fuzz           the game played at random, rules checked; -- --seed N plays one failure again, --on <course> one kind
    npm run determinism    the same seed played twice, hashed, to catch chance not from the seed
    npm run leaks          an hour of play watching what must stay bounded; leaks:check is the ten minutes a kind in check
    npm run pace           strokes a round, seed by seed, and each hole's median against par; pace:check holds the figures
    npm run bench          the physics' frame time held to scripts/bench-baseline.json
    npm run perf           boot, frame and download held to smoke/perf-baseline.json and the budget
    npm run smoke          the built game in headless Chromium on the real GPU (Playwright, smoke/): every run builds dist first
                           and serves it with Vite's preview; the models' showcase alone is on a dev server, ten ports up
    npm run look           the scenes and the models' showcase, held to the pictures in smoke/screens
    npm run look:metrics   the look's colour, framing, contrast, cool shade and shape, held to their floors
    npm run format         prettier, writing: by hand, never by the hook
    npm run value          what each shop item saves the pace player a round (the prices' measure; slow)
    npm run field          the rivals' table, src/field.json, again (~20 min; when a course, the autopilot or a skill changes)
    npm run previews       the start screen's hole pictures and src/previews.json again (when a course changes)
    node scripts/make-icons.mjs     the app's icons from src/title_sq.png (when the picture or the crop changes)
    node scripts/trace-title.mjs    src/titletrace.json from src/title_sq.png (when the picture changes)
    CI                     none, by choice: every check runs on this machine, before a push
    npm run audit          the installed tree's advisories at the threshold under Gates; needs the network, so by hand before a push
    npm run licences       every package that ships, its licence on the list under Gates (in check)
    npm run unused         knip: a dependency nothing imports (in check)
    npm run headers:live   the deployed page's response held to the headers' rules (after a deploy; needs the network)
    npm run branches       every branch and worktree merged into the default branch and left, here and on the remote (in check)
    npm ci                 the exact install from the lockfile, refused where it and package.json disagree
    updates                Dependabot for security updates only (on in the repository's settings); versions by hand, monthly, a commit each

`npm install` points git at `.githooks` (`prepare`). `--update` on `pace:check` or `bench`, `npm run perf:update` and
`npm run look:update` write a baseline again (`look:update` leaves a picture within tolerance as it was;
`npx playwright test smoke/look.spec.ts --update-snapshots=all` writes every one). Only through `/gate-moved`, only for a
change meant to move it, and the commit says why. Look at every picture.

## Layout

The whole of it, module by module, is `HOW-IT-WORKS.md`'s _How the code is laid out_. The shape:

- **The thing itself:** `src/game.ts`, the game without the picture, a step at a time, telling what happened through
  `GameEvents`; it knows nothing of the renderer or the page. Beside it the arithmetic with no page: `arena.ts` (a map
  into a layout, the body kinds), `physics.ts` (the only importer of artshape-physics), `obstacles.ts`, `golf.ts` (the
  hole generator), `flight.ts`, `shaping.ts`, `green.ts`, `zones.ts`, `autopilot.ts`, `planner.ts`, `caddie.ts`,
  `director.ts` (the camera's decisions, shared by the page and the fuzzer), `season.ts` and `tournament.ts`.
- **The page:** `src/main.ts` wires everything and holds no game logic; `hud.ts` draws the words it is handed;
  `scene.ts`, `ground.ts`, `turf.ts`, `look.ts` and `src/models/` are what is drawn; `shot.ts`, `gesture.ts` and
  `input.ts` turn pointers into a shot through ports; `sound.ts` is what is heard, the only importer of artshape-sound
  (`GameSound`, and the `LazySound` the page holds, which makes the context on the first gesture).
- **Content:** the courses in `course.ts` (`COURSES`) and one file each (`links.ts`, `heath.ts`, `fells.ts`, `woods.ts`,
  `isles.ts`, `old.ts`, `shed.ts`, `waterworks.ts`); the shop in `items.ts`; rivals in `rivals.ts` and `field.json`.
- **The persisted shape:** `src/progress.ts`, with every save shape ever written in `test/saves/`.
- **Chance:** `src/random.ts`, handed in. `Game` must be given a `random`; `main.ts` seeds it from `?seed=N` or the
  browser's `crypto.getRandomValues`, and lint refuses `Math.random` anywhere in `src/`.
- **Generated, never edited:** `src/titletrace.json`, `src/field.json`, `src/previews.json`, `public/previews/`,
  `public/icons/`, each by its command above.

## Rules for the code

Beyond the kit's:

- **One place wires everything:** `main.ts`. A module takes what it needs as arguments; lower modules import no content.
- **Lint holds what it can read** (`eslint.config.js`, each rule with its reason): no `Math.random` and no `console` in
  `src/`, and a rule turned off says why on the line, after `--` (`house/directive-reason`, a local rule).
- **What may import what** is lint's too: only the picture (`PICTURE` in `eslint.config.js`: the page and what draws)
  imports the renderer or is imported by it, only `physics.ts` imports artshape-physics, only `sound.ts` (of the
  picture) imports artshape-sound, and nothing imports `main.ts`
  or `showcase.ts`. A type alone is let through. Nothing imports in a circle (`test/structure.test.ts`), which is why
  `TILE` is in `src/tile.ts`, re-exported by `arena.ts`.
- **Nothing is made each frame.** Pools are sized once and written into; the renderer's groups are fixed and `move`
  writes them. A per-frame allocation is a frame-time bug and a garbage-collection stutter.
- **Nothing is kept for ever.** A list, map or cache added to is emptied somewhere, and its ceiling named in
  `scripts/leaks.ts`. A cache by layout is a `WeakMap`, held collectable by a test.
- **Loading is the first frame's business.** What the first frame needs is built before `ready`, the rest after.
- **Save compatibility.** A new save field has a default in `progress.ts` and a save in the new shape in `test/saves/`;
  the corpus test fails until it is there.
- **Each hole is a world of its own,** made when it begins: nothing may keep `game.world`. Hole names are unique across
  the courses, since a best is kept by name.
- **A package's change goes in that repo,** released, and taken in here by a version bump.

## Model features

What to copy the shape of, when building something new:

- **Something the player sees and does:** the ball and the shot. The ball is a kind in `arena.ts`, struck by `game.ts`,
  told of through `struck` and `stopped`; a drag becomes a shot in `shot.ts`; a hole is a map in `course.ts`, begun by
  `game.begin`, drawn by `scene.static(layout)` and shown by `hud.ts`. Each is held by `invariants.ts`, read by
  `debug.ts`, driven by a real pointer in `smoke/progress.spec.ts` and pictured in `smoke/look.spec.ts`.
- **Something drawn:** a model in `src/models/`, a function of the sizes that matter to play, with tests of its size,
  normals and triangle budget in `test/models.test.ts`, a place in `showcase.html` and a picture in
  `smoke/models.spec.ts`. The kicker (`models/kicker.ts`) is the latest.
- **Something that throws or moves:** an `ObstacleDef` member in `obstacles.ts` (its pose from game time alone, refused
  by name where it cannot stand), a model, an invariant, a fuzzer action on a chance of its own, and a test file:
  `test/flipper.test.ts` is the whole of it.
- **A tool:** the autopilot (`src/autopilot.ts`) and the gates built on it, pace (`scripts/pace.ts`), the fuzzer
  (`scripts/fuzzer.ts`) and the bench (`scripts/bench.ts`), each with unit tests of its working parts.
- **Test helpers:** `newGame(seed)`, `onGreen()` and `SAMPLE_HOLES` in `test/helpers.ts`; `FLAT` and `levelHole` in
  `test/level.ts`; `field(...)` and `golfGame(hole, random)` for a golf hole of one surface, struck true;
  `groundFigures(layout)` in `test/ground-metrics.ts`; `wideHole()` in `test/wide-hole.ts`; `memoryStore` in
  `src/progress.ts` for a save that is not the player's; `read(page)` in `smoke/panels.ts` for contrast and overflow.

## Test API

`window.game`, in `src/debug.ts`, typed, and the smoke tests compile against it; every call is in `HOW-IT-WORKS.md`'s
_The test API_. Time: `pause`, `resume`, `step(frames)`, `seed(n)`, and `?seed=N`, `?paused=1`, `?rung=N`, `?title=0`,
`?flyin=0` on the page. Reading: `state`, `ball`, `bodies`, `content`, `events`, `invariants`, `view()`, `motions()`,
`caddie()`, `season()`, `sound()` (awake, mute, volume, voices, loops, what is loaded and what each load took, the
music's beat, and the controls as drawn). Playing: `shoot`, `club`, `chooseCourse`, `startHole`, `playCourse`, `buy`,
`equip`; `mute(on)`, `volume(v)`, and `wake()` for the first gesture. The event log has a `sound …` line for each sound
an event plays. Playwright's Chromium lifts the autoplay rule, so a context made by `wake()` runs. A smoke test
starts the page headless with `start(page, { save, seed, paused, rung })` in `smoke/game.ts`, a fresh context and a
save of its own, and drives a real mouse or finger with `drag` and `touches`. Never a timeout: pause, seed, step.

## Edge cases

For anything new, check what it does:

- **saved:** saved, reloaded, and loaded from an old save without the field
- **rock:** against the wall and in the corners; never left in rock
- **scale:** many at once, at `BODY_CAPACITY`, and what it costs a frame at that many
- **phone:** a narrow screen, and a slower GPU: which rung it steps down to
- **the grass:** whether the rough grows under it and moves in the hole's wind, whether it is lost in the long grass,
  and whether the grass survives every rung of the ladder
- **the ball in flight:** struck by it, struck into it at full power, landed on from above; never passed through at the
  fastest shot there is
- **the ball at rest:** on it, against it, wedged between it and a wall; the ball always comes to rest
- **the cup:** beside it, over it, in the ball's way on the lip; a ball that drops in is holed once and only once
- **out of bounds:** knocked off the hole or into a hazard by it; where the ball is put back, and the strokes it costs
- **slopes:** on one, at the top and the foot; a ball that rolls back to where it was struck from
- **moving obstacles:** where it is when the shot is taken, the same from the same seed, and while no shot is in play
- **the aim:** aimed at, aimed through, under the pointer as the drag starts; least power, most, and none
- **the stroke count:** a stroke taken while it moves, and whether input is taken while the ball rolls
- **the next hole:** carried over or not; a hole restarted mid-motion; the last hole, and the card after it
- **the camera:** hidden behind something taller than the ball; every heading and both tilt limits at the home zoom
  and the widest; the ball and the furthest reach on the screen for every club, desk and phone; a drag turned to the aim
  and taken back; the flag button at the cup, and the turn by itself at rest; a stroke followed and one held; the
  overhead view fitted to the hole, desk and phone, and left to the view as it was
- **the career:** in an event, in practice and in free play; a fee refused; a reload mid-event
- **the sound:** before the first gesture (no context, a silence), while the ball moves (only a sound cheap to load is
  loaded, one a frame; a dear one waits for a still screen), heard once an event and only for something seen (a place's own
  sound, wind and birds, was taken out on 19 October 2026 for want of anything seen to tell what it was), under a menu
  (the music), muted and at every volume, and kept in the save across a reload; its controls on a desk (the
  speaker by the flag, M, the start screen's switch and slider) and a phone (the speaker beside the Shop alone), at 320 px

## Gates

Budgets on this machine at 1280×800. What each gate holds today, and what the next feature must hand it, is
`HOW-IT-WORKS.md`'s _What the gates hold now_.

| Figure                                            | Budget                     | Baseline kept in              | Tolerance                                       | Held by        |
| ------------------------------------------------- | -------------------------- | ----------------------------- | ----------------------------------------------- | -------------- |
| Boot, page start to the frame loop running        | 3000 ms                    | `smoke/perf-baseline.json`    | the measured wobble of a headless boot, in file | `perf`         |
| Download, scripts and styles gzipped              | 400 kB                     | `smoke/perf-baseline.json`    | in the file                                     | `perf`         |
| Pictures fetched with the page                    | 120 kB                     | `smoke/perf-baseline.json`    | in the file                                     | `perf`         |
| A frame, lower quartile, standard view            | 6 ms                       | `smoke/perf-baseline.json`    | the measured wobble of a GPU frame, in file     | `perf`         |
| The biggest hole begun, and a frame of it         | 400 ms begin, 6 ms a frame | `smoke/perf-baseline.json`    | in the file                                     | `perf`         |
| The physics, a frame                              | none but the baseline      | `scripts/bench-baseline.json` | ± 20%                                           | `bench`        |
| Strokes a round of each course, mean of 16 seeds  | none but the baseline      | `scripts/pace-baseline.json`  | a fifth, four times the 5% wobble of the mean   | `pace:check`   |
| Anything kept: bodies, slots, save bytes, heap    | ceilings                   | `scripts/leaks.ts`            | none: a ceiling                                 | `leaks`        |
| The look: colour, framing, contrast, shade, shape | floors                     | `smoke/look-metrics.spec.ts`  | none: a floor                                   | `look:metrics` |
| The pictures                                      | none                       | `smoke/screens/`              | per picture, in `smoke/look.spec.ts`            | `look`         |

The perf gates read wrong while anything else is on the GPU, and the load average never shows it: every smoke test that
times a frame does it inside `alone()` (`smoke/gpu.ts`), which reads each process's GPU time from `ioreg`, waits up to two
minutes for the others to fall under 200 ms of it a second, and fails a timing they passed it during, figure unreported.
On a busy machine a change is timed in turn with its parent commit and no baseline is written.

- **Audit threshold:** high and critical fail; moderate is reported; an exception is written with why, and looked at
  again within 90 days.
- **Allowed licences:** MIT, BSD-2-Clause, BSD-3-Clause, ISC, Apache-2.0, 0BSD and the Unlicense; anything else asked
  about by name.
- **Accepted findings:** the secret scan's in `.gitleaksignore`, by fingerprint, each with its reason here: none yet.
  Code scanning has none, since it is not on yet.

## Done, here

The definition of done's nine points, in this project: unit tests in `test/`, a stage in `smoke/progress.spec.ts`, an
action in `scripts/fuzzer.ts` and a rule in `src/invariants.ts`, a ceiling in `scripts/leaks.ts` for anything kept, the
perf figures before and after and within budget, `measureFrame` in any other scene touched, and a picture in
`smoke/look.spec.ts`. The pass for a feature or a change to the rules of play is `npm run check` green and
`npm run fuzz -- --seeds 1-24` clean, once, at the end of the piece of work, on the tree as it will land.

**The pass is sized to what the change can reach,** since the measuring gates are most of the quarter of an hour:

- A change that cannot move a cost (words, a stylesheet, a test, a script, a comment, this file) is held to
  `check:quick` and `npm test`, since the hook leaves out the slow test files (`SLOW` in `vitest.config.ts`; a file that
  grows past two seconds goes there, so the hook stays under half a minute).
- `perf` and `measureFrame`: only for drawing (`scene.ts`, `ground.ts`, `turf.ts`, `look.ts`, models, grass, water, the
  ladder), boot or the download, or the size of a hole; once, not three times, where the figure is far inside.
- `bench`: only for `physics.ts`, `arena.ts` or what the world steps.
- `leaks`: only for something kept, and `--on` the one kind of course it can reach first.
- `pace:check`: for anything that changes a hole or how the autopilot plays; a hole's chance is the next hole's, so the
  whole course is measured again after any change to one hole.
- A fix is held to its test, the invariants and `fuzz` on the seeds and course it concerns.

A gate not run because the change cannot reach it is marked so in the report, with the reason. While the work is under
way, a step is built and its own tests run (`npx vitest run test/the-file.test.ts`), and nothing more. Where the work
lands as several commits, those before the last carry no figures and say the checks follow. Seen and measured headless,
with `start()` in `smoke/game.ts`; the in-app browser pane pauses when hidden.

## What is not held

Each of the kit's checks, as surveyed on 17 October 2026, and the order the missing ones are added in, is
`GUARDRAILS-PLAN.md`; a line here goes as its box is ticked. In short:

- **No CI, by choice** (the user's word, 18 October 2026: the checks run locally before a push). Every check runs on
  this machine alone, one browser (Chromium) and one GPU, so a green check holds this machine; the look pictures are
  this GPU's, and another machine's are not comparable. Nothing runs on the remote when a change lands, so the pass is
  run here before a push.
- **The history's secret scan is by hand,** `gitleaks git --redact` before a push; GitHub's own secret scanning and
  push protection are on. The code reads no secret, so there is no `.env.example`.
- **No code scanning.** "A module takes what it needs as arguments" and "lower modules import no content" are held by
  review: lint holds only which side of the game and its picture a module is on.
- **The audit runs by hand,** `npm run audit` before a push, and on no schedule: an advisory published against a tree
  that has not changed is seen at the next push, or by Dependabot's security updates.
- **The deployed headers are read by hand,** with `npm run headers:live` after a deploy. The build writes
  `dist/_headers` (`scripts/headers.ts`), and `smoke/headers.spec.ts` boots the built game under it; that Netlify serves
  the file as written is seen only on the live site.
- **The look lets a colour moved by a few
  levels in 255 through** (its threshold, 0.02, is the GPU's drift), and fails one moved by about ten.
- **A shared GPU is seen only on macOS.** Frame costs doubled now and then (Home Waters' tee 9.67 ms against 4.6 to
  5.0) because another process drew on the GPU at the same time: alone 4.1 to 4.3 ms, beside a second headless game 9.9
  to 11.7 ms, on 18 October 2026. `alone()` holds it where `ioreg` can be read; elsewhere it says it cannot tell, and a
  frame figure is taken as it comes. A burst from another process far shorter than a long timing is averaged over the
  window, so a long test can let a short one through.
- **Whether the sound is good** is heard, not tested: the tests read what was asked of the package (the event log's
  `sound …` lines, the voices, what loaded), never what came out of the speakers. Only Chromium's Web Audio is
  run, with its autoplay rule lifted; the rule a player meets is held only as far as no context being made before a
  gesture. The sound's ceilings (16 voices and one load a sound) are in `smoke/sound.spec.ts` and not
  `scripts/leaks.ts`, which plays in node, where there is no AudioContext. A game paused by the test API stops the music's
  steps, and its notes already handed over play out; a page out of sight suspends the context.
- **Mutation checks are by hand,** in the work's report, with no tool to record them.
- **What only a person can judge:** how a course feels to play, a matter of taste in the look, and the limits listed in
  `HOW-IT-WORKS.md`'s _What is not there yet_.

## How a change lands

The rules are guardrails/GUARDRAILS.md's _Landing a change_. This project's answers:

- **Merge style:** a merge commit.
- **What an agent may do without asking:** push and open PRs, granted by Chris Neale on 17 October 2026. Merging and
  tagging are asked each time.

Whether a change goes straight to the default branch or by PR is the remote's to say, by protecting the branch or not,
and is read from it each time. Commits go through `/commit`; landing through `/land`. Once a change has landed, the
branches and worktrees it was built on are cleared, each checked first as merged (`npm run branches` lists them), a
branch on the remote only on the user's word.

## Skills

In `.claude/skills`: **/feature** builds one, spec and tests first; **/bug** fixes one, reproduction first;
**/gate-moved** decides what a moved baseline means before anything is written; **/commit** commits in the house style
(those four are the project's own, and come with every game copied from here); **/guardrails** takes the project up
the kit's checks; **/land** pushes, opens a PR or merges as _How a change lands_ says (those two are the kit's).

## Who uses it

Nothing pins it. It pins artshape-physics and artshape-render by git tag, in `package.json`.
