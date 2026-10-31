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
gem; the shop has three aisles of fifteen, clubs, balls and accessories, and
you wear one from each. The coins, the kit you own and the best score on each hole are kept in the browser. The camera follows
the ball; the wheel zooms on a desktop, and two fingers pinch on a phone. While you pull the ball back the camera turns to look the way you aim, and
stays there if you think better of it, which you do by putting a second finger down, or by letting go where you pressed (the help says so once a drag has been held a moment);
a ball come to rest has the camera turn by itself along the hole's line of play, which on a dogleg is the fairway round the bend and not the flag; about one shot in five it follows
the ball and otherwise holds the view of the shot, and it always keeps the ball and the furthest
the shot can reach on the screen. An Overhead button shows the whole hole from above, to
look round and never to aim from, and a flag button beside it turns the camera to look near the flag. On the courses of golf, a bag of
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
draw or a fade that curves in the air (a sixth of the carry off the line with a wood or an iron), and spun, backspin to check it and topspin to run
it on, each chosen by a button in the bag; and the holes of The Links have a wind, shown
under the strokes as an arrow and a speed, that pushes a ball for as long as it is in the
air, and which the drawn flight already allows for. The greens of The Links have a first cut
round them and a tilt and swells in them, and run fast or slow by the hole: while the ball
rests on one, arrows over it show which way the ground carries a ball, the panel says how
fast the greens are and how far to aim off the cup, and a putt being aimed is drawn as its own
roll, curving across the slope to where it will stop. A
machine that cannot keep up has the picture stepped down a rung at a time.

The green is painted in its mown stripes, with a soft turf grain under the light, and the rough round it is
short, dense turf of real blades, bending in each hole's own wind. A minigolf pond's surface ripples
in the sun, from the game's own clock, and a golf pond is open water, waves that mirror the sky and glitter as the camera moves.

Three courses of minigolf, nine holes each. The Meadow is the first: a straight putt, a dog-leg, a bunker in front of the
cup, a pond, sliding barriers, a field of pinball posts, a ramp up onto a plateau between ponds, a windmill whose blades
sweep its door, and The Mill Race, with a barrier, the windmill and a conveyor to the cup. Sand slows the ball hard, and
water costs a stroke, the ball coming back to where it was struck from. The Pinball Shed is banks and bounces: the rail
is a cushion, posts and round kickers throw the ball back harder than it came, a flipper swings up on its own beat and
flings a ball timed to it, bumpers slide and throw, and the cup is often round a corner that only a bank gets to. The
Waterworks is water and timing: the ball one slip from the water on causeways, stones and a tilted lane, streams, belts
drawn as running water, that carry a ball along and never sink it, and barriers, a windmill's door and a bumper to time. A hole's ground may slope, and the break is shown over one that does: arrows, the putt's
roll and the words. Six courses of golf follow, nine holes each, easiest first (nine more, in the biomes, are below). The Links is hills, bunkers, water and trees. The
Heath is short and tight: par threes and short fours through woods, a lane cut through the wood on every dogleg, small quick
greens and a fresh wind. The Fells is steep fell-side ground
that a ball runs down, with level shelves to land on, doglegs, lakes and lanes cut through woods that a true drive can fly
and a slice cannot. The Woods is forest on every hole: a wood walls each fairway, a lane cuts every corner, and a drive that
strays is under a canopy. The Isles is nine long holes, a par four to a par six, round big lakes with islands, one of them a green
that is itself an island, and sand everywhere. The Old Course is the hardest, long holes that each ask two things of a player:
a lake to carry, a wood with a lane, ground that runs, sand, a pond on the line.

Nine more courses of golf are in three biomes, a world each. In **the Desert** (The Saltpan, The Mesa, The Badlands) trees are
cacti a ball drops at the foot of, a lake is a dried hardpan a ball skitters across and is never lost to, the ground runs on
and the gusts are strong. On **the Moon** (Tranquility, Copernicus, The Far Side) there are no trees and no wind, a lake is a
crater, and the ball hangs in the air 1.53 times as long over the same distances, under a black sky with the Earth in it. In **the
Future** (Neon Park, Chrome Heights, The Singularity) trees are holograms a ball passes through, slowed, and a lake is quicksilver,
at dusk, on steel plates. Each biome is a tour of its own, three events, on the start screen's tabs.

Every shot is heard: the club meeting the ball (a wood's ping, an iron's click), the ball landing and hopping, a knock off a
rail, the rattle of the cup and a run up a marimba as good as the score, polite applause for a birdie: every sound answers something
you see happen, and the menus have music. On a desk the speaker beside the flag, the M key or the start screen's switch turns
it off, and the start screen has its volume; on a phone the speaker is beside the Shop, and the phone's own buttons set the
volume. Both are kept. None of it is a file: every sound is made from numbers when the game starts, by
[artshape-sound](https://github.com/onion2k/artshape-sound).

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
    src/sound.ts       what is heard: the golf sounds and the music, through artshape-sound
    src/invariants.ts  what must always hold
    src/course.ts      the courses, and their holes: a map, a par, what moves on each, and its slopes
    src/shed.ts        The Pinball Shed: nine hand-drawn holes of banks, kickers, bumpers and a flipper
    src/waterworks.ts  The Waterworks: nine hand-drawn holes of water, streams and timing
    src/open.ts        open holes made from a spec and a seed: ponds, bunkers and posts on noise ground
    src/noise.ts       ground made from Perlin noise: smooth, seeded, and legal to the physics
    src/obstacles.ts   where a barrier, a windmill's gate, a flipper's arm and a belt are at any moment
    src/arena.ts       a hole's map read into a layout; the kinds of body, the hardest shot
    src/surfaces.ts    what each kind of ground does: roll, landing, hop, a club's cost from it
    src/green.ts       a putting green's break and its arrows: which way the ground carries a putt
    src/bag.ts         the eight clubs of golf: loft, speed, carry
    src/flight.ts      a club, a power, an aim and a lie turned into a launch, with its scatter
    src/golf.ts        golf holes made from a spec and a seed: fairway, bend, hazards, trees, hills
    src/links.ts       The Links: nine holes, made when asked for
    src/fells.ts       The Fells: nine steep holes with lanes and lakes, made when asked for
    src/isles.ts       The Isles: nine long holes round lakes and islands, made when asked for
    src/heath.ts       The Heath: nine short, tight holes through woods with a lane on every dogleg, made when asked for
    src/woods.ts       The Woods: nine holes walled by forest, a lane through every corner, made when asked for
    src/old.ts         The Old Course: nine long holes that each ask two things, the hardest, made when asked for
    src/biome.ts       a hole's world: the pace of its clock, its air, its ground's figures, its lake and its tree
    src/theme.ts       what a biome looks like: ground, light, grass or none, models
    src/saltpan.ts, mesa.ts, badlands.ts          the Desert's three courses of nine holes
    src/tranquility.ts, copernicus.ts, farside.ts  the Moon's three
    src/neonpark.ts, chrome.ts, singularity.ts     the Future's three
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
    src/items.ts       the shop's items, what they cost, and what a hole pays
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
