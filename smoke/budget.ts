/**
 * What the game may cost at all, on this machine, whatever it cost before:
 * one place, read by the perf gate and by every smoke test that holds a frame
 * to the budget, so the figure is said once. It lives apart from
 * `perf.spec.ts` because a spec that imports a spec runs its tests twice.
 * The frame is `LOOK.md`'s: the look may spend up to 6 ms of it at the top
 * rung (5 until 4 October 2026, when the look's next three parts, the
 * denser grass, the moving water and the ground texture, were decided), and
 * a slower machine steps down the ladder.
 */
export const BUDGET = {
  bootMs: 3000,
  frameMs: 6,
  bundleKb: 400,
  // the pictures the page fetches before the game is up, which the scripts' budget does not count: the title is 63 kB as WebP
  imageKb: 120,
  beginMs: 400,
  bigFrameMs: 6,
  linksBeginMs: 400,
  linksFrameMs: 6,
};
