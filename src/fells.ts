/**
 * The Fells, the second course of golf proper and the first of the hard ones: nine holes of steep fell-side ground, made by
 * `golfHole` from a spec each and never drawn by hand. What it asks over The Links is in what the ground does. Every hole
 * stands at `heighten` 2.5 on hills cut to nine tenths of the step the physics takes, so a share of its fairway, a seventh to
 * two fifths of it, is slope that a ball does not stay on and runs down (the tee, the green and the shelves made for the
 * landings are level, and every bank drains into the rough, a bunker or a lake, never off the course), and the hills stand
 * fifteen to forty yards high where The Links' stand four to nine. Five of the nine holes are doglegs, four have a lake, and
 * three of the doglegs have a gap: a wood fills the inside of the corner, with one lane cut through it that a driver struck
 * true flies through to land well down the second leg. The greens are faster and more turned than The Links', and the last
 * is the fastest and the most contoured of all.
 *
 * Which seed of its ground each hole has was chosen by playing, as The Links' were: every seed from 1 to 40 (a few hundred for
 * the lanes) was made, kept only if its share of running fairway and its height were inside what the course is for, and, on a
 * hole with a lane, only if a driver struck true through it was clean and one six degrees either side was not, and the
 * survivors were played by the pace gate's player (`npm run seed-search -- --course fells`) for twelve and then thirty-two
 * rounds. The round the nine make, over the pace gate's sixteen seeds, is 34.63 strokes for a par of 37, which is a quarter of
 * a stroke a hole under par where The Links are two thirds, with no hole picked up in more than one round in sixteen. A hole's
 * comment says what it is for and why its seed, with the figures it was chosen by.
 *
 * Two things the table the course was planned from had to give. The hills are at 2.5 and not 1.4 to 1.8: nothing under 2.5
 * reaches a running share of twelve per cent. And a gap's lane is on a bend of 55 degrees and not 60 or more: the lane cuts
 * through the rough on the inside of the corner, and a deeper cut runs into the rock beyond out of bounds, which stops a drive
 * dead (found by a lane at 62 degrees that every seed's drive hit a wall in). A lane so shallow saves a few yards of the way
 * round and some fifty of progress, which is what it is for: the second shot is that much shorter.
 *
 * Made when first asked for and not as the page loads, as The Links are.
 */
import type { HoleDef } from './course';
import { golfHole, type GolfSpec } from './golf';

/** The hills of every hole: steep, cut to nine tenths of the physics' step, and raised past what a gentle ground would stand. */
const FELL = { feel: 'hills', steepness: 0.9, heighten: 2.5 } as const;
/** The same on swells half as wide again, which a long hole turns across. */
const LONG = { feel: 'long hills', steepness: 0.9, heighten: 2.5 } as const;

export const FELLS_SPECS: readonly GolfSpec[] = [
  {
    name: 'Fell Foot',
    par: 4,
    length: 400,
    bend: 0,
    width: 12,
    // seed 31 of the thirteen of the first forty that stood the figures: 23 per cent of its fairway runs, 26 yards of relief, a driver off the tee
    // and a round of 3.1 to the par of 4, the easiest of the nine and the one to begin on
    seed: 31,
    ...FELL,
    // a shelf for the drive and one for the second shot, so that a ball that lands is not carried off before it is played again
    shelves: [120, 250],
    bunkers: { fairway: 1, green: 2 },
    ponds: [],
    trees: 40,
    wind: 6,
    contour: 0.5,
    greens: 13.5,
  },
  {
    name: 'The Pinewood',
    par: 4,
    length: 420,
    // the corner half way and the bend 55 degrees, with the lane to a point 240 yards from the tee: the second leg is 210 long
    // and the lane lands on it 47 yards past the corner, which a drive just reaches
    bend: 55,
    corner: 0.5,
    width: 12,
    // seed 129 of the eighteen whose lane a driver flies clean and a swing off it does not: 16 per cent of the fairway runs,
    // 23 yards of relief, no ball picked up in twenty-four rounds and a round of 3.4 to 3.6
    seed: 129,
    ...FELL,
    shelves: [120],
    gap: { to: 240 },
    bunkers: { fairway: 1, green: 2 },
    ponds: [],
    trees: 40,
    wind: 8,
    contour: 0.6,
    greens: 13,
  },
  {
    name: 'Tarn',
    par: 3,
    // 215 and not 185: at 185 a 5-iron and a putt took 2.2 strokes, a stroke and a half under the par of 3
    length: 215,
    bend: 0,
    width: 12,
    // seed 6 of the nineteen with a lake of 120 tiles and the ground wanted: the tarn is 141 tiles across the line, a ball in
    // it in two rounds in five, and the round is 2.6 to 3.1
    seed: 6,
    ...LONG,
    shelves: [],
    bunkers: { fairway: 0, green: 3 },
    ponds: [{ at: 0.6, side: 0, size: [6.5, 7.5] }],
    trees: 20,
    wind: 12,
    // a quick green, and turned so that a ball over the water is not safe on it
    contour: 0.9,
    greens: 12.5,
  },
  {
    name: 'Scree Corner',
    par: 5,
    length: 540,
    // a dogleg left of 55 degrees with its corner at 227 yards, the lane landing 260 from the tee; the lake is on the outside of the
    // corner, to the right, a place for a drive that tries the corner and pulls it
    bend: -55,
    corner: 0.42,
    width: 12,
    // seed 25: the lane flies clean (a drive comes down 63 yards past its end, downhill) and six degrees off meets the wood on both
    // sides (one of eight seeds in a hundred and twenty that did), 15 per cent of the fairway runs, 26 yards of relief, 156 tiles of lake and no ball picked up in twenty-four rounds
    seed: 25,
    ...LONG,
    shelves: [150],
    gap: { to: 260 },
    bunkers: { fairway: 2, green: 2 },
    ponds: [],
    lakes: [{ at: 0.75, side: 1, size: [7, 9], islands: [] }],
    trees: 60,
    wind: 10,
    contour: 0.8,
    greens: 13,
  },
  {
    name: 'The Drop',
    par: 3,
    length: 210,
    bend: 0,
    width: 12,
    // seed 16 of the eleven: a short hole whose whole fairway is bank, 39 per cent of it running, the most of any hole in the
    // course, so a ball that comes down short of the green is carried back down the slope, and the round is 3.0 to the par of 3
    seed: 16,
    ...FELL,
    shelves: [110],
    bunkers: { fairway: 0, green: 3 },
    ponds: [],
    trees: 24,
    wind: 10,
    contour: 0.8,
    greens: 12,
  },
  {
    name: 'Beck Bend',
    par: 4,
    length: 440,
    // the beck is the lake on the inside of a right bend of 40 degrees, a corner a drive reaches and a hook finds the water from
    bend: 40,
    corner: 0.55,
    width: 12,
    // seed 16 of the eleven: 25 per cent of the fairway runs, 19 yards of relief, 172 tiles of water, no ball lost to it
    // in thirty-two rounds and a round of 4.0 to the par of 4, the hardest of the par fours for the pace player
    seed: 16,
    ...LONG,
    shelves: [130],
    bunkers: { fairway: 2, green: 2 },
    ponds: [],
    lakes: [{ at: 0.55, side: 1, size: [8, 10], islands: [] }],
    trees: 50,
    wind: 12,
    contour: 0.8,
    greens: 12.5,
  },
  {
    name: 'The Shortcut',
    par: 5,
    // 540 and not 560: at 560 the pace player took 5.9 and was picked up in one round in eight
    length: 540,
    bend: 55,
    corner: 0.42,
    width: 12,
    // seed 184 of the twelve whose lane is clean: 14 per cent of the fairway runs, 23 yards of relief, no ball picked up in
    // twenty-four rounds. A round of 5.4 to the par of 5, the one hole of the nine a little over par
    seed: 184,
    ...FELL,
    shelves: [150],
    gap: { to: 265 },
    bunkers: { fairway: 2, green: 3 },
    ponds: [],
    trees: 60,
    wind: 10,
    contour: 0.9,
    greens: 12.3,
  },
  {
    name: 'Waterfall',
    par: 4,
    length: 460,
    bend: 0,
    width: 12,
    // seed 3 of the six: the lake lies across the way at four fifths, 175 tiles of it, to be carried, and the ground runs down
    // to it, 23 per cent of the fairway and 22 yards of relief; a round of 3.4 to 3.6
    seed: 3,
    ...LONG,
    shelves: [130, 300],
    bunkers: { fairway: 2, green: 2 },
    ponds: [{ at: 0.8, side: 0, size: [6.5, 7.5] }],
    trees: 40,
    wind: 12,
    contour: 0.9,
    greens: 12,
  },
  {
    name: 'The Fell Race',
    par: 5,
    length: 580,
    bend: -40,
    corner: 0.6,
    width: 12,
    // seed 27 of the twelve: 24 per cent of the fairway runs, 27 yards of relief and a round of 5.0 to the par of 5 over thirty-two
    // rounds, with no ball picked up in them (one in the sixteen rounds of the whole course); the last hole, on the fastest and the most turned green of the nine, so a round is
    // won or lost at the end
    seed: 27,
    ...LONG,
    shelves: [150, 330, 450],
    bunkers: { fairway: 3, green: 3 },
    ponds: [],
    trees: 80,
    wind: 14,
    contour: 1,
    greens: 11.4,
  },
];

let made: readonly HoleDef[] | undefined;

/** The holes of The Fells, made the first time they are asked for and no oftener. */
export function fells(): readonly HoleDef[] {
  return (made ??= FELLS_SPECS.map((spec) => golfHole(spec)));
}

/** What the start screen says of the course, known without making it: how many holes and what par they add to. */
export const FELLS_SUMMARY = { holes: FELLS_SPECS.length, par: FELLS_SPECS.reduce((a, s) => a + s.par, 0) };
