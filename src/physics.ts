/**
 * The physics is a package of its own, artshape-physics, which knows nothing
 * of balls or courses: a body is a ball of some radius, the rock is a grid of
 * tiles, and what falls into a hole is reported back. This is the game's
 * side of it: a world made from a hole's layout. Everything in the game that
 * steps or reads bodies imports from here, so the package stays behind one
 * door, and a change it needs goes in its own repo with a version bump here.
 */
import { heightAt as terrainHeightAt, slopeAt as terrainSlopeAt, terrainProblem } from 'artshape-physics/terrain';
import { World, type WorldOptions } from 'artshape-physics/world';
import { BODY_CAPACITY, BOTTOM, BOUNCE, BUMPER, KIND_RADIUS, ROLL, SAND, TILE, heightAt, type Layout } from './arena';
import type { Random } from './random';
import { LIE, SURFACES } from './surfaces';

export { World, type Belt, type Pusher } from 'artshape-physics/world';

/**
 * What the physics refuses in a hole's slopes, or null: its own rules, with
 * the hole's grid, its biggest ball and its cup. Tiles side by side more than
 * half a tile apart, rock and all; a cup may stand on any slope, its rim
 * following the ground, since v0.7.0. A world built on a refused terrain
 * throws the same; this asks without building one.
 */
export function terrainRefusal(layout: Layout, cup: Cup): string | null {
  return terrainProblem(layout.terrain, gridOf(layout), Math.max(...KIND_RADIUS), [
    { x: layout.cup.x, y: layout.cup.y, radius: cup.radius, depth: cup.depth },
  ]);
}

/** The physics' own terrain at a point, without the steps: its height, and its slope across X and along Y. */
export function physicsTerrain(layout: Layout, x: number, y: number): { height: number; slope: [number, number] } {
  const grid = gridOf(layout);
  return { height: terrainHeightAt(layout.terrain, grid, x, y), slope: terrainSlopeAt(layout.terrain, grid, x, y) };
}

/** A hole's grid as the physics takes it. */
function gridOf(layout: Layout) {
  return { cols: layout.cols, rows: layout.rows, originX: layout.originX, originY: layout.originY, tile: TILE };
}

/** The physics' fixed step, and its gravity: the package's defaults, which the game steps and predicts by. */
export const PHYSICS = { step: 1 / 120, gravity: 70 } as const;

/** The cup, as the physics sees it: a hole in the floor this wide and this deep, with a rim, and how hard it pulls. */
export interface Cup {
  radius: number;
  depth: number;
  rim: number;
  pull: number;
}

/** The surfaces by index: the green, a belt, and sand; and on a golf hole, after them, its tee, fairway, rough and green. */
const BELT = 1,
  SAND_SURFACE = 2;
/** Which of the world's surfaces each golf `LIE` is rolled on, from the green's index for none: sand is the sand's. */
const GOLF_SURFACE: readonly number[] = [0, 3, 4, 5, 6, SAND_SURFACE];
const GOLF_LIES = [LIE.tee, LIE.fairway, LIE.rough, LIE.green] as const;

/** The cup's index among the world's holes: the only one, so what goes down a hole and not out of the bottom is holed. */
export const THE_CUP = 0;

/**
 * A world for a hole: its grid, its floor's heights and the bottom a ball
 * falls out of into water, its cup, the radius of each kind, how a ball
 * rolls on the green and bounces off the rail, and chance from the game's
 * own source.
 *
 * And four things a golf ball needs that a heap of coins does not: a ball
 * that bounces is put to sleep only where it lies, never in the air at the
 * top of a bounce; nor while it is going faster than 2, as one running round
 * the inside of the cup's rim was, a lap as long as the physics' sleep
 * window, and hung in its mouth; it banks off a rail of tiles as off one
 * flat wall; and a fast one is looked at every half radius it goes, so no
 * shot passes through the rail or a blade.
 */
export function makeWorld(layout: Layout, cup: Cup, random: Random, belted: ReadonlySet<number> = new Set()): World {
  const { cols, rows, solid } = layout;
  // a belt carries what lies on it at its own speed, and the green's steady slowing would hold it back to a third of it
  const surface = new Uint8Array(cols * rows);
  for (let t = 0; t < cols * rows; t++) {
    if (layout.sand[t]) surface[t] = SAND_SURFACE;
    // a golf hole's ground rolls a ball as its kind does, and a minigolf hole is given none of it
    else if (layout.golf) surface[t] = GOLF_SURFACE[layout.lie[t]];
  }
  for (const t of belted) surface[t] = BELT;
  const options: WorldOptions = {
    capacity: BODY_CAPACITY,
    grid: gridOf(layout),
    solid,
    floor: layout.floor,
    // the ground's slopes, on a hole that has any: a hole that is flat is given none, and is stepped exactly as it always
    // was, where a terrain of noughts would take the sloping path to the same place
    ...(layout.terrain.some((h) => h !== 0) ? { terrain: layout.terrain } : {}),
    bottom: BOTTOM,
    radii: KIND_RADIUS,
    holes: [{ x: layout.cup.x, y: layout.cup.y, radius: cup.radius, depth: cup.depth, rim: cup.rim, pull: cup.pull }],
    // the green, which is all else a ball rolls on: water is a floor below the bottom, and the rest is rock
    surface,
    surfaces: [
      { drag: 0, roll: ROLL.roll },
      { drag: 0, roll: 0 },
      { drag: 0, roll: SAND.roll },
      ...(layout.golf ? GOLF_LIES.map((k) => ({ drag: 0, roll: SURFACES[k].roll })) : []),
    ],
    random,
    // a step is met as a change of floor and not as a ledge with an edge: with v0.8.0's edges a ball climbs a riser only
    // with speed, and Up and Over's stairs took two strokes more on the median
    tuning: {
      wallRestitution: BOUNCE.rail,
      sleepInAir: false,
      sleepSpeed: 2,
      smoothWalls: true,
      travel: 0.5,
      stepEdges: false,
    },
  };
  const world = new World(options);
  // the posts, which never move: each from below everything up to its top, which is a floor to what lands on it, and
  // stands as high above the ground it is on as a post is tall
  world.bumpers = layout.bumpers.map((p) => ({
    x: p.x,
    y: p.y,
    radius: BUMPER.radius,
    top: heightAt(layout, p.x, p.y) + BUMPER.height,
    restitution: BUMPER.restitution,
  }));
  return world;
}
