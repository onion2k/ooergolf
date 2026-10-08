/**
 * The shop's items, what a hole pays, and what the shop asks: content. The shop has three aisles, clubs, balls and
 * accessories, and a player wears one thing from each at once: the **kit**. An item is bought once with coins and gems
 * and says in `figures` which numbers of the `Kit` it moves; `kitOf` works the three slots out into one `Kit`, once,
 * when the kit changes, and every module that plays the game asks the `Kit` for a number and never an id. Without one
 * place that names the figures and their neutral values, a save, the shop and the fuzzer would each carry a list of
 * their own, and a game with an empty kit would not be the game as it was, bit for bit.
 *
 * What each costs follows one rule, so a price is never a guess made again. `npm run value` plays the pace player with
 * each item alone (16 seeds on minigolf and 48 on golf), and the wobble of no item at all is 0.21 strokes a round on
 * minigolf and 0.44 on golf. Only the horseshoe (0.52, 0.72) and the snorkel (0.04, 0.94) save more than that, and they
 * are priced from it, at about 800 coins a stroke over the accessories' floor. An item that measures within the wobble
 * is priced by judgement of what it offers a human (the drag's feel, a bend, a spin, an aid the pace player cannot
 * use), between 120 and 450. One that costs the pace player more than the wobble (super, bouncer, hickory, stinger,
 * cap, cork, steel, bowling, links) sits at or near its aisle's floor and carries no gem, since a price is not paid
 * for a loss. A look is 60 to 120. The top two or three of each aisle ask a gem as well, which only a hole in one
 * pays. A round of nine holes at par pays about 45 coins (`PAY.finish` a hole) and more for each stroke under.
 */

import type { BallLook } from './models/course';

export type Aisle = 'club' | 'ball' | 'accessory';

/** The aisles, in the order the shop shows them. */
export const AISLES: readonly Aisle[] = ['club', 'ball', 'accessory'];

/** What a hole pays: coins for finishing it, more for each stroke under par, and gems for a hole in one. */
export const PAY = { finish: 5, underPar: 5, holeInOne: 1 };

/** What a sand lie takes off a shot, in place of the sand's own, when a club says so. */
export interface SandStrike {
  power: number;
  loft: number;
  wild: number;
}

/** What the rough takes off a shot, in place of the rough's own, when a club says so. */
export interface RoughStrike {
  power: number;
  wild: number;
}

/**
 * Every number the shop can change, each one (or nought, or off) for no item. A multiplier is one when it leaves the
 * game alone, an offset nought, a switch false, an override null. Where the sheet gives the same figure to two slots they
 * combine by the rule `COMBINE` names, and are held inside `CEILINGS`.
 */
export interface Kit {
  // --- clubs: how the ball flies on a golf hole ---
  /** How many times as hard every club strikes. */
  power: number;
  /** How many times as hard the driver and the 3-wood strike, over `power`. */
  woods: number;
  /** The share of the irons' scatter left, over `scatter`. */
  ironScatter: number;
  /** The share of the speed the irons lose to a swing left, over `loss`. */
  ironLoss: number;
  /** How many times as hard the putter strikes, on a golf green and on minigolf. */
  putterPower: number;
  /** The share of a swing's scatter left. */
  scatter: number;
  /** The share of the speed a swing loses that is left. */
  loss: number;
  /** How many times as fast a shape turns the heading. */
  curve: number;
  /** How many times as strong a spin is. */
  spin: number;
  /** Degrees of loft added to every lofted club (negative lowers the flight). */
  loft: number;
  /** Degrees of loft added to the wedges, over `loft`. */
  wedgeLoft: number;
  /** How many times as strong a spin is on the wedges, over `spin`. */
  wedgeSpin: number;
  /** How many times as much as the wind's push the ball feels. */
  wind: number;
  /** What a bunker takes off a shot in place of the sand's own, or null. */
  sandStrike: SandStrike | null;
  /** What the rough takes off a shot in place of its own, or null. */
  roughStrike: RoughStrike | null;
  // --- clubs: the strike on minigolf ---
  /** The power of a drag is the drag to this power; one is as it always was, over one is gentle at first. */
  touch: number;
  /** Degrees a putt may miss by at full power, from the game's chance; nought draws none. */
  puttScatter: number;
  /** The share of `puttScatter` that is left, which a nought cannot be scaled by. */
  puttScatterScale: number;
  /** Radians a second a putt curves along the ground for its first second, nought for none. */
  bend: number;
  /** How strong the spin buttons are on minigolf, nought for no buttons. */
  puttSpin: number;
  /** Degrees a putt struck from sand is chipped at, nought for none. */
  chipSand: number;
  /** Degrees every putt is chipped at, nought for none. */
  chipAll: number;
  /** How many times as hard a putt struck from sand goes. */
  sandPutt: number;
  // --- balls: how it moves on the ground ---
  /** How many times as much as every surface slows it, both kinds of course (above one it rolls further). */
  roll: number;
  /** The same for sand. */
  sand: number;
  /** The same for the putting green and minigolf's green. */
  green: number;
  /** The same for the rough. */
  rough: number;
  /** How many times as hard the rail, rock, trees, posts, kickers and bumpers send it back. */
  rail: number;
  /** How many times as much of its run it keeps at a landing. */
  keep: number;
  /** How many times as high it hops at a landing. */
  hop: number;
  /** How many times as hard a belt or a stream pulls it. */
  belt: number;
  // --- accessories ---
  /** The ball leaves a fading trail. */
  trail: boolean;
  /** Streamers burst from the cup. */
  streamers: boolean;
  /** The flag is a striped pennant. */
  pennant: boolean;
  /** Fireworks over the cup for a birdie or better. */
  fireworks: boolean;
  /** The next hole pays double, and the item is used up. */
  piggy: boolean;
  /** The first stroke of a hole: how many times as hard, and the share of its scatter left. */
  firstStroke: { power: number; scatter: number };
  /** The aim carries on to where the ball will rest. */
  rest: boolean;
  /** The break of any putt is shown, off the green too, and a minigolf aim's line is drawn on past its first bank. */
  chalk: boolean;
  /** Coins for each stroke under par. */
  underParPay: number;
  /** One retake a round. */
  retake: boolean;
  /** The first ball lost on each hole costs no stroke. */
  freeLoss: boolean;
  /** How wide the cup takes a ball from, in yards, or null for the course's own. */
  cupRadius: number | null;
}

/** No item: every figure neutral, which is the game as it was. */
export const NO_KIT: Readonly<Kit> = {
  power: 1,
  woods: 1,
  ironScatter: 1,
  ironLoss: 1,
  putterPower: 1,
  scatter: 1,
  loss: 1,
  curve: 1,
  spin: 1,
  loft: 0,
  wedgeLoft: 0,
  wedgeSpin: 1,
  wind: 1,
  sandStrike: null,
  roughStrike: null,
  touch: 1,
  puttScatter: 0,
  puttScatterScale: 1,
  bend: 0,
  puttSpin: 0,
  chipSand: 0,
  chipAll: 0,
  sandPutt: 1,
  roll: 1,
  sand: 1,
  green: 1,
  rough: 1,
  rail: 1,
  keep: 1,
  hop: 1,
  belt: 1,
  trail: false,
  streamers: false,
  pennant: false,
  fireworks: false,
  piggy: false,
  firstStroke: { power: 1, scatter: 1 },
  rest: false,
  chalk: false,
  underParPay: PAY.underPar,
  retake: false,
  freeLoss: false,
  cupRadius: null,
};

export interface Item {
  id: string;
  name: string;
  aisle: Aisle;
  /** What it costs. */
  coins: number;
  gems: number;
  /** Its swatch in the shop, as red, green and blue from nought to one. */
  colour: readonly [number, number, number];
  /** What it does, in a line the shop shows. */
  effect: string;
  /** The figures of the kit it moves; every other is left as it was. */
  figures: Partial<Kit>;
  /** How the ball is drawn: on a ball only, since a club and an accessory are not seen on the course as a ball is. */
  look?: BallLook;
}

/**
 * A ball's look, a colour and the pattern drawn on it in a second colour. The main colours are kept well apart (a test
 * holds the least distance between any two), since a player picks a ball by its colour first.
 */
const looked = (
  colour: BallLook['colour'],
  second: BallLook['second'],
  pattern: BallLook['pattern'],
  scale: number,
  finish: BallLook['finish'],
): BallLook => ({ colour, second, pattern, scale, finish });

/**
 * The shop's items: fifteen clubs, fifteen balls and fifteen accessories, in the order the shop shows them, cheapest first.
 * A club moves only how the ball is struck and flies, and a ball only how it moves on the ground, each on a hole of golf
 * and on a hole of minigolf; an accessory may move anything. Where the sheet gives one idea a figure for golf and another
 * for minigolf, the one figure of the kit that does it is set (the kit's power covers the putter on both kinds of course),
 * and where a ball's two kinds ask for different figures it sets both, each of which is inert on the kind that has no use
 * for it. `test/prices.test.ts` holds the prices to the rule in the header.
 */
export const ITEMS: readonly Item[] = [
  // ---- clubs: how the ball is struck and how it flies ----
  {
    id: 'stinger',
    name: 'Stinger Irons',
    aisle: 'club',
    coins: 120,
    gems: 0,
    colour: [0.45, 0.5, 0.58],
    effect:
      'Lofted clubs fly a degree lower and strike 4% harder, and the wind pushes them 40% less; putts go 6% harder with a stiffer drag.',
    // three degrees lower cost the pace player four strokes a round of golf (a driver carries a quarter less at eight degrees than at eleven)
    figures: { loft: -1, power: 1.04, wind: 0.6, putterPower: 1.06, touch: 0.85 },
  },
  {
    id: 'hickory',
    name: 'Hickory Set',
    aisle: 'club',
    coins: 150,
    gems: 0,
    colour: [0.65, 0.45, 0.25],
    effect: 'Every club 6% shorter, but shapes curve 70% more and spin bites 50% more; putts bend and spin a little.',
    figures: { power: 0.94, curve: 1.7, spin: 1.5, bend: 0.5, puttSpin: 0.7 },
  },
  {
    id: 'mallet',
    name: 'Mallet Putter',
    aisle: 'club',
    coins: 160,
    gems: 0,
    colour: [0.55, 0.38, 0.22],
    effect: 'Putts go 15% harder and a drag is gentler at first, so a short putt is easy to judge. Putts only.',
    figures: { putterPower: 1.15, touch: 1.5 },
  },
  {
    id: 'bunker',
    name: 'Bunker Blaster',
    aisle: 'club',
    coins: 170,
    gems: 0,
    colour: [0.95, 0.8, 0.45],
    effect: 'Sand takes less off a shot, and a putt struck from sand is chipped out at 12 degrees.',
    figures: { sandStrike: { power: 0.9, loft: 2, wild: 1.1 }, chipSand: 12 },
  },
  {
    id: 'spinner',
    name: 'Spin Wedges',
    aisle: 'club',
    coins: 180,
    gems: 0,
    colour: [0.85, 0.25, 0.3],
    effect: 'Spin twice as strong; putts take top or back spin off the first rail they meet.',
    figures: { spin: 2, puttSpin: 1 },
  },
  {
    id: 'bender',
    name: 'Shaper Irons',
    aisle: 'club',
    coins: 180,
    gems: 0,
    colour: [0.3, 0.6, 0.85],
    effect: 'Draws and fades curve twice as far; a putt can be bent along the ground too.',
    figures: { curve: 2, bend: 0.35 },
  },
  {
    id: 'rescue',
    name: 'Rescue Hybrids',
    aisle: 'club',
    coins: 190,
    gems: 0,
    colour: [0.3, 0.55, 0.3],
    effect: 'The rough takes less off a shot, and a putt struck from sand goes 30% harder.',
    figures: { roughStrike: { power: 0.9, wild: 1.2 }, sandPutt: 1.3 },
  },
  {
    id: 'lob',
    name: 'Lob Wedges',
    aisle: 'club',
    coins: 200,
    gems: 0,
    colour: [0.7, 0.4, 0.8],
    effect: 'Wedges loft 6 degrees higher with half as much spin again; every putt is chipped at 5 degrees.',
    figures: { wedgeLoft: 6, wedgeSpin: 1.5, chipAll: 5 },
  },
  {
    id: 'long',
    name: 'Long Bombers',
    aisle: 'club',
    coins: 220,
    gems: 0,
    colour: [0.95, 0.5, 0.2],
    effect: 'Every club 7% longer but a wilder swing; putts go 10% harder and stray up to 2 degrees.',
    // the kit's power is every club's, the putter's too, so the putt's ten per cent is the seven and the rest of the putter's own
    figures: { power: 1.07, scatter: 1.3, putterPower: 1.1 / 1.07, puttScatter: 2 },
  },
  {
    id: 'forged',
    name: 'Forged Irons',
    aisle: 'club',
    coins: 240,
    gems: 0,
    colour: [0.5, 0.52, 0.55],
    effect: 'The irons scatter 40% less and lose 40% less to a mishit; a much gentler drag for putts.',
    figures: { ironScatter: 0.6, ironLoss: 0.6, touch: 1.3 },
  },
  {
    id: 'cavity',
    name: 'Cavity Backs',
    aisle: 'club',
    coins: 280,
    gems: 0,
    colour: [0.6, 0.65, 0.7],
    effect: 'A quarter less scatter and a quarter less lost to a mishit; putts go 4% harder with a gentler drag.',
    figures: { scatter: 0.75, loss: 0.75, touch: 1.15, putterPower: 1.04 },
  },
  {
    id: 'blades',
    name: 'Tour Blades',
    aisle: 'club',
    coins: 300,
    gems: 0,
    colour: [0.78, 0.8, 0.85],
    effect: 'Half the scatter and half the loss, 3% shorter; a very gentle drag for putts, and they can be bent.',
    figures: { scatter: 0.5, loss: 0.5, power: 0.97, touch: 1.4, bend: 0.2 },
  },
  {
    id: 'counter',
    name: 'Counterweight',
    aisle: 'club',
    coins: 340,
    gems: 1,
    colour: [0.35, 0.35, 0.4],
    effect: 'Most of what a mishit loses is kept; a drag is gentler at first, so a short putt is easier.',
    figures: { loss: 0.3, touch: 1.2 },
  },
  {
    id: 'titan',
    name: 'Titanium Driver',
    aisle: 'club',
    coins: 400,
    gems: 2,
    colour: [0.55, 0.75, 0.85],
    effect: 'The driver and the 3-wood go 12% further; putts go 8% harder.',
    figures: { woods: 1.12, putterPower: 1.08 },
  },
  {
    id: 'gold',
    name: 'The Golden Set',
    aisle: 'club',
    coins: 450,
    gems: 3,
    colour: [0.95, 0.78, 0.2],
    effect:
      'Everything a little better: 5% harder, less scatter, more shape and spin, and putts that bend, spin and are easy to judge.',
    figures: { power: 1.05, scatter: 0.6, curve: 1.5, spin: 1.5, touch: 1.3, bend: 0.35, puttSpin: 1 },
  },

  // ---- balls: how it moves on the ground ----
  {
    id: 'super',
    name: 'Super Ball',
    aisle: 'ball',
    coins: 100,
    gems: 0,
    colour: [1, 0.35, 0.7],
    effect: 'Bounces half as high again off the ground and half as hard again off a rail; slows a little sooner.',
    figures: { hop: 1.5, rail: 1.5, roll: 1.05 },
    look: looked([1, 0.35, 0.7], [0.1, 0.85, 0.95], 'swirl', 1, 'glossy'),
  },
  {
    id: 'bouncer',
    name: 'Bouncer',
    aisle: 'ball',
    coins: 100,
    gems: 0,
    colour: [0.95, 0.15, 0.1],
    effect: 'Rails, rock, trees and posts throw it half as hard again, and it hops higher.',
    figures: { rail: 1.5, hop: 1.5 },
    look: looked([0.95, 0.15, 0.1], [0.95, 0.15, 0.1], 'plain', 1, 'matte'),
  },
  {
    id: 'cork',
    name: 'Cork Ball',
    aisle: 'ball',
    coins: 110,
    gems: 0,
    colour: [0.8, 0.68, 0.45],
    effect: 'Lands dead: hops less and runs on less; a softer rail, and it slows a little sooner.',
    figures: { hop: 0.4, keep: 0.8, rail: 0.8, roll: 1.05 },
    look: looked([0.8, 0.68, 0.45], [0.3, 0.2, 0.12], 'speckle', 1.2, 'matte'),
  },
  {
    id: 'steel',
    name: 'Steel Ball',
    aisle: 'ball',
    coins: 110,
    gems: 0,
    colour: [0.6, 0.65, 0.7],
    effect: 'Hops half as high, rails return 40% less, and it slows 8% less, so it runs out further.',
    figures: { hop: 0.5, rail: 0.6, roll: 0.92 },
    look: looked([0.6, 0.65, 0.7], [0.3, 0.33, 0.38], 'bands', 0.64, 'glossy'),
  },
  {
    id: 'bowling',
    name: 'Bowling Ball',
    aisle: 'ball',
    coins: 110,
    gems: 0,
    colour: [0.07, 0.07, 0.1],
    effect: 'Heavy: slows 12% less, hardly hops, rails return half and belts pull 40% less.',
    figures: { roll: 0.88, hop: 0.3, rail: 0.5, belt: 0.6 },
    look: looked([0.07, 0.07, 0.1], [0.4, 0.4, 0.5], 'speckle', 0.7, 'glossy'),
  },
  {
    id: 'links',
    name: 'Links Ball',
    aisle: 'ball',
    coins: 120,
    gems: 0,
    colour: [0.97, 0.92, 0.72],
    effect: 'Runs on a quarter more after a landing; greens slow it 5% less.',
    figures: { keep: 1.25, green: 0.95 },
    look: looked([0.97, 0.92, 0.72], [0.1, 0.15, 0.45], 'twoBands', 0.9, 'toy'),
  },
  {
    id: 'feather',
    name: 'Featherie',
    aisle: 'ball',
    coins: 130,
    gems: 0,
    colour: [0.4, 0.24, 0.12],
    effect:
      'Light: slows 8% sooner, so it is struck firmer for the same putt and runs out less; hops less, and belts pull it 30% harder.',
    figures: { roll: 1.08, hop: 0.7, belt: 1.3 },
    look: looked([0.4, 0.24, 0.12], [0.9, 0.82, 0.62], 'bands', 0.64, 'matte'),
  },
  {
    id: 'clay',
    name: 'Clay Ball',
    aisle: 'ball',
    coins: 140,
    gems: 0,
    colour: [0.82, 0.35, 0.22],
    effect: 'Slows 15% sooner on every surface: struck firmer for the same putt, and runs out less after a landing.',
    figures: { roll: 1.15 },
    look: looked([0.82, 0.35, 0.22], [0.97, 0.92, 0.75], 'bands', 0.64, 'toy'),
  },
  {
    id: 'glide',
    name: 'Glider',
    aisle: 'ball',
    coins: 140,
    gems: 0,
    colour: [0.82, 0.76, 0.9],
    effect: 'Slows 15% less on every surface: struck softer for the same putt, and runs out further after a landing.',
    figures: { roll: 0.85 },
    look: looked([0.82, 0.76, 0.9], [0.82, 0.76, 0.9], 'plain', 1, 'glossy'),
  },
  {
    id: 'tacky',
    name: 'Tacky Ball',
    aisle: 'ball',
    coins: 150,
    gems: 0,
    colour: [0.6, 0.9, 0.15],
    effect: 'Holds its landing, running on 40% less; a rail returns a quarter less.',
    figures: { keep: 0.6, rail: 0.75 },
    look: looked([0.6, 0.9, 0.15], [0.1, 0.4, 0.15], 'speckle', 1, 'toy'),
  },
  {
    id: 'marble',
    name: 'Glass Marble',
    aisle: 'ball',
    coins: 150,
    gems: 0,
    colour: [0.15, 0.35, 0.9],
    effect: 'Slows 10% less, runs on a tenth more after a landing, and rails return a tenth more.',
    figures: { roll: 0.9, keep: 1.1, rail: 1.1 },
    look: looked([0.15, 0.35, 0.9], [0.7, 0.85, 1], 'marbling', 1.6, 'glossy'),
  },
  {
    id: 'grippy',
    name: 'Grippy Ball',
    aisle: 'ball',
    coins: 200,
    gems: 0,
    colour: [1, 0.55, 0.05],
    effect: 'The rough slows it less and it runs on more after a landing; belts and streams pull it half as hard.',
    figures: { rough: 0.8, keep: 1.1, belt: 0.5 },
    look: looked([1, 0.55, 0.05], [0.07, 0.07, 0.08], 'bands', 0.64, 'toy'),
  },
  {
    id: 'snow',
    name: 'Snowball',
    aisle: 'ball',
    coins: 200,
    gems: 0,
    colour: [1, 1, 1],
    effect: 'Stops dead at a landing and slows 10% sooner after; sand slows it a third more.',
    figures: { keep: 0.5, roll: 1.1, sand: 1.3 },
    look: looked([1, 1, 1], [0.65, 0.8, 0.95], 'speckle', 1, 'matte'),
  },
  {
    id: 'desert',
    name: 'Desert Ball',
    aisle: 'ball',
    coins: 220,
    gems: 0,
    colour: [0.98, 0.9, 0.28],
    effect: 'Sand slows it nearly half as much.',
    figures: { sand: 0.55 },
    look: looked([0.98, 0.9, 0.28], [0.5, 0.3, 0.1], 'speckle', 1, 'toy'),
  },
  {
    id: 'gem',
    name: 'Gem Ball',
    aisle: 'ball',
    coins: 320,
    gems: 1,
    colour: [0.62, 0.04, 0.25],
    effect: 'The best of the lot: slows 7% less, sand slows it less, it holds its landing and rails return more.',
    figures: { roll: 0.93, sand: 0.7, keep: 0.9, rail: 1.15 },
    look: looked([0.62, 0.04, 0.25], [1, 0.5, 0.6], 'marbling', 1.6, 'glossy'),
  },

  // ---- accessories: anything, or only the look ----
  {
    id: 'comet',
    name: 'Comet Trail',
    aisle: 'accessory',
    coins: 60,
    gems: 0,
    colour: [0.55, 0.95, 0.8],
    effect: 'The ball leaves a fading trail, on every hole.',
    figures: { trail: true },
  },
  {
    id: 'streamers',
    name: 'Party Cup',
    aisle: 'accessory',
    coins: 80,
    gems: 0,
    colour: [0.95, 0.4, 0.7],
    effect: 'Streamers burst from the cup when the ball drops.',
    figures: { streamers: true },
  },
  {
    id: 'pennant',
    name: 'Club Pennant',
    aisle: 'accessory',
    coins: 100,
    gems: 0,
    colour: [0.2, 0.3, 0.7],
    effect: 'The flag is a striped club pennant, from the next hole.',
    figures: { pennant: true },
  },
  {
    id: 'cap',
    name: 'Peaked Cap',
    aisle: 'accessory',
    coins: 100,
    gems: 0,
    colour: [0.25, 0.45, 0.75],
    effect: 'The wind pushes the ball 40% less; belts and streams carry it 40% less.',
    figures: { wind: 0.6, belt: 0.6 },
  },
  {
    id: 'fireworks',
    name: 'Fireworks',
    aisle: 'accessory',
    coins: 120,
    gems: 0,
    colour: [0.98, 0.6, 0.15],
    effect: 'Fireworks go up over the cup for a birdie or better.',
    figures: { fireworks: true },
  },
  {
    id: 'piggy',
    name: 'Piggy Bank',
    aisle: 'accessory',
    coins: 140,
    gems: 0,
    colour: [0.98, 0.7, 0.75],
    effect: 'The next hole you finish pays double, and the bank is used up.',
    figures: { piggy: true },
  },
  {
    id: 'tee',
    name: 'Lucky Tee',
    aisle: 'accessory',
    coins: 200,
    gems: 0,
    colour: [0.95, 0.85, 0.5],
    effect: "Each hole's first stroke goes 5% harder, with half the scatter on golf.",
    figures: { firstStroke: { power: 1.05, scatter: 0.5 } },
  },
  {
    id: 'scope',
    name: 'Rangefinder',
    aisle: 'accessory',
    coins: 200,
    gems: 0,
    colour: [0.3, 0.3, 0.35],
    effect: 'The aim carries on to a ring where the ball will come to rest, from the next hole.',
    figures: { rest: true },
  },
  {
    id: 'chalk',
    name: 'Bank Chalk',
    aisle: 'accessory',
    coins: 220,
    gems: 0,
    colour: [0.95, 0.95, 0.9],
    effect:
      'Shows the break of any putt, off the green too; on minigolf the aim carries on past its first bank. From the next hole.',
    figures: { chalk: true },
  },
  {
    id: 'clover',
    name: 'Four-leaf Clover',
    aisle: 'accessory',
    coins: 250,
    gems: 0,
    colour: [0.25, 0.7, 0.3],
    effect: 'Each stroke under par pays 7 coins, not 5.',
    figures: { underParPay: 7 },
  },
  {
    id: 'gloves',
    name: 'Leather Gloves',
    aisle: 'accessory',
    coins: 260,
    gems: 0,
    colour: [0.6, 0.4, 0.25],
    effect: 'Less scatter and less lost to a mishit on golf; a gentler drag and a steadier putt on minigolf.',
    figures: { scatter: 0.6, loss: 0.6, touch: 1.2, puttScatterScale: 0.5 },
  },
  {
    id: 'watch',
    name: 'Pocket Watch',
    aisle: 'accessory',
    coins: 300,
    gems: 1,
    colour: [0.85, 0.75, 0.3],
    effect: 'One retake a round: the stroke you just took is undone.',
    figures: { retake: true },
  },
  {
    id: 'shoes',
    name: 'Spiked Shoes',
    aisle: 'accessory',
    coins: 300,
    gems: 0,
    colour: [0.9, 0.3, 0.25],
    effect: 'Every club, the putter too, goes 6% harder.',
    figures: { power: 1.06 },
  },
  {
    id: 'snorkel',
    name: 'Snorkel',
    aisle: 'accessory',
    coins: 455,
    gems: 2,
    colour: [0.2, 0.7, 0.85],
    effect: 'The first ball lost on each hole, in water or out of bounds, costs no stroke.',
    figures: { freeLoss: true },
  },
  {
    id: 'horseshoe',
    name: 'Horseshoe',
    aisle: 'accessory',
    coins: 560,
    gems: 3,
    colour: [0.7, 0.72, 0.78],
    effect: 'The cup takes a ball from further out: 1.8 yards, not 1.45, from the next hole.',
    figures: { cupRadius: 1.8 },
  },
];

/** An item by its id, or undefined for one no one sells (and for the empty id, which is no item). */
export function itemById(id: string): Item | undefined {
  return ITEMS.find((i) => i.id === id);
}

/** An item that is used up by what it pays for: the piggy bank, and any that comes to be like it. */
export function isConsumable(item: Item): boolean {
  return item.figures.piggy === true;
}

/** The three slots of the kit: each '' or the id of an item of that aisle. */
export interface KitSlots {
  club: string;
  ball: string;
  accessory: string;
}

/** The slots of no kit at all. */
export const emptySlots = (): KitSlots => ({ club: '', ball: '', accessory: '' });

/** The most the first stroke of a hole may be struck as many times as hard as nothing worn: the kit's power is held to 1.2 whole, and the tee's gift is the one thing allowed above it. */
export const FIRST_STROKE_MOST = 1.26;

/** The least and the most a figure may come to, once the slots that touch it are combined. */
export const CEILINGS: Partial<Record<keyof Kit, { least?: number; most?: number }>> = {
  power: { most: 1.2 },
  woods: { most: 1.2 },
  putterPower: { most: 1.2 },
  scatter: { least: 0.25 },
  loss: { least: 0.25 },
  ironScatter: { least: 0.25 },
  ironLoss: { least: 0.25 },
  rail: { least: 0.5, most: 1.5 },
  roll: { least: 0.8, most: 1.25 },
  // a hop of twice the table's keeps a ball bouncing on the fairway for longer than a round may wait (a fifth of such shots were still hopping at ten seconds)
  hop: { most: 1.5 },
  touch: { least: 0.8, most: 1.8 },
};

/** How two slots' words on one figure are combined: multiplied, added, the larger, either, or the first one given. */
type Rule = 'mul' | 'add' | 'max' | 'or' | 'first' | 'each';

const COMBINE: { [K in keyof Kit]: Rule } = {
  power: 'mul',
  woods: 'mul',
  ironScatter: 'mul',
  ironLoss: 'mul',
  putterPower: 'mul',
  scatter: 'mul',
  loss: 'mul',
  curve: 'mul',
  spin: 'mul',
  loft: 'add',
  wedgeLoft: 'add',
  wedgeSpin: 'mul',
  wind: 'mul',
  sandStrike: 'first',
  roughStrike: 'first',
  touch: 'mul',
  puttScatter: 'add',
  puttScatterScale: 'mul',
  bend: 'add',
  puttSpin: 'add',
  chipSand: 'max',
  chipAll: 'max',
  sandPutt: 'mul',
  roll: 'mul',
  sand: 'mul',
  green: 'mul',
  rough: 'mul',
  rail: 'mul',
  keep: 'mul',
  hop: 'mul',
  belt: 'mul',
  trail: 'or',
  streamers: 'or',
  pennant: 'or',
  fireworks: 'or',
  piggy: 'or',
  firstStroke: 'each',
  rest: 'or',
  chalk: 'or',
  underParPay: 'max',
  retake: 'or',
  freeLoss: 'or',
  cupRadius: 'max',
};

/** `kit` with the figures of the item `id` (if one is sold) combined into it. */
function combine(kit: Record<string, unknown>, id: string) {
  const item = itemById(id);
  if (!item) return;
  for (const [key, value] of Object.entries(item.figures)) {
    const rule = COMBINE[key as keyof Kit];
    const had = kit[key];
    if (rule === 'mul') kit[key] = (had as number) * (value as number);
    else if (rule === 'add') kit[key] = (had as number) + (value as number);
    else if (rule === 'max') kit[key] = had === null ? value : Math.max(had as number, value as number);
    else if (rule === 'or') kit[key] = had || value;
    else if (rule === 'first') kit[key] = had ?? value;
    else {
      const a = had as Record<string, number>,
        b = value as Record<string, number>;
      kit[key] = Object.fromEntries(Object.keys(a).map((k) => [k, a[k] * (b[k] ?? 1)]));
    }
  }
}

/** `n` held between the least and the most `range` allows. */
function held(n: number, range: { least?: number; most?: number }): number {
  return Math.min(range.most ?? Infinity, Math.max(range.least ?? -Infinity, n));
}

/**
 * The kit the three slots come to: each figure the product (or sum) of what the slots say of it, inside `CEILINGS`. Three
 * empty slots are `NO_KIT` itself, so a game with nothing worn is not merely like the game as it was but passes it the same object.
 */
export function kitOf(slots: KitSlots): Kit {
  if (!itemById(slots.club) && !itemById(slots.ball) && !itemById(slots.accessory)) return NO_KIT;
  const kit = structuredClone(NO_KIT) as unknown as Record<string, unknown>;
  for (const aisle of AISLES) combine(kit, slots[aisle]);
  for (const [key, range] of Object.entries(CEILINGS)) kit[key] = held(kit[key] as number, range);
  return kit as unknown as Kit;
}

/** What a hole scored at `strokes` on a par of `par` pays, at `underPar` coins a stroke under; nothing for one picked up. */
export function paid(
  strokes: number,
  par: number,
  pickedUp: boolean,
  underPar: number = PAY.underPar,
): { coins: number; gems: number } {
  if (pickedUp) return { coins: 0, gems: 0 };
  return {
    coins: PAY.finish + Math.max(0, par - strokes) * underPar,
    gems: strokes === 1 ? PAY.holeInOne : 0,
  };
}
