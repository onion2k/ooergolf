/**
 * The generated course previews are the courses as they are: a picture and a line of figures for every course, the picture
 * what the hole map's painter gives today, the holes' names and lengths the courses' own, and the nine pictures small
 * enough for the page to fetch with its start screen. A course changed without `npm run previews` being run fails here.
 * Makes every course, so it is the slow kind of test.
 */
import { readFileSync, statSync } from 'node:fs';
import { PNG } from 'pngjs';
import { describe, expect, it } from 'vitest';
import { layoutOf } from '../src/arena';
import { COURSES } from '../src/course';
import { paintMap } from '../src/holemap';
import { Obstacles } from '../src/obstacles';
import { PREVIEW, holeLength, previewSize, slugOf, type CoursePreview } from '../src/previews';
import previews from '../src/previews.json';

const DATA = previews as Record<string, CoursePreview>;

/** The most the nine pictures may weigh together, as sent: well inside the page's budget of 120 kB for pictures. */
const MOST_BYTES = 40_000;

describe('the course previews', () => {
  it('has an entry and a picture for every course, and none for a course that is not there', () => {
    expect(Object.keys(DATA).sort()).toEqual(COURSES.map((c) => c.name).sort());
    for (const c of COURSES) expect(statSync(`public/previews/${DATA[c.name].slug}.png`).size).toBeGreaterThan(0);
  });

  it('weighs under the ceiling, all nine together', () => {
    let total = 0;
    for (const c of COURSES) total += statSync(`public/previews/${DATA[c.name].slug}.png`).size;
    expect(total).toBeLessThan(MOST_BYTES);
  });

  it('names a picture by the course, in a form a file and a URL take', () => {
    expect(slugOf('The Old Course')).toBe('the-old-course');
    expect(slugOf("St. Andrew's!")).toBe('st-andrew-s');
    for (const c of COURSES) expect(DATA[c.name].slug).toBe(slugOf(c.name));
  });

  it('fits a hole to the box at its own shape, past a pixel a yard for a small one', () => {
    const tiny = layoutOf(['#####', '#.T.#', '#...#', '#.C.#', '#####']);
    const size = previewSize(tiny, 180);
    expect(Math.max(size.width, size.height)).toBe(180);
    expect(size.scale).toBeGreaterThan(1);
  });

  it('measures a hole along its line of play, and tee to cup without one', () => {
    const straight = layoutOf(['#####', '#.T.#', '#...#', '#...#', '#.C.#', '#####']);
    expect(holeLength(straight)).toBe(
      Math.round(Math.hypot(straight.cup.x - straight.tee.x, straight.cup.y - straight.tee.y)),
    );
    const bent = {
      ...straight,
      way: [
        [0, 0],
        [30, 40],
        [30, 140],
      ] as [number, number][],
    };
    expect(holeLength(bent)).toBe(150);
  });

  for (const course of COURSES) {
    it(`${course.name}: the picture is the painter's, and the holes are the course's`, () => {
      const holes = course.holes;
      const entry = DATA[course.name];
      expect(entry.holes.map((h) => h.name)).toEqual(holes.map((h) => h.name));
      for (const [k, h] of holes.entries())
        expect(entry.holes[k].yards, h.name).toBe(holeLength(layoutOf(h.map, h.terrain, h.way)));
      expect(entry.yards).toBe(entry.holes.reduce((a, h) => a + h.yards, 0));
      const def = holes[course.preview ?? PREVIEW.hole];
      const layout = layoutOf(def.map, def.terrain, def.way);
      const size = previewSize(layout);
      expect([entry.width, entry.height]).toEqual([size.width, size.height]);
      const pixels = new Uint8ClampedArray(size.width * size.height * 4);
      paintMap(layout, size, pixels, new Obstacles(def.obstacles ?? [], layout).streamed);
      const png = PNG.sync.read(readFileSync(`public/previews/${entry.slug}.png`));
      expect([png.width, png.height]).toEqual([size.width, size.height]);
      expect(Buffer.from(png.data).equals(Buffer.from(pixels.buffer)), 'the same pixels').toBe(true);
    });
  }
});
