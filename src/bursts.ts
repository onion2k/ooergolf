/**
 * The bursts of particles for what happens on the course: a puff of grass
 * from under the ball when it is struck, confetti and sparkles out of the cup
 * when it drops, and a splash when it goes in the water. Each is what to emit,
 * in the renderer's own terms, and the page emits it; the particles are
 * drawn by the GPU and are nothing to the game.
 */
import type { Emit } from 'artshape-render/game/particles';
import { WATER_LEVEL } from './arena';

/** The confetti's colours: the bright plastic of the course. */
const CONFETTI: [number, number, number][] = [
  [1, 0.25, 0.2],
  [1, 0.8, 0.15],
  [0.25, 0.55, 1],
  [0.35, 0.9, 0.35],
  [1, 0.45, 0.8],
];

/** The colour of what a stroke throws up from under the ball: grass, or sand where the ball lay in a bunker. */
const PUFF = { grass: [0.3, 0.75, 0.25], sand: [0.96, 0.82, 0.52] } as const;

/** A puff from under the ball at (x, y), struck at `power` of the hardest shot: grass, or sand from a bunker. */
export function strikePuff(x: number, y: number, power: number, ground: 'grass' | 'sand' = 'grass'): Emit[] {
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
      colour: [...PUFF[ground]],
      alpha: 0.9,
      gravity: 1,
      floor: 0,
    },
  ];
}

/**
 * The confetti cup's palette: the six colours of the rainbow, as bright as the plastic's, in the order the rainbow flag
 * flies them.
 */
const RAINBOW_CONFETTI: [number, number, number][] = [
  [1, 0.25, 0.2],
  [1, 0.55, 0.15],
  [1, 0.85, 0.15],
  [0.35, 0.9, 0.35],
  [0.25, 0.55, 1],
  [0.7, 0.35, 1],
];

/**
 * What the confetti cup changes of a burst: two and a half times the pieces, living 2.6 seconds and not 1.8, thrown over
 * eight units and not five, in the rainbow. The most a hole in one throws is 616 pieces, which with a puff or a splash is
 * well inside the renderer's ring of 1024.
 */
const BIG = { more: 2.5, life: 2.6, spread: 8 } as const;

/**
 * Confetti up out of the cup at (x, y), and sparkles with it: more of both for a hole in one. The `confetti` style is the
 * confetti cup's, bigger and longer; the plain call, and the plain style, are what they always were.
 */
export function cupBurst(x: number, y: number, holeInOne: boolean, style: 'plain' | 'confetti' = 'plain'): Emit[] {
  const big = style === 'confetti';
  const more = (holeInOne ? 2.5 : 1) * (big ? BIG.more : 1);
  return [
    ...(big ? RAINBOW_CONFETTI : CONFETTI).map((colour): Emit => ({
      position: [x, y, 0.3],
      velocity: [0, 0, 12],
      spread: big ? BIG.spread : 5,
      count: Math.round(14 * more),
      life: big ? BIG.life : 1.8,
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
      spread: big ? BIG.spread : 5,
      count: Math.round(14 * more),
      life: big ? 1.4 : 0.7,
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
      // from the water's own surface, which lies below the grass, and falling back onto it
      position: [x, y, WATER_LEVEL],
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
      floor: WATER_LEVEL - 0.1,
    },
  ];
}
