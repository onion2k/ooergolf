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
 * The stars of the sky of the hole called `name`, as one mesh in two parts: a small diamond each (four sides, so none reads as a
 * pixel square), on the dome about the origin, facing it, brighter ones bigger and shining harder. The origin is put at the hole's
 * middle by the placement. A part that glows (a flow kind) so that the sun's light, which a star has none of, does not decide how
 * bright it is: it is lit black, and shines white; the dim half shines less than the bright.
 */
export function stars(name: string): Model {
  const list = starsOf(name);
  const part = (bright: boolean) =>
    built((b: MeshBuilder) => {
      for (const s of list) {
        if (s.brightness > 0.5 !== bright) continue;
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
        // the four points of a diamond, wound to face the origin, which is the way a viewer on the ground looks out
        face(b, p(-1, 0), p(0, 1), p(1, 0), p(0, -1));
      }
    });
  const glow = (g: number) => ({
    kind: PATTERN.glow,
    scale: 1,
    seed: 0,
    speed: 0,
    glow: g,
    second: [...MOON.star] as [number, number, number],
  });
  return {
    name: 'stars',
    parts: [
      { name: 'stars', mesh: part(true), material: matte([0.02, 0.02, 0.025], 1), pattern: glow(2.6) },
      { name: 'dim stars', mesh: part(false), material: matte([0.02, 0.02, 0.025], 1), pattern: glow(1.0) },
    ],
    moving: [],
  };
}

/** A placement that stands a solid on a sphere's surface at the unit direction `n`: its own up laid along `n`, turned `yaw` about it. */
function onSurface(centre: V3, n: V3, r: number, yaw: number): (p: V3) => V3 {
  // two directions across `n`
  const ref: V3 = Math.abs(n[2]) < 0.9 ? [0, 0, 1] : [1, 0, 0];
  let u: V3 = [n[1] * ref[2] - n[2] * ref[1], n[2] * ref[0] - n[0] * ref[2], n[0] * ref[1] - n[1] * ref[0]];
  const ul = Math.hypot(...u);
  u = [u[0] / ul, u[1] / ul, u[2] / ul];
  const v: V3 = [n[1] * u[2] - n[2] * u[1], n[2] * u[0] - n[0] * u[2], n[0] * u[1] - n[1] * u[0]];
  const c = Math.cos(yaw),
    s = Math.sin(yaw);
  return ([x, y, z]) => {
    const a = c * x - s * y,
      b = s * x + c * y;
    return [
      centre[0] + u[0] * a + v[0] * b + n[0] * (r + z),
      centre[1] + u[1] * a + v[1] * b + n[1] * (r + z),
      centre[2] + u[2] * a + v[2] * b + n[2] * (r + z),
    ];
  };
}

/**
 * The Earth over the hole called `name`, whose way runs along `heading`: a blue ball, finely faceted, with a few patches of land
 * and of white cloud standing a little proud of its sea, and glowing a little so it holds in the black. At the dome's own distance,
 * in the part of the sky `earthAt` gives it (clear of the hills, in the fly-in's view on a desk and on a phone).
 */
export function earth(name: string, heading: number): Model {
  const { azimuth, rise } = earthAt(name, heading);
  const r = SKY.earth.radius,
    d = SKY.dome - 100;
  const centre: V3 = [
    Math.cos(azimuth) * Math.cos(rise) * d,
    Math.sin(azimuth) * Math.cos(rise) * d,
    Math.sin(rise) * d,
  ];
  const random = seeded(11);
  const sea = built((b) =>
    lump(b, at(centre[0], centre[1], centre[2], 0.3), seeded(5), 6, 12, [r, r, r], { give: 0.015 }),
  );
  // patches: flattened lumps laid on the sea at directions spread over the ball, the land's few and big, the cloud's many and thin
  const patches = (count: number, size: number, rise: number, thin: number) =>
    built((b) => {
      for (let k = 0; k < count; k++) {
        const z = random() * 2 - 1,
          a = random() * Math.PI * 2;
        const q = Math.sqrt(1 - z * z);
        const n: V3 = [q * Math.cos(a), q * Math.sin(a), z];
        const w = size * (0.7 + random() * 0.6);
        lump(b, onSurface(centre, n, r * 0.995, random() * 6.28), random, 3, 7, [w * r, w * r * 0.8, rise * r * thin], {
          give: 0.12,
        });
      }
    });
  const glow = (c: readonly number[], g = 0.9) => ({
    kind: PATTERN.glow,
    scale: 1,
    seed: 0,
    speed: 0,
    glow: g,
    second: [c[0], c[1], c[2]] as [number, number, number],
  });
  return {
    name: 'earth',
    parts: [
      { name: 'sea', mesh: sea, material: matte(MOON.sea, 0.6), pattern: glow(MOON.sea) },
      { name: 'land', mesh: patches(3, 0.38, 0.12, 1), material: matte(MOON.land, 0.8) },
      {
        name: 'cloud',
        mesh: patches(7, 0.3, 0.14, 1),
        material: matte(MOON.cloud, 0.9),
        pattern: glow(MOON.cloud, 0.55),
      },
    ],
    moving: [],
  };
}
