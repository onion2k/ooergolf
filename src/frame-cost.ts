/**
 * What drawing a frame costs, measured: `draw` is called and the GPU waited
 * for, a number of times, and the lower quartile taken. The samples are
 * spaced by a timeout, not an animation frame: a hidden tab gets none, and
 * a GPU left idle between samples drops to a slower power state than a game
 * keeps it in. Scheduling only ever adds time, so the lower quartile is the
 * frame's own cost; taken this way it repeats to a tenth or two.
 *
 * A GPU that has sat idle, as it does while the page boots, runs slow for a
 * while: the perf gate's frame read 1.3 in half its runs and 2.3 to 2.7 in
 * the others until it was warmed with three hundred frames first, as
 * artshape-render's own gate found. So the first measuring of a page may ask
 * for that many before it times anything.
 */
const WARMUP = 6,
  SAMPLES = 24,
  /**
   * Frames drawn back to back for each sample, and divided among: a GPU given
   * one small frame at a time never comes up to speed, and a lone frame read
   * anything from 1.3 to 2.7 ms from one run to the next.
   */
  BATCH = 10;

export async function frameCost(draw: () => boolean, done: () => Promise<unknown>, warmup = WARMUP): Promise<number> {
  const times: number[] = [];
  for (let i = 0; i < warmup + SAMPLES; i++) {
    await new Promise((r) => setTimeout(r, 0));
    const start = performance.now();
    let drew = false;
    for (let k = 0; k < BATCH; k++) drew = draw() || drew;
    await done();
    if (drew && i >= warmup) times.push((performance.now() - start) / BATCH);
  }
  if (!times.length) return 0;
  times.sort((a, b) => a - b);
  return times[times.length >> 2];
}
