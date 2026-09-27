/**
 * The course: its holes, each a map and a par. Content, not code, so a hole
 * is added by drawing it, and the game, the autopilot and the page all read
 * it the same way.
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
 * The first nine holes are in DESIGN.md. Those made of grass, rail, water,
 * raised grass, barriers, windmills and belts are here; the bunker and the
 * bumpers wait for the physics they need, 0.4.0's sand and bounce.
 *
 *   ~   water, which the ball rolls onto and is lost in
 *   1-9 grass raised that many steps: a step the ball rolls up, three a wall
 *
 * What moves on a hole is in its `obstacles`, by the tile of the map it is
 * at, counted as the map is drawn: its column, and its row from the top.
 */

import type { ObstacleDef } from './obstacles';

/** A hole: what it is called, its par, its map, and what moves on it. */
export interface HoleDef {
  name: string;
  par: number;
  map: readonly string[];
  obstacles?: readonly ObstacleDef[];
}

/**
 * The cup: how wide, and how deep a ball goes before it is holed. The width
 * decides how fast a ball can be going and still drop, and was chosen by
 * measuring that: see `test/cup.test.ts`.
 */
export const CUP = { radius: 1.45, depth: 6 };

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
