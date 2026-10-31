/**
 * Neon Park: a course of golf in the Future (`biome: 'future'`). Nine holes made by `golfHole` from a spec each, as The Links are, and
 * never drawn by hand; until its holes land this is the course's place and shape with none in it, so the seed search can be
 * built against it.
 *
 * Made when first asked for and not as the page loads, as The Links are.
 */
import type { HoleDef } from './course';
import { golfHole, type GolfSpec } from './golf';

export const NEON_PARK_SPECS: readonly GolfSpec[] = [];

let made: readonly HoleDef[] | undefined;

/** The holes of Neon Park, made the first time they are asked for and no oftener. */
export function neonPark(): readonly HoleDef[] {
  return (made ??= NEON_PARK_SPECS.map((spec) => golfHole(spec)));
}
