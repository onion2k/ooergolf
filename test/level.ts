/**
 * Golf holes as flat as a table, for the tests and smoke tests that want ground a ball is played from and nothing that leans.
 * Their own file, and light, since a smoke test is run by Playwright's loader, which cannot read the physics package that
 * `helpers.ts` reaches through the game.
 */
import { TILE } from '../src/arena';
import type { HoleDef } from '../src/course';

/** What a level hole is made with: a straight way of play of `length` yards, and what is on it. */
export interface LevelSpec {
  name: string;
  par: number;
  length: number;
  /** A bunker short of the green on the left. */
  bunker?: boolean;
  /** A pond, a disc of `radius` yards at `along` the way of play and `across` it (positive to the right). */
  pond?: { along: number; across: number; radius: number };
  /** The wind, in miles an hour, and the greens' speed: the hole's own, calm and normal where not said. */
  wind?: number;
  greens?: number;
}

/**
 * A golf hole as flat as a table, made for tests that want ground a ball is played from and nothing that leans: a tee's box
 * at the south end, a fairway thirteen tiles across up the middle with rough either side, a round green round the cup, all
 * in a rail far enough off that a scattered drive does not reach it. Not a course's: The Links' holes are hills, and a
 * test of the arithmetic, of a putt on the level or of a wind wants a hole where the ground adds nothing.
 */
export function levelHole(spec: LevelSpec): HoleDef {
  const FAIRWAY = 13,
    ROUGH = 9,
    GREEN = 5.5,
    BEHIND = 3,
    BEYOND = 9;
  const cols = 2 + 2 * ROUGH + FAIRWAY,
    middle = Math.floor(cols / 2);
  const teeRow = BEHIND,
    cupRow = teeRow + Math.round(spec.length / TILE),
    rows = cupRow + BEYOND + 1;
  // rows from the south, so the tee's is small, and turned over when the map is written
  const grid: string[][] = Array.from({ length: rows }, (_, r) =>
    Array.from({ length: cols }, (_, c) => (r === 0 || r === rows - 1 || c === 0 || c === cols - 1 ? '#' : 'r')),
  );
  for (let r = teeRow + 2; r <= cupRow; r++) for (let c = middle - 6; c <= middle + 6; c++) grid[r][c] = 'f';
  for (let r = 1; r < rows - 1; r++)
    for (let c = 1; c < cols - 1; c++) if (Math.hypot(c - middle, r - cupRow) < GREEN) grid[r][c] = 'g';
  if (spec.bunker)
    for (let r = cupRow - 4; r <= cupRow - 2; r++) for (let c = middle - 8; c <= middle - 5; c++) grid[r][c] = 's';
  if (spec.pond) {
    const { along, across, radius } = spec.pond;
    for (let r = 1; r < rows - 1; r++)
      for (let c = 1; c < cols - 1; c++)
        if (Math.hypot((c - middle) * TILE - across, (r - teeRow) * TILE - along) <= radius) grid[r][c] = '~';
  }
  for (let r = teeRow - 1; r <= teeRow + 1; r++) for (let c = middle - 1; c <= middle + 1; c++) grid[r][c] = 't';
  grid[teeRow][middle] = 'T';
  grid[cupRow][middle] = 'C';
  return {
    name: spec.name,
    par: spec.par,
    map: grid.map((row) => row.join('')).reverse(),
    ...(spec.wind !== undefined ? { wind: spec.wind } : {}),
    ...(spec.greens !== undefined ? { greens: spec.greens } : {}),
  };
}

/**
 * A few level holes: a pitch a wedge reaches (105 yards), a par four that wants a drive and has a bunker at the green (330),
 * a par three over a pond (150), one in an eight mile an hour wind (165) and a par five on quick greens (600). The
 * tests that were once run on a course of the like are run on these, since a course of hills is not a hole where the ground adds
 * nothing.
 */
export const FLAT = {
  pitch: levelHole({ name: 'Level pitch', par: 3, length: 105 }),
  long: levelHole({ name: 'Level long', par: 4, length: 330, bunker: true }),
  pond: levelHole({ name: 'Level pond', par: 3, length: 150, pond: { along: 104, across: -3, radius: 15 } }),
  windy: levelHole({ name: 'Level windy', par: 3, length: 165, wind: 8 }),
  road: levelHole({ name: 'Level road', par: 5, length: 600, greens: 12.5 }),
};
export const FLAT_HOLES: readonly HoleDef[] = Object.values(FLAT);
