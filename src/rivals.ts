/**
 * The computer rivals of the season: eleven for each grade, each a name and a skill. The skill is an index into
 * `RIVAL_SKILLS` in `field.ts`, 0 the best, and a grade's skills are the window Part 0 of the season's plan measured: Club
 * plays at skills 2 to 4, County at 1 to 3 and the Championship at 0 to 2, so the better the grade the better the field.
 *
 * Content, and fixed. A rival's name is a key once the game has given it out: the order of merit, a saved season and a
 * result on the card all know a rival by it, and the cards a rival plays are drawn by its place in this list, so a name is
 * never changed, reordered or reused and a new rival is added at the end of a grade only by making a new grade. The names
 * are invented and golfing; none is, or is meant to sound like, a real player or any real person.
 */
import type { Grade } from './season';

/** A computer rival: its name, and its skill as an index into `RIVAL_SKILLS` (0 the best). */
export interface Rival {
  name: string;
  skill: number;
}

/** Each grade's field of rivals, in a fixed order. */
export const ROSTERS: Readonly<Record<Grade, readonly Rival[]>> = {
  club: [
    { name: 'Mo Mulligan', skill: 2 },
    { name: 'Fern Gully', skill: 2 },
    { name: 'Bunker Hill', skill: 2 },
    { name: 'Dot Divot', skill: 2 },
    { name: 'Pip Putter', skill: 3 },
    { name: 'Skip Fairway', skill: 3 },
    { name: 'Gus Gimme', skill: 3 },
    { name: 'Penny Par', skill: 3 },
    { name: 'Chip Shanks', skill: 4 },
    { name: 'Lou Lipout', skill: 4 },
    { name: 'Tee Bird', skill: 4 },
  ],
  county: [
    { name: 'Hazel Rough', skill: 1 },
    { name: 'Birdie Byrd', skill: 1 },
    { name: 'Sandy Trapp', skill: 1 },
    { name: 'Clive Carry', skill: 1 },
    { name: 'Ivy Links', skill: 2 },
    { name: 'Rex Rake', skill: 2 },
    { name: 'Nell Niblick', skill: 2 },
    { name: 'Bogey Boyd', skill: 2 },
    { name: 'Tilly Tee', skill: 3 },
    { name: 'Stan Stymie', skill: 3 },
    { name: 'Flo Flagstick', skill: 3 },
  ],
  championship: [
    { name: 'Edna Eagle', skill: 0 },
    { name: 'Maddie Mashie', skill: 0 },
    { name: 'Cliff Fescue', skill: 0 },
    { name: 'Dawn Drive', skill: 0 },
    { name: 'Gabe Green', skill: 1 },
    { name: 'Hugo Hook', skill: 1 },
    { name: 'Ida Iron', skill: 1 },
    { name: 'Kit Caddie', skill: 1 },
    { name: 'Olive Albatross', skill: 2 },
    { name: 'Wren Whin', skill: 2 },
    { name: 'Jock Slice', skill: 2 },
  ],
};
