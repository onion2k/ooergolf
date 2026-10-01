/**
 * The arrows over a putting green, which show a player which way the ground leans before a putt is struck: where each
 * stands, which way it points (downhill, the way a ball is carried), how long it is for how steep the ground is, how it
 * lies on the slope, and when the page shows them. Headless: the scene's own placements, read as numbers. Without these
 * an arrow could point uphill and tell a player to aim the wrong way, or stand in the turf and not be seen.
 */
import { describe, expect, it } from 'vitest';
import type { Wind } from 'artshape-render/game/grass';
import { TILE, heightAt, layoutOf, slopeAt, tileAt, type Layout } from '../src/arena';
import { GREEN, greenArrows } from '../src/green';
import { COURSES } from '../src/course';
import { ARROWS, RING_LIFT, Scene, arrowMarks } from '../src/scene';

const WIND: Wind = { direction: [1, 0], strength: 0.5, gustSize: 8, gustSpeed: 5 };
const COLS = 15,
  ROWS = 16;
/** A golf hole with a round-ish green in the middle of rough, a tee's box at the foot and the cup in the green. */
function map(): string[] {
  const grid = Array.from({ length: ROWS }, (_, r) =>
    Array.from({ length: COLS }, (_, c) => {
      if (r === 0 || r === ROWS - 1 || c === 0 || c === COLS - 1) return '#';
      if (r === ROWS - 4) return c === 7 ? 'T' : c === 6 || c === 8 ? 't' : 'r';
      if (r === 6 && c === 7) return 'C';
      if (r >= 4 && r <= 8 && c >= 4 && c <= 10) return 'g';
      if (r >= 3 && r <= 9 && c >= 3 && c <= 11) return 'c';
      return 'r';
    }),
  );
  return grid.map((r) => r.join(''));
}
/** Ground that rises toward the east by `slope` of a unit run: the green leans west, so a ball is carried west. */
function ramp(slope: number): Float32Array {
  return Float32Array.from({ length: COLS * ROWS }, (_, k) => slope * TILE * (k % COLS));
}
const tilted = (slope: number) => layoutOf(map(), ramp(slope));
const LEVEL = layoutOf(map());

/** The scene of a hole and the arrows' entry: the one among what moves that has one placement for each arrow. */
function sceneOf(l: Layout) {
  const scene = new Scene();
  scene.static(l, 'arrows');
  const groups = scene.dynamic(undefined, l, 'arrows', WIND);
  return { scene, groups };
}

describe('where the arrows stand and which way they point', () => {
  const l = tilted(0.03);
  const marks = arrowMarks(l);

  it('is one arrow for each tile of green that leans, as green.ts says, each in the middle of its tile', () => {
    const arrows = greenArrows(l);
    expect(marks.length).toBe(arrows.length);
    expect(marks.length).toBeGreaterThan(10);
    marks.forEach((m, k) => {
      expect([m.x, m.y]).toEqual([arrows[k].x, arrows[k].y]);
      const t = tileAt(l, m.x, m.y);
      expect(l.lie[t], 'on the green').toBe(4);
    });
  });

  it('points downhill, the way a ball is carried: against the way the ground climbs', () => {
    for (const m of marks) {
      const [sx, sy] = slopeAt(l, m.x, m.y);
      const along = Math.cos(m.yaw) * sx + Math.sin(m.yaw) * sy;
      expect(along, 'against the slope').toBeLessThan(0);
      // and straight down it, to the angle: the ground leans west and the arrow points west
      expect(Math.cos(m.yaw)).toBeLessThan(-0.99);
    }
  });

  it('is longer the steeper the ground, from a short arrow for a hair of slope to the longest at the steepest green', () => {
    const length = (slope: number) => arrowMarks(tilted(slope))[0].length;
    expect(length(0.01)).toBeLessThan(length(0.03));
    expect(length(0.03)).toBeLessThan(length(0.045));
    expect(length(0.045)).toBeLessThan(length(GREEN.steepest) + 1e-9);
    expect(length(GREEN.steepest)).toBeCloseTo(ARROWS.longest, 1);
    // a steeper ground than a green may have is no longer than the longest
    expect(length(0.2)).toBeLessThanOrEqual(ARROWS.longest + 1e-9);
    expect(length(0.003)).toBeGreaterThanOrEqual(ARROWS.shortest - 1e-9);
    // never as long as a tile is wide, so no two arrows touch
    expect(ARROWS.longest).toBeLessThan(TILE);
  });

  it('has none on a level green, on the rough or first cut round it, or on a hole of minigolf or The Range', () => {
    expect(arrowMarks(LEVEL)).toEqual([]);
    const l2 = tilted(0.03);
    for (const m of arrowMarks(l2)) expect(l2.lie[tileAt(l2, m.x, m.y)]).toBe(4);
    // every hole of the minigolf's hand-drawn courses and of The Range, which has no contour
    for (const course of COURSES.filter((c) => ['The Meadow', 'The Hills', 'The Downs', 'The Range'].includes(c.name)))
      for (const h of course.holes) expect(arrowMarks(layoutOf(h.map, h.terrain)), h.name).toEqual([]);
  });
});

describe('how an arrow lies on the green', () => {
  it('is on the slope, in the ground and not in it: its middle above the ground, its axes along the slope', () => {
    const l = tilted(0.04);
    const { scene, groups } = sceneOf(l);
    scene.setArrows(true);
    const entry = scene.writeMoving(0).find((m) => m.count === arrowMarks(l).length && m.matrices.length > 16)!;
    expect(entry).toBeDefined();
    const marks = arrowMarks(l);
    marks.forEach((m, k) => {
      const o = k * 16;
      const z = entry.matrices[o + 14];
      expect(z, 'above the ground').toBeGreaterThanOrEqual(heightAt(l, m.x, m.y) + RING_LIFT * 0.5);
      expect(z - heightAt(l, m.x, m.y), 'not far above it').toBeLessThan(0.5);
      // the third axis is the ground's upright: it leans against the slope
      const nz = entry.matrices[o + 10];
      expect(nz).toBeGreaterThan(0.99);
      expect(
        entry.matrices[o + 8],
        'the upright leans away from the rise (west to east rising: up is tipped west)',
      ).toBeLessThan(0);
    });
    expect(groups.length).toBeGreaterThan(0);
  });
});

describe('the arrows in the scene', () => {
  it('is one more group on a hole with a leaning green than on the same hole level, and nothing else changes', () => {
    const hill = sceneOf(tilted(0.03)).groups.length;
    const flat = sceneOf(LEVEL).groups.length;
    expect(hill).toBe(flat + 1);
  });

  it('is shown only when the page says so, all of them or none, and read back from what was written for drawing', () => {
    const l = tilted(0.03);
    const { scene } = sceneOf(l);
    const n = arrowMarks(l).length;
    scene.writeMoving(0);
    expect(scene.arrowsDrawn()).toEqual({ shown: false, count: 0 });
    scene.setArrows(true);
    scene.writeMoving(0);
    expect(scene.arrowsDrawn()).toEqual({ shown: true, count: n });
    scene.setArrows(false);
    scene.writeMoving(1);
    expect(scene.arrowsDrawn()).toEqual({ shown: false, count: 0 });
  });

  it('is nothing on a level hole: no group, none shown whatever the page says', () => {
    const { scene } = sceneOf(LEVEL);
    scene.setArrows(true);
    scene.writeMoving(0);
    expect(scene.arrowsDrawn()).toEqual({ shown: false, count: 0 });
  });

  it('makes nothing for a frame: the same buffer is written each time, and a new hole puts the arrows away', () => {
    const l = tilted(0.03);
    const { scene } = sceneOf(l);
    scene.setArrows(true);
    const a = scene.writeMoving(0).map((m) => m.matrices);
    const b = scene.writeMoving(5).map((m) => m.matrices);
    a.forEach((m, k) => expect(m).toBe(b[k]));
    // the next hole is not shown the arrows of the last
    scene.dynamic(undefined, LEVEL, 'next', WIND);
    scene.writeMoving(0);
    expect(scene.arrowsDrawn()).toEqual({ shown: false, count: 0 });
  });
});
