# Ooergolf: the design

What the game is to be, agreed on 27 September 2026, before any of it was
built. `CLAUDE.md` says how the game is made and `README.md` what is there
now; this says where it is going, and each `/feature` reads it for the part
it is building. Where a feature finds the design wrong, the design is
changed in the same commit, and says why.

## The game

Minigolf in 3D, on a cartoon course, on a phone or a desktop. The player
drags back from the ball to aim and set the power, and lets go. What the
ball does then is physics: it rolls, banks off walls, is knocked about by
obstacles, and flies if something throws it. The goal is the cup, in as few
strokes as the hole allows. Nine holes to start with, and more holes and
courses after, as content.

## The loop

1. The ball is on the tee. The player takes a stroke.
2. The ball moves until it comes to rest, is holed, or is lost.
3. At rest, the next stroke is taken from where it lies.
4. Holed, the hole is scored against its par, coins are paid, and the next
   hole begins.
5. After the ninth, the card is shown, and the shop is open.

## The shot

- **The drag.** Press anywhere on the course, drag back, and let go, as with
  a slingshot. The shot goes the way opposite to the drag, on the ground,
  and the length of the drag is how far the ball rolls, up to the club's
  most: full at 35% of the screen's shorter side, and linear, so half the
  drag rolls half as far. Until the retune on physics v0.4.1 it set the
  speed, which under the old drag came to the same thing; under the green's
  steady slowing a half speed rolls a quarter as far. Anywhere and not on
  the ball, since on a phone a finger on the ball hides it (agreed when the
  shot was built). One pointer, so a finger and a
  mouse are the same input.
- **The aim line.** Drawn from the ball along the shot, as long as the club
  allows, and showing the power.
- **Cancelling.** A drag brought back to where it began, within 4% of the
  screen's shorter side, and let go is no shot, and costs no stroke.
- **While the ball moves,** no shot can be taken. The ball is at rest when
  the physics puts it to sleep.
- **No input is 3D.** A shot gives the ball a speed along the ground and
  none upward. Height comes only from what the ball meets.
- **The figures,** measured and agreed when the shot was built, and at the
  retune on physics v0.4.1. A world unit is 10 cm. The hardest shot of the
  starting club is 40 units a second, about 50 units of roll: three
  quarters of the course. The green slows a ball steadily, at 16 units a
  second a second, as a putt dies on a green, so the hardest shot stops in
  under three seconds; the upgrades take its roll to about 72. The rail
  keeps 0.65 of the speed a ball meets it with, so a ball at thirty degrees
  comes away at about twenty, and a barrier or a blade 0.5. The physics
  moves a fast ball in pieces, and holds against tunnelling up to 240.

## The rules

- **Par** is per hole, the hole's intent, and never less than two. The
  autopilot's median on each (`npm run pace`) is kept beside it; it times
  what moves exactly, as no player does, so it is not the par.
- **Water and out of bounds** cost one stroke, and the ball is put back
  where it last lay at rest.
- **The limit** on a hole is par and five more. At the limit the hole is
  picked up, scored at the limit, and the next begins.
- **Between holes,** the score is named over the course for two seconds, and
  then the next hole begins. After the last, the card stays until the player
  asks for another round.
- **A hole in one** pays a gem.
- **Every hole can be finished** with the starting club and ball. An
  upgrade makes a hole easier, never possible.

## The physics

The ball is a sphere in three dimensions under gravity. What the game needs
of the physics, all of it in `artshape-physics` and none of it in the game:

| Needed                           | What for                                   |
| -------------------------------- | ------------------------------------------ |
| Walls that bounce, by a figure   | Banking a shot off a wall                  |
| Boxes that bounce, moving or not | Barriers, windmill blades, angled walls    |
| Round static shapes that bounce  | Bumpers                                    |
| Drag by surface                  | Grass, rough, sand, and whatever is slick  |
| Bounce and drag by kind of body  | Balls that differ, for the upgrades        |
| Walls with a height              | A ball in flight clearing a low wall       |
| A cup that catches by speed      | A ball too fast rolls over, or lips out    |
| Which hole took the ball         | Telling the cup from the water             |
| A fast ball kept out of walls    | The hardest shot against the thinnest wall |
| Floors at heights                | Raised greens and steps (in v0.3.0)        |
| A bottom to fall out of          | A ball off the edge of the course (v0.2.0) |

Slopes and ramps are not in this list. They are the largest piece of work,
and the first nine holes do without them. They come with a later course.

All of it is in artshape-physics v0.4.1, made in that repo to its own
definition of done and taken in here with a version bump. v0.4.1 came of
this game's fuzzer: a ball running round the inside of the cup's rim, held
up by it, came back to where it was in the physics' window for judging a
ball at rest, and was put to sleep in the mouth of the cup; now a ball
going faster than 2 is never put to sleep.

## The course

A course is a list of holes, and a hole is content, not code:

- a grid of tiles, each with a surface and a height
- the tee and the cup
- the par
- the obstacles, each a kind, a place and its settings
- the decoration, which the physics never sees

A moving obstacle is where it is as a function of game time alone, so the
same seed and the same strokes give the same round.

### The obstacles

| Obstacle        | What it does                                          |
| --------------- | ----------------------------------------------------- |
| Wall            | Bounces the ball                                      |
| Bunker          | Sand: heavy drag                                      |
| Water           | Takes the ball: a stroke, and back where it lay       |
| Sliding barrier | A box going to and fro across the line                |
| Bumper          | A round post that bounces the ball harder than a wall |
| Windmill        | Blades turning across a gap                           |
| Conveyor        | Carries the ball along (the physics' belts)           |

### The first nine

Each hole brings one new thing, and the ninth has them all.

| Hole | Brings                                  |
| ---- | --------------------------------------- |
| 1    | A straight putt                         |
| 2    | A dog-leg, banked off the wall          |
| 3    | A bunker                                |
| 4    | Water                                   |
| 5    | A sliding barrier                       |
| 6    | Bumpers                                 |
| 7    | A raised green, up a step from a bumper |
| 8    | A windmill                              |
| 9    | All of them, and a conveyor to the cup  |

Hole 7 was to be a ramp and a jump. Without slopes it is a raised green,
and whether a ball can be got up a step without a ramp was for its feature
to find out: it can. A ball climbs a step lower than its radius at no cost
to its speed, and a rise of 1.2 is a wall, so a ramp of steps of 0.4 leads
up onto grass walled off everywhere else.

On artshape-physics v0.4.1, the course is nine holes: Straight, Dog-leg,
The Bunker (sand across the front of the cup, to be gone round or blasted
through), Pond, Barriers, Bumpers (five posts, one on the straight line to
the cup), Up and Over (the ramp onto a plateau between two ponds, and a
drop to the cup), Windmill, and The Mill Race (a barrier, the windmill,
and a conveyor to the cup between ponds). The Mill Race does not yet have
everything, as the ninth is to.

- **Sand** slows a ball steadily, at 60 a second a second where the green
  is 16: a putt that reaches it at 20 dies three units in, and the hardest
  shot ploughs thirteen. It is drawn as one bed over its tiles, with the
  lip only where it meets the grass.
- **A post** is a unit in radius and 1.6 high, and throws a ball back a
  fifth faster than it met it, as a pinball post does. Between two facing
  each other a ball would be thrown faster each time without end, so
  nothing on the course throws a ball faster than half as fast again as
  the hardest shot of the club that struck it.

- **Water** costs a stroke, and the ball is put back where it was struck
  from; at the limit the hole is picked up.
- **A ball the course keeps moving,** a belt carrying it, may be struck
  where it lies after ten seconds. A belt carries at its own speed: the
  green's steady slowing is not on it. A barrier or a blade bounces a ball
  off, and carries it no longer.

## The upgrades

Bought in the shop with what the holes pay. They change the physics, within
limits, so a score is a score with a given club and ball.

- **Clubs** raise the most power a shot can have, and lengthen the aim
  line. Made of precious metal and enamel. Five putters, set in
  `src/clubs.ts`: the starting one at 40, brass at 42 for 40 coins, silver
  at 44 for 100, enamel at 46 for 220 and a gem, and gold at 48 for 450 and
  three gems. Each rolls as far as it did when the green slowed a ball by
  drag, from 50 units to 72; since the roll goes as the square of the
  speed, the figures are closer together than they were.
- **Balls** differ in bounce and in roll. Made of enamel and gems.
- **Coins** are paid for finishing a hole (5), and more for each stroke
  under par (5 each); a hole picked up pays nothing. **Gems** are paid for a
  hole in one. The shop is open from the purse's button and from the card.
- The best score on a hole is kept with the club and ball it was made with.

## The look

Miner's way of making things, in daylight: low-poly, flat-shaded, faces
sharing no vertices, every colour given by placement and none by texture,
and all the words in the page, not the picture.

- **The renderer** is `artshape-render` v0.18.0, on the game path, with
  `shading: 'toon'` and the `clamp` tone map, as bearing has it. v0.18.0
  also brings patterns by placement and sprites. The game is on v0.16.0 now
  and moves up in the first feature that draws something of the golf.
- **Light.** The `daylight` environment, a sun with a shadow, and ambient
  light on. Lamps only where a hole wants one. The shade where things meet
  from screen-space occlusion, a thin haze that pales the far rough, and a
  glint now and then on the gold of the cup and the pin.
- **Grass** is real blades, grown on the GPU by the renderer: short, dense
  and mown in stripes on the green, long and sparse in the rough, which is
  darker so the course stands out from it. Each hole has a gentle wind of
  its own that the grass bends in, in gusts that cross the course, and the
  flag and the trees follow the same gusts. A rolling ball lays the blades
  flat and darker behind it, and they stand again in six seconds. A slow
  machine is given half the blades, standing still, and the slowest none.
  **Bunkers** are pale, matte and speckled.
- **Obstacles** are bright glossy plastic: the windmill, the bumpers, the
  barriers, the flags.
- **Precious things** are gold, enamel and gems, with the measured colours
  the renderer has for its metals: the rim of the cup, the trophies, the
  clubs and the balls.
- **Water** is opaque, blue and glossy, with a splash of particles, the
  game path having no transparency.
- **Movement** that is only to be seen: the ball turns as it rolls, with a
  red band round it to show it; the flag swings, the trees lean and the
  ripples swell in the hole's wind; a puff of grass at a stroke, confetti and
  sparkles out of the cup, and a splash in water.
- **Decoration** is for fun and the physics knows nothing of it: trees,
  hedges, flowers, bunting, a flag in every cup. Each hole has its own
  scatter of it on the rough, the same every time, and is dressed: bunting
  strung round three sides above the rail, beds of flowers at its foot, and
  rocks in clusters, on the long grass of the rough.
- **The green is raised.** Each hole stands on the rough on timber sides,
  the rough below the bottom of the cup, so the cup is a hole seen into.
- **The cup** is 1.45 across its middle, a little wider than the ball, so
  that its opening fits inside one tile of grass; its gold rim lies over the
  grass round it. It has the physics' rim, of 0.3, and no pull toward it:
  through the middle it holds a putt arriving at up to 18 a second and
  throws one from 23 up and over; 0.6 of its radius off the middle, it
  holds one up to 7 and lips out one from 9. Measured, and chosen over a
  wider cup at the retune, since 1.6 no longer fits a tile as it is drawn.

## The camera

The game frames the hole, from three-quarters above, and follows the ball.
On a phone held upright it turns so the hole runs up the screen. On a
desktop the wheel zooms. There is no free orbit on touch, where a drag is a
shot.

## Phone and desktop

- One pointer input for both, and nothing that needs a keyboard. Two
  fingers pinch the camera nearer or further; a second finger landing
  mid-drag takes the shot back.
- The page in the upright and the sideways shape, nothing wider than the
  screen.
- The pixel ratio capped, and the renderer's economy stepped down a rung at
  a time on a slower GPU: particles, then shadows, then post. The governor
  judges on the mean time between frames over two seconds, against 20 ms,
  leaves out a stall or a hidden page, waits two seconds after each step,
  and never steps back up by itself.
- The budgets in `CLAUDE.md` hold on both.

## The save

The best score on each hole and what it was made with, the coins, the gems,
what is owned, what is equipped, and how far through the course the player
is. Each is a field with a default, and each new shape joins `test/saves/`.

## The order of the work

Each line is a feature or more, through `/feature`, every gate green at each.

1. `artshape-physics`, the new version, in its own repo.
2. The ball and the shot, on the empty course. The renderer moves to
   v0.18.0 here.
3. The cup, the strokes and holing out. The pace gate comes back here, as
   the strokes the autopilot takes.
4. Holes as content, and holes 1 to 3: walls and a bunker.
5. Water, the sliding barrier, bumpers, the raised green, the windmill and
   the conveyor, a feature each, and the hole that brings each.
6. The card, the coins and the save.
7. The shop, the clubs and the balls.
8. The decoration and the daylight look, which also goes on all the way
   through as each thing is drawn.

## What is not decided

- The figures: how hard the hardest shot is, what each surface drags, what
  each upgrade is worth and costs. Each is set by its feature, against the
  autopilot.
- Whether a ball can be got up a step without a ramp (hole 7).
- Sound. None is designed.
- Slopes and ramps, and the courses after the first.
