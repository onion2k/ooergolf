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
 * belts. The Hills are four whose ground slopes, drawn in a second grid, the
 * hole's `terrain`, beside the map. The Downs are nine long holes whose ground
 * is noise, a smooth surface made from a seed and a feel, and nothing else on
 * them.
 *
 *   ~   water, which the ball rolls onto and is lost in
 *   s   sand, level, which slows the ball hard
 *   o   a post standing on grass, which throws the ball off it faster than it came
 *   1-9 grass raised that many steps: a step the ball rolls up, three a wall
 *
 * A golf hole is drawn in `f` fairway, `r` rough, `g` green and `t` the tee's box in place of `.` and the digits,
 * beside the same `T`, `C`, `s`, `~`, `o` and `#`: see `layoutOf`, and `range.ts` for the first of them.
 *
 * What moves on a hole is in its `obstacles`, by the tile of the map it is
 * at, counted as the map is drawn: its column, and its row from the top.
 */

import { layoutOf } from './arena';
import { noiseGround, type Feel } from './noise';
import type { ObstacleDef } from './obstacles';
import { fairway, openHole, type Feature, type OpenSpec } from './open';
import { RANGE } from './range';

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
    par: 3,
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
    map: [
      '#########',
      '#.......#',
      '#...C...#',
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
    obstacles: [{ kind: 'windmill', at: [4, 5], period: 8 }],
  },
  {
    name: 'The Mill Race',
    par: 4,
    map: [
      '#########',
      '#~~...~~#',
      '#~~.C.~~#',
      '#~~...~~#',
      '#~~...~~#',
      '####.####',
      '#.......#',
      '#.......#',
      '#.......#',
      '#.......#',
      '#...T...#',
      '#.......#',
      '#########',
    ],
    obstacles: [
      { kind: 'barrier', at: [4, 8], length: 1, travel: 5, period: 4 },
      { kind: 'windmill', at: [4, 5], period: 8, phase: 0.125 },
      { kind: 'conveyor', from: [4, 4], to: [4, 3], speed: 5 },
    ],
  },
];

/**
 * The Hills: holes whose ground slopes, a height a tile in each one's
 * `terrain`, beside its map, the far end at the top as the map is. Each
 * brings one thing a slope does: a hollow to be carried, a mound to be
 * climbed and stopped on, a bowl that brings everything to the cup, and a
 * green tilted so every putt breaks. Round each cup the ground is no
 * steeper than the green holds a ball, so one can come to rest beside it.
 */
export const HILLS: readonly HoleDef[] = [
  {
    name: 'The Hollow',
    par: 3,
    // from a raised tee down into a dip and up a steep bank to the cup's plateau: short, and it rolls back into the dip
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
      '#.......#',
      '#.......#',
      '#.......#',
      '#...T...#',
      '#########',
    ],
    terrain: [
      '444444444',
      '444444444',
      '444444444',
      '444444444',
      '444444444',
      '444444444',
      '222222222',
      '000000000',
      '000000000',
      '000000000',
      '111111111',
      '222222222',
      '222222222',
      '222222222',
      '222222222',
    ],
  },
  {
    name: 'The Volcano',
    par: 3,
    // the cup on the flat top of a mound, its sides steep all round: short rolls back down, long rolls off the far side
    map: [
      '#############',
      '#...........#',
      '#...........#',
      '#...........#',
      '#...........#',
      '#.....C.....#',
      '#...........#',
      '#...........#',
      '#...........#',
      '#...........#',
      '#...........#',
      '#...........#',
      '#...........#',
      '#...........#',
      '#.....T.....#',
      '#############',
    ],
    terrain: [
      '0222222222220',
      '0244444444420',
      '0246666666420',
      '0246666666420',
      '0246666666420',
      '0246666666420',
      '0246666666420',
      '0246666666420',
      '0246666666420',
      '0244444444420',
      '0222222222220',
      '0000000000000',
      '0000000000000',
      '0000000000000',
      '0000000000000',
      '0000000000000',
    ],
  },
  {
    name: 'The Bowl',
    par: 2,
    // the cup at the bottom of a bowl, gentle round it and steep further out, played from a shelf on its rim
    map: [
      '#############',
      '#...........#',
      '#...........#',
      '#...........#',
      '#...........#',
      '#.....C.....#',
      '#...........#',
      '#...........#',
      '#...........#',
      '#...........#',
      '#...........#',
      '#...........#',
      '#...........#',
      '#.....T.....#',
      '#...........#',
      '#############',
    ],
    terrain: [
      '7777777777777',
      '7766666666677',
      '7764444444677',
      '7764222224677',
      '7764211124677',
      '7764210124677',
      '7764211124677',
      '7764222224677',
      '7764444444677',
      '7766666666677',
      '7777777777777',
      '7777777777777',
      '7777777777777',
      '7777777777777',
      '7777777777777',
      '7777777777777',
    ],
  },
  {
    name: 'Side-hill',
    par: 3,
    // the whole green tilted across, a digit a column, so every putt breaks and is aimed above the cup
    map: [
      '###########',
      '#.........#',
      '#....C....#',
      '#.........#',
      '#.........#',
      '#.........#',
      '#.........#',
      '#.........#',
      '#.........#',
      '#.........#',
      '#.........#',
      '#.........#',
      '#.........#',
      '#....T....#',
      '#.........#',
      '###########',
    ],
    terrain: [
      '01234567899',
      '01234567899',
      '01234567899',
      '01234567899',
      '01234567899',
      '01234567899',
      '01234567899',
      '01234567899',
      '01234567899',
      '01234567899',
      '01234567899',
      '01234567899',
      '01234567899',
      '01234567899',
      '01234567899',
      '01234567899',
    ],
  },
];

/** How a hole of The Downs is made: its name and par, its shape, and its ground. */
interface DownsSpec {
  name: string;
  par: number;
  /** Tiles across and long, the map, and the tee's and the cup's column and row from the top. */
  shape: [cols: number, rows: number, tee: [number, number], cup: [number, number]];
  feel: Feel;
  steepness: number;
  seed: number;
}

/**
 * The Downs: nine holes half as long again as the others, tee to cup thirteen
 * tiles and a bit against eight and three quarters, whose ground is a smooth
 * curve of noise and whose only obstacle it is. Gentle ground first, that a ball
 * rests on wherever it lies; rolling ground, that carries a putt across it;
 * choppy ground, that turns one every few tiles; and, for the last three, a
 * rolling swell with choppy detail on it, each steeper than the one before. Par
 * is each hole's intent, as The Hills' is: the autopilot does not read a
 * break.
 */
const DOWNS_SPECS: readonly DownsSpec[] = [
  { name: 'Easy Does It', par: 3, shape: [11, 17, [5, 15], [5, 2]], feel: 'gentle', steepness: 0.3, seed: 9 },
  { name: 'The Roll', par: 3, shape: [13, 17, [3, 15], [9, 2]], feel: 'rolling', steepness: 0.55, seed: 24 },
  { name: 'Lazy Lawn', par: 3, shape: [9, 16, [6, 14], [3, 2]], feel: 'gentle', steepness: 0.3, seed: 5 },
  { name: 'Washboard', par: 3, shape: [13, 16, [10, 14], [3, 2]], feel: 'choppy', steepness: 0.6, seed: 23 },
  { name: 'Long Swell', par: 3, shape: [11, 16, [2, 14], [6, 2]], feel: 'rolling', steepness: 0.65, seed: 17 },
  { name: 'Cobbles', par: 3, shape: [15, 17, [6, 15], [9, 2]], feel: 'choppy', steepness: 0.65, seed: 26 },
  { name: 'Sea Legs', par: 3, shape: [13, 16, [4, 14], [9, 2]], feel: 'rolling and choppy', steepness: 0.6, seed: 26 },
  {
    name: 'Whitecaps',
    par: 3,
    shape: [11, 17, [6, 15], [4, 2]],
    feel: 'rolling and choppy',
    steepness: 0.66,
    seed: 23,
  },
  {
    name: 'The Big Dipper',
    par: 4,
    shape: [15, 17, [4, 15], [11, 2]],
    feel: 'rolling and choppy',
    steepness: 0.72,
    seed: 8,
  },
];

/** Each hole of The Downs' feel, in order: what it is made of, and what a test holds its ground to. */
export const DOWNS_FEELS: readonly Feel[] = DOWNS_SPECS.map((d) => d.feel);

export const DOWNS: readonly HoleDef[] = DOWNS_SPECS.map(
  ({ name, par, shape: [cols, rows, tee, cup], feel, steepness, seed }) => {
    const map = fairway(cols, rows, tee, cup);
    return { name, par, map, terrain: noiseGround(layoutOf(map), { seed, feel, steepness }) };
  },
);

/** What stands on the open holes: a pond, a bunker and a stand of posts, each as big as the tiles it is placed on allow. */
const POND: Feature = { kind: 'pond', count: 1, size: [2.5, 4] };
const BUNKERS = (count: number): Feature => ({ kind: 'sand', count, size: [1.8, 3] });
const STANDS = (count: number): Feature => ({ kind: 'stand', count, size: [3, 5] });

/** A hole of `cols` tiles by `rows`, the tee a quarter of the way across and the cup three quarters, and each two tiles in from the rail. */
const across = (cols: number, rows: number): OpenSpec['shape'] => [
  cols,
  rows,
  [Math.floor(cols / 4), rows - 3],
  [Math.floor((cols * 3) / 4), 2],
];

/**
 * The Moors: nine open holes, each six to fourteen times the size of The Downs' mean, a hundred to a hundred and
 * fifty units from the tee to the cup, so a hole is three to five shots of the putter and a round is a long walk. Made
 * by `openHole` from a spec and a seed: ground, and ponds, bunkers and stands of posts on it, placed so a route wide
 * enough to putt along is always left. The ground is hills, swells ninety and a hundred and thirty-five units across
 * (`hills` and `long hills`) at a steepness from 0.55 to 0.7, so a hole stands seven to eighteen units from its lowest
 * ground to its highest and its steepest slope is about nineteen degrees, and a ball rests on nearly all of it; a pond
 * lies in a valley and a bunker on a bed cut into a slope. Each seed was chosen by playing forty of them, eight rounds
 * each, with the pace gate's player: none of the chosen took the limit or went into the water, a hazard of each was
 * near the line from the tee to the cup, there were at least seven units of relief and the ball rested on nine tenths of
 * the ground, and the mean was about a stroke under par, as The Downs' is; then by looking at the pictures. Par is each
 * hole's intent.
 */
const MOORS_SPECS: readonly OpenSpec[] = [
  { name: 'Wide Open', par: 4, shape: across(30, 34), feel: 'hills', steepness: 0.55, seed: 8, features: [] },
  {
    name: 'Lily Ponds',
    par: 5,
    shape: across(33, 39),
    feel: 'hills',
    steepness: 0.6,
    seed: 6,
    features: [{ ...POND, count: 2 }],
  },
  {
    name: 'Sandy Reach',
    par: 5,
    shape: across(36, 39),
    feel: 'hills',
    steepness: 0.6,
    seed: 13,
    features: [BUNKERS(3)],
  },
  { name: 'The Grove', par: 5, shape: across(36, 42), feel: 'hills', steepness: 0.65, seed: 6, features: [STANDS(2)] },
  { name: 'Long Roll', par: 5, shape: across(39, 45), feel: 'long hills', steepness: 0.65, seed: 29, features: [POND] },
  {
    name: 'Broken Ground',
    par: 5,
    shape: across(39, 45),
    feel: 'long hills',
    steepness: 0.7,
    seed: 21,
    features: [BUNKERS(2)],
  },
  {
    name: 'Water Meadow',
    par: 6,
    shape: across(42, 48),
    feel: 'hills',
    steepness: 0.7,
    seed: 28,
    features: [{ ...POND, count: 2 }, BUNKERS(2)],
  },
  {
    name: 'The Ridge',
    par: 6,
    shape: across(45, 48),
    feel: 'long hills',
    steepness: 0.7,
    seed: 21,
    features: [STANDS(2), BUNKERS(1)],
  },
  {
    name: 'The Far Pin',
    par: 6,
    shape: across(45, 51),
    feel: 'long hills',
    steepness: 0.7,
    seed: 27,
    features: [POND, BUNKERS(2), STANDS(1)],
  },
];

let moorsMade: readonly HoleDef[] | undefined;

/**
 * The holes of The Moors, made the first time they are asked for and no oftener: nine holes of open country are some
 * thirty milliseconds of the page's boot, for a course a player may never choose, so they wait until one does.
 */
export function moors(): readonly HoleDef[] {
  return (moorsMade ??= MOORS_SPECS.map((spec) => openHole(spec)));
}

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
  { name: 'The Hills', holes: HILLS, summary: summaryOf(HILLS) },
  { name: 'The Downs', holes: DOWNS, summary: summaryOf(DOWNS) },
  {
    name: 'The Moors',
    get holes() {
      return moors();
    },
    summary: { holes: MOORS_SPECS.length, par: MOORS_SPECS.reduce((a, s) => a + s.par, 0) },
  },
  { name: 'The Range', holes: RANGE, summary: summaryOf(RANGE), golf: true },
];
