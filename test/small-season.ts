/**
 * A small season for tests of the game: the golf tour's two events and the mini tour's one, each of three practice greens
 * (holed in one or picked up), at purses 1.2, 1.5 and 1, so the fees are 30, 38 and 25 coins and a pot is twelve fees.
 * Apart from `season-context.ts`, which the fuzzer uses too, so that importing this brings in no helpers there.
 */
import type { HoleDef } from '../src/course';
import type { EventCourse, SeasonContext } from '../src/tournament';
import { GREEN } from './helpers';
import { contextOf } from './season-context';

const green = (course: string, n: string): HoleDef => ({ ...GREEN, name: `${course} ${n}` });
const small = (name: string, purse: number): EventCourse => ({
  name,
  purse,
  holes: ['One', 'Two', 'Three'].map((n) => green(name, n)),
});
export const SMALL_A = small('Small Links', 1.2);
export const SMALL_B = small('Small Heath', 1.5);
export const SMALL_C = small('Small Meadow', 1);
export const SMALL: SeasonContext = contextOf({ golf: [SMALL_A, SMALL_B], mini: [SMALL_C] });
/** The par of each of those courses: three holes of the practice green's par. */
export const SMALL_PAR = 3 * GREEN.par;
/** A course as the career knows a round of it. */
export const roundOfEvent = (c: EventCourse) => ({ name: c.name, purse: c.purse });
