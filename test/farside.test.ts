/**
 * The Far Side, the hard course of the Moon: nine long holes of par 4, 5, 3, 4, 5, 4, 5, 3, 5 (thirty-eight), each across a big
 * crater with an island in it, one of them (Cold Trap) an island green, on fairways of eight to ten tiles over hills heightened
 * to two with shelves of level ground to land on, quick and fully turned greens. What is held here is every count the table asks
 * for, on the holes as made (`test/moon-course.ts` says what each is for); how it plays is `test/farside-play.test.ts`.
 */
import { COPERNICUS_SPECS } from '../src/copernicus';
import { FARSIDE_SPECS, FARSIDE_SUMMARY, farside } from '../src/farside';
import { TRANQUILITY_SPECS } from '../src/tranquility';
import { holdsTable } from './moon-course';

holdsTable({
  title: 'The Far Side',
  specs: FARSIDE_SPECS,
  make: farside,
  summary: FARSIDE_SUMMARY,
  pars: [4, 5, 3, 4, 5, 4, 5, 3, 5],
  lengths: { 3: [230, 250], 4: [460, 500], 5: [600, 670] },
  width: [8, 11],
  craters: [],
  lakes: FARSIDE_SPECS.map((s) => s.name),
  islands: FARSIDE_SPECS.map((s) => s.name),
  islandGreens: ['Cold Trap'],
  bent: ['The Rille', 'Aitken Basin', 'Long Shadow', 'Moscoviense', 'Last Light'],
  bend: [30, 45],
  shelved: ['Terminator', 'The Rille', 'Aitken Basin', 'Tsiolkovsky', 'Moscoviense', 'Last Light'],
  bunkers: [4, 7],
  bunkersAll: [50, 60],
  greens: [11, 12],
  contour: [1, 1],
  heighten: [1.5, 2],
  makeMs: 8000,
  others: [...TRANQUILITY_SPECS, ...COPERNICUS_SPECS].map((s) => s.name),
});
