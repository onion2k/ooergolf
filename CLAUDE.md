# Ooergolf: working on it

Golf in 3D on the top-down mechanic (aim, set the power, let go), played as
a physics game through obstacles, fewest strokes to the cup. TypeScript,
Vite, and WebGPU through
[artshape-render](https://github.com/onion2k/artshape-render), with the
physics from [artshape-physics](https://github.com/onion2k/artshape-physics).
The README says what the game is; this file says how it is made. The house
rules in `~/.claude/CLAUDE.md` apply too. The template's stub game has been
taken out: what is in `src/` is an empty course, a floor walled in by rock
with nothing on it and nothing to do, and every gate but the pace gate
wired to it. The golf goes in a feature at a time from there.

## The factory

This repo is a line that turns ideas into a browser game that loads fast,
draws fast and has no bugs, one feature at a time, and it holds those three
properties as numbers from the first commit. Every change goes down the same
line: a spec agreed, tests written and seen failing, the change built, every
gate run, the result looked at, the report made with evidence, then a
commit. The line does not skip a station, and it stops when a gate is red:
a red gate is fixed before anything else lands, never skipped with
`--no-verify` and never made green by moving its baseline.

The three properties, and what holds each:

- **Bug free.** Every rule that must always hold is in `src/invariants.ts`,
  and the fuzzer hunts for it. Every bug found becomes a test that would
  have caught it and, where it is a rule, an invariant; there is no list of
  known issues, because a bug found is fixed before the next feature. The
  same seed gives the same game, so every failure can be played again.
- **Loads fast.** Boot time and the gzipped download are measured by
  `npm run perf` in headless Chromium and held to a budget and a baseline.
- **Draws fast.** A frame's cost at the standard view is measured by the
  same gate, and the physics' by `npm run bench`. A feature that cannot fit
  the budget gets a rung the game steps down to on a slower machine, not a
  pass.

## Budgets

Numbers, held by gates, on this machine at 1280×800:

| Property                                               | Budget                         | Held by |
| ------------------------------------------------------ | ------------------------------ | ------- |
| Boot, page start to the frame loop running             | 3000 ms                        | `perf`  |
| Download, scripts and styles gzipped                   | 400 kB                         | `perf`  |
| A frame drawn, lower quartile at the standard view     | 8 ms                           | `perf`  |
| The physics, a frame, against the reference arithmetic | baseline ± 20%                 | `bench` |
| Anything kept: bodies, slots, save bytes, heap         | ceilings in `scripts/leaks.ts` | `leaks` |

A budget is what the game may cost at all; a baseline is what it cost at
the last commit, held both ways, so a step toward a budget is noticed as
much as a step over it. The perf tolerances are the measured wobble of a
headless boot and a GPU frame, and say so in the file.

There is no pace gate: it went with the stub, there being nothing to play
and so no pace to hold. It comes back with the first thing that can be
played, as a figure in the game's own terms (strokes to hole out, say),
played by an autopilot of its own. The shape to copy is in the template and
in this repo's first commit: `src/autopilot.ts`, `scripts/pace.ts`,
`scripts/pace-check.ts` and their tests, and `pace:check` in `check`.

## What the gates hold now

An empty course gives a gate little to hold, and a gate that holds little
looks like one that holds a lot. What each holds today, and what the first
features must hand it:

- **Unit tests, smoke, look, perf:** the real thing, at the size of an empty
  course. They grow as any feature's tests do.
- **Fuzz:** the monkey can wait and reload, and no more. Each thing a player
  can do is an action in `scripts/fuzzer.ts`.
- **Invariants:** bodies are of a kind, are numbers and are out of the rock,
  the world's count is right, and the time is a time. No body exists until
  a feature makes one, so only the tests, which spawn a ball, exercise the
  first three.
- **Determinism:** the course left to itself, twice. It will catch chance
  taken from outside the seed when the game is built, and nothing in play
  until something plays.
- **Leaks:** ten minutes of nothing. The sizes and ceilings are right, and
  nothing yet grows to test them.
- **Bench:** the course at rest, which costs next to nothing, and the course
  full of falling balls, which is the physics at `BODY_CAPACITY`. A frame
  of either is far under the gate's 0.05 ms of slack, so the gate cannot
  fail until the physics costs several times what it does.

## Commands

    npm run dev            the game at http://localhost:5200
    npm run check:quick    formatting, types, lint, unit tests (the pre-commit hook; ~10 s)
    npm run check          all of it: check:quick, fuzz, determinism, leaks, bench, smoke with perf and look (~20 s)
    npm test               unit tests (Vitest, test/)
    npm run fuzz           the game played at random, rules checked; -- --seed N plays one failure again
    npm run determinism    the same seed played twice, hashed, to catch chance not from the seed
    npm run leaks          an hour of play, watching what must stay bounded (10 min of it in check)
    npm run bench          the physics' frame time held to scripts/bench-baseline.json
    npm run perf           boot, frame and download held to smoke/perf-baseline.json and the budget
    npm run smoke          the game in headless Chromium on the real GPU (Playwright, smoke/)
    npm run look           the scenes held to the pictures in smoke/screens

`--update` on `bench`, `npm run perf:update` and `npm run look:update`
write a baseline again. Only through `/gate-moved`, only for a
change meant to move it, and the commit says why. Look at every picture.

## How the code is laid out

- `src/game.ts` is the game without the picture: everything that happens on
  the course, a step at a time. It tells what happened through `GameEvents`,
  and knows nothing of the renderer or the page.
- `src/main.ts` is the page. It turns those events into words on the screen
  and draws the frame. There is no game logic here.
- `src/debug.ts` is `window.game`, the test API. `src/invariants.ts` lists
  the rules that must always hold.
- Content (the floor, the rock, the kinds of body) lives in `arena.ts`. The save
  lives in `progress.ts`. Chance comes from `random.ts`, handed in.
- `src/physics.ts` is the game's side of artshape-physics, and nothing else
  imports the package directly. A change a package needs goes in that repo,
  with a version bump here.

## Skills

In `.claude/skills`, and they come with every game copied from here:
**/feature** builds one, spec and tests first; **/bug** fixes one,
reproduction first; **/gate-moved** decides what a moved baseline means
before anything is written; **/commit** commits in the house style.

## Model features

There are none of the game's own yet. Until the first lands, the shape to
copy is what is left of the template's, and the template itself in
`~/projects/artshape-game-template` for what was taken out:

- **On the course:** the ball, the one body kind. It is a radius and a name
  in `arena.ts`, a mesh and a pool in `scene.ts`, held by `invariants.ts`
  and read by `debug.ts`'s `bodies`. Nothing spawns one yet. The first
  feature a player can see replaces this entry.
- **Tools:** the fuzzer (`scripts/fuzzer.ts`) and the bench
  (`scripts/bench.ts`). The fuzzer has unit tests of its own working parts.
- **Test helpers:** `newGame(seed)` in `test/helpers.ts`, and `memoryStore`
  in `src/progress.ts` for a save that is not the player's.

## The test API

`window.game`, in `src/debug.ts`, typed, and the smoke tests compile against
it. Time: `pause`, `resume`, `step(frames)`, `seed(n)`, and `?seed=N` and
`?paused=1` on the page. Reading: `state`, `bodies`, `content`, `events`,
`invariants`. Setting a scene: `place` for a body that exists, `save`, and
`start(page, { save })` in `smoke/game.ts` for a save that is not the
player's. Looking: `look` and `measureFrame`. There is nothing to drive
yet: the shot, when it comes, gets its calls here.

## What is not there yet

Each of these is the first feature's to bring, with every gate green at
each step, and a gate handed what it needs in the same change:

- The player's ball, and somewhere for it to start.
- The shot: the aim and the power, and the input that sets them.
- The cup, and holing out. `makeWorld` in `physics.ts` takes no holes now.
- Events. `GameEvents` is empty; the page notes every event by name for the
  test API, and shows the player nothing of any.
- Anything saved. `Save` is empty and `Progress` reads no field; the first
  field is read in its constructor, with a default, and a save in the new
  shape goes in `test/saves/`.
- The pace gate and its autopilot.

## Rules for the code

- **No tight coupling.** A module takes what it needs as arguments or
  options. It does not import game state, and lower modules do not import
  content. `main.ts` is the only place that wires everything together.
- **Chance is handed in.** `Game` takes a `random`; nothing in `src/` calls
  `Math.random` itself.
- **Nothing is made each frame.** Pools are sized once and written into;
  the renderer's groups are fixed and `move` writes them. A per-frame
  allocation is a frame-time bug and a garbage-collection stutter.
- **Nothing is kept for ever.** A list, map or cache that is added to has to
  be emptied somewhere, and its ceiling named in `scripts/leaks.ts`.
- **Loading is the first frame's business.** Everything the first frame
  needs is built before `ready`; everything else after it. A dependency is
  weighed against the download budget before it is added.
- **Every kind of thing is handled everywhere.** A new body kind, event,
  save field or scene has to work in every path it can reach.
- **Save compatibility.** A new save field needs a default in `progress.ts`
  and a save in the new shape in `test/saves/`; the corpus test fails until
  it is there.
- **Match the style.** Comments are full sentences in the house voice,
  saying why and not what. Prettier decides the formatting.

## Definition of done

The house's nine points, in `~/.claude/CLAUDE.md`. Here, they mean: unit
tests in `test/`, a stage in `smoke/progress.spec.ts`, an action in
`scripts/fuzzer.ts` and a rule in `src/invariants.ts`, a size in
`scripts/leaks.ts` for anything kept, the perf figures before and after in
the report and within budget, `measureFrame` in any other scene touched, and
a picture in `smoke/look.spec.ts`. `npm run check` green, and
`npm run fuzz -- --seeds 1-24` clean.

## Edge-case checklist

For anything new on the course, check what it does:

- **save:** saved, reloaded, and loaded from an old save without the field
- **rock:** against the wall and in the corners; never left in rock
- **scale:** many at once, at capacity (`BODY_CAPACITY`); and what it costs
  a frame at that many
- **phone:** narrow screen, and a slower GPU: which rung it steps down to

And the game's own, for anything new on a hole. These name things the game
does not have yet; each applies from the feature that brings it:

- **the ball in flight:** struck by it, struck into it at full power, and
  landed on from above; never passed through at the fastest shot there is
- **the ball at rest:** come to rest on it, against it, or wedged between
  it and a wall; the ball always comes to rest, so the next stroke can be
  taken
- **the cup:** beside the cup, over it, and in the ball's way on the lip; a
  ball that drops in is holed once and only once
- **out of bounds:** the ball knocked off the hole or into a hazard by it;
  where the ball is put back, and what it costs in strokes
- **slopes:** on a slope, at the top and the foot of one; a ball that rolls
  back to where it was struck from
- **moving obstacles:** where it is when the shot is taken, the same from
  the same seed; and what it does while the ball is at rest and no shot is
  in play
- **the aim:** aimed at, aimed through, and under the pointer when the drag
  starts; at least power, at most, and a drag let go with none
- **the stroke count:** a stroke taken while it is moving, and whether
  input is taken at all while the ball rolls
- **the next hole:** carried over, or not, when the hole changes; a hole
  restarted with it mid-motion; the last hole, and the card after it
- **the camera:** in the way of the top-down view, and hidden behind
  something taller than the ball

## Verifying in a browser

Use headless Playwright (`start()` in `smoke/game.ts`) for anything seen or
measured; the in-app browser pane pauses when hidden. Control time through
the API: `pause()`, `seed(n)`, then `step(frames)`, never a timeout. Never
write over the player's save; a test save goes in through `start(page, {
save })`.

## Commits

Commit only when asked, through `/commit`: a sentence summary in the house
voice, a body saying what changed and why, two commits when a refactor and
a feature land together. The pre-commit hook runs `check:quick`.
