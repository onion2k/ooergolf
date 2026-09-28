# Ooergolf: working on it

Golf in 3D on the top-down mechanic (aim, set the power, let go), played as
a physics game through obstacles, fewest strokes to the cup. TypeScript,
Vite, and WebGPU through
[artshape-render](https://github.com/onion2k/artshape-render), with the
physics from [artshape-physics](https://github.com/onion2k/artshape-physics).
The README says what the game is, `DESIGN.md` what it is to be, and
`LOOK.md` what it is to look like, in stages; this file says how it is
made. The house
rules in `~/.claude/CLAUDE.md` apply too. What is in `src/` is a round of
a course, chosen on a start screen: holes drawn as maps, each played from
its tee to its cup with a drag pulled back and let go, scored against par,
and the card at the end. Two courses are here, on artshape-physics v0.8.0.
The Meadow is nine holes of grass, rail, sand, water, raised grass, posts,
sliding barriers, a windmill and a conveyor, with a green that lets a putt
die, a rail and obstacles that bounce, posts that throw a ball back faster
than it came, and a cup with a rim. The Hills is four whose ground slopes,
each cup on the slope with its rim following the ground. The golf goes in
a feature at a time, in the order `DESIGN.md` gives.

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

| Property                                               | Budget                         | Held by        |
| ------------------------------------------------------ | ------------------------------ | -------------- |
| Boot, page start to the frame loop running             | 3000 ms                        | `perf`         |
| Download, scripts and styles gzipped                   | 400 kB                         | `perf`         |
| A frame drawn, lower quartile at the standard view     | 5 ms                           | `perf`         |
| The physics, a frame, against the reference arithmetic | baseline ± 20%                 | `bench`        |
| Anything kept: bodies, slots, save bytes, heap         | ceilings in `scripts/leaks.ts` | `leaks`        |
| The look: colour, framing, contrast, a cool shade      | floors in `look-metrics.spec`  | `look:metrics` |

A budget is what the game may cost at all; a baseline is what it cost at
the last commit, held both ways, so a step toward a budget is noticed as
much as a step over it. The perf tolerances are the measured wobble of a
headless boot and a GPU frame, and say so in the file.

The pace gate holds the strokes a round of each course takes, the mean over
sixteen seeds, each course held to its own figure, played by the autopilot with a player's slips: a few degrees of aim, a
tenth of the power. A median was tried and jumps a whole stroke between
sets of seeds; the mean held within 5%, so the tolerance of a fifth is four
times its wobble. `npm run pace` prints each hole's median against its
par. Par is each hole's intent, not what this player takes: it times its
shots past what moves exactly, and holes the obstacle holes in one on the
median even with the cup's rim. A player's timing slip was tried, and at
0.6 s the mean rose to 17 while those holes stayed at one or two; the pars
were kept at the retune on 28 September 2026.

## What the gates hold now

A gate that holds little looks like one that holds a lot. What each holds
today, and what the next features must hand it:

- **Unit tests, smoke, look, perf:** the real thing. They grow as any
  feature's tests do.
- **Look metrics:** a close view of the first hole's right-hand rail,
  sampled at points on the green, the rough, the rail's sunlit top and its
  shaded inner face, and read by `smoke/metrics.ts` into four figures, each
  held to a floor: the green's saturation, how much brighter the course is
  than the rough, the sun against the shade, and how much cooler the shade
  is. The pictures are written again whenever a change is meant; the floors
  stay, so a greyer or flatter look is caught even then. The floors are the
  look after stage 1 of `LOOK.md`, and stage 3 raises them.
- **Fuzz:** the monkey strikes the ball any way at any power, strikes it
  well at the cup (the autopilot's shot, slipped), tries to strike it while
  it rolls or between holes, waits, reloads, asks for another round when
  one is over, and chooses a course at the start or at the card. It gets
  round both courses. Each thing a player can do is
  an action in `scripts/fuzzer.ts`.
- **Invariants:** bodies are of a kind, are numbers and are out of the rock;
  the world's count is right; the time is a time; the ball is there while a
  hole is played, alone, never inside a post, and never faster along the
  ground than half as fast again as the hardest shot of the club that struck
  it, which is the most a post may throw it; a ball at rest lies on the
  floor or the top of a box or a post; the strokes are a count within the
  hole's limit; the card has a score for each hole finished and no other,
  each between one and the limit.
- **Determinism:** the autopilot plays, with a player's slips from its own
  chance, round after round, and the hash takes in the hole and the card.
- **Pace:** the strokes a round of each course takes; see above. The
  autopilot does not read a slope's break, so on The Hills it is a player
  who aims straight and is carried by the ground.
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
    npm run look:metrics   the look's colour, framing, contrast and cool shade, held to their floors

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
  v0.19.0, in `src/look.ts`, shared by the game and the showcase: with the
  renderer's screen-space occlusion for the shade where things meet, and a
  thin haze. Its fog is lit by a toon sun of 2.5, so it is kept thin and
  dark: at the sky's own colour it washed the whole course white.
- The ground is read in one place. `heightAt(layout, x, y)` in `arena.ts`
  is how high the ground stands, the tile's step and the terrain smoothed
  between the tiles' middles by the cubic B-spline the physics' terrain
  uses; `stepAt` is the step alone, which is what makes a wall, so the
  autopilot judges a rise and a ball is put down level by it; `slopeAt` and
  `restingAbove` say how the ground slopes and how high a ball rests on it.
  A hole's slopes are an optional `terrain` grid the shape of its map, a
  digit a tile, half a unit each, handed to the world in `physics.ts` on a
  hole that has any. The physics says what it refuses, `terrainRefusal`
  there asking its `terrainProblem`: neighbours side by side more than half
  a tile apart, rock and all. A cup may stand on a slope since v0.7.0, its
  rim following the ground, and the game draws it so: the cup's rim, liner
  and collar are lifted onto the ground by `lifted` in `models/shapes.ts`,
  its floor level. The game keeps its own copy of the smoothing, since only
  `physics.ts` imports the package, and a test holds it to the physics'
  own at hundreds of points. `src/ground.ts` draws the green
  as one mesh following it, in its stripes, with earth down its steps, and
  the rail with a top that slopes with it; the cup, flag, tee, sand, posts,
  aim, camera and glints all stand on it. The Hills are the holes that
  slope; `playCourse` in the test API plays one of a test's own.
  `src/glints.ts` says when the gold of the cup and the pin twinkles, from
  game time, and the page draws it as one of the renderer's glow quads.
- What moves only to be seen, all from game time so a picture is the same
  every run: `src/roll.ts` turns the ball as it rolls (the physics eases a
  ball at rest toward flat, as a coin, so its turn is no good for this),
  and the ball wears a band so the roll shows; `src/sway.ts` flies the flag
  down the hole's wind and leans the trees with it, in the renderer's own
  gusts, and swells the ripples; `src/bursts.ts` is the
  particles for a stroke, the cup and water. The particles move only as a
  frame is drawn, so a test that pictures them steps a frame at a time, and
  their gravity is set on the renderer in world units (30, as Miner has).
- `src/models.ts` and `src/models/` are the models: the cup, collar, flag
  and tee markers; the obstacles at the sizes the physics will give them
  (bumper, barrier, windmill with its turning blades, water, bunker,
  conveyor), with `sandBed` for a hole's sand of any shape, the lip only
  where it meets grass, which the game draws where `bunker` is only the
  showcase's; and the decoration. Each returns its parts, a mesh and a
  material each, for `group` to turn into a renderer group; each has a
  triangle budget in `BUDGET`. `showcase.html` draws every one
  (`/showcase.html`, with `?model=name`), for building and looking at them.
- `src/scenery.ts` scatters the decoration round a hole, on the rough and
  clear of the course, from the hole's name and never the game's chance;
  and dresses the hole, with bunting on tall posts round three sides just
  outside the rail, beds of flowers at the rail's foot, and rocks in
  clusters, the scattered trees kept off the bunting.
- `src/turf.ts` is a hole's grass, as the renderer's GPU grass grows it: a
  field of quarter-unit cells saying where the rough grows (off the course,
  down where the rough lies, and on past the field as its `outside`), and
  the hole's own gentle wind from its name. No blade grows on the course:
  the green is painted, in its two stripes, by the scene (`PALETTE` in
  `scene.ts`), as `LOOK.md`'s clean look has it, and the ball leaves no
  track. The page hands the field to the renderer when a hole begins, and
  the first frame waits for the grass. Under the rough's blades, the scene
  paints the ground in the colour the renderer gives for between them
  (`grassGround`), so the lowest rung, which gives the grass up, is the same
  course without it.
- `src/debug.ts` is `window.game`, the test API. `src/invariants.ts` lists
  the rules that must always hold. `src/autopilot.ts` plays the game by
  itself, for the gates and for par.
- `src/hud.ts` is the words over the course: the hole and strokes, the
  score's name when a hole is done, the card, the coins and gems, the
  shop, and the start screen, a card for each course with its holes and
  par, shown at boot and from the card's Courses button. The page plays no
  shot while it is up. `src/score.ts` names a
  score. Both are given what to show and never read the game.
- The courses are content in `course.ts`, `COURSES`, each a name and its
  holes: The Meadow (`COURSE`) and The Hills (`HILLS`). A hole is a map drawn
  as seen from the tee (`#` rail, `.` grass, `T` tee, `C` cup, `~` water,
  `s` sand, `o` a post on grass, a digit for grass raised that many steps of
  0.4, space for off the course),
  a par, what moves on it, by map tile, and its `terrain`; and the cup's
  size. Hole names are unique across the courses, since the save keeps a
  best score by name. A step the
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
  with a version bump here, as v0.4.1 was for a ball put to sleep in the
  mouth of the cup. It builds a hole's world: the green's steady slowing
  (`ROLL` in `arena.ts`) on every tile but a belt's, which has none, so a
  belt carries at its own speed; the rail's bounce and the obstacles'
  (`BOUNCE`); the cup with its rim and no pull (`CUP` in `course.ts`), told
  from the water by the hole the physics reports; and a ball never put to
  sleep in the air or going faster than 2, banked off the rail as off one
  flat wall, and moved in pieces when it is fast. A shot's power is how far
  it rolls, and `strikeSpeed` and `powerFor` in `arena.ts` go between that
  and a speed.

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
`ball`, `bodies`, `content` (the hole's grass, tee and cup, its sand and
posts, the hardest shot, and every hole's name and par), `events`,
`invariants`, and `aiming`,
the shot a drag under way would make. `state` has the hole, its par, the
phase (`play`, `done`, `over`), the card, the coins and gems, the club in
hand and those owned, the hardest shot the club in hand strikes, the
course's name, and whether the start screen is up (`choosing`).
Playing: `shoot(angle, power)`, `suggest()` for the autopilot's shot from
where the ball lies, `chooseCourse(name)`, which presses that course's
button on the start screen, `startHole(index)`, `playCourse(holes)` for
holes of the test's own that are not on a course, `newRound()`, `buy(id)`,
`equip(id)`, and `drag(page, from, to, { touch, hold })` in
`smoke/game.ts` for a real mouse or finger, pressed where `project(x, y,
z)` says a point on the course is on the page. Setting a scene: `place` for
a body that exists, `save`, and `start(page, { save, seed, paused, rung })`
for a save that is not the player's, which chooses The Meadow unless given
`screen` to leave the start screen up, and `touches(page, steps)` for fingers, several at once.
Looking: `look(x, y, distance)` parks the camera until `follow`, `view()`
says how far back it stands and which rung of the quality ladder the
picture is on, and `measureFrame`; `grass()` how many blades of the rough
the last frame drew near and far, and the wind. `?rung=N` on the page puts the picture
on a rung and holds it; paused, the governor never moves it, so pictures are
always taken at the top rung unless a test asks. In unit tests, `game.place(x, y)` puts the
ball down at a lie.

## What is not there yet

Each of these is the first feature's to bring, with every gate green at
each step, and a gate handed what it needs in the same change:

- An autopilot that reads a slope's break. It aims straight at the cup and
  judges the distance along the level: it stops within 0.6 units of where
  it means on four shots across a hollow in five, and 2.4 long on a 21-unit
  climb, since the physics slows a ball along the slope. So The Hills' pars
  are each hole's intent, and the autopilot takes one or two on each on the
  median. A barrier or a windmill on a slope is refused when a hole is
  built, as the physics' fuzzer found one carrying a ball round for good.
- The course a player is on, in the save: a reload opens the start screen.
- Steps a ball meets as ledges. v0.8.0's `stepEdges` bounces a ball off a
  step's top edge and lets it climb a riser only with speed; tried on the
  game, Up and Over's median went from 2 to 4 and four tests failed, so it
  is off in `makeWorld` until the stairs are ramps of terrain.
- The ninth hole's own, as `DESIGN.md` has it, with everything on it: The
  Mill Race has no sand and no post yet.
- Pars that are what a player takes: see the pace gate, above. The
  autopilot would need a player's timing, measured against real play.
- Where in the round a player is, in the save: a reload starts the round
  again, which is also why the fuzzer starts each seed part way round.
- Ball upgrades: the physics has bounce and roll by kind of body.
- A shop that shows how far each putter reaches. It shows each one's
  hardest speed, 40 to 48, and under the green's steady slowing a little
  more speed goes a good deal further: the gold rolls 72 units to the
  putter's 50.

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
- **the grass:** whether the rough grows under it, and whether it moves
  in the hole's wind

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
