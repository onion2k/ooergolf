/**
 * What drifts over a hole of the Desert on the wind: a few tumbleweeds, rolling downwind along lanes across the hole and the plain
 * about it. Where each is at any time is worked out from the hole, its name and game time alone (never the game's chance, and
 * never the clock), so a picture of the hole is the same every run and the same at the same game time, and a paused game holds them
 * still. They are drawn and have no body in the world: nothing here is read by the game, a ball passes through one as it would a
 * shadow, and the fuzzer never meets one. Without this a desert has nothing that moves but its flag.
 *
 * Each rolls along a chord of the circle round the hole, the way the clouds drift (`cloudAt` in `backdrop.ts`), and goes in again on
 * the far side when it would leave it, so there are as many as there were however long the hole is played.
 */
import { TILE, type Layout } from './arena';
import { seeded } from './random';

/**
 * How many a hole has, how fast each goes at the middle of its pace (units a second), how far past the hole's own circle the
 * ring they roll in reaches, how big a ball of them is, and how high one hops, in units, over the length of ground between hops.
 */
export const DRIFT = { count: 5, speed: 6, reach: 40, radius: 1.3, hop: 0.9, hopEvery: 14 } as const;

/** Where a tumbleweed is: on the ground at (x, y), lifted `hop` above its resting height, turned `turn` radians about the line across the wind. */
export interface Weed {
  x: number;
  y: number;
  hop: number;
  turn: number;
}

/** What each weed's lane is, worked out once for a hole and its name and kept as long as the hole is. */
interface Lane {
  across: number;
  start: number;
  speed: number;
  hopping: number;
}
const LANES = new WeakMap<Layout, { name: string; lanes: Lane[] }>();

/** A seed from a name: FNV-1a, so the same name always makes the same lanes. */
function seedOf(name: string): number {
  let h = 0x811c9dc5;
  for (const c of name) h = Math.imul(h ^ c.charCodeAt(0), 0x01000193);
  return h >>> 0;
}

/** How many a hole has: the same few for every hole. */
export const tumbleweedCount = (_layout: Layout): number => DRIFT.count;

/** The radius of the circle the weeds roll in: a hole's own, and the reach past it. */
const ringOf = (l: Layout) => Math.hypot(l.cols * TILE, l.rows * TILE) / 2 + DRIFT.reach;

function lanesOf(l: Layout, name: string): Lane[] {
  const hit = LANES.get(l);
  if (hit && hit.name === name) return hit.lanes;
  const R = ringOf(l);
  const random = seeded(seedOf(`${name} tumbleweeds`));
  const lanes = Array.from({ length: DRIFT.count }, (_, k): Lane => {
    // lanes spread across the ring, not drawn alike by luck: weed k in the k-th fifth of the width, jittered within it
    const across = ((k + random()) / DRIFT.count) * 2 * R * 0.9 - R * 0.9;
    return {
      across,
      start: random() * 2 * R,
      speed: DRIFT.speed * (0.7 + 0.6 * random()),
      hopping: DRIFT.hopEvery * (0.7 + 0.6 * random()),
    };
  });
  LANES.set(l, { name, lanes });
  return lanes;
}

/**
 * Tumbleweed `k` of the hole `layout` called `name` at game time `t`, drifting along `way` (the wind's direction, which need not be
 * a unit; a still wind gives it the way east), written into `out` if one is given. Always within the ring about the hole.
 */
export function tumbleweedAt(
  layout: Layout,
  name: string,
  k: number,
  t: number,
  way: readonly [number, number],
  out: Weed = { x: 0, y: 0, hop: 0, turn: 0 },
): Weed {
  const len = Math.hypot(way[0], way[1]);
  const wx = len > 0 ? way[0] / len : 1,
    wy = len > 0 ? way[1] / len : 0;
  const R = ringOf(layout);
  const lane = lanesOf(layout, name)[k % DRIFT.count];
  const cx = layout.originX + (layout.cols * TILE) / 2,
    cy = layout.originY + (layout.rows * TILE) / 2;
  const chord = Math.sqrt(Math.max(0, R * R - lane.across * lane.across));
  const gone = lane.start + lane.speed * t;
  const along = chord > 0 ? ((((gone + chord) % (2 * chord)) + 2 * chord) % (2 * chord)) - chord : 0;
  out.x = cx + along * wx - lane.across * wy;
  out.y = cy + along * wy + lane.across * wx;
  // a bounce for every `hopping` units gone: a weed on a breeze hops, and comes down
  out.hop = Math.abs(Math.sin((gone / lane.hopping) * Math.PI)) * DRIFT.hop;
  out.turn = gone / DRIFT.radius;
  return out;
}
