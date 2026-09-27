/**
 * The bursts of particles for what happens on the course: a puff of grass
 * from under the ball when it is struck, confetti and sparkles out of the cup
 * when it drops, and a splash when it goes in the water. Each is what to emit,
 * in the renderer's own terms, and the page emits it; the particles are
 * drawn by the GPU and are nothing to the game.
 */
import type { Emit } from 'artshape-render/game/particles';

/** The confetti's colours: the bright plastic of the course. */
const CONFETTI: [number, number, number][] = [
  [1, 0.25, 0.2],
  [1, 0.8, 0.15],
  [0.25, 0.55, 1],
  [0.35, 0.9, 0.35],
  [1, 0.45, 0.8],
];

/** A puff of grass from under the ball at (x, y), struck at `power` of the hardest shot. */
export function strikePuff(x: number, y: number, power: number): Emit[] {
  return [
    {
      position: [x, y, 0.1],
      velocity: [0, 0, 2 + power * 3],
      spread: 1.5 + power * 2,
      count: Math.round(6 + power * 18),
      life: 0.45,
      lifeSpread: 0.2,
      size: 0.12,
      growth: 0.3,
      colour: [0.3, 0.75, 0.25],
      alpha: 0.9,
      gravity: 1,
      floor: 0,
    },
  ];
}

/** Confetti up out of the cup at (x, y), and sparkles with it: more of both for a hole in one. */
export function cupBurst(x: number, y: number, holeInOne: boolean): Emit[] {
  const more = holeInOne ? 2.5 : 1;
  return [
    ...CONFETTI.map((colour): Emit => ({
      position: [x, y, 0.3],
      velocity: [0, 0, 12],
      spread: 5,
      count: Math.round(14 * more),
      life: 1.8,
      lifeSpread: 0.5,
      size: 0.28,
      growth: 0,
      colour,
      alpha: 1,
      gravity: 0.6,
      floor: 0,
    })),
    {
      position: [x, y, 0.5],
      velocity: [0, 0, 7],
      spread: 5,
      count: Math.round(14 * more),
      life: 0.7,
      lifeSpread: 0.3,
      size: 0.08,
      growth: 0,
      colour: [1.3, 1.15, 0.7],
      alpha: 0,
      gravity: 0.3,
    },
  ];
}

/** A splash where the ball went into the water at (x, y). */
export function splash(x: number, y: number): Emit[] {
  return [
    {
      position: [x, y, 0],
      velocity: [0, 0, 9],
      spread: 5,
      count: 60,
      life: 0.9,
      lifeSpread: 0.3,
      size: 0.22,
      growth: 0.6,
      colour: [0.75, 0.9, 1],
      alpha: 0.8,
      gravity: 1,
      floor: -0.1,
    },
  ];
}
