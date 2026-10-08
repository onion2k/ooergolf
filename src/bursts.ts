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
 * What each style of cup burst is made of. The plain burst is what the course has always thrown; the confetti cup throws two
 * and a half times the pieces, living 2.6 seconds and not 1.8, over eight units and not five, in the rainbow; the party cup's
 * streamers are three times the pieces, thrown higher and wider and drifting down slowly (a light gravity, a long life), so they
 * hang in the air as streamers do. The most a hole in one throws is 770 pieces, which with a puff or a splash is well inside
 * the renderer's ring of 1024.
 */
const STYLES = {
  plain: {
    colours: CONFETTI,
    more: 1,
    life: 1.8,
    spread: 5,
    lift: 12,
    fall: 0.6,
    size: 0.28,
    glint: 0.7,
    glintMore: 1,
  },
  confetti: {
    colours: RAINBOW_CONFETTI,
    more: 2.5,
    life: 2.6,
    spread: 8,
    lift: 12,
    fall: 0.6,
    size: 0.28,
    glint: 1.4,
    glintMore: 1,
  },
  streamers: {
    colours: RAINBOW_CONFETTI,
    more: 3,
    life: 3.2,
    spread: 9,
    lift: 15,
    fall: 0.25,
    size: 0.22,
    glint: 1.4,
    glintMore: 1,
  },
} as const;

/**
 * Confetti up out of the cup at (x, y), and sparkles with it: more of both for a hole in one. The `confetti` style is the
 * confetti cup's, bigger and longer, and `streamers` the party cup's; the plain call, and the plain style, are what they always were.
 */
export function cupBurst(
  x: number,
  y: number,
  holeInOne: boolean,
  style: 'plain' | 'confetti' | 'streamers' = 'plain',
): Emit[] {
  const v = STYLES[style];
  const more = (holeInOne ? 2.5 : 1) * v.more;
  return [
    ...v.colours.map((colour): Emit => ({
      position: [x, y, 0.3],
      velocity: [0, 0, v.lift],
      spread: v.spread,
      count: Math.round(14 * more),
      life: v.life,
      lifeSpread: 0.5,
      size: v.size,
      growth: 0,
      colour,
      alpha: 1,
      gravity: v.fall,
      floor: 0,
    })),
    {
      position: [x, y, 0.5],
      velocity: [0, 0, 7],
      spread: v.spread,
      count: Math.round(14 * more),
      life: v.glint,
      lifeSpread: 0.3,
      size: 0.08,
      growth: 0,
      colour: [1.3, 1.15, 0.7],
      alpha: 0,
      gravity: 0.3,
    },
  ];
}

/**
 * The fireworks over the cup for a birdie or better: a few shells, each a rocket that climbs out of the cup and a burst of
 * sparks where it tops out, one after another. `fireworkAt(step)` says when each of the steps (rocket, burst, rocket, burst...)
 * goes off, in seconds of game time from the hole being holed, and `fireworkEmits` what it throws, so the page emits each as
 * game time reaches it and a paused game holds them still. The last burst goes off a second and a half after the hole is holed and fades inside the two seconds before the next hole begins.
 */
export const FIREWORKS = { shells: 3, apart: 0.4, rise: 0.5, height: 13, ring: 2.5 } as const;
export const FIREWORK_STEPS = FIREWORKS.shells * 2;

/** When step `step` of the fireworks goes off, in seconds after the hole was holed. */
export const fireworkAt = (step: number): number => (step >> 1) * FIREWORKS.apart + (step & 1 ? FIREWORKS.rise : 0);

/** The sparks of step `step`: a rocket's climb for an even step and a shell's burst for an odd one, over the cup at (x, y) on ground `z` high. */
export function fireworkEmits(x: number, y: number, z: number, step: number): Emit[] {
  const shell = step >> 1;
  // each shell goes up a little to a different side of the cup, and in a colour of its own
  const turn = shell * 2.1;
  const ox = Math.cos(turn) * FIREWORKS.ring,
    oy = Math.sin(turn) * FIREWORKS.ring;
  if ((step & 1) === 0)
    return [
      {
        position: [x + ox, y + oy, z + 0.3],
        velocity: [0, 0, FIREWORKS.height / FIREWORKS.rise],
        spread: 0.6,
        count: 10,
        life: FIREWORKS.rise,
        lifeSpread: 0,
        size: 0.1,
        growth: 0,
        colour: [1.3, 1.15, 0.7],
        alpha: 0,
        gravity: 0,
      },
    ];
  const [r, g, b] = RAINBOW_CONFETTI[(shell * 2) % RAINBOW_CONFETTI.length];
  return [
    {
      position: [x + ox, y + oy, z + FIREWORKS.height],
      velocity: [0, 0, 0],
      spread: 9,
      count: 60,
      life: 1.4,
      lifeSpread: 0.3,
      size: 0.14,
      growth: 0,
      colour: [r * 1.4, g * 1.4, b * 1.4],
      fade: [r * 0.3, g * 0.3, b * 0.3],
      alpha: 0,
      gravity: 0.5,
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
