/**
 * The Woods: the fourth course of golf proper, forest on every hole. Nine holes, a par three, four or five (3, 4, 5, 4, 3, 4,
 * 5, 4, 3, which add to thirty-five), each with a wood along the whole of it (`GolfSpec.woods`): trunks three tiles apart from
 * two tiles off the fairway out to the stakes, so a drive that strays is under a canopy and the hole is a corridor. Five holes
 * are doglegs of 35 to 55 degrees, each with a lane cut through the trees on the inside of the corner (`gap`) for a drive
 * struck true to carry; the other four are straight. Three holes have a pond and the last a lake with an island, the bunkers
 * are three to six a hole, and the greens are quick and turned. Made by `golfHole` from a spec each and never drawn by hand,
 * as The Links are, each hole's seed chosen as theirs were: by playing seeds with the pace gate's player and looking at the maps.
 *
 * What is held to the table (`test/woods.test.ts`) is the counts and the figures it was asked for. What it was asked for of
 * how it plays is a round a little over par, between The Fells and The Isles: a tenth to half a stroke a hole over (35.9 to
 * 39.5 for the par of 35). The pace gate's player takes 37.44 over its sixteen seeds, 0.27 a hole over, and no hole is picked up
 * in more than one round of sixteen. A seed was chosen by its mean over 48 rounds of the hole alone and then held to the whole
 * course on the gate's sixteen, since a hole in a round of nine draws on the same chance as the holes before it and does not
 * come out as it did alone: seeds that played well alone were picked up two and three times in the sixteen, and were chosen again.
 *
 * What makes it hard is the margin, not the ground: every fairway is ten tiles wide, the narrowest the table allows, the wind
 * is the most it allows (eight miles an hour, though a wood is meant to shelter), the greens the fastest (12.5) and turned (0.8
 * to 0.9), and the par threes are as long as a par three goes (215 to 220 yards) with water across the line on every one.
 * A par three of that length with no water in the way was more than half a stroke under par on most seeds, which is the
 * autopilot playing a good golfer's round, and the water is what brings them to par. The hills are The Links' own, lifted at
 * most a fifth, so a ball that comes down rests, and the land rolls as theirs does.
 *
 * The wood is open for six yards off the fairway (`WOODS.from`, two tiles), so a ball on the fairway or the first cut is not
 * under a canopy, and the route the autopilot plays runs on the fairway as it does on The Fells. The margin was not widened to
 * three tiles: the round came out inside its target at two.
 *
 * Made when first asked for and not as the page loads, as The Links are.
 */
import type { HoleDef } from './course';
import { golfHole, type GolfSpec, type PondSpec } from './golf';

/** The ground and the wood of every hole: The Links' own hills and rolling land, a wood, and no scattered trees besides it. */
const WOOD = { feel: 'hills', steepness: 0.75, rolling: true, woods: true, trees: 0 } as const;

/** A pond across the line of a straight hole: under a hundred and twenty tiles, so it is a pond and not a lake, and wide enough to be carried and not walked round. */
const across = (): PondSpec[] => [{ at: 0.6, side: 0, size: [5, 5.8] }];

export const WOODS_SPECS: readonly GolfSpec[] = [
  {
    name: 'Acorn Rise',
    par: 3,
    length: 215,
    bend: 0,
    width: 10,
    // seed 10 of the twenty-three of a hundred and twenty whose pond and wood could be made at all: 94 tiles of water across the
    // line and 57 trunks, a round of 2.96 to the par of 3 over 48 rounds and none picked up. Before the pond the seeds took 2.1 to 2.8
    seed: 10,
    ...WOOD,
    heighten: 1,
    bunkers: { fairway: 2, green: 4 },
    ponds: across(),
    wind: 8,
    contour: 0.9,
    greens: 12.5,
  },
  {
    name: 'Pine Ride',
    par: 4,
    length: 440,
    bend: 45,
    corner: 0.5,
    width: 10,
    // seed 19: a lane of 244 yards for a drive to carry into the second leg and 141 trunks, a round of 4.48 over 48 rounds and
    // none picked up. Seeds 5 and 9 played to 4.52 and 4.65 alone and were picked up three and two times in the gate's sixteen
    seed: 19,
    ...WOOD,
    heighten: 1,
    gap: { to: 245 },
    bunkers: { fairway: 2, green: 2 },
    ponds: [],
    wind: 8,
    contour: 0.8,
    greens: 12.5,
  },
  {
    name: 'The Beech Hanger',
    par: 5,
    length: 580,
    bend: -40,
    corner: 0.5,
    width: 10,
    // seed 25: bending left, a lane of 329 yards, which a driver struck true comes down within seventy yards of the end of, 163
    // trunks and the most relief of the nine (17 yards), a round of 4.67 over 48 rounds and one picked up. The par
    // fives are the holes the autopilot plays half a stroke under on most seeds; this and Rookery Walk are the two that reach par
    seed: 25,
    ...WOOD,
    heighten: 1.1,
    gap: { to: 330 },
    bunkers: { fairway: 3, green: 3 },
    ponds: [],
    wind: 8,
    contour: 0.8,
    greens: 12.5,
  },
  {
    name: 'Oak Avenue',
    par: 4,
    length: 440,
    bend: 0,
    width: 10,
    // seed 71: the long straight four, 123 trunks and a pond of 105 tiles across the line, a round of 3.71 over 48 rounds and
    // none picked up. At 400 yards and twelve tiles wide a straight four took 3.0 to 3.6, a half stroke or more under par
    seed: 71,
    ...WOOD,
    heighten: 1,
    bunkers: { fairway: 3, green: 3 },
    ponds: across(),
    wind: 8,
    contour: 0.9,
    greens: 12.5,
  },
  {
    name: 'The Glade',
    par: 3,
    length: 220,
    bend: 0,
    width: 10,
    // seed 107: 65 trunks and a pond of 102 tiles, a round of 3.21 to the par of 3 over 48 rounds and one picked up, the
    // hardest of the short holes with a pond (seeds 61, 66 and 17 were 2.56 to 2.71)
    seed: 107,
    ...WOOD,
    heighten: 1,
    bunkers: { fairway: 2, green: 4 },
    ponds: across(),
    wind: 8,
    contour: 0.9,
    greens: 12.5,
  },
  {
    name: 'Bluebell Walk',
    par: 4,
    length: 440,
    bend: 50,
    corner: 0.5,
    width: 10,
    // seed 29: the deepest corner of the course, 50 degrees to the right, with a lane of 255 yards and 123 trunks, a round of
    // 4.85 over 48 rounds and one picked up: the hardest four, near a stroke over par. Seed 3 played to 4.63 with none picked up
    seed: 29,
    ...WOOD,
    heighten: 1.1,
    gap: { to: 255 },
    bunkers: { fairway: 2, green: 3 },
    ponds: [],
    wind: 8,
    contour: 0.9,
    greens: 12.5,
  },
  {
    name: 'Rookery Walk',
    par: 5,
    length: 580,
    bend: -45,
    corner: 0.5,
    width: 10,
    // seed 7, with a lane of 306 yards: the steepest hills of the five (1.2) and the most trunks (184), a round of 4.96 over 48
    // rounds and two picked up (none in the gate's sixteen). Its lane was first asked for 336 yards out, which a driver does not
    // reach: a drive through it came down 122 yards short of the end; at 305 it comes down within seventy. This was Timber Row,
    // named again because that name draws a wind that bends the grass 0.292 of a radian and the rule asks for 0.3
    seed: 7,
    ...WOOD,
    heighten: 1.2,
    gap: { to: 305 },
    bunkers: { fairway: 3, green: 3 },
    ponds: [],
    wind: 8,
    contour: 0.9,
    greens: 12.5,
  },
  {
    name: 'The Coppice',
    par: 4,
    length: 420,
    bend: 40,
    corner: 0.5,
    width: 10,
    // seed 16: the shallowest corner of the five (40 degrees) and the shortest four, with a lane of 235 yards and 144 trunks,
    // a round of 4.35 over 48 rounds and none picked up: the easiest of the doglegs
    seed: 16,
    ...WOOD,
    heighten: 1.1,
    gap: { to: 235 },
    bunkers: { fairway: 2, green: 2 },
    ponds: [],
    wind: 8,
    contour: 0.9,
    greens: 12.5,
  },
  {
    name: 'Lantern Clearing',
    par: 3,
    length: 220,
    bend: 0,
    width: 10,
    // seed 40: the last hole, a lake of 387 tiles across the line with an island of fairway in it, and 49 trunks (the fewest: the
    // lake takes the room), a round of 3.15 over 48 rounds and none picked up. No ball went into the water in the 48, so the
    // lake is a carry and a lay-up on the island and not a hazard that is often found
    seed: 40,
    ...WOOD,
    heighten: 1,
    bunkers: { fairway: 2, green: 4 },
    ponds: [],
    lakes: [{ at: 0.5, side: 0, size: [8, 9], carry: 40, islands: [{ kind: 'fairway', radius: 4 }] }],
    wind: 8,
    contour: 0.9,
    greens: 12.5,
  },
];

let made: readonly HoleDef[] | undefined;

/** The holes of The Woods, made the first time they are asked for and no oftener. */
export function woods(): readonly HoleDef[] {
  return (made ??= WOODS_SPECS.map((spec) => golfHole(spec)));
}

/** What the start screen says of the course, known without making it: how many holes and what par they add to. */
export const WOODS_SUMMARY = { holes: WOODS_SPECS.length, par: WOODS_SPECS.reduce((a, s) => a + s.par, 0) };
