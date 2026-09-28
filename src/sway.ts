/**
 * The course's things in the hole's wind: the flag flying down it and
 * fluttering, the trees leaning with it, and the ripples on the water
 * swelling and settling. The flag and the trees follow the gusts the
 * renderer blows the grass with, through its own `gust`, so a gust that
 * crosses the green bends the grass, the flag and the trees together. All of
 * it from game time, so a picture taken at the same moment is the same
 * picture. Only drawing: nothing that is played moves.
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

/** How big a pond's ripples are at time `t`, against their drawn size, each pond by its own `seed`. */
export function ripple(t: number, seed: number): number {
  return 1 + 0.12 * Math.sin(t * 1.3 + seed * 1.9);
}
