/**
 * Tranquility, the easy course of the Moon: nine holes of par 3, 4, 4, 3, 4, 4, 3, 4, 5 (thirty-four), on wide fairways of
 * thirteen to eighteen tiles over gentle ground, with a small crater across the line on five holes and a few bunkers. What is
 * held here is every count the table asks for, on the holes as made (`test/moon-course.ts` says what each is for); how it plays
 * is `test/tranquility-play.test.ts`.
 */
import { TRANQUILITY_SPECS, TRANQUILITY_SUMMARY, tranquility } from '../src/tranquility';
import { holdsTable } from './moon-course';

holdsTable({
  title: 'Tranquility',
  specs: TRANQUILITY_SPECS,
  make: tranquility,
  summary: TRANQUILITY_SUMMARY,
  pars: [3, 4, 4, 3, 4, 4, 3, 4, 5],
  lengths: { 3: [210, 240], 4: [420, 500], 5: [560, 640] },
  width: [13, 18],
  craters: ['Small Step', 'Quiet Basin', 'Dawn Plain', 'Lander’s Rest', 'Moonrise'],
  lakes: [],
  islands: [],
  islandGreens: [],
  bent: ['Mare Flat', 'Footprint', 'Lander’s Rest', 'Moonrise'],
  bend: [20, 30],
  shelved: [],
  bunkers: [2, 4],
  bunkersAll: [24, 36],
  greens: [13, 14.5],
  contour: [0.3, 0.4],
  heighten: [1, 1],
  makeMs: 3000,
  // the Moon's other two courses hold themselves clear of these names in their own tests, which is the same rule from the other side
  others: [],
});
