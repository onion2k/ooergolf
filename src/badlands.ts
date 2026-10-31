/**
 * The Badlands: the third course of the desert and the hard one. Nine holes of par 37 (4, 5, 3, 4, 5, 4, 3, 5, 4), long, on fairways of
 * eight to eleven tiles with a wood of cactus along the whole of four of them (`GolfSpec.woods`) and a lane cut through the corner of
 * four doglegs of 40 to 50 degrees (`GolfSpec.gap`); ground lifted up to the most the generator allows (`heighten` 2.5 on the Boneyard,
 * 2.3 on three more); bunkers by the dozen (4 to 10 a hole, 68 over the nine); a pan on five holes; quick, turned greens (11.2, the
 * most contour); and the strongest wind the autopilot is measured to, fifteen miles an hour, on every hole. Made by `golfHole` from a
 * spec each and never drawn by hand, each hole's seed chosen as The Woods' were: by playing seeds with the pace gate's player and
 * looking at the maps, then holding the nine together on the gate's sixteen.
 *
 * What is held to the table (`test/badlands.test.ts`) is the counts and the figures it was asked for. What it was asked for of how it
 * plays is a round half a stroke to nine tenths a hole over par (41.5 to 45.1 for the par of 37). The pace gate's player takes 42.50
 * over its sixteen seeds, 0.61 a hole over, with no hole picked up in more than one round of sixteen (Rattlesnake Ridge, Skull Gulch,
 * Gallows Wash and Buzzard Roost, once each). The desert's rough is sparse and its fairway runs, so the pace player reaches a par
 * four of 540 yards in two; what makes it hard is not the room but the margin: eight to ten tiles of fairway, a cactus wood that drops
 * a ball that strays at its foot, and sand everywhere else. The two par threes are 3.06 and 3.13 against a par of 3 and the par fives
 * 5.56 to 6.00: no hole of the desert has water, and a par three with none in the way is a hole the pace player makes a birdie
 * of often, so the course is carried by the fours and fives.
 *
 * A gap is asked for 320 to 330 yards from the tee on the two par fives: a lane further out than a driver reaches lets nothing shorter
 * than it come down on the second leg, and Skull Gulch's corner is moved back (`corner` 0.4) so that a lane which reaches it lies past
 * it. The first Last Water was a dogleg of 40 degrees with a lane, and the pace player took 5 to 7 strokes on it with a pick-up in most
 * rounds of sixteen at every seed tried; it is a straight wooded four now.
 *
 * Made when first asked for and not as the page loads, as The Links are.
 */
import type { HoleDef } from './course';
import { golfHole, type GolfSpec } from './golf';

/** The desert's ground: hills of the Links' kind, in the desert biome (a pan for a lake, a cactus for a tree). */
const GROUND = { feel: 'hills', steepness: 0.6, rolling: true, biome: 'desert' } as const;

export const BADLANDS_SPECS: readonly GolfSpec[] = [
  {
    name: 'Rattlesnake Ridge',
    par: 4,
    length: 470,
    bend: 45,
    corner: 0.5,
    width: 9,
    // seed 2: the opener, a dogleg of 45 degrees to the right, 470 yards on 9 tiles with a wood of cactus along the whole of
    // it (131) and a lane 280 yards from the tee: a round of 4.81 (0.81 over) and picked up once. A drive struck true
    // through the lane in a still air comes down 253 yards out. Seeds 1 to 24 play 4.5 to 7.4 alone: most of the difference
    // is whether a drive that strays is under a cactus
    seed: 2,
    ...GROUND,
    heighten: 1.7,
    gap: { to: 280 },
    woods: true,
    bunkers: { fairway: 3, green: 3 },
    ponds: [],
    trees: 0,
    wind: 15,
    contour: 1,
    greens: 11.2,
  },
  {
    name: 'Skull Gulch',
    par: 5,
    length: 650,
    bend: -40,
    corner: 0.4,
    width: 10,
    // seed 20: the first five, a left-hand dogleg of 40 degrees at 650 yards with a lane 320 yards from the tee, a corner at
    // four tenths of the way, a shelf at 220 yards, the ground lifted to 2.3 and 157 cacti: a round of 6.00 (a stroke over)
    // and picked up once, the hardest of the course. The corner was first at the middle, where a lane 320 yards out is
    // short of it and the generator refuses it
    seed: 20,
    ...GROUND,
    heighten: 2.3,
    shelves: [220],
    gap: { to: 320 },
    bunkers: { fairway: 5, green: 4 },
    ponds: [],
    trees: 110,
    wind: 15,
    contour: 1,
    greens: 11.2,
  },
  {
    name: 'Scorpion Drop',
    par: 3,
    length: 235,
    bend: 0,
    width: 9,
    // seed 15: the first par three, 235 yards on 9 tiles with a pan of 67 tiles across the line and four bunkers round the
    // green, a wind of fifteen and quick turned greens: a round of 3.06 (par) and none picked up. A par three with no water
    // in the way is one the pace player birdies often (2.2 to 3.3 alone over twenty-four seeds)
    seed: 15,
    ...GROUND,
    bunkers: { fairway: 0, green: 4 },
    ponds: [{ at: 0.55, side: 0, size: [4, 5] }],
    trees: 70,
    wind: 15,
    contour: 1,
    greens: 11.2,
  },
  {
    name: 'Hell Hollow',
    par: 4,
    length: 560,
    bend: 0,
    width: 8,
    // seed 16: a straight four of 560 yards on the narrowest fairway there is (8 tiles), with a wood of cactus along the whole
    // of it (136), a pan of 73 tiles across the line, six fairway bunkers and the ground lifted to 2.5: a round of 4.38
    // (0.38 over) and none picked up. At 530 yards it played 3.6 to 4.8 alone, and a four of 560 is as long as one goes
    // here
    seed: 16,
    ...GROUND,
    heighten: 2.5,
    woods: true,
    bunkers: { fairway: 6, green: 4 },
    ponds: [{ at: 0.5, side: 0, size: [4, 5] }],
    trees: 0,
    wind: 15,
    contour: 1,
    greens: 11.2,
  },
  {
    name: 'Gallows Wash',
    par: 5,
    length: 620,
    bend: 50,
    corner: 0.5,
    width: 10,
    // seed 19: the second five, a right-hand dogleg of 50 degrees, the deepest of the course, 620 yards, a lane 330 yards from
    // the tee, 182 cacti, the most, and the ground lifted to 2.2: a round of 5.56 (0.56 over) and picked up once. A drive
    // through the lane comes down 277 yards out. Most seeds play 6 to 8 alone and are picked up in a fifth of rounds; this
    // one plays 5.6 in the round
    seed: 19,
    ...GROUND,
    heighten: 2.2,
    shelves: [200],
    gap: { to: 330 },
    bunkers: { fairway: 4, green: 3 },
    ponds: [],
    trees: 120,
    wind: 15,
    contour: 1,
    greens: 11.2,
  },
  {
    name: 'Buzzard Roost',
    par: 4,
    length: 490,
    bend: -45,
    corner: 0.5,
    width: 8,
    // seed 16: a left-hand dogleg of 45 degrees on 8 tiles with a wood of cactus (124), a lane 290 yards from the tee, the
    // ground lifted to 2.3 and 210 tiles of sand, the most of the fours: a round of 5.56 (1.56 over) and picked up once,
    // the hardest four of all the desert's. A drive through the lane comes down 191 yards out, the shortest of the lanes
    seed: 16,
    ...GROUND,
    heighten: 2.3,
    gap: { to: 290 },
    woods: true,
    bunkers: { fairway: 5, green: 4 },
    ponds: [],
    trees: 0,
    wind: 15,
    contour: 1,
    greens: 11.2,
  },
  {
    name: 'Thirst',
    par: 3,
    length: 240,
    bend: 0,
    width: 8,
    // seed 19: the second par three, 240 yards on 8 tiles with a pan of 63 tiles across the line, four bunkers by the green and
    // 80 cacti: a round of 3.13 (0.13 over) and none picked up, the hardest par three of the desert's
    seed: 19,
    ...GROUND,
    bunkers: { fairway: 0, green: 4 },
    ponds: [{ at: 0.5, side: 1, size: [4, 5] }],
    trees: 80,
    wind: 15,
    contour: 1,
    greens: 11.2,
  },
  {
    name: 'Boneyard',
    par: 5,
    length: 760,
    bend: 0,
    width: 9,
    // seed 8: the long five, 760 yards straight on 9 tiles with a pan of 82 tiles at six tenths, shelves at 180 and 400 yards,
    // the ground lifted to 2.5 (the most it goes) and the most sand of any hole (233 tiles): a round of 5.56 (0.56 over)
    // and none picked up. At 720 yards it played 4.6 to 5.9 alone
    seed: 8,
    ...GROUND,
    heighten: 2.5,
    shelves: [180, 400],
    bunkers: { fairway: 6, green: 4 },
    ponds: [{ at: 0.6, side: 0, size: [4, 5] }],
    trees: 120,
    wind: 15,
    contour: 1,
    greens: 11.2,
  },
  {
    name: 'Last Water',
    par: 4,
    length: 540,
    bend: 0,
    width: 9,
    // seed 11: the closing four, 540 yards straight on 9 tiles with a wood of cactus (145), a pan of 78 tiles across the line
    // at 0.55 and the ground lifted to 2.2: a round of 4.44 (0.44 over) and none picked up. As a dogleg of 40 degrees with
    // a lane it played 5.1 to 7.7 and was picked up in most rounds, whatever the seed
    seed: 11,
    ...GROUND,
    woods: true,
    heighten: 2.2,
    bunkers: { fairway: 5, green: 4 },
    ponds: [{ at: 0.55, side: 0, size: [4, 5] }],
    trees: 0,
    wind: 15,
    contour: 1,
    greens: 11.2,
  },
];

let made: readonly HoleDef[] | undefined;

/** The holes of The Badlands, made the first time they are asked for and no oftener. */
export function badlands(): readonly HoleDef[] {
  return (made ??= BADLANDS_SPECS.map((spec) => golfHole(spec)));
}

/** What the start screen says of the course, known without making it: how many holes and what par they add to. */
export const BADLANDS_SUMMARY = { holes: BADLANDS_SPECS.length, par: BADLANDS_SPECS.reduce((a, s) => a + s.par, 0) };
