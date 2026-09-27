/**
 * The physics is a package of its own, artshape-physics, which knows nothing
 * of balls or courses: a body is a ball of some radius, the rock is a grid of
 * tiles, and what falls into a hole is reported back. This is the game's
 * side of it: a world made from this course. Everything in the game that
 * steps or reads bodies imports from here, so the package stays behind one
 * door, and a change it needs goes in its own repo with a version bump here.
 */
import { World, type WorldOptions } from 'artshape-physics/world';
import { BODY_CAPACITY, COLS, KIND_RADIUS, ORIGIN_X, ORIGIN_Y, ROWS, TILE } from './arena';
import type { Random } from './random';

export { World } from 'artshape-physics/world';

/** A world for this course: its grid, the radius of each kind, and chance from the game's own source. */
export function makeWorld(solid: Uint8Array, random: Random): World {
  const options: WorldOptions = {
    capacity: BODY_CAPACITY,
    grid: { cols: COLS, rows: ROWS, originX: ORIGIN_X, originY: ORIGIN_Y, tile: TILE },
    solid,
    radii: KIND_RADIUS,
    random,
  };
  return new World(options);
}
