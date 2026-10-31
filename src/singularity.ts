/**
 * The Singularity: the hard course of the Future (`biome: 'future'`), nine long holes of golf round a lake of quicksilver
 * each: par three, four or five (4, 4, 5, 4, 5, 3, 5, 4, 4, which add to thirty-eight), fours of 480 and 500 yards, fives
 * of 600 to 660 and a three of 235, fairways eight to ten tiles wide, the fastest greens (11) at their most contoured,
 * and the strongest winds of the three courses (twelve to fifteen). Every lake has an island of fairway to lay up on (two
 * on the last hole), and one hole, Dead Pixel, has the green itself on an island. Seven holes are doglegs of 20 to 40
 * degrees, with 50 to 100 holograms in groves. Made by `golfHole` from a spec each and never drawn by hand, as The Links
 * are, each hole's seed chosen as The Woods' were: by playing seeds with the pace gate's player and looking at the maps.
 *
 * What is held to the table (`test/singularity.test.ts`) is the counts and the figures it was asked for. What it was
 * asked for of how it plays is a round half a stroke to nine tenths a hole over par (42.5 to 46.1 for the par of 38). The
 * pace gate's player takes 42.88 over its sixteen seeds, 0.54 a hole over, with no hole picked up in more than one round,
 * and 43.25 over the sixteen after them, also with none picked up twice. A seed was chosen by its mean over twelve rounds
 * of the hole alone and then, in combinations, held to the whole course, since a hole in a round of nine draws on the
 * same chance as the holes before it and does not come out as it did alone: of seventy-five combinations of the seeds
 * that played well alone, 25 were in the band on the gate's sixteen with no hole picked up twice, and two of those held
 * on the next sixteen as well; this is one.
 *
 * What makes it hard was not what the plan said. The lakes do not trouble the pace player: it carries them with the
 * driver or lays up on the island, and a course of lakes, narrow fairways and fifteen miles an hour played 0.4 a hole
 * over (41.4 for the nine means). What did was the bend: a dogleg of 40 degrees took a stroke over par a hole, and bends
 * of 35 and 40 on five more holes took six a round or more, so they were cut to 20 and 25. The plan's figures are all
 * kept (long, lakes with islands, one island green, fairways of eight to eleven tiles, the fastest greens with contour 1,
 * winds of twelve to fifteen); the bends and the groves are what was added, with the longest holes the game has here (the
 * fours 480 and 500 yards, past the 440 of The Woods).
 *
 * Made when first asked for and not as the page loads, as The Links are.
 */
import type { HoleDef } from './course';
import { golfHole, type GolfSpec } from './golf';

const FUTURE = { feel: 'hills', steepness: 0.6, rolling: true, biome: 'future' } as const;

export const SINGULARITY_SPECS: readonly GolfSpec[] = [
  {
    name: 'Redshift',
    par: 4,
    length: 480,
    bend: 20,
    corner: 0.5,
    width: 8,
    // seed 14: the opener, a left-to-right bend of 20 degrees with a lake of 463 tiles and a fairway island across
    // the line half way and 100 holograms, the narrowest fairway (eight tiles) in the strongest wind (fifteen). 5.17
    // a round alone over twelve, none picked up, 5.00 on the gate's sixteen. With no bend the seeds took 4.4 a round:
    // the lake does not trouble the pace player, who carries it or lays up on the island, and a bend is what does
    seed: 14,
    ...FUTURE,
    bunkers: { fairway: 4, green: 4 },
    ponds: [],
    lakes: [{ at: 0.5, side: 0, size: [11, 13], carry: 45, islands: [{ kind: 'fairway', radius: 4 }] }],
    trees: 100,
    wind: 15,
    contour: 1,
    greens: 11,
  },
  {
    name: 'Dead Pixel',
    par: 4,
    length: 480,
    bend: 0,
    width: 9,
    // seed 20: the one island green, the cup and a ring of fairway in a lake of 445 tiles with the fairway running up
    // to the water's edge, 21 yards of relief and 60 holograms. 4.92 alone, none picked up, 4.75 on the gate's
    // sixteen (one pick-up). On a par three of 210 yards the same island green took 2.3 to 2.7 on every seed, a
    // stroke under, so it is a par four of 480
    seed: 20,
    ...FUTURE,
    bunkers: { fairway: 0, green: 0 },
    ponds: [],
    lakes: [{ at: 'green', side: 0, size: [14, 15], islands: [{ kind: 'green', radius: 7 }] }],
    trees: 60,
    wind: 13,
    contour: 1,
    greens: 11,
  },
  {
    name: 'Null Pointer',
    par: 5,
    length: 640,
    bend: -20,
    corner: 0.5,
    width: 9,
    // seed 19: the first five, 640 yards bending 20 degrees left round a lake of 620 tiles (the largest), 100
    // holograms. 5.17 alone, none picked up, 5.00 on the gate's sixteen
    seed: 19,
    ...FUTURE,
    bunkers: { fairway: 4, green: 4 },
    ponds: [],
    lakes: [{ at: 0.55, side: 0, size: [12, 14], carry: 45, islands: [{ kind: 'fairway', radius: 4 }] }],
    trees: 100,
    wind: 14,
    contour: 1,
    greens: 11,
  },
  {
    name: 'Warp Gate',
    par: 4,
    length: 480,
    bend: -40,
    corner: 0.5,
    width: 9,
    // seed 22: the sharpest bend of the nine, 40 degrees left, with a lake of 492 tiles before the corner and 80
    // holograms. 4.75 alone over twelve, none picked up, 4.94 on the gate's sixteen (one pick-up). Unchanged from the
    // first draft: the one bend there was
    seed: 22,
    ...FUTURE,
    bunkers: { fairway: 4, green: 4 },
    ponds: [],
    lakes: [{ at: 0.35, side: 0, size: [11, 13], carry: 45, islands: [{ kind: 'fairway', radius: 4 }] }],
    trees: 80,
    wind: 13,
    contour: 1,
    greens: 11,
  },
  {
    name: 'Dark Matter',
    par: 5,
    length: 660,
    bend: 25,
    corner: 0.5,
    width: 8,
    // seed 17: the long five, 660 yards, 25 degrees right, a lake of 522 tiles and 100 holograms, in a wind of
    // fifteen: the hardest hole of the nine. 5.50 alone, none picked up, 6.00 on the gate's sixteen (one pick-up).
    // With a bend of 40 degrees the seeds took 6.5 alone
    seed: 17,
    ...FUTURE,
    bunkers: { fairway: 4, green: 4 },
    ponds: [],
    lakes: [{ at: 0.45, side: 0, size: [12, 14], carry: 45, islands: [{ kind: 'fairway', radius: 4 }] }],
    trees: 100,
    wind: 15,
    contour: 1,
    greens: 11,
  },
  {
    name: 'Zero Day',
    par: 3,
    length: 235,
    bend: 0,
    width: 9,
    // seed 13: the par three, 235 yards across a lake of 512 tiles with a small island of fairway to lay up on, 4
    // bunkers at the green and 60 holograms. 3.50 alone, none picked up, 3.81 on the gate's sixteen. At 250 yards a
    // driver flies the lake and the seeds took 2.5, so it is no longer
    seed: 13,
    ...FUTURE,
    bunkers: { fairway: 0, green: 4 },
    ponds: [],
    lakes: [{ at: 0.55, side: 0, size: [9, 10], carry: 42, islands: [{ kind: 'fairway', radius: 3 }] }],
    trees: 60,
    wind: 14,
    contour: 1,
    greens: 11,
  },
  {
    name: 'Stack Overflow',
    par: 5,
    length: 600,
    bend: 30,
    corner: 0.5,
    width: 10,
    // seed 6: the last five but two, 600 yards bending 30 degrees right with the lake at seven tenths of the way,
    // only 50 holograms and a wind of twelve (the least). 5.58 alone, none picked up, 4.19 on the gate's sixteen.
    // With a bend of 45 degrees, a lake at four fifths and a wind of fifteen it took 6.3, and seeds were picked up in
    // as many as three rounds of twelve; this is the easier hole it was cut down to
    seed: 6,
    ...FUTURE,
    bunkers: { fairway: 4, green: 4 },
    ponds: [],
    lakes: [{ at: 0.7, side: 0, size: [10, 12], carry: 45, islands: [{ kind: 'fairway', radius: 4 }] }],
    trees: 50,
    wind: 12,
    contour: 1,
    greens: 11,
  },
  {
    name: 'Last Packet',
    par: 4,
    length: 500,
    bend: -20,
    corner: 0.5,
    width: 8,
    // seed 22: 500 yards bending 20 degrees left, a lake of 616 tiles, 100 holograms. 5.25 alone, none picked up,
    // 4.88 on the gate's sixteen
    seed: 22,
    ...FUTURE,
    bunkers: { fairway: 4, green: 4 },
    ponds: [],
    lakes: [{ at: 0.4, side: 0, size: [11, 13], carry: 45, islands: [{ kind: 'fairway', radius: 4 }] }],
    trees: 100,
    wind: 14,
    contour: 1,
    greens: 11,
  },
  {
    name: 'Event Horizon',
    par: 4,
    length: 500,
    bend: 25,
    corner: 0.5,
    width: 9,
    // seed 4: the last hole, 500 yards bending 25 degrees right, a lake of 445 tiles with two islands in it (a
    // fairway island of four tiles' radius and one of three), 100 holograms. 4.92 alone, none picked up, 4.31 on the
    // gate's sixteen
    seed: 4,
    ...FUTURE,
    bunkers: { fairway: 4, green: 4 },
    ponds: [],
    lakes: [
      {
        at: 0.5,
        side: 0,
        size: [12, 14],
        carry: 45,
        islands: [
          { kind: 'fairway', radius: 4 },
          { kind: 'fairway', radius: 3 },
        ],
      },
    ],
    trees: 100,
    wind: 15,
    contour: 1,
    greens: 11,
  },
];

let made: readonly HoleDef[] | undefined;

/** The holes of The Singularity, made the first time they are asked for and no oftener. */
export function singularity(): readonly HoleDef[] {
  return (made ??= SINGULARITY_SPECS.map((spec) => golfHole(spec)));
}

/** What the start screen says of the course, known without making it: how many holes and what par they add to. */
export const SINGULARITY_SUMMARY = {
  holes: SINGULARITY_SPECS.length,
  par: SINGULARITY_SPECS.reduce((a, s) => a + s.par, 0),
};
