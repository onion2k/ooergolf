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
 * belts. The Hills are nine whose ground slopes, drawn in a second grid, the
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
import { LINKS_SUMMARY, links } from './links';
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

/**
 * The Hills: nine holes whose ground slopes, a height a tile in each one's
 * `terrain`, beside its map, the far end at the top as the map is. Each
 * brings one thing a slope does: a bowl that brings everything to the cup, a
 * hollow to be carried, a dish that pulls a putt toward it, a mound to be
 * climbed and stopped on, a lane worn into a plateau, a hill that pushes a
 * putt away, a green tilted so every putt breaks, a table that leans and a
 * long climb that takes two putts. They run easy to hard (the names are the
 * save's keys, so the order is free to change). Round each cup the ground is
 * no steeper than the green holds a ball, so one can come to rest beside it.
 */
export const HILLS: readonly HoleDef[] = [
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
    name: 'The Hollow',
    par: 2,
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
    name: 'The Sink',
    par: 3,
    // a dish to the left of the line pulls every putt toward it: aim to the right of the cup and let the dish bring the ball back
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
      '#.........#',
      '#....T....#',
      '#.........#',
      '###########',
    ],
    terrain: [
      '66666666666',
      '66666666666',
      '66666666666',
      '66666666666',
      '66666666666',
      '66555556666',
      '65443445666',
      '65432345666',
      '65322235666',
      '65432345666',
      '65443445666',
      '66555556666',
      '66666666666',
      '66666666666',
      '66666666666',
      '66666666666',
      '66666666666',
    ],
  },
  {
    name: 'The Volcano',
    par: 2,
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
    name: 'The Sunken Lane',
    par: 3,
    // a lane worn 1.5 units into a plateau runs north from the tee, bends east and ends at the cup: the direct line cuts across the plateau at the bend and is brought back to the cup by the lane's far wall; a putt along the lane runs out of speed at the bend
    map: [
      '###########',
      '#.........#',
      '#.........#',
      '#.........#',
      '#.........#',
      '#.........#',
      '#.........#',
      '#.........#',
      '#.......C.#',
      '#.........#',
      '#.........#',
      '#.........#',
      '#.........#',
      '#.........#',
      '#.........#',
      '#.........#',
      '#..T......#',
      '###########',
    ],
    terrain: [
      '66666666666',
      '66666666666',
      '66666666666',
      '66666666666',
      '66666666666',
      '66666666666',
      '66666555566',
      '66654444446',
      '66543333345',
      '66433344446',
      '65433555566',
      '65434566666',
      '65434566666',
      '65434566666',
      '65434566666',
      '65434566666',
      '65434566666',
      '66444666666',
    ],
  },
  {
    name: 'The Hump',
    par: 3,
    // a low hill to the right of the line pushes every putt away from it: aim over its shoulder, to the right of the cup
    map: [
      '###########',
      '#.........#',
      '#.........#',
      '#......C..#',
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
      '#..T......#',
      '#.........#',
      '###########',
    ],
    terrain: [
      '00000000000',
      '00000000000',
      '00000000000',
      '00000000000',
      '00000000000',
      '00000000000',
      '00001111100',
      '00011222110',
      '00012232210',
      '00012333210',
      '00012232210',
      '00011222110',
      '00001111100',
      '00000000000',
      '00000000000',
      '00000000000',
      '00000000000',
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
  {
    name: 'The Shelf',
    par: 3,
    // a ramp up to a table that leans to the right, and a steep drop to the cup: struck hard enough to crest the ramp, the ball runs off the far edge to the cup, and the lean turns it
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
      '#.......#',
      '#.......#',
      '#..T....#',
      '#.......#',
      '#########',
    ],
    terrain: [
      '111111111',
      '111111111',
      '111111111',
      '222222222',
      '122222233',
      '333444555',
      '455667788',
      '455667788',
      '455667788',
      '455667788',
      '344556677',
      '333444555',
      '233333344',
      '222222222',
      '111111111',
      '111111111',
      '111111111',
      '111111111',
    ],
  },
  {
    name: 'Hill and Dale',
    par: 3,
    // a long climb of two units past a dish on the left and a hill on the right: two putts, the first to lay up, the second read across the same ground
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
      '#.........#',
      '#.........#',
      '#.........#',
      '#.........#',
      '#....T....#',
      '###########',
    ],
    terrain: [
      '77777777777',
      '66666666666',
      '66666666666',
      '66666666666',
      '55555556655',
      '55555566665',
      '55555667766',
      '55445677776',
      '44434567776',
      '43223467765',
      '32112345654',
      '32111234444',
      '22111223333',
      '32111233333',
      '32222233333',
      '32222233333',
      '22222222222',
      '22222222222',
      '22222222222',
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
  /** What stands on it, if anything, placed by `openHole` (so the tee and the cup are two tiles in from the rail). */
  features?: Feature[];
}

/**
 * The Downs: nine holes whose ground is a smooth curve of noise and whose only obstacle it is, but for one stand of
 * posts, and that climb in length and in strokes, from thirty-nine units tee to cup to eighty-nine, so the course
 * comes between The Hills and The Moors in size. Gentle ground first, that a ball rests on wherever it lies; rolling
 * ground, that carries a putt across it; choppy ground, that turns one every few tiles; long hills, that lean a putt
 * a long way; the post office, a stand of posts across the line; and, for the last two, rolling swell with choppy
 * detail on it, each steeper than the one before and long enough to want two putts. A hole is longer than the putter's
 * fifty units from the sixth of the nine, so no putt from the tee can reach the cup on the last three. Par is each
 * hole's intent, as The Hills' is: the autopilot does not read a break.
 *
 * The first five are the five of the first nine that were not twins of another, in the order they play from easiest
 * to hardest; the rest were chosen by playing forty-eight seeds of each with the pace gate's player, and the seeds
 * checked again on sixteen others (see the figures in the commit).
 */
const DOWNS_SPECS: readonly DownsSpec[] = [
  { name: 'Easy Does It', par: 3, shape: [11, 17, [5, 15], [5, 2]], feel: 'gentle', steepness: 0.3, seed: 9 },
  { name: 'Cobbles', par: 3, shape: [15, 17, [6, 15], [9, 2]], feel: 'choppy', steepness: 0.65, seed: 26 },
  { name: 'Long Swell', par: 3, shape: [11, 16, [2, 14], [6, 2]], feel: 'rolling', steepness: 0.65, seed: 17 },
  { name: 'Sea Legs', par: 3, shape: [13, 16, [4, 14], [9, 2]], feel: 'rolling and choppy', steepness: 0.6, seed: 26 },
  { name: 'The Roll', par: 3, shape: [13, 17, [3, 15], [9, 2]], feel: 'rolling', steepness: 0.55, seed: 24 },
  { name: 'Long Hill', par: 3, shape: [13, 19, [4, 17], [9, 2]], feel: 'long hills', steepness: 0.6, seed: 2 },
  {
    name: 'Post Office',
    par: 4,
    shape: [15, 17, [3, 14], [11, 2]],
    feel: 'rolling',
    steepness: 0.55,
    seed: 11,
    features: [{ kind: 'stand', count: 1, size: [3, 5] }],
  },
  {
    name: 'Two Shots',
    par: 4,
    shape: [13, 27, [4, 25], [9, 2]],
    feel: 'rolling and choppy',
    steepness: 0.66,
    seed: 13,
  },
  {
    name: 'The Big Dipper',
    par: 4,
    shape: [15, 33, [4, 31], [11, 2]],
    feel: 'rolling and choppy',
    steepness: 0.72,
    seed: 6,
  },
];

/** Each hole of The Downs' feel, in order: what it is made of, and what a test holds its ground to. */
export const DOWNS_FEELS: readonly Feel[] = DOWNS_SPECS.map((d) => d.feel);

export const DOWNS: readonly HoleDef[] = DOWNS_SPECS.map(
  ({ name, par, shape: [cols, rows, tee, cup], feel, steepness, seed, features }) => {
    // the same ground either way (`openHole` with nothing on it is the noise as it is), but a hole that is drawn by
    // hand keeps its tee and cup where it was, a tile from the rail on the first
    if (features) return openHole({ name, par, shape: [cols, rows, tee, cup], feel, steepness, seed, features });
    const map = fairway(cols, rows, tee, cup);
    return { name, par, map, terrain: noiseGround(layoutOf(map), { seed, feel, steepness }) };
  },
);

/** What stands on the open holes: a pond, a bunker and a stand of posts, each as big as the tiles it is placed on allow. */
const pond = (count: number, least = 2.5, most = 3.5): Feature => ({ kind: 'pond', count, size: [least, most] });
const sand = (count: number, least = 1.8, most = 2.6): Feature => ({ kind: 'sand', count, size: [least, most] });
const stand = (count: number, least = 3, most = 5): Feature => ({ kind: 'stand', count, size: [least, most] });

/**
 * The Moors: nine open holes of tight minigolf, from fifty-one to eighty-two units tee to cup, so the cup is on the
 * screen from the tee at the widest zoom, and a hole is two or three strokes of the putter. They were nine holes of
 * a hundred to a hundred and fifty units, three to five strokes a hole and more than half of them full-power rolls with
 * nothing to decide, with a hazard nowhere near the line; now each hazard stands on the line, in the landing zone or at
 * the cup, so it is in play. Made by `openHole` from a spec and a seed: ground, and ponds, bunkers and stands of
 * posts on it, placed so a route wide enough to putt along is always left. The ground is hills, swells ninety and a
 * hundred and thirty-five units across (`hills` and `long hills`) at a steepness from 0.5 to 0.7, and a pond lies in a
 * valley and a bunker on a bed cut into a slope. Each seed was chosen by playing forty with the pace gate's player,
 * and those of Long Roll and The Far Pin again, since the first picks lost one first shot in eleven and one in fifty to
 * the water. Par is each hole's intent, as The Downs' is: the pace player takes about a stroke under it.
 */
const MOORS_SPECS: readonly OpenSpec[] = [
  {
    name: 'Wide Open',
    par: 3,
    shape: [16, 20, [4, 17], [12, 2]],
    feel: 'hills',
    steepness: 0.5,
    seed: 3,
    features: [],
  },
  {
    name: 'Lily Ponds',
    par: 3,
    shape: [18, 24, [4, 21], [13, 2]],
    feel: 'hills',
    steepness: 0.6,
    seed: 5,
    features: [pond(1)],
  },
  {
    name: 'Sandy Reach',
    par: 3,
    shape: [20, 26, [5, 23], [14, 2]],
    feel: 'hills',
    steepness: 0.6,
    seed: 21,
    features: [sand(2)],
  },
  {
    name: 'The Grove',
    par: 4,
    shape: [20, 26, [14, 23], [5, 2]],
    feel: 'hills',
    steepness: 0.65,
    seed: 11,
    features: [stand(2)],
  },
  {
    name: 'Long Roll',
    par: 4,
    shape: [18, 30, [9, 27], [9, 2]],
    feel: 'long hills',
    steepness: 0.65,
    seed: 34,
    features: [pond(1, 3, 4)],
  },
  {
    name: 'Broken Ground',
    par: 4,
    shape: [22, 26, [5, 23], [16, 2]],
    feel: 'long hills',
    steepness: 0.7,
    seed: 21,
    features: [sand(2, 2, 3)],
  },
  {
    name: 'Water Meadow',
    par: 4,
    shape: [24, 28, [6, 25], [18, 2]],
    feel: 'hills',
    steepness: 0.65,
    seed: 9,
    features: [pond(2), sand(1)],
  },
  {
    name: 'The Ridge',
    par: 4,
    shape: [22, 30, [16, 27], [5, 2]],
    feel: 'long hills',
    steepness: 0.7,
    seed: 12,
    features: [stand(2), sand(1)],
  },
  {
    name: 'The Far Pin',
    par: 5,
    shape: [26, 28, [6, 25], [20, 2]],
    feel: 'long hills',
    steepness: 0.7,
    seed: 16,
    features: [pond(1, 3, 4), sand(2), stand(1)],
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
  {
    name: 'The Links',
    get holes() {
      return links();
    },
    summary: LINKS_SUMMARY,
    golf: true,
  },
];
