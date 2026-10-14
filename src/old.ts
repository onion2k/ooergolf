/**
 * The Old Course: the long all-rounder and the hardest of the golf, nine holes made by `golfHole` from a spec each and never
 * drawn by hand, as The Links, The Fells and The Isles are. It is par 37 (4, 5, 3, 4, 4, 5, 3, 4, 5), the par threes 240 yards
 * and the fours 480 and the fives 600, which is as long as each par is allowed to be, on fairways ten or eleven tiles wide in
 * a wind of fifteen miles an hour, the most the autopilot's round has been measured in, on greens that run at 11.2 and are as
 * turned as a green may be. It asks a little of everything, and every hole asks at least two of five things: a lake with an
 * island in it (four holes), a wood with a lane through it across the corner of a dogleg (three of the five doglegs), ground
 * that runs a ball down it (three holes, heightened to 2.2 with a shelf for each landing), sand (eight to ten bunkers a hole and
 * eighty-six in all) and a pond on the line (the five holes that have no lake). Sand is on every hole, so the rule is that each
 * has a second thing.
 *
 * How hard: the pace gate holds the strokes of a round, and the plan asked this course for 44.2 to 47.2 for its 37 (a stroke
 * a hole over par, where The Isles are two thirds of a stroke over). On the gate's sixteen seeds it takes 45.19, and over the
 * next thirty-two, which no seed was chosen on, 44.75 and 45.38, with no hole picked up in more than one round of sixteen on
 * the gate's seeds. The pace player is a good golfer who plays round a wood and never takes a lane (that is a human's shortcut),
 * so what is hard is the water, the bend, the narrow ground and the wind, and the par threes are the least hard: a 3-wood flies
 * a pond from the tee, and a seed hard enough to cost a par three half a stroke was picked up too often to be kept. The levers
 * of the plan are used to their limits, in its order: the fairway as narrow as it is allowed (ten tiles, and eleven on two
 * holes whose bend lost balls out of bounds), the wind at fifteen, the ground on three holes, and a lake across the line.
 *
 * Which seed each hole has was chosen by playing, as The Links' were: every seed from 1 to 24 (1 to 16 or 30 for the holes
 * that refused many) was made, played for eight rounds by the pace gate's player, and the few that came out as the hole is for
 * were played for sixteen rounds more that they were not chosen on, since the best of twenty on eight rounds is the luckiest of
 * them and not the one that plays that way. A hole's comment says what it is for and the figures it was chosen by: the mean of
 * those twenty-four rounds against par, and the balls picked up in them. The round of the whole course moves by more than a
 * stroke when any one hole is changed (the chance a hole spends is the next hole's), so it was measured again each time.
 *
 * Made when first asked for and not as the page loads, as The Links are.
 */
import type { HoleDef } from './course';
import { golfHole, type GolfSpec } from './golf';

/** The holes' ground: The Links' own hills, and the long swells for the longest holes, rolling as The Links' do (`GolfSpec.rolling`). */
const HILLS = { feel: 'hills', steepness: 0.75, rolling: true } as const;
const LONG_HILLS = { feel: 'long hills', steepness: 0.75, rolling: true } as const;
/** The ground that runs: hills cut steeper, to the step the physics takes, as The Fells' are but lifted 2.2 and not 2.5. */
const RUN = { steepness: 0.9, heighten: 2.2 } as const;

export const OLD_SPECS: readonly GolfSpec[] = [
  {
    name: 'The Burn',
    par: 4,
    length: 480,
    bend: 0,
    width: 10,
    // seed 27 of the twenty-four: 36 per cent of the fairway runs down to the burn, 31 yards of relief, a round of 5.05 against
    // a par of 4 over twenty-four rounds with one picked up. A burn is a pond on the line, and a second one stands before the green
    seed: 27,
    ...HILLS,
    ...RUN,
    // a shelf for the drive and one for the second shot, so that a ball that lands is not carried into the burn
    shelves: [150, 310],
    bunkers: { fairway: 6, green: 4 },
    ponds: [
      { at: 0.55, side: 0, size: [6, 7] },
      { at: 0.88, side: 0, size: [4, 5] },
    ],
    trees: 60,
    wind: 15,
    contour: 1,
    greens: 11.2,
  },
  {
    name: 'Cartgate',
    par: 5,
    length: 600,
    // a right-hand dogleg of 50 degrees with its corner at 228 yards, and a lane through the wood to a point 279 yards from the
    // tee, which saves fifteen yards of the route round and seventy-three of the progress, and a drive just reaches. At a bend of
    // 50 and a corner at 252 the lane saved one yard, which is no shortcut; at 55 it saved five but the seeds were picked up in
    // three or four rounds of twenty-four, out of bounds at the corner
    corner: 0.38,
    bend: 50,
    width: 10,
    // seed 10 of the sixteen that stood: 527 tiles of lake across the last fifth of the way, with a fairway island to lay up on,
    // and a round of 5.67 against a par of 5 over twenty-four rounds with none picked up
    seed: 10,
    ...LONG_HILLS,
    gap: { to: 279 },
    bunkers: { fairway: 6, green: 4 },
    ponds: [],
    lakes: [{ at: 0.8, side: 0, size: [11, 13], islands: [{ kind: 'fairway', radius: 4 }] }],
    trees: 60,
    wind: 15,
    contour: 1,
    greens: 11.2,
  },
  {
    name: 'High Rigg',
    par: 3,
    length: 240,
    bend: 0,
    width: 10,
    // seed 13 of the twenty: two ponds across the line, a middling one and a small one before the green. A round of 3.29 against
    // a par of 3 over twenty-four rounds with none picked up: one of the two least hard holes of the nine, as a par three is.
    // Seed 3 took 3.9 to 4.4 and was picked up in two rounds of the sixteen the course is played on, which the course's rule does
    // not allow, and with a single pond across the line the seeds took 2.4 to 3.3 on eight rounds
    seed: 13,
    ...HILLS,
    bunkers: { fairway: 4, green: 4 },
    ponds: [
      { at: 0.5, side: 0, size: [6, 7] },
      { at: 0.85, side: 0, size: [4, 5] },
    ],
    trees: 60,
    wind: 15,
    contour: 1,
    greens: 11.2,
  },
  {
    name: 'The Road Hole',
    par: 4,
    length: 480,
    // a left-hand dogleg of 50 degrees with its corner at the middle and a lane through the wood to 275 yards from the tee,
    // which saves eight yards of the route and fifty of the progress. At 55 degrees and ten tiles of fairway the seed first chosen
    // took 6 a round and was picked up in five of the thirty-two rounds it was not chosen on; at 50 and eleven it is not
    bend: -50,
    corner: 0.5,
    width: 11,
    // seed 10 of the sixteen: 16 per cent of the fairway runs, 20 yards of relief, a pond across the line before the green, and a
    // round of 5.21 against a par of 4 over twenty-four rounds with none picked up
    seed: 10,
    ...HILLS,
    ...RUN,
    shelves: [140],
    gap: { to: 275 },
    bunkers: { fairway: 6, green: 4 },
    ponds: [{ at: 0.88, side: 0, size: [4, 5] }],
    trees: 60,
    wind: 15,
    contour: 1,
    greens: 11.2,
  },
  {
    name: 'Hell Bunker',
    par: 4,
    length: 480,
    bend: 0,
    width: 10,
    // seed 1 of the sixteen: a lake of 539 tiles across the middle of the hole, a carry of a hundred and thirty-five yards at the
    // most, with a fairway island to lay up on, and ten bunkers: a round of 4.71 against a par of 4 over twenty-four rounds
    // with none picked up. The easiest of the fours, since the lake is in the middle and a good player lays up before it
    seed: 1,
    ...HILLS,
    bunkers: { fairway: 6, green: 4 },
    ponds: [],
    lakes: [{ at: 0.55, side: 0, size: [12, 14], islands: [{ kind: 'fairway', radius: 4 }] }],
    trees: 60,
    wind: 15,
    contour: 1,
    greens: 11.2,
  },
  {
    name: 'The Long Way',
    par: 5,
    length: 600,
    // a left-hand dogleg of 40 degrees, the corner past the middle. At 50 degrees and ten tiles the seed first chosen was picked up
    // in two rounds of sixteen and in four of the next sixteen, out of bounds at the corner
    bend: -40,
    corner: 0.55,
    width: 11,
    // seed 7 of the sixteen: 710 tiles of lake across the first third of the way, so that the second shot is the one that has
    // to choose, and a round of 5.88 against a par of 5 over twenty-four rounds with none picked up
    seed: 7,
    ...LONG_HILLS,
    bunkers: { fairway: 6, green: 4 },
    ponds: [],
    lakes: [{ at: 0.35, side: 0, size: [12, 14], islands: [{ kind: 'fairway', radius: 4 }] }],
    trees: 60,
    wind: 15,
    contour: 1,
    greens: 11.2,
  },
  {
    name: 'Dyke End',
    par: 3,
    length: 240,
    bend: 0,
    width: 10,
    // seed 4 of the sixteen: a pond of 77 tiles across the line and a smaller before the green, a round of 3.12 against a par of
    // 3 over twenty-four rounds with none picked up. The second short hole is the easiest of the nine, a tenth over par:
    // the seeds of the sixteen that were harder (4.6 to 4.9) were picked up in a round of eight
    seed: 4,
    ...HILLS,
    bunkers: { fairway: 4, green: 4 },
    ponds: [
      { at: 0.4, side: 0, size: [5, 6] },
      { at: 0.8, side: 0, size: [4, 5] },
    ],
    trees: 60,
    wind: 15,
    contour: 1,
    greens: 11.2,
  },
  {
    name: 'The Spectacles',
    par: 4,
    length: 480,
    // a right-hand dogleg of 55 degrees, the sharpest the lane allows, with the lane to 275 yards from the tee (it saves seventeen
    // yards of the route and fifty-seven of the progress), and a small lake on the second leg with an island of fairway to lay up on
    bend: 55,
    corner: 0.5,
    width: 10,
    // seed 22 of the twenty-four: 432 tiles of lake and a round of 5.59 against a par of 4 over twenty-four rounds with none picked up
    seed: 22,
    ...HILLS,
    gap: { to: 275 },
    bunkers: { fairway: 6, green: 4 },
    ponds: [],
    lakes: [{ at: 0.8, side: 0, size: [8, 10], carry: 40, islands: [{ kind: 'fairway', radius: 3 }] }],
    trees: 60,
    wind: 15,
    contour: 1,
    greens: 11.2,
  },
  {
    name: 'The Auld Home',
    par: 5,
    length: 600,
    // a right-hand dogleg of 45 degrees with a long swell under it and two ponds on the second leg, and the last hole's ground that runs
    bend: 45,
    corner: 0.5,
    width: 10,
    // seed 9 of the twenty-eight: 16 per cent of the fairway runs, 30 yards of relief, and a round of 5.55 against a par of 5 over
    // twenty-four rounds with none picked up. Seed 10 took 6.1 and was picked up in two rounds of sixteen on each of three sets of
    // seeds, and the course lost 0.6 of a stroke a round by the change
    seed: 9,
    ...LONG_HILLS,
    ...RUN,
    shelves: [160, 350],
    bunkers: { fairway: 6, green: 4 },
    ponds: [
      { at: 0.7, side: 0, size: [5, 6] },
      { at: 0.9, side: 0, size: [4, 5] },
    ],
    trees: 60,
    wind: 15,
    contour: 1,
    greens: 11.2,
  },
];

let made: readonly HoleDef[] | undefined;

/** The holes of The Old Course, made the first time they are asked for and no oftener. */
export function old(): readonly HoleDef[] {
  return (made ??= OLD_SPECS.map((spec) => golfHole(spec)));
}

/** What the start screen says of the course, known without making it: how many holes and what par they add to. */
export const OLD_SUMMARY = { holes: OLD_SPECS.length, par: OLD_SPECS.reduce((a, s) => a + s.par, 0) };
