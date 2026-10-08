/**
 * Where the sun's shadow falls: a box round everything that casts or catches one, the hole and what stands round it, as
 * high as the tallest thing; and on a hole of golf, which is long, the map fitted to what the camera sees and not to all
 * of the hole, so its shadows are as sharp at the far end as at the tee. Without the box reaching them, the woods past a
 * golf hole and its trees' tops cast nothing, which is the inconsistency the user asked to be rid of.
 */
import { describe, expect, it } from 'vitest';
import { layoutOf } from '../src/arena';
import { COURSES } from '../src/course';
import { links } from '../src/links';
import { SHADOW } from '../src/look';
import { boxOf, sunFitOf } from '../src/scene';
import { beyond, scatter } from '../src/scenery';
import { TREE } from '../src/trees';

describe("the sun shadow's box", () => {
  it('holds every piece of scenery round a hole, minigolf and golf, and the tallest of them', () => {
    for (const hole of [COURSES[0].holes[0], links()[0], links()[1]]) {
      const l = layoutOf(hole.map, hole.terrain);
      const box = boxOf(l);
      for (const p of [...scatter(l, hole.name), ...beyond(l, hole.name)]) {
        expect(p.x).toBeGreaterThan(box.min[0]);
        expect(p.x).toBeLessThan(box.max[0]);
        expect(p.y).toBeGreaterThan(box.min[1]);
        expect(p.y).toBeLessThan(box.max[1]);
      }
      expect(box.max[2], "a golf tree's tip under its top").toBeGreaterThan(TREE.apex);
      expect(box.max[2]).toBeGreaterThanOrEqual(SHADOW.top);
    }
  });

  it('is fitted to the view on a hole of golf, a square of its reach, and left on the whole box on minigolf', () => {
    const golf = layoutOf(links()[0].map, links()[0].terrain);
    expect(sunFitOf(golf)).toEqual({ reach: SHADOW.reach, fade: SHADOW.fade });
    expect(sunFitOf(layoutOf(COURSES[0].holes[0].map))).toBeUndefined();
  });
});
