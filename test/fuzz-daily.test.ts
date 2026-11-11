/**
 * The monkey playing the daily hole: on some seeds, from the start screen, any of eight fixed days, held to what a first go and a later
 * go are and to what the slot may never do. Seeds where it plays none (and any run on a course of its own) are as they were, which
 * `fuzz.test.ts`'s figures hold.
 */
import { describe, expect, it } from 'vitest';
import { FUZZ_DAYS, fuzz } from '../scripts/fuzzer';
import { biomeOfDay } from '../src/daily';

const count = (r: ReturnType<typeof fuzz>, key: string) => r.checked[key] ?? 0;

describe('the monkey on the daily hole', () => {
  it('plays eight fixed days, two turns of the four biomes', () => {
    expect(FUZZ_DAYS).toHaveLength(8);
    expect(new Set(FUZZ_DAYS.map(biomeOfDay)).size).toBe(4);
  });

  it('breaks no rule on the seeds that play it, and meets a first go, a later go and a slot written', () => {
    const runs = [1, 2, 7, 8].map((seed) => fuzz(seed, 12000));
    for (const r of runs) expect(r.failure, JSON.stringify(r.failure)).toBe(null);
    const total = (key: string) => runs.reduce((n, r) => n + count(r, key), 0);
    expect(total('daily first go begun'), 'a first go begun').toBeGreaterThan(0);
    expect(total('daily later go begun'), 'a later go begun').toBeGreaterThan(0);
    expect(total('daily slot written'), 'the slot written').toBeGreaterThan(0);
    expect(total('daily first go kept'), 'a first go finished').toBeGreaterThan(0);
    expect(total('daily later go left alone'), 'a later go finished').toBeGreaterThan(0);
  });

  it('plays none on a seed that is not drawn to it, nor on a course given', () => {
    const r = fuzz(3, 3000);
    expect(r.done['play the daily hole'] ?? 0).toBe(0);
    expect(Object.keys(r.checked).filter((k) => k.startsWith('daily'))).toEqual([]);
  });
});
