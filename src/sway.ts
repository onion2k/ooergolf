/**
 * The course's things in the hole's wind: the flag flying down it and
 * fluttering, the trees leaning with it, and the ripples on the water
 * swelling and settling. The flag and the trees follow the gusts the
 * renderer blows the grass with, through its own `gust`, so a gust that
 * crosses the green bends the grass, the flag and the trees together. And
 * the flag waggles as a ball drops into its cup. All of it from game time,
 * so a picture taken at the same moment is the same picture. Only drawing:
 * nothing that is played moves.
 */
import { gust, type Wind } from 'artshape-render/game/grass';

/** How far each thing goes: the flag either way of downwind, in radians, and a tree's lean at the strongest gust. */
export const SWAY = { flag: 0.35, tree: 0.05 } as const;

/** Which way the flag at (x, y) flies at time `t`: down the wind, fluttering either way with the gust there. */
export function flagTurn(t: number, x: number, y: number, wind: Wind): number {
  const down = Math.atan2(wind.direction[1], wind.direction[0]);
  const g = gust(x, y, wind, t);
  // a flutter that quickens in a gust, held to the flag's reach either way
  const flutter = 0.6 * Math.sin(t * 4.3 + x) + 0.4 * Math.sin(t * 7.9 + y);
  return down + SWAY.flag * Math.max(-1, Math.min(1, flutter * (0.4 + 0.6 * g)));
}

/** How far the tree at (x, y) leans at time `t`, across X and along Y: with the wind, by the gust where it stands. */
export function lean(t: number, x: number, y: number, wind: Wind): [number, number] {
  const l = Math.hypot(wind.direction[0], wind.direction[1]) || 1;
  const k = SWAY.tree * Math.min(1, wind.strength) * gust(x, y, wind, t);
  return [(wind.direction[0] / l) * k, (wind.direction[1] / l) * k];
}

/** How long the flag waggles when a ball drops, in seconds; how far either way at first, in radians; and how many times a second. */
export const WAGGLE = { lasts: 1.2, most: 0.55, often: 3 } as const;

/**
 * How far the flag is swung either way of where the wind flies it, `since`
 * seconds after a ball dropped into its cup: from where it was, quickly back
 * and forth, dying away to nothing at `lasts`, exactly, as before the ball
 * dropped. A waggle, as a pin knocked by the ball would give it.
 */
export function waggle(since: number): number {
  if (!(since >= 0) || since >= WAGGLE.lasts) return 0;
  const tau = since / WAGGLE.lasts;
  return WAGGLE.most * (1 - tau) ** 2 * Math.sin(2 * Math.PI * WAGGLE.often * since);
}

/**
 * How the ripples on a pond move: each is born small and bright at a place of its own, spreads to its full size as it
 * fades to the water's colour, and is gone before it is born again somewhere else, so a place changing is never seen.
 * `each` are on a pond at once, at different points of their lives, so the water is never still.
 */
export const RIPPLES = { period: 3.5, each: 3 } as const;

/** A hash of three integers, a number from nought to one: chance from a place and a time and never from a generator. */
function unit(a: number, b: number, c: number): number {
  let h = Math.imul(a | 0, 0x27d4eb2d) ^ Math.imul(b | 0, 0x165667b1) ^ Math.imul(c | 0, 0x9e3779b1);
  h = Math.imul(h ^ (h >>> 15), 0x85ebca6b);
  h = Math.imul(h ^ (h >>> 13), 0xc2b2ae35);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
}

/** A ripple at a moment. The functions here write into `out` when they are given one, so a frame makes nothing. */
export interface Ripple {
  u: number;
  v: number;
  grow: number;
  fade: number;
}

/**
 * Ripple `k` of a pond called `seed` at time `t`: where it is, as a share of the room on the water from minus one to
 * one across and along (`u`, `v`); how far it has grown, from a small ring toward one; and how much of its brightness
 * is left, from one to nought at the end of its life.
 */
export function ripples(t: number, seed: number, k: number, out: Ripple = { u: 0, v: 0, grow: 0, fade: 0 }): Ripple {
  const x = t / RIPPLES.period + k / RIPPLES.each;
  const cycle = Math.floor(x),
    life = x - cycle;
  out.u = unit(seed, k, cycle) * 2 - 1;
  out.v = unit(seed + 7919, k, cycle) * 2 - 1;
  out.grow = 0.2 + 0.8 * (1 - (1 - life) ** 2);
  out.fade = (1 - life) ** 1.6;
  return out;
}

/**
 * Where a ripple lies on a pond with room `free` (its half sizes across and along, in from its foam and shallows), its
 * biggest ring `reach` across, and how wide it is now: its middle from the pond's, so that the whole of the ring is
 * on the water at every size, and its radius.
 */
export function ringPlace(
  free: { hx: number; hy: number },
  reach: number,
  ripple: { u: number; v: number; grow: number },
  out: { x: number; y: number; radius: number } = { x: 0, y: 0, radius: 0 },
): { x: number; y: number; radius: number } {
  const radius = Math.min(reach, free.hx, free.hy) * ripple.grow;
  out.x = ripple.u * (free.hx - radius);
  out.y = ripple.v * (free.hy - radius);
  out.radius = radius;
  return out;
}

/** The ring that spreads where a ball went into the water: how long it lasts, in seconds, and how wide it grows. */
export const SPLASH_RING = { lasts: 1.2, reach: 1.6 } as const;

/**
 * The ring `since` seconds after a ball went into the water: how far it has grown, of its reach, and how bright it
 * still is. Bright and small at once, wide and gone at `lasts`, exactly; nothing before or after.
 */
export function splashRing(since: number, out: { grow: number; fade: number } = { grow: 0, fade: 0 }) {
  if (!(since >= 0) || since >= SPLASH_RING.lasts) {
    out.grow = out.fade = 0;
    return out;
  }
  const life = since / SPLASH_RING.lasts;
  out.grow = 0.15 + 0.85 * (1 - (1 - life) ** 2);
  out.fade = (1 - life) ** 1.5;
  return out;
}
