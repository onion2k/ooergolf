/**
 * Two holes of open country made by the generator for the smoke tests, since no course has one now that The Moors are
 * scrapped. The big one holds what a big hole costs: a deliberately large test hole of forty-five tiles by fifty-one, the
 * very hole The Far Pin of The Moors was before The Moors were made tight (hills, a pond, two bunkers and a stand of
 * posts, the same seed and the same name, so the grass and the scenery too), which the perf gate and the slope aids'
 * frame are held to, with the baseline where it was. The small one is Wide Open as it was, the first hole of The Moors,
 * fifty-one units from tee to cup on hills and nothing else: the perf gate's smallest hole to begin in turn with the
 * biggest, and a long hole played by drags with the camera following. Neither is any course's: a test plays one as a
 * course of its own (`g.playCourse`), as plain data since a page is handed nothing else.
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

/** The small one: Wide Open, with the seed and shape it had on The Moors. */
export const SMALL: OpenSpec = {
  name: 'Wide Open',
  par: 3,
  shape: [16, 20, [4, 17], [12, 2]],
  feel: 'hills',
  steepness: 0.5,
  seed: 3,
  features: [],
};

/** A hole as plain data for a page: its ground as an array, which the page makes a `Float32Array` of again. */
export const plain = (hole: ReturnType<typeof openHole>) => ({
  ...hole,
  terrain: Array.from(hole.terrain as Float32Array),
});

/** The big hole, ready to be handed to a page. */
export const bigHole = () => plain(openHole(BIG));
/** The small hole, ready to be handed to a page. */
export const smallHole = () => plain(openHole(SMALL));
