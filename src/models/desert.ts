/**
 * What grows and stands in the Desert, cut low-poly as the scenery of earth is (`LOOK.md`: what grows round the course is
 * faceted, what the ball meets stays the smooth toy): a saguaro in the sheet's sage with a flower on top, a barrel cactus,
 * dry scrub and a tuft of straw, a flat-topped mesa for the far ground, and a tumbleweed. Each stands on the ground at its
 * origin, and what varies from one to the next comes from `seed`, so a hole is dressed the same every time.
 *
 * The golf cactus is the one that is played round, and it is made to the physics' figures (`CACTUS` in `trees.ts`): a stem no
 * wider than the post the ball meets up to the height the canopy begins, and above it every face inside the cone the game
 * tests the ball against, so what is seen is what the ball meets. The arms start above the base, which is why a ball goes under
 * them, and reach no further than the cone does at the height they end at. Nothing here is drawn by the game or knows of it:
 * the scene is handed these through `Theme.scenery`.
 */
import { seeded } from '../random';
import { ROUGH, shown } from './palette';
import { matte, type Model, type V3 } from './part';
import { at, built, frustum, lump, rod } from './shapes';

/** The Desert's colours, as they show on the screen: the sheet's sage and its flower, the dry plants and the red rock. */
export const DESERT = {
  sage: shown(0.42, 0.63, 0.4),
  barrel: shown(0.38, 0.6, 0.32),
  bloom: shown(0.98, 0.45, 0.6),
  bloomYellow: shown(0.98, 0.8, 0.25),
  scrub: shown(0.66, 0.6, 0.32),
  tuft: shown(0.84, 0.72, 0.4),
  mesa: shown(0.72, 0.4, 0.26),
  weed: shown(0.55, 0.36, 0.18),
  rock: shown(0.7, 0.42, 0.28),
} as const;

/** The figures of a cactus the game tests a ball against, the same as `GolfTreeFigures`: a post, and a canopy's base, width and tip. */
export interface CactusFigures {
  trunk: number;
  base: number;
  radius: number;
  apex: number;
}

/** How many sides a cactus's stem and its arms have. */
const SIDES = { stem: 8, arm: 6 } as const;
/** How far inside the cone's width at the height an arm ends the arm's outer edge stands, and the stem's, in units: a ball's skin is not seen in a spine. */
const INSET = 0.1;

/**
 * A cactus of the figures `f`: a stem of eight sides, closing in a dome to the tip, and two arms, each a rod out from the stem and a
 * column up from its end. The stem is `0.93` of the post; it is as wide up to where the cone has closed in to its width, and
 * narrows with the cone from there, so it is inside it all the way to the tip. An arm begins above the base and ends where its
 * outer edge is `INSET` inside the cone at its top: the higher an arm ends the nearer the stem it stands. The flower sits on the tip.
 */
function column(f: CactusFigures, seed: number, flower: readonly [number, number, number]): Model {
  const random = seeded(seed * 6151 + 7);
  const { base: B, apex: H, radius: R } = f;
  const span = H - B;
  const cone = (z: number) => R * Math.max(0, (H - z) / span);
  const s = f.trunk * 0.93;
  const turn = random() * Math.PI * 2;
  // an arm's elbow and top, as shares of the canopy's height above its base, and how thick it is as a share of the stem
  const arms = [
    { side: 0, elbow: 0.09, top: 0.36, thick: 0.78 },
    { side: 1, elbow: 0.25, top: 0.51, thick: 0.68 },
  ].map((a) => ({ ...a, turn: turn + a.side * Math.PI + (random() - 0.5) * 0.5 }));
  const cactus = built((b) => {
    const stem = at(0, 0, 0, turn);
    // where the cone has closed in to the stem's width, and a dome from there to the tip in two steps
    const zs = H - ((s + 0.06) * span) / R;
    const z2 = zs + (H - zs) * 0.55;
    const r2 = Math.max(0.05, Math.min(s * 0.8, cone(z2) - 0.05));
    frustum(b, stem, SIDES.stem, s, s, 0, zs, { top: false });
    frustum(b, stem, SIDES.stem, s, r2, zs, z2, { top: false });
    frustum(b, stem, SIDES.stem, r2, 0, z2, H);
    for (const arm of arms) {
      const e = B + arm.elbow * span,
        t = B + arm.top * span,
        ra = s * arm.thick;
      // out as far as the cone allows where the arm ends, and no nearer the stem than its own width
      const d = Math.max(s + ra * 0.6, cone(t) - ra - INSET);
      const [c, sn] = [Math.cos(arm.turn), Math.sin(arm.turn)];
      const out = (x: number, z: number): V3 => [c * x, sn * x, z];
      rod(b, out(0, e), out(d, e + 0.3), ra * 0.9, SIDES.arm);
      const top = at(c * d, sn * d, 0);
      frustum(b, top, SIDES.arm, ra, ra, e - ra * 0.1, t - ra * 0.7, { bottom: true, top: false });
      frustum(b, top, SIDES.arm, ra, ra * 0.45, t - ra * 0.7, t);
    }
  });
  const bloom = built((b) => {
    const k = H * 0.04;
    lump(b, at(0, 0, H - 0.75 * k, turn), seeded(seed + 3), 2, 5, [k, k, 0.75 * k], { give: 0.1 });
  });
  return {
    name: 'saguaro',
    parts: [
      { name: 'cactus', mesh: cactus, material: matte(DESERT.sage, ROUGH.leaves) },
      { name: 'flower', mesh: bloom, material: matte(flower, ROUGH.leaves) },
    ],
    moving: [],
  };
}

/**
 * The cactus a golf hole of the Desert is played round, to the figures the game gives its physics (`CACTUS`): a stem no wider than
 * the post below the base, and everything above it inside the cone, so a ball is never seen inside a spine or let through an arm.
 */
export function golfCactus(f: CactusFigures, { seed = 1 } = {}): Model {
  const m = column(f, seed, DESERT.bloom);
  return { ...m, name: 'golf cactus' };
}

/**
 * A saguaro `height` tall, as the golf cactus is made in proportion (a third of its height bare, a cone a quarter as wide as it is tall
 * above, as the physics has them), for what stands past the hole.
 */
export function saguaro(height: number, { seed = 1 } = {}): Model {
  const m = column(
    { trunk: (1.1 * height) / 15, base: height / 3, radius: (5 * height) / 15, apex: height },
    seed,
    DESERT.bloom,
  );
  return m;
}

/** A barrel cactus about `size` across: a ribbed dome of eight sides, sunk a little, with a yellow flower in a ring on its top. */
export function barrel(size: number, { seed = 1 } = {}): Model {
  const random = seeded(seed * 4259 + 5);
  const r = size / 2;
  const cactus = built((b) =>
    lump(b, at(0, 0, -r * 0.25, random() * Math.PI * 2), random, 3, 8, [r, r, r * 1.05], {
      give: 0.08,
      floor: -r * 0.1,
    }),
  );
  const bloom = built((b) =>
    lump(b, at(0, 0, r * 0.8, random()), random, 2, 5, [r * 0.34, r * 0.34, r * 0.2], { give: 0.1 }),
  );
  return {
    name: 'barrel',
    parts: [
      { name: 'cactus', mesh: cactus, material: matte(DESERT.barrel, ROUGH.leaves) },
      { name: 'flower', mesh: bloom, material: matte(DESERT.bloomYellow, ROUGH.leaves) },
    ],
    moving: [],
  };
}

/** A clump of dry scrub about `size` across from its middle: three flattened faceted lumps in a dull straw-olive, low to the ground. */
export function scrub(size: number, { seed = 1 } = {}): Model {
  const random = seeded(seed * 4441 + 13);
  const mesh = built((b) => {
    for (let k = 0; k < 3; k++) {
      const a = (k / 3) * Math.PI * 2 + random();
      const r = size * (0.5 + random() * 0.2);
      lump(b, at(Math.cos(a) * size * 0.4, Math.sin(a) * size * 0.4, r * 0.3), random, 3, 6, [r, r, r * 0.6], {
        give: 0.25,
        floor: -r * 0.3,
      });
    }
  });
  return { name: 'scrub', parts: [{ name: 'scrub', mesh, material: matte(DESERT.scrub, ROUGH.leaves) }], moving: [] };
}

/** A tuft of dry grass about `size` tall: `blades` thin three-sided spikes leaning out from the root, in straw. */
export function tuft(size: number, { seed = 1, blades = 6 } = {}): Model {
  const random = seeded(seed * 3301 + 11);
  const mesh = built((b) => {
    for (let k = 0; k < blades; k++) {
      const a = (k / blades) * Math.PI * 2 + random() * 0.6;
      const lean = 0.2 + random() * 0.45;
      const len = size * (0.65 + random() * 0.35);
      rod(
        b,
        [Math.cos(a) * size * 0.04, Math.sin(a) * size * 0.04, 0],
        [Math.cos(a) * Math.sin(lean) * len, Math.sin(a) * Math.sin(lean) * len, Math.cos(lean) * len],
        size * 0.06,
        3,
      );
    }
  });
  return { name: 'tuft', parts: [{ name: 'tuft', mesh, material: matte(DESERT.tuft, ROUGH.leaves) }], moving: [] };
}

/**
 * A mesa a unit tall, to be scaled: a skirt of fallen rock, a sheer face and a flat cap that overhangs it a little, on seven
 * sides. `width` is how wide it is at its foot as a share of the usual (a butte is a narrow one). A rock, in four tiers of light.
 */
export function mesa({ seed = 1, width = 1 } = {}): Model {
  const random = seeded(seed * 2713 + 17);
  const phase = random() * Math.PI;
  const w = width;
  const mesh = built((b) => {
    const foot = at(0, 0, 0);
    frustum(b, foot, 7, 2.3 * w, 1.45 * w, 0, 0.38, { top: false, phase });
    frustum(b, foot, 7, 1.45 * w, 1.38 * w, 0.38, 0.9, { top: false, phase: phase + 0.1 });
    frustum(b, foot, 7, 1.52 * w, 1.42 * w, 0.9, 1, { phase: phase + 0.1 });
  });
  return { name: 'mesa', parts: [{ name: 'rock', mesh, material: matte(DESERT.mesa, ROUGH.rock) }], moving: [] };
}

/**
 * A tumbleweed of radius `r`: three hoops of straw, each a ring of six thin rods, one flat, one on edge and one on the slant, so it
 * reads as a snarl and rolls as a ball does. Drawn only; nothing of the game is shaped like it.
 */
export function tumbleweed(r: number): Model {
  const mesh = built((b) => {
    const hoop = (frame: (x: number, y: number) => V3) => {
      const n = 6;
      for (let i = 0; i < n; i++) {
        const a0 = (i / n) * Math.PI * 2,
          a1 = ((i + 1) / n) * Math.PI * 2;
        rod(b, frame(Math.cos(a0) * r, Math.sin(a0) * r), frame(Math.cos(a1) * r, Math.sin(a1) * r), r * 0.13, 3);
      }
    };
    hoop((x, y) => [x, y, 0]);
    hoop((x, y) => [x, 0, y]);
    hoop((x, y) => [0.6 * x + 0.1 * y, 0.45 * y, 0.65 * x - 0.45 * y]);
  });
  // (a snarl is not a solid: it has no tier of light to cut, so its part is not one the tones are named for)
  return {
    name: 'tumbleweed',
    parts: [{ name: 'weed', mesh, material: matte(DESERT.weed, ROUGH.leaves) }],
    moving: [],
  };
}
