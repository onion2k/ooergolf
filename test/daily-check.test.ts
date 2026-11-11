/** The daily gate's working parts: what it says is wrong, and that a gate that played nothing is not a pass. */
import { describe, expect, it } from 'vitest';
import { DAILY, checkedDays, problems, type DayRun } from '../scripts/daily';

const good = (day: string): DayRun => ({
  day,
  refused: 0,
  plain: false,
  rounds: DAILY.seeds,
  holed: DAILY.seeds,
  stuck: 0,
});
const all = () => checkedDays().map(good);

describe('the daily gate', () => {
  it('checks four hundred consecutive days, each once', () => {
    const days = checkedDays();
    expect(days).toHaveLength(400);
    expect(new Set(days).size).toBe(400);
    expect(days[0]).toBe(DAILY.from);
  });

  it('passes days that all play, and a few that were refused or a little hard', () => {
    const runs = all();
    expect(problems(runs)).toEqual([]);
    runs[3] = { ...runs[3], refused: 2 };
    runs[9] = { ...runs[9], holed: DAILY.seeds - 1 };
    expect(problems(runs)).toEqual([]);
  });

  it('says so when it played nothing, or fewer days than it should', () => {
    expect(problems([])).not.toEqual([]);
    expect(problems(all().slice(1)).join()).toMatch(/399 days/);
    expect(problems(all().map((r) => ({ ...r, rounds: 0, holed: 0 }))).join()).toMatch(/not played on all/);
  });

  it('fails a day that fell to the plain hole, a round that never finished, and a hole nobody can hole', () => {
    for (const [change, what] of [
      [{ plain: true }, /plain hole/],
      [{ stuck: 1 }, /never finished/],
      [{ holed: 2 }, /holed inside the limit, under 60%/],
    ] as const) {
      const runs = all();
      runs[5] = { ...runs[5], ...change };
      expect(problems(runs).join(), JSON.stringify(change)).toMatch(what);
    }
  });

  it('fails when the share holed falls overall, or the generator refuses too many days', () => {
    const hard = all().map((r) => ({ ...r, holed: DAILY.seeds - 1 }));
    expect(problems(hard).join()).toMatch(/under 98%/);
    const refusing = all().map((r, k) => (k % 5 === 0 ? { ...r, refused: 1 } : r));
    expect(problems(refusing).join()).toMatch(/had a spec refused/);
  });
});
