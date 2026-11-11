/**
 * The daily hole: one golf hole a day, the same for every player, made from the UTC day alone, so that two people on two sides of the
 * world who play on the same day play the same hole and can compare what it took. A day is a string, `YYYY-MM-DD`; the page reads
 * the clock once and hands the day in, and nothing here reaches for the time of its own but `utcDay`, which is given a `Date`.
 *
 * The hole is made by `golfHole` from a spec the day draws (`dailySpec`): the biome by the turn of the days, a par of three to five with
 * a length to match, a bend, a width, bunkers, a pond or none, trees (none on the Moon), a wind and greens. Some specs the generator
 * refuses (a pond that will not fit, a fairway that will not rest a ball), so the next seed up is tried, up to `RETRIES` times, and
 * after those a plain spec that a test holds never to be refused, so there is always a hole. It is never a course's, and no list of
 * courses holds it: the previews, the field, the pace baseline and the hashes read `COURSES` and so are what they were.
 *
 * Pure and seeded: the same day is the same hole, byte for byte.
 */
import type { BiomeName } from './biome';
import type { HoleDef } from './course';
import { golfHole, type GolfSpec } from './golf';
import { seeded } from './random';
import { dayNumber, dayWords, isDay } from './days';
import { nameSeed } from './shaping';
import { scoreName } from './score';

export { dayNumber, dayWords, followsDay, isDay, shiftDay, utcDay } from './days';

/** Where the game is played, which a shared result carries and nothing else of the player. */
export const GAME_ADDRESS = 'https://golf.ooer.com/';

/** How many seeds above the day's own are tried where the generator refuses a spec, before the plain one is made. */
export const RETRIES = 8;

/** The biomes in the order the days turn through them: a day's is its number of days since 1 January 1970, modulo these. */
export const TURN: readonly BiomeName[] = ['earth', 'desert', 'moon', 'future'];

/** The biome of a day: the turn of the days through `TURN`. */
export function biomeOfDay(day: string): BiomeName {
  return TURN[((dayNumber(day) % TURN.length) + TURN.length) % TURN.length];
}

const between = (random: () => number, least: number, most: number) => least + random() * (most - least);
const whole = (random: () => number, least: number, most: number) => Math.floor(between(random, least, most + 1));

/** The yards a par runs over, short to long. A par three is a one-shot hole and a five two good drives and a pitch. */
const LENGTHS: Record<3 | 4 | 5, [number, number]> = { 3: [160, 235], 4: [330, 470], 5: [500, 620] };

/**
 * The spec a day draws, with `attempt` seeds added to its seed where an earlier one was refused. Every draw is made whether or
 * not it is used, in a fixed order, so that one day's choices never move another's: a change to what a par three has does not
 * change a par five's bend.
 */
export function dailySpec(day: string, attempt = 0): GolfSpec {
  if (!isDay(day)) throw new RangeError(`a day is YYYY-MM-DD, not ${String(day)}`);
  const random = seeded(nameSeed(day));
  const biome = biomeOfDay(day);
  const par = (3 + Math.floor(random() * 3)) as 3 | 4 | 5;
  const [short, long] = LENGTHS[par];
  const length = Math.round(between(random, short, long));
  const bends = random() < 0.5;
  const bend = par === 3 || !bends ? 0 : Math.round(between(random, 15, 45)) * (random() < 0.5 ? -1 : 1);
  const width = Math.round(between(random, 9, 14));
  const fairwayBunkers = par === 3 ? 0 : whole(random, 0, 3);
  const greenBunkers = whole(random, 1, 4);
  const pond = random() < 0.5;
  const pondAt = between(random, 0.4, 0.75);
  const pondSide = [-1, 0, 1][whole(random, 0, 2)] as -1 | 0 | 1;
  const pondSize = between(random, 3.2, 4.4);
  const trees = whole(random, 30, 110);
  const wind = whole(random, 0, 18);
  const greens = between(random, 11.5, 14.5);
  const contour = between(random, 0.3, 0.9);
  const steepness = between(random, 0.6, 0.8);
  const seed = Math.floor(random() * 1_000_000) + attempt;
  return {
    name: `Daily ${day}`,
    par,
    length,
    bend,
    width,
    seed,
    feel: 'hills',
    steepness,
    rolling: true,
    biome,
    bunkers: { fairway: fairwayBunkers, green: greenBunkers },
    ponds: pond ? [{ at: pondAt, side: pondSide, size: [pondSize, pondSize + 0.8] }] : [],
    // the Moon has no tree, and a spec that asks for one is refused
    trees: biome === 'moon' ? 0 : trees,
    wind,
    greens: Math.round(greens * 10) / 10,
    contour: Math.round(contour * 100) / 100,
  };
}

/** The spec that is made when every seed of the day's is refused: a plain straight hole of the day's biome, with nothing in it that can be refused. */
export function plainSpec(day: string): GolfSpec {
  return {
    name: `Daily ${day}`,
    par: 4,
    length: 360,
    bend: 0,
    width: 12,
    seed: 1,
    feel: 'hills',
    steepness: 0.6,
    rolling: true,
    biome: biomeOfDay(day),
    bunkers: { fairway: 0, green: 0 },
    ponds: [],
    trees: 0,
    wind: 0,
    greens: 13,
    contour: 0,
  };
}

/** A day's hole, and how it came to be: how many specs the generator refused before it, and whether it was the plain one. */
export interface Dailies {
  hole: HoleDef;
  refused: number;
  plain: boolean;
}

/** The hole of `day`, made by `make` (the generator, unless a test hands in another), and the count of refusals on the way. */
export function dailyBuild(day: string, make: (spec: GolfSpec) => HoleDef = golfHole): Dailies {
  let refused = 0;
  for (let attempt = 0; attempt <= RETRIES; attempt++) {
    try {
      return { hole: make(dailySpec(day, attempt)), refused, plain: false };
    } catch (e) {
      // only the generator's own refusals, which begin with the hole's name, are retried: a bug in this file is not one
      if (!(e instanceof Error && e.message.startsWith(`Daily ${day}:`))) throw e;
      refused++;
    }
  }
  return { hole: make(plainSpec(day)), refused, plain: true };
}

/** The hole of `day`. */
export function dailyHole(day: string): HoleDef {
  return dailyBuild(day).hole;
}

/**
 * What a player shares of a day's go: the day, the par, the strokes and what they are called, and the game's address. Nothing of the
 * player is in it, and nothing of the hole but its par, so it spoils nothing for one who has not played.
 */
export function shareText(day: string, par: number, strokes: number): string {
  const taken = `${strokes} ${strokes === 1 ? 'stroke' : 'strokes'}`;
  return `ooergolf daily, ${dayWords(day)}\nPar ${par}: ${taken}, ${scoreName(strokes, par).replace(/!$/, '')}\n${GAME_ADDRESS}`;
}
