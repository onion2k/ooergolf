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
and the card at the end. Seven courses are here, on artshape-physics v0.8.0, four of minigolf and three of golf.
The Meadow is nine holes of grass, rail, sand, water, raised grass, posts,
sliding barriers, a windmill and a conveyor, with a green that lets a putt
die, a rail and obstacles that bounce, posts that throw a ball back faster
than it came, and a cup with a rim. The Pinball Shed is nine holes of banks and bounces, where the rail is a
cushion and kickers throw and a flipper is to be timed. The Fair is nine holes with something that moves on each,
windmills, barriers, moving bumpers and belts. The Waterworks is nine holes of water, and of streams that carry a ball
and never sink it. All three are drawn by hand. (The Hills, The Downs and The Moors, courses of sloping ground with little
or nothing on it, were scrapped on 3 October 2026 as dull and these three replaced them; four of The Hills stay as test
holes in `test/hills.ts`, and the generator that made The Moors, `src/open.ts`, stays for the two test holes
`smoke/bighole.ts` makes with it.)
The Links is the first course of golf proper: nine holes at a yard a unit, each a tee, a fairway, rough
and a green, played with a bag of eight clubs that loft the ball into the air, a par three to a par
five, made by a generator on hills, with bunkers, water, trees and out of
bounds, from the plan in `~/.claude/plans/ooergolf-proper-golf.md` (which is out of date in naming The Range; stage 6
of six is built: a player sees where a shot lands, shapes it, spins it and plays it
in the wind, and putts on greens with a first cut round them, a tilt and swells in them, a speed of their
own, and arrows and words that show the break). The golf goes in
a feature at a time, in the order `DESIGN.md` gives.
The Fells and The Isles are the two hard courses of golf, built from `~/.claude/plans/ooergolf-two-hard-courses.md` on
5 October 2026, each nine holes made by `golfHole` from specs, as The Links is, and each chosen on the start screen after it.
**The Fells** (`src/fells.ts`, par 37) is steep fell-side golf: every hole's hills are heightened 2.5 and cut to nine tenths
of the physics' step, so a seventh to two fifths of a fairway is slope a ball runs down, with level shelves to land on; five
holes are doglegs, four have a lake, and three have a lane through a wood that a driver struck true flies and one six degrees
off does not. Its fifth hole is The Plunge (it was The Drop; its old name's wind bent the grass less than `test/turf.test.ts` asks).
**The Isles** (`src/isles.ts`, par 45) is nine long holes round big lakes with islands, a par four to a par six (mean par five),
fresh winds, fast turned greens, 83 bunkers, and one island green: its second hole, The Green Isle, is named so because The
Links has an `Island Green` and a best score is kept by name. The holes' own comments say what each is for and why its seed.
The Range, the first course of golf, was
scrapped on 5 October 2026 at the user's word ("Delete the first one entirely"), in the commit whose summary is "The Range
is scrapped" (`git log --grep "The Range is scrapped"`): its source, tests, pictures, pace figure and fuzz and leak runs are
gone. Its holes' names are unknown to the game now, and a save that names one
still loads (a best is kept by name, and an unknown name is carried). What the tests used it for, a golf hole with level
ground, is `FLAT` and `levelHole` in `test/level.ts` (re-exported by `test/helpers.ts`).

## The factory

This repo is a line that turns ideas into a browser game that loads fast,
draws fast and has no bugs, one feature at a time, and it holds those three
properties as numbers from the first commit. Every piece of work goes down
the same line: a spec agreed, tests written and seen failing, the change
built, and then, once, at the end of the piece of work, every gate run, the
result looked at and the report made with evidence. The line does not skip a
station; it puts the checking last (see "When to check"). A gate red at the
end is fixed at its cause before the work is called done, never skipped with
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

## When to check

Checking is left to the end of a piece of work, not run after each step. A
piece of work is what the user asked for in one go: a feature, a fix, a part
of a plan, or a wave of agents' parts. While it is under way, a step is built
and its own new tests are run (`npx vitest run test/the-file.test.ts`), and
the pre-commit hook's quick check runs on any commit; nothing more. The full
check, the fuzzer over 24 seeds, determinism, leaks, perf and bench timed
against the parent, the pictures written and looked at, and the look metrics
are run once, when the work is finished, on the tree as it will land, and the
report says what they found. Where the work lands as several commits, those
before the last carry no figures and say the checks follow; the last runs
them and says so. A builder agent's brief says the same: its own tests while
it builds, and the gates once when its part is done, or not at all where the
orchestrator runs them at the end of the wave. The user may ask for the
checks sooner, or for none.

Why: the full check takes a quarter of an hour and the measuring gates read
wrong while anything else is on the GPU, so checking step by step cost hours,
read noise as often as signal, and measured figures the next step moved again.

## Budgets

Numbers, held by gates, on this machine at 1280×800:

| Property                                               | Budget                         | Held by        |
| ------------------------------------------------------ | ------------------------------ | -------------- |
| Boot, page start to the frame loop running             | 3000 ms                        | `perf`         |
| Download, scripts and styles gzipped                   | 400 kB                         | `perf`         |
| A frame drawn, lower quartile at the standard view     | 6 ms                           | `perf`         |
| The biggest hole begun, and a frame of it drawn        | 400 ms begin, 6 ms a frame     | `perf`         |
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
  shaded inner face; and The Volcano (a test hole) from its tee, sampled on each row at
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
  from overhead (`look from overhead`: the Overhead button, drags and pinches anywhere on the screen, the button
  pressed back, nothing struck, and the view as it was to the digit once it is left); pulls the ball back and thinks better of it
  (`aim and take back`, on a stream of its own, about one frame in a hundred when the ball is ready: a drag at any angle and power,
  taken back by a release in the dead zone, a second finger or the browser taking the pointer, never a stroke, the aim held bit for
  bit while the camera turns to it, the camera at the aim's heading within `TURN_TIME`, left there once the drag is taken back, and
  the game, its clock and its chance untouched); and presses the flag button (`face the flag`: on its own stream, while the ball rolls and
  between holes too, refused while a drag is held as the page refuses it and from overhead, where the button does nothing, and checked to
  turn the camera to look near the cup, from `NEAR_FLAG.least` to `NEAR_FLAG.most` off the cup's heading and at the Director's own heading
  to a millionth of a radian, inside `TURN_TIME`, with the cup on the screen where it is in reach, touching nothing of the game, its
  clock or its chance). The page's own `Director` runs in the fuzzer every frame, on a desk's screen (1280 by 800) on even seeds and a
  phone's (400 by 860) on odd ones, and the framing rule is asked of the camera as it comes to rest; a test counts the numbers the
  monkey draws from its main stream (`drawn`, which every new action must leave alone: seeds 26 and 17 finish a round only while it does)
  and how often the rule was asked (`framed`, held above nothing, since a check that never ran passes in silence). It gets round every course. Each thing a
  player can do is an action in `scripts/fuzzer.ts`. On a golf hole it also
  chooses a club from the bag (and is refused one that is not in it) before
  most of its shots, aims shots (a preview of any club at any angle and power,
  which must hold `previewProblems` and leave the game, its chance and its
  clock as they were) and takes some as aimed, which must come down within the
  spread that was shown (where nothing in the air turns the flight), and sends
  the camera to an aim view in its look from overhead; it chooses a shape and a spin before a stroke or an aim, and the game must
  have put them back to nought after the stroke. it also reads the break (`breakOf` at the ball and at
  three places on the hole, and the arrows: finite and where they should be, the game, its chance and its clock left as
  they were) and, before an autopilot putt from a green, holds the putt to it (aimed the way the break says: `off`, counter-clockwise, and
  `across`, positive to the right, cancel, and on the same side only when the break is clearly past the cup's reach, `MISSES`, 2
  yards: the cup takes a ball within 1.45 of its line and one that curves from a little further).
  On minigolf it also does what each of the newer kinds invites, each on a chance of its own so that every run
  without that kind plays as it did: it strikes a moving bumper where the barrier is, strikes a kicker, strikes at
  a flipper through every phase of its swing, and strikes onto a stream, where the ball must be carried and never told lost
  (`lostOnStreamProblems`, checked as a loss is told).
  On a hole with a wood's lane it drives along the lane from the tee, slipped, and on a hole with land wholly in water it
  plays the shortest club that carries to the middle of it from wherever the ball lies (each on a chance of its own, so no
  other run changes, and both count in `done`).
  `npm run fuzz` plays every seed eight times, as a player who
  chooses among the courses, on The Links alone (whose nine holes have winds of 4 to 12 miles an hour, which is the wind the
  runs cover; a gale of 12, 18 and 6 in turn on level holes is played in `test/fuzz.test.ts` and not in the queue), on the contoured Links (`--on contoured`: its nine holes at contour 1 with greens at
  12, 22, 12.96 and 14.4 by hole), and on each of The Fells, The Isles, The Pinball Shed, The Fair and The Waterworks alone
  (`--on fells`, `isles`, `shed`, `fair`, `waterworks`), since a monkey
  choosing among seven is on golf too seldom to hold it to anything and on a minigolf course's own kind not much oftener; each landing
  the game tells of is checked as it is told (`landingProblems`). Two runs are for replays and are not in the queue:
  `--on kickers`, `KICKER_HOLES` in `scripts/fuzzer.ts` (a kicker in the way of the cup, a pair facing each other, which
  is the ceiling's hardest case, and a ring of four), and `--on stream`, `STREAM_HOLE` in `test/stream-hole.ts`.
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
  tilted within `TILT`, stood back within the zoom, and never left turning to face a place for longer than `TURN_TIME`, two
  seconds (`viewProblems`, checked after each look from overhead, every frame of a turn to the flag and every frame of an aim turned to; the blend to the overhead view is a number from nought to one, its distance within `OVERHEAD`'s near and far, and its place inside the hole's bounds). And the camera keeps the ball
  and the furthest a shot can reach on the screen (`framingProblems`, in `invariants.ts` and not in `checkInvariants(game)`, since it needs the
  camera and a screen's shape: the ball and the reach point inside `safeBox` to 0.02, asked only when the view has settled, which is not
  while it is turning, easing to an aim view, gliding, blended toward the overhead view or parked, and within `TURN_TIME` of a turn; the ball
  in flight alone, always, whichever stroke the camera is following; called by the fuzzer, and read by tests through `view().framing`). On a golf hole the club in hand is one of the
  bag's, and the ball is never faster in all, in the air as on the ground,
  than the club that struck it could send it and a fall from the highest
  ground make it, never at rest out of bounds or on water and never inside a tree's trunk
  or canopy; each landing told is of the live ball, where it is, and at
  least `LANDING.least` hard (`landingProblems`). A preview is a flight from
  the ball to where it says it came down, in numbers, growing in length, no
  further than the club goes and a fall adds, with a spread that is a spread
  (`previewProblems`, which allow the longest tailwind's carry and need a heading); and the camera's distance is within the
  zoom of its hole, further on golf, and its lead is a number of yards. Shape and spin are numbers within -1 and 1, the wind
  a speed from nought to `WIND.most` along a unit direction and calm on a hole of minigolf, and a ball's speed is held to the
  club that struck it, a fall, and what the wind adds over eight seconds of flight. The greens (`groundProblems`,
  `arrowProblems`, `breakProblems`, all inside `checkInvariants`): a hole's greens run at a speed from `GREENS.fast` to
  `GREENS.slow`, and only a golf hole has one; on a hole that says its greens' speed no tile of putting green leans more
  than `GREEN.steepest` and a tenth over (`GREEN_RULES`; a test's own hill with a cup on it is not such a hole); the first cut
  is on no sand, water, out of bounds, rock or rail, and there is none on minigolf; a ball at rest on a golf hole lies on
  a slope its lie holds, by the lie's own roll (the cut and the green's speed counted) over gravity and a quarter more;
  `breakOf` is a number and its `across` no further than the cup is; and the arrows are numbers, each on a tile of putting
  green and no more than the green has. And the kinds that move or throw (all inside `checkInvariants`): the ball is never
  inside a kicker and never going faster at a kicker's side than the course may throw it (`kickerProblems`); a barrier
  that was given a `bounce` throws with it, which is from nought to twice a post's (`bumperProblems`); each barrier's box is on its own slide and each windmill's gate at its own door, since the boxes are listed in the order the things were given and each thing keeps its own (`boxProblems`); a flipper's pose is
  the one its game time alone says, worked out afresh, its root has not moved and its box has no speed but its turn
  (`flipperProblems`); every tile of a stream is a belt's and no water, rock or out of bounds (`streamProblems`); and the
  ball is inside no moving box, which a flipper's turned frame is held to as a barrier's is.
- **Determinism:** the autopilot plays, with a player's slips from its own
  chance, round after round, and the hash takes in the hole and the card.
- **Pace:** the strokes a round of each course takes; see above (the minigolf courses: The Meadow 16.63 for par 26, The
  Pinball Shed 20.94 for 25, The Fair 19.38 for 28 and The Waterworks 18.94 for 28, which is what `scripts/pace-baseline.json`
  holds, as it does for the golf courses below). The pace player never banks and fires
  blind after ten seconds without a timing window, so a bank hole's par is the human's intent, and a timed hole
  needs a window at the autopilot's margin, the ball's radius and 0.6. The
  autopilot does not read a slope's break on minigolf, so on a hole that slopes it is a player
  who aims straight and is carried by the ground; on a golf green it does, by rehearsal. The Links is a player one under par on every hole: 29.88 for 36 (the contoured greens did not move it: 30.19 over 48 seeds against 30.27
  before them; the livelier ball and the respecified holes moved The Links to 30.33 over 48),
  each hole a stroke or so better than its par, since the
  autopilot plays like a good golfer and par is each hole's intent. The planner did not move the figure of a course of
  level holes (6.88 to 6.94, when The Range was three holes): a player's slips, a tenth of the power and a few degrees, and the swing's own scatter,
  are far bigger than the unit or two it gains on the level; its worth is in `test/planner.test.ts`, on slopes
  and rises, and in `test/strategy.test.ts`, on a dogleg (3.4 strokes a round on a par four, and no ball lost
  in twenty-four rounds, where aiming at the cup across the corner lost one in every round). The Fells and The Isles
  are held to the order of how hard they are (`HARDER` in `scripts/pace.ts`: each course at least a tenth of a stroke a
  hole over par above the one before it, a rule `pace:check` fails and a test holds), and a hole is picked up in no more than
  one round of sixteen. The Fells 35.44 for par 37 (0.17 a hole under, the target a tenth to four tenths) and The Isles
  47.75 for par 45 (0.31 a hole over, the target from a tenth under to four tenths over), against The Links' 0.68 under;
  written 5 October 2026, when the Fells' hole five was renamed The Plunge (its wind is a name's, and it moved the figure
  from 34.63 to 35.44).
- **Leaks:** ten minutes of the autopilot playing round after round, on The
  Meadow and again on each golf course (`GOLF_COURSES` in `scripts/leaks.ts`: The Links, The Fells, The Isles, under
  the Links' ceilings; `leaks:check` queues the four, and `--on` narrows a run to one kind for a short look; a test holds that a hole
  with a lane is collectable, so `laneOf`'s cache keeps nothing alive). The card is emptied each round and
  watched against the number of holes; on golf a previewer is made with each hole, as
  the page makes one, and tried now and then, and the bodies in its rehearsal are held
  to the one ball.
- **Bench:** the physics on a green of its own, the size the course was
  before it had holes, so its figures are the physics' and not the
  content's: at rest, which costs next to nothing, and full of falling balls
  at `BODY_CAPACITY`. A frame of either is far under the gate's 0.05 ms of
  slack, so the gate cannot fail until the physics costs several times what
  it does.

## Commands

    npm run dev            the game at http://localhost:5200 (PORT=n for another port; the smoke tests take PORT too, 5201 by default)
    npm run check:quick    formatting, types, lint, unit tests (the pre-commit hook; ~40 s)
    npm run check          all of it: check:quick, fuzz, determinism, leaks, bench, smoke with perf and look (~15 min; at the end of a piece of work)
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
  and a power, and the pointer onto the ground. The ground under a pointer is read through a `HeldView` (a `ViewFrame`, a copy
  of the camera's position, target, right, up and lens, made once and written into): `Input.down` calls `InputPorts.hold()` as the first
  pointer of an aim drag lands, before the gesture reads any ground, so the aim is the drag and the view as it was when it began and
  nothing the camera does after. That is what lets the camera turn to face the aim without a feedback loop: read through the live camera,
  the ground under a still finger moves as the camera turns, and the aim with it (`groundAt(view, nx, ny, z)` is the arithmetic, which
  the held view and the camera both serve). `src/gesture.ts` says what the pointers mean, by `Mode` (`aim` or `overhead`): in aim one
  pulled back is a shot; in overhead one dragged is a `pan` (the ground goes with the finger) and never strikes, and `hold` is not called;
  in both two are a pinch, and a second finger mid-drag takes the drag back. There is no Look mode and no free orbit: a player cannot
  turn the camera by hand, it turns to the aim (see the director). `src/input.ts` turns what the gesture says into the ball struck or the camera moved,
  through ports it is handed (`shoot`, `zoom`, `pan`, `hold`, `ground`, `blocked`), so the page and the fuzzer press on the course alike.
  `src/camera.ts` says where the camera is: it follows the ball, and has an `azimuth` (wrapped to a turn either way) which only
  `turnTo(wrap(heading))` and a new hole's `glide` change in play (`facing` is the azimuth from one ground point to another, nothing
  for the same place; `settle` eases it by the shortest way at a rate of six a second, a first-order filter that does not overshoot, and
  a zoom does not end it); `orbit(turn, tilt)` stays as a setter for tests, which a player has no way to reach), and
  tilted between `TILT.least` and `TILT.most` (home is 0.78, 45 degrees; the
  lowest is 57 degrees only because the grass is what a frame costs, and a
  lower view draws far more of it: `TILT`'s comment has the figures, and the
  worst view is held under the 6 ms budget by `smoke/game.spec.ts`), and its
  lead of `LEAD` units turns with the view so the ball stays low on the
  screen. A new hole puts the overhead view away and eases the view home
  over the glide, by the shortest way; nothing of the view is saved. On a
  golf hole (`setGolf`) it may stand back `VIEW.golfFar`, 200 (on a tall phone `VIEW.phoneFar`, 400, which `setScreen(aspect)` gives the rig from the page's size: a phone's narrow screen draws less ground at 400 back than a desk does at 200, so a drive's landing ring and its spread clear the coins and the switch at the top, aimed for the far edge of the ring and the chips' real pixel height, `CHROME` in `aimview.ts`; desktop and tablet are as they were), where minigolf
  stops at 110 (and never further than that from what it looks at, tall
  screen and all), since a player who cannot see where a shot comes down cannot
  play it; and it is sent to the **aim view** of the club in hand (`aimAt`,
  eased by `settle` in game time at a rate of four a second, taken back by the
  first zoom of the player's, which goes out freely but never nearer than the view's own `floor`, so a zoom cannot push
  the reach off the screen). `src/aimview.ts` works that view out
  from the club's reach and the screen's shape and from nothing else: the
  camera stood back as far as the landing needs (no nearer than home), tipped
  lower the longer the club (from 45 degrees to the lowest, since a low view
  shows far more depth for the same distance), looking a quarter of its
  distance ahead of the ball so the ball sits low with the landing above it, the
  landing at 0.85 of the way up the screen, and 0.72 on a tall one where the
  coins and the shop are across the top; those two figures and the sides and foot are `safeBox(aspect, height)`, the part of the
  screen the ball and the reach are kept inside (`x` 0.9 either side, `bottom` -0.9, `top` as said), which the aim view is worked from and the framing rule
  holds the camera to. **Never worked out from a drag**: the
  aim is the ground under the finger through the view held when the drag began, and a camera that
  moved under a drag would turn it. `reachOf(club, lie, wind)` is where a shot comes down at its furthest (the carry at full power
  and the tailwind's reach, `LANDS_PAST` more), in one place for the camera, the Director and the fuzzer; `reachOnMinigolf(ground, x, y,
angle, roll)` is how far the putter's hardest putt rolls along an angle before the first rail or wall stops it, which a minigolf hole's
  view is framed by.
- `src/director.ts` is what is done to the camera as a game goes on, whoever plays: `new Director(rig)`, given a game (`use`), the
  screen's shape (`setScreen(aspect, height)`) and a seed (`setSeed`), driven by the page and the fuzzer alike (one implementation, so
  the fuzzer holds the page and not a copy of it). `started()` puts the camera on a hole's tee and, on golf, sends it to the driver's aim
  view; `frame(dt, parked)` sends the aim view again when the club or the lie changes, eases the rig and follows the ball; `struck()`
  says whether the stroke is followed; `aiming(input.aim)`, `faceFlag(held)`, `nearFlag()` and `reachPoint(out)` are below. It holds a fixed
  set of numbers and one string, never a list (the leaks gate has nothing of it to watch), and it never draws the game's chance. On a
  golf hole it keeps the ball and the reach on the screen by the aim view of the club in hand; on minigolf it frames the putter's reach
  along the way the camera faces, which is the home view exactly (and the zoom as the player left it, no nearer than shows the
  reach) when that fits there, so a minigolf hole is seen as it always was where nothing needs more, and otherwise the aim view of the reach
  no further back than `VIEW.far`.
  **Turning to the aim**: while the ball is ready, the start screen is not up and the overhead view is off, a held aim of at least `AIM_TURN.least`
  (0.15 of the hardest shot) has the camera `turnTo(wrap(PI/2 - aim.angle))`, so the player sees the shot from behind it. The heading is the
  aim's own and does not depend on the camera. A drag taken back (released in the dead zone, a second finger, a cancel) simply stops
  calling `turnTo`, so the camera is left looking the way the last strong aim had it; a shot let go faces its way.
  **Near the flag**: the flag button turns the camera to the cup's heading from the ball turned `NEAR_FLAG.least` to `NEAR_FLAG.most`
  radians (0.10 to 0.26) to one side, the cup near the way ahead and not at the middle of it. Which side and how far is a stateless
  `hashed(viewSeed, hole, strokes, SALT.flag)` (`random.ts`), never the game's chance, so determinism and pace cannot move, and pressing
  twice on the same lie gives the same heading; where the cup is in reach and the offset would put it off the screen the offset is halved toward `least`, at
  most twelve times. The view seed is `?seed=N` (or the test API's `seed(n)`), or one `crypto` draw at boot. Refused under the start screen,
  while a drag is held, at the cup and from overhead.
  **Follow one stroke in five**: `struck()` follows the ball when `hashed(viewSeed, hole, strokes, SALT.follow) < FOLLOW.share` (0.2), exactly as
  the camera always did (`catchUp`); for the other four the camera holds where it stood and the ball flies across the aim view, with a one-way latch for the
  stroke: if the ball would leave the safe box the camera takes it up from then, quicker (the pace doubled, at most eight times) until it is
  inside, never a looser box; at rest the camera eases to the ball as ever, and a new hole clears the latch. `followShots('drawn' |
'always' | 'never')` is the test API's say in it, and the perf scenes that fly a ball set `always`.
  **The overhead view** is the rig's: `overhead`, a blend `k` eased at `OVERHEAD.ease` (4 a second), and a `top` of its own (`x`, `y`,
  `distance`). `OVERHEAD` is `tilt` 0.05 radians from vertical (not nought, since the renderer's camera has the ground's up for its own
  and straight down is degenerate), `near` 60, `far` 3000 and `margin` 1.08; `overheadFit(bounds, azimuth, aspect)` is the least distance
  that shows the hole's bounds (times the margin) for the way the camera is turned and the screen's shape; `setOverhead(on, fit)` blends to it and
  back, `pan(dx, dy, heightPx)` keeps the ground under the finger and is clamped to the hole's bounds, and the zoom is held between `near`
  and the fit. At `k` of nought the camera is placed exactly as it was before there was an overhead view (held bit for bit by a test), and the normal
  view's azimuth, tilt, distance, lead and goal are not touched while it is on, so leaving it gives the view back to the digit. The renderer's far plane
  is raised with it (`CLIP`: 800, and 2.5 times the overhead distance while blended, `farPlane`). The game keeps running, and the Director's logic
  continues underneath it; the framing rule is not asked while it is blended. On the golf holes it stands out past every ring of the grass (`GRASS`: 36, 110 and 300) in all but
  a few views, so it draws almost no blades and is plainer than the aim view. Measured 6 October 2026 on every hole of the three golf courses
  at 1280 by 800 and 400 by 860, every rung, turned along the hole and across it: the worst frame 2.49 ms on the top rung (desk) and
  2.08 (phone), at most 21,560 blades of room for 262,144, and 3000 shows The Isles' longest hole, 858 yards, whole on a phone turned across it,
  which needs 2737 (the plan's Part 0 has the figures; `test/overhead-far.test.ts` holds every golf hole to fit under `far`).
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
  on artshape-render v0.27.1 (0.23.0 brought the surface that flows, which the ponds
  use; 0.24.0 and 0.25.0 particles blown by a wash of air, which the game does not yet use; 0.26.0 the ground texture; 0.27.0 open water, which a golf pond wears; 0.27.1 its sky no longer repeats: the sheet is bent by a slow warp and the swell is weaker), in `src/look.ts`, shared by the game and the
  showcase: edges drawn at four samples a pixel (the post pass one rung
  down the ladder, and none on the last), the toon bands eased at their
  edges, a cool blue-violet shade, a warm rim, the sky's light from above
  and a bounce off the grass from below, the form light, which keeps some
  of the sun's fall-off in the top band so a slope turned from the sun is
  darker than the flat and one facing it brighter (without it every slope
  a ball can roll on was drawn as bright as the flat, and a hill had no
  shape), the toy finish the renderer gives every toon look (a highlight on
  what is smooth, the sky in a clear coat, one smooth ramp of light, shade
  toward the shade colour in a crease) and its soft tone, the renderer's screen-space
  occlusion where things meet, no film grain, and a haze so thin it only
  pales the far rough. The colours are named in `src/models/palette.ts`,
  the green, rough and rail among them, so the scene and the showcase are
  one green; the mown ground (green, fairway stripes, putting green, first cut, tee) wears a turf texture, made at boot by
  `src/turfTexture.ts` (256 square, tileable, mid-grey on average, from seed 1) and handed to the renderer's `setGroundTexture` in
  `look.ts` (which also compiles the textured build at boot): `TURF` in `scene.ts` is layer 1 at 1/1.4 tiles a unit, 0.2 of its
  colour and 0.15 of its height (stronger, the shade's steps through the toon ramp show the noise's square grid), and the old speckle is dropped from those groups; the rough painted under the blades and out of
  bounds stay plain. `look:metrics`
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
  aim, camera and glints all stand on it. No course's hole slopes now; the
  test holes in `test/hills.ts` do, and `playCourse` in the test API plays one of a test's own.
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
  (bumper, kicker, barrier, windmill with its turning blades, flipper, water, bunker,
  conveyor, stream). Water lies `WATER_LEVEL` (0.3) below the grass, in the
  earth `ground.ts` brings down to it from every edge of grass or sand that
  meets it, in a rim of foam, two bands of shallows and deep water that
  ripples, filling its tiles exactly. The deep water's surface is the renderer's
  ripple kind (`PATTERN.ripple`, 5, drawn through the flowing build): the pattern
  travels east along the mesh's own +x by the game's clock (`renderer.time`, which
  `main.ts` already sets from game time, so a paused game is still and a picture is
  the same every run) at `RIPPLE.speed` 1.5 units a second, in cells of `RIPPLE.scale`
  0.5 a unit (two tiles across a cell), the crests in `PALETTE.waterVein`, the normal
  turned by the slope so the sun glints on it; it costs a frame 0.4 to 0.6 ms on The Rapids and under 0.3 on The Meadow's Pond. **A golf hole's water is open water instead**: `PATTERN.ocean` (8, held equal to the renderer's
  `FLOW_WATER` by `test/water-ocean.test.ts`), waves that turn the normal in the world and mirror the sky, so the sun
  glints on the crests and the glitter moves with the camera, in `OCEAN`'s figures (`scale` 0.3, `speed` 0.55, `tilt` 0.8, a
  `body` brighter and bluer than three.js's and a `tint` of sky). There are no circles on it: no idle rings, no splash ring
  (`splashedAt` keeps none, so `motions().splash` reads 0 on golf) and no stream streaks, and no sparkles (a pond is still in `ponds`, with a share of
  none, since the waves' own glints are the twinkle). `OCEAN_ON` (`{ golf: true, minigolf: false }`, read through `oceanFor`) is the one switch: `waterBed` and
  `streamBed` are built for either `look`, so giving minigolf the new look, its streams too, is that one figure, and a
  minigolf hole as it stands is held to a hash of its beds and by the rings tests. The cost of a golf pond in open water
  is not yet measured: the figures here are the ripple's. A stream's surface keeps its
  marbling, since a pattern runs east and a stream may run any way, and its streaks
  already move along it. A part's pattern with a flow kind has a `speed` where the old
  kinds have a seed (`group` writes it with the renderer's `packFlow`); `look.ts`
  hands the renderer a group with no placements and a flow kind at boot, so the
  flowing build is compiled before the first hole is drawn. The three idle rings are
  kept over the ripple. The scene draws a hole's
  water as one bed over all its tiles (`waterBed`, built as `sandBed` is:
  the bands only along sides that meet what is not water, mitred at the
  corners), so a pond of any shape has one edge and a channel between
  ponds is one water; it was the largest rectangles to be had, each rimmed
  on its own, and a pond that was not a rectangle showed the seams. `water`
  is a pond as a rectangle, the showcase's, and still what the ripples and
  sparkles find their room on; its `moving` part is one
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
- **The kinds that throw or move** (the Pinball Shed's, the Fair's and the Waterworks'; each is held by an invariant and a
  fuzzer action, above). A **kicker** is `KICKER` in `arena.ts` (`k` on a map, radius 1 and height 1.6 as a post's,
  restitution 1.8 against a post's 1.2), handed to the physics as a bumper of its own. It throws about 1.75 times as fast
  at the soft and middling shots (1.72 to 1.78 for arrivals of 8 to 35 units a second) and the course's ceiling still
  holds it at the hardest shot (59.7 against 60), so it is felt where a post is not. It is drawn as a mushroom
  (`models/kicker.ts`: an orange dome on a blue stem on a cream flange, to the physics' circle), kept out of the autopilot's route as
  a post is, and lit by a warm flash for a third of a second when the ball knocks it (`kickFlash` in `glints.ts`, from game
  time; `main.ts` keeps when each kicker was last hit, one slot a kicker, made with the hole, and draws the flash). A
  **flipper** is an `ObstacleDef` in `obstacles.ts` (`at` the pivot's tile, `length` in tiles, `swing` in radians, `period`,
  `phase`, `pivot` left or right). Its angle is a one-sided sine of game time (`flipperAngle`: up and back in the first half of
  the period, at rest for the second, so a ball can be rolled under it), its yaw `flipperYaw`, and its pose from time alone,
  never from where it was, so the physics is handed a box that turns about its root with a spin and no linear speed. A
  ball met on the upswing is flung 4 units further and 2.9 times as fast as one rolled onto the arm at rest. Its pusher is
  made last, so the barriers' and the windmills' keep their indices, and it is refused by name on a slope (the whole sweep
  must be level) and for a length, period or swing it could not have. The autopilot's `inTheWay` and the invariants' box checks work in
  the box's own frame, since an arm is turned where a barrier is not. A **moving bumper** is a `barrier` with `bounce`: the
  physics box takes that restitution (refused by name past twice a post's or below nought), the scene draws it in the
  bumper's red, and without it a barrier is what it was, held by a hash of five shots into The Meadow's Barriers. The speed cap
  needed nothing new, since the game clamps every ball to its ceiling each step. A **stream** is a `conveyor` with `look: 'water'`:
  a belt to the physics and the game (carried at the belt's speed, the same seeded trace as a plain conveyor) and
  never lost on or splashed; water only to the eye and the map. It is drawn level with the grass, every stream of a hole as one bed over
  the tiles of its belts (`models/obstacles.ts` `streamBed`, built as `waterBed` and `sandBed` are: a thin earth edge, foam
  and shallows only along the sides that meet what is not a stream, so belts that touch are one channel; `stream` is the
  one-belt model, which the ripples' streak is taken from), its ripples carried along it at the belt's
  speed from game time (`streamRipples` in `sway.ts`, a pool sized once), and its tiles painted as water on the hole map
  (`Obstacles.streamed`, read by `holemap.ts`). **No stream can be crossed**: a belt pulls a ball's velocity toward its own by
  an eighth a step whatever its speed, and a belt is a tile deep, so a full-power shot across one dies 2.3 units in and is
  carried off, and a ball carried at 6 units a second is counted at rest while it rides, so a hole's streams run beside the
  line or along it, and The Rapids' belts run at 9.
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
- **The grass of a golf hole** is the rough and the fairway, each its own kind (`turf.ts`, `golfFieldOf`, `golfKinds`):
  the rough's long blades grow on the tiles of rough a ball is played from and the fairway's short ones on its fairway
  tiles, inside the stakes, standing on the ground (each cell's own height, since a golf hole's ground rises and falls),
  and nowhere else: not on the green, tee, first cut, sand or water (painted, as ever: the green and its fringe are mown
  flat, and a bare cut keeps the putting surface and its edge one thing), and not past the stakes, on out of bounds, the
  rock beyond it or on to the horizon (`outside` is left out), so the plain beyond is bare. The rough is the minigolf
  rough, turf and not meadow since 4 October 2026 (`GOLF_ROUGH_DENSITY` 80 a square unit, as minigolf's); the fairway
  (`FAIRWAY`, `GOLF_FAIRWAY_DENSITY` 100) is 0.3 tall, leaning 0.35 with its clumps at 0.2 (a quarter of the rough's
  height, 0.39 at the tallest, under the ball's middle, so a ball on it is seen and is not pressed), in the painted fairway's green (`FAIRWAY_GREEN`, equal to `models/palette.ts` by a test: the blades average
  to it by `grassGround`, so they read as the turf under them), stiff in the wind, and mown in the renderer's stripes,
  two tiles across, the lighter on the rows the painted ones are, as strong (`FAIRWAY_STRIPE_ROWS`, held to
  `ground.ts`'s). The cost of a view follows the blades it
  draws (about 0.02 ms a thousand), and the rings (`GRASS`, shared with minigolf) have `near` 36, down from 45, for the turf (see `turf.ts`). A golf hole's
  densest view draws 139,000 blades of the 262,144 there is room for (`BLADE_ROOM`), and minigolf's 122,000, held by
  `smoke/game.spec.ts` (4 October 2026).
  Nothing is scattered there either (`scatter` is empty on a golf hole, and its dressing is the bunting
  alone, which marks where it ends), and the ground under it reaches the horizon (`GOLF_GROUND_REACH` past the hole's edge, in
  the dry colour of out of bounds), where a square 600 across ran out under a hole 650 long and showed the sky. A ball at
  rest in the rough has the grass pressed flat in a disc round it (`FLATTEN`, 6 yards across the radius, standing again 6
  seconds after the ball is struck), through the renderer's own trample (`renderer.press`, once a frame at the game's
  time, in the wind's direction): the grid it presses in is `trampleOf`, over the box round the hole at a cell of 0.5 to 1
  yard, at most 320,000 texels; `flattenFor` says when and where (the rough only), and the page reads it back as
  `motions().press`. A minigolf hole's grass, scatter and dressing are exactly what they were (held to a hash, and its
  one kind of eighty blades, 1.2 tall, to a literal).
- `src/turf.ts` is a hole's grass, as the renderer's GPU grass grows it: a
  field of cells saying where the rough grows (off the course,
  down where the rough lies, and on past the field as its `outside`), and
  the hole's own wind from its name. The rough is turf, not a hayfield
  (candidate B of a sheet, chosen 4 October 2026, so a ball sits down in it): eighty blades a square unit on every
  course (a golf hole also grows its fairway, at a hundred), 1.2 tall and half again more or less, in clumps (the
  renderer's three-unit patchiness, `variation` 0.45) and leaning (0.45), its tallest, 1.8, still well
  under the level of the course; the blades sway in a wind that bends them
  about 30 degrees across the ground at one moment, in gusts eight units
  across that the renderer carries downwind at five units a second, which
  is the flow, so ripples roll across the rough (and the flag and trees
  follow the same gusts). `GRASS` is how the renderer thins it: `near`,
  `mid` and `far` are the game's own, since the renderer's scale with the
  blade's height and would keep every blade for eighty units, and `BLADE_ROOM`
  is its room for blades in a frame, which the smoke test holds every hole
  at every zoom well short of. The standard view cost 3.0 ms of the 6 when the turf landed (the `perf` baseline 2.99; the worst view the camera can be
  orbited to 3.9 to 4.9), and the ladder's rungs 1.3, 1.0 and 0.7 below it at the home view (4 October 2026); the water's ripple and the
  ground texture came after, and the figure to hold is the baseline `perf` has now. At `near` 45 the turf's worst orbited view drew all
  262,144 blades and cost 7.2 ms, which is why `near` is 36: that view draws 160,000. No blade grows on the course:
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
  fairway, `r` rough, `g` green, `c` first cut and `t` tee's box (refused by name if mixed
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
  `roll`, is what makes a driver run on a fifth of its carry (288 yards from a 239 carry), a 7-iron a tenth and a sand wedge
  a thirtieth, and hop 4 or 5 yards high after a 7-iron (`surfaces.ts` says why, and why the tee and the fairway keep a
  roll of 20: it is the slope the ground holds a ball on, which the generator holds every Links hole's hills to, so lowering it
  would make every hole's hills gentler, and "a little less rolling friction" is the greens' speed and the landing's `keep`
  and `bounce` instead; the first-landing carry never moves with any of it, so the ring is true); `landed(x, y, speed, first)` tells of
  it. Golf pays no coins, and the rail is a wall to a ball in the air.
- `src/shaping.ts` is what a golf shot has besides its aim and power, and what the air does to it: a **shape** (the
  player's choice per lofted shot of straight, draw or fade: -1, 0, +1, a heading that turns in the air at
  `curveRate(shape, loft)` radians a second, positive a fade, to the right as seen from behind the ball, a pure
  rotation that adds and takes no speed, falling with the club's loft to nothing at 72 degrees so a driver curves 22
  yards at the fullest, a 7-iron 12 and a sand wedge 3, and only until the ball first comes down); a **spin** (flat,
  back or top: 0, -1, +1, which multiplies the share of its ground speed the ball keeps at its FIRST landing by
  `spunKeep`: full topspin about 2.7 times a driver's roll-out, full backspin takes more than all of it, so the ball is
  checked and comes back a yard or nine); and a **wind** (`HoleDef.wind`, miles an hour, `WIND.most` 25, calm
  without it, which is every minigolf hole; it blows the way the hole's grass and flag already show,
  `windDirection`, the very vector `turf.ts windOf` gives, and pushes a ball in the air, steady, `windPush` yards a second
  a second, 10 mph moving a full driver 9 yards sideways or along and a sand wedge 23, since a high ball is blown
  longer). `Game.shape`/`spin` are chosen (`setShape`, `setSpin`, a number that is not one is refused, a value past the
  limits held in them), latched at the strike, and put back to nought by it and at each hole; `Game.wind` is worked out
  once a hole. All three are plain additions in `Game.step` (`blow`, before the step's velocities are read, only to a ball in the air on
  a golf hole) and `Game.landing`, with no chance drawn, so the preview and the autopilot's rehearsal, trials of the same
  game, include them to the digit (`Previewer.run` and `Rehearsal.shot` take shape and spin; `Preview.heading` is
  where the ball went, which the spread is laid along). `airTime` and `windReach` say how long a shot is in the air and how
  much a tailwind carries it further, which the camera's aim view adds to its reach. The Links have winds of 4, 6, 10, 12,
  5, 8, 7, 10 and 12 miles an hour (nine holes' own, chosen so the autopilot's round stays within a seventh of what it was).
- `src/preview.ts` is the flight a drag would make, worked out before it is taken: a trial in a rehearsal of the hole
  (`Game.rehearsal`, handed the events it is told by), with chance in the middle, so it is what the game does to the
  shot struck true, exactly (the arithmetic carry is four in a hundred short, and worse on a slope), a knock by a
  tree or the rail in the air included. A `Previewer` is made with each golf hole (a millisecond or two) and let go
  with it, and `run` writes a `Preview` into buffers made once: the path a point a frame to the first landing, where it
  came down, went into the water, dropped in the cup or was lost out of bounds (which the game does a step before it would
  tell of a landing, so the `outOfBounds` event is its place), what the ground is and how it slopes there, the carry, where
  a tree or the rail knocked it, and the swing's spread (across: the carry times the sine of the scatter; along: what the
  worst mishit of speed falls short by, the carry going as the speed squared), an ellipse whose far end is the ring since
  a swing never adds speed. About 0.6 to 0.8 ms a preview, once, when the aim, club or ball changes. `src/readout.ts`
  says the pin (`pinReadout`, `pinText`: whole yards and an arrow for half a yard or more of rise) and where a shot comes
  down in words (`landingText`). `src/holemap.ts` paints a hole's ground from above into a buffer (one pixel a yard at
  most, off-course ground clear, trees as dots, in the scene's own palette) and says where a point is on it
  (`mapInto`, `mapPoint`); the hud draws it on a canvas at the left edge and over it the ball, the cup's flag, the aim's
  line, ring and spread, and what the camera shows, redrawn only when something changed.
- On the page a lofted shot being aimed is drawn as its flight, not its dots (a putt keeps the dots): twenty-eight dots of
  arc by length along it, a ring at the landing (the marker's yellow, blue for the water, red for out of bounds, lime for
  the cup), the spread, and a red mark where a tree or the rail knocks it, each a group after the marker's
  (`Scene.setShot`, `shotMarks`), scaled for the camera's distance (`markScale`) and laid along the ground's slope and
  lifted clear of a hollow (`placeOnSlope`, `ringLift`: a flat ring over a hill is a crescent in the turf). The bag says
  where it comes down after the club ("Driver · lands 260 yd · fairway", "hits a tree · lands 67 yd · fairway"), the
  hole's panel says the pin ("503 yd ▲ 1") and under it the wind (an arrow that points the way it blows on the screen,
  turned with the camera by `windArrow`, and "12 mph", or "calm"), and the map is shown on a golf hole and away on minigolf
  and under the start screen. In the bag, between the words and the clubs, two cycle buttons, **Shape: Straight / Draw /
  Fade** and **Spin: Flat / Back / Top**, shown with a lofted club in hand and put back to straight and flat by a
  stroke (the hud is reconciled to the game's values each frame), and the bag's words name them ("Driver · fade · back ·
  lands 262 yd · fairway").
- A `Course` has `golf`, held by a test to its holes' layouts. `ground.ts`
  draws each kind of golf ground as a mesh of its own colour; the rough is
  painted under its blades (see the grass of a golf hole, in `turf.ts`'s bullet). `src/marker.ts` is the ring at a
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
  What the two hard courses added are options of a `GolfSpec`, each with a default that leaves a hole as it was
  (`test/golf-hash.test.ts` holds every hole of every course to a hash of its map, par, wind, greens, obstacles and terrain, so
  when a gate says a hash moved, a generator changed and not the content; a hole of a new course is added to it when it should be
  held): **`heighten`** (1 to 2.5, refused by name outside it) is `noiseGround`'s own, which scales the heights, multiplies
  them by the steepness and cuts every tile to the exact lower envelope under the physics' step (`lowerToLimit`, which says how
  many rounds it took), with the tee and cup plateaus and the level discs held level again; only the tee box, the green and
  its plate, and the **`shelves`** (yards along the way, 40 or more from tee and cup, each a level disc of four tiles) are asked
  to rest a ball, and in place of the rest of the fairway holding one, `drainFault` in `src/slopes.ts` asks that from every tile
  that does not, the steepest descent of the smoothed ground reach ground that holds a ball, rough, sand or water, never rock or
  out of bounds. `holdsBall` there is the one rule for whether a lie holds a tile's slope, and `runningShare` the share of fairway
  that does not. Only hills or long hills give relief enough, and heighten 1.4 to 1.8, which the plan began with, reached no more
  than about a twelfth, so The Fells are at 2.5 on steepness 0.9 (seeds are chosen by share and relief). **`gap: { to, width? }`**
  on a bend of 35 degrees or more plants the rough inside the corner as a wood, trunks three tiles apart, with a lane from the
  tee to `to` yards along the second leg kept clear (`laneOf(hole)` gives it to a test) and a shelf at its end; a wood spends no
  chance. A lane on a bend past 55 degrees runs into the rock beyond out of bounds. **`lakes`** (`LakeSpec`: where along the way
  or round the green, which side, a radius range, `islands` of fairway, rough, sand or the green, and an optional `carry`) lays
  water too big to go round, before any bunker or pond; `CARRY` is the most water, 45 tiles, a flight may need, and a lake that
  would leave no way is not laid; **`bunkers.island`** puts sand on an island (radius 5 or more, since two on a radius of
  4 fail half the seeds). A lake across a 560-yard hole is only 45 to 80 yards of water on its shortest line, so an island is a
  lay-up only from well back. The seed search takes `--course links|fells|isles` and prints the running share.
- **Putting** (stage 6). A golf map's `c` is the **first cut** (`LIE.cut`): mown, but longer than the green, one tile
  (3 yards) wide round every putting green (eight ways, so no gap at a corner) and one tile of rough along each side of a
  fairway, laid by `mown` in `golf.ts` after everything else is placed, spending no chance, and only on a tile that is
  exactly `r` or `f`. It rolls slower than the fairway (23), is a little worse to play from (`power` 0.97, `wild` 1.1),
  grows no blades and is drawn in an olive of its own. A hole's greens run at `HoleDef.greens`, in yards a second a second,
  less the faster (`GREENS` in `surfaces.ts`: 11 fast, 14 normal, 19.5 slow; a hole without it has 14; 11 and not 10.5 since
  the break model holds to the game's putt down to 11):
  `rollOf(lie, greens)` is the one place that says it, for the physics' world (`makeWorld`'s fifth argument),
  `Game.rollAt`, the autopilot and the rule that a hole's tee, fairway and green rest a ball, and the cut runs as much
  slower than the green as it always did. The green's **contour** (`GolfSpec.contour`, from 0 to 1 of `GREEN.steepest`,
  0.10: a tenth) is in the ground's own `terrain`, so a putt is the minigolf's model on a slope: `greenContour` in
  `noise.ts` is a plane through the cup, tilted along a direction from the hole's seed (`tiltAngle`; 0.8 of the
  slope) with two sizes of swells on it (0.2), scaled so the steepest slope on the green's tiles is exactly the contour
  times `GREEN.steepest`; `golfHole` lays it on a level plate round the cup (`PLATE`), which eases back into the hills over
  as few tiles as keep every step no steeper than the hills' own, so the hills away from the green are what they were
  (a test holds every Links hole to it) and a green that would go below nought is lifted. A uniform tilt is what makes a
  break: swells alone are zero-mean, their pull on a ball changes sign along a putt and cancels (median break 0.07
  yards on The Links, with the cup 1.45 yards in radius). The Links' contours run from 0.3 (the opener) to 1 (the last) and
  its greens from 11.4 to 16.7 (`speedName`: fast at 12.5 and under, slow over 17); The Straight Mile asks for its hills as they were (`steepness: 0.6975`, the 0.75 the
  generator used to gentle once because its green was not level). **The break** is in `green.ts`: `puttFrom` works a putt
  out backward from the cup, a point mass over the game's own ground with each lie's roll (about 0.03 ms, held by a count
  of slope reads), `breakOf` is its `across` (how far to aim off the cup, positive to the _right_, so a fall to the right is
  aimed to the left: the putt that arrives and would die half a yard past on a level green) and `rise`, held to the game's
  own rehearsed putts to 0.4 yards at the 90th percentile at every speed of green, and `greenArrows` is an arrow for each
  tile of green leaning more than 0.002. Across the Links' greens, putts of 5 to 25 yards break by a median 0.84 yards,
  at the 90th percentile 2.15, and 26% by more than the cup's radius (Home Stretch: 1.76, 4.01, 63%). A putt is struck along the
  ground's slope in `Game.shoot`, since sent flat into a rising face a hard one is going into the ground by its speed times the
  slope, which a tenth of a slope at the putter's hardest makes a landing, and the surface scrubs a landing. On the page the
  arrows (a merged group of flat arrows, blue-violet, pointing the way the ground carries a ball and 0.9 to 2.2 yards long
  by the slope, built once for a hole, none on a level green) show while the ball rests on the putting green or the first cut,
  the panel under the pin says "Fast greens" (`speedName`) and "Putt: aim 3.5 yd left, downhill 0.8 yd" (`puttText`: worked
  out when the ball comes to rest, never in a frame, and only on a hole that sets its greens' speed, so a level hole of the test helpers reads
  as it did), and a putt being aimed on such a hole is drawn as its own roll along the ground to a ring where it comes to rest
  (`Previewer.roll`, a second `Preview` made once with the hole, its dots over the straight ones, so the gap is the break).
  The autopilot putts by it: on a green that leans anywhere on the line the putt is tried in the rehearsal and corrected by
  `refine` (`PUTT` in `autopilot.ts`: tolerance 0.2, up to 8 trials), and on a level one it is the arithmetic, shot for shot
  what it was (the minigolf courses' rounds are held identical); the cut is dearer to route over
  than the fairway and cheaper than the rough, and a ball in it is played with the putter within 45 yards or with
  the club that reaches.
- The autopilot's golf shot is tried before it is taken. `Game.rehearsal()` is a game of the same hole that no one
  plays, chance held in the middle so a trial is the shot struck true, and only it may `trial(x, y)`; `refine`
  (`src/planner.ts`) corrects a candidate's power in proportion and its aim by the angle it was out by until the
  ball rests where it is meant to or drops. `src/route.ts` is the way to the cup over ground a ball is played from
  (round water, out of bounds, rock and canopies; the fairway cheapest; where land is cut off from the cup by water, an
  island or a shore a lake runs across, the flood back from the cup also crosses water at the fairway's cost, so the ball
  there has a distance and a lay-up has somewhere to go, a way point never stopping on water; land of fewer than `ISLAND`, 6, tiles
  is not counted as cut off, and canopies are ignored when judging it), and `strokesToGo` judges a resting ball by it,
  by its lie and by whether it is under a tree. The candidates are the arithmetic's (`golfCandidates`: the two shortest
  clubs that reach, the putter for a chip and run) at the cup, and lay-ups (`golfLayUps`): the longest few clubs at the
  place on the route they reach; `choose` tries each, judges it by where it rests (a ball lost is the stroke again and
  one more) and the best few again a little to either side and short, as a swing's scatter has them, and takes the best,
  the putter before any and then the earliest. A `Plan` says where it expects the ball to rest (`expect`), which is
  what happens, to the digit, when the swing is true. A shot is fifteen or so trials of 0.3 ms. `planProblems` is the
  rule that a plan is a shot, and the fuzzer checks each it takes. How far a ball runs on after it lands, which the
  arithmetic's first guess must allow for, is `runOn(club, lie)` in `autopilot.ts`, worked out from the surface table by
  the arithmetic of a landing (keep less the steepness, then the hops by bounce, then the roll) and not written down, so it
  moves with the next retune; against the game on the fairway it is within a tenth of a point of the share of the carry
  (driver 20.0 against 20.4 per cent). A ball that bounces on a side slope rests at a distance that is not a line of its
  power (a 5-iron at 160 yards across seven or ten degrees: 163 at 0.855 falling to 156 at 0.915, with steps of 8 and 18
  between neighbours), so the planner there finds the nearest it can (2 to 3 off) and not its tolerance.
- `src/hud.ts` is the words over the course: the hole and strokes, the
  score's name when a hole is done, the card, the coins and gems, the
  shop, and the start screen, a card for each course with its holes and
  par, shown at boot and from the card's Courses button. The page plays no
  shot while it is up; seven cards would not fit, so the panel is 820 wide and three cards across on a desk, and the cards'
  colours cycle through six (`#courses .course:nth-of-type(6n + k)` in `index.html`, so the seventh wears the first's). `src/score.ts` names a score
  (four or more under par is a Condor!, a hole in one still first) and says what kind it
  is, which colours its callout. Both are given what to show and never read
  the game. How the words look and move is `index.html`'s stylesheet, in the
  clean toy of `LOOK.md`: bright panels with a thick coloured edge, chunky
  pill buttons that sink when pressed, the score popped in as a tilted
  sticker, and every panel arriving with a short spring, none under reduced
  motion; in the system's rounded face, as decided. The view group
  (`#viewMode`) is a pill at the bottom right above the ms label, and the
  bottom slot on a phone; it is shown with the course's other panels and put
  away under the start screen, and the help beside it says what a drag does (on a phone the help wraps to two lines and
  keeps clear of the switch, held by a test at 400 and 360 wide). It holds the **Overhead** button (`#viewOverhead`, a text pill with
  `aria-pressed`: not saved, off at boot and put away by a new hole, and while it is on a drag pans the view over the hole, two fingers or the wheel zoom it,
  nothing is struck and the help says "drag to look round the hole"), and the **flag** (`#viewFlag`, a flag
  icon, no text, labelled "Look at the flag"): an action, not a toggle, which turns the camera to look near the cup from the
  ball (`faceFlag` in `main.ts`, through the hud's `flag` handler, to the Director's `nearFlag`), eased and by the shortest way, on
  minigolf as on golf, leaving the zoom, the tilt and an aim view as they are; it does nothing under the start
  screen, with the ball at the cup or while a drag is held on the course, and is disabled while Overhead is on (there is no
  way to face the cup from above). There is no Look switch and no Aim button: it is always aim. **On a phone** (under 600 wide or 500 high) the hole's
  panel (`#strokes`: name, par, strokes, pin, wind, greens, break) is a drawer off the left edge, out of the page's flow,
  pulled out by a chip at the top left (`#holeChip`: "Hole 3 · 0 strokes") and shut by its ✕, a tap on the dimmed course
  (`#drawerScrim`, which is not the canvas, so a drag there is never a shot) or escape; a new hole or the start screen shuts
  it, and `Hud.setDrawer` keeps its state as `data-drawer` on the page's root. The map stays out, under the chip. A desk
  has no chip and the panel as it was. The bag's clubs are round (`--club` across, 44 on a desk and as many as eight
  fit across a phone's width, 35.9 at 360, which is why `CLUB_LEAST` in `smoke/panels.ts` is not a thumb), the shape
  button carries an arrow in the stylesheet (a mask, so `textContent` is still the words: up for straight, curving left
  for a draw and right for a fade), and a golf hole's purse is the shop's button alone (`data-golf`: golf pays nothing).
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
  stand four to five times as high at the same one, and are smooth: The Links'
  hills are cut from them. `test/ground-metrics.ts` says what a
  feel is in figures (relief, steepest slope, bumpiness, detail, and how much
  of the ground a ball rests on), which the tests hold each hole to.
- The courses are content in `course.ts`, `COURSES`, each a name and its holes: The Meadow (`COURSE`), The Pinball Shed
  (`SHED`, `src/shed.ts`), The Fair (`FAIR`, `src/fair.ts`), The Waterworks (`WATERWORKS`, `src/waterworks.ts`),
  The Links, The Fells (`src/fells.ts`) and The Isles (`src/isles.ts`). The three minigolf courses are nine holes each, drawn by hand as The Meadow's are, with no generator, and
  made as the page loads. Each hole has a comment saying its idea and why it is drawn as it is, since what the
  autopilot would play decided the drawing: a ball's radius and three tenths of a unit clear of the water, a timing window at
  the autopilot's margin, a cup on level grass with a tile of grass round it. The Pinball Shed (par 25) is banks and bounces:
  the rail is a cushion, posts and kickers throw, and one hole has a flipper to time. The Fair (par 28) has something that
  moves on every hole: windmills, barriers, moving bumpers and belts. The Waterworks (par 28) has water on every hole, and
  on the last three a stream to ride. Each `Course` has a `summary` of its holes and par that the
  start screen reads without making it, so a course made by a generator is made when first asked for and not as the
  page loads. `openHole` in `src/open.ts` makes a hole of open country from a spec (a shape, a feel, a steepness, a seed
  and a list of `Feature`s: ponds, bunkers and stands of posts) and never by hand; no course uses it now, and the two
  test holes in `smoke/bighole.ts` (the biggest minigolf hole the perf gate holds, and a small one of fifty-one units)
  are made by it. It places each feature clear of the tee, the cup and the rail and a tile from the next, never so that no
  route three tiles wide is left from the tee to the cup, a pond in the lowest of the ground at nought and a bunker on a
  level bed (`noiseGround`'s level discs, blended by `BLEND`), and refuses a spec that cannot be made by name. A hole's
  name draws its wind, which must move the grass (`test/turf.test.ts`): names have been changed because they did not. The
  cup stands at least two tiles in from the rail. A hole is a map drawn
  as seen from the tee (`#` rail, `.` grass, `T` tee, `C` cup, `~` water,
  `s` sand, `o` a post on grass, `k` a kicker on grass (refused on golf), a digit for grass raised that many steps of
  0.4, space for off the course),
  a par, what moves on it, by map tile, and its `terrain`; and the cup's
  size. Hole names are unique across the courses, since the save keeps a
  best score by name. A step the
  ball rolls up; three (1.2) are a wall to it. Water is a floor below the
  world's bottom: a ball in it is lost, a stroke is added, and it is put back
  where it was struck from; what is drawn is a surface at `WATER_LEVEL`,
  which the ball never meets. `src/obstacles.ts` says where a barrier, a
  windmill's gate, a flipper's arm and a belt are at any moment of game time, as the physics'
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
  picture in `smoke/models.spec.ts`; the scene places it with `group`. The kicker (`models/kicker.ts`) and the flipper and
  stream (`models/obstacles.ts`) are the latest, each drawn to the physics' footprint.
- **What throws or moves:** a kind of obstacle is an `ObstacleDef` member in `obstacles.ts` (its pose from game time
  alone, refused by name where it cannot stand), a model, a place in the scene, an invariant, a fuzzer action on a chance of its
  own so no other run changes, and a test file of its own: the flipper (`test/flipper.test.ts`) is the whole of it, the kicker
  (`test/kicker.test.ts`) is the same for a body kind of `arena.ts`.
- **Tools:** the autopilot (`src/autopilot.ts`), and the gates built on it:
  pace (`scripts/pace.ts`), the fuzzer (`scripts/fuzzer.ts`) and the bench
  (`scripts/bench.ts`). Each has unit tests of its own working parts; the
  autopilot's say how far a shot rolls, that it sees round a corner, and
  that it finishes every hole.
- **Test helpers:** `newGame(seed)` in `test/helpers.ts`, `onGreen()` for a
  practice green whose cup is out of the way of tests of the ball,
  `groundFigures(layout)` in `test/ground-metrics.ts` for a ground's relief,
  steepness and bumpiness, `FLAT` and `levelHole` in `test/level.ts` (re-exported by `test/helpers.ts`) for a golf hole as flat as a table (a pitch, a par four with a bunker, a pond, a wind of 8 mph, a par five on quick greens), `SAMPLE_HOLES` for the slow
  tests that try every tile of every hole (all but six of The Links), and
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
posts, kickers, trees, the hardest shot, and every hole's name and par), `events`,
`invariants`, and `aiming`,
the shot a drag under way would make. `state` has the hole, its par, the
phase (`play`, `done`, `over`), the card, the coins and gems, the club in
hand and those owned, the hardest shot the club in hand strikes, the
course's name, whether the start screen is up (`choosing`), and whether the
hole is golf and the club of the bag in hand (`golf`, `inHand`).
Playing: `shoot(angle, power, club?, shape?, spin?)` (with a club of the bag put in hand
first, on a golf hole, and a shape and a spin chosen for it), `club(id)`, `bag()` (each club's loft, hardest launch
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
Looking: `look(x, y, distance)` parks the camera until `follow`, at the home view (home tilt and a lead of `LEAD`, however the
aim view of a golf hole had set it), `view()`
says how far back it stands, how far ahead of the ball it looks (`lead`), whether it is still easing to an aim view (`aiming`)
and which rung of the quality ladder the
picture is on and whether the grass sways (`swaying`), what a drag is (`mode`,
`aim` or `overhead`) and how the view is turned and tilted (`azimuth`, `tilt`), the azimuth it is turning to (`heading`; its own
when it is turning to none) and where the flag button would turn it from where the ball lies (`flag`, null at the cup), how far it is
blended to the overhead view (`blend`) and the renderer's far plane (`farPlane`, raised while it is), whether it is following the ball
for the stroke played (`following`), and the framing rule as it stands (`framing`: where the ball and the reach point are in NDC, the
safe box, whether the view has settled and the problems `framingProblems` finds, empty when it holds); `orbit(turn, tilt)` is a test's
own setter for the turn and the tilt, which no player can reach (a drag does not move it), `overhead(on?)` presses the Overhead
button's action (the other way to now when not told; refused under the start screen) and says whether it is on after,
`followShots('drawn' | 'always' | 'never')` chooses the strokes the camera follows the ball for, `seed(n)` seeds the camera's tosses (which side of
the flag it looks to, which strokes it follows) as well as the game's chance, `faceFlag()` presses the flag button's action (false when it did nothing), and `measureFrame`;
`judge(frames, gapMs, workMs)` feeds the quality governor as the frame loop does, and says
the rung; `grass()` how many blades of the rough the last frame drew near
and far, and the wind; `bladesAround(x, y, radius)` how many the GPU drew
with roots there; `motions()` where each of
the things that answer is (the ball's squash, the flag's waggle, the gold's
flash and the glints the last frame lit, `kicks` (how many kickers the last frame lit with a flash; absent while none is), the camera's glide and the aim's
pulse, the sparkles of the water and where on the page each was drawn, how
wide the ring is where a ball went into the water, what the last stroke
threw up, sand or grass, and where the ring is that marks a lofted ball's
first landing and how wide, and `shot`: the preview of the shot being aimed, its dots of arc, its ring with its
colour and size, the spread's half axes, where a tree knocks it and what it comes to, null when none is drawn), read back
from what the last frame placed; and `map()`, the hole's map over the course: its size and where the ball, the cup and the
landing of the shot being aimed are on it. `state()` has the shape and the spin chosen, the hole's `wind` (x, y, speed), its `greens` speed and its name (`greenSpeed`: `fast`,
`medium`, `slow` or null) and `arrows`, how many stand over its green;
`motions()` has `wind` (the arrow's turn in degrees and its text, read back from the page), `controls` (the two buttons as drawn),
`arrows` ({ shown, count }: what the last frame wrote), `shot.heading` and `press` (the grass pressed flat round a ball at rest in the rough this frame: where, how wide, and whether
the renderer took it; null otherwise). `view()` also has `turning` (whether the camera is turning to face the cup), and `putt` and `greens`, the two lines under the pin as drawn (null when none). `?rung=N` on the page puts the picture
on a rung and holds it; paused, the governor never moves it, so pictures are
always taken at the top rung unless a test asks. In unit tests, `game.place(x, y)` puts the
ball down at a lie.

## What is not there yet

- The Fells and The Isles, as they are. The preview shows only the first landing, so how far a ball runs down The Fells' slopes
  after it lands is not seen, which is the biggest risk to how the course feels and is for the user to judge by playing. The
  autopilot and the pace player know no slope and play round the wood, so a lane is a human's shortcut that no gate plays.
  On steep ground a marginal slope does not run when a ball is put down on it, only when struck. A lake across one of The Isles' longer holes is 45 to 80 yards of water, no more than a flight needs.

Each of these is the first feature's to bring, with every gate green at
each step, and a gate handed what it needs in the same change:

- The limits of the golf there is, from `~/.claude/plans/ooergolf-proper-golf.md` (all six stages are built). What stage 3
  leaves as it found it: a golf hole's green is round and stepped by the tile, so are its bunkers, an invisible wall
  stands beyond out of bounds, a ball landing on a post's top or a box is left as the physics has it, the club in hand is
  not saved, and the planner knows nothing of a lay-up chosen for the next shot's
  sake. What stage 4 leaves: the preview is the true swing to the first landing (the run-out after it is not shown, nor
  where the ball would rest, so a spin is not seen until the ball has landed); the map is not
  interactive and does not turn with the camera; the camera can lose the ball behind a tree at a low tilt; and the aim
  view is not saved (nothing of the view is). What stage 5 leaves: the wind is steady (no gusts) and uniform along a hole,
  and a lofted club is blown further in yards than a driver; a shape's rate is fixed per club, so a half-power shot curves
  about an eighth as far in yards as a full one; the autopilot plays straight and flat, copes with the wind through its
  rehearsal (12 to 22 trials a shot in 15 mph, against 12 to 17 calm) and does not choose a shape or a spin; the shape
  and spin are chosen in three steps, not continuously; and the shape and spin buttons are not in the golf pictures the
  look gate holds, which were not rewritten for them (see the commit). What stage 6 leaves: a green is one tilted plane
  with swells on it, no tiers, humps or ridges, one speed to a hole and the same on all of it, and no first cut wider than a
  tile; the cup takes a ball within about 1.4 yards of its line, so a break shows in play only past that (a median putt on
  The Links aims 0.8 yards off, and one in four more than the cup's radius), and a smaller cup or a steeper green is a feel
  to be chosen, not a bug; `breakOf` is the aim of the putt that would die half a yard past the cup on the level, which
  on a slope this steep is not where it rests, and past the putter's reach (a putt over 50 yards on a green of 16) it says
  so by `speed` over `HARDEST_SHOT` and gives no best-effort figure; the autopilot's putt count in `strokesToGo` and its
  lay-ups know no contour or speed, so it will not leave a ball below the hole; a putt played toward the camera (the ball
  past the cup) has the cup under the bag; the arrows are not switched off, and show whenever the ball rests on the green or
  the cut; the speed of the greens is not in the shop; and the cut's colour, the arrows' and the roll's look were chosen
  once, by looking, and are a taste.

- An autopilot that keeps a margin from water that grows with the shot. It
  skirts a pond by 1.3 units, and a 5% slip over a 45-unit shot wanders 2.3,
  so on a big hole with a pond on its line it can splash four or five times
  and be picked up at the limit (three seeds of sixteen on an open spec);
  a margin that grows would move the pace of the courses there are.
- Holes past what the grass field, the frame and the look allow. A cell of
  1.5 lifts the field's limit to 489 tiles a side; a frame at 400 by 400
  tiles was 4.7 ms when the budget was 5 (it is 6 now), since a bigger hole draws more ground; and some
  holes of 200 tiles a side and more show rough blades pale and frosty near
  the camera, which was not the shadow's fit or the cell and is not
  understood. No hole there is comes near them.
- An autopilot that reads a slope's break on minigolf (on a golf green it does, by rehearsal). It aims straight at the cup and
  judges the distance along the level: it stops within 0.6 units of where
  it means on four shots across a hollow in five, and 2.4 long on a 21-unit
  climb, since the physics slows a ball along the slope. So a sloped hole's par
  is its intent. A barrier or a windmill on a slope is refused when a hole is
  built, as the physics' fuzzer found one carrying a ball round for good; a flipper is refused on a slope too.
- Belts on a slope. The physics allows a conveyor on sloping ground and carries a ball up it, but the scene draws every
  belt at ground level, so one on a slope is buried; The Lift is level with a step at its end, and The Flood's bowl of steps
  stands on level ground. No belt may stand on a slope in a picture until the scene lifts them.
- A stream that can be crossed, or a belt that lets a ball off it: see the kinds above. A ring of belts holds a ball for
  good and a real turntable is a package change, so Carousel is a mound with belts round it, and the turntable was dropped.
- A phone drive's picture is flaky: the shot preview is null after a real drag in about one run in three of the smoke
  test that drives it. It was there before the new courses, and is not understood.
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
- Turning the camera by hand (the right mouse button, the keys, a two-finger twist, or the Look switch that was removed
  on 6 October 2026): the camera turns to the aim and to near the flag, and the overhead view is for looking. The view is not saved.
  The near rail can hide the ball at a low tilt from some headings, and
  catches a strong pale sheen from some: both are left as they are. A chase camera behind the ball for the strokes it does not follow, the
  ball hidden behind a tree or a rail, and the map turning with the camera are not there, and how the held view feels after a big turn to the
  aim, desk and phone, is for the user to judge by playing. The overhead view draws no grass on most holes (it stands past the rings), and
  has no new rung on the ladder, since it costs a frame less than the standard view.
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
`npm run fuzz -- --seeds 1-24` clean: run once, at the end of the piece of
work, as "When to check" says, and not after each step of it.

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
  both limits, at the home zoom and the widest, where the grass costs most;
  the ball and the furthest reach on the screen at every heading, on a desk and a
  phone, for every club; a drag turned to the aim and taken back (left looking there); the flag
  button near the cup and never at it; a stroke followed and one held (and a held ball that would leave the
  screen); the overhead view fitted to the whole hole on a desk and a phone turned along and across it, and
  left to the view as it was

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
