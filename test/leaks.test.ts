/**
 * What must stay bounded over a long game, and the tool that watches it.
 * The run itself is too long for a unit test — `npm run leaks` does that —
 * so what is tested here is the measuring: that the sizes are read off the
 * game properly, and that the thing which decides what is growing says so
 * when it is, and holds its tongue when it is not.
 */
import { describe, expect, it } from 'vitest';
import { WATCH, grew, sizes, trouble } from '../scripts/leaks';
import { BALL } from '../src/arena';
import { CLUBS } from '../src/clubs';
import { COURSES } from '../src/course';
import { Progress, memoryStore } from '../src/progress';
import { newGame } from './helpers';

describe('what must stay bounded', () => {
  it('holds a save with every club and a best on every hole of every course under its ceiling, however many courses there are', () => {
    // a best is kept for each hole by its name, so the save grows a hole at a time as the courses are played: the most it
    // could ever be is every club owned and every hole of every course done
    const progress = new Progress(memoryStore(null));
    progress.save.owned = CLUBS.map((c) => c.id);
    progress.save.club = CLUBS[CLUBS.length - 1].id;
    progress.save.coins = 999_999;
    progress.save.gems = 999;
    const holes = COURSES.flatMap((c) => c.holes);
    for (const hole of holes) progress.save.best[hole.name] = { strokes: 10, club: CLUBS[CLUBS.length - 1].id };
    expect(holes.length, 'a hole of each').toBeGreaterThanOrEqual(31);
    const bytes = JSON.stringify(progress.save).length;
    expect(bytes, `${bytes} bytes for ${holes.length} holes`).toBeLessThan(WATCH['save bytes']!.ceiling);
  });

  it('reads the sizes off a game, and has a ceiling for every one', () => {
    const { game } = newGame();
    const now = sizes(game);
    for (const key of ['bodies', 'slots', 'save bytes', 'card scores', 'heap MB']) {
      expect(Object.keys(now), `${key} measured`).toContain(key);
      expect(Number.isFinite(now[key])).toBe(true);
      expect(Object.keys(WATCH), `a ceiling for ${key}`).toContain(key);
    }
    expect(now.bodies, 'the ball').toBe(1);
    expect(now['save bytes']).toBe(JSON.stringify(game.progress.save).length);
    game.world.spawn(BALL, 0, 0, 2);
    expect(sizes(game).bodies).toBe(2);
    expect(sizes(game).slots).toBe(2);
  });

  it('knows a size that grows from one that wanders', () => {
    expect(grew([10, 10, 10, 10, 10, 10, 10, 10, 10])).toBe(false);
    expect(grew([10, 12, 9, 11, 10, 12, 9, 11, 10])).toBe(false);
    expect(grew([0, 20, 40, 60, 50, 50, 50, 50, 50]), 'filled up early and settled').toBe(false);
    expect(grew([10, 20, 30, 40, 50, 60, 70, 80, 90]), 'creeping all the way through').toBe(true);
    expect(grew([1, 2, 3]), 'too short to say').toBe(false);
  });

  it('reports a size over its ceiling, and a steady one still climbing', () => {
    expect(trouble({ bodies: [10, 10, 10] })).toEqual([]);
    expect(trouble({ bodies: [10, 10_000, 10] }).join('\n')).toMatch(/bodies went to 10000/);
    expect(trouble({ 'heap MB': [10, 40, 70, 100, 130, 160, 190, 220, 250] }).join('\n')).toMatch(/grew all the way/);
    // a size that only ever climbs is held by its ceiling alone
    expect(trouble({ slots: [1, 2, 3, 4, 5, 6, 7, 8, 9] })).toEqual([]);
  });
});
