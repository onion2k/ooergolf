/**
 * How The Far Side plays: the hard course of the Moon, a good golfer's round over par by five tenths to nine tenths of a stroke a
 * hole. The measure and the reasons are `test/moon-play.ts`'s; the seeds were chosen by it (see `src/farside.ts`).
 */
import { farside } from '../src/farside';
import { holdsPlay } from './moon-play';

holdsPlay({ title: 'The Far Side', make: farside, target: [0.5, 0.9] });
