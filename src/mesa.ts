/**
 * The Mesa: the second course of the desert, the middle one. Nine holes of par 36 (4, 4, 3, 5, 4, 3, 4, 5, 4): four doglegs of 40 to
 * 45 degrees round a stand of cactus, each with a lane cut through the corner for a drive struck true (`GolfSpec.gap`); ground that
 * runs, lifted up to a little over twice what The Links' hills are (`heighten` 1.5 to 2.2) with shelves to land on at three holes; fairways
 * of eleven to fourteen tiles; pans on four holes; and a wind of twelve to fifteen miles an hour. Made by `golfHole` from a spec each
 * and never drawn by hand, each hole's seed chosen as The Woods' were: by playing seeds with the pace gate's player and looking at the
 * maps, then holding the nine together on the gate's sixteen.
 *
 * What is held to the table (`test/mesa.test.ts`) is the counts and the figures it was asked for. What it was asked for of how it
 * plays is a round about par: a tenth under to a fifth over a stroke a hole (35.1 to 37.8 for the par of 36). The pace gate's player
 * takes 36.13 over its sixteen seeds, 0.01 a hole over, with no hole picked up in more than one round of sixteen. Every seed was
 * chosen by its mean over 14 to 16 rounds of the hole alone and then moved in turn on the whole course, since a hole in a round of nine
 * draws on the same chance as the holes before it.
 *
 * What makes it the middle course is the shape: a firm, lifted fairway runs a drive down the second leg of a dogleg a long way, and the
 * lane that lets a drive cut the corner is eight yards clear between cactus bases that the wind (twelve to fifteen miles an hour) moves a
 * drive off, so the corner is a choice and a miss is a ball among cacti, which drop a ball at their foot. The five holes that are not doglegs
 * are straight and long (a three of 235 to 240 yards, a four of 490 to 540), the pans lie across the line of four of them, and the greens
 * are quick (11.5 to 12.5) and turned. As in the rest of the desert, a par three is a hole the pace player takes in 2.6 to 3.1
 * against a par of 3.
 *
 * The lanes' ends are where a drive comes down: a gap is asked for at 235 to 330 yards from the tee, and a drive through each one comes
 * down 230 to 270 yards out in a still air (`test/mesa.test.ts`).
 *
 * Made when first asked for and not as the page loads, as The Links are.
 */
import type { HoleDef } from './course';
import { golfHole, type GolfSpec } from './golf';

/** The desert's ground: hills of the Links' kind, in the desert biome (a pan for a lake, a cactus for a tree). */
const GROUND = { feel: 'hills', steepness: 0.6, rolling: true, biome: 'desert' } as const;

export const MESA_SPECS: readonly GolfSpec[] = [
  {
    name: 'Sidewinder',
    par: 4,
    length: 420,
    bend: 40,
    corner: 0.5,
    width: 14,
    // seed 19: the opening dogleg, 40 degrees to the right, a lane to a landing 235 yards out, and 114 cacti (the corner's are
    // planted three tiles apart on the inside): a round of 4.38 (0.38 over) and picked up once. A drive struck true through
    // the lane comes down 267 yards out in a still air. No pan: the corner is the hole
    seed: 19,
    ...GROUND,
    heighten: 1.5,
    gap: { to: 235 },
    bunkers: { fairway: 2, green: 2 },
    ponds: [],
    trees: 70,
    wind: 13,
    contour: 0.7,
    greens: 12.5,
  },
  {
    name: 'Dry Wash',
    par: 4,
    length: 490,
    bend: 0,
    width: 11,
    // seed 2: a straight four of 490 yards at 11 tiles with a pan of 51 tiles across the line and the ground lifted to 1.9: a
    // round of 3.81 (0.19 under) and none picked up,
    seed: 2,
    ...GROUND,
    heighten: 1.9,
    bunkers: { fairway: 2, green: 3 },
    ponds: [{ at: 0.55, side: 0, size: [4, 5] }],
    trees: 80,
    wind: 12,
    contour: 0.7,
    greens: 12.5,
  },
  {
    name: 'Mesa Edge',
    par: 3,
    length: 235,
    bend: 0,
    width: 11,
    // seed 4: the first par three, 235 yards at 11 tiles with a pan of 60 tiles to the left, five bunkers round a quick turned
    // green (11.5, a contour of 1) and a wind of fifteen: a round of 3.06 (par) and none picked up
    seed: 4,
    ...GROUND,
    bunkers: { fairway: 0, green: 5 },
    ponds: [{ at: 0.5, side: -1, size: [4, 5] }],
    trees: 60,
    wind: 15,
    contour: 1,
    greens: 11.5,
  },
  {
    name: 'The Anvil',
    par: 5,
    length: 600,
    bend: -45,
    corner: 0.5,
    width: 13,
    // seed 3: the first five, a left-hand dogleg of 45 degrees at 600 yards with a lane 320 yards from the tee, the most
    // relief of the doglegs (17 yards), 161 cacti and a shelf at 250 yards to land the second shot on: a round of 4.94 (par
    // less 0.06) and picked up once. The lane was first asked for 350 yards out, which a driver does not reach
    seed: 3,
    ...GROUND,
    heighten: 1.8,
    shelves: [250],
    gap: { to: 320 },
    bunkers: { fairway: 3, green: 3 },
    ponds: [],
    trees: 90,
    wind: 13,
    contour: 0.7,
    greens: 12.5,
  },
  {
    name: 'Cholla Bend',
    par: 4,
    length: 460,
    bend: -40,
    corner: 0.5,
    width: 12,
    // seed 8: a left-hand dogleg of 40 degrees, 460 yards, a lane to 260 yards, 124 cacti and the ground lifted to 1.8: a
    // round of 4.75 (three quarters over) and picked up once, the hardest four of the course. A drive through the lane
    // comes down 244 yards out
    seed: 8,
    ...GROUND,
    heighten: 1.8,
    gap: { to: 260 },
    bunkers: { fairway: 2, green: 3 },
    ponds: [],
    trees: 80,
    wind: 14,
    contour: 0.7,
    greens: 12.5,
  },
  {
    name: 'Butte Drop',
    par: 3,
    length: 240,
    bend: 0,
    width: 11,
    // seed 3: the second par three, 240 yards, a pan of 57 tiles to the right and five bunkers on a green of 11.5: a round of
    // 2.56 (0.44 under) and none picked up. A seed was chosen that was not the easiest (seed 6 played 2.3 alone)
    seed: 3,
    ...GROUND,
    bunkers: { fairway: 0, green: 5 },
    ponds: [{ at: 0.55, side: 1, size: [4, 5] }],
    trees: 55,
    wind: 15,
    contour: 1,
    greens: 11.5,
  },
  {
    name: 'Ochre Ledge',
    par: 4,
    length: 540,
    bend: 0,
    width: 11,
    // seed 3: the long straight four, 540 yards at 11 tiles on the highest ground of the course (29.5 yards, heighten 2.2)
    // with shelves at 140 and 280 yards for a landing to rest on: a round of 3.50 (half a stroke under) and none picked up.
    // First named Ochre Steps, whose wind bends the grass 0.398 of a radian across the ground where the rule asks for 0.4
    seed: 3,
    ...GROUND,
    heighten: 2.2,
    shelves: [140, 280],
    bunkers: { fairway: 2, green: 3 },
    ponds: [],
    trees: 85,
    wind: 13,
    contour: 0.7,
    greens: 12.5,
  },
  {
    name: 'Red Rim',
    par: 5,
    length: 610,
    bend: 45,
    corner: 0.5,
    width: 12,
    // seed 20: the second five, a right-hand dogleg of 45 degrees at 610 yards with a lane 330 yards from the tee, the most
    // cacti of the course (163) and a heighten of 1.6: a round of 4.94 (par less 0.06) and picked up once. A drive through
    // the lane comes down 258 yards out
    seed: 20,
    ...GROUND,
    heighten: 1.6,
    gap: { to: 330 },
    bunkers: { fairway: 3, green: 3 },
    ponds: [],
    trees: 95,
    wind: 14,
    contour: 0.7,
    greens: 12.5,
  },
  {
    name: 'Canyon Mouth',
    par: 4,
    length: 540,
    bend: 0,
    width: 11,
    // seed 2: the closing four, 540 yards straight at 11 tiles with a pan of 85 tiles across the line at six tenths, a shelf
    // at 180 yards and a wind of fifteen: a round of 4.19 (0.19 over) and none picked up
    seed: 2,
    ...GROUND,
    heighten: 1.8,
    shelves: [180],
    bunkers: { fairway: 2, green: 3 },
    ponds: [{ at: 0.6, side: 0, size: [4.5, 5.5] }],
    trees: 90,
    wind: 15,
    contour: 0.8,
    greens: 12.5,
  },
];

let made: readonly HoleDef[] | undefined;

/** The holes of The Mesa, made the first time they are asked for and no oftener. */
export function mesa(): readonly HoleDef[] {
  return (made ??= MESA_SPECS.map((spec) => golfHole(spec)));
}

/** What the start screen says of the course, known without making it: how many holes and what par they add to. */
export const MESA_SUMMARY = { holes: MESA_SPECS.length, par: MESA_SPECS.reduce((a, s) => a + s.par, 0) };
