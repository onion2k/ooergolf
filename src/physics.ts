/**
 * The physics is a package of its own, artshape-physics, which knows nothing
 * of balls or courses: a body is a ball of some radius, the rock is a grid of
 * tiles, and what falls into a hole is reported back. This is the game's
 * side of it: a world made from a hole's layout. Everything in the game that
 * steps or reads bodies imports from here, so the package stays behind one
 * door, and a change it needs goes in its own repo with a version bump here.
 */
import { World, type WorldOptions } from 'artshape-physics/world';
import { BODY_CAPACITY, BOTTOM, KIND_RADIUS, ROLL, TILE, type Layout } from './arena';
import type { Random } from './random';

export { World, type Belt, type Pusher } from 'artshape-physics/world';

/** The physics' fixed step, and its gravity: the package's defaults, which the game steps and predicts by. */
export const PHYSICS = { step: 1 / 120, gravity: 70 } as const;

/** The cup, as the physics sees it: a hole in the floor this wide and this deep. */
export interface Cup {
  radius: number;
  depth: number;
}

/**
 * A world for a hole: its grid, its floor's heights and the bottom a ball
 * falls out of into water, its cup, the radius of each kind, how a ball
 * rolls, and chance from the game's own source.
 */
export function makeWorld(layout: Layout, cup: Cup, random: Random): World {
  const { cols, rows, originX, originY, solid } = layout;
  const options: WorldOptions = {
    capacity: BODY_CAPACITY,
    grid: { cols, rows, originX, originY, tile: TILE },
    solid,
    floor: layout.floor,
    bottom: BOTTOM,
    radii: KIND_RADIUS,
    holes: [{ x: layout.cup.x, y: layout.cup.y, radius: cup.radius, depth: cup.depth }],
    random,
    tuning: { floorDrag: ROLL.floorDrag },
  };
  return new World(options);
}
