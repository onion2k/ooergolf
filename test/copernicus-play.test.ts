/**
 * How Copernicus plays: the middle course of the Moon, a good golfer's round at par, from a tenth of a stroke a hole under to
 * two tenths over. The measure and the reasons are `test/moon-play.ts`'s; the seeds were chosen by it (see `src/copernicus.ts`).
 */
import { copernicus } from '../src/copernicus';
import { holdsPlay } from './moon-play';

holdsPlay({ title: 'Copernicus', make: copernicus, target: [-0.1, 0.2] });
