/** The pace gate's arithmetic and its round: what it holds, and how it decides a figure has moved. */
import { describe, expect, it } from 'vitest';
import { COURSE } from '../src/course';
import { mean, median, moved, paceRun } from '../scripts/pace';
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
});
