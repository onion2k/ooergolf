/**
 * What stands in the Future, cut low-poly and drawn glowing where it glows: the hologram, a tree of rings of cyan light on a thin
 * pole, made to the physics' cone (a ball goes through it, and slowed; it is nothing to the ball but a cone, so what is seen is what
 * the ball meets); a pylon, a bollard and a plinth for the ground past the hole, near; a dark tower with lit bands for the skyline,
 * far; and the glowing ring of the cup. A glowing part is the renderer's `FLOW_GLOW`: lit black, shining in its colour, and nothing
 * of it is alpha, which the game path has none of, so a hologram is rings with gaps and not a see-through sheet.
 */
import { seeded } from '../random';
import { PATTERN, matte, type Model, type Part, type V3 } from './part';
import { shown } from './palette';
import { at, built, frustum, lump, annulus } from './shapes';

/** The Future's colours: the cyan of its light, the pink of the sky's glow, the dark steel of its towers and the chrome of its kerbs. */
export const FUTURE = {
  cyan: [0.25, 0.95, 1] as const,
  pink: [1, 0.3, 0.75] as const,
  dark: shown(0.1, 0.11, 0.17),
  steel: shown(0.55, 0.6, 0.68),
  plinth: shown(0.42, 0.46, 0.55),
} as const;

/** The figures of a tree the game tests a ball against, as the golf tree has them. */
export interface HologramFigures {
  trunk: number;
  base: number;
  radius: number;
  apex: number;
}

/** A glowing part: black in the light, and shining `colour` at `glow`. */
export const glowing = (name: string, mesh: Part['mesh'], colour: readonly number[], glow: number): Part => ({
  name,
  mesh,
  material: matte([0.02, 0.03, 0.04], 0.5),
  pattern: { kind: PATTERN.glow, scale: 1, seed: 0, speed: 0, glow, second: [colour[0], colour[1], colour[2]] },
});

/** How many rings a hologram has, how many sides each, and how tall each is, in units. */
export const HOLOGRAM = { rings: 10, sides: 14, thick: 0.36 } as const;

/**
 * A hologram to the figures `f`: ten rings of cyan light stacked from the canopy's base to its tip, each narrowing as the cone
 * does, every one inside it by a ball's skin, with gaps between, and a thin pole of the same light from the ground up through them.
 * `glow` is how brightly it shines: the flicker's levels are this model at four brightnesses.
 */
export function hologram(f: HologramFigures, { glow = 3.2 } = {}): Model {
  const h = f.apex - f.base;
  const coneAt = (z: number) => (f.radius * Math.max(0, f.apex - z)) / h;
  const rings = built((b) => {
    for (let k = 0; k < HOLOGRAM.rings; k++) {
      // rings spread over the canopy's height, the bottom one at the base and the top one a ring's thickness under the tip
      const z0 = f.base + (k / HOLOGRAM.rings) * (h - HOLOGRAM.thick * 2);
      const r = coneAt(z0) * 0.93;
      if (r < 0.1) continue;
      frustum(b, at(0, 0, 0), HOLOGRAM.sides, r, r * 0.97, z0, z0 + HOLOGRAM.thick, { top: false, phase: k * 0.3 });
    }
  });
  // the pole: no wider than a tenth of a yard, from the ground to the tip
  const pole = built((b) => frustum(b, at(0, 0, 0), 5, 0.1, 0.05, 0, f.apex - 0.4));
  return {
    name: 'hologram',
    parts: [glowing('rings', rings, FUTURE.cyan, glow), glowing('spine', pole, FUTURE.cyan, glow * 0.7)],
    moving: [],
  };
}

/** A pylon `height` tall: a thin dark mast of four sides on a squat foot, with a glowing tip. */
export function pylon(height: number, { seed = 1 } = {}): Model {
  void seed;
  const mast = built((b) => {
    frustum(b, at(0, 0, 0), 4, height * 0.09, height * 0.07, 0, height * 0.15, { phase: Math.PI / 4 });
    frustum(b, at(0, 0, 0), 4, height * 0.05, height * 0.025, height * 0.15, height * 0.9, { phase: Math.PI / 4 });
  });
  const tip = built((b) =>
    lump(b, at(0, 0, height * 0.93), seeded(3), 2, 4, [height * 0.04, height * 0.04, height * 0.06], { give: 0 }),
  );
  return {
    name: 'pylon',
    parts: [{ name: 'mast', mesh: mast, material: matte(FUTURE.dark, 0.5) }, glowing('tip', tip, FUTURE.pink, 2.4)],
    moving: [],
  };
}

/** A bollard `size` across: a short dark post with a ring of cyan light round its top. */
export function bollard(size: number, { seed = 1 } = {}): Model {
  void seed;
  const post = built((b) => frustum(b, at(0, 0, 0), 6, size * 0.45, size * 0.38, 0, size * 0.9));
  const ring = built((b) => annulus(b, at(0, 0, 0), 6, size * 0.28, size * 0.42, size * 0.92));
  return {
    name: 'bollard',
    parts: [{ name: 'post', mesh: post, material: matte(FUTURE.dark, 0.5) }, glowing('ring', ring, FUTURE.cyan, 1.6)],
    moving: [],
  };
}

/** A plinth `size` across: a low slab of steel with a bevelled top, standing on the ground. */
export function plinth(size: number, { seed = 1 } = {}): Model {
  const random = seeded(seed * 3023 + 5);
  const w = size * (0.8 + random() * 0.3);
  const slab = built((b) => {
    frustum(b, at(0, 0, 0), 4, w, w * 0.92, 0, size * 0.35, { phase: Math.PI / 4 });
    frustum(b, at(0, 0, 0), 4, w * 0.92, w * 0.7, size * 0.35, size * 0.5, { phase: Math.PI / 4 });
  });
  return { name: 'plinth', parts: [{ name: 'plinth', mesh: slab, material: matte(FUTURE.plinth, 0.4) }], moving: [] };
}

/**
 * A tower a unit tall, to be scaled, for the skyline: a dark shaft of four sides with five bands of light round it, pink or cyan.
 * `width` is how wide it is as a share of the usual.
 */
export function tower({
  seed = 1,
  width = 1,
  light = FUTURE.cyan,
}: { seed?: number; width?: number; light?: readonly number[] } = {}): Model {
  const random = seeded(seed * 2111 + 9);
  const r = 0.14 * width;
  const shaft = built((b) => frustum(b, at(0, 0, 0), 4, r, r * 0.85, 0, 1, { phase: Math.PI / 4 }));
  const bands = built((b) => {
    for (let k = 1; k < 6; k++) {
      const z = (k + random() * 0.4) / 6.4;
      frustum(b, at(0, 0, 0), 4, r * 1.03, r * 1.03, z, z + 0.028, { top: false, phase: Math.PI / 4 });
    }
  });
  return {
    name: 'tower',
    parts: [{ name: 'shaft', mesh: shaft, material: matte(FUTURE.dark, 0.4) }, glowing('bands', bands, light, 1.8)],
    moving: [],
  };
}

/** The ring of light round a cup's mouth: a flat ring of the cyan, `radius` out to the mouth and a little more. */
export function cupGlow(radius: number): Model {
  const ring = built((b) => annulus(b, at(0, 0, 0), 24, radius * 1.02, radius * 1.32, 0.05));
  return { name: 'cup glow', parts: [glowing('ring', ring, FUTURE.cyan, 2.4)], moving: [] };
}

export type { V3 };
