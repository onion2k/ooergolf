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
 * The first nine holes are in DESIGN.md. Only those made of grass and rail
 * are here: the rest wait for the physics their obstacles need.
 */

/** A hole: what it is called, its par, and its map. */
export interface HoleDef {
  name: string;
  par: number;
  map: readonly string[];
}

/**
 * The cup: how wide, and how deep a ball goes before it is holed. The width
 * decides how fast a ball can be going and still drop, and was chosen by
 * measuring that: see `test/cup.test.ts`.
 */
export const CUP = { radius: 1.6, depth: 6 };

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
];
