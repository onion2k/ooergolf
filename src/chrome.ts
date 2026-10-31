/**
 * Chrome Heights: the middle course of the Future (`biome: 'future'`), nine holes of golf on raised ground. Par three,
 * four or five (4, 3, 4, 5, 4, 3, 4, 5, 4, which add to thirty-six), each hole `heighten`ed to two and a bit with shelves
 * of level ground for a landing to rest on among the slopes (the threes have none, only the tee and the green), fairways
 * ten to twelve tiles wide, two doglegs of thirty degrees, a wind of ten, and a mirror (a pond of quicksilver) across the
 * line at the foot of the last run-out before the green. Two holes are woods of holograms along the whole of them (129
 * and 120), the rest have groves of fifty to a hundred. Made by `golfHole` from a spec each and never drawn by hand, as
 * The Links are, each hole's seed chosen as The Woods' were: by playing seeds with the pace gate's player and looking at
 * the maps.
 *
 * What is held to the table (`test/chrome.test.ts`) is the counts and the figures it was asked for. What it was asked for
 * of how it plays is a round about par: a tenth of a stroke a hole under to a fifth over (35.1 to 37.8 for the par of
 * 36). The pace gate's player takes 36.81 over its sixteen seeds, 0.09 a hole over, with no hole picked up, and 37.25
 * over the sixteen after them with one pick-up in one round. A seed was chosen by its mean over twelve rounds of the hole
 * alone and then held to the whole course, since a hole in a round of nine draws on the same chance as the holes before
 * it and does not come out as it did alone: a first choice, by the means alone, took 33.94, and a second, of the hardest
 * seeds, 37.63 with a hole picked up.
 *
 * What makes it hard is the margin, not the trees: a hologram costs a ball distance and never stops it, and what a ball
 * runs down to is the water. The plan's figures were adjusted for the pace. `heighten` is 2.3 on seven holes and 2 on the
 * threes (the plan said about 2), the fairways are ten to twelve tiles and not ten to thirteen, and every hole has a
 * mirror and a grove (the plan said a few woods and mirrors): at heighten 2, twelve tiles, 400 yards, one grove and no
 * water the pace player took 3.1 a round on a par four, and at 440 yards and ninety holograms 3.8. The share of the
 * fairway that runs is 4 to 24 per cent a hole, less than The Fells' 12 to 40, since the future's fairway differs from
 * earth's in its keep and its bounce and not in its roll, so what a slope holds a ball on is earth's.
 *
 * Made when first asked for and not as the page loads, as The Links are.
 */
import type { HoleDef } from './course';
import { golfHole, type GolfSpec } from './golf';

const FUTURE = { feel: 'hills', steepness: 0.8, rolling: true, biome: 'future' } as const;

export const CHROME_SPECS: readonly GolfSpec[] = [
  {
    name: 'Overclock',
    par: 4,
    length: 440,
    bend: 0,
    width: 11,
    // seed 18: the opener, 440 yards on ground that stands 30 yards high, with a mirror across the line at the foot
    // of the run-out before the green and 90 holograms. 4.42 a round alone over twelve (0.17 balls a round in the
    // quicksilver), none picked up, 4.38 on the gate's sixteen. At 400 yards, twelve tiles and heighten 2 the seeds
    // took 3.1 a round, nearly a stroke under par
    seed: 18,
    ...FUTURE,
    heighten: 2.3,
    shelves: [130, 280],
    bunkers: { fairway: 3, green: 3 },
    ponds: [{ at: 0.85, side: 0, size: [4, 5] }],
    trees: 90,
    wind: 10,
    contour: 0.6,
    greens: 12.5,
  },
  {
    name: 'Heat Sink',
    par: 3,
    length: 215,
    bend: 0,
    width: 10,
    // seed 21: the first par three, 215 yards on ground that runs, with the mirror close before the green, 3.42 alone
    // and 3.38 on the gate's sixteen.
    seed: 21,
    ...FUTURE,
    heighten: 2,
    shelves: [],
    bunkers: { fairway: 0, green: 3 },
    ponds: [{ at: 0.85, side: 0, size: [3.5, 4.5] }],
    trees: 50,
    wind: 10,
    contour: 0.6,
    greens: 12.5,
  },
  {
    name: 'Server Rack',
    par: 4,
    length: 440,
    bend: 0,
    width: 11,
    // seed 16: the first wood, 129 holograms on both sides of the whole hole (the most in the course; the frame is
    // held at about 170), and a mirror at the foot of the run before the green. 4.00 alone, none picked up, 3.81 on
    // the gate's sixteen
    seed: 16,
    ...FUTURE,
    heighten: 2.3,
    shelves: [130, 280],
    bunkers: { fairway: 3, green: 3 },
    ponds: [{ at: 0.85, side: 0, size: [4, 5] }],
    trees: 0,
    woods: true,
    wind: 10,
    contour: 0.5,
    greens: 12.5,
  },
  {
    name: 'Mainframe',
    par: 5,
    length: 580,
    bend: 0,
    width: 12,
    // seed 13: the first five, 580 yards with shelves at 140, 300 and 440 yards to rest a lively ball on, the mirror
    // at nine tenths and 90 holograms. 4.67 alone (a stroke short of the par of 5 and three quarters), none picked
    // up, 4.56 on the gate's sixteen
    seed: 13,
    ...FUTURE,
    heighten: 2.3,
    shelves: [140, 300, 440],
    bunkers: { fairway: 3, green: 3 },
    ponds: [{ at: 0.9, side: 0, size: [4, 5] }],
    trees: 90,
    wind: 10,
    contour: 0.6,
    greens: 12.5,
  },
  {
    name: 'Uplink',
    par: 4,
    length: 440,
    bend: 30,
    width: 11,
    // seed 7: a right-hand dogleg of 30 degrees, the first bend, on ground that runs down to the corner, with 90
    // holograms. 5.25 alone over twelve and 4.25 on the gate's sixteen, none picked up, 5.06 on the sixteen after
    seed: 7,
    ...FUTURE,
    heighten: 2.3,
    shelves: [140, 290],
    bunkers: { fairway: 3, green: 3 },
    ponds: [{ at: 0.85, side: 0, size: [4, 5] }],
    trees: 90,
    wind: 10,
    contour: 0.6,
    greens: 12.5,
  },
  {
    name: 'Cold Boot',
    par: 3,
    length: 220,
    bend: 0,
    width: 10,
    // seed 22: the second par three, 220 yards, 30 yards of relief, as high as Overclock's, and a mirror before the
    // green. 3.17 alone and 3.13 on the gate's sixteen, none picked up. Seed 9 took 3.5 alone and was picked up once
    // in the sixteen
    seed: 22,
    ...FUTURE,
    heighten: 2,
    shelves: [],
    bunkers: { fairway: 0, green: 3 },
    ponds: [{ at: 0.85, side: 0, size: [3.5, 4.5] }],
    trees: 50,
    wind: 10,
    contour: 0.8,
    greens: 12,
  },
  {
    name: 'Silicon Spur',
    par: 4,
    length: 430,
    bend: 0,
    width: 10,
    // seed 14: the second wood, 120 holograms, a mirror at the foot of the run, and the narrowest fairway (ten
    // tiles). 4.25 alone, none picked up, 3.81 on the gate's sixteen
    seed: 14,
    ...FUTURE,
    heighten: 2.3,
    shelves: [130, 280],
    bunkers: { fairway: 3, green: 3 },
    ponds: [{ at: 0.85, side: 0, size: [4, 5] }],
    trees: 0,
    woods: true,
    wind: 10,
    contour: 0.6,
    greens: 12.5,
  },
  {
    name: 'Datum Ridge',
    par: 5,
    length: 580,
    bend: 0,
    width: 12,
    // seed 12: the last five, with three shelves and 100 holograms. 4.92 alone, 0.08 balls a round out of bounds,
    // none picked up, 5.25 on the gate's sixteen, the hardest hole of the nine
    seed: 12,
    ...FUTURE,
    heighten: 2.3,
    shelves: [140, 300, 440],
    bunkers: { fairway: 3, green: 3 },
    ponds: [{ at: 0.85, side: 0, size: [4, 5] }],
    trees: 100,
    wind: 10,
    contour: 0.6,
    greens: 12.5,
  },
  {
    name: 'Terminal',
    par: 4,
    length: 440,
    bend: -30,
    width: 11,
    // seed 20: the last hole, a left-hand dogleg of 30 degrees with the mirror at the foot of the last run-out, 90
    // holograms. 4.92 alone over twelve, none picked up, 4.25 on the gate's sixteen and 4.63 on the sixteen after
    // (one picked up)
    seed: 20,
    ...FUTURE,
    heighten: 2.3,
    shelves: [140, 290],
    bunkers: { fairway: 3, green: 3 },
    ponds: [{ at: 0.85, side: 0, size: [4, 5] }],
    trees: 90,
    wind: 10,
    contour: 0.7,
    greens: 12,
  },
];

let made: readonly HoleDef[] | undefined;

/** The holes of Chrome Heights, made the first time they are asked for and no oftener. */
export function chromeHeights(): readonly HoleDef[] {
  return (made ??= CHROME_SPECS.map((spec) => golfHole(spec)));
}

/** What the start screen says of the course, known without making it: how many holes and what par they add to. */
export const CHROME_SUMMARY = { holes: CHROME_SPECS.length, par: CHROME_SPECS.reduce((a, s) => a + s.par, 0) };
