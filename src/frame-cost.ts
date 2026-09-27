/**
 * What drawing a frame costs, measured: `draw` is called and the GPU waited
 * for, a number of times, and the lower quartile taken. The samples are
 * spaced by a timeout, not an animation frame: a hidden tab gets none, and
 * a GPU left idle between samples drops to a slower power state than a game
 * keeps it in. Scheduling only ever adds time, so the lower quartile is the
 * frame's own cost; taken this way it repeats to a tenth or two.
 */
const WARMUP = 6,
  SAMPLES = 24;

export async function frameCost(draw: () => boolean, done: () => Promise<unknown>): Promise<number> {
  const times: number[] = [];
  for (let i = 0; i < WARMUP + SAMPLES; i++) {
    await new Promise((r) => setTimeout(r, 0));
    const start = performance.now();
    const drew = draw();
    await done();
    if (drew && i >= WARMUP) times.push(performance.now() - start);
  }
  if (!times.length) return 0;
  times.sort((a, b) => a - b);
  return times[times.length >> 2];
}
