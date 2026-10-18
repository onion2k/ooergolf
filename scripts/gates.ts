/**
 * How the bench and the perf gate judge a figure against its baseline, apart from the measuring, so each has tests of its
 * own (`test/gates.test.ts`): a judgement that let a change through would look, run whole, like one that passes
 * (guardrails/checks/gates.md). The tolerances stay beside the wobble they were set from, in `bench.ts` and
 * `smoke/perf.spec.ts`; these only apply them.
 */

/** What the bench says of a scenario: slower fails it, faster is said and passes. */
export type BenchVerdict = 'SLOWER' | 'faster' | 'within tolerance';

/**
 * A bench scenario against its baseline. Its time is held as a multiple of the reference arithmetic timed beside it
 * (`relative`), which takes the machine's speed out; it is slower or faster only when that multiple has moved by more
 * than `tolerance` of itself AND the time has moved by more than `slackMs` from what the baseline's multiple comes to on
 * this machine now (`was.relative * now.ref`), so a scenario that costs next to nothing is not failed for noise.
 */
export function benchVerdict(
  now: { relative: number; ms: number; ref: number },
  was: { relative: number },
  tolerance: number,
  slackMs: number,
): BenchVerdict {
  const change = now.relative / was.relative - 1;
  const expected = was.relative * now.ref;
  if (change > tolerance && now.ms - expected > slackMs) return 'SLOWER';
  if (change < -tolerance && expected - now.ms > slackMs) return 'faster';
  return 'within tolerance';
}

/**
 * Each perf figure that has moved from its baseline either way by more than its tolerance, a share of the baseline or a
 * slack, whichever is the more, and each that the baseline has not got: the lines the gate fails with. Quicker is as much
 * a change as slower.
 */
export function movedFrom<K extends string>(
  baseline: Partial<Record<K, number>>,
  now: Record<K, number>,
  tolerance: Record<K, readonly [share: number, slack: number]>,
  keys: readonly K[],
): string[] {
  const moved: string[] = [];
  for (const key of keys) {
    const was = baseline[key];
    if (was === undefined) {
      moved.push(`${key} ${now[key]} (not in the baseline)`);
      continue;
    }
    const [share, slack] = tolerance[key];
    if (Math.abs(now[key] - was) > Math.max(Math.abs(was) * share, slack)) moved.push(`${key} ${was} -> ${now[key]}`);
  }
  return moved;
}
