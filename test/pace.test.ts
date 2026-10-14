/** The pace gate's arithmetic and its round: what it holds, and how it decides a figure has moved. */
import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { COURSE, COURSES } from '../src/course';
import { HARDER, mean, median, moved, orderProblems, paceRun } from '../scripts/pace';
import { FLAT } from './helpers';

describe('the pace gate', () => {
  it('takes the mean over the rounds, and the median of a hole for its par', () => {
    expect(mean([3, 4, 3, 4])).toBe(3.5);
    expect(median([3, 1, 2])).toBe(2);
    expect(median([1, 2, 3, 100])).toBe(2.5);
  });

  it('holds a figure both ways, fewer as much as more', () => {
    expect(moved(10, 11)).toBe(false);
    expect(moved(10, 13)).toBe(true);
    expect(moved(10, 7)).toBe(true);
  });

  it('holds the golf courses in order of how hard they are, each at least a tenth of a stroke a hole above the last', () => {
    const par = { 'The Links': 36, 'The Fells': 37, 'The Isles': 45 };
    const holes = { 'The Links': 9, 'The Fells': 9, 'The Isles': 9 };
    const good = { 'The Links': 29.88, 'The Fells': 34.6, 'The Isles': 47.8 };
    expect(HARDER).toEqual(['The Links', 'The Fells', 'The Isles']);
    expect(orderProblems(good, par, holes)).toEqual([]);
    // swapped: the Fells easier than the Links
    expect(orderProblems({ ...good, 'The Fells': 28 }, par, holes)).toHaveLength(1);
    // too close: under a tenth of a stroke a hole apart
    expect(orderProblems({ ...good, 'The Isles': 43.05 }, par, holes)).toHaveLength(1);
    // a course that was not played is said, not passed over
    expect(orderProblems({ 'The Links': 29.88 }, par, holes)).toHaveLength(2);
  });

  it('plays a whole round, the same from the same seed, and gives up at the cap, and says so', () => {
    const run = paceRun(2);
    expect(run.finished).toBe(true);
    expect(run.card.length).toBe(COURSE.length);
    expect(run.strokes).toBe(run.card.reduce((a, b) => a + b, 0));
    expect(paceRun(2)).toEqual(run);
    const cut = paceRun(1, 0.01);
    expect(cut.finished).toBe(false);
  });

  it('plays a round of any course, each held to its own figure', () => {
    const holes = [FLAT.pitch, FLAT.long];
    const run = paceRun(2, undefined, holes);
    expect(run.finished).toBe(true);
    expect(run.card.length).toBe(holes.length);
  });
  it('has a baseline figure for every course there is, and holds only the three courses that were ordered in `HARDER`', () => {
    // the three courses of 14 October 2026 are each held to a figure of their own and not to a place in the order, as the
    // user chose: a course the baseline has no figure for fails `pace:check` outright, so one is added here as it is added there
    const baseline = JSON.parse(
      readFileSync(new URL('../scripts/pace-baseline.json', import.meta.url), 'utf8'),
    ) as Record<string, number>;
    for (const c of COURSES) expect(typeof baseline[c.name], `${c.name} has a baseline`).toBe('number');
    expect(Object.keys(baseline).sort()).toEqual(COURSES.map((c) => c.name).sort());
    expect(HARDER).toEqual(['The Links', 'The Fells', 'The Isles']);
  });
});
