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

- **Shapes are chunky and rounded.** Every edge a player sees is bevelled
  and catches the light; nothing is a bare box or a faceted lump. Shapes
  are few and bold, and detail goes where the eye goes, on the cup, the
  flag and the ball, and not everywhere.
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
it is tuned against it.

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

**What:** the game takes stage 2's settings and sets the palette. One
named palette in `look.ts`, the only place a colour of the course is
chosen: the green's two stripes, the rough, the rail's paint and its cap,
sand, water, the cup's gold, the flag, the ball and its band, the sun, the
shade, the rim, the sky and the bounce. The sun warm and strong, the
ambient lower, so the lit face and the shaded one differ clearly; the haze
thinned or gone; a little bloom on what is brightest.

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

- **Slopes:** the rail on the Hills, and the cup on Side-hill.
- **Rock:** the rail at every corner and T the maps make.
- **The camera:** the rail's cap seen from above and from the tee.

### 5. The words: HUD, screens and buttons

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

Each is the user's, with a recommendation.

1. **What the look may cost a frame.** Recommended: the top rung at most
   3 ms at the standard view on this machine, now 1.1, leaving the rest of
   the 8 for slower machines. A phone steps down the ladder as it does now.
2. **The ball's track in the green.** It goes with the blades. Recommended:
   let it go, since a clean green is the look, and the track is then
   retired from the game, its picture and its gates with it. The other way
   is a faint painted track on the green, which is new work for stage 1.
3. **Antialiasing.** Recommended: four samples a pixel at the top rung, and
   the post pass one rung down, since the rail and the bunting are thin
   lines seen all the time.
4. **The font.** Recommended: an open-licensed rounded face, subset, about
   20 to 30 kB; the other way is the system's rounded face, which is free
   and differs from one device to the next.
5. **The horizon.** Recommended: keep the top-down views as they are, the
   sky seen only past the course's edge where a view reaches it, and on
   the start screen, which could look out over a hole.

## Not in this

Sound, new holes, and anything that changes how the game plays. A stage
that finds it needs one of those stops and says so.
