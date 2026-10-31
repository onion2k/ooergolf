/**
 * Copernicus: the middle course of the Moon, the second of three, a great crater with its terraced wall. Nine holes made by
 * `golfHole` from a spec each and never drawn by hand, as The Heath and The Woods are: a par three, four or five (4, 3, 5, 4, 4, 3,
 * 5, 4, 4, which add to thirty-six), the threes 240 yards, the fours 490 or 500 and the fives 630 and 640, on fairways of ten or
 * eleven tiles over hills of 0.7 steepness, with quick, well turned greens (11.8, a contour of 0.9) and three to six bunkers a hole.
 * Every hole has a crater: eight are ponds of 66 to 104 tiles of water across the line, which the starting club flies but a short
 * or a crooked ball finds, and the fourth, Kepler's Rim, has instead a lake of 134 tiles beside the line of a left-hand dogleg. Four
 * holes bend, by 35 to 40 degrees both ways, and none has a lane: the Moon has no wood.
 *
 * What the Moon takes away it takes from every hole: no tree, no wood and no lane (`GolfSpec.trees` is nought and the generator
 * refuses the rest by name), and no wind whatever the spec says, so none is asked for. What it adds is the clock: the world runs at
 * 0.655 of the frames' (`BIOMES.moon.pace`), so a ball covers the same distance and hangs 1.53 times as long, and the dust holds a
 * ball dead (keep 0.05, bounce 0.03, power 0.7), so a ball in the rough comes out short. So what is hard here is the length, the
 * crater and the narrow room between the dust on either side, with no shelter to lean on and no wind to blame.
 *
 * What it was asked for of how it plays is a round about par, from a tenth of a stroke a hole under to two tenths over (35.1 to
 * 37.8 for the par of 36). The pace gate's player takes 35.81 over its sixteen seeds, 0.02 a hole under, with no hole picked up in
 * any round, and 35.44 over the thirty-two seeds after them (17 to 48), which no choice was made on, with The Central Peak picked
 * up once in 32 rounds. The first figures (a four of 400 yards, a three of 190, a five of 540, a crater of 4.2 to 5.2 tiles of
 * radius, greens at 12.5 and a contour of 0.8) played about 0.45 of a stroke a hole under par, so the holes were lengthened, the
 * craters widened and the greens quickened to what they are (the contour went to 0.9 with them, a tenth over the 0.8 asked for).
 *
 * Seeds were chosen as The Woods' were: every seed from 1 to 24 played for twelve rounds by the pace gate's player, and then held
 * to the gate's sixteen as a whole round, since a hole's chance is the next hole's and a seed that plays well alone is not the one
 * that plays well after others. A hole's comment says what it is for and the mean of its strokes over 48 rounds of the hole alone
 * (rounds 1 to 48, of which the choice used the first twelve). The par threes play at least 0.4 under par on every one of the twenty-four seeds: a 3-wood flies a
 * crater, and the dust is a hazard only for the ball that does not reach.
 *
 * Made when first asked for and not as the page loads, as The Links are.
 */
import type { HoleDef } from './course';
import { golfHole, type GolfSpec } from './golf';

/** The Moon, with no tree and the hills at 0.7 steepness, not lifted, rolling as the newer courses' land does. */
const RIM = { biome: 'moon', feel: 'hills', steepness: 0.7, rolling: true, trees: 0, heighten: 1 } as const;
/** A crater across the line of a hole, `at` of the way along: 66 to 104 tiles of water, a pond and not a lake, and wide enough to be carried and not walked round. */
const across = (at = 0.55, size: [number, number] = [4.8, 5.6]): GolfSpec['ponds'] => [{ at, side: 0, size }];

export const COPERNICUS_SPECS: readonly GolfSpec[] = [
  {
    name: 'Sea of Rains',
    par: 4,
    length: 490,
    bend: 0,
    width: 11,
    // seed 16: the opening four, straight, with a crater of 88 tiles across the line at 0.55 of the way, a round of
    // 3.92 to the par of 4 over 48 rounds and none picked up, a ball in four rounds lost to the crater
    seed: 16,
    ...RIM,
    bunkers: { fairway: 2, green: 3 },
    ponds: across(),
    contour: 0.9,
    greens: 11.8,
  },
  {
    name: 'Eratosthenes',
    par: 3,
    length: 240,
    bend: 0,
    width: 10,
    // seed 13: the first three, 240 yards with a crater of 67 tiles at 0.6 of the way, a round of 2.60 to the par of 3
    // over 48 rounds and none picked up. All twenty-four seeds played between 2.08 and 2.58 over twelve rounds: a
    // stroke under par is what this three gives, and this seed gives the least of it
    seed: 13,
    ...RIM,
    bunkers: { fairway: 0, green: 3 },
    ponds: across(0.6, [4.4, 5]),
    contour: 0.9,
    greens: 11.8,
  },
  {
    name: 'Apennine Climb',
    par: 5,
    length: 630,
    bend: 40,
    width: 11,
    // seed 14: the first five, 630 yards with a right-hand bend of 40 degrees and a crater of 97 tiles at 0.6 of the
    // way, a round of 5.29 over 48 rounds and none picked up. Seeds 2, 13 and 19 were picked up once each in twelve
    // rounds
    seed: 14,
    ...RIM,
    bunkers: { fairway: 3, green: 3 },
    ponds: across(0.6),
    contour: 0.9,
    greens: 11.8,
  },
  {
    name: 'Kepler’s Rim',
    par: 4,
    length: 490,
    bend: -40,
    width: 10,
    // seed 20: a left-hand dogleg of 40 degrees with a lake of 134 tiles on its right-hand side, beside the line, that
    // a drive aimed at the corner must keep out of, a round of 3.73 over 48 rounds and none picked up. Three of the
    // first twenty-four seeds were refused (the fairway would not rest a ball) and are not seeds of this hole
    seed: 20,
    ...RIM,
    bunkers: { fairway: 2, green: 3 },
    ponds: [],
    lakes: [{ at: 0.45, side: 1, size: [7, 8], islands: [] }],
    contour: 0.9,
    greens: 11.8,
  },
  {
    name: 'The Central Peak',
    par: 4,
    length: 490,
    bend: 0,
    width: 11,
    // seed 10: a straight four, 490 yards, with a crater of 100 tiles at the middle of the way, a round of 4.02 over 48
    // rounds and one picked up (the only pick-up in the 48 rounds of any hole alone on this course). Seeds 1, 6 and 15
    // were picked up once or more in twelve rounds
    seed: 10,
    ...RIM,
    bunkers: { fairway: 3, green: 3 },
    ponds: across(0.5),
    contour: 0.9,
    greens: 11.8,
  },
  {
    name: 'Ejecta',
    par: 3,
    length: 240,
    bend: 0,
    width: 10,
    // seed 4: the short three, 240 yards with a crater of 66 tiles at 0.55 of the way, a round of 2.48 over 48 rounds
    // and none picked up: the easiest hole of the nine. All twenty-four seeds played between 0.5 and 0.92 under par
    // over twelve rounds, and this is the hardest of them
    seed: 4,
    ...RIM,
    bunkers: { fairway: 0, green: 4 },
    ponds: across(0.55, [4.4, 5]),
    contour: 0.9,
    greens: 11.8,
  },
  {
    name: 'Terraced Wall',
    par: 5,
    length: 640,
    bend: -35,
    width: 11,
    // seed 24: a left-hand dogleg of 35 degrees with a crater of 89 tiles at 0.55 of the way, a round of 4.98 over 48
    // rounds and none picked up. Seeds 2 and 21 played 0.92 over in twelve rounds and were left for the milder
    seed: 24,
    ...RIM,
    bunkers: { fairway: 3, green: 3 },
    ponds: across(0.55),
    contour: 0.9,
    greens: 11.8,
  },
  {
    name: 'Crater Floor',
    par: 4,
    length: 490,
    bend: 35,
    width: 10,
    // seed 13: a right-hand dogleg of 35 degrees, 490 yards, with a crater of 104 tiles, the hardest hole of the course
    // alone, a round of 4.38 over 48 rounds and none picked up. Seeds 4, 12 and 22 were picked up in twelve rounds
    seed: 13,
    ...RIM,
    bunkers: { fairway: 2, green: 3 },
    ponds: across(0.55),
    contour: 0.9,
    greens: 11.8,
  },
  {
    name: 'Gassendi',
    par: 4,
    length: 500,
    bend: 0,
    width: 11,
    // seed 20: the last hole, a straight four of 500 yards, the longest, with a crater of 74 tiles at the middle, a
    // round of 4.04 over 48 rounds and none picked up. Seed 12 took 1.5 over alone and was picked up three times in
    // twelve rounds, and seed 3 was refused
    seed: 20,
    ...RIM,
    bunkers: { fairway: 3, green: 3 },
    ponds: across(0.5),
    contour: 0.9,
    greens: 11.8,
  },
];

let made: readonly HoleDef[] | undefined;
export function copernicus(): readonly HoleDef[] {
  return (made ??= COPERNICUS_SPECS.map((spec) => golfHole(spec)));
}
export const COPERNICUS_SUMMARY = {
  holes: COPERNICUS_SPECS.length,
  par: COPERNICUS_SPECS.reduce((a, s) => a + s.par, 0),
};
