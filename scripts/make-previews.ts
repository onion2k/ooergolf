/**
 * The course card's strips made again: every course is made, each of its holes painted from above (`paintPreview`: a golf
 * hole by the hole map's painter, a hole of minigolf by its own) and written to `public/previews/<slug>/<n>.png`, and
 * `src/previews.json` gets each course's holes' names, pars, lengths and picture sizes, which the card shows and sums a best
 * round by. Run by hand, `npm run previews`, whenever a course changes: `test/previews.test.ts` fails until it is. Both
 * outputs are committed and never edited; the folder is emptied first, so a hole gone takes its picture with it.
 */
import { mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { PNG } from 'pngjs';
import { layoutOf } from '../src/arena';
import { COURSES } from '../src/course';
import { Obstacles } from '../src/obstacles';
import { holeLength, paintPreview, slugOf, type CoursePreview } from '../src/previews';

rmSync('public/previews', { recursive: true, force: true });
const data: Record<string, CoursePreview> = {};
let total = 0;
for (const course of COURSES) {
  const began = performance.now();
  const slug = slugOf(course.name);
  mkdirSync(`public/previews/${slug}`, { recursive: true });
  let bytes = 0;
  const holes = course.holes.map((def, k) => {
    const layout = layoutOf(def.map, def.terrain, def.way, def.biome);
    const obstacles = new Obstacles(def.obstacles ?? [], layout);
    const painted = paintPreview(layout, obstacles.streamed, obstacles.belted);
    const png = new PNG({ width: painted.width, height: painted.height });
    png.data = Buffer.from(painted.pixels.buffer);
    const file = PNG.sync.write(png);
    writeFileSync(`public/previews/${slug}/${k + 1}.png`, file);
    bytes += file.length;
    return { name: def.name, par: def.par, yards: holeLength(layout), width: painted.width, height: painted.height };
  });
  data[course.name] = { slug, holes, yards: holes.reduce((a, h) => a + h.yards, 0) };
  total += bytes;
  console.log(
    `${course.name}: ${holes.length} holes, ${bytes} bytes, ${data[course.name].yards} yards, in ${(performance.now() - began).toFixed(0)} ms`,
  );
}
writeFileSync('src/previews.json', JSON.stringify(data, null, 2) + '\n');
console.log(`${COURSES.length} courses, ${total} bytes`);
