/**
 * The Saltpan: the first course of the desert and the easy one. Nine holes, a par three, four or five (3, 4, 4, 3, 4, 3, 4, 4,
 * 5, which add to thirty-four) on fairways of fourteen to twenty tiles, each with a pan across or beside the line that a drive can
 * run across (`GolfSpec.ponds`, which in the desert are hardpan and not water: a ball skitters over a pan and is never lost to it),
 * a wind of nine to twelve miles an hour, gentle hills and a few bunkers, and cacti scattered forty to ninety to a hole. Made by
 * `golfHole` from a spec each and never drawn by hand, each hole's seed chosen as The Woods' were: by playing seeds with the pace
 * gate's player and looking at the maps, then holding the nine together on the gate's sixteen.
 *
 * What is held to the table (`test/saltpan.test.ts`) is the counts and the figures it was asked for. What it was asked for of how it
 * plays is a round a fifth to two fifths of a stroke a hole under par (30.4 to 32.2 for the par of 34). The pace gate's player takes
 * 31.38 over its sixteen seeds, 0.29 a hole under, with no hole picked up in more than one round of sixteen (Bone Flat, once). A seed
 * was chosen by its mean over 16 rounds of the hole alone, then every hole's seed was moved in turn on the whole course and kept
 * where the course came out in its target with the holes near the figure each was given, since a hole in a round of nine draws on the
 * same chance as the holes before it and does not come out as it did alone (White Wash played 3.25 alone and 3.63 in the round).
 *
 * What makes it easy is the room and the run: a firm fairway runs a drive on (the desert's fairway keeps 0.55 of a landing and
 * rolls at 18), the pans are ground and cost nothing, and the rough, which is the desert's sparse rough, is a lie to play from and
 * not a loss. What keeps it from being a walk is the wind, which is the desert's (twelve miles an hour on six holes), the sand, and
 * the length: every par three is as long as the course's par threes go (220 to 225 yards) and every four is 430 to 490. The pace
 * player's par threes are the easiest holes of the nine, 2.4 to 2.5 against a par of 3 (no hole of the desert with no water makes a
 * par three much harder than that), and the fours and the five carry the course up to its target. The greens are slow and flat
 * (14, a contour of 0.4), the easiest the game has.
 *
 * A hole's name draws its wind (`windOf`): Tumbleweed Run was first Tumble Run, whose wind bends the grass 0.389 of a radian across
 * the ground where the rule asks for 0.4.
 *
 * Made when first asked for and not as the page loads, as The Links are.
 */
import type { HoleDef } from './course';
import { golfHole, type GolfSpec } from './golf';

/** The desert's ground: hills of the Links' kind, in the desert biome (a pan for a lake, a cactus for a tree). */
const GROUND = { feel: 'hills', steepness: 0.6, rolling: true, biome: 'desert' } as const;

export const SALTPAN_SPECS: readonly GolfSpec[] = [
  {
    name: 'Salt Flat',
    par: 3,
    length: 225,
    bend: 0,
    width: 16,
    // seed 17: the opener, a par three of 225 yards with a pan of 103 tiles across the line a little under half way, which the
    // tee shot flies or runs across; a round of 2.50 (0.50 under) over the gate's sixteen and none picked up. Seeds 1 to 24
    // all play 2.1 to 2.6 alone: the pan costs nothing, and a par three that a driver reaches is a hole of birdies
    seed: 17,
    ...GROUND,
    bunkers: { fairway: 1, green: 4 },
    ponds: [{ at: 0.5, side: 0, size: [5, 6] }],
    trees: 60,
    wind: 12,
    contour: 0.4,
    greens: 14,
  },
  {
    name: 'White Wash',
    par: 4,
    length: 490,
    bend: 0,
    width: 14,
    // seed 3: the long straight four, 490 yards at 14 tiles with a pan of 135 tiles, the biggest of the course's fours, across
    // the line at the middle: a round of 3.63 (0.37 under) and none picked up, 3.25 alone. At 360 yards and eighteen wide
    // it was 2.6 to 3.0
    seed: 3,
    ...GROUND,
    bunkers: { fairway: 3, green: 3 },
    ponds: [{ at: 0.45, side: 0, size: [5.5, 7] }],
    trees: 70,
    wind: 12,
    contour: 0.4,
    greens: 14,
  },
  {
    name: 'Mirage Road',
    par: 4,
    length: 430,
    bend: -25,
    width: 16,
    // seed 3: a left-hand dogleg of 25 degrees, 430 yards, a pan of 59 tiles on its inside edge; a round of 4.00 (par) and
    // none picked up. The seed the course wanted was a hole near par: seeds 1 to 24 played 3.1 to 5.1 alone
    seed: 3,
    ...GROUND,
    bunkers: { fairway: 2, green: 2 },
    ponds: [{ at: 0.35, side: -1, size: [4, 5] }],
    trees: 55,
    wind: 9,
    contour: 0.4,
    greens: 14,
  },
  {
    name: 'Dry Well',
    par: 3,
    length: 225,
    bend: 0,
    width: 14,
    // seed 16: a par three of 225 yards at 14 tiles, with a pan of 56 tiles to its right, the smallest pan of the three and the
    // fewest cacti of the course (40): a round of 2.44 (0.56 under) and none picked up
    seed: 16,
    ...GROUND,
    bunkers: { fairway: 0, green: 3 },
    ponds: [{ at: 0.5, side: 1, size: [4, 5] }],
    trees: 40,
    wind: 12,
    contour: 0.4,
    greens: 14,
  },
  {
    name: 'Crust Walk',
    par: 4,
    length: 440,
    bend: 30,
    width: 17,
    // seed 18: a right-hand dogleg of 30 degrees, 440 yards and the widest of the fours (17 tiles), with a pan of 102 tiles
    // across the line and 80 cacti: a round of 4.25 (a quarter over) and none picked up. Seeds 1 to 24 played it 3.4 to 5.7
    // alone, the widest spread of the fours
    seed: 18,
    ...GROUND,
    bunkers: { fairway: 2, green: 2 },
    ponds: [{ at: 0.55, side: 0, size: [5, 6.5] }],
    trees: 80,
    wind: 10,
    contour: 0.4,
    greens: 14,
  },
  {
    name: 'Glass Pan',
    par: 3,
    length: 220,
    bend: 0,
    width: 20,
    // seed 11: the widest hole (20 tiles) and the biggest pan (168 tiles), across the line of a par three of 220 yards: a round
    // of 2.38 (0.62 under) and none picked up. A drive that does not carry it rolls across it and on to the green's front
    seed: 11,
    ...GROUND,
    bunkers: { fairway: 0, green: 2 },
    ponds: [{ at: 0.55, side: 0, size: [6, 7.5] }],
    trees: 45,
    wind: 10,
    contour: 0.4,
    greens: 14,
  },
  {
    name: 'Tumbleweed Run',
    par: 4,
    length: 490,
    bend: 0,
    width: 14,
    // seed 5: the straight four of 490 yards at 14 tiles with two pans, 118 tiles, one at three tenths and one beside the
    // line, and the most cacti of the course (90): a round of 3.25 (0.75 under) and none picked up, the easiest four, flat
    // (the lowest relief of the course, 8.5 yards) and open. Seeds 1 to 24 played it 3.2 to 3.6 alone
    seed: 5,
    ...GROUND,
    bunkers: { fairway: 3, green: 3 },
    ponds: [
      { at: 0.3, side: 0, size: [4, 5] },
      { at: 0.7, side: -1, size: [3.5, 4.5] },
    ],
    trees: 90,
    wind: 12,
    contour: 0.4,
    greens: 14,
  },
  {
    name: 'Bone Flat',
    par: 4,
    length: 440,
    bend: -30,
    width: 15,
    // seed 4: a left-hand dogleg of 30 degrees, 440 yards and 136 tiles of sand, the most of the fours: a round of 4.56 (over
    // by half a stroke) and picked up once, the hardest hole of the nine. Seed 3 played 3.8 alone and 4.0 in the round;
    // this one is rougher
    seed: 4,
    ...GROUND,
    bunkers: { fairway: 2, green: 3 },
    ponds: [{ at: 0.5, side: 0, size: [5, 6] }],
    trees: 75,
    wind: 12,
    contour: 0.4,
    greens: 14,
  },
  {
    name: 'Evening Glare',
    par: 5,
    length: 570,
    bend: 25,
    width: 15,
    // seed 16: the five, a right-hand dogleg of 25 degrees at 570 yards with a pan of 141 tiles and 141 of sand: a round of
    // 4.38 (0.62 under) and none picked up.
    seed: 16,
    ...GROUND,
    bunkers: { fairway: 3, green: 3 },
    ponds: [{ at: 0.5, side: 0, size: [5.5, 7] }],
    trees: 85,
    wind: 12,
    contour: 0.4,
    greens: 14,
  },
];

let made: readonly HoleDef[] | undefined;

/** The holes of The Saltpan, made the first time they are asked for and no oftener. */
export function saltpan(): readonly HoleDef[] {
  return (made ??= SALTPAN_SPECS.map((spec) => golfHole(spec)));
}

/** What the start screen says of the course, known without making it: how many holes and what par they add to. */
export const SALTPAN_SUMMARY = { holes: SALTPAN_SPECS.length, par: SALTPAN_SPECS.reduce((a, s) => a + s.par, 0) };
