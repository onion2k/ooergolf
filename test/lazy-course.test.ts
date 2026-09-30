/**
 * A course made by the generator is made when a player asks for it, and not when the page loads: nine holes of open
 * country cost the boot some thirty milliseconds when they were made at import, for a course a player may never choose.
 * What the start screen says of a course, its holes and its par, is known without making them.
 */
import { describe, expect, it, vi } from 'vitest';
import { COURSES } from '../src/course';

describe('a course made by the generator', () => {
  it('is made the first time its holes are asked for, once, and not when the module is loaded or its summary read', async () => {
    vi.resetModules();
    const made: string[] = [];
    vi.doMock('../src/open', async () => {
      const real = await vi.importActual<typeof import('../src/open')>('../src/open');
      return {
        ...real,
        openHole: (spec: Parameters<typeof real.openHole>[0]) => {
          made.push(spec.name);
          return real.openHole(spec);
        },
      };
    });
    const course = await import('../src/course');
    expect(made, 'nothing made as the module loads').toEqual([]);
    const moors = course.COURSES.find((c) => c.name === 'The Moors')!;
    expect(moors.summary, 'said without making them').toEqual({ holes: 9, par: 47 });
    for (const c of course.COURSES) expect(c.summary.holes).toBeGreaterThan(0);
    expect(made, 'nor as every course is summarised').toEqual([]);
    const holes = moors.holes;
    expect(made.length, 'nine, when they are asked for').toBe(9);
    expect(new Set(made).size).toBe(9);
    expect(moors.holes, 'and the very same holes after').toBe(holes);
    expect(course.moors(), 'from either way of asking').toBe(holes);
    expect(made.length, 'made once and no more').toBe(9);
    vi.doUnmock('../src/open');
    vi.resetModules();
  });

  it('says in its summary what its holes say, for every course there is', () => {
    for (const c of COURSES) {
      expect(c.summary.holes, `${c.name}: how many holes`).toBe(c.holes.length);
      expect(c.summary.par, `${c.name}: what par`).toBe(c.holes.reduce((a, h) => a + h.par, 0));
    }
  });
});
