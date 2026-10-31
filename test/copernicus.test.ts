/**
 * Copernicus, the middle course of the Moon: nine holes of par 4, 3, 5, 4, 4, 3, 5, 4, 4 (thirty-six), every one with a crater
 * across the line (eight craters and, beside the line on the left-hand dogleg, one lake) on fairways of ten or eleven tiles, four
 * doglegs of 35 to 40 degrees, and quick, turned greens. What is held here is every count the table asks for, on the holes as
 * made (`test/moon-course.ts` says what each is for); how it plays is `test/copernicus-play.test.ts`.
 */
import { COPERNICUS_SPECS, COPERNICUS_SUMMARY, copernicus } from '../src/copernicus';
import { TRANQUILITY_SPECS } from '../src/tranquility';
import { holdsTable } from './moon-course';

holdsTable({
  title: 'Copernicus',
  specs: COPERNICUS_SPECS,
  make: copernicus,
  summary: COPERNICUS_SUMMARY,
  pars: [4, 3, 5, 4, 4, 3, 5, 4, 4],
  lengths: { 3: [230, 250], 4: [480, 510], 5: [620, 650] },
  width: [10, 13],
  craters: [
    'Sea of Rains',
    'Eratosthenes',
    'Apennine Climb',
    'The Central Peak',
    'Ejecta',
    'Terraced Wall',
    'Crater Floor',
    'Gassendi',
  ],
  lakes: ['Kepler’s Rim'],
  islands: [],
  islandGreens: [],
  bent: ['Apennine Climb', 'Kepler’s Rim', 'Terraced Wall', 'Crater Floor'],
  bend: [35, 40],
  shelved: [],
  bunkers: [3, 6],
  bunkersAll: [40, 50],
  greens: [11.5, 12.5],
  contour: [0.8, 0.9],
  heighten: [1, 1],
  makeMs: 3000,
  others: TRANQUILITY_SPECS.map((s) => s.name),
});
