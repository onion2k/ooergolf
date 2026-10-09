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
import { bounds } from '../src/models';
import { groundZOf, hillsTop } from '../src/hills';
import { BEYOND_MODELS, ROUGH_DEPTH, SCENERY_MODELS, boxOf, sunFitOf } from '../src/scene';
import { BEYOND, BROADLEAF, SCALE, beyond, scatter } from '../src/scenery';
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

  /** How high a piece stands, its model's top at its size, from the rough it stands on, in the models the scene draws it as. */
  const topOf = (
    p: { kind: string; scale: number; variant: number; x: number; y: number },
    models: typeof SCENERY_MODELS,
    ground: (x: number, y: number) => number,
  ) => {
    if (p.kind === 'flowers') return 0;
    const kind = (p.kind === 'bush' && p.variant === 1 ? 'fern' : p.kind) as keyof typeof models;
    return ground(p.x, p.y) + bounds(models[kind][0].parts).max[2] * p.scale;
  };

  it('is tall enough for the woods’ great broadleaves, 1.9 times the size of a wood’s own, which stand taller than the box was drawn for', () => {
    // a broadleaf 12 tall at 1.25 of its size, 1.4 of that by the hash and 1.9 of that near the course, is 40 tall: a top
    // cut off the sun's map casts no shadow, and the sun is low enough now (46 degrees) for a shadow to be as long as the tree
    let tallest = 0,
      counted = 0;
    for (const hole of [COURSES[0].holes[0], COURSES[1].holes[2], links()[0], links()[1], links()[4]]) {
      const l = layoutOf(hole.map, hole.terrain);
      const box = boxOf(l);
      const models = l.golf ? BEYOND_MODELS : SCENERY_MODELS;
      // a wood past a hole of golf stands on its hills, not on the rough three under the grass
      const ground = l.golf ? groundZOf(l, hole.name) : () => -ROUGH_DEPTH;
      for (const p of [...scatter(l, hole.name), ...beyond(l, hole.name)]) {
        const top = topOf(p, models, ground);
        tallest = Math.max(tallest, top);
        expect(top, `${hole.name}: a ${p.kind}`).toBeLessThanOrEqual(box.max[2]);
        counted++;
      }
    }
    // the tallest a piece can be, whatever the hash gives, and a check that found nothing passes in silence
    const most =
      -ROUGH_DEPTH +
      bounds(BEYOND_MODELS.broadleaf[0].parts).max[2] * (SCALE.least + SCALE.spread) * BROADLEAF.most * BROADLEAF.big;
    expect(SHADOW.top).toBeGreaterThanOrEqual(most);
    // and on a hole of golf the box is that much higher again, as high as the hills lift a wood at the edge of its reach
    const golf = layoutOf(links()[0].map, links()[0].terrain);
    expect(boxOf(golf).max[2]).toBeGreaterThanOrEqual(most + 3 + hillsTop(BEYOND.reach));
    expect(counted).toBeGreaterThan(200);
    expect(tallest).toBeGreaterThan(10);
  });

  it('is fitted to the view on a hole of golf, a square of its reach, and left on the whole box on minigolf', () => {
    const golf = layoutOf(links()[0].map, links()[0].terrain);
    expect(sunFitOf(golf)).toEqual({ reach: SHADOW.reach, fade: SHADOW.fade });
    expect(sunFitOf(layoutOf(COURSES[0].holes[0].map))).toBeUndefined();
  });
});
