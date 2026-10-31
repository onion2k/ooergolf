/**
 * The Far Side: the hard course of the Moon, the third of three, the face that is never turned to the Earth. Nine long holes made by
 * `golfHole` from a spec each and never drawn by hand, as The Isles are: a par three, four or five (4, 5, 3, 4, 5, 4, 5, 3, 5, which
 * add to thirty-eight), the threes 240 yards, the fours 480 or 490, the fives 610 to 660, on fairways of eight to ten tiles (the
 * narrowest the game allows is eight) over hills of 0.8 steepness lifted to twice what they are (`heighten` 2, and 1.5 on the two
 * threes), with a shelf of level ground to land on on six holes, greens that run at 11.5 and are turned as much as a
 * green may be (a contour of 1), and four to seven bunkers a hole. Every hole is across a big crater: a lake of 335 to 486 tiles
 * with an island of fairway in it to fly to, and one hole, Cold Trap, a green that is itself an island, with no way over land to it.
 *
 * What the Moon takes away it takes from every hole: no tree, no wood and no lane (`GolfSpec.trees` is nought and the generator
 * refuses the rest by name), and no wind whatever the spec says, so none is asked for. What it adds is the clock: the world runs at
 * 0.655 of the frames' (`BIOMES.moon.pace`), so a ball covers the same distance and hangs 1.53 times as long, and the dust holds a
 * ball dead (keep 0.05, bounce 0.03, power 0.7), so a ball in the rough comes out short. So what is hard here is the length, the
 * water, the narrow room, the running ground and the quick greens, with no shelter to lean on and no wind to blame.
 *
 * What it was asked for of how it plays is a round over par by half a stroke a hole to nine tenths (42.5 to 46.1 for the par of 38).
 * The pace gate's player takes 43.50 over its sixteen seeds, 0.61 a hole over, with one hole picked up in one round of the sixteen
 * (Moscoviense), and 44.19 over the thirty-two seeds after them (17 to 48), which no choice was made on, 0.69 a hole, where the
 * holes were picked up once or more in 32 rounds on five holes and three times on Aitken Basin. The seeds that played hardest alone were picked up too often to keep. The first figures (a four of 470 yards, a five of 630, a three of 235 on nine tiles, lakes of 8 to 9
 * tiles of radius) came to 0.4 a hole over, so the longest holes were lengthened, three of the lakes widened and the first three narrowed.
 *
 * Seeds were chosen as The Woods' were: every seed from 1 to 24 played for twelve rounds by the pace gate's player, and then held
 * to the gate's sixteen as a whole round, since a hole's chance is the next hole's and a seed that plays well alone is not the one
 * that plays well after others. A hole's comment says what it is for and the mean of its strokes over 48 rounds of the hole alone
 * (the first twelve of which the choice used).
 *
 * Made when first asked for and not as the page loads, as The Links are.
 */
import type { HoleDef } from './course';
import { golfHole, type GolfSpec } from './golf';

/** The Moon, with no tree and the hills at 0.8 steepness, rolling as the newer courses' land does; each hole says how much they are lifted. */
const FAR = { biome: 'moon', feel: 'hills', steepness: 0.8, rolling: true, trees: 0 } as const;
/** A big lake across the line, `at` of the way along, with an island of fairway in it of `radius` tiles to fly to, and a carry of no more than 40 tiles of water. */
const lake = (at: number, size: [number, number], carry = 40, radius = 4): GolfSpec['lakes'] => [
  { at, side: 0, size, carry, islands: [{ kind: 'fairway', radius }] },
];

export const FARSIDE_SPECS: readonly GolfSpec[] = [
  {
    name: 'Terminator',
    par: 4,
    length: 490,
    bend: 0,
    width: 10,
    // seed 3: the opening four, straight, 490 yards, with a lake of 471 tiles at 0.6 of the way, a shelf at 150 yards
    // and three bunkers at the green, a round of 4.08 to the par of 4 over 48 rounds and none picked up, 0.13 balls a
    // round in the lake: the mildest of the fours
    seed: 3,
    ...FAR,
    heighten: 2,
    shelves: [150],
    bunkers: { fairway: 3, green: 3 },
    ponds: [],
    lakes: lake(0.6, [10, 11]),
    contour: 1,
    greens: 11.5,
  },
  {
    name: 'The Rille',
    par: 5,
    length: 620,
    bend: -40,
    width: 10,
    // seed 5: a left-hand dogleg of 40 degrees over 620 yards with two shelves and a lake of 426 tiles at the middle, a
    // round of 5.33 to the par of 5 over 48 rounds and none picked up. Seeds 9, 16 and 18 played 3.3 to 3.8 over in
    // twelve rounds and were picked up five, five and eight times in them
    seed: 5,
    ...FAR,
    heighten: 2,
    shelves: [160, 360],
    bunkers: { fairway: 4, green: 3 },
    ponds: [],
    lakes: lake(0.5, [8, 10]),
    contour: 1,
    greens: 11.5,
  },
  {
    name: 'Shackleton',
    par: 3,
    length: 240,
    bend: 0,
    width: 8,
    // seed 17: the first three, 240 yards on eight tiles, the narrowest, with a lake of 486 tiles, the biggest, between
    // the tee and the green, a round of 3.63 over 48 rounds and none picked up, the 7-iron its tee shot, a ball in six
    // rounds in the lake
    seed: 17,
    ...FAR,
    heighten: 1.5,
    bunkers: { fairway: 0, green: 4 },
    ponds: [],
    lakes: lake(0.5, [10, 11], 40, 3),
    contour: 1,
    greens: 11.5,
  },
  {
    name: 'Aitken Basin',
    par: 4,
    length: 480,
    bend: 40,
    width: 10,
    // seed 18: a right-hand dogleg of 40 degrees with a lake of 335 tiles at 0.45 of the way and a shelf at 160, the
    // hardest of the fours but one, a round of 5.31 over 48 rounds and none picked up. In the thirty-two rounds after
    // the gate's sixteen it was picked up three times
    seed: 18,
    ...FAR,
    heighten: 2,
    shelves: [160],
    bunkers: { fairway: 3, green: 3 },
    ponds: [],
    lakes: lake(0.45, [8, 9]),
    contour: 1,
    greens: 11.5,
  },
  {
    name: 'Tsiolkovsky',
    par: 5,
    length: 660,
    bend: 0,
    width: 9,
    // seed 7: the longest hole, a straight five of 660 yards on nine tiles with two shelves and a lake of 477 tiles, a
    // round of 4.58 to the par of 5 over 48 rounds and none picked up: the one hole of the nine that plays under par
    // alone. Seeds 8, 11 and 20 played 0.58 to 0.75 over in twelve rounds and were picked up once each
    seed: 7,
    ...FAR,
    heighten: 2,
    shelves: [200, 400],
    bunkers: { fairway: 4, green: 3 },
    ponds: [],
    lakes: lake(0.6, [10, 11]),
    contour: 1,
    greens: 11.5,
  },
  {
    name: 'Long Shadow',
    par: 4,
    length: 490,
    bend: -45,
    width: 9,
    // seed 13: a left-hand dogleg of 45 degrees, the sharpest of the course, on nine tiles with a lake of 352 tiles and
    // no shelf, a round of 5.54 to the par of 4 over 48 rounds and none picked up: the hardest hole of the nine alone,
    // a stroke and a half over
    seed: 13,
    ...FAR,
    heighten: 2,
    bunkers: { fairway: 3, green: 3 },
    ponds: [],
    lakes: lake(0.5, [8, 9]),
    contour: 1,
    greens: 11.5,
  },
  {
    name: 'Moscoviense',
    par: 5,
    length: 610,
    bend: 35,
    width: 10,
    // seed 12: a right-hand dogleg of 35 degrees over 610 yards with a shelf and a lake of 450 tiles, a round of 5.35
    // to the par of 5 over 48 rounds and none picked up, 0.21 balls a round in the lake, the second most of the nine.
    // The hole picked up once in the gate's sixteen
    seed: 12,
    ...FAR,
    heighten: 2,
    shelves: [180],
    bunkers: { fairway: 4, green: 3 },
    ponds: [],
    lakes: lake(0.55, [8, 10]),
    contour: 1,
    greens: 11.5,
  },
  {
    name: 'Cold Trap',
    par: 3,
    length: 240,
    bend: 0,
    width: 9,
    // seed 18: the island green, a three of 240 yards to a green on an island of 8 tiles' radius in a lake of 387
    // tiles, with no way over land to it, a round of 3.40 over 48 rounds and none picked up, 0.23 balls a round in the
    // lake. Only 12 of the first 24 seeds could be made at all, the others refusing the island and the lake
    seed: 18,
    ...FAR,
    heighten: 1.5,
    bunkers: { fairway: 0, green: 4 },
    ponds: [],
    lakes: [{ at: 'green', side: 0, size: [14, 16], islands: [{ kind: 'green', radius: 8 }] }],
    contour: 1,
    greens: 11.5,
  },
  {
    name: 'Last Light',
    par: 5,
    length: 640,
    bend: 30,
    width: 9,
    // seed 12: the last hole, a right-hand dogleg of 30 degrees over 640 yards with two shelves and a lake of 444
    // tiles, a round of 5.65 over 48 rounds and none picked up: a stroke over par at the end of a long round
    seed: 12,
    ...FAR,
    heighten: 2,
    shelves: [200, 420],
    bunkers: { fairway: 4, green: 3 },
    ponds: [],
    lakes: lake(0.5, [9, 10]),
    contour: 1,
    greens: 11.5,
  },
];

let made: readonly HoleDef[] | undefined;
export function farside(): readonly HoleDef[] {
  return (made ??= FARSIDE_SPECS.map((spec) => golfHole(spec)));
}
export const FARSIDE_SUMMARY = { holes: FARSIDE_SPECS.length, par: FARSIDE_SPECS.reduce((a, s) => a + s.par, 0) };
