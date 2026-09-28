/**
 * The physics is a package of its own, artshape-physics, which knows nothing
 * of balls or courses: a body is a ball of some radius, the rock is a grid of
 * tiles, and what falls into a hole is reported back. This is the game's
 * side of it: a world made from a hole's layout. Everything in the game that
 * steps or reads bodies imports from here, so the package stays behind one
 * door, and a change it needs goes in its own repo with a version bump here.
 */
import { World, type WorldOptions } from 'artshape-physics/world';
import { BODY_CAPACITY, BOTTOM, BOUNCE, KIND_RADIUS, ROLL, TILE, type Layout } from './arena';
import type { Random } from './random';

export { World, type Belt, type Pusher } from 'artshape-physics/world';

/** The physics' fixed step, and its gravity: the package's defaults, which the game steps and predicts by. */
export const PHYSICS = { step: 1 / 120, gravity: 70 } as const;

/** The cup, as the physics sees it: a hole in the floor this wide and this deep, with a rim, and how hard it pulls. */
export interface Cup {
  radius: number;
  depth: number;
  rim: number;
  pull: number;
}

/** The surfaces by index: the green, and a belt. */
const BELT = 1;

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
  const { cols, rows, originX, originY, solid } = layout;
  // a belt carries what lies on it at its own speed, and the green's steady slowing would hold it back to a third of it
  const surface = new Uint8Array(cols * rows);
  for (const t of belted) surface[t] = BELT;
  const options: WorldOptions = {
    capacity: BODY_CAPACITY,
    grid: { cols, rows, originX, originY, tile: TILE },
    solid,
    floor: layout.floor,
    bottom: BOTTOM,
    radii: KIND_RADIUS,
    holes: [{ x: layout.cup.x, y: layout.cup.y, radius: cup.radius, depth: cup.depth, rim: cup.rim, pull: cup.pull }],
    // the green, which is all else a ball rolls on: water is a floor below the bottom, and the rest is rock
    surface,
    surfaces: [
      { drag: 0, roll: ROLL.roll },
      { drag: 0, roll: 0 },
    ],
    random,
    tuning: { wallRestitution: BOUNCE.rail, sleepInAir: false, sleepSpeed: 2, smoothWalls: true, travel: 0.5 },
  };
  return new World(options);
}
