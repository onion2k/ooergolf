/**
 * How far back the overhead view may stand, held to the biggest holes there are. Without this the cap on `OVERHEAD.far`
 * would be a number chosen once and never read again: a hole a long course adds that no longer fits would be cut off at
 * the screen's edge in the one view that promises the whole of it. The figures behind 3000 are the spike's, in
 * `~/.claude/plans/ooergolf-camera-rework.md` (Part 0): the view costs a frame under 1.2 ms at that distance, since it
 * is out past every ring of grass.
 */
import { describe, expect, it } from 'vitest';
import { layoutOf } from '../src/arena';
import { OVERHEAD, overheadFit } from '../src/camera';
import { COURSES } from '../src/course';

/** A desk, and a phone: 1280 by 800 and 400 by 860. */
const ASPECTS = [1280 / 800, 400 / 860];
/** The headings the view may be turned to: along the hole, across it, and between. */
const AZIMUTHS = [0, Math.PI / 4, Math.PI / 2, Math.PI, -Math.PI / 2];

describe('how far back the overhead view stands', () => {
  for (const name of ['The Links', 'The Fells', 'The Isles']) {
    const course = COURSES.find((c) => c.name === name)!;
    it(`shows the whole of every hole of ${name}, on a desk and a phone, whichever way the view is turned`, () => {
      let tightest = Infinity;
      for (const hole of course.holes) {
        const { bounds } = layoutOf(hole.map, hole.terrain);
        for (const aspect of ASPECTS)
          for (const azimuth of AZIMUTHS) {
            const d = overheadFit(bounds, azimuth, aspect);
            tightest = Math.min(tightest, OVERHEAD.far - d);
            expect(
              d,
              `${hole.name}, aspect ${aspect.toFixed(2)}, azimuth ${azimuth.toFixed(2)}: not held at the cap`,
            ).toBeLessThan(OVERHEAD.far);
          }
      }
      expect(tightest).toBeGreaterThan(0);
    });
  }
});
