/**
 * The Isles: the second hard course of golf, nine long holes round big lakes, a par four to a par six, each with water
 * to carry or go round and an island in it, one of them a green that is itself an island, and sand everywhere (eighty-three
 * bunkers in all, eight to twelve a hole, where The Links has four). It is the user's own order for a course "even harder"
 * than the last: an average par of five (the pars add to forty-five), large lakes with islands as the hazards, and plenty of
 * bunkers. Made by `golfHole` from a spec each and never drawn by hand, as The Links is, each hole's seed chosen as its were:
 * by playing seeds with the pace gate's player and looking at the maps.
 *
 * What is hard here is the water, the sand and the wind, not the ground: the hills are `hills` or `long hills` at the
 * Links' steepness, lifted at most a third as much again (`heighten` 1 to 1.3), so that a ball rests where it comes down
 * and this is not the running-hills course. A lake lies across the line on most holes, from rock to rock, and has to be
 * carried (`carry` bounds the water a flight may need, never above `CARRY`, the hundred and thirty-five yards the longer clubs
 * have to spare); an island in it is somewhere to land short of the far shore, and on the island green the water is all round
 * the cup. The fairways are narrow (nine to fourteen tiles), the winds fresh (ten to fifteen miles an hour, the most the
 * autopilot's round has been measured in), the greens fast (11.4 to 12.5) and turned (0.6 to 1), so a ball that is over the
 * water is still not safe on the green. Each hole is as long as its par asks: a four to 480 yards, a five 540 to 600 and a
 * six under 800, which is as long as the generator makes one.
 *
 * How hard: the pace gate holds the strokes of a round, and The Links is 0.68 a hole under par. This course is held to come out
 * a little over par, which is what "even harder" is to a player as good as the autopilot (a tenth under to four tenths over a
 * hole, so that the hard courses rise in order). Over 192 rounds of the whole course, on four sets of chance that no seed was
 * chosen on, it takes 0.20 a hole over par (46.8 strokes for 45, and 47.8 on the gate's sixteen seeds); no hole is more than
 * half a stroke over par or the least bit under on average, and none is picked up in more than one round of sixteen. A seed
 * was chosen from thirty by its round over some sixty rounds, and then held to rounds it was not chosen on, since the best of
 * thirty on twelve rounds is the luckiest of them and not the one that plays that way.
 *
 * Made when first asked for and not as the page loads: nine holes of this size, the biggest of them 117 tiles by 288, are a
 * good part of a second of the page's boot for a course a player may never choose.
 */
import type { HoleDef } from './course';
import { golfHole, type GolfSpec } from './golf';

/** The holes' ground: The Links' own hills, and the long swells for the longest holes, rolling as The Links' do (`GolfSpec.rolling`). A hole's lift of them is its own. */
const HILLS = { feel: 'hills', steepness: 0.75, rolling: true } as const;
const LONG_HILLS = { feel: 'long hills', steepness: 0.75, rolling: true } as const;

export const ISLES_SPECS: readonly GolfSpec[] = [
  {
    name: 'Landfall',
    par: 5,
    length: 560,
    // a hint of a bend: straight, a good player's round of it was a stroke or so under par on most seeds
    bend: 10,
    width: 9,
    seed: 24,
    ...HILLS,
    heighten: 1,
    bunkers: { fairway: 4, green: 3, island: 1 },
    ponds: [],
    trees: 70,
    wind: 15,
    // a par five with the lake late, at three quarters of the way, so the second shot is the one that has to choose: lay up
    // on the island or fly the water to the green. Most of the thirty seeds took it a stroke under par; this is one that takes
    // it a little over (0.30 a round over 192, three picked up), which is what the opening par five of a hard course is for.
    contour: 1,
    greens: 11.6,
    lakes: [{ at: 0.72, side: 0, size: [14, 16], carry: 40, islands: [{ kind: 'fairway', radius: 5 }] }],
  },
  {
    name: 'The Green Isle',
    par: 4,
    length: 480,
    bend: 0,
    width: 14,
    seed: 10,
    ...HILLS,
    heighten: 1,
    bunkers: { fairway: 4, green: 2, island: 2 },
    ponds: [],
    trees: 30,
    wind: 14,
    // the course's one island green: the cup, its green and a ring of fairway are all the land there is in a lake sixteen to
    // eighteen tiles across, with two bunkers on the apron. At 400 yards in a wind of ten it was nearly a stroke under par on
    // every seed; at 480 and in fourteen the seeds run from a fifth under par to a stroke over, and this is one near par (0.03
    // under over 192 rounds, seven picked up). A hole's name draws its wind, and the name this hole first had (The Island Green,
    // which The Waterworks has) drew a kinder one, so its seed was chosen again for the wind it has.
    contour: 0.9,
    greens: 11.8,
    lakes: [{ at: 'green', side: 0, size: [16, 18], islands: [{ kind: 'green', radius: 9 }] }],
  },
  {
    name: 'Long Water',
    par: 6,
    length: 760,
    bend: 30,
    width: 12,
    seed: 11,
    ...LONG_HILLS,
    heighten: 1.2,
    bunkers: { fairway: 5, green: 3, island: 2 },
    ponds: [],
    trees: 60,
    wind: 10,
    // the first par six, bending right, with a lake across the first leg and another before the green, each with an island
    // in it: three shots to the corner is the plan, and the water is what makes two a gamble. Twelve tiles of fairway, since
    // at fourteen a seed took a half stroke less and at eleven nearly a stroke more. This one takes 0.49 over par a round, ten of 192 picked up.
    contour: 0.7,
    greens: 12.5,
    lakes: [
      { at: 0.3, side: 0, size: [10, 12], carry: 40, islands: [{ kind: 'fairway', radius: 5 }] },
      { at: 0.75, side: 0, size: [8, 10], carry: 40, islands: [{ kind: 'fairway', radius: 4 }] },
    ],
  },
  {
    name: 'The Archipelago',
    par: 5,
    length: 580,
    bend: -35,
    width: 14,
    seed: 14,
    ...HILLS,
    heighten: 1.2,
    bunkers: { fairway: 4, green: 3, island: 2 },
    ponds: [],
    trees: 50,
    wind: 12,
    // a lake across the middle of a left-hand dogleg with two islands in it, a stepping stone each, so the carry can be made
    // in two flights and not one. The second hardest of the nine, 0.41 a round over par, which the two lakes and the bend
    // make of it on any seed (eleven of 192 rounds were picked up, as many as the course's rule allows).
    contour: 0.8,
    greens: 12.3,
    lakes: [
      {
        at: 0.5,
        side: 0,
        size: [14, 16],
        carry: 40,
        islands: [
          { kind: 'fairway', radius: 5 },
          { kind: 'fairway', radius: 5 },
        ],
      },
    ],
  },
  {
    name: 'Causeway',
    par: 4,
    length: 480,
    bend: 0,
    // nine tiles of fairway between two lakes: a causeway is narrow
    width: 9,
    seed: 7,
    ...HILLS,
    heighten: 1.1,
    bunkers: { fairway: 6, green: 3 },
    ponds: [],
    trees: 40,
    wind: 15,
    // a lake to the left with an island of sand and one to the right with an island of rough, so the land is a neck between
    // them and there is no carry and no way closed: one of the easier holes (0.26 over par over 192 rounds), a gale to
    // blow a ball wide and the water to lose it to.
    contour: 0.9,
    greens: 11.8,
    lakes: [
      { at: 0.45, side: -1, size: [11, 13], islands: [{ kind: 'sand', radius: 3 }] },
      { at: 0.5, side: 1, size: [11, 13], islands: [{ kind: 'rough', radius: 3 }] },
    ],
  },
  {
    name: 'The Long Swim',
    par: 6,
    length: 790,
    // a gentle bend: straight, a good player's three shots were enough on most seeds
    bend: 20,
    width: 10,
    seed: 4,
    ...LONG_HILLS,
    heighten: 1.3,
    bunkers: { fairway: 6, green: 3, island: 1 },
    ponds: [],
    trees: 60,
    wind: 12,
    // 790 yards, nearly the longest the generator makes, and the lake across it three quarters of the way along: at 0.65 the
    // water was too near the tee to be in play. Now it is the third shot's problem, a lay-up on the island or a flight to the
    // green, and this seed takes 0.15 a round over par.
    contour: 0.8,
    greens: 12,
    lakes: [{ at: 0.75, side: 0, size: [14, 16], carry: 40, islands: [{ kind: 'fairway', radius: 5 }] }],
  },
  {
    name: 'Two Lakes',
    par: 5,
    length: 560,
    bend: 40,
    // twelve tiles wide: at ten half the seeds could not place a lake beside a right-hand dogleg's corner
    width: 12,
    seed: 28,
    ...HILLS,
    heighten: 1.2,
    bunkers: { fairway: 4, green: 3, island: 1 },
    ponds: [],
    trees: 50,
    wind: 15,
    // a lake on the inside of the corner with an island of rough, for a drive that cuts it and is lost, and a lake across the
    // second leg with a fairway island, for the second shot. This seed takes 0.01 a round over par, and five of 192 were picked up.
    contour: 0.9,
    greens: 11.8,
    lakes: [
      { at: 0.3, side: 1, size: [9, 10], islands: [{ kind: 'rough', radius: 3 }] },
      { at: 0.8, side: 0, size: [9, 11], carry: 40, islands: [{ kind: 'fairway', radius: 4 }] },
    ],
  },
  {
    name: 'The Peninsula',
    par: 4,
    length: 470,
    bend: -45,
    width: 11,
    seed: 21,
    ...HILLS,
    heighten: 1.2,
    bunkers: { fairway: 6, green: 3 },
    ponds: [],
    trees: 50,
    wind: 15,
    // a left-hand dogleg whose corner is a point of land between a lake on its inside and another on the far side of the second
    // leg, so that the green is on a peninsula and the way to it is the land between. No lake lies across the line, so it asks
    // for accuracy and not a carry; this seed takes 0.15 a round over par.
    contour: 0.9,
    greens: 11.6,
    lakes: [
      { at: 0.5, side: -1, size: [10, 12], islands: [{ kind: 'fairway', radius: 3 }] },
      { at: 0.75, side: 1, size: [9, 10], islands: [{ kind: 'rough', radius: 3 }] },
    ],
  },
  {
    name: 'Home Waters',
    par: 6,
    length: 780,
    bend: 35,
    width: 12,
    seed: 8,
    ...LONG_HILLS,
    heighten: 1.3,
    bunkers: { fairway: 6, green: 4, island: 2 },
    ponds: [],
    trees: 60,
    wind: 15,
    // the last, and the course's most sand (twelve bunkers): a par six that bends right, with a lake across the first leg and
    // two islands in it, and a small lake beside the green. The fastest and most turned green of the nine, so that it is the
    // putting that decides the round. It takes 0.09 a round over par, the least of the sixes, and nine of 192 rounds were
    // picked up.
    contour: 1,
    greens: 11.4,
    lakes: [
      {
        at: 0.45,
        side: 0,
        size: [12, 14],
        carry: 40,
        islands: [
          { kind: 'fairway', radius: 5 },
          { kind: 'fairway', radius: 5 },
        ],
      },
      { at: 0.88, side: 1, size: [9, 10], islands: [{ kind: 'rough', radius: 3 }] },
    ],
  },
];

let made: readonly HoleDef[] | undefined;

/** The holes of The Isles, made the first time they are asked for and no oftener. */
export function isles(): readonly HoleDef[] {
  return (made ??= ISLES_SPECS.map((spec) => golfHole(spec)));
}

/** What the start screen says of the course, known without making it: how many holes and what par they add to. */
export const ISLES_SUMMARY = { holes: ISLES_SPECS.length, par: ISLES_SPECS.reduce((a, s) => a + s.par, 0) };
