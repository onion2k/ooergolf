# Ooergolf: the look it is to have

The game plays well and looks like a prototype: a clean scene, lit, but
flat, a little milky, with stair-stepped edges, faceted models and a HUD
that reads as a debug overlay. This file is the look it is to have, and the
stages that take it there, each a feature of its own through `/feature`.
Without it, each stage would be tuned to taste on the day, and the course
would end up in several styles at once.

`DESIGN.md` says what the game is to be; this says what it is to look like.
The house rules and the project's CLAUDE.md say how each stage is made.

## The direction: a clean toy in bright sun

The reference is the polish of Nintendo's own Switch games, Mario Kart 8,
Super Mario Odyssey, Kirby and the Forgotten Land: not their characters,
shapes or courses, which are theirs, but the qualities that make them read
as finished. Of the two looks those games take, this is the clean toy, as
Mario Kart and Odyssey are, and not the handmade material of Yoshi's
Crafted World, with its felt and card: a smooth ball rolling on a smooth
green wants surfaces as smooth as it is.

What the look is made of, each a rule a stage is held to:

- **What the ball meets is chunky and rounded; what grows round it is
  low-poly.** Every edge of the ball, the cup, the flag, the rail and the
  obstacles is bevelled and catches the light, and none is a bare box or a
  faceted lump. The trees, bushes, rocks, stones, hills and clouds round a
  course are cut in flat facets, as the title picture has them (decided on
  8 October 2026; until then they were moulded smooth too). Shapes are few
  and bold, and detail goes where the eye goes.
- **Colour is saturated and harmonised.** A small named palette, bright in
  the sun and never grey in the shade. The shade is a cool blue-violet of
  the colour, not a darker grey of it.
- **Light is strong and simple.** A warm sun with clear contrast between
  the lit face and the shaded one; a sky light from above and a warm bounce
  from the grass below; a bright rim where a thing meets the sky, so every
  object stands off what is behind it.
- **Edges are clean.** No stair steps on a rail, a string or a pole, and no
  shimmer on a thin thing as the camera moves.
- **Nothing is inked.** No outlines: those games draw none, and a line
  round everything is a different style.
- **The words are part of the toy.** Chunky rounded type, bright panels
  with a thick edge and a soft drop shadow, buttons that are pressed, and
  every panel arriving with a bounce.
- **Everything answers.** The ball squashes at a hard knock, the flag
  waggles as a ball drops, a score pops. Small, quick and always from game
  time, so a picture is the same every run.

## Where it stands now

Measured on this machine, headless, at 1280×800, at artshape-render v0.19.0
and ooergolf 72b2847.

| What                                   | Now                                                                |
| -------------------------------------- | ------------------------------------------------------------------ |
| A frame, top rung, the play view       | 1.12 ms, of which the grass is about 0.45                          |
| A frame, top rung, the standard view   | 1.10 ms; the budget is 8                                           |
| A frame, each rung down, the play view | 0.90, 0.54, 0.16 ms                                                |
| Blades drawn, the play view            | 51,045 near and 7,077 far                                          |
| The green's share of a hole's blades   | 40% to 62%, and most of those near the camera                      |
| The download, gzipped                  | 90.2 kB, of a 400 kB budget                                        |
| Antialiasing in the game's renderer    | none: only the still-life renderer has it                          |
| Toon shading                           | three hard bands, 0.6, 0.8 and 1.0 of the sun, and a hard glint    |
| The light                              | sun 2.5, ambient 1, a haze of the sky's blue, bloom at its default |
| The type                               | the system's rounded face, in dark translucent panels              |
| The models                             | flat-shaded facets; the rail a box a tile, its corners square      |
| The green on the lowest rung           | already drawn without blades, in the colour between them           |

So the look has room: a frame is an eighth of its budget and the download
a quarter of its. The cost of the look is to be spent, and held by the perf
gate as everything else is.

## Stages

In order, each a `/feature` with its own spec agreed before it is built,
drawing on the stage here. The order puts the change that alters what
everything else is tuned against first, and motion last, once the look it
moves has settled.

### 1. The green without blades

**What:** the blades grow only in the rough. The green is the ground mesh
`ground.ts` already draws, painted: its two mown stripes, a soft sheen
toward the sun, and a fine turf grain drawn in world units, as the rough's
speckle is. The green is smooth, bright and clean, and the rough's long
blades frame it.

**Why first:** the green is most of the picture, and every colour after
it is tuned against it. Built first, as the blades and the track taken
away and the green painted as the lowest rung drew it; its sheen and grain
are colour work, and go with the palette in stage 3.

**Acceptance criteria:**

1. No blade grows on the course's grass: the field's mask has no green
   cell, on every hole of both courses.
2. The rough grows as it does now, off the course and past the field, and
   moves in the hole's wind.
3. The green's stripes are two tile rows wide, as the blades' were, and a
   stripe's shade differs from the next by the same share.
4. The frame at the play view costs less than it did, by what the green's
   blades cost, measured before and after.
5. The lowest rung and the top rung draw the same green, as the lowest
   rung's already was.

**Edge cases:**

- **The grass:** the track the ball presses in the green goes with the
  blades; see the decisions. A ball never lies in the rough, which is off
  the course and solid to it.
- **Slopes:** the painted green follows the ground mesh, which already
  follows the slopes.
- **The cup:** its gold rim, no longer hidden by blades, is seen whole;
  the look test of the glint is taken again.
- **Phone:** the first rung down no longer has green blades to thin; it
  thins the rough's.

**Performance:** a saving, expected to be most of the 0.45 ms the grass
costs at the play view.

**Tests:** the field's mask in `test/turf.test.ts`; the blades drawn in the
smoke test of the grass, far fewer near; every picture of the course taken
again and looked at.

### 2. The renderer: clean edges, and a toon light with depth

**What:** a release of artshape-render, taken in with a version bump, as
the physics is. Everything new is a setting of the look that is off by
default, so a game that asks for none of it draws bit for bit as before.

- **Antialiasing:** four samples a pixel on the scene, or a post pass that
  smooths edges as a cheaper rung, so a rail, a string or a pole has no
  stair steps.
- **Soft band edges:** the toon bands' edges eased over a narrow width,
  not a hard step, so a band's edge on a curve is a clean line.
- **A shade colour:** the shaded band and the sun's shadow tinted toward a
  colour of the look's, a cool blue-violet for this game.
- **A rim light:** a bright edge where a surface turns from the camera,
  its colour and strength settings of the look.
- **A sky and a ground light:** the ambient from above in the sky's colour
  and from below in a bounce colour, in place of one flat amount.
- **A sky with a horizon:** the background as a gradient from a zenith
  colour to a horizon colour, for any view that sees the sky.

**Acceptance criteria:**

1. With none of the new settings, every picture in this repo matches as it
   was, and the renderer's own tests pass.
2. A diagonal edge drawn with antialiasing on has pixels between its two
   colours along it; off, it has none.
3. Each setting moves only what it says, shown by a picture of the
   renderer's own test scene with it off and on.
4. The frame cost of each setting is measured and written in the
   renderer's docs, and antialiasing has an economy switch the ladder can
   turn off.

**Where:** in the artshape-render repo, to its own definition of done. It
has work of its own in progress, which is left as it is: this goes round
it, or waits for it.

**Performance:** antialiasing is the one real cost, from a quarter to a
half of a millisecond here, to be measured; the rest are a few
instructions a pixel.

### 3. The light and the colour

**Built,** with the renderer's settings as `TOY` in `look.ts` and the
green, rough and rail named in `models/palette.ts`, which the scene and the
showcase share. The green's grain is there; its sheen is not, since the
toon shader's only highlight is a hard glint, and the rim and the sky and
ground light gave the green the life a sheen was for. The palette of the
things on the course, the rail's cap among them, is the furniture stage's.

**What:** the game takes stage 2's settings and sets the palette. One
named palette in `look.ts`, the only place a colour of the course is
chosen: the green's two stripes, the rough, the rail's paint and its cap,
sand, water, the cup's gold, the flag, the ball and its band, the sun, the
shade, the rim, the sky and the bounce. The sun warm and strong, the
ambient lower, so the lit face and the shaded one differ clearly; the haze
thinned or gone; a little bloom on what is brightest. And the green's
finish, from stage 1: a soft sheen toward the sun, and a fine turf grain
drawn in world units, faint enough not to shimmer at a distance.

**Acceptance criteria:**

1. Every colour of the course comes from the palette, and a test finds no
   colour literal in `scene.ts` or `models/` that is not from it.
2. Held as figures, from the pictures, by a look-metrics tool: the
   course's mean saturation, the contrast between a lit and a shaded face
   of the rail, and the shade's hue, each above or at what this stage sets,
   so a later change that greys the picture is caught as the perf gate
   catches a slower frame.
3. The showcase is drawn in the same look as the game, as `look.ts` makes
   it now.

**Tools:** the look-metrics tool is new: it is watched on several pictures
it should agree with, and several it should not, before any figure it
gives is trusted.

**Tests:** every picture taken again and looked at, each one set beside the
one before.

### 4. The course's furniture

**Built.** One thing found and not fixed: the rail tiles under a
windmill's tower are left out whole, and the tower covers only half of
each, so for about 1.5 units either side of it the physics has rail that is
drawn as rough. Drawing them puts the rail's side in the plane of the
door's inner walls; it wants a fix of its own.

**What:** the things on screen every moment, remade as rounded toys.

- **The rail:** painted timber with a rounded cap along its top, its edges
  bevelled, its corners rounded where it turns, still following the
  ground's slopes, and drawn no bigger than the wall the physics gives it,
  so what is seen is what the ball meets.
- **The cup:** a thicker rounded gold rim with a clean highlight, and a
  collar that meets the green without a seam, level or on a slope.
- **The flag:** a rounded pole with a ball on its top, and cloth with soft
  folds, still flying down the hole's wind.
- **The tee:** chunky rounded markers.
- **The ball:** its band and a soft shine, smooth at every size it is seen.

**Acceptance criteria:** each model's size held to the physics by the
existing tests; its normals smooth where it is round and sharp only at a
bevel's edge; its triangle budget in `BUDGET` set anew and held; a picture
of each close, in the showcase and on the course.

**Edge cases:**

- **Slopes:** the rail on a hole that slopes, and the cup on Side-hill (a test hole since The Hills were scrapped).
- **Rock:** the rail at every corner and T the maps make.
- **The camera:** the rail's cap seen from above and from the tee.

### 5. The words: HUD, screens and buttons

**Built,** in the system's rounded face as decided, and with no picture of
a hole on the course cards, which are striped in each course's colour. The
motion is CSS's alone, so a browser without its newest springs shows and
hides the panels without them.

**What:** the HUD, the card, the shop and the start screen remade.

- **Type:** a rounded, bold, open-licensed web font, subset to what the
  game says, in place of the system's.
- **Panels:** bright, with a thick coloured edge and a soft drop shadow,
  in place of dark glass.
- **Buttons:** chunky, round-ended, with a pressed state.
- **The score:** a hole's score named large, and popped in with a bounce.
- **The start screen:** each course's card showing a picture of one of its
  holes, drawn by the game itself.
- **Motion:** every panel arrives and leaves with a short spring, and none
  when the player asks the system for less motion.

**Acceptance criteria:**

1. The font loads before the first frame, or the page shows the system's
   rounded face and changes without moving anything; the download stays
   within its budget, the font weighed first.
2. Every text meets a contrast of 4.5 to 1 against its panel.
3. Nothing is wider than the screen at 400 pixels, and every button is at
   least 44 pixels high.
4. Pictures at desktop and phone of the HUD, the holed score, the card,
   the shop and the start screen, with animations finished.

### 6. The world round the course

**Built,** the scenery models only: the hills beyond and the clouds are left
out, as decided. The renderer has no colour a vertex, so a tree's canopy is
two greens, its crown lighter, where a soft gradient was asked for.

**What:** the scenery as the same toy.

- **Trees:** round, smooth-shaded canopies with a soft gradient, on
  simple trunks, in place of faceted lumps; the pines as stacked rounded
  cones.
- **Rocks, hedges and flowers:** rounded, chunky, and fewer and bolder.
- **The rough:** its blades brightened to sit with the new palette, still
  darker than the green so the course is framed.
- **Beyond:** gentle rolling hills round the field's edge, and the sky's
  gradient with a few rounded clouds where any view sees the horizon.

**Acceptance criteria:** as stage 4's for each model, and a picture of each
hole from its tee, and of the start screen.

**Performance:** the scenery is instanced and fixed; the frame at the
standard view is measured before and after, and the budget holds.

### 7. Everything answers

**What:** small motions from game time, drawn by the page from the game's
events.

- **The ball:** squashes along a hard knock off the rail or a post, and
  springs back, within a tenth of a second.
- **The cup:** the flag waggles as a ball drops, and the gold flashes.
- **The shot:** the aim's dots pulse gently while a drag is held.
- **The camera:** eases to its place at the start of a hole and never
  jumps.

**Acceptance criteria:** each motion a function of game time with unit
tests of its shape and its end; nothing kept past its end, named in the
leak gate where it keeps anything; a picture at a fixed frame of each.

**Edge cases:** a hole restarted mid-motion, the last hole and the card,
and a ball holed at the moment of a knock.

## After the stages: the shape of the ground

The Hills (the sloped course there was) could not be read: every slope a ball can roll on takes more of
the high sun than the top toon band's edge, so a hill was drawn exactly as
bright as the flat, and only the stripes bending hinted at its shape. The
renderer's form light, v0.21.0's `form`, keeps some of the sun's fall-off
in the top band, and the look asks for 2.5 of it: the Volcano's flank
facing the sun reads 1.46 times as bright as the one turned from it, where
it read 1.00, held by the look metrics' shape figure. It lights everything,
so every rounded thing reads rounder too. A putting grid and a flow of
dots downhill were tried beside it, and not taken.

## After the stages: the toy finish

The toon surfaces were flat paint, where the look wants moulded plastic.
artshape-render v0.22.2 finishes every toon look as a toy is, and the look
takes all of it as the renderer gives it: a clean highlight from the sun on
what is smooth (the ball, the rail, the bumpers), and none on the grass; the
sky in a clear coat where a surface turns from the eye; one smooth ramp of
light where the bands stepped, flat ground lit exactly as before and a
slope turned from the sun exactly as the form light lit it; and shade in a
crease toward the cool shade colour, not grey. The tone is the renderer's
soft one, a shoulder that keeps a bright colour's hue: the clamp held the
ball's red channel at one over most of its lit side, and a lit orange went
yellow. The look metrics read saturation 0.699, framing 2.42, contrast
3.14, cool shade 0.037 and shape 1.485, each over its floor; the shape read
1.350 under v0.22.0, whose ramp lit the Volcano's shaded flank too
brightly, and the renderer's fix is v0.22.1. The finish's code first cost
the rough 0.45 ms a frame, compiled into every blade with none of it seen;
from v0.22.2 the grass is built matte, and the frame is 0.2 ms over what
it was before the finish (+8%, five rounds alternated with it), inside
the perf gate's tolerance. The blades at a rail's foot lost the finish's tint
with it, and are a shade greyer in the knock's picture. Rounded rails are the
renderer's `roundedBox` and `roundCorners`, and remodelling the rail with
them is left for a feature of its own.

## After the stages: the course as a place

On 4 October 2026 the user asked what a realistic course would take. An
experiment answered the first half: the renderer's physically based shading
was switched on over the same scene and four views were sampled, and the
two shadings differed by a few percent, since the toon look already asks
for most of what physically based shading gives (form light, sky and ground
light, occlusion, a finish). The shading is not the thing. What the course
lacked was surface: every face a flat colour, the rough a long meadow the
course was set in, the water a still marbled sheet. The user chose to keep
the clean toy of the direction above and to make the course more of a place,
and raised the frame's budget to spend on it (decision 1). Four things were
done, each its own piece of work and commit.

**The budget, 970fb98.** From 5 ms at the standard view to 6, through
`/gate-moved`, said once in `smoke/budget.ts` for the perf gate and the
thirteen frame gates. Nothing drawn moved: the standard view cost about 2.6
ms, and the ladder's rungs, measured again, were 2.5, 1.3, 1.0 and 0.7 at
the home view and 2.6, 1.6, 1.3 and 0.9 at a driver's aim view.

**The grass as turf, 7827c89.** The rough was forty blades a square unit
(sixty on golf), 1.6 tall, and read as a hayfield. A sheet of four candidates
in two views was put to the user, who chose B: the rough at eighty a unit
everywhere, 1.2 tall with a spread of 0.5, more varied blade to blade
(`variation` 0.45, which also makes the renderer's three-unit patchiness
clump) and leaning (0.45); the fairway at a hundred a unit, 0.3 tall, where
it was seventy-two at 0.38. One figure is not the sheet's. At the near ring's
45 units the worst orbited view, behind and tilted lowest, drew all 262,144
blades there is room for, at 7.2 ms; the ring comes in to 36, where that
view draws 160,000 at 4.9 ms, and the standard view cost 3.0 ms where the
sheet had read 4.6. The perf baseline moved with it, 2.63 to 2.99 ms. The
densest views draw 139,000 blades on golf and 122,000 on minigolf, where
golf drew 162,000. A hundred and twenty-three pictures moved, each looked
at, and the look metrics' floors held (framing 2.39, from 2.42).

**The water moves, 1052936.** The pin first moved to v0.25.0 (24d6f2f), which
has the renderer's "surface that flows". A pond's surface carries its ripple
kind now: a height field travelling along the mesh's east at 1.5 units a
second, half a cell of pattern to the unit, turning the normal so the sun's
gloss and the sky's sheen move across it. It is driven by `renderer.time`,
which the game sets from its stepped time, so a paused game is still and a
picture is the same every run; a smoke test holds two frames at one time to
the same bytes over the water, and a second apart to differ there and
nowhere on the grass. Only ponds ripple. A stream keeps its marbling and
its streaks, since a bed's pattern runs east whichever way the belt runs. The rim,
foam and bands are geometry and are as they were. The look compiles the
flowing build at boot, so the first picture of a hole is the ripple and not
the still speckle drawn until it is built. It costs 0.4 to 0.6 ms a frame on
The Rapids and under 0.3 on The Meadow's Pond. Twenty-eight pictures moved.
A package release of the game's own for the same thing was built and
dropped for the upstream kind, which is the same thing already released.

**The turf texture, 451d660.** The pin moved to v0.26.0 (f5d4b35), which can
lay a texture under the ground: up to eight square images, sampled by world
position on the placements that opt in, its alpha a shade applied before
the toon ramp, compiled only when asked for. `src/turfTexture.ts` makes a 256
square tileable turf at boot from the game's seeded chance, a fine grain of
blade tips over soft clumps, so nothing is downloaded and every run draws the
same. The green, the fairway's stripes, the putting green, the first cut
and the tee wear it, at 1.4 units a tile; the rough painted under the blades
and out of bounds stay plain, and the old speckle is gone from the groups
that wear it. Its strength was chosen from a sheet of three. At 0.35 of its
colour and 0.3 of its height the shade's steps through the toon ramp came out
square-edged, the value noise's grid showing as pixel camouflage; the user
chose 0.2 and 0.15, which reads as soft turf. Seventy-two pictures moved,
each looked at, and the metrics held their floors (framing 2.32, from 2.39).

**Open water, golf only.** The pin moved to v0.27.0 (then v0.27.1, which bent the sheet by a slow warp and weakened the swell, since three fixed swell waves lined up into banded clouds in the mirror), which has the renderer's
open-water kind (`FLOW_WATER`, after three.js's water example): waves that
turn the surface's normal in the world and mirror the sky by a Fresnel term, so
the crests glint and the glitter moves with the camera. A golf hole's ponds
wear it, in `OCEAN` (cells of 0.3 a yard, a speed of 0.55, a tilt of 0.8), and
the user's tweaks after seeing it were three: brighter, with the glitter taken
from the camera, and no circles. The body is a bluer, brighter deep colour than
the example's green-black, so a pond reads as water from the tee, and the ring
mesh is gone from it: no idle rings, no ring where a ball went in and no
streaks on a stream, since the waves are the whole of the water. The sun's
sparkles are gone from it too, the waves' glints being twinkle enough. The foam, the shallows and the earth are as they were. Minigolf
keeps its rippling ponds, rings and streaks, held bit for bit, and the user chose
golf only for now; the one switch, `OCEAN_ON`, gives it to minigolf and its
streams when wanted, and nothing else needs to change. The golf pictures that
show water moved, each looked at. What the new water costs a frame on a golf hole
was not measured at the commit: the check at the end of the piece of work reads it.

**What it costs, and what was not measured.** The standard view cost 2.99 ms
at the grass's commit, inside the 6. The v0.26.0 move and the texture were
committed at the user's word without the full check, the fuzzer,
determinism, leaks, perf or bench, so their cost was not measured then; the check at the end of the plan measured it on 4 October 2026: the standard view costs 3.36 ms with all four parts in, against 2.99 at the grass's commit, the biggest hole 3.53 and The Links 4.06, each within the perf gate's tolerance of its baseline, read at a load average of about 4. The full check was green, and the fuzzer clean over 24 seeds.

**What is left open.** A stronger grain wants the noise reworked so that it
has no square grid, since the grid is what showed at the stronger
strengths. A stream's surface would need a pattern that follows its belt
before it can ripple. The turntable was dropped.

## After the stages: the title's look

On 8 October 2026 the user asked for the game to look more like its title picture (`src/title_sq.png`, which the lettering of the title is traced from, below): low-poly trees,
conifers, rocks and bushes, better light, stones along the water, hills, a lake and clouds seen from a low view, a texture
on the lawn, and shadows the same everywhere. A sheet of candidates was put to the user beside the picture (chunky or fine
facets, today's palette or the title's, today's light or a warmer one, stripes or a checker), and the picks were built:

- **The scenery is low-poly** (`models/lowpoly.ts`): broadleaves, conifers, boulders, bushes and ferns, chunky (a lump of
  three rings and six segments), on minigolf in place of the puffball trees, pines, hedges and pebbles, and round a golf
  hole on the empty ground past its out of bounds (`beyond` in `scenery.ts`), in clumps of wood and scrub. The golf tree
  is a faceted conifer inside the cone its physics has.
- **The palette is the title's**: the greens about twice as red and a third as blue, the rough less so, so it still frames
  the course; lime broadleaves, deep conifers, grey stone.
- **The light is warmer**: a stronger, warmer sun, a sea-green shade where it was blue-violet, a bluer sky light, a softer
  rim. The shadow's edge is softened over a texel and a half, open water takes the shadow too, and on golf the sun's map
  is fitted to the view (artshape-render v0.28.0), so the shadows of a long hole are as sharp at its far end as at the tee
  and fall on the woods past it.
- **The lawn is mown in a checker**, squares of four tiles on golf and two on minigolf, with the turf texture at 0.3 of
  its colour and 0.22 of its height.
- **Stones line the water**, as bodies the ball met (taken out again in the second pass, below).
- **The world past a hole** (`backdrop.ts`): faceted hills round it, blue mountains, a lake, a thousand far trees and
  drifting clouds, under a sky gradient. Only the fly-in sees it: each hole begins with the camera low behind the tee,
  where the horizon is a third of the way down the screen, and eases to the play view over two and a half seconds.

What it costs, timed in turn with its parent commit on a quiet machine: the play view 3.21 to 3.24 ms against 3.19 to
3.25, the biggest hole 3.50 against 3.46, The Isles' Home Waters 3.80 against 3.75, and 4 kB more to download; the fly-in
at its worst 5.17 ms (The Meadow, a desk, the top rung), inside the 6.

What is left open: the rough of minigolf reads a darker, bluer green than the title's, as the warm light's sky fills it; a
shadow darkens the ground by about a fifth, where the title's by two fifths; and the world past a hole is seen only in the
fly-in. Each is a matter of taste for the user to judge in play.

## After the stages: the title's look, the second pass

On 9 October 2026 the user said the lighting did not yet show the courses in the title's dramatic style: the trees should be much
darker on their shadow side, rocks the same with clearer facets, the water "plasticy", the stones by the water browner and more
of them, and (the part that most made the title nicer) its landscape is natural curves and round areas where the game is
clearly tiles. Five rounds of mocks were put to the user (pictures kept in `~/.claude/plans/ooergolf-title-look-two-evidence/`),
and the plan `~/.claude/plans/ooergolf-title-look-two.md` built what was chosen:

- **Golf ground is curves, not tiles.** The fairway, green, tee, sand and out of bounds are each their tile indicator blurred,
  and the 0.5 level set is the edge; the first cut and the fringe are bands of constant width outside it (round one's complaint was
  that the light green round the checkered fairway was not of one width). Bunkers are blobs with a soft lip, the tee a rounded
  rectangle. It is what is played as well as what is drawn (`CLAUDE.md`, the golf ground), the one thing that is not being the roll,
  which stays the tile's. Minigolf keeps its tiles and rails, as it is the toy.
- **Water is a smooth curve with a shelf** where a water tile lies outside it, a deeper, more saturated blue with small glints,
  never drawn over a tile that is not water, since play decides water by the tile.
- **A tight ring of small brown, tan and brown-grey stones along every water edge** ("too big, and not enough of them" was the
  first mock's word), scenery only: the user kept the ring and dropped the stones the ball bounced off, which went.
- **Trees, bushes and rocks are lit in two tones**, a baked light in three or four tiers, so the shade side is dark and cool
  and a rock has clear facets, and broadleaves vary in size with a few great ones by the fairway. The light is the mock's
  and not the renderer's sun, which was chosen with it and is lower.
- **A lower sun and stronger form** (about 46 degrees, `form` 5), a **shorter, lighter, calmer rough** that is the title's lawn,
  and the checker at three quarters of its contrast with a calmer turf texture.
- **The world past a golf hole**: dense woods past out of bounds, far woods to 440 yards, hills that grow from nothing at the
  map's edge, and the ground under all of it following them, so the woods and the posts stand on the hills and no cliff throws a
  stair of shadow.

What it costs: a golf hole begins in about 25 to 60 ms more than before (the mock's was eight times main's, which is why the
zones' distance is worked out in a band only), and a frame at the Water Carry tee is about as it was. What is left to the user: the
tones' light is the mock's, 62 degrees of azimuth off the sun, and a nearer or bigger lake past a hole is a call; the look metrics'
framing and cool shade floors fail with the lighter rough and the warmer shade, and are set again, with the user's yes, in the
plan's last part.

## After the stages: the title is drawn by the game

On 10 October 2026, with the game drawn to look like the title picture, the user asked for the picture to go and the engine
to draw the title instead: smaller, fitting any screen exactly, and "Of Course!" in 3D letters that animate in. The title is
no longer a file. The page opens on plain sky, the title's own blue, and fades to a hole of The Links (Water Carry, chosen
for its water with a ring of stones, its green and bunkers, and its woods and hills, which are the picture's own parts) seen
from a low camera behind the tee, with the letters dropping in over it one by one from the left, each landing with a squash
that springs back, all down by about 1.6 s; the course cards come up under them. What was tried and chosen, with the
pictures (kept in `~/.claude/plans/ooergolf-3d-title-evidence/`):

- **The letters are traced from the picture's own** (`scripts/trace-title.mjs` into `src/titletrace.json`, built by
  `models/lettering.ts`). Letters built from strokes were tried over sixteen rounds and judged not good enough ("the first
  thing the player will see, so it needs to be perfect"), a font's outlines were not tried, and the user chose "Trace it".
  The faces are cream in twelve smooth bands of the picture's colours, with a rounded bevel, over a warmer tan underside and
  a dark green outline whose edge is a little lighter; the ball in the O is dimpled with soft pits, shaded darker at its
  lower left; the flag is two reds either side of its fold. The scene's light would make the picture's cream dim and grey, so
  each material is the picture's colour through a gain found by eye against the scene (the renderer has no unlit material).
- **The drop**: one by one, 0.09 s apart, a fall of 0.3 s, a squash of 0.30 and a spring back; each letter drops with its own
  piece of the outline, which is rigid, so a face stays inside its outline mid-squash and no seam opens between pieces. Under
  reduced motion the letters are standing and nothing fades.
- **The frame**: the word is fitted to the screen's shape above the cards (one place: a desk, a phone, and the eight sizes
  `smoke/title.spec.ts` holds), shrunk on a desk and on a half-height panel on a phone; the course's glints are hidden under it.
- **What it costs**: 26,483 triangles drawn only on the title; a title frame 2.06 ms against 2.5 for the same hole's tee view
  on main; 17 kB of trace data gzipped with earcut and the lettering, 29 kB more to download and 116 kB less in pictures (the
  page now fetches none); the boot the player sees 448 ms against 285 (the hole is begun at boot), the gate's boot unchanged.

What is left open: the traced shapes are as good as the picture is, and the colours of the outline and the faces were set by eye
against the picture, a matter of taste for the user to judge in play.

## Across every stage

- **The frame:** measured before and after at the standard view and the
  play view, and on each hole a stage changes. A stage that cannot fit
  gives its cost to a rung, which the governor steps down to; antialiasing
  goes first down the ladder, before the grass is thinned.
- **The pictures:** every picture a stage moves is taken again, looked at
  beside the one before, and written only for that stage.
- **Determinism:** nothing seen moves by the wall clock; every motion is
  from game time, so the same seed draws the same picture.
- **The phone:** each stage looked at on a phone's width, and at the rung a
  slow phone steps down to.
- **Nothing is copied:** no shape, character, sound, texture or type of
  another game.

## Decisions

Made by the user on 28 September 2026.

1. **What the look may cost a frame:** the top rung at most 5 ms at the
   standard view on this machine, now 1.1; a phone steps down the ladder as
   it does now. The perf gate's frame budget is 5 ms, where it was 8.
   On 4 October 2026 the budget was raised to 6 ms for the course-as-a-place
   parts (denser grass, moving water, a ground texture), the standard view then
   costing about 2.6; the gates read it from `smoke/budget.ts`.
2. **The ball's track in the green:** dropped. It goes with the blades, and
   the track is retired from the game, its picture and its gates with it.
3. **Antialiasing:** needed. Four samples a pixel at the top rung, and a
   cheaper post pass one rung down.
4. **The font:** no web font. The system's rounded face is kept, and stage
   5 is the panels, buttons and motion only.
5. **The horizon:** the top-down views are kept as they are. The gradient
   sky, the hills beyond and the clouds are left out of stages 2 and 6
   until a view looks out at the horizon.

## Not in this

Sound, new holes, and anything that changes how the game plays. A stage
that finds it needs one of those stops and says so.
