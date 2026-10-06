/**
 * The shop's items, what a hole pays, and what the shop asks: content. An item
 * is bought once with coins and gems and then equipped, one at a time or none,
 * and either changes how the ball is played (a `play` item) or only how the
 * round looks (a `cosmetic` one). This file says what each is called, costs
 * and does in a line; what each does to the game is done where the game does
 * the thing it changes, and is read there through `Effects`, so a game built
 * with no item is the game as it was. Without one place that names the ids, a
 * save, the shop and the fuzzer would each carry a list of their own.
 *
 * What each costs is set against what a round pays: a round of nine holes at
 * par pays about 45 coins (`PAY.finish` a hole) and more for each stroke
 * under, so a cosmetic is two rounds or so away, a play item three to nine,
 * and the strongest few want a gem, which only a hole in one pays.
 */

export type ItemKind = 'cosmetic' | 'play';

export interface Item {
  id: string;
  name: string;
  kind: ItemKind;
  /** What it costs. */
  coins: number;
  gems: number;
  /** Its swatch in the shop, as red, green and blue from nought to one. */
  colour: readonly [number, number, number];
  /** What it does, in a line the shop shows. */
  effect: string;
}

export const ITEMS: readonly Item[] = [
  {
    id: 'glow',
    name: 'Glow ball',
    kind: 'cosmetic',
    coins: 60,
    gems: 0,
    colour: [0.55, 0.95, 0.75],
    effect: 'The ball leaves a fading trail behind it.',
  },
  {
    id: 'confetti',
    name: 'Confetti cup',
    kind: 'cosmetic',
    coins: 80,
    gems: 0,
    colour: [1.0, 0.45, 0.7],
    effect: 'More confetti, for longer, when the ball drops in.',
  },
  {
    id: 'rainbow',
    name: 'Rainbow flag',
    kind: 'cosmetic',
    coins: 100,
    gems: 0,
    colour: [0.98, 0.78, 0.2],
    effect: 'The flag flies in rainbow stripes.',
  },
  {
    id: 'ghost',
    name: 'Ghost shot',
    kind: 'play',
    coins: 120,
    gems: 0,
    colour: [0.82, 0.86, 0.95],
    effect: 'The aim carries on to where the ball will rest.',
  },
  {
    id: 'penny',
    name: 'Lucky penny',
    kind: 'play',
    coins: 140,
    gems: 0,
    colour: [0.85, 0.55, 0.3],
    effect: 'Next hole pays double coins. Used up.',
  },
  {
    id: 'spin',
    name: 'Spin doctor',
    kind: 'play',
    coins: 150,
    gems: 0,
    colour: [0.6, 0.4, 0.9],
    effect: 'Backspin and topspin twice as strong.',
  },
  {
    id: 'curve',
    name: 'Curve master',
    kind: 'play',
    coins: 150,
    gems: 0,
    colour: [0.3, 0.7, 0.95],
    effect: 'A draw or a fade curves twice as far.',
  },
  {
    id: 'sock',
    name: 'Wind sock',
    kind: 'play',
    coins: 160,
    gems: 0,
    colour: [1.0, 0.6, 0.25],
    effect: 'The wind pushes the ball half as much.',
  },
  {
    id: 'wedge',
    name: 'Sand wedge',
    kind: 'play',
    coins: 180,
    gems: 0,
    colour: [0.95, 0.85, 0.55],
    effect: 'A bunker takes far less off the shot.',
  },
  {
    id: 'grip',
    name: 'Steady grip',
    kind: 'play',
    coins: 200,
    gems: 0,
    colour: [0.4, 0.55, 0.45],
    effect: 'Golf swings scatter half as much and lose less.',
  },
  {
    id: 'sticky',
    name: 'Sticky ball',
    kind: 'play',
    coins: 200,
    gems: 0,
    colour: [0.7, 0.9, 0.2],
    effect: 'The ball keeps less of its run when it lands.',
  },
  {
    id: 'rubber',
    name: 'Rubber ball',
    kind: 'play',
    coins: 220,
    gems: 0,
    colour: [0.9, 0.25, 0.25],
    effect: 'Rails, posts and kickers send it back harder.',
  },
  {
    id: 'slow',
    name: 'Slow roll',
    kind: 'play',
    coins: 240,
    gems: 0,
    colour: [0.35, 0.8, 0.5],
    effect: 'Greens run 15% slower.',
  },
  {
    id: 'reader',
    name: 'Break reader',
    kind: 'play',
    coins: 260,
    gems: 0,
    colour: [0.45, 0.4, 0.85],
    effect: 'Shows the break of any putt, off the green too.',
  },
  {
    id: 'mulligan',
    name: 'Mulligan',
    kind: 'play',
    coins: 280,
    gems: 1,
    colour: [0.95, 0.95, 0.95],
    effect: 'One free retake a round: the stroke is undone.',
  },
  {
    id: 'waders',
    name: 'Waders',
    kind: 'play',
    coins: 300,
    gems: 2,
    colour: [0.2, 0.55, 0.75],
    effect: 'The first ball lost each hole costs no stroke.',
  },
  {
    id: 'magnet',
    name: 'Magnet cup',
    kind: 'play',
    coins: 320,
    gems: 2,
    colour: [0.85, 0.2, 0.3],
    effect: 'The cup takes a ball from further off.',
  },
  {
    id: 'glove',
    name: 'Power glove',
    kind: 'play',
    coins: 400,
    gems: 3,
    colour: [1.0, 0.77, 0.34],
    effect: 'Every club strikes 8% harder.',
  },
];

/** An item by its id, or undefined for one no one sells (and for the empty id, which is no item). */
export function itemById(id: string): Item | undefined {
  return ITEMS.find((i) => i.id === id);
}

/** What the game is told of the item in hand: whether an effect is on, and nothing else, so no module reads the save. */
export interface Effects {
  has(id: string): boolean;
}

/** No item: every effect off, which is a game as it was before there were items. */
export const NO_EFFECTS: Effects = { has: () => false };

/** The effects of the item with this id, or none for '' and for one no one sells. */
export function effectsOf(id: string): Effects {
  return itemById(id) ? { has: (x) => x === id } : NO_EFFECTS;
}

/**
 * What each play item does to a number, in one place: every figure a play item changes is here, and the module that
 * acts on it reads it from here and asks `Effects` whether the item is held, so a figure is said once and a game with
 * no item multiplies by one and skips every branch. Nothing here draws chance, since an item that moved the draws would
 * move every seeded round after it.
 */
export const ITEM_FIGURES = {
  /** Curve master: how many times as fast a shape turns the heading. */
  curve: { rate: 2 },
  /** Spin doctor: how many times as strong a spin is, and the most of its speed along the ground a ball may keep at the landing (the fullest topspin on the putting green, undoubled, keeps 1.16). */
  spin: { strength: 2, keepMost: 1.2 },
  /** Sticky ball: the share of the surface's `keep` the first landing is left with. */
  sticky: { keep: 0.6 },
  /** Wind sock: the share of the wind's push the ball feels. */
  sock: { push: 0.5 },
  /** Slow roll: how many times as steady a slowing the golf greens give, so a ball rolls less far. */
  slow: { greens: 1.15 },
  /** Power glove: how many times as hard every club strikes, the putter's and minigolf's hardest too. */
  glove: { hardest: 1.08 },
  /** Steady grip: the share of a swing's scatter, and of the speed it loses, that is left. */
  grip: { scatter: 0.5, loss: 0.5 },
  /** Sand wedge: what a bunker takes off the shot, in place of the sand's own (power 0.66, loft 6, wild 1.25). */
  wedge: { power: 0.9, loft: 2, wild: 1.1 },
  /** Magnet cup: how wide the cup takes a ball from, in yards, in place of the course's 1.45. */
  magnet: { radius: 1.9 },
  /** Rubber ball: how many times as hard the rail, the posts and the kickers send the ball back. */
  rubber: { bounce: 1.5 },
} as const;

/** `figure` where `effects` holds the item `id`, and one where it does not: the multiplier that leaves a game as it was. */
export function scaled(effects: Effects, id: string, figure: number): number {
  return effects.has(id) ? figure : 1;
}

/** What a hole pays: coins for finishing it, more for each stroke under par, and gems for a hole in one. */
export const PAY = { finish: 5, underPar: 5, holeInOne: 1 };

/** What a hole scored at `strokes` on a par of `par` pays; nothing for one picked up. */
export function paid(strokes: number, par: number, pickedUp: boolean): { coins: number; gems: number } {
  if (pickedUp) return { coins: 0, gems: 0 };
  return {
    coins: PAY.finish + Math.max(0, par - strokes) * PAY.underPar,
    gems: strokes === 1 ? PAY.holeInOne : 0,
  };
}
