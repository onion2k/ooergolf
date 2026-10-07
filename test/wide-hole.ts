/**
 * A hole the game plays and the scene's models can be built for, and that the field of grass will not cover: for the tests
 * and smoke tests of what the page does when a hole cannot be drawn. It is a real refusal, not one put there by a hook: the
 * field is a texture of at most `FIELD_SIDE` cells a side, so a hole wider than the coarsest cell reaches is turned away by
 * `cellFor`, a step after the scene's groups are built. Its own file, and light, as `level.ts` is, since a smoke test is run
 * by Playwright's loader, which cannot read the physics package that `helpers.ts` reaches through the game.
 */
import { layoutOf } from '../src/arena';
import type { HoleDef } from '../src/course';
import { cellFor } from '../src/turf';

/** The most tiles the longest hole could be, before the search for the width the grass refuses gives up. */
const MOST = 4096;

/** A corridor of minigolf `cols` tiles long and three wide, with the tee at the west end and the cup near the east. */
export function corridor(cols: number, name = 'The Long Way'): HoleDef {
  return {
    name,
    par: 3,
    map: [
      '#'.repeat(cols),
      `#.T${'.'.repeat(cols - 6)}C.#`,
      `#${'.'.repeat(cols - 2)}#`,
      `#${'.'.repeat(cols - 2)}#`,
      '#'.repeat(cols),
    ],
  };
}

/** Whether the field of grass takes a corridor `cols` tiles long. */
function covered(cols: number): boolean {
  try {
    cellFor(layoutOf(corridor(cols).map));
    return true;
  } catch (err) {
    if (err instanceof RangeError) return false;
    throw err;
  }
}

/** How many tiles long the shortest corridor is that the grass will not cover: whatever the field's limit is now, found by asking it. */
export function tooLong(): number {
  for (let cols = 60; cols < MOST; cols++) if (!covered(cols)) return cols;
  throw new Error(`the field of grass covers a hole ${MOST} tiles long, which this test hole was made not to be`);
}

/** The corridor the grass will not cover, as plain data, since a page is handed nothing else. */
export const wideHole = (): HoleDef => corridor(tooLong());
