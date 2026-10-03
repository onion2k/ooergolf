/**
 * The Waterworks: water on every hole, and the ball always one slip from it. A ball on water is lost, a stroke is
 * added and it is put back where it was struck from, so every hole here asks how hard and how straight of a player who
 * cannot afford to be wrong. Each hole has one idea and something on it to time, use or fear, as The Meadow's have.
 * Content, not code: see `course.ts` for how a map is drawn.
 *
 * What the autopilot will play decided the drawing, and the notes by each hole say where. It keeps a ball's width and
 * three tenths of a unit from the water either side of its line, so a strip a tile wide (three units) is one it will
 * cross only along its middle, and it will not stand a ball for a shot on a stone where less than a fifth of the shot
 * and two units of grass lie beyond. A ball struck at a middling speed also crosses a tile of water, which the physics
 * lets it (seen with a probe of one pond a tile wide, and not held by a test), so a gap is never the way a hole is held
 * shut. What moves stands on level ground, which the physics insists on, and a cup stands on level grass with a tile
 * of grass round it, so a ball can drop in from any side.
 */
import type { HoleDef } from './course';

export const WATERWORKS: readonly HoleDef[] = [
  {
    name: 'The Causeway',
    par: 2,
    // a strip over a pond, straight to the cup: nothing to decide but nerve. It is two tiles wide and not the sheet's three
    // (nine units, which a slip of ten degrees from the tee still crosses), with the tee a tile off its middle, so
    // the ball runs a tile and a half from the water on one side, and eight tiles long, so a slip of a few degrees
    // is a ball lost on that side
    map: [
      '##########',
      '#~~....~~#',
      '#~~..C.~~#',
      '#~~....~~#',
      '#~~~..~~~#',
      '#~~~..~~~#',
      '#~~~..~~~#',
      '#~~~..~~~#',
      '#~~~..~~~#',
      '#~~~..~~~#',
      '#~~~..~~~#',
      '#~~~..~~~#',
      '#........#',
      '#........#',
      '#....T...#',
      '#........#',
      '##########',
    ],
  },
  {
    name: 'The Stepping Stones',
    par: 3,
    // three stones, the two corners of a horseshoe of strips three tiles wide round a pond, and the cup's island: the way
    // from the tee to the cup is up, across and down, and a ball struck straight at the cup is lost. It must stop on
    // each stone, since past it is water, and be turned there. Not the sheet's stones of two tiles by two a tile of
    // water apart: a ball crosses a gap that narrow at speed, and the autopilot, which cannot, found no stone it could
    // stop on (one tile of strip between stones took it seven strokes, a step at a time). The stones are four tiles square
    map: [
      '##############',
      '#....~~~~....#',
      '#............#',
      '#............#',
      '#............#',
      '#~...~~~~~...#',
      '#~...~~~~~...#',
      '#.....~~~....#',
      '#..T..~~~..C.#',
      '#.....~~~....#',
      '##############',
    ],
  },
  {
    name: 'The Lock',
    par: 3,
    // a channel a tile wide between two ponds, and a gate across it that slides into the grass either side and is open
    // a little over half of every period: the cup is past it. The pockets either side of the gate are two tiles each,
    // which is what leaves a ball room to pass at either end of its travel, as the course's test asks
    map: [
      '#############',
      '#~~~~...~~~~#',
      '#~~~~.C.~~~~#',
      '#~~~~...~~~~#',
      '#~~~~~.~~~~~#',
      '#~~~~~.~~~~~#',
      '#~~~.....~~~#',
      '#~~~~~.~~~~~#',
      '#~~~~~.~~~~~#',
      '#~~~~~.~~~~~#',
      '#~~~.....~~~#',
      '#~~~..T..~~~#',
      '#############',
    ],
    obstacles: [{ kind: 'barrier', at: [6, 6], length: 1, travel: 3.7, period: 4 }],
  },
  {
    name: 'The Island Green',
    par: 3,
    // a green ringed with water, reached by a neck, in a bowl with the cup at the bottom of it: a ball that gets onto the
    // grass rolls to the middle, one struck a little off the cup and too hard goes up the near side of the far rim,
    // which is the island's edge, and out into the pond. The ground round the cup is one a ball rests on, and the bowl
    // steepens beyond it
    map: [
      '#############',
      '#~~~~~~~~~~~#',
      '#~~.......~~#',
      '#~~.......~~#',
      '#~~...C...~~#',
      '#~~.......~~#',
      '#~~.......~~#',
      '#~~.......~~#',
      '#~~.......~~#',
      '#~~~~~.~~~~~#',
      '#~~~~~.~~~~~#',
      '#...........#',
      '#.....T.....#',
      '#...........#',
      '#############',
    ],
    terrain: [
      '6666666666666',
      '6666666666666',
      '6666333336666',
      '6666322236666',
      '6666320236666',
      '6666322236666',
      '6666333336666',
      '6666666666666',
      '6666666666666',
      '6666666666666',
      '6666666666666',
      '6666666666666',
      '6666666666666',
      '6666666666666',
      '6666666666666',
    ],
  },
  {
    name: 'The Spillway',
    par: 3,
    // a lane six tiles wide along a pond's edge, the ground tilted toward the water a step to every two tiles, with the
    // tee at the water's edge and the cup across the lane: every putt breaks toward the pond, and is aimed up the slope
    // of it by the arrows. The autopilot, which aims straight, was lost in the pond on every seed on a lane four tiles
    // wide or a tilt of a step a tile; at this width and tilt it takes two strokes
    map: [
      '###########',
      '#......~~~#',
      '#.C....~~~#',
      '#......~~~#',
      '#......~~~#',
      '#......~~~#',
      '#......~~~#',
      '#......~~~#',
      '#......~~~#',
      '#......~~~#',
      '#......~~~#',
      '#......~~~#',
      '#.....T~~~#',
      '#......~~~#',
      '###########',
    ],
    terrain: [
      '88776655443',
      '88776655443',
      '88776655443',
      '88776655443',
      '88776655443',
      '88776655443',
      '88776655443',
      '88776655443',
      '88776655443',
      '88776655443',
      '88776655443',
      '88776655443',
      '88776655443',
      '88776655443',
      '88776655443',
    ],
  },
  {
    name: 'Mill Pond',
    par: 4,
    // a windmill on a causeway over a pond: the causeway is a tile wide in front of the door, so a ball knocked from
    // the blade, or the gap closing, is a ball off it
    map: [
      '#########',
      '#~~...~~#',
      '#~~.C.~~#',
      '#~~...~~#',
      '#~~...~~#',
      '####.####',
      '#~~~.~~~#',
      '#~~~.~~~#',
      '#~~~.~~~#',
      '#~~~.~~~#',
      '#.......#',
      '#.......#',
      '#...T...#',
      '#.......#',
      '#########',
    ],
    obstacles: [{ kind: 'windmill', at: [4, 5], period: 8 }],
  },
];
