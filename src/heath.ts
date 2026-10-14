/**
 * The Heath: short and tight. Par threes of 150 to 220 yards and par fours of 290 to 370, thirty-two for nine holes, with
 * fairways of eight to ten tiles through scattered trees, a lane through a wood on the inside of every dogleg (five lanes, on
 * the five fours, each landing a chip of 40 to 80 yards from the cup), bunkers at the greens, a pond on two holes, small quick
 * turned greens and a fresh wind. It is the course of precision and not of length: what is hard is keeping a drive on a
 * narrow fairway, or having the nerve to thread the lane, and then holding a quick green. Made by `golfHole` from a spec each
 * and never drawn by hand, as The Links is, each hole's seed chosen by playing seeds with the pace gate's player and looking
 * at the maps.
 *
 * It is held to come out a little under par, between The Links and The Fells in hardness: 27.9 to 30.6 strokes for the
 * thirty-two, a tenth and a half to nearly half a stroke a hole under, over the pace gate's sixteen seeds, and no hole picked
 * up in more than one round of sixteen. It takes 29.13 on the gate's sixteen seeds, none picked up, and 29.75 on the sixteen
 * after them. Made when first asked for and not as the page loads, as The Links are.
 */
import type { HoleDef } from './course';
import { golfHole, type GolfSpec } from './golf';

/** The holes' ground: the Links' own hills at the Links' steepness, rolling as its are (`GolfSpec.rolling`), and not heightened, so a ball rests where it comes down. */
const HILLS = { feel: 'hills', steepness: 0.75, rolling: true } as const;

export const HEATH_SPECS: readonly GolfSpec[] = [
  {
    name: 'Gorse Gate',
    par: 3,
    length: 218,
    bend: 0,
    width: 8,
    seed: 9,
    ...HILLS,
    bunkers: { fairway: 0, green: 4 },
    ponds: [],
    trees: 85,
    wind: 15,
    // the opener, a long one-shot hole at 218 yards on a narrow fairway, with a fresh wind and four bunkers round the green: at
    // 165 yards and three bunkers every seed was a stroke under par or near it, and this length is as far as a par three goes
    // here. This seed takes 2.67 a round over 12 rounds (none picked up), 2.69 on the gate's first sixteen seeds and 2.38 on
    // the next sixteen.
    contour: 1,
    greens: 12,
  },
  {
    name: 'Bracken Bend',
    par: 4,
    length: 300,
    bend: 40,
    width: 9,
    seed: 5,
    ...HILLS,
    bunkers: { fairway: 1, green: 3 },
    ponds: [],
    trees: 75,
    wind: 11,
    // the first lane: a right-hand dogleg of 40 degrees, short enough that a drive and a pitch is the plan, with a lane to a
    // landing 214 yards out and 75 short of the cup. Of twenty-four seeds thirteen kept a driver struck true clear of the wood and a
    // swing six degrees off in it. This one takes 3.63 over 24 rounds and 3.88 over eight, none picked up, and 3.75 and 3.63
    // on the gate's two sets of sixteen seeds.
    contour: 0.9,
    greens: 12,
    gap: { to: 214 },
  },
  {
    name: 'Furze Hollow',
    par: 3,
    length: 215,
    bend: 0,
    width: 8,
    seed: 10,
    ...HILLS,
    bunkers: { fairway: 0, green: 3 },
    ponds: [{ at: 0.6, side: 1, size: [3, 4] }],
    trees: 65,
    wind: 13,
    // a pond beside the line and a green with a quick, gentle turn: the course's first water, which a pull or a push can find
    // (0.17 balls a round lost). Seeds that cannot place the pond are refused (3 of 20); of the rest this one takes 2.75
    // over 12 rounds with none picked up, and 2.38 and 2.50 on the gate's two sets of sixteen seeds, the easiest hole of the nine.
    contour: 0.75,
    greens: 12,
  },
  {
    name: 'The Warren',
    par: 4,
    length: 320,
    bend: -45,
    width: 9,
    seed: 19,
    ...HILLS,
    bunkers: { fairway: 2, green: 2 },
    ponds: [],
    trees: 80,
    wind: 14,
    // a left-hand dogleg of 45 degrees, the sharpest bend of the nine, with a lane 230 yards out. Nine tiles of fairway and
    // fourteen miles an hour of wind make it a hole near par; this seed takes 3.75 over 24 rounds
    // and over 8, none picked up, and 3.56 and 4.13 on the gate's two sets of sixteen seeds.
    contour: 1,
    greens: 11.8,
    gap: { to: 230 },
  },
  {
    name: 'Heather Run',
    par: 4,
    length: 310,
    bend: 40,
    width: 9,
    seed: 19,
    ...HILLS,
    bunkers: { fairway: 1, green: 4 },
    ponds: [],
    trees: 85,
    wind: 10,
    // the course's longest four, bending right 40 degrees, with the lane 224 yards out. Its wind is 10, the least of the dogleg
    // holes: at 15 no seed of twenty-four kept a drive struck true clear of the wood, and at 10
    // three of thirty do (a hole's wind blows by its name, and this name's is across the lane). This seed
    // takes 3.79 over 24 rounds, 0.25 balls a round out of bounds and none picked up, 4.19 on the gate's first sixteen seeds
    // and 4.81 on the next (one picked up), the hardest hole of the nine; seed 12 was nearly a stroke easier but put the course
    // at 28.2, near the floor of its target.
    contour: 0.85,
    greens: 12.2,
    gap: { to: 224 },
  },
  {
    name: 'Beacon Top',
    par: 3,
    length: 220,
    bend: 0,
    width: 8,
    seed: 13,
    ...HILLS,
    bunkers: { fairway: 0, green: 4 },
    ponds: [{ at: 0.5, side: -1, size: [3, 4] }],
    trees: 60,
    wind: 15,
    // the second pond: a pond to the left of a 220-yard hole, the longest par three, in a wind of fifteen. This
    // seed takes 2.75 over 12 rounds with none picked up, 2.81 and 2.63 on the gate's two sets of sixteen seeds.
    contour: 0.9,
    greens: 12.6,
  },
  {
    name: 'Nightjar Turn',
    par: 4,
    length: 310,
    bend: -38,
    width: 8,
    seed: 7,
    ...HILLS,
    bunkers: { fairway: 2, green: 2 },
    ponds: [],
    trees: 75,
    wind: 12,
    // a left-hand dogleg of 38 degrees on the narrowest fairway the generator makes, eight tiles, which a hook or a slice leaves
    // in the wood; the lane is 225 yards out. This seed takes 3.88 over 24 rounds and 3.50 over eight, none picked up, and 3.69
    // and 3.44 on the gate's two sets of sixteen seeds.
    contour: 0.8,
    greens: 12.4,
    gap: { to: 225 },
  },
  {
    name: 'Adder Dip',
    par: 3,
    length: 210,
    bend: 0,
    width: 8,
    seed: 15,
    ...HILLS,
    bunkers: { fairway: 1, green: 3 },
    ponds: [],
    trees: 80,
    wind: 14,
    // a short, wooded hole of 210 yards with eighty trees, so that a ball off line is stopped, and a
    // wind of fourteen. Seeds that cannot place all eighty trees are refused (one of twenty); this one takes 2.67 over 12
    // rounds with none picked up, and 2.50 and 2.63 on the gate's two sets of sixteen seeds.
    contour: 0.7,
    greens: 13,
  },
  {
    name: 'Common Ground',
    par: 4,
    length: 305,
    bend: 36,
    width: 9,
    seed: 7,
    ...HILLS,
    bunkers: { fairway: 1, green: 3 },
    ponds: [],
    trees: 70,
    wind: 14,
    // the last, a right-hand dogleg of 36 degrees (the shallowest bend, so the lane is nearly straight on) with the quickest
    // green of the nine (11.5) and the full contour, so that the putting decides the round. The lane is 221 yards out. This seed takes
    // 3.71 over 24 rounds and 3.88 over eight, none picked up, and 3.56 and 3.63 on the gate's two sets of sixteen seeds.
    contour: 1,
    greens: 11.5,
    gap: { to: 221 },
  },
];

let made: readonly HoleDef[] | undefined;

/** The holes of The Heath, made the first time they are asked for and no oftener. */
export function heath(): readonly HoleDef[] {
  return (made ??= HEATH_SPECS.map((spec) => golfHole(spec)));
}

/** What the start screen says of the course, known without making it: how many holes and what par they add to. */
export const HEATH_SUMMARY = { holes: HEATH_SPECS.length, par: HEATH_SPECS.reduce((a, s) => a + s.par, 0) };
