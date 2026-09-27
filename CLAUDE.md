# Ooergolf: working on it

Golf in 3D on the top-down mechanic (aim, set the power, let go), played as
a physics game through obstacles, fewest strokes to the cup. TypeScript,
Vite, and WebGPU through
[artshape-render](https://github.com/onion2k/artshape-render), with the
physics from [artshape-physics](https://github.com/onion2k/artshape-physics).
The README says what the game is, and `DESIGN.md` what it is to be; this
file says how it is made. The house
rules in `~/.claude/CLAUDE.md` apply too. What is in `src/` is a round of
the course: holes drawn as maps, each played from its tee to its cup with a
drag pulled back and let go, scored against par, and the card at the end.
Seven holes are here, on artshape-physics v0.3.0: grass, rail, water,
raised grass, sliding barriers, a windmill and a conveyor. The bunker and
the bumpers wait for 0.4.0's sand and bounce, and everything is retuned for
0.4.0 when it comes. The golf goes in a
feature at a time, in the order `DESIGN.md` gives.

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

The pace gate holds the strokes a round takes, the mean over sixteen seeds,
played by the autopilot with a player's slips: a few degrees of aim, a
tenth of the power. A median was tried and jumps a whole stroke between
sets of seeds; the mean held within 5%, so the tolerance of a fifth is four
times its wobble. Par is set from the same player: `npm run pace` prints
each hole's median against its par.

## What the gates hold now

A gate that holds little looks like one that holds a lot. What each holds
today, and what the next features must hand it:

- **Unit tests, smoke, look, perf:** the real thing. They grow as any
  feature's tests do.
- **Fuzz:** the monkey strikes the ball any way at any power, strikes it
  well at the cup (the autopilot's shot, slipped), tries to strike it while
  it rolls or between holes, waits, reloads, and asks for another round when
  one is over. It gets round the whole course. Each thing a player can do is
  an action in `scripts/fuzzer.ts`.
- **Invariants:** bodies are of a kind, are numbers and are out of the rock;
  the world's count is right; the time is a time; the ball is there while a
  hole is played, alone, and never faster than the hardest shot (or than its
  fall into the cup); the strokes are a count within the hole's limit; the
  card has a score for each hole finished and no other, each between one and
  the limit. The speed rule holds only while nothing on the course adds
  speed: a bumper changes it, and must say by how much.
- **Determinism:** the autopilot plays, with a player's slips from its own
  chance, round after round, and the hash takes in the hole and the card.
- **Pace:** the strokes a round takes; see above.
- **Leaks:** ten minutes of the autopilot playing round after round. The
  card is emptied each round and watched against the number of holes.
- **Bench:** the physics on a green of its own, the size the course was
  before it had holes, so its figures are the physics' and not the
  content's: at rest, which costs next to nothing, and full of falling balls
  at `BODY_CAPACITY`. A frame of either is far under the gate's 0.05 ms of
  slack, so the gate cannot fail until the physics costs several times what
  it does.

## Commands

    npm run dev            the game at http://localhost:5200
    npm run check:quick    formatting, types, lint, unit tests (the pre-commit hook; ~10 s)
    npm run check          all of it: check:quick, fuzz, determinism, leaks, bench, smoke with perf and look (~20 s)
    npm test               unit tests (Vitest, test/)
    npm run fuzz           the game played at random, rules checked; -- --seed N plays one failure again
    npm run determinism    the same seed played twice, hashed, to catch chance not from the seed
    npm run leaks          an hour of play, watching what must stay bounded (10 min of it in check)
    npm run pace           the strokes a round takes, seed by seed, and each hole's median against its par; pace:check holds it
    npm run bench          the physics' frame time held to scripts/bench-baseline.json
    npm run perf           boot, frame and download held to smoke/perf-baseline.json and the budget
    npm run smoke          the game in headless Chromium on the real GPU (Playwright, smoke/)
    npm run look           the scenes, and the models' showcase, held to the pictures in smoke/screens

`--update` on `pace:check` or `bench`, `npm run perf:update` and `npm run
look:update` write a baseline again. `look:update` leaves a picture that is
within tolerance as it was; `npx playwright test smoke/look.spec.ts
--update-snapshots=all` writes every one. Only through `/gate-moved`, only for a
change meant to move it, and the commit says why. Look at every picture.

## How the code is laid out

- `src/game.ts` is the game without the picture: everything that happens on
  the course, a step at a time. It tells what happened through `GameEvents`,
  and knows nothing of the renderer or the page.
- `src/main.ts` is the page. It turns those events into words on the screen,
  a drag into a shot through `shot.ts`, and draws the frame. There is no
  game logic here.
- `src/shot.ts` is the shot as the player makes it: a drag into a direction
  and a power, and the pointer onto the ground. `src/gesture.ts` says what
  the pointers mean: one pulled back is a shot, two are a pinch, and a
  second finger mid-drag takes the shot back. `src/camera.ts` says where the
  camera is. `src/quality.ts` is the ladder the picture steps down on a slow
  machine, and the governor that chooses the rung from the time between
  frames. All are arithmetic, tested without a page.
- `src/scene.ts` is a hole as it is drawn: the grass, the rail, the cup and
  flag, the tee's markers and the scenery, from the models. Each hole stands
  on the rough as a raised green: the rough lies `ROUGH_DEPTH` below the
  grass, under the bottom of the cup, so the cup is seen into, and the rail
  comes down to meet it. The look is toon daylight on artshape-render
  v0.18.0, in `src/look.ts`, shared by the game and the showcase: with the
  renderer's screen-space occlusion for the shade where things meet, and a
  thin haze. Its fog is lit by a toon sun of 2.5, so it is kept thin and
  dark: at the sky's own colour it washed the whole course white.
  `src/glints.ts` says when the gold of the cup and the pin twinkles, from
  game time, and the page draws it as one of the renderer's glow quads.
- What moves only to be seen, all from game time so a picture is the same
  every run: `src/roll.ts` turns the ball as it rolls (the physics eases a
  ball at rest toward flat, as a coin, so its turn is no good for this),
  and the ball wears a band so the roll shows; `src/sway.ts` swings the
  flag, leans the trees and swells the ripples; `src/bursts.ts` is the
  particles for a stroke, the cup and water. The particles move only as a
  frame is drawn, so a test that pictures them steps a frame at a time, and
  their gravity is set on the renderer in world units (30, as Miner has).
- `src/models.ts` and `src/models/` are the models: the cup, collar, flag
  and tee markers; the obstacles at the sizes the physics will give them
  (bumper, barrier, windmill with its turning blades, water, bunker,
  conveyor); and the decoration. Each returns its parts, a mesh and a
  material each, for `group` to turn into a renderer group; each has a
  triangle budget in `BUDGET`. `showcase.html` draws every one
  (`/showcase.html`, with `?model=name`), for building and looking at them.
- `src/scenery.ts` scatters the decoration round a hole, on the rough and
  clear of the course, from the hole's name and never the game's chance.
- `src/debug.ts` is `window.game`, the test API. `src/invariants.ts` lists
  the rules that must always hold. `src/autopilot.ts` plays the game by
  itself, for the gates and for par.
- `src/hud.ts` is the words over the course: the hole and strokes, the
  score's name when a hole is done, the card, the coins and gems, and the
  shop. `src/score.ts` names a
  score. Both are given what to show and never read the game.
- The holes are content in `course.ts`: each a map drawn as seen from the
  tee (`#` rail, `.` grass, `T` tee, `C` cup on level grass, `~` water, a
  digit for grass raised that many steps of 0.4, space for off the course),
  a par, and what moves on it, by map tile; and the cup's size. A step the
  ball rolls up; three (1.2) are a wall to it. Water is a floor below the
  world's bottom: a ball in it is lost, a stroke is added, and it is put back
  where it was struck from. `src/obstacles.ts` says where a barrier, a
  windmill's gate and a belt are at any moment of game time, as the physics'
  boxes and belts. `arena.ts` reads a map into a layout, and holds
  the kinds of body, the hardest shot and how the ball rolls. Each hole is a
  world of its own, made when it begins: nothing may keep `game.world`.
- The clubs, what they cost and what a hole pays are content in `clubs.ts`.
  The save (`progress.ts`) holds coins, gems, the clubs owned, the club in
  hand and the best score on each hole with the club it was made with;
  `Game` pays into it when a hole is done, and buys and equips from it.
  Every save shape is in `test/saves/`. The save
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

What to copy the shape of, when building something new:

- **What the player sees and does:** the ball and the shot, and the round.
  The ball is a kind in `arena.ts`, spawned and struck by `game.ts`, which
  tells of it through `struck` and `stopped`. A drag becomes a shot in
  `shot.ts`. A hole is a map in `course.ts`, begun by `game.begin`, told of
  through `started`, `holed`, `pickedUp` and `finished`, drawn by
  `scene.static(layout)` and shown by `hud.ts`. Each is held by
  `invariants.ts`, read by `debug.ts`, driven by a real pointer in
  `smoke/progress.spec.ts`, and pictured in `smoke/look.spec.ts`.
- **What is drawn:** a model is a function of the sizes that matter to play,
  in `src/models/`, with unit tests of its size, its normals and its
  triangle budget in `test/models.test.ts`, a place in the showcase, and a
  picture in `smoke/models.spec.ts`; the scene places it with `group`.
- **Tools:** the autopilot (`src/autopilot.ts`), and the gates built on it:
  pace (`scripts/pace.ts`), the fuzzer (`scripts/fuzzer.ts`) and the bench
  (`scripts/bench.ts`). Each has unit tests of its own working parts; the
  autopilot's say how far a shot rolls, that it sees round a corner, and
  that it finishes every hole.
- **Test helpers:** `newGame(seed)` in `test/helpers.ts`, `onGreen()` for a
  practice green whose cup is out of the way of tests of the ball, and
  `memoryStore` in `src/progress.ts` for a save that is not the player's.

## The test API

`window.game`, in `src/debug.ts`, typed, and the smoke tests compile against
it. Time: `pause`, `resume`, `step(frames)`, `seed(n)`, and `?seed=N` and
`?paused=1` on the page. Reading: `state` (with `strokes` and `ready`),
`ball`, `bodies`, `content` (the hole's grass, tee and cup, the hardest
shot, and every hole's name and par), `events`, `invariants`, and `aiming`,
the shot a drag under way would make. `state` has the hole, its par, the
phase (`play`, `done`, `over`), the card, the coins and gems, the club in
hand and those owned, and the hardest shot the club in hand strikes.
Playing: `shoot(angle, power)`, `suggest()` for the autopilot's shot from
where the ball lies, `startHole(index)`, `newRound()`, `buy(id)`,
`equip(id)`, and `drag(page, from, to, { touch, hold })` in
`smoke/game.ts` for a real mouse or finger, pressed where `project(x, y,
z)` says a point on the course is on the page. Setting a scene: `place` for
a body that exists, `save`, and `start(page, { save })` for a save that is
not the player's, and `touches(page, steps)` for fingers, several at once.
Looking: `look(x, y, distance)` parks the camera until `follow`, `view()`
says how far back it stands and which rung of the quality ladder the
picture is on, and `measureFrame`. `?rung=N` on the page puts the picture
on a rung and holds it; paused, the governor never moves it, so pictures are
always taken at the top rung unless a test asks. In unit tests, `game.place(x, y)` puts the
ball down at a lie.

## What is not there yet

Each of these is the first feature's to bring, with every gate green at
each step, and a gate handed what it needs in the same change:

- A cup with a rim. The package now in the game catches a ball slow enough
  to fall below the floor before it has crossed the hole, up to about 19 a
  second through the middle, and pulls in a slow one passing near (see
  `test/cup.test.ts`, on an open green); nothing throws a ball back out or
  turns it at the lip. On the first hole a ball that runs over banks off the
  rail a tile behind the cup and rolls back in, so the autopilot holes it in
  one every time. 0.4.0's rim brings lip-outs, with a table to choose the
  cup's width from; the cup test and the pars are set again then.
- The bunker and the bumpers, and their holes, which need 0.4.0's sand and
  bounce.
- Pars that are what the autopilot takes. It times its shots past what
  moves exactly, and v0.3.0 pulls a gentle ball into the cup from 2.5 past
  its rim, so it holes the obstacle holes in one on the median; each par is
  the hole's intent until 0.4.0 turns the pull off and the pars are set
  from the autopilot again.
- Where in the round a player is, in the save: a reload starts the round
  again, which is also why the fuzzer starts each seed part way round.
- Three things the game does for v0.3.0 that go with 0.4.0. It steps the
  physics a step at a time and takes a ball as holed the step before it
  drops below the grass inside the cup, because v0.3.0, given the floor's
  heights, takes a ball below its own tile's floor for one in rock and puts
  it out on the nearest lower tile, which is water if there is some near.
  A ball kept moving by the course for ten seconds may be struck where it
  lies, because v0.3.0's moving boxes carry a ball touching their face along
  with them for ever. And the autopilot's foresight of what moves.
- The physics the golf needs, from artshape-physics' next version: see
  `DESIGN.md`. Until it comes, a ball meets the rail with almost no bounce,
  and slows by drag, not by rolling resistance.
- Ball upgrades, which need the physics' bounce and roll by kind of body.

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

And the game's own, for anything new on a hole. The aim, the strokes and
the ball at rest are here now; the rest apply from the feature that brings
each:

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
