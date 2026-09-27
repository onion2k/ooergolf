/**
 * What a model is made of, and how it reaches the renderer. A part is one
 * mesh in one colour, with a pattern if it has one; a model is the parts that
 * stand still in its own frame and the parts the game moves. Nothing here
 * knows where a model is: `group` turns a part and the placements the game
 * writes into a `GameGroup`, so the scene places a model as it places the
 * ball. Without it every model would carry its own idea of how it is drawn.
 */
import type { GameGroup } from 'artshape-render/game/renderer';
import { PATTERN_STRIDE } from 'artshape-render/game/renderer';
import type { Mesh } from 'artshape-render/mesh/types';

export type V3 = [number, number, number];
export type Colour = readonly [number, number, number];
/** A colour and a roughness: 0 a mirror, 1 chalk. */
export type Material = readonly [number, number, number, number];

/** The renderer's patterns, by the number its shader knows each by. */
export const PATTERN = { swirl: 1, bands: 2, marbling: 3, speckle: 4 } as const;

/**
 * A second colour mixed into a part, drawn from where on the part a fragment
 * is, so it turns with it: `scale` is how many times it repeats a world unit
 * of the mesh, and `seed` shifts it. Bands run along the mesh's own z.
 */
export interface Pattern {
  kind: (typeof PATTERN)[keyof typeof PATTERN];
  scale: number;
  seed: number;
  second: Colour;
}

/** One mesh in one colour: what a group of the renderer draws. */
export interface Part {
  name: string;
  mesh: Mesh;
  material: Material;
  pattern?: Pattern;
}

/**
 * A model: the parts that stand still in its own frame, and the parts the
 * game moves or turns each frame on top of that, which each kind of model
 * says how to place.
 */
export interface Model {
  name: string;
  parts: Part[];
  moving: Part[];
}

/**
 * A group of the renderer for one part, placed by `matrices`, `count` of them
 * live. A patterned part writes its pattern for every placement, each with a
 * seed of its own, so a row of bunkers is not speckled alike.
 */
export function group(part: Part, matrices: Float32Array, count?: number): GameGroup {
  const [r, g, b, roughness] = part.material;
  const out: GameGroup = { mesh: part.mesh, matrices, albedo: [r, g, b], roughness };
  if (count !== undefined) out.count = count;
  const p = part.pattern;
  if (p) {
    const n = matrices.length / 16;
    const patterns = new Float32Array(n * PATTERN_STRIDE);
    for (let k = 0; k < n; k++)
      patterns.set([p.kind, p.scale, (p.seed + k * 0.618034) % 1, 0, ...p.second, 0], k * PATTERN_STRIDE);
    out.patterns = patterns;
  }
  return out;
}

/** The box round some parts, in their own frame. */
export function bounds(parts: readonly Part[]): { min: V3; max: V3 } {
  const min: V3 = [Infinity, Infinity, Infinity],
    max: V3 = [-Infinity, -Infinity, -Infinity];
  for (const part of parts) {
    const p = part.mesh.positions;
    for (let i = 0; i < p.length; i += 3)
      for (let a = 0; a < 3; a++) {
        min[a] = Math.min(min[a], p[i + a]);
        max[a] = Math.max(max[a], p[i + a]);
      }
  }
  return { min, max };
}

/** How many triangles a model draws, still and moving. */
export function triangles(model: Model): number {
  let n = 0;
  for (const part of [...model.parts, ...model.moving]) n += part.mesh.indices.length / 3;
  return n;
}

/** A material from a colour and a roughness. */
export const matte = (c: Colour, roughness: number): Material => [c[0], c[1], c[2], roughness];
