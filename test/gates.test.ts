/** How the bench and the perf gate judge a figure against its baseline: over and under the tolerance, both ways. */
import { describe, expect, it } from 'vitest';
import { benchVerdict, movedFrom } from '../scripts/gates';

describe("the bench's judgement", () => {
  // a scenario of 2 ms a frame, the reference 1 ms: a multiple of 2, held to a fifth of itself and 0.05 ms
  const was = { relative: 2 };
  const at = (ms: number, ref = 1) => ({ ms, ref, relative: ms / ref });

  it('fails a scenario slower by more than the share and the slack, and only that', () => {
    expect(benchVerdict(at(2.5), was, 0.2, 0.05), '25% and 0.5 ms slower').toBe('SLOWER');
    expect(benchVerdict(at(2.39), was, 0.2, 0.05), '19.5% slower').toBe('within tolerance');
    expect(benchVerdict(at(2.41), was, 0.2, 0.05), '20.5% slower').toBe('SLOWER');
  });

  it('says a scenario faster by as much, and does not fail it', () => {
    expect(benchVerdict(at(1.5), was, 0.2, 0.05), '25% faster').toBe('faster');
    expect(benchVerdict(at(1.61), was, 0.2, 0.05), '19.5% faster').toBe('within tolerance');
  });

  it('lets a scenario that costs next to nothing move by more than the share, while it moves by less than the slack', () => {
    const tiny = { relative: 0.01 };
    expect(benchVerdict(at(0.02), tiny, 0.2, 0.05), 'twice as slow, 0.01 ms more').toBe('within tolerance');
    expect(benchVerdict(at(0.07), tiny, 0.2, 0.05), 'seven times as slow, 0.06 ms more').toBe('SLOWER');
  });

  it("takes the machine's speed out: a slower machine slows the reference as much, and is no change", () => {
    expect(benchVerdict(at(3, 1.5), was, 0.2, 0.05), 'all half as fast again').toBe('within tolerance');
    expect(benchVerdict(at(3, 1), was, 0.2, 0.05), 'the scenario alone half as slow again').toBe('SLOWER');
  });
});

describe("the perf gate's judgement", () => {
  const tolerance = { frameMs: [0.15, 0.1], bootMs: [0.35, 250] } as const;
  const keys = ['frameMs', 'bootMs'] as const;
  const baseline = { frameMs: 3, bootMs: 300 };

  it('lets a figure move within its share or its slack, whichever is the more', () => {
    expect(movedFrom(baseline, { frameMs: 3.44, bootMs: 549 }, tolerance, keys)).toEqual([]);
    expect(movedFrom(baseline, { frameMs: 2.56, bootMs: 51 }, tolerance, keys)).toEqual([]);
  });

  it('names a figure that moved past it, slower or quicker, since quicker is as much a change', () => {
    expect(movedFrom(baseline, { frameMs: 3.46, bootMs: 300 }, tolerance, keys)).toEqual(['frameMs 3 -> 3.46']);
    expect(movedFrom(baseline, { frameMs: 2.54, bootMs: 300 }, tolerance, keys)).toEqual(['frameMs 3 -> 2.54']);
    expect(movedFrom(baseline, { frameMs: 3, bootMs: 551 }, tolerance, keys)).toEqual(['bootMs 300 -> 551']);
  });

  it('holds a small figure to its slack, not its share', () => {
    const small = { frameMs: 0.2, bootMs: 300 };
    expect(movedFrom(small, { frameMs: 0.29, bootMs: 300 }, tolerance, keys), '45% more, 0.09 ms').toEqual([]);
    expect(movedFrom(small, { frameMs: 0.31, bootMs: 300 }, tolerance, keys), '0.11 ms more').toEqual([
      'frameMs 0.2 -> 0.31',
    ]);
  });

  it('names a figure the baseline has not got', () => {
    expect(movedFrom({ frameMs: 3 }, { frameMs: 3, bootMs: 300 }, tolerance, keys)).toEqual([
      'bootMs 300 (not in the baseline)',
    ]);
  });
});
