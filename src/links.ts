/**
 * The Links: the first course of golf proper, nine holes from a par three to a par five at a yard a unit, made by
 * `golfHole` from a spec each and never drawn by hand. A course that plays as a course does: an easy opener, a par three
 * over water, a long hole that bends and one that bends the other way, a green behind a pond, a fairway with water along
 * its side, and two long holes at the end. What each hole asks is in its spec; which seed of its ground it has was chosen
 * by playing forty of them with the pace gate's player and taking the one whose round came nearest what the hole is for,
 * with no ball lost more than the hazards asked for, and by looking at the pictures. Content, as `course.ts` is. Each hole has
 * a wind in miles an hour, from a breath to a fresh breeze, which blows the way the hole's grass and flag show (a name's, so
 * it is set against the way the hole plays): the long holes that turn into it or across it blow ten or twelve, the others
 * less, and none above fifteen, which is what the autopilot's round was measured with. Each hole's green has a contour (how
 * much it swells and swales, from nought to one) and a speed (how many yards a second a second it slows a rolling ball, 12 fast
 * to 22 slow), chosen for what the hole is: an easy opener at the normal pace, an island green slow and soft, and the last the
 * fastest and the most turned, so that putting is a thing a round is lost or won by at the end.
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
    wind: 4,
    // a gentle, true green at the normal speed to open on: a first putt a player can read, and make.
    contour: 0.3,
    greens: 14,
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
    wind: 6,
    // a short par three, whose green is a little quick and a little turned, so a ball that carries the water is not safe on it.
    contour: 0.6,
    greens: 13.2,
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
    wind: 10,
    // a par five that is long enough: a green that runs a touch slow and swells modestly, so a third shot with a wedge can be held.
    contour: 0.7,
    greens: 15,
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
    wind: 12,
    // a par four with trouble left, so a green with a fair amount of turn at a lively pace asks for a careful approach.
    contour: 0.8,
    greens: 13.2,
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
    wind: 5,
    // an island, where a ball that lands is held by a slow green with little on it: the water is the test, not the putt.
    contour: 0.5,
    greens: 16.7,
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
    wind: 8,
    // two ponds along the side, and a green at the normal pace with a good deal of break to finish the hole's tests.
    contour: 0.9,
    greens: 14,
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
    wind: 7,
    // a three-shot hole with a big, slow, heavily contoured green, rewarding the shot that leaves an uphill putt.
    contour: 0.9,
    greens: 15.8,
  },
  {
    name: 'The Straight Mile',
    par: 4,
    length: 440,
    bend: 0,
    width: 13,
    seed: 24,
    ...HILLS,
    // the hills this hole was chosen with: a green that was not made level used to make the generator gentle them once (by
    // 0.93, from 0.75), and the levelled green of a contoured hole does not, so they are asked for as they were
    steepness: 0.6975,
    bunkers: { fairway: 3, green: 3 },
    ponds: [],
    trees: 50,
    wind: 10,
    // long and straight, with a green that is fast but flatter, so the length and not the putt is what it asks.
    contour: 0.7,
    greens: 12.3,
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
    wind: 12,
    // the last: the fastest green of the nine and the most contoured, so the round is decided on the putting green.
    contour: 1,
    greens: 11.4,
  },
];

let made: readonly HoleDef[] | undefined;

/** The holes of The Links, made the first time they are asked for and no oftener. */
export function links(): readonly HoleDef[] {
  return (made ??= LINKS_SPECS.map((spec) => golfHole(spec)));
}

/** What the start screen says of the course, known without making it: how many holes and what par they add to. */
export const LINKS_SUMMARY = { holes: LINKS_SPECS.length, par: LINKS_SPECS.reduce((a, s) => a + s.par, 0) };
