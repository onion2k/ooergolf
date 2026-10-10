/**
 * What the banks' tint must leave alone. The tint is carried by the ground texture, a layer under the rough's and out of
 * bounds' colour on a golf hole, so every mesh stays the very bytes it was, and every colour but those two grounds' stays
 * what it was: a hole of minigolf is drawn exactly as before, and a golf hole's fairway, green, first cut, tee, sand, rail
 * and the rest are the same groups. Held by hash, written from the commit before the tint (a3c39d3).
 */
import { describe, expect, it } from 'vitest';
import type { GameGroup } from 'artshape-render/game/renderer';
import { layoutOf } from '../src/arena';
import { COURSES } from '../src/course';
import { PALETTE } from '../src/models/palette';
import { Scene } from '../src/scene';
import { groundOf } from '../src/ground';
import { BANK_TINT, tinted as tintedColour, valueOfStep } from '../src/tint';
import { steadyBytes } from './steady';

/** FNV-1a over bytes. */
function fnv(bytes: Uint8Array, x = 2166136261): number {
  for (let i = 0; i < bytes.length; i++) x = Math.imul(x ^ bytes[i], 16777619) >>> 0;
  return x;
}
/** An array's bytes, its floats steadied so a last bit a machine's maths differs in is not counted. */
const bytesOf = steadyBytes;

/** A group's mesh as bytes: where it is, which way it faces and how it is cut. */
const meshHash = (g: GameGroup) =>
  [g.mesh.positions, g.mesh.normals, g.mesh.indices].reduce((x, a) => fnv(bytesOf(a), x), 2166136261);
/** A group's look, as numbers: its colour, its roughness and its pattern and texture as the renderer is handed them. */
const lookOf = (g: GameGroup) =>
  JSON.stringify([g.albedo, g.roughness, g.patterns && [...g.patterns], g.texture && [...g.texture], g.count]);

/** How far a group's mesh reaches across, in its first coordinate. */
const extent = (g: GameGroup) => {
  const p = g.mesh.positions;
  let least = Infinity,
    most = -Infinity;
  for (let i = 0; i < p.length; i += 3) {
    least = Math.min(least, p[i]);
    most = Math.max(most, p[i]);
  }
  return most - least;
};

const same = (a?: readonly number[], b?: readonly number[]) => !!a && !!b && a.every((v, i) => v === b[i]);
/** The colours of the rough's and out of bounds' meshes, one for each step of the banks' tint, and the plain plane beyond the hole in the middle one's: the grounds a golf hole's tint is laid on. */
const STEPS = [
  ...Array.from({ length: BANK_TINT.steps }, (_, k) => tintedColour(PALETTE.playRough, valueOfStep(k))),
  ...Array.from({ length: BANK_TINT.steps }, (_, k) => tintedColour(PALETTE.oobGround, valueOfStep(k), true)),
];
/** Whether a group is one of those: the rough's, out of bounds' or the plain plane beyond the hole. */
const tinted = (g: GameGroup) => STEPS.some((c) => same(g.albedo, c.slice(0, 3)));

function drawn(course: string, hole: number) {
  const h = COURSES.find((c) => c.name === course)!.holes[hole];
  const layout = layoutOf(h.map, h.terrain);
  return { groups: new Scene().static(layout, h.name), layout };
}

/** The hashes of what a golf hole's static groups hold, written from a3c39d3; the meshes' written again on 10 October 2026 from d918912 unchanged, when they came to be taken over steadied bytes (`steady.ts`), since the raw bytes, written on a Mac, differed on Linux in a last bit of the minigolf ponds' stones. */
const AT_MAIN = {
  'The Meadow/0': { meshes: 2351288662, looks: 2200126830 },
  'The Pinball Shed/0': { meshes: 3193777536, looks: 3808239087 },
  'The Waterworks/0': { meshes: 1616752155, looks: 3638244723 },
  'The Links/0': { meshes: 3904169832, looks: 452526405, tintedMeshes: 4107679639 },
  'The Isles/1': { meshes: 3274599426, looks: 215032629, tintedMeshes: 1776637673 },
} as Record<string, { meshes: number; looks: number; tintedMeshes?: number }>;

describe('what the banks tint leaves as it was', () => {
  for (const key of Object.keys(AT_MAIN)) {
    const [course, hole] = key.split('/');
    const want = AT_MAIN[key];
    it(`${key}: every group but the rough's and out of bounds' is the bytes and the look it was`, () => {
      const { groups } = drawn(course, Number(hole));
      const kept = groups.filter((g) => !tinted(g) || want.tintedMeshes === undefined);
      const meshes = kept.reduce((x, g) => Math.imul(x ^ meshHash(g), 16777619) >>> 0, 2166136261);
      const looks = fnv(new TextEncoder().encode(kept.map(lookOf).join('\n')));
      if (process.env.TINT_PRINT) console.log(key, JSON.stringify({ meshes, looks }));
      expect(meshes, 'the meshes').toBe(want.meshes);
      expect(looks, 'the colours').toBe(want.looks);
    });
    if (want.tintedMeshes !== undefined)
      it(`${key}: the ground the tint is laid on is cut from the bytes it was: the rough's and out of bounds' meshes as the ground makes them, and the plane beyond the hole`, () => {
        const { groups, layout } = drawn(course, Number(hole));
        const golf = groundOf(layout).golf!;
        // the plane is the widest of the groups in the colour of out of bounds
        const plane = groups.filter((g) => same(g.albedo, PALETTE.oobGround)).sort((a, b) => extent(b) - extent(a))[0];
        const meshes = [{ mesh: golf.rough }, { mesh: golf.oob }, plane].reduce(
          (x, g) => Math.imul(x ^ meshHash(g as GameGroup), 16777619) >>> 0,
          2166136261,
        );
        if (process.env.TINT_PRINT) console.log(key, 'tinted', meshes);
        expect(meshes).toBe(want.tintedMeshes);
      });
  }
});
