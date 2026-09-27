/**
 * The breeze: the flag swinging on its pin, the trees leaning a little and
 * back, and the ripples on the water swelling and settling. Each is a sum of
 * slow waves of game time, a little out of step from one thing to the next,
 * so the course is never quite still and never moves in step, and a picture
 * taken at the same moment is the same picture. Only drawing: nothing that is
 * played moves.
 */

/** How far each thing goes: the flag either way of where it flies, in radians, and a tree's lean. */
export const SWAY = { flag: 0.35, tree: 0.035 } as const;

/** How far the flag is swung from where it flies, at time `t`. */
export function flagTurn(t: number): number {
  return SWAY.flag * (0.65 * Math.sin(t * 1.7) + 0.35 * Math.sin(t * 4.3 + 1.1));
}

/** How far a tree leans at time `t`, across X and along Y, each tree by its own `seed`. */
export function lean(t: number, seed: number): [number, number] {
  const p = seed * 2.399;
  return [
    SWAY.tree * (0.7 * Math.sin(t * 0.9 + p) + 0.3 * Math.sin(t * 2.3 + p * 1.7)),
    SWAY.tree * 0.5 * Math.sin(t * 0.7 + p * 0.6),
  ];
}

/** How big a pond's ripples are at time `t`, against their drawn size, each pond by its own `seed`. */
export function ripple(t: number, seed: number): number {
  return 1 + 0.12 * Math.sin(t * 1.3 + seed * 1.9);
}
