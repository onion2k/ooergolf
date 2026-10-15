/**
 * The start screen's course previews, made again: every course is made, one hole of each (`Course.preview`, the first unless
 * the course says) is painted from above by the hole map's painter at `PREVIEW.box` pixels a side, and written to
 * `public/previews/<slug>.png`; and `src/previews.json` gets each course's picture size and its holes' names and lengths,
 * which the picker shows and sums a best round by. Run by hand, `npm run previews`, whenever a course changes:
 * `test/previews.test.ts` fails until it is. Both outputs are committed and never edited.
 */
import { mkdirSync, writeFileSync } from 'node:fs';
import { PNG } from 'pngjs';
import { layoutOf } from '../src/arena';
import { COURSES } from '../src/course';
import { paintMap } from '../src/holemap';
import { Obstacles } from '../src/obstacles';
import { holeLength, previewSize, slugOf, type CoursePreview } from '../src/previews';

mkdirSync('public/previews', { recursive: true });
const data: Record<string, CoursePreview> = {};
let total = 0;
for (const course of COURSES) {
  const began = performance.now();
  const holes = course.holes;
  const which = course.preview ?? 0;
  const def = holes[which];
  const layout = layoutOf(def.map, def.terrain, def.way);
  const size = previewSize(layout);
  const pixels = new Uint8ClampedArray(size.width * size.height * 4);
  // a stream is water to the eye, as it is on the hole map
  paintMap(layout, size, pixels, new Obstacles(def.obstacles ?? [], layout).streamed);
  const png = new PNG({ width: size.width, height: size.height });
  png.data = Buffer.from(pixels.buffer);
  const bytes = PNG.sync.write(png);
  const slug = slugOf(course.name);
  writeFileSync(`public/previews/${slug}.png`, bytes);
  const every = holes.map((h) => ({ name: h.name, yards: holeLength(layoutOf(h.map, h.terrain, h.way)) }));
  data[course.name] = {
    slug,
    width: size.width,
    height: size.height,
    holes: every,
    yards: every.reduce((a, h) => a + h.yards, 0),
  };
  total += bytes.length;
  console.log(
    `${course.name}: hole ${which + 1} ${size.width} by ${size.height}, ${bytes.length} bytes, ${data[course.name].yards} yards, in ${(performance.now() - began).toFixed(0)} ms`,
  );
}
writeFileSync('src/previews.json', JSON.stringify(data, null, 2) + '\n');
console.log(`${COURSES.length} previews, ${total} bytes`);
