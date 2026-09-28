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
    src/obstacles.ts   where a barrier, a windmill's gate and a belt are at any moment
    src/arena.ts       a hole's map read into a layout; the kinds of body, the hardest shot
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
    src/gesture.ts     what the pointers mean: a shot, or a pinch
    src/quality.ts     the picture stepped down on a slow machine
    src/camera.ts      where the camera is, following the ball
    scripts/           the gates, each with its baseline beside it
    test/              unit tests, and a corpus of every save shape
    smoke/             Playwright: boots, drives, plays through, looks right
