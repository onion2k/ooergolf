/**
 * Tranquility: the easy course of the Moon, the first of three. Nine holes made by `golfHole` from a spec each and never drawn by
 * hand, as The Heath and The Woods are: a par three, four or five (3, 4, 4, 3, 4, 4, 3, 4, 5, which add to thirty-four), the threes
 * 225 to 230 yards, the fours 470 to 480 and the five 610, on fairways of fourteen to eighteen tiles over hills gentler than the
 * golf before it (a steepness of 0.5 where The Woods' is 0.75), with the greens slow (13.5) and hardly turned (a contour of 0.3 to
 * 0.4) and two to four bunkers a hole. Five holes have a crater across the line, a small one (30 to 39 tiles of water, a pond and
 * not a lake) that the starting club flies: the Moon's water is a crater, a stroke and the ball put back where it was struck from,
 * as water is on earth.
 *
 * What the Moon takes away it takes from every hole: no tree, no wood and no lane (`GolfSpec.trees` is nought and the generator
 * refuses the rest by name), and no wind whatever the spec says, so none is asked for. What it adds is the clock: the world runs at
 * 0.655 of the frames' (`BIOMES.moon.pace`), so a ball covers the same distance and hangs 1.53 times as long, and the dust holds a
 * ball dead (keep 0.05, bounce 0.03, power 0.7), so a ball in the rough comes out short. The yardage is what a hole of the same par
 * is on earth; what is easy here is the room, not the length.
 *
 * What it was asked for of how it plays is a round a little under par, 0.2 to 0.4 of a stroke a hole (30.4 to 32.2 for the par of
 * 34). The pace gate's player takes 31.56 over its sixteen seeds, 0.27 a hole under, with no hole picked up in any round, and 31.44
 * over the thirty-two seeds after them (17 to 48), which no choice was made on, with a hole picked up once in 32 rounds on two
 * holes. Every hole plays under par alone but Lander's Rest: the autopilot, a good golfer, birdies the threes and the five and
 * pars the fours. The yardage was first 170 to 340 yards, and a par four of 340 was two strokes and a half on every seed, a crater
 * across it changing nothing, so the holes were lengthened to what they are.
 *
 * Seeds were chosen as The Woods' were: every seed from 1 to 24 played for twelve rounds by the pace gate's player, the hard ones of
 * the easy holes taken, and then held to the gate's sixteen as a whole round, since a hole's chance is the next hole's and a seed
 * that plays well alone is not the one that plays well after others. A hole's comment says what it is for and the mean of its
 * strokes over 48 rounds of the hole alone (rounds 1 to 48, of which the choice used the first twelve).
 *
 * Made when first asked for and not as the page loads, as The Links are.
 */
import type { HoleDef } from './course';
import { golfHole, type GolfSpec } from './golf';

/** The Moon, with no tree and the ground gentle: half the steepness of The Woods' hills, not lifted, and rolling as the newer courses' land does. */
const MARE = { biome: 'moon', feel: 'hills', steepness: 0.5, rolling: true, trees: 0, heighten: 1 } as const;
/** A crater across the line of a hole, `at` of the way along: small, 30 to 39 tiles of water, a pond and not a lake. */
const crater = (at = 0.55, size: [number, number] = [2.6, 3.4]): GolfSpec['ponds'] => [{ at, side: 0, size }];

export const TRANQUILITY_SPECS: readonly GolfSpec[] = [
  {
    name: 'Earthrise',
    par: 3,
    length: 225,
    bend: 0,
    width: 16,
    // seed 13: the opening three, straight and wide with nothing in the way and a green with two bunkers, a round of
    // 2.38 to the par of 3 over 48 rounds and none picked up: the easiest hole of the nine, mostly a birdie. Of the
    // seeds 1 to 24 only 11 (2.67 over twelve rounds) played harder
    seed: 13,
    ...MARE,
    bunkers: { fairway: 0, green: 2 },
    ponds: [],
    contour: 0.3,
    greens: 13.5,
  },
  {
    name: 'Small Step',
    par: 4,
    length: 470,
    bend: 0,
    width: 16,
    // seed 15: a straight four with a crater of 32 tiles across the line, a round of 3.81 to the par of 4 over 48
    // rounds and none picked up, 0.27 balls a round lost to the crater
    seed: 15,
    ...MARE,
    bunkers: { fairway: 1, green: 2 },
    ponds: crater(),
    contour: 0.3,
    greens: 13.5,
  },
  {
    name: 'Mare Flat',
    par: 4,
    length: 480,
    bend: 25,
    width: 15,
    // seed 5: a shallow right-hand dogleg of 25 degrees with no water and three bunkers, a round of 3.83 over 48 rounds
    // and none picked up, one ball in twelve rounds out of bounds on the bend. The hardest of the fours without water
    seed: 5,
    ...MARE,
    bunkers: { fairway: 1, green: 2 },
    ponds: [],
    contour: 0.4,
    greens: 13.5,
  },
  {
    name: 'Quiet Basin',
    par: 3,
    length: 230,
    bend: 0,
    width: 14,
    // seed 4: the short three whose crater (39 tiles) lies at 0.85 of the way, just short of the green, so a ball short
    // of the carry is in it, a round of 2.94 over 48 rounds and none picked up. Seeds 2, 6 and 17 played harder alone
    // (3.33 to 3.75 over twelve rounds) and were picked up in two, one and one of the twelve
    seed: 4,
    ...MARE,
    bunkers: { fairway: 0, green: 3 },
    ponds: crater(0.85, [3, 3.6]),
    contour: 0.4,
    greens: 13.5,
  },
  {
    name: 'Footprint',
    par: 4,
    length: 470,
    bend: -20,
    width: 16,
    // seed 7: a left-hand dogleg of 20 degrees with no water and two bunkers in the fairway, a round of 3.73 over 48
    // rounds and none picked up
    seed: 7,
    ...MARE,
    bunkers: { fairway: 2, green: 1 },
    ponds: [],
    contour: 0.3,
    greens: 13.5,
  },
  {
    name: 'Dawn Plain',
    par: 4,
    length: 480,
    bend: 0,
    width: 18,
    // seed 4: the widest hole of the course (eighteen tiles) with a crater of 34 tiles across the line, a round of 3.94
    // over 48 rounds and none picked up, a ball in four rounds lost to the crater
    seed: 4,
    ...MARE,
    bunkers: { fairway: 1, green: 2 },
    ponds: crater(0.5),
    contour: 0.4,
    greens: 13.5,
  },
  {
    name: 'Sea of Calm',
    par: 3,
    length: 225,
    bend: 0,
    width: 14,
    // seed 19: the three with nothing to fear, straight and wide with three bunkers at the green, a round of 2.35 over
    // 48 rounds and none picked up
    seed: 19,
    ...MARE,
    bunkers: { fairway: 0, green: 3 },
    ponds: [],
    contour: 0.4,
    greens: 13.5,
  },
  {
    name: 'Lander’s Rest',
    par: 4,
    length: 480,
    bend: 30,
    width: 14,
    // seed 14: the hardest hole of the course and the only one over par alone, a right-hand dogleg of 30 degrees with a
    // crater of 30 tiles on the way to the green and four bunkers, a round of 4.08 over 48 rounds and none picked up.
    // Seeds 1, 18 and 4 played harder still (4.5 to 4.83 over twelve rounds) and were picked up once in twelve each
    seed: 14,
    ...MARE,
    bunkers: { fairway: 2, green: 2 },
    ponds: crater(0.55),
    contour: 0.4,
    greens: 13.5,
  },
  {
    name: 'Moonrise',
    par: 5,
    length: 610,
    bend: -25,
    width: 15,
    // seed 21: the last hole, a five with a left-hand bend of 25 degrees and a crater of 31 tiles, a round of 4.54 over
    // 48 rounds and none picked up: half a stroke under par
    seed: 21,
    ...MARE,
    bunkers: { fairway: 2, green: 2 },
    ponds: crater(0.6),
    contour: 0.4,
    greens: 13.5,
  },
];

let made: readonly HoleDef[] | undefined;
export function tranquility(): readonly HoleDef[] {
  return (made ??= TRANQUILITY_SPECS.map((spec) => golfHole(spec)));
}
export const TRANQUILITY_SUMMARY = {
  holes: TRANQUILITY_SPECS.length,
  par: TRANQUILITY_SPECS.reduce((a, s) => a + s.par, 0),
};
