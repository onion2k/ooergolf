/**
 * A course's preview on the start screen: a hole of it painted from above, as the hole map is, with the holes' names and
 * lengths beside it. A golf course takes up to a second to make, so nothing here is worked out as a player steps through the
 * courses: `scripts/make-previews.ts` makes every course once, paints each preview and writes the pictures to
 * `public/previews/` and the figures to `src/previews.json`, both committed, and the start screen reads them. This file is
 * the arithmetic both share, so a test can hold the generated data to the courses as they are.
 */
import type { Layout } from './arena';
import type { MapSize } from './holemap';

/** How big a preview is: the hole fitted to a box this many pixels a side, and which hole of a course it is unless the course says. */
export const PREVIEW = { box: 180, hole: 0 } as const;

/** A course's preview as the generated data has it. */
export interface CoursePreview {
  /** The picture's file name under `public/previews/`, without its `.png`. */
  slug: string;
  width: number;
  height: number;
  /** Each hole's name and length in yards, in the course's order; the names are what the save keeps a best score by. */
  holes: { name: string; yards: number }[];
  /** The course's length: its holes' lengths added. */
  yards: number;
}

/** A course's name as a file name: lower case, the words joined by hyphens, nothing else. */
export function slugOf(name: string): string {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '');
}

/**
 * The size a preview is painted at: the box round the hole's ground fitted to `box` pixels a side at its own shape. Unlike the
 * hole map's size it is not held to a pixel a yard, since a hole of minigolf is twenty yards across and would be a thumbnail.
 */
export function previewSize(layout: Layout, box = PREVIEW.box): MapSize {
  const { minX, maxX, minY, maxY } = layout.bounds;
  const w = Math.max(1, maxX - minX),
    h = Math.max(1, maxY - minY);
  const scale = Math.min(box / w, box / h);
  return {
    width: Math.max(1, Math.floor(w * scale)),
    height: Math.max(1, Math.floor(h * scale)),
    scale,
    west: minX,
    north: maxY,
  };
}

/**
 * How long a hole is, in yards: along its line of play where the generator gave it one (tee, corner, cup), which is what a
 * card says of a dogleg, and the straight line from tee to cup on a hole drawn by hand. A unit is a yard on golf; a hole of
 * minigolf is measured the same way, since its tiles are in the same units.
 */
export function holeLength(layout: Layout): number {
  const way = layout.way;
  if (way && way.length > 1) {
    let sum = 0;
    for (let k = 1; k < way.length; k++) sum += Math.hypot(way[k][0] - way[k - 1][0], way[k][1] - way[k - 1][1]);
    return Math.round(sum);
  }
  return Math.round(Math.hypot(layout.cup.x - layout.tee.x, layout.cup.y - layout.tee.y));
}
