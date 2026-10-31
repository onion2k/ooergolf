/**
 * Neon Park: the easy course of the Future (`biome: 'future'`), nine holes of golf with fairways thirteen to eighteen
 * tiles wide, gentle ground and the lively plates the future is laid on, holograms in groves and a mirror across the line
 * of every hole: par three, four or five (3, 4, 4, 5, 3, 4, 3, 4, 4, which add to thirty-four). Three doglegs, two to the
 * right and one to the left, bend no more than 30 degrees, and the winds are the lightest of the three courses (6 to 10).
 * Made by `golfHole` from a spec each and never drawn by hand, as The Links are, each hole's seed chosen as The Woods'
 * were: by playing seeds with the pace gate's player and looking at the maps.
 *
 * What is held to the table (`test/neonpark.test.ts`) is the counts and the figures it was asked for. What it was asked
 * for of how it plays is a round 0.2 to 0.4 of a stroke a hole under par (30.4 to 32.2 for the par of 34). The pace
 * gate's player takes 31.63 over its sixteen seeds, 0.26 a hole under, with no hole picked up, and 31.63 over the sixteen
 * after them with one pick-up in one round. A seed was chosen by its mean over sixteen rounds of the hole alone and then
 * held to the whole course, since a hole in a round of nine draws on the same chance as the holes before it and does not
 * come out as it did alone.
 *
 * What makes it easy is the width and the light wind; what keeps it from being a stroke a hole too easy is the water and
 * the holograms. A hologram is passed through, slowed to half once on entering, so a grove costs a ball distance and
 * never a stop, and the pace player lost over a stroke on a dogleg with ninety of them (4.7 a round on a par four against
 * 4.2 with forty). Every hole has a pond, a mirror, across the line (the plan asked for a few): the fast player is not
 * stopped by a straight wide hole of 440 yards, which took 3.1 with no water, and it is the water that brings it to par.
 *
 * Made when first asked for and not as the page loads, as The Links are.
 */
import type { HoleDef } from './course';
import { golfHole, type GolfSpec } from './golf';

const FUTURE = { feel: 'hills', steepness: 0.55, rolling: true, biome: 'future' } as const;

export const NEON_PARK_SPECS: readonly GolfSpec[] = [
  {
    name: 'Neon Gate',
    par: 3,
    length: 205,
    bend: 0,
    width: 16,
    // seed 15 of the thirty: the opening par three, a pond of 101 tiles across the line three tenths short of the
    // green and 60 holograms about it. 2.88 a round alone over sixteen (0.38 balls a round in the pond), none picked
    // up, and 2.88 on the gate's sixteen. Without the pond the same hole took 2.0 to 2.3 a round, a stroke under par,
    // which is the pace player at a short hole
    seed: 15,
    ...FUTURE,
    bunkers: { fairway: 0, green: 3 },
    ponds: [{ at: 0.7, side: 0, size: [4.5, 5.5] }],
    trees: 60,
    wind: 6,
    contour: 0.6,
    greens: 12,
  },
  {
    name: 'Arcade Row',
    par: 4,
    length: 440,
    bend: 0,
    width: 18,
    // seed 26: the widest fairway (eighteen tiles) with a pond of 87 tiles across it at three fifths of the way,
    // which a drive carries and a lay-up does not need to. 3.75 alone over sixteen, none picked up, 3.63 on the
    // gate's sixteen. Without the pond and at 340 yards it took 2.6, a stroke and a half under par
    seed: 26,
    ...FUTURE,
    bunkers: { fairway: 2, green: 3 },
    ponds: [{ at: 0.6, side: 0, size: [5, 5.8] }],
    trees: 70,
    wind: 7,
    contour: 0.6,
    greens: 12,
  },
  {
    name: 'Hologram Alley',
    par: 4,
    length: 430,
    bend: 25,
    width: 15,
    // seed 4: a left-to-right dogleg of 25 degrees, the first bend, with only 40 holograms: at 440 yards and 80
    // holograms the thirty seeds averaged 4.22 and at 430 and 40 they average 3.99, since a ball that runs through a
    // grove loses half its speed at each canopy it enters and a bend is where the pace player has to hit through one.
    // 4.25 on the gate's sixteen, the hardest hole of the nine, none picked up
    seed: 4,
    ...FUTURE,
    bunkers: { fairway: 2, green: 3 },
    ponds: [{ at: 0.7, side: 0, size: [5, 5.8] }],
    trees: 40,
    wind: 8,
    contour: 0.7,
    greens: 12,
  },
  {
    name: 'Laser Lawn',
    par: 5,
    length: 580,
    bend: 0,
    width: 17,
    // seed 23: the long five, 580 yards with two ponds across the line (158 tiles between them, one at two fifths and
    // a small one before the green) in 80 holograms. 4.19 alone, none picked up, 4.06 on the gate's sixteen. Seed 26
    // played as well alone but was picked up once
    seed: 23,
    ...FUTURE,
    bunkers: { fairway: 2, green: 3 },
    ponds: [
      { at: 0.4, side: 0, size: [5, 6] },
      { at: 0.85, side: 0, size: [4, 5] },
    ],
    trees: 80,
    wind: 8,
    contour: 0.7,
    greens: 12,
  },
  {
    name: 'Pixel Plaza',
    par: 3,
    length: 215,
    bend: 0,
    width: 14,
    // seed 30: the second par three, 215 yards over a pond of 97 tiles at three fifths. 2.88 alone over sixteen, none
    // picked up, 2.38 on the gate's sixteen, the easiest hole of the nine
    seed: 30,
    ...FUTURE,
    bunkers: { fairway: 0, green: 3 },
    ponds: [{ at: 0.6, side: 0, size: [5, 6] }],
    trees: 50,
    wind: 9,
    contour: 0.7,
    greens: 12,
  },
  {
    name: 'Synth Drive',
    par: 4,
    length: 430,
    bend: -30,
    width: 14,
    // seed 14: a right-to-left dogleg of 30 degrees with a pond of 85 tiles across the line and only 40 holograms.
    // 3.63 alone, none picked up, 3.56 on the gate's sixteen
    seed: 14,
    ...FUTURE,
    bunkers: { fairway: 2, green: 3 },
    ponds: [{ at: 0.65, side: 0, size: [5, 5.8] }],
    trees: 40,
    wind: 8,
    contour: 0.7,
    greens: 12,
  },
  {
    name: 'Light Rail',
    par: 3,
    length: 210,
    bend: 0,
    width: 13,
    // seed 19: the shortest-looking three at 210 yards, with the pond at four fifths of the way, close in front of
    // the green, 53 tiles, 40 holograms. 2.94 alone over sixteen (0.06 balls a round lost) and 3.25 on the gate's
    // sixteen. Seeds 3 and 27 found the pond so often that the hole took 4.6 and 4.75
    seed: 19,
    ...FUTURE,
    bunkers: { fairway: 0, green: 3 },
    ponds: [{ at: 0.8, side: 0, size: [4, 5] }],
    trees: 40,
    wind: 6,
    contour: 0.6,
    greens: 12,
  },
  {
    name: 'Glow Walk',
    par: 4,
    length: 440,
    bend: 0,
    width: 15,
    // seed 15: a straight four of 440 yards with a pond of 109 tiles three quarters of the way down and 80 holograms
    // along it. 3.38 alone over sixteen and 3.94 on the gate's sixteen, none picked up
    seed: 15,
    ...FUTURE,
    bunkers: { fairway: 2, green: 3 },
    ponds: [{ at: 0.75, side: 0, size: [5, 5.8] }],
    trees: 80,
    wind: 10,
    contour: 0.7,
    greens: 12,
  },
  {
    name: 'Encore',
    par: 4,
    length: 430,
    bend: 30,
    width: 14,
    // seed 9: the last hole, a right-hand dogleg of 30 degrees with a pond of 90 tiles at seven tenths and 40
    // holograms, in a wind of ten. 3.63 alone over sixteen, none picked up, 3.69 on the gate's sixteen. At 90
    // holograms the first draft took 4.7
    seed: 9,
    ...FUTURE,
    bunkers: { fairway: 2, green: 3 },
    ponds: [{ at: 0.7, side: 0, size: [5, 5.8] }],
    trees: 40,
    wind: 10,
    contour: 0.8,
    greens: 12,
  },
];

let made: readonly HoleDef[] | undefined;

/** The holes of Neon Park, made the first time they are asked for and no oftener. */
export function neonPark(): readonly HoleDef[] {
  return (made ??= NEON_PARK_SPECS.map((spec) => golfHole(spec)));
}

/** What the start screen says of the course, known without making it: how many holes and what par they add to. */
export const NEON_PARK_SUMMARY = { holes: NEON_PARK_SPECS.length, par: NEON_PARK_SPECS.reduce((a, s) => a + s.par, 0) };
