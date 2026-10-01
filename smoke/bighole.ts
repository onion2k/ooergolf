/**
 * The biggest hole there is that is not golf, for the smoke tests that hold what a big hole costs: a deliberately large test
 * hole of forty-five tiles by fifty-one, the very hole The Far Pin of The Moors was before The Moors were made tight (hills, a
 * pond, two bunkers and a stand of posts, the same seed and the same name, so the grass and the scenery too). The Moors'
 * biggest is a hole of 26 by 28 now, and measuring it would say nothing of what a big hole costs, so the perf gate and the
 * slope aids' frame are held to this one, with the baseline where it was. It is made here with the generator and is no
 * course's: a test plays it as a course of its own (`g.playCourse`), as plain data since a page is handed nothing else.
 */
import { openHole, type OpenSpec } from '../src/open';

export const BIG: OpenSpec = {
  name: 'The Far Pin',
  par: 6,
  shape: [45, 51, [11, 48], [33, 2]],
  feel: 'long hills',
  steepness: 0.7,
  seed: 27,
  features: [
    { kind: 'pond', count: 1, size: [2.5, 4] },
    { kind: 'sand', count: 2, size: [1.8, 3] },
    { kind: 'stand', count: 1, size: [3, 5] },
  ],
};

/** A hole as plain data for a page: its ground as an array, which the page makes a `Float32Array` of again. */
export const plain = (hole: ReturnType<typeof openHole>) => ({
  ...hole,
  terrain: Array.from(hole.terrain as Float32Array),
});

/** The big hole, ready to be handed to a page. */
export const bigHole = () => plain(openHole(BIG));
