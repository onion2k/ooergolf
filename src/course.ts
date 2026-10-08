/**
 * The courses: each a round of holes, and each hole a map and a par.
 * Content, not code, so a hole is added by drawing it, and the game, the
 * autopilot and the page all read it the same way. The player chooses a
 * course on the start screen, and plays its holes in order.
 *
 * A map is drawn as it is seen from the tee, the far end at the top, one
 * character a tile three units across:
 *
 *   #   the rail, which the ball banks off
 *   .   grass
 *   T   the tee, on grass
 *   C   the cup, on grass
 *       (a space) nothing: off the course, solid to the ball, drawn as rough
 *
 * The Meadow is the nine holes in DESIGN.md, level but for its steps:
 * grass, rail, sand, water, raised grass, posts, barriers, windmills and
 * belts. A hole whose ground slopes draws its heights in a second grid, the
 * hole's `terrain`, beside the map (the tests' `hills.ts` has four such).
 *
 *   ~   water, which the ball rolls onto and is lost in
 *   s   sand, level, which slows the ball hard
 *   o   a post standing on grass, which throws the ball off it faster than it came
 *   1-9 grass raised that many steps: a step the ball rolls up, three a wall
 *
 * A golf hole is drawn in `f` fairway, `r` rough, `g` green and `t` the tee's box in place of `.` and the digits,
 * beside the same `T`, `C`, `s`, `~`, `o` and `#`: see `layoutOf`, and `golf.ts` for how The Links' are made.
 *
 * What moves on a hole is in its `obstacles`, by the tile of the map it is
 * at, counted as the map is drawn: its column, and its row from the top.
 */

import type { ObstacleDef } from './obstacles';
import { FELLS_SUMMARY, fells } from './fells';
import { ISLES_SUMMARY, isles } from './isles';
import { LINKS_SUMMARY, links } from './links';
import { SHED } from './shed';
import { WATERWORKS } from './waterworks';

/** A hole: what it is called, its par, its map, and what moves on it. */
export interface HoleDef {
  name: string;
  par: number;
  map: readonly string[];
  obstacles?: readonly ObstacleDef[];
  /**
   * How high the ground slopes: a digit a tile in a grid the shape of the map, or real heights, one a tile, from
   * noise: flat without it. See `layoutOf`.
   */
  terrain?: readonly string[] | Float32Array;
  /**
   * How hard the wind blows on a golf hole, in miles an hour (`WIND.most` at the most): it pushes a ball in the air, from
   * the direction the hole's grass and flag already show (`windDirection`). Calm without it, which is every hole of
   * minigolf, so a hole that has none plays as it always did.
   */
  wind?: number;
  /**
   * How fast the greens of a golf hole are: the steady slowing of a ball rolling on them, in yards a second a second
   * (`GREENS.normal`, 14, which a hole without it has). Less is faster, from `GREENS.fast` to
   * `GREENS.slow`, and the first cut round a green is slowed in the same ratio. Handed to the physics when the hole
   * begins (`makeWorld`), and read by `Game.rollAt` and `breakOf`.
   */
  greens?: number;
}

/**
 * The cup: how wide, and how deep a ball goes before it is holed; the
 * restitution of its rim, which makes it a cup a ball can lip out of; and no
 * pull toward it, so it is the rim that decides. At this width, which fits
 * inside a tile as it is drawn, a putt through the middle drops up to 18 a
 * second, and one off it lips out from 8: see `test/cup.test.ts`. The rim's
 * figure matters little: 0.1 to 0.5 moved those by a unit a second.
 */
export const CUP = { radius: 1.45, depth: 6, rim: 0.3, pull: 0 };

export const COURSE: readonly HoleDef[] = [
  {
    name: 'Straight',
    par: 2,
    map: [
      '#######',
      '#.....#',
      '#..C..#',
      '#.....#',
      '#.....#',
      '#.....#',
      '#.....#',
      '#.....#',
      '#.....#',
      '#.....#',
      '#.....#',
      '#.....#',
      '#.....#',
      '#..T..#',
      '#.....#',
      '#######',
    ],
  },
  {
    name: 'Dog-leg',
    par: 3,
    map: [
      '###############',
      '#.............#',
      '#..........C..#',
      '#.............#',
      '#.....#########',
      '#.....#        ',
      '#.....#        ',
      '#.....#        ',
      '#.....#        ',
      '#.....#        ',
      '#.....#        ',
      '#..T..#        ',
      '#.....#        ',
      '#######        ',
    ],
  },
  {
    name: 'The Bunker',
    par: 2,
    // sand across the front of the cup: round it by the sides, or straight through it at three quarters of the hardest
    map: [
      '#########',
      '#.......#',
      '#...C...#',
      '#.......#',
      '#.sssss.#',
      '#..sss..#',
      '#.......#',
      '#.......#',
      '#.......#',
      '#...T...#',
      '#########',
    ],
  },
  {
    name: 'Pond',
    par: 3,
    map: [
      '#########',
      '#.......#',
      '#...C...#',
      '#.......#',
      '#~~~~~..#',
      '#~~~~~..#',
      '#.......#',
      '#.......#',
      '#...T...#',
      '#.......#',
      '#########',
    ],
  },
  {
    name: 'Barriers',
    par: 3,
    map: [
      '#########',
      '#.......#',
      '#...C...#',
      '#.......#',
      '#.......#',
      '#.......#',
      '#.......#',
      '#.......#',
      '#.......#',
      '#.......#',
      '#...T...#',
      '#.......#',
      '#########',
    ],
    // on periods that are not in step, so the moments both are clear of the middle come and go
    obstacles: [
      { kind: 'barrier', at: [4, 4], length: 1, travel: 5, period: 3 },
      { kind: 'barrier', at: [4, 7], length: 1, travel: 5, period: 4.2, phase: 0.3 },
    ],
  },
  {
    name: 'Bumpers',
    par: 3,
    // a post on the straight line to the cup, and four round it: banked off them, or threaded between
    map: [
      '###########',
      '#.........#',
      '#....C....#',
      '#.........#',
      '#..o...o..#',
      '#.........#',
      '#....o....#',
      '#.........#',
      '#..o...o..#',
      '#.........#',
      '#....T....#',
      '###########',
    ],
  },
  {
    name: 'Up and Over',
    par: 3,
    map: [
      '#########',
      '#.......#',
      '#...C...#',
      '#.......#',
      '#~~444~~#',
      '#~~444~~#',
      '#~~333~~#',
      '#~~222~~#',
      '#~~111~~#',
      '#.......#',
      '#...T...#',
      '#.......#',
      '#########',
    ],
  },
  {
    name: 'Windmill',
    par: 3,
    // the cup stands six tiles, eighteen units, past the door, which is far enough for the tower not to hide it from the tee, and four tiles of green between the tee and the door leave room to lay up
    map: [
      '#########',
      '#.......#',
      '#...C...#',
      '#.......#',
      '#.......#',
      '#.......#',
      '#.......#',
      '#.......#',
      '####.####',
      '#.......#',
      '#.......#',
      '#.......#',
      '#...T...#',
      '#.......#',
      '#########',
    ],
    obstacles: [{ kind: 'windmill', at: [4, 8], period: 8 }],
  },
  {
    name: 'The Mill Race',
    par: 4,
    // the barrier's phase is a quarter, so its open window is 0.84 s of every 2 and not 0.4, and the cup shows over the tower
    map: [
      '#########',
      '#~~...~~#',
      '#~~.C.~~#',
      '#~~...~~#',
      '#~~...~~#',
      '#~~...~~#',
      '#~~...~~#',
      '#~~...~~#',
      '####.####',
      '#.......#',
      '#.......#',
      '#.......#',
      '#.......#',
      '#.......#',
      '#...T...#',
      '#.......#',
      '#########',
    ],
    obstacles: [
      { kind: 'barrier', at: [4, 12], length: 1, travel: 5, period: 4, phase: 0.25 },
      { kind: 'windmill', at: [4, 8], period: 8, phase: 0.125 },
      { kind: 'conveyor', from: [4, 4], to: [4, 3], speed: 5 },
    ],
  },
];

/** A course: what it is called, and its holes, played from the first to the last as a round. */
export interface Course {
  name: string;
  /** Its holes: for a course that is made when it is asked for, made then. */
  readonly holes: readonly HoleDef[];
  /** How many holes and what par they add to, known without making them: what the start screen says of it. */
  readonly summary: { holes: number; par: number };
  /** Whether its holes are golf, played with a bag of clubs and not the putter alone: see `layoutOf`. */
  readonly golf?: boolean;
}

const summaryOf = (holes: readonly HoleDef[]) => ({ holes: holes.length, par: holes.reduce((a, h) => a + h.par, 0) });

/** Every course, the first the one a new player meets first. */
export const COURSES: readonly Course[] = [
  { name: 'The Meadow', holes: COURSE, summary: summaryOf(COURSE) },
  { name: 'The Pinball Shed', holes: SHED, summary: summaryOf(SHED) },
  { name: 'The Waterworks', holes: WATERWORKS, summary: summaryOf(WATERWORKS) },
  {
    name: 'The Links',
    get holes() {
      return links();
    },
    summary: LINKS_SUMMARY,
    golf: true,
  },
  {
    name: 'The Fells',
    get holes() {
      return fells();
    },
    summary: FELLS_SUMMARY,
    golf: true,
  },
  {
    name: 'The Isles',
    get holes() {
      return isles();
    },
    summary: ISLES_SUMMARY,
    golf: true,
  },
];
