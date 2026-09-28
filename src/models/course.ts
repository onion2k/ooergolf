/**
 * What every hole has: the cup, the grass round it, the pin and its flag,
 * and the markers either side of the tee. Each is built to the sizes the
 * game plays with, so a cup of any radius the game tries is lined and rimmed
 * on its own circle, and the pin stands from the bottom of the cup to its
 * height. The origin of each is where the game puts it: the cup's middle at
 * grass level, the tee's middle between the markers.
 */
import { PALETTE, ROUGH } from './palette';
import { PATTERN, matte, type Colour, type Model } from './part';
import { annulus, at, built, disc, dome, frustum, lifted, lump, slab, tubeIn } from './shapes';
import type { Mesh } from 'artshape-render/mesh/types';
import { face } from '../meshes';

/**
 * The cup's figures: how deep it is drawn, how wide and how proud its rim
 * is, and how many sides it has. A multiple of eight sides, so the grass
 * round it can meet the square it sits in at the corners.
 */
export const CUP = { depth: 2.4, rim: 0.3, rimHeight: 0.08, sides: 24 } as const;

/**
 * A cup of `radius`: its lining, a dark wall down from the grass and a
 * floor, and a gold rim round its lip. The lining's wall is on the cup's own
 * circle, which is the physics' hole, and the rim lies outside it. On
 * ground that slopes, given its `height` round the cup's middle, the rim
 * follows the ground and the lining runs down from it, as the physics' rim
 * does since v0.7.0; the floor stays at the cup's depth.
 */
export function cup(
  radius: number,
  { depth = CUP.depth, height }: { depth?: number; height?: (x: number, y: number) => number } = {},
): Model {
  const n = CUP.sides,
    r = radius,
    rim = r + CUP.rim;
  const here = at(0, 0, 0);
  return {
    name: 'cup',
    parts: [
      {
        name: 'liner',
        material: matte(PALETTE.hole, 0.8),
        mesh: onGround(
          built((b) => {
            tubeIn(b, here, n, r, -depth, 0);
            disc(b, here, n, r, -depth);
          }),
          height,
        ),
      },
      {
        name: 'rim',
        material: matte(PALETTE.gold, ROUGH.metal),
        mesh: onGround(
          built((b) => {
            annulus(b, here, n, r, rim, CUP.rimHeight);
            tubeIn(b, here, n, r, 0, CUP.rimHeight);
            frustum(b, here, n, rim, rim, 0, CUP.rimHeight, { top: false });
          }),
          height,
        ),
      },
    ],
    moving: [],
  };
}

/**
 * The grass round a cup: a square `side` across with the cup's hole cut out
 * of its middle, for the game to lay where the grass would otherwise cover
 * the cup. Its hole is the lining's own polygon, so the two meet edge to
 * edge. The square must be wider than the hole; the rim is a raised ring on
 * the grass, and may lie over the grass beyond the square. Given the
 * ground's `height`, it lies on it.
 */
export function collar(
  side: number,
  radius: number,
  { height }: { height?: (x: number, y: number) => number } = {},
): Model {
  if (side / 2 <= radius) throw new Error(`a collar ${side} across cannot hold a cup of radius ${radius}`);
  const n = CUP.sides,
    half = side / 2;
  const mesh = built((b) => {
    const circle = (i: number): [number, number, number] => {
      const a = (i / n) * Math.PI * 2;
      return [Math.cos(a) * radius, Math.sin(a) * radius, 0];
    };
    // the square's edge straight out from each point of the circle; the corners fall on every sixth, since n is a multiple of eight
    const edge = (i: number): [number, number, number] => {
      const a = (i / n) * Math.PI * 2,
        c = Math.cos(a),
        s = Math.sin(a);
      const k = half / Math.max(Math.abs(c), Math.abs(s));
      return [c * k, s * k, 0];
    };
    for (let i = 0; i < n; i++) face(b, circle(i), edge(i), edge(i + 1), circle(i + 1));
  });
  return {
    name: 'collar',
    parts: [{ name: 'collar', mesh: onGround(mesh, height), material: matte(PALETTE.grass, 0.85) }],
    moving: [],
  };
}

/**
 * The pin and its flag: a banded pole from the bottom of the cup up to
 * `height` above the grass, a gold ball on its top, and a triangular flag of
 * `colour` flying from just under it toward +X. The game turns the whole of
 * it about Z to set which way the flag flies.
 */
export function flag(colour: Colour, { height = 9, depth = CUP.depth, radius = 0.12 } = {}): Model {
  const knob = 0.28;
  const top = height - knob * 2 - 0.08;
  const [long, deep] = [3.4, 2.4];
  return {
    name: 'flag',
    parts: [
      {
        name: 'pole',
        material: matte(PALETTE.cream, ROUGH.plastic),
        // red bands up a white pole, about a hand and a half apart, from where it stands in the cup
        pattern: { kind: PATTERN.bands, scale: 0.64, seed: 0.1, second: PALETTE.plastic.red },
        mesh: built((b) => frustum(b, at(0, 0, 0), 6, radius, radius, -depth, height - knob, { bottom: true })),
      },
      {
        name: 'knob',
        material: matte(PALETTE.gold, ROUGH.metal),
        mesh: built((b) => lump(b, at(0, 0, height - knob), () => 0, 3, 6, [knob, knob, knob], { give: 0 })),
      },
      {
        name: 'flag',
        material: matte(colour, 0.45),
        mesh: built((b) =>
          slab(
            b,
            at(0, 0, 0),
            [
              [radius * 0.5, top],
              [radius * 0.5, top - deep],
              [radius * 0.5 + long, top - deep * 0.55],
            ],
            0.1,
          ),
        ),
      },
    ],
    moving: [],
  };
}

/** Two glossy domes of `radius`, `spacing` apart across X, either side of the tee. */
export function teeMarkers(spacing: number, { radius = 0.45, colour = PALETTE.plastic.blue } = {}): Model {
  const mesh = built((b) => {
    for (const side of [-1, 1]) dome(b, at((side * spacing) / 2, 0, 0), radius, 3, 8);
  });
  return { name: 'tee markers', parts: [{ name: 'markers', mesh, material: matte(colour, 0.18) }], moving: [] };
}

/** A mesh as built on level ground, or laid on the ground's `height` round the cup's middle where the ground slopes. */
function onGround(mesh: Mesh, height?: (x: number, y: number) => number): Mesh {
  return height ? lifted(mesh, height) : mesh;
}
