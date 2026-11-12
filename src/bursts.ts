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
export const PUFF = { grass: [0.3, 0.75, 0.25], sand: [0.96, 0.82, 0.52] } as const;

/** The colours of the puff a stroke throws up, for a ground of each kind: earth's own `PUFF`, or a biome's, which its theme says (`Theme.puff`). */
export interface Puffs {
  readonly grass: readonly number[];
  readonly sand: readonly number[];
  /** How heavy the particles are (earth's is one), how long they live in seconds (0.45), and how many times deeper the puff is (one): a world of little gravity throws a plume that rises and settles slowly. */
  readonly gravity?: number;
  readonly life?: number;
  readonly deep?: number;
  /** The colour of what a ball into a lake throws up, where it is not water's own (the Future's quicksilver). */
  readonly splash?: readonly number[];
}

/**
 * A puff from under the ball at (x, y), struck at `power` of the hardest shot: grass, or sand from a bunker. `z` is how
 * high the ground is there: on a golf hole's hills a puff thrown from nought was under the ground or far over it, and was
 * not seen (found on 12 November 2026, when the divot beside it was not).
 */
export function strikePuff(
  x: number,
  y: number,
  power: number,
  ground: 'grass' | 'sand' = 'grass',
  puffs: Puffs = PUFF,
  z = 0,
): Emit[] {
  const deep = puffs.deep ?? 1;
  return [
    {
      position: [x, y, z + 0.1],
      velocity: [0, 0, (2 + power * 3) * deep],
      spread: 1.5 + power * 2,
      count: Math.round((6 + power * 18) * deep),
      life: puffs.life ?? 0.45,
      lifeSpread: 0.2,
      size: 0.12,
      growth: 0.3,
      colour: [puffs[ground][0], puffs[ground][1], puffs[ground][2]],
      alpha: 0.9,
      gravity: puffs.gravity ?? 1,
      floor: z,
    },
  ];
}

/**
 * A ring of the ground thrown outward where a lofted ball comes down at (x, y), going `fall` of the hardest a ball lands
 * (nought to one): low and along the ground, eight ways round, more of it and faster the harder the fall, in the colour
 * of what it came down on. None for no fall. It is thrown with the puff a landing always had, and in a world of little
 * gravity it hangs as that puff does (`Puffs.gravity`, `Puffs.life`). `scale` is how much bigger it is thrown for a camera
 * standing far back, by how many times further than at home (`farScale`): a ring a yard across is not seen from a
 * drive's view, where the ball itself is a few pixels. The same for the sparks and the divot below.
 */
export const LAND_RING = { ways: 8, most: 4, speed: [3, 9], lift: 0.8 } as const;

export function landRing(
  x: number,
  y: number,
  fall: number,
  ground: 'grass' | 'sand' = 'grass',
  puffs: Puffs = PUFF,
  scale = 1,
  z = 0,
): Emit[] {
  if (!(fall > 0)) return [];
  const f = Math.min(1, fall);
  const speed = (LAND_RING.speed[0] + (LAND_RING.speed[1] - LAND_RING.speed[0]) * f) * scale;
  const colour: [number, number, number] = [puffs[ground][0], puffs[ground][1], puffs[ground][2]];
  return Array.from({ length: LAND_RING.ways }, (_, k): Emit => {
    const a = (k / LAND_RING.ways) * Math.PI * 2;
    return {
      position: [x + Math.cos(a) * 0.4 * scale, y + Math.sin(a) * 0.4 * scale, z + 0.1],
      velocity: [Math.cos(a) * speed, Math.sin(a) * speed, LAND_RING.lift * (0.5 + f) * scale],
      spread: 0.8 * scale,
      count: Math.max(1, Math.round(LAND_RING.most * f)),
      life: (puffs.life ?? 0.45) * 1.2,
      lifeSpread: 0.2,
      size: 0.2 * scale,
      growth: 0.5 * scale,
      colour,
      alpha: 0.8,
      gravity: puffs.gravity ?? 1,
      floor: z,
    };
  });
}

/** How much bigger a burst on the ground is thrown for a camera `distance` back, whose home is `home`: as many times as it is further, and never smaller than at home. */
export const farScale = (distance: number, home: number): number => Math.max(1, distance / home);

/**
 * Sparks where the ball is knocked hard by the rail, a post or a bumper: none under `from` units a second (a soft bank is
 * no flash), more the harder to `most`, bright and gone in a blink, thrown the way the knock pushed the ball. Not for the
 * ground a ball drops onto, whose knock points up and which has its dust: `flat` is how far up a knock may point and still
 * be off a side. And not for a ball rattling down the cup (`inCup`), which knocks on its wall and has its confetti.
 */
export const SPARKS = { from: 14, full: 40, least: 8, most: 22, flat: 0.6 } as const;

export function knockSparks(
  x: number,
  y: number,
  z: number,
  hard: number,
  dx: number,
  dy: number,
  dz: number,
  scale = 1,
  inCup = false,
): Emit[] {
  if (inCup || !(hard >= SPARKS.from) || Math.abs(dz) > SPARKS.flat) return [];
  const f = Math.min(1, (hard - SPARKS.from) / (SPARKS.full - SPARKS.from));
  return [
    {
      position: [x, y, Math.max(0.2, z)],
      velocity: [dx * (5 + 7 * f) * scale, dy * (5 + 7 * f) * scale, (3 + 3 * f) * scale],
      spread: (4 + 4 * f) * scale,
      count: Math.round(SPARKS.least + (SPARKS.most - SPARKS.least) * f),
      life: 0.4,
      lifeSpread: 0.4,
      size: 0.26 * scale,
      growth: 0,
      // drawn as pieces and not as light: light added to a lawn in daylight is not seen
      colour: [1, 0.96, 0.62],
      alpha: 1,
      gravity: 0.6,
      floor: Math.max(0.2, z) - 2,
    },
  ];
}

/**
 * Whether a stroke takes a divot: an iron or a wedge, from grass and not sand (which is thrown already), not from the tee,
 * where the ball is teed up, and only in a world that grows grass.
 */
export function takesDivot(strike: string, ground: 'grass' | 'sand', fromTee: boolean, grassy: boolean): boolean {
  return grassy && !fromTee && ground === 'grass' && (strike === 'iron' || strike === 'wedge');
}

/**
 * A divot from under a ball struck at (x, y) along the unit (dx, dy) on the ground, at `power` of the hardest shot: a few
 * clods of turf thrown forward and low, the way the shot goes, in the brown of the earth under it, falling back and gone
 * in under a second. Fewer for a soft one, and never behind the ball.
 */
export const DIVOT = { least: 3, most: 9, dark: 0.45 } as const;

export function divot(
  x: number,
  y: number,
  dx: number,
  dy: number,
  power: number,
  puffs: Puffs = PUFF,
  scale = 1,
  z = 0,
): Emit[] {
  const p = Math.max(0, Math.min(1, power));
  const g = puffs.grass;
  return [
    {
      position: [x + dx * 0.6 * scale, y + dy * 0.6 * scale, z + 0.1],
      velocity: [dx * (5 + 6 * p) * scale, dy * (5 + 6 * p) * scale, (3 + 3 * p) * scale],
      spread: 3 * scale,
      count: Math.round(DIVOT.least + (DIVOT.most - DIVOT.least) * p),
      life: 0.7,
      lifeSpread: 0.3,
      size: 0.24 * scale,
      growth: 0,
      // the earth under the turf, with a little of the grass's own colour in it, so it is seen against the grass it flies over
      colour: [0.42 + g[0] * DIVOT.dark * 0.3, 0.27 + g[1] * DIVOT.dark * 0.2, 0.12 + g[2] * DIVOT.dark * 0.2],
      alpha: 1,
      gravity: 1.4,
      // a little under where it was thrown from, since the ground ahead may fall away
      floor: z - 1,
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
 * hang in the air as streamers do. The most a hole in one throws is 770 pieces, and an eagle's with its gold fewer, which
 * with a puff, a landing's ring or a splash is well inside the renderer's ring of 1024.
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

/** How a hole was holed, for what the cup throws: over par, par, a birdie, an eagle or better, or a hole in one. */
export type CupScore = 'over' | 'par' | 'birdie' | 'eagle' | 'ace';

/** The score a hole holed in `strokes` on a par of `par` is, for the cup's burst: a hole in one is an ace whatever the par. */
export function cupScore(strokes: number, par: number): CupScore {
  if (strokes === 1) return 'ace';
  const over = strokes - par;
  return over <= -2 ? 'eagle' : over === -1 ? 'birdie' : over === 0 ? 'par' : 'over';
}

/**
 * How many times par's burst each score throws: a small puff of it over par, half as much again for a birdie, twice for an
 * eagle, and the two and a half a hole in one always had. Par's, and an ace's, are to the piece what they were when the burst
 * knew only "a hole in one or not" (until 12 November 2026).
 */
export const CUP_MORE: Record<CupScore, number> = { over: 0.4, par: 1, birdie: 1.5, eagle: 2, ace: 2.5 };

/** The gold among an eagle's confetti. */
const GOLD: [number, number, number] = [1.2, 0.95, 0.3];

/**
 * Confetti up out of the cup at (x, y), and sparkles with it: as much as the score is good (`CUP_MORE`), with gold among
 * it for an eagle. The `confetti` style is the confetti cup's, bigger and longer, and `streamers` the party cup's, each
 * multiplying what the score gives; the plain call, and the plain style, are what they always were. `score` may be said
 * as it was, `true` for a hole in one and `false` for any other, which is par's.
 */
export function cupBurst(
  x: number,
  y: number,
  score: CupScore | boolean,
  style: 'plain' | 'confetti' | 'streamers' = 'plain',
): Emit[] {
  const v = STYLES[style];
  const how: CupScore = score === true ? 'ace' : score === false ? 'par' : score;
  const more = CUP_MORE[how] * v.more;
  const gold: Emit[] =
    how === 'eagle'
      ? [
          {
            position: [x, y, 0.3],
            velocity: [0, 0, v.lift * 1.15],
            spread: v.spread * 0.7,
            count: Math.round(10 * more),
            life: v.life,
            lifeSpread: 0.5,
            size: v.size * 1.15,
            growth: 0,
            colour: GOLD,
            alpha: 1,
            gravity: v.fall,
            floor: 0,
          },
        ]
      : [];
  return [
    ...gold,
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
export function splash(x: number, y: number, colour: readonly number[] = [0.75, 0.9, 1]): Emit[] {
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
      colour: [colour[0], colour[1], colour[2]],
      alpha: 0.8,
      gravity: 1,
      floor: WATER_LEVEL - 0.1,
    },
  ];
}

/**
 * A ball into a crater at (x, y): a burst of dust thrown up from the pit's rim, in `colour`, and not a splash: slow, since the pit
 * is on a world of little gravity, and falling back to the floor of the pit `drop` under the ground. Where there is no water there
 * is no ring spreading over it either (`Theme.water.crater`).
 */
export function craterDust(x: number, y: number, colour: readonly number[], drop: number): Emit[] {
  return [
    {
      position: [x, y, WATER_LEVEL - drop],
      velocity: [0, 0, 5],
      spread: 3.5,
      count: 70,
      life: 1.8,
      lifeSpread: 0.4,
      size: 0.3,
      growth: 0.9,
      colour: [colour[0], colour[1], colour[2]],
      alpha: 0.7,
      gravity: 0.22,
      floor: WATER_LEVEL - drop - 0.1,
    },
  ];
}
