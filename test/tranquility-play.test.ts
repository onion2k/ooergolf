/**
 * How Tranquility plays: the easy course of the Moon, a good golfer's round a little under par, 0.2 to 0.4 of a stroke a hole.
 * The measure and the reasons are `test/moon-play.ts`'s; the seeds were chosen by it (see `src/tranquility.ts`).
 */
import { tranquility } from '../src/tranquility';
import { holdsPlay } from './moon-play';

holdsPlay({ title: 'Tranquility', make: tranquility, target: [-0.4, -0.2] });
