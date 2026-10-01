# ooergolf

Golf in 3D, played like a physics game. The shot is the top-down one: aim,
set the power, let go. What the ball meets on the way is the game: slopes,
walls, and obstacles that knock it about, all of it simulated, so a hole is
a contraption to be read and not a lawn to be crossed. Fewest strokes wins.

Built on [artshape-render](https://github.com/onion2k/artshape-render) and
[artshape-physics](https://github.com/onion2k/artshape-physics), from
[artshape-game-template](https://github.com/onion2k/artshape-game-template),
and held from the first commit to three properties as numbers: it loads
fast, draws fast and has no bugs.

## How it is played

A round of holes, on a course chosen from the start screen, each a striped green raised on timber sides, with trees,
hedges and flowers round it, from a tee between two markers to a gold-rimmed
cup with a flag in it. Drag anywhere, back from where the ball should go,
and let go to putt: the dots show the way and how hard. The ball rolls,
banks off the rail and comes to rest, and then it can be struck again, until
it drops. The score is named against par (a birdie, a bogey), the next hole
begins, and after the last the card is shown, with a button for another
round. A hole pays coins, more for beating par, and a hole in one pays a
gem; the shop sells finer putters that strike harder. The coins, the clubs
and the best score on each hole are kept in the browser. The camera follows
the ball; the wheel zooms on a desktop, and two fingers pinch on a phone. A
switch, Aim or Look, chooses whether a drag strikes the ball or turns and
tilts the camera right round it, and a flag button beside it turns the camera to face the flag. On The Range and The Links, the courses of golf, a bag of
eight clubs sits over the course: choose one, and the same drag swings it, the
ball flying at the club's loft, coming down in a ring that marks where, hopping
and running on by what it landed on, with a scatter that grows the harder it is
struck. The Links is nine holes of it on hills, with bunkers and water, trees that
stop a drive and a high wedge goes over, and out of bounds past the white stakes,
where a ball lost costs a stroke and is played again from where it was struck. On a
golf hole the camera stands back and tips lower for the club in hand until where it
would come down is on the screen; a drag draws the shot's flight as an arc to a ring
(blue over water, red out of bounds, with a spread showing how far a swing may miss
it), the bag says how far and onto what, the strokes say how far the pin is and how
much higher or lower, and a map of the hole sits at the side. A shot can be shaped, a
draw or a fade that curves in the air, and spun, backspin to check it and topspin to run
it on, each chosen by a button in the bag; and the holes of The Links have a wind, shown
under the strokes as an arrow and a speed, that pushes a ball for as long as it is in the
air, and which the drawn flight already allows for. The greens of The Links have a first cut
round them and a tilt and swells in them, and run fast or slow by the hole: while the ball
rests on one, arrows over it show which way the ground carries a ball, the panel says how
fast the greens are and how far to aim off the cup, and a putt being aimed is drawn as its own
roll, curving across the slope to where it will stop. A
machine that cannot keep up has the picture stepped down a rung at a time.

The green is painted smooth in its mown stripes, and the rough round it is
real blades, bending in each hole's own wind.

Nine holes so far: a straight putt, a dog-leg, a bunker in front of the
cup, a pond, sliding barriers, a field of pinball posts, a ramp up onto a
plateau between ponds, a windmill whose blades sweep its door, and The Mill
Race, with a barrier, the windmill and a conveyor to the cup, make The
Meadow. Sand slows the ball hard, and water costs a stroke, the ball coming
back to where it was struck from. The Hills is four more whose ground
slopes: a hollow to carry, a volcano to stop on top of, a bowl, and a
side-hill that breaks every putt.

## What is here

Five decisions made in the first commit, because each is cheap on day one
and dear to retrofit:

- **The game runs without the page.** `src/game.ts` knows nothing of the
  renderer or the DOM, so it is stepped headless in Vitest and in every
  script. `src/main.ts` presents it.
- **Chance comes from one seeded source.** `Game` is handed a `random` and
  never touches `Math.random`. The same seed gives the same game, which is
  what the fuzzer's replays, the determinism check and every baseline rest
  on.
- **Time is stepped.** A fixed step, and `pause()` and `step(n)` on the
  test API, so no test waits on a clock.
- **A test API on `window.game`**, typed, that the smoke tests compile
  against. Everything a test needs to set a scene and read it back.
- **A file of always-true rules**, `src/invariants.ts`, checked by the
  fuzzer after everything it does.

And every gate:

    npm run check:quick    formatting, types, lint, unit tests (the pre-commit hook)
    npm run fuzz           a monkey plays it, and the rules are checked
    npm run determinism    the same seed played twice, hashed
    npm run leaks          a long game, watching what must stay bounded
    npm run pace:check     how many strokes a round takes, held to a baseline both ways
    npm run bench          what the physics costs a frame, held to a baseline
    npm run perf           boot time, a frame's cost and the download, held to a budget and a baseline
    npm run smoke          the real thing in headless Chromium on the GPU
    npm run look           what it looks like, held to a picture
    npm run check          all of it

The line every change goes down is in `CLAUDE.md`: a spec agreed, tests
seen failing, the change built, every gate run, the result looked at, a
report with evidence, then a commit. A red gate stops the line until it is
fixed, and no baseline is moved to make it green.

`npm run dev` serves the game at http://localhost:5200.

## Layout

    src/game.ts        the game without the picture
    src/main.ts        the page: events into words, the frame drawn
    src/debug.ts       window.game, the test API
    src/invariants.ts  what must always hold
    src/course.ts      the courses, and their holes: a map, a par, what moves on each, and its slopes
    src/open.ts        open holes made from a spec and a seed: ponds, bunkers and posts on noise ground
    src/noise.ts       ground made from Perlin noise: smooth, seeded, and legal to the physics
    src/obstacles.ts   where a barrier, a windmill's gate and a belt are at any moment
    src/arena.ts       a hole's map read into a layout; the kinds of body, the hardest shot
    src/surfaces.ts    what each kind of ground does: roll, landing, hop, a club's cost from it
    src/green.ts       a putting green's break and its arrows: which way the ground carries a putt
    src/bag.ts         the eight clubs of golf: loft, speed, carry
    src/flight.ts      a club, a power, an aim and a lie turned into a launch, with its scatter
    src/range.ts       the range: flat golf holes of tee, fairway, rough and green
    src/golf.ts        golf holes made from a spec and a seed: fairway, bend, hazards, trees, hills
    src/links.ts       The Links: nine holes, made when asked for
    src/trees.ts       a tree's trunk and its canopy, a cone the game tests a ball's step against
    src/route.ts       the way to the cup round water, out of bounds and trees
    src/planner.ts     a golf shot tried in a rehearsal, judged, and chosen
    src/marker.ts      the ring where a lofted ball first came down
    src/shaping.ts     a shot's shape and spin, and a hole's wind: what the air and the landing do to it
    src/preview.ts     the flight a drag would make, worked out in a rehearsal before it is taken
    src/aimview.ts     the view a golf shot is aimed from: back and low enough to see where it lands
    src/readout.ts     the pin's distance and rise, and where a shot comes down, in words
    src/holemap.ts     a hole's ground painted from above, to sit over the course
    src/autopilot.ts   the game played by itself, for the gates and for par
    src/clubs.ts       the clubs, what they cost, and what a hole pays
    src/hud.ts         the words over the course, the card and the shop
    src/progress.ts    the save, and where it is kept
    src/physics.ts     the game's side of artshape-physics
    src/scene.ts       a hole as it is drawn, from the models
    src/models/        the models: the cup and flag, the obstacles, the decoration
    src/scenery.ts     the decoration scattered round a hole
    src/turf.ts        a hole's grass, where it grows, and its wind
    src/ground.ts      the green drawn as one mesh over its slopes, and the rail round it
    src/look.ts        the daylight toon look
    showcase.html      every model, drawn, for looking at
    src/shot.ts        a drag turned into a shot
    src/gesture.ts     what the pointers mean: a shot, a turn of the view, or a pinch
    src/input.ts       the ball struck or the camera moved for what they mean
    src/quality.ts     the picture stepped down on a slow machine
    src/camera.ts      where the camera is, following the ball
    scripts/           the gates, each with its baseline beside it
    test/              unit tests, and a corpus of every save shape
    smoke/             Playwright: boots, drives, plays through, looks right
