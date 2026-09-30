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
and the card at the end. Six courses are here, on artshape-physics v0.8.0.
The Meadow is nine holes of grass, rail, sand, water, raised grass, posts,
sliding barriers, a windmill and a conveyor, with a green that lets a putt
die, a rail and obstacles that bounce, posts that throw a ball back faster
than it came, and a cup with a rim. The Hills is four whose ground slopes,
each cup on the slope with its rim following the ground. The Downs is nine
holes half as long again, whose ground is a smooth surface of Perlin noise
and nothing else. The Moors is nine open holes six to fourteen times the size,
made by a generator, with ponds, bunkers and stands of posts on rolling hills.
The Range is the first of golf proper: three flat holes at a yard a unit, each
a tee, a fairway, rough and a green, played with a bag of eight clubs that
loft the ball into the air. The Links is nine holes of it, a par three to a par
five, made by a generator on hills, with bunkers, water, trees and out of
bounds, from the plan in `~/.claude/plans/ooergolf-proper-golf.md` (stage 3
of six is built). The golf goes in
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
| The biggest hole begun, and a frame of it drawn        | 400 ms begin, 5 ms a frame     | `perf`         |
| The physics, a frame, against the reference arithmetic | baseline ± 20%                 | `bench`        |
| Anything kept: bodies, slots, save bytes, heap         | ceilings in `scripts/leaks.ts` | `leaks`        |
| The look: colour, framing, contrast, shade and shape   | floors in `look-metrics.spec`  | `look:metrics` |

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
  shaded inner face; and The Volcano from its tee, sampled on each row at
  the point of its green that takes the most sun and the one that takes the
  least. `smoke/metrics.ts` reads them into five figures, each held to a
  floor: the green's saturation, how much brighter the course is than the
  rough, the sun against the shade, how much cooler the shade is, and the
  shape, how much brighter a hill's sunward flank is than the one turned
  from the sun, which reads one for a hill drawn as flat. The pictures are
  written again whenever a change is meant; the floors stay, so a greyer or
  flatter look is caught even then.
- **Fuzz:** the monkey strikes the ball any way at any power, strikes it
  well at the cup (the autopilot's shot, slipped), tries to strike it while
  it rolls or between holes, waits, reloads, asks for another round when
  one is over, chooses a course at the start or at the card, and looks
  round: the switch to Look, drags and pinches anywhere on the screen, the
  switch back, and nothing struck. It gets round every course. Each thing a
  player can do is an action in `scripts/fuzzer.ts`. On a golf hole it also
  chooses a club from the bag (and is refused one that is not in it) before
  most of its shots. `npm run fuzz` plays every seed three times, as a player who
  chooses among the courses and on The Range and The Links alone, since a monkey
  choosing among six is on golf too seldom to hold it to anything; each landing
  the game tells of is checked as it is told (`landingProblems`).
- **Invariants:** bodies are of a kind, are numbers and are out of the rock;
  the world's count is right; the time is a time; the ball is there while a
  hole is played, alone, never inside a post, and never faster along the
  ground than half as fast again as the hardest shot of the club that struck
  it, which is the most a post may throw it; a ball at rest lies on the
  floor or the top of a box or a post; the strokes are a count within the
  hole's limit; the card has a score for each hole finished and no other,
  each between one and the limit. And every knock the game tells of is of
  the live ball, where it is, at least `KNOCK.least` hard, in a direction
  of unit length (`knockProblems`, which the fuzzer checks each one by).
  And the camera keeps to its limits: turned within a turn either way,
  tilted within `TILT`, stood back within the zoom (`viewProblems`, checked
  after each look round). On a golf hole the club in hand is one of the
  bag's, and the ball is never faster in all, in the air as on the ground,
  than the club that struck it could send it and a fall from the highest
  ground make it, never at rest out of bounds and never inside a tree's trunk
  or canopy; each landing told is of the live ball, where it is, and at
  least `LANDING.least` hard (`landingProblems`).
- **Determinism:** the autopilot plays, with a player's slips from its own
  chance, round after round, and the hash takes in the hole and the card.
- **Pace:** the strokes a round of each course takes; see above. The
  autopilot does not read a slope's break, so on The Hills it is a player
  who aims straight and is carried by the ground. The golf courses are a player one under par on every hole: The Range 6.94 for
  pars of 3, 3 and 4, and The Links 30.25 for 36, each hole a stroke or so better than its par, since the
  autopilot plays like a good golfer and par is each hole's intent. The planner did not move The Range's
  figure (6.88 to 6.94): a player's slips, a tenth of the power and a few degrees, and the swing's own scatter,
  are far bigger than the unit or two it gains on the level; its worth is in `test/planner.test.ts`, on slopes
  and rises, and in `test/strategy.test.ts`, on a dogleg (3.4 strokes a round on a par four, and no ball lost
  in twenty-four rounds, where aiming at the cup across the corner lost one in every round).
- **Leaks:** ten minutes of the autopilot playing round after round, on The
  Meadow and again on The Range and The Links. The card is emptied each round and
  watched against the number of holes.
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
    npm run look:metrics   the look's colour, framing, contrast, cool shade and shape, held to their floors

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
  the pointers mean, by `Mode`: in Aim one pulled back is a shot, and in
  Look one dragged turns and tilts the camera (`ORBIT`: half a turn across
  the screen's short side, the ground near the ball going with the finger,
  so a drag right swings the camera left round the ball, and a drag down
  bringing the view lower) and never strikes; in both two are a pinch, and
  a second finger mid-drag takes the drag back. `src/input.ts` turns what
  the gesture says into the ball struck or the camera moved, through ports
  it is handed, so the page and the fuzzer press on the course alike.
  `src/camera.ts` says where the camera is: it follows the ball, and can be
  orbited right round it (`azimuth`, wrapped to a turn either way) and
  tilted between `TILT.least` and `TILT.most` (home is 0.78, 45 degrees; the
  lowest is 57 degrees only because the grass is what a frame costs, and a
  lower view draws far more of it: `TILT`'s comment has the figures, and the
  worst view is held under the 5 ms budget by `smoke/game.spec.ts`), and its
  lead of `LEAD` units turns with the view so the ball stays low on the
  screen. A new hole puts the switch back to Aim and eases the view home
  over the glide, by the shortest way; nothing of the view is saved.
  `src/quality.ts` is the ladder the picture steps down on a slow machine,
  and the governor that chooses the rung from the time between frames and
  how much of it the drawing takes: frames that come slowly but
  cost little (a page throttled to thirty a second, a low-power mode) are a
  slow screen and not a slow machine, and the governor once took them for one
  and gave the grass up twelve seconds in. The page measures the drawing by
  asking the queue when a frame is done, one frame in four. The grass is
  thinned on the ladder and never given up, and it always sways. All are
  arithmetic, tested without a page.
- `src/scene.ts` is a hole as it is drawn: the grass, the rail, the cup and
  flag, the tee's markers and the scenery, from the models. Each hole stands
  on the rough as a raised green: the rough lies `ROUGH_DEPTH` below the
  grass, under the bottom of the cup, so the cup is seen into, and the rail
  comes down to meet it. The look is `LOOK.md`'s clean toy, toon daylight
  on artshape-render v0.22.2, in `src/look.ts`, shared by the game and the
  showcase: edges drawn at four samples a pixel (the post pass one rung
  down the ladder, and none on the last), the toon bands eased at their
  edges, a cool blue-violet shade, a warm rim, the sky's light from above
  and a bounce off the grass from below, the form light, which keeps some
  of the sun's fall-off in the top band so a slope turned from the sun is
  darker than the flat and one facing it brighter (without it every slope
  a ball can roll on was drawn as bright as the flat, and the Hills had no
  shape), the toy finish the renderer gives every toon look (a highlight on
  what is smooth, the sky in a clear coat, one smooth ramp of light, shade
  toward the shade colour in a crease) and its soft tone, the renderer's screen-space
  occlusion where things meet, no film grain, and a haze so thin it only
  pales the far rough. The colours are named in `src/models/palette.ts`,
  the green, rough and rail among them, so the scene and the showcase are
  one green; the green has a fine grain of darker turf. `look:metrics`
  holds the look to its floors.
- The ground is read in one place. `heightAt(layout, x, y)` in `arena.ts`
  is how high the ground stands, the tile's step and the terrain smoothed
  between the tiles' middles by the cubic B-spline the physics' terrain
  uses; `stepAt` is the step alone, which is what makes a wall, so the
  autopilot judges a rise and a ball is put down level by it; `slopeAt` and
  `restingAbove` say how the ground slopes and how high a ball rests on it.
  A hole's slopes are an optional `terrain`: a grid the shape of its map, a
  digit a tile, half a unit each, or real heights, one a tile, row by row
  from the south (a `Float32Array`, which `layoutOf` copies and checks:
  finite, and not below nought). Digits are drawn, and heights are made,
  which is what `noise.ts` is for: quantised to digits, noise carries a
  ripple in its slope a third as big as the slope itself. Either is handed
  to the world in `physics.ts` on a hole that has any. The physics says what it refuses, `terrainRefusal`
  there asking its `terrainProblem`: neighbours side by side more than half
  a tile apart, rock and all. A cup may stand on a slope since v0.7.0, its
  rim following the ground, and the game draws it so: the cup's rim, liner
  and collar are lifted onto the ground by `lifted` in `models/shapes.ts`,
  its floor level. The game keeps its own copy of the smoothing, since only
  `physics.ts` imports the package, and a test holds it to the physics'
  own at hundreds of points. `src/ground.ts` draws the green
  as one mesh following it, in its stripes, with earth down its steps; and
  the rail (`railsOf`, to `RAIL`'s figures) as a rounded toy's, a cap
  painted along its top and rounded over every edge that stands in the
  open, plumb below that where the ball meets it, its corners rounded out
  and square in, drawn on its own tiles and no further so what is seen is
  what the ball meets, and sloping with the ground; `cupGround` is the
  cup's own step and slope, which the collar is cut to. The cup, flag, tee, sand, posts,
  aim, camera and glints all stand on it. The Hills are the holes that
  slope; `playCourse` in the test API plays one of a test's own.
  `src/glints.ts` says when the gold of the cup and the pin twinkles, from
  game time, and the page draws it as one of the renderer's glow quads.
- What moves only to be seen, all from game time so a picture is the same
  every run: `src/roll.ts` turns the ball as it rolls (the physics eases a
  ball at rest toward flat, as a coin, so its turn is no good for this),
  and the ball wears a band so the roll shows; `src/sway.ts` flies the flag
  down the hole's wind and leans the trees with it, in the renderer's own
  gusts, and the ripples that spread over a pond (`ripples`, `ringPlace`)
  and the ring where a ball went in (`splashRing`); `src/bursts.ts` is the
  particles for a stroke (grass, or sand from a bunker), the cup and water. The particles move only as a
  frame is drawn, so a test that pictures them steps a frame at a time, and
  their gravity is set on the renderer in world units (30, as Miner has).
  And everything answers, as `LOOK.md`'s stage 7 has it: the game tells of
  a `knocked` ball, whose velocity turned by at least `KNOCK.least` in a
  step (a rail met hard, a post, a drop off a step; never the green, sand,
  a slope or a belt, and one knock in `KNOCK.apart` unless a harder one),
  and `src/squash.ts` flattens the drawn ball against what it met and
  springs it round again within a tenth of a second; `waggle` in `sway.ts`
  swings the flag as a ball drops and `flash` in `glints.ts` lights the gold,
  and `sparkle` there twinkles the sun on the water (at most six on a hole,
  in the effects the gold leaves free);
  `src/pulse.ts` swells the aim's dots while a drag is held; and the
  camera's `glide` eases it to each new tee.
- `src/models.ts` and `src/models/` are the models: the cup with its
  rounded gold bead, the collar, the flag on its round pole with a gold ball
  on top and its cloth in soft folds, the tee's rounded markers, and the
  ball (`golfBall`, smooth, with its band), each rounded and smooth-shaded
  from `lathe` and the other shapes in `models/shapes.ts`; the obstacles at the sizes the physics will give them
  (bumper, barrier, windmill with its turning blades, water, bunker,
  conveyor). Water is a pond `WATER_LEVEL` (0.3) below the grass, in the
  earth `ground.ts` brings down to it from every edge of grass or sand that
  meets it, in a rim of foam, two bands of shallows and deep water veined
  in a lighter blue, filling its tiles exactly; its `moving` part is one
  fat ring of unit size, which the scene places as three ripples a pond
  and one where a ball went in, each coloured from its fade by a tint
  written every frame. `sandBed` is a hole's sand of any shape, raked in
  stripes 0.75 wide in two tones laid by world position so they run on
  across tiles, with the lip only where it meets grass, lit outside and
  shaded within, which the game draws where `bunker` is only the
  showcase's, built from it; and the decoration, moulded smooth from `models/smooth.ts`:
  puffball trees with a lighter crown, stacked pines rounded at every rim,
  pebbles, rounded hedges, flowering bushes and round posts and strings.
  Each returns its parts, a mesh and a
  material each, for `group` to turn into a renderer group; each has a
  triangle budget in `BUDGET`. `showcase.html` draws every one
  (`/showcase.html`, with `?model=name`), for building and looking at them.
- `src/scenery.ts` scatters the decoration round a hole, on the rough and
  clear of the course, from the hole's name and never the game's chance;
  and dresses the hole, with bunting on tall posts round three sides just
  outside the rail, beds of flowers at the rail's foot, and rocks in
  clusters, the scattered trees kept off the bunting. Its `clearings` are the
  discs of the rough round each rock, where no blade grows: the blades stand
  higher than a rock does. The flowers carry their blooms on stems
  (`BLOOM_TOPS`, in `models/decor.ts`) up out of the long grass, and a test
  holds every bloom above three blades in four at the smallest scale a clump
  is placed. All of it grows with the hole: `bigness(layout)` is the perimeter
  over that of the biggest hole drawn by hand (fifteen tiles by seventeen), and
  one for every hole that size or less, so a hole that was there has the very
  scenery it had (a test holds every one to a hash), and a bigger has as many
  pieces, tries and rock clusters again as it is bigger, and its bunting on
  each side in strings of at most `REFERENCE.string` (60) units, each between
  posts of its own.
- `src/turf.ts` is a hole's grass, as the renderer's GPU grass grows it: a
  field of cells saying where the rough grows (off the course,
  down where the rough lies, and on past the field as its `outside`), and
  the hole's own wind from its name. The rough is long, lush grass: forty
  blades a square unit, 1.6 tall and a third more or less, its tallest still
  under the level of the course; the blades sway in a wind that bends them
  about 30 degrees across the ground at one moment, in gusts eight units
  across that the renderer carries downwind at five units a second, which
  is the flow, so ripples roll across the rough (and the flag and trees
  follow the same gusts). `GRASS` is how the renderer thins it: `near`,
  `mid` and `far` are the game's own, since the renderer's scale with the
  blade's height and would keep every blade for eighty units, and `BLADE_ROOM`
  is its room for blades in a frame, which the smoke test holds every hole
  at every zoom well short of. The standard view costs 2.5 ms of the 5, and
  the ladder's rungs 1.3, 0.9 and 0.5 at the home view. No blade grows on the course:
  the green is painted, in its two stripes, by the scene (`PALETTE` in
  `scene.ts`), as `LOOK.md`'s clean look has it, and the ball leaves no
  track. The page hands the field to the renderer when a hole begins, and
  the first frame waits for the grass. Under the rough's blades, the scene
  paints the ground in the colour the renderer gives for between them
  (`grassGround`), so the thinned rungs hold the field's colour. The field
  is a texture the renderer limits to `MAX_SIDE` (1024) cells a side, and
  the finest cell, a quarter of a unit, covers a hole of sixty tiles across
  and no more: `cellFor` takes the finest of `CELLS` (each goes a whole
  number of times into a tile, so the course's edge falls between cells)
  that fits, which for every hole drawn by hand is the quarter, and for a
  bigger one coarser, up to 489 tiles a side with the 1.5 cell, and refuses
  a bigger by its size. A coarse cell clears every cell a rock's clearing
  touches, and the margin round the course is a whole number of cells so its
  edge lies on a tile's. What a hole costs to begin grows with its tiles,
  about 8 microseconds each, and not with its cells: the `perf` gate holds
  the biggest.
- `src/debug.ts` is `window.game`, the test API. `src/invariants.ts` lists
  the rules that must always hold. `src/autopilot.ts` plays the game by
  itself, for the gates and for par; its route over the tiles (`pathToCup`)
  is a search with a heap, n log n, and a test holds it to the plain way of
  finding it, on every hole and on random maps, because looking at every tile
  for the nearest each time was n squared and took twelve seconds a shot on a
  hole of a hundred thousand tiles.
- Golf is a layout that is `golf`, which `layoutOf` says of a map drawn in `f`
  fairway, `r` rough, `g` green and `t` tee's box (refused by name if mixed
  with `.` or the digits), beside the same `T`, `C`, `s`, `~`, `o` and `#`.
  `lieAt(layout, x, y)` is the one place the ground's kind is read, by `LIE`,
  and `src/surfaces.ts` is the leaf table of what each kind does: its `roll`
  (which is also the slope it holds a ball on, asin of the roll over 70), how
  much of its speed a landing `keep`s and how much it hops (`bounce`), and
  what it takes off a club from that lie (`power`, `loft`, `wild`). A hole of
  minigolf is given none of it and plays as it did (the pace figures and its
  pictures hold).
- `src/bag.ts` is eight fixed clubs (nothing bought, nothing saved), each a
  loft and a launch speed; a unit is a yard, the driver carries 250. `carrying`
  is the one formula for a carry (speed squared times sin of twice the loft
  over gravity), to which the game's own flights are held within 8%.
  `src/flight.ts` turns a club, a power, an aim and a lie into a launch
  (`strike`), with a scatter that grows with the power and never adds speed,
  from the game's `random`, and none, no chance spent, for the putter.
- `Game` on a golf hole holds the club in hand (`inHand`, `pick`, the driver
  at each tee) and lands the ball: a step that met the ground going in faster
  than `LANDING.least` has the speed along the ground cut to `keep` less the
  steeper it came down, and hops by `bounce`, along the slope. That, and not
  `roll`, is what makes a driver run on an eighth of its carry and a wedge a
  thirtieth (`surfaces.ts` says why); `landed(x, y, speed, first)` tells of
  it. Golf pays no coins, and the rail is a wall to a ball in the air.
- `src/range.ts` is The Range (`rangeHole`: tee box, fairway, rough, round
  green, bunker if asked): Pitch and Putt 105, Iron Alley 175, The Long Way 330. A `Course` has `golf`, held by a test to its holes' layouts. `ground.ts`
  draws each kind of golf ground as a mesh of its own colour; the rough is
  painted, growing no blades inside the rail. `src/marker.ts` is the ring at a
  first landing, from game time; the camera follows a lofted ball up and
  catches up faster the faster it flies (`catchUp`).
- Out of bounds is `x` in a golf map: rough to roll on and play from, and a ball on the ground on it is lost, as one
  in water is (a stroke, `outOfBounds(x, y)`, the ball put back where it was struck from; `Game.putBack` is both), and
  one in the air over it is not. It is drawn dry and pale, with a stake (`stakesOf`, `models/decor.ts`'s `stake`)
  every second tile of the line; `place` refuses it, and an invariant says a ball never rests on it. A tree is `^`:
  its trunk is a post the physics has (`TREE`, in `src/trees.ts`) and its canopy a cone the game tests the ball's
  step against (`hitCanopy`, `turned`): a drive at twenty units high is stopped and drops, a high wedge (about 26 to
  51 units short of it) goes over, and one rising into the underside is knocked down. What is drawn is what is met:
  `golfTree`'s tiers lie inside the cone a ball's radius bigger, which a test holds.
- `src/golf.ts` makes a golf hole from a `GolfSpec` and a seed (`golfHole`): a fairway along a way of play bent once
  (`bend`), rough, out of bounds and rock round it, a green, a tee's box, bunkers at the green and along the fairway,
  ponds set in hollows, trees in clusters in the rough, all placed clear of the tee and the cup, and the ground hills
  with the tee, the green and every bed levelled, made gentler until the tee, fairway and green rest a ball. It refuses
  a spec that cannot be made, by name. `src/links.ts` is The Links: nine specs, made when first asked for, each seed
  chosen by playing forty with the pace gate's player and looking. A hole of 560 yards is 24,000 tiles of map and
  8,500 of ground: 82 ms to begin in the page, 3.9 ms a frame at its worst view, held by `perf`.
- The autopilot's golf shot is tried before it is taken. `Game.rehearsal()` is a game of the same hole that no one
  plays, chance held in the middle so a trial is the shot struck true, and only it may `trial(x, y)`; `refine`
  (`src/planner.ts`) corrects a candidate's power in proportion and its aim by the angle it was out by until the
  ball rests where it is meant to or drops. `src/route.ts` is the way to the cup over ground a ball is played from
  (round water, out of bounds, rock and canopies; the fairway cheapest), and `strokesToGo` judges a resting ball by it,
  by its lie and by whether it is under a tree. The candidates are the arithmetic's (`golfCandidates`: the two shortest
  clubs that reach, the putter for a chip and run) at the cup, and lay-ups (`golfLayUps`): the longest few clubs at the
  place on the route they reach; `choose` tries each, judges it by where it rests (a ball lost is the stroke again and
  one more) and the best few again a little to either side and short, as a swing's scatter has them, and takes the best,
  the putter before any and then the earliest. A `Plan` says where it expects the ball to rest (`expect`), which is
  what happens, to the digit, when the swing is true. A shot is fifteen or so trials of 0.3 ms. `planProblems` is the
  rule that a plan is a shot, and the fuzzer checks each it takes.
- `src/hud.ts` is the words over the course: the hole and strokes, the
  score's name when a hole is done, the card, the coins and gems, the
  shop, and the start screen, a card for each course with its holes and
  par, shown at boot and from the card's Courses button. The page plays no
  shot while it is up. `src/score.ts` names a score and says what kind it
  is, which colours its callout. Both are given what to show and never read
  the game. How the words look and move is `index.html`'s stylesheet, in the
  clean toy of `LOOK.md`: bright panels with a thick coloured edge, chunky
  pill buttons that sink when pressed, the score popped in as a tilted
  sticker, and every panel arriving with a short spring, none under reduced
  motion; in the system's rounded face, as decided. The Aim | Look switch
  (`#viewMode`) is a pill at the bottom right above the ms label, and the
  bottom slot on a phone; it is shown with the course's other panels and put
  away under the start screen, and the help beside it says what a drag does.
- `src/noise.ts` makes ground from noise: `gradientNoise(seed)` is Perlin's,
  and `noiseGround(layout, { seed, feel, steepness })` a hole's heights from
  it, the same for a seed every time, never below nought, with optional
  level discs (`flats`, for a pond at nought and a bunker's bed, each with an
  optional `blend`, the tiles it takes to come back to the noise) made before
  the steepness is set, the steepest step
  between neighbouring tiles exactly `steepness` of the physics' limit of
  half a tile, and flat round the tee and the cup so a ball rests on the one
  and beside the other. A feel (`FEELS`) is the noise's shape: `gentle`, a
  broad swell a ball rests on everywhere; `rolling`, swells the width of the
  hole; `choppy`, small bumps (a height a tile cannot draw one smaller than
  about three tiles, so choppy is no more than about 1.4 times as bumpy as
  rolling); `rolling and choppy`; and `hills` and `long hills`, swells thirty
  and forty-five tiles (ninety and a hundred and thirty-five units) across. A
  swell's height is about its width times the slope over six, so the small
  feels, whose swells are eighteen to twenty-four units, are a ripple a ball's
  width high on a hole of a hundred and fifty units at any steepness, and hills
  stand four to five times as high at the same one, and are smooth: The Moors
  are cut from them, and a test holds each to its relief, its smoothness and
  the share of it a ball rests on. `test/ground-metrics.ts` says what a
  feel is in figures (relief, steepest slope, bumpiness, detail, and how much
  of the ground a ball rests on), which the tests hold each hole to.
- The courses are content in `course.ts`, `COURSES`, each a name and its
  holes: The Meadow (`COURSE`), The Hills (`HILLS`), The Downs (`DOWNS`,
  built from `DOWNS_SPECS`: a shape, a feel, a steepness and a seed a hole,
  and nothing on it but the ground, which is the obstacle). The Downs' holes
  are 1.5 times as long, tee to cup, as the thirteen there were, on the mean
  (a test holds it to 1.45 to 1.55 against them), and a seed was chosen for
  each by measuring the figures of forty and looking at the pictures; the
  last three build in steepness. The Moors (`moors()`, from `MOORS_SPECS`, made
  when first asked for and not as the page loads, which cost the boot some
  thirty milliseconds; each `Course` has a `summary` of its holes and par that
  the start screen reads without making it) are nine open holes from 8,000 to 19,000 square units, five and a half to
  fourteen times The Downs' mean, a hundred to a hundred and fifty units from
  tee to cup, made by `openHole` in `src/open.ts` from a spec (a shape, a feel,
  a steepness, a seed and a list of `Feature`s: ponds, bunkers and stands of
  posts) and never by hand. The generator places each feature clear of the
  tee, the cup and the rail and a tile from the next, and never so that no
  route three tiles wide is left from the tee to the cup; a pond is centred in
  the lowest of the ground and levelled at nought, since the game's water is at
  a fixed height under the ground and a pond on a hill would be a pit, and a
  bunker is on a level bed, both through `noiseGround`'s level discs, whose
  blend is a share of the feel's swell (`BLEND`): over the two tiles a disc
  used to come back in, a pond's bed at nought under a bank several units high
  was the steepest step in the hole, and the ground is scaled so that is what
  was asked, which left the hills round a pond a third of their height. A spec
  that cannot be made is refused by name. Each Moors seed was chosen by playing
  forty with the pace gate's player, and a hole's name draws its wind, which
  must move the grass (`test/turf.test.ts`): two names were changed because
  they did not. The cup stands at least two tiles in from the rail. A hole is a map drawn
  as seen from the tee (`#` rail, `.` grass, `T` tee, `C` cup, `~` water,
  `s` sand, `o` a post on grass, a digit for grass raised that many steps of
  0.4, space for off the course),
  a par, what moves on it, by map tile, and its `terrain`; and the cup's
  size. Hole names are unique across the courses, since the save keeps a
  best score by name. A step the
  ball rolls up; three (1.2) are a wall to it. Water is a floor below the
  world's bottom: a ball in it is lost, a stroke is added, and it is put back
  where it was struck from; what is drawn is a surface at `WATER_LEVEL`,
  which the ball never meets. `src/obstacles.ts` says where a barrier, a
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
  practice green whose cup is out of the way of tests of the ball,
  `groundFigures(layout)` in `test/ground-metrics.ts` for a ground's relief,
  steepness and bumpiness, `SAMPLE_HOLES` in `test/helpers.ts` for the slow
  tests that try every tile of every hole (all but three of The Moors), and
  `memoryStore` in `src/progress.ts` for a save that is not the player's;
  `field(surface, rows, cols, terrain?)` for a golf hole that is one surface end to
  end (the tee in a box of its own at the south, the cup out of the way in the
  far corner) and `golfGame(hole, random)` for a game on it whose chance says
  the middle, so a club strikes true, with every event told with all its
  arguments (`calls`); and in `smoke/panels.ts`, `read(page)` for every text's contrast against
  its panel, what reaches past the screen's edges and each button's height,
  with `holeOut` and `toCard` to get there.

## The test API

`window.game`, in `src/debug.ts`, typed, and the smoke tests compile against
it. Time: `pause`, `resume`, `step(frames)`, `seed(n)`, and `?seed=N` and
`?paused=1` on the page. Reading: `state` (with `strokes` and `ready`),
`ball`, `bodies`, `content` (the hole's grass, tee and cup, its sand and
posts, trees, the hardest shot, and every hole's name and par), `events`,
`invariants`, and `aiming`,
the shot a drag under way would make. `state` has the hole, its par, the
phase (`play`, `done`, `over`), the card, the coins and gems, the club in
hand and those owned, the hardest shot the club in hand strikes, the
course's name, whether the start screen is up (`choosing`), and whether the
hole is golf and the club of the bag in hand (`golf`, `inHand`).
Playing: `shoot(angle, power, club?)` (with a club of the bag put in hand
first, on a golf hole), `club(id)`, `bag()` (each club's loft, hardest launch
speed and carry) and `suggest()` for the autopilot's shot from
where the ball lies (with its `club` on a golf hole), `chooseCourse(name)`, which presses that course's
button on the start screen, `startHole(index)`, `playCourse(holes)` for
holes of the test's own that are not on a course, `newRound()`, `buy(id)`,
`equip(id)`, and `drag(page, from, to, { touch, hold })` in
`smoke/game.ts` for a real mouse or finger, pressed where `project(x, y,
z)` says a point on the course is on the page. Setting a scene: `place` for
a body that exists (raw: on a hole that slopes, `lay(x, y)`, the game's own, puts the ball down on the ground there),
`save`, and `start(page, { save, seed, paused, rung })`
for a save that is not the player's, which chooses The Meadow unless given
`screen` to leave the start screen up, and `touches(page, steps)` for fingers, several at once.
Looking: `look(x, y, distance)` parks the camera until `follow`, `view()`
says how far back it stands and which rung of the quality ladder the
picture is on and whether the grass sways (`swaying`), what a drag is (`mode`,
`aim` or `look`) and how the view is turned and tilted (`azimuth`, `tilt`),
`orbit(turn, tilt)` turns it as a Look drag does, and `measureFrame`;
`judge(frames, gapMs, workMs)` feeds the quality governor as the frame loop does, and says
the rung; `grass()` how many blades of the rough the last frame drew near
and far, and the wind; `bladesAround(x, y, radius)` how many the GPU drew
with roots there; `motions()` where each of
the things that answer is (the ball's squash, the flag's waggle, the gold's
flash and the glints the last frame lit, the camera's glide and the aim's
pulse, the sparkles of the water and where on the page each was drawn, how
wide the ring is where a ball went into the water, what the last stroke
threw up, sand or grass, and where the ring is that marks a lofted ball's
first landing and how wide), read back from what the last frame placed. `?rung=N` on the page puts the picture
on a rung and holds it; paused, the governor never moves it, so pictures are
always taken at the top rung unless a test asks. In unit tests, `game.place(x, y)` puts the
ball down at a lie.

## What is not there yet

Each of these is the first feature's to bring, with every gate green at
each step, and a gate handed what it needs in the same change:

- The rest of golf, from `~/.claude/plans/ooergolf-proper-golf.md`: stage 4, the camera and aim (an overview of the
  hole, the distance and height to the pin, the aim to the landing, not only the direction); stage 5, shape, spin
  and wind; stage 6, putting greens with contour, a fringe and the break shown, which the planner leaves to the
  arithmetic putt. What stage 3 leaves as it found it: a golf hole's rough is painted and grows no blades inside
  the rough's edge (its wild grass beyond the stakes does grow, which is the turf's own), its green is round and
  stepped by the tile, so are its bunkers, there is no first cut, an invisible wall stands beyond out of bounds, a ball
  landing on a post's top or a box is left as the physics has it, the club in hand is not saved, the camera can lose
  the ball behind a tree at a low tilt, and the planner aims at the cup or a place on the route and knows nothing of
  the wind (there is none), a green's contour (there is none) or a lay-up chosen for the next shot's sake.

- An autopilot that keeps a margin from water that grows with the shot. It
  skirts a pond by 1.3 units, and a 5% slip over a 45-unit shot wanders 2.3,
  so on a big hole with a pond on its line it can splash four or five times
  and be picked up at the limit (three seeds of sixteen on an open spec);
  a margin that grows would move the pace of the courses there are.
- Holes past what the grass field, the frame and the look allow. A cell of
  1.5 lifts the field's limit to 489 tiles a side; a frame at 400 by 400
  tiles is 4.7 ms of the 5, since a bigger hole draws more ground; and some
  holes of 200 tiles a side and more show rough blades pale and frosty near
  the camera, which was not the shadow's fit or the cell and is not
  understood. Nothing of The Moors is near them.
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
- Orbiting by the right mouse button, the keys or a two-finger twist: only
  the switch and a one-pointer drag turn the view. The view is not saved.
  The near rail can hide the ball at a low tilt from some headings, and
  catches a strong pale sheen from some: both are left as they are.
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
  in the hole's wind; whether it is lost in the long grass (a rock is given
  a clearing, a flower stems above the blades), and whether the grass
  survives every rung of the ladder

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
  something taller than the ball; turned to every heading and tilted to
  both limits, at the home zoom and the widest, where the grass costs most

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
