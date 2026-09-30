/**
 * The range: golf holes with nothing on them but the ground, as flat as a table and as plain as a driving range, in
 * the first course of golf. What they are for is the shot: every club of the bag is meant to be tried from a tee, a
 * fairway, the rough and a bunker, and to be seen to fly and land and roll out, before the holes that ask more of it
 * (hills, water, trees, out of bounds) are drawn. A unit is a yard, so a hole's length is what a golfer would call it.
 *
 * A hole is a tee's box at the south end, a fairway up the middle with rough either side of it, and a round green
 * round the cup at the far end, all inside a rail far enough off that a scattered drive does not reach it: the rail
 * is a wall to a ball in the air as well as on the ground, which is out of bounds until the holes have their own.
 */
import type { HoleDef } from './course';
import { TILE } from './arena';

/** A range hole: what it is called, its par and how far it is from the tee to the cup, in units. */
interface RangeSpec {
  name: string;
  par: number;
  length: number;
  /** A bunker short of the green on the left, which the sand wedge is for. */
  bunker?: boolean;
}

/** The width of the fairway and of the rough beside it, in tiles, and the green's radius round the cup. */
const FAIRWAY = 13,
  ROUGH = 9,
  GREEN = 5.5;
/** How many rows of rough lie behind the tee and past the green. */
const BEHIND = 3,
  BEYOND = 9;

/** A hole of the range from its spec: its map, from the far end down, with nothing on it but its ground. */
export function rangeHole(spec: RangeSpec): HoleDef {
  const cols = 2 + 2 * ROUGH + FAIRWAY,
    middle = Math.floor(cols / 2);
  const teeRow = BEHIND,
    cupRow = teeRow + Math.round(spec.length / TILE),
    rows = cupRow + BEYOND + 1;
  // rows from the south, so the tee's is small, and turned over when the map is written
  const grid: string[][] = Array.from({ length: rows }, (_, r) =>
    Array.from({ length: cols }, (_, c) => (r === 0 || r === rows - 1 || c === 0 || c === cols - 1 ? '#' : 'r')),
  );
  for (let r = teeRow + 2; r <= cupRow; r++)
    for (let c = middle - (FAIRWAY - 1) / 2; c <= middle + (FAIRWAY - 1) / 2; c++) grid[r][c] = 'f';
  for (let r = 1; r < rows - 1; r++)
    for (let c = 1; c < cols - 1; c++) if (Math.hypot(c - middle, r - cupRow) < GREEN) grid[r][c] = 'g';
  if (spec.bunker)
    for (let r = cupRow - 4; r <= cupRow - 2; r++) for (let c = middle - 8; c <= middle - 5; c++) grid[r][c] = 's';
  for (let r = teeRow - 1; r <= teeRow + 1; r++) for (let c = middle - 1; c <= middle + 1; c++) grid[r][c] = 't';
  grid[teeRow][middle] = 'T';
  grid[cupRow][middle] = 'C';
  return { name: spec.name, par: spec.par, map: grid.reverse().map((row) => row.join('')) };
}

/** The holes of the range: a pitch a wedge reaches, a long iron's par three, and a par four that wants a drive. */
export const RANGE: readonly HoleDef[] = [
  { name: 'Pitch and Putt', par: 3, length: 105 },
  { name: 'Iron Alley', par: 3, length: 175, bunker: true },
  { name: 'The Long Way', par: 4, length: 330, bunker: true },
].map(rangeHole);
