/**
 * What stands and hangs in the Moon's world, cut low-poly as the rest of the scenery is: boulders and small rocks in its greys, the
 * stars of its black sky as small glowing quads in one mesh, and an Earth, a blue and white faceted ball hung low over the hills. The
 * stars and the Earth are the fly-in's only (`Scene` draws them to a view that sees the sky, as the clouds are drawn); a boulder is
 * the scenery's `boulder`, here in the Moon's grey, and the rest of the Moon's scenery is nothing at all (`theme.ts`). Nothing here
 * is played on or known to the game.
 */
import type { MeshBuilder } from 'artshape-render/mesh/types';
import { SKY, earthAt, starsOf } from '../stars';
import { boulder } from './lowpoly';
import { PATTERN, matte, type Model, type V3 } from './part';
import { shown } from './palette';
import { at, built, lump } from './shapes';
import { seeded } from '../random';
import { face } from '../meshes';

/** The Moon's colours as they show on the screen: the boulders' two greys, and the Earth's sea, land and cloud. */
export const MOON = {
  rock: shown(0.52, 0.51, 0.53),
  stone: shown(0.62, 0.61, 0.62),
  star: [1, 1, 1] as const,
  sea: shown(0.16, 0.38, 0.82),
  land: shown(0.3, 0.55, 0.28),
  cloud: shown(0.94, 0.96, 1),
} as const;

/** A boulder of the Moon: the scenery's own, in a grey, `size` across. */
export const moonBoulder = (size: number, { seed = 1, stone = false } = {}): Model =>
  boulder(size, { seed, colour: stone ? MOON.stone : MOON.rock });

/**
 * The stars of the sky of the hole called `name`, as one mesh: a small quad each, on the dome about the origin, facing it, `size`
 * across and brighter ones bigger. The origin is put at the hole's middle by the placement. A part that glows (a flow kind) so that
 * the sun's light, which a star has none of, does not decide how bright it is: it is lit black, and shines white.
 */
export function stars(name: string): Model {
  const list = starsOf(name);
  const mesh = built((b: MeshBuilder) => {
    for (const s of list) {
      const c = Math.cos(s.rise),
        d = SKY.dome;
      const centre: V3 = [Math.cos(s.azimuth) * c * d, Math.sin(s.azimuth) * c * d, Math.sin(s.rise) * d];
      // across the line to the origin: along the heading's turn, and up the dome
      const across: V3 = [-Math.sin(s.azimuth), Math.cos(s.azimuth), 0];
      const up: V3 = [
        -Math.cos(s.azimuth) * Math.sin(s.rise),
        -Math.sin(s.azimuth) * Math.sin(s.rise),
        Math.cos(s.rise),
      ];
      const h = (s.size * (0.6 + 0.4 * s.brightness)) / 2;
      const p = (a: number, k: number): V3 => [
        centre[0] + across[0] * a * h + up[0] * k * h,
        centre[1] + across[1] * a * h + up[1] * k * h,
        centre[2] + across[2] * a * h + up[2] * k * h,
      ];
      // wound to face the origin, which is the way a viewer on the ground looks out
      face(b, p(-1, -1), p(-1, 1), p(1, 1), p(1, -1));
    }
  });
  return {
    name: 'stars',
    parts: [
      {
        name: 'stars',
        mesh,
        material: matte([0.02, 0.02, 0.025], 1),
        pattern: { kind: PATTERN.glow, scale: 1, seed: 0, speed: 0, glow: 2.2, second: [...MOON.star] },
      },
    ],
    moving: [],
  };
}

/** The Earth over the hole called `name`: a faceted ball of the dome's own radius out, in sea and land and cloud, glowing a little so it holds in the black. */
export function earth(name: string, heading: number): Model {
  const { azimuth, rise } = earthAt(name, heading);
  const r = SKY.earth.radius,
    d = SKY.dome - 100;
  const centre: V3 = [
    Math.cos(azimuth) * Math.cos(rise) * d,
    Math.sin(azimuth) * Math.cos(rise) * d,
    Math.sin(rise) * d,
  ];
  const ball = (radius: number, push: number, yaw: number, seed: number) =>
    built((b) =>
      lump(b, at(centre[0], centre[1], centre[2], yaw), seeded(seed), 4, 8, [radius, radius, radius], { give: push }),
    );
  const glow = (c: readonly number[]) => ({
    kind: PATTERN.glow,
    scale: 1,
    seed: 0,
    speed: 0,
    glow: 0.9,
    second: [c[0], c[1], c[2]] as [number, number, number],
  });
  return {
    name: 'earth',
    parts: [
      { name: 'sea', mesh: ball(r, 0.04, 0.3, 5), material: matte(MOON.sea, 0.6), pattern: glow(MOON.sea) },
      // land and cloud as lumps that stand a little proud of the sea, a few of each
      { name: 'land', mesh: ball(r * 1.02, 0.1, 1.9, 9), material: matte(MOON.land, 0.8) },
      { name: 'cloud', mesh: ball(r * 1.05, 0.14, 4.1, 21), material: matte(MOON.cloud, 0.9) },
    ],
    moving: [],
  };
}
