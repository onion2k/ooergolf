/**
 * The generated course previews are the courses as they are: for every course a picture of each of its holes, painted
 * from above (a golf hole by the hole map's painter, a hole of minigolf by its own, which draws the rail, the cup and
 * the tee), and its holes' names, pars and lengths; and the nine pictures of a course small enough for the page to fetch
 * as a player steps to it. A course changed without `npm run previews` being run fails here. Makes every course, so it
 * is the slow kind of test.
 */
import { readFileSync, statSync } from 'node:fs';
import { PNG } from 'pngjs';
import { describe, expect, it } from 'vitest';
import { TILE, layoutOf } from '../src/arena';
import { COURSES } from '../src/course';
import { MINI_COLOUR, PREVIEW, holeLength, paintPreview, slugOf, type CoursePreview } from '../src/previews';
import previews from '../src/previews.json';

const DATA = previews as Record<string, CoursePreview>;

/** The most the nine pictures of one course may weigh, as sent: a step to a course fetches them together. */
const MOST_A_COURSE = 40_000;
/** And all of them: the build's whole share of pictures. */
const MOST_IN_ALL = 200_000;

const file = (slug: string, n: number) => `public/previews/${slug}/${n}.png`;

/** The colour of the pixel at a point on the ground of a minigolf preview, as bytes. */
function pixelAt(layout: ReturnType<typeof layoutOf>, x: number, y: number) {
  const p = paintPreview(layout);
  const k = p.width / layout.cols;
  const px = Math.floor(((x - layout.originX) / TILE) * k);
  const py = Math.floor(((layout.originY + layout.rows * TILE - y) / TILE) * k);
  const o = (py * p.width + px) * 4;
  return [...p.pixels.subarray(o, o + 4)];
}
const centre = (layout: ReturnType<typeof layoutOf>, col: number, rowFromTop: number) => ({
  x: layout.originX + (col + 0.5) * TILE,
  y: layout.originY + (layout.rows - rowFromTop - 0.5) * TILE,
});

describe('the minigolf painter', () => {
  const MAP = ['#######', '#..C..#', '#..o..#', '#~~.ss#', '#..k..#', '#..T..#', '#######'];
  const hole = layoutOf(MAP);

  it('paints a tile a whole number of pixels, the hole fitted to the box', () => {
    const p = paintPreview(hole);
    expect(p.width % hole.cols).toBe(0);
    expect(p.width / hole.cols).toBe(Math.floor(PREVIEW.box / Math.max(hole.cols, hole.rows)));
    expect(p.height).toBe((p.width / hole.cols) * hole.rows);
  });

  it('draws the rail, the water, the sand, a post, a kicker, the cup and the tee each in its own colour', () => {
    const at = (col: number, row: number) => {
      const { x, y } = centre(hole, col, row);
      return pixelAt(hole, x, y).slice(0, 3);
    };
    expect(at(0, 3), 'the rail').toEqual([...MINI_COLOUR.railCap]);
    expect(at(1, 3), 'water').toEqual([...MINI_COLOUR.water]);
    expect(at(4, 3), 'sand').toEqual([...MINI_COLOUR.sand]);
    expect(at(3, 2), 'a post').toEqual([...MINI_COLOUR.post]);
    expect(at(3, 4), 'a kicker').toEqual([...MINI_COLOUR.kicker]);
    expect(at(3, 1), 'the cup').toEqual([...MINI_COLOUR.cup]);
    expect(at(3, 5), 'the tee').toEqual([...MINI_COLOUR.tee]);
    expect([MINI_COLOUR.grass, MINI_COLOUR.mown].map((c) => [...c])).toContainEqual(at(1, 1));
  });

  it('leaves off the course clear, and paints a raised step lighter than the grass', () => {
    const odd = layoutOf(['  ###', '  #C#', '###.#', '#T.1#', '#####']);
    const { x, y } = centre(odd, 0, 0);
    expect(pixelAt(odd, x, y)[3], 'off the course').toBe(0);
    const step = centre(odd, 3, 3);
    expect(pixelAt(odd, step.x, step.y).slice(0, 3)).toEqual([...MINI_COLOUR.raised]);
  });

  it('paints a stream as water and a belt in its own grey, from the tiles the obstacles name', () => {
    const map = ['######', '#.C..#', '#....#', '#....#', '#.T..#', '######'];
    const layout = layoutOf(map);
    const t = (col: number, row: number) => (layout.rows - 1 - row) * layout.cols + col;
    const p = paintPreview(layout, new Set([t(1, 2)]), new Set([t(1, 2), t(3, 3)]));
    const k = p.width / layout.cols;
    const colour = (col: number, row: number) => {
      const o = ((row * k + Math.floor(k / 2)) * p.width + col * k + Math.floor(k / 2)) * 4;
      return [...p.pixels.subarray(o, o + 3)];
    };
    expect(colour(1, 2), 'a stream').toEqual([...MINI_COLOUR.water]);
    expect(colour(3, 3), 'a belt').toEqual([...MINI_COLOUR.belt]);
  });
});

describe('the course previews', () => {
  it('has an entry and nine pictures for every course, and none for a course that is not there', () => {
    expect(Object.keys(DATA).sort()).toEqual(COURSES.map((c) => c.name).sort());
    for (const c of COURSES)
      for (let n = 1; n <= c.summary.holes; n++) expect(statSync(file(DATA[c.name].slug, n)).size).toBeGreaterThan(0);
  });

  it('weighs under the ceilings, a course and in all', () => {
    let all = 0;
    for (const c of COURSES) {
      let course = 0;
      for (let n = 1; n <= c.summary.holes; n++) course += statSync(file(DATA[c.name].slug, n)).size;
      expect(course, c.name).toBeLessThan(MOST_A_COURSE);
      all += course;
    }
    expect(all).toBeLessThan(MOST_IN_ALL);
  });

  it("names a course's pictures by the course, in a form a file and a URL take", () => {
    expect(slugOf('The Old Course')).toBe('the-old-course');
    expect(slugOf("St. Andrew's!")).toBe('st-andrew-s');
    for (const c of COURSES) expect(DATA[c.name].slug).toBe(slugOf(c.name));
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
    it(`${course.name}: each hole's picture is the painter's, and the holes are the course's`, async () => {
      const { Obstacles } = await import('../src/obstacles');
      const entry = DATA[course.name];
      const holes = course.holes;
      expect(entry.holes.map((h) => [h.name, h.par])).toEqual(holes.map((h) => [h.name, h.par]));
      expect(entry.yards).toBe(entry.holes.reduce((a, h) => a + h.yards, 0));
      for (const [k, def] of holes.entries()) {
        const layout = layoutOf(def.map, def.terrain, def.way);
        expect(entry.holes[k].yards, def.name).toBe(holeLength(layout));
        const obstacles = new Obstacles(def.obstacles ?? [], layout);
        const painted = paintPreview(layout, obstacles.streamed, obstacles.belted);
        expect([entry.holes[k].width, entry.holes[k].height], def.name).toEqual([painted.width, painted.height]);
        const png = PNG.sync.read(readFileSync(file(entry.slug, k + 1)));
        expect([png.width, png.height]).toEqual([painted.width, painted.height]);
        expect(Buffer.from(png.data).equals(Buffer.from(painted.pixels.buffer)), `${def.name}: the same pixels`).toBe(
          true,
        );
      }
    });
  }
});
