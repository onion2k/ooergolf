/**
 * The Pinball Shed: banks and bounces, where the rail is a cushion, posts throw, and the player's own line is the game.
 * Every hole is drawn by hand as The Meadow's are (see `course.ts` for the letters), and has one idea and something the
 * player must use or fear. The holes that need nothing the engine lacks are here; the rest come as the kinds they use are built.
 *
 * Without this file the course would have nowhere to be drawn: it is content, and no logic lives in it.
 */

import type { HoleDef } from './course';

export const SHED: readonly HoleDef[] = [
  {
    name: 'Corner Pocket',
    par: 2,
    // a wall juts out from the left rail between the tee and the cup, so no straight shot reaches it; a bank off the right rail, and the line goes through the gap and back up past the wall's end
    map: [
      '###########',
      '#.........#',
      '#..C......#',
      '#.........#',
      '######....#',
      '######....#',
      '#.........#',
      '#.......T.#',
      '#.........#',
      '###########',
    ],
  },
  {
    name: 'The Funnel',
    par: 2,
    // two lines of posts closing on the cup: a ball into either is thrown inward, and one aimed down the middle threads them
    map: [
      '###########',
      '#.........#',
      '#....C....#',
      '#.........#',
      '#...o.o...#',
      '#...o.o...#',
      '#..o...o..#',
      '#..o...o..#',
      '#.o.....o.#',
      '#.o.....o.#',
      '#.........#',
      '#.........#',
      '#....T....#',
      '#.........#',
      '###########',
    ],
  },
  {
    name: 'Plinko',
    par: 3,
    // a field of posts in staggered rows: a ball rattles down it, and the power is the only choice, since the line is luck
    map: [
      '###########',
      '#.........#',
      '#....C....#',
      '#.........#',
      '#..o...o..#',
      '#.........#',
      '#.o..o..o.#',
      '#.........#',
      '#..o...o..#',
      '#.........#',
      '#....T....#',
      '#.........#',
      '###########',
    ],
  },
  {
    name: 'Half-pipe',
    par: 3,
    // both sides rise in steps to a trough, so a ball struck up the side comes down across it; only a bank, the ground a ball rests on
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
      '#.T.....#',
      '#.......#',
      '#########',
    ],
    terrain: [
      '332101233',
      '332101233',
      '332101233',
      '332101233',
      '332101233',
      '332101233',
      '332101233',
      '332101233',
      '332101233',
      '332101233',
      '332101233',
      '332101233',
      '332101233',
      '332101233',
      '332101233',
      '332101233',
    ],
  },
  {
    name: 'Three Cushion',
    par: 3,
    // the cup is walled in on three sides by raised grass and open only toward the far rail, so the way in is a bank off the rails
    map: [
      '###############',
      '#.............#',
      '#.............#',
      '#.............#',
      '#....3...3....#',
      '#....3.C.3....#',
      '#....33333....#',
      '#..T..........#',
      '#.............#',
      '#.............#',
      '###############',
    ],
  },
];
