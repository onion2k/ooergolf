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
 * How many a hole has, how fast each goes at the middle of its pace (units a second), how far past the hole's own ends along the
 * wind they roll and how far beside it (`beside`), how big a ball of them is, and how high one hops, in units, over the length of ground between hops.
 */
export const DRIFT = { count: 6, speed: 6, reach: 30, beside: 25, radius: 2, hop: 0.9, hopEvery: 14 } as const;

/** Where a tumbleweed is: on the ground at (x, y), lifted `hop` above its resting height, turned `turn` radians about the line across the wind. */
export interface Weed {
  x: number;
  y: number;
  hop: number;
  turn: number;
}

/** What each weed's lane is, worked out once for a hole and its name and kept as long as the hole is: where across the wind it rolls, as a share of the hole's width that way, and where along it it starts. */
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

/**
 * How far out from the hole's middle the weeds roll, across the wind and along it, for a wind along (wx, wy): the hole's own half
 * extent that way and `DRIFT.reach` past it along the wind, and `DRIFT.beside` past it across. They roll across and beside the hole's
 * play, in the view from a tee, and not out on the plain where no view looks.
 */
function extent(l: Layout, wx: number, wy: number): { along: number; across: number } {
  const hx = (l.cols * TILE) / 2,
    hy = (l.rows * TILE) / 2;
  return {
    along: Math.abs(wx) * hx + Math.abs(wy) * hy + DRIFT.reach,
    across: Math.abs(wy) * hx + Math.abs(wx) * hy + DRIFT.beside,
  };
}

/** The furthest from a hole's middle a weed is ever, at any wind: the hole's two half extents and the reach past them. */
export const driftRing = (l: Layout): number => (l.cols * TILE) / 2 + (l.rows * TILE) / 2 + DRIFT.reach + DRIFT.beside;

function lanesOf(l: Layout, name: string): Lane[] {
  const hit = LANES.get(l);
  if (hit && hit.name === name) return hit.lanes;
  const random = seeded(seedOf(`${name} tumbleweeds`));
  const lanes = Array.from({ length: DRIFT.count }, (_, k): Lane => {
    // lanes spread across the width, not drawn alike by luck: weed k in the k-th share of it, jittered within it
    const across = ((k + random()) / DRIFT.count) * 2 - 1;
    return {
      across,
      start: random() * 2,
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
  const room = extent(layout, wx, wy);
  const lane = lanesOf(layout, name)[k % DRIFT.count];
  const cx = layout.originX + (layout.cols * TILE) / 2,
    cy = layout.originY + (layout.rows * TILE) / 2;
  const chord = room.along;
  const across = lane.across * room.across;
  const gone = lane.start * chord + lane.speed * t;
  const along = chord > 0 ? ((((gone + chord) % (2 * chord)) + 2 * chord) % (2 * chord)) - chord : 0;
  out.x = cx + along * wx - across * wy;
  out.y = cy + along * wy + across * wx;
  // a bounce for every `hopping` units gone: a weed on a breeze hops, and comes down
  out.hop = Math.abs(Math.sin((gone / lane.hopping) * Math.PI)) * DRIFT.hop;
  out.turn = gone / DRIFT.radius;
  return out;
}
