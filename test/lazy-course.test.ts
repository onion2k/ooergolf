/**
 * A course made by a generator is made when a player asks for it, and not when the page loads: nine holes of golf cost
 * the boot some tens of milliseconds when they were made at import, for a course a player may never choose. What the
 * start screen says of a course, its holes and its par, is known without making them.
 */
import { describe, expect, it, vi } from 'vitest';
import { COURSES } from '../src/course';

describe('a course made by a generator', () => {
  it('is made the first time its holes are asked for, once, and not when the module is loaded or its summary read: The Links, whose holes are made by `golfHole`', async () => {
    vi.resetModules();
    const made: string[] = [];
    vi.doMock('../src/golf', async () => {
      const real = await vi.importActual<typeof import('../src/golf')>('../src/golf');
      return {
        ...real,
        golfHole: (spec: Parameters<typeof real.golfHole>[0]) => {
          made.push(spec.name);
          return real.golfHole(spec);
        },
      };
    });
    const course = await import('../src/course');
    expect(made, 'nothing made as the module loads, or as the courses are summarised').toEqual([]);
    const links = course.COURSES.find((c) => c.name === 'The Links')!;
    expect(links.summary).toEqual({ holes: 9, par: 36 });
    expect(made).toEqual([]);
    const holes = links.holes;
    expect(made.length).toBe(9);
    expect(links.holes).toBe(holes);
    expect(made.length, 'once').toBe(9);
    vi.doUnmock('../src/golf');
    vi.resetModules();
  });

  it('says in its summary what its holes say, for every course there is', () => {
    for (const c of COURSES) {
      expect(c.summary.holes, `${c.name}: how many holes`).toBe(c.holes.length);
      expect(c.summary.par, `${c.name}: what par`).toBe(c.holes.reduce((a, h) => a + h.par, 0));
    }
  });
});
