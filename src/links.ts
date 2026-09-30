/**
 * The Links: the first course of golf proper, nine holes from a par three to a par five at a yard a unit, made by
 * `golfHole` from a spec each and never drawn by hand. A course that plays as a course does: an easy opener, a par three
 * over water, a long hole that bends and one that bends the other way, a green behind a pond, a fairway with water along
 * its side, and two long holes at the end. What each hole asks is in its spec; which seed of its ground it has was chosen
 * by playing forty of them with the pace gate's player and taking the one whose round came nearest what the hole is for,
 * with no ball lost more than the hazards asked for, and by looking at the pictures. Content, as `course.ts` is.
 *
 * Made when first asked for and not as the page loads: nine holes of this size are a good part of a second of the page's
 * boot, for a course a player may never choose.
 */
import type { HoleDef } from './course';
import { golfHole, type GolfSpec } from './golf';

/** The holes' figures beside their pars: the same for every hole, so a hole's own is what differs. */
const HILLS = { feel: 'hills', steepness: 0.75 } as const;

export const LINKS_SPECS: readonly GolfSpec[] = [
  {
    name: 'The Opener',
    par: 4,
    length: 360,
    bend: 0,
    width: 15,
    seed: 4,
    ...HILLS,
    bunkers: { fairway: 1, green: 2 },
    ponds: [],
    trees: 36,
  },
  {
    name: 'Water Carry',
    par: 3,
    length: 165,
    bend: 0,
    width: 12,
    seed: 7,
    ...HILLS,
    bunkers: { fairway: 0, green: 3 },
    ponds: [{ at: 0.72, side: -1, size: [3, 4] }],
    trees: 20,
  },
  {
    name: 'Long Bend',
    par: 5,
    length: 520,
    bend: 30,
    width: 15,
    seed: 15,
    ...HILLS,
    bunkers: { fairway: 2, green: 2 },
    ponds: [{ at: 0.4, side: -1, size: [3, 4] }],
    trees: 80,
  },
  {
    name: 'Tight Left',
    par: 4,
    length: 410,
    bend: -35,
    width: 12,
    seed: 3,
    ...HILLS,
    bunkers: { fairway: 2, green: 2 },
    ponds: [],
    trees: 70,
  },
  {
    name: 'Island Green',
    par: 3,
    length: 195,
    bend: 0,
    width: 12,
    seed: 2,
    ...HILLS,
    bunkers: { fairway: 0, green: 3 },
    ponds: [{ at: 0.86, side: 0, size: [3, 3.6] }],
    trees: 24,
  },
  {
    name: 'Rushing Brook',
    par: 4,
    length: 385,
    bend: 20,
    width: 13,
    seed: 6,
    ...HILLS,
    bunkers: { fairway: 1, green: 2 },
    ponds: [
      { at: 0.35, side: 1, size: [3, 4] },
      { at: 0.65, side: 1, size: [3, 4] },
    ],
    trees: 50,
  },
  {
    name: 'The Big Dogleg',
    par: 5,
    length: 560,
    bend: -40,
    width: 15,
    seed: 38,
    ...HILLS,
    bunkers: { fairway: 3, green: 3 },
    ponds: [{ at: 0.6, side: 1, size: [3, 4] }],
    trees: 100,
  },
  {
    name: 'The Straight Mile',
    par: 4,
    length: 440,
    bend: 0,
    width: 13,
    seed: 24,
    ...HILLS,
    bunkers: { fairway: 3, green: 3 },
    ponds: [],
    trees: 50,
  },
  {
    name: 'Home Stretch',
    par: 4,
    length: 400,
    bend: 45,
    width: 13,
    seed: 31,
    ...HILLS,
    bunkers: { fairway: 2, green: 2 },
    ponds: [{ at: 0.8, side: -1, size: [3, 4] }],
    trees: 60,
  },
];

let made: readonly HoleDef[] | undefined;

/** The holes of The Links, made the first time they are asked for and no oftener. */
export function links(): readonly HoleDef[] {
  return (made ??= LINKS_SPECS.map((spec) => golfHole(spec)));
}

/** What the start screen says of the course, known without making it: how many holes and what par they add to. */
export const LINKS_SUMMARY = { holes: LINKS_SPECS.length, par: LINKS_SPECS.reduce((a, s) => a + s.par, 0) };
