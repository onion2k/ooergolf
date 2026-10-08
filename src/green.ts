/**
 * What a green's contour does to a putt, and how it is shown: the break, which way and how far a putt of a given line
 * turns across the slope, and the arrows that mark which way the ground leans. Pure arithmetic on a layout, so the page
 * only draws what it says and the tests hold it to what the game's own physics does.
 *
 * It is a model of the physics' own putt and no more: a point on the ground the game has, so it goes wrong where the
 * physics changes and the tests that play the break in the game's own rehearsals say so. Without it a break would be a
 * number the page drew and nobody could trust.
 */
import { PHYSICS, TILE, heightAt, lieAt, slopeAt, slopeInto, tileAt, type Layout } from './arena';
import { NO_KIT, type Kit } from './items';
import { GREENS, LIE, groundRoll, rollScale } from './surfaces';

/** The steepest a contoured green is, as a slope (rise over run): 10 per cent, at a contour of one. A green's tilt is most of it; at a 3-yard cup and a 2-yard ball a break under the cup's radius is lost in the cup, and 5 per cent was. */
export const GREEN = { steepest: 0.1 } as const;

/** The slope, rise over run, a tile of green has to be more than for an arrow to stand on it: a hair, about a fifth of a per cent. */
const HAIR = 0.002;

/** How many arrows a hole of minigolf may be given before the field is thinned: a little over the biggest real hole's floor. */
const ARROWS_MOST = 3000;

/**
 * One arrow of the grid laid over a green: where it stands (the middle of a tile), and the slope there, rise over run, in
 * x and in y, as `slopeAt` says it: the way the ground climbs, so the ball is carried the other way.
 */
export interface Arrow {
  x: number;
  y: number;
  slopeX: number;
  slopeY: number;
}

/**
 * The arrows over the ground of a hole that leans, worked out once for a hole. On a golf hole, one for each tile of putting
 * green whose slope is more than a hair. On a hole of minigolf, whose whole floor is its green, one for each tile of floor
 * (not rail, not water, and not the cup's own tile, which is a hole) whose slope is more than a hair: so at most as many as
 * the floor has tiles, a couple of thousand on the biggest hole there is, and none at all on a level hole, which reads and
 * looks as it always did.
 */
export function greenArrows(layout: Layout): Arrow[] {
  const arrows: Arrow[] = [];
  const cupTile = layout.golf ? -1 : tileAt(layout, layout.cup.x, layout.cup.y);
  // a hole of minigolf bigger than any there is (a test's hundred thousand tiles) is shown by a thinner field, every second or
  // third tile each way, so that what it costs a frame stays what the biggest real hole's does
  const every = layout.golf ? 1 : Math.max(1, Math.ceil(Math.sqrt((layout.cols * layout.rows) / ARROWS_MOST)));
  for (let t = 0; t < layout.cols * layout.rows; t++) {
    if (every > 1 && ((t % layout.cols) % every || Math.floor(t / layout.cols) % every)) continue;
    const x = layout.originX + ((t % layout.cols) + 0.5) * TILE,
      y = layout.originY + (Math.floor(t / layout.cols) + 0.5) * TILE;
    if (layout.solid[t]) continue;
    if (layout.golf ? lieAt(layout, x, y) !== LIE.green : layout.water[t] || t === cupTile) continue;
    const [slopeX, slopeY] = slopeAt(layout, x, y);
    if (Math.hypot(slopeX, slopeY) > HAIR) arrows.push({ x, y, slopeX, slopeY });
  }
  return arrows;
}

/**
 * What the break reader shows off the green: the arrows over the ground near the ball, which the ball is putted over. `radius`
 * is how far from the ball a tile's middle may be, in yards (seven tiles, so the arrows fill a screen's worth of the
 * ground round it and no more), and `most` the most arrows there are, the nearest kept, so a frame writes a bounded pool.
 */
export const READER = { radius: 21, most: 128 } as const;

/**
 * The arrows the break reader puts over the ground round a ball at (x, y) of a golf hole: one for each tile within
 * `READER.radius` of it that a ball is played from (not rock, water or out of bounds, and not the green's own tiles only,
 * as `greenArrows` has it) whose slope is more than a hair, the nearest `READER.most` of them. Worked out when the ball comes
 * to rest, never in a frame. None on a hole of minigolf, whose ground leans everywhere the arrows already stand.
 */
export function readerArrows(layout: Layout, x: number, y: number): Arrow[] {
  const found: (Arrow & { d: number })[] = [];
  if (!layout.golf) return found;
  const reach = Math.ceil(READER.radius / TILE);
  const c0 = Math.floor((x - layout.originX) / TILE),
    r0 = Math.floor((y - layout.originY) / TILE);
  for (let r = r0 - reach; r <= r0 + reach; r++) {
    for (let c = c0 - reach; c <= c0 + reach; c++) {
      if (c < 0 || r < 0 || c >= layout.cols || r >= layout.rows) continue;
      const t = r * layout.cols + c;
      if (layout.solid[t] || layout.water[t] || layout.oob[t]) continue;
      const ax = layout.originX + (c + 0.5) * TILE,
        ay = layout.originY + (r + 0.5) * TILE;
      const d = Math.hypot(ax - x, ay - y);
      if (d > READER.radius) continue;
      const [slopeX, slopeY] = slopeAt(layout, ax, ay);
      if (Math.hypot(slopeX, slopeY) > HAIR) found.push({ x: ax, y: ay, slopeX, slopeY, d });
    }
  }
  if (found.length > READER.most) {
    found.sort((a, b) => a.d - b.d);
    found.length = READER.most;
  }
  return found.map(({ d: _d, ...a }) => a);
}

/**
 * What the page shows of the break for a ball lying on `lie` with a club of `loft` in hand: the arrows (the green's own, on
 * the putting green and the first cut as they always were, or the ones near the ball, which only the break reader shows
 * and only for a putter, off the green), and the words, which want a hole that has set its greens' speed. One place, so
 * the page only does what this says.
 */
export function breakAids(
  lie: number,
  loft: number,
  reader: boolean,
  greensSet: boolean,
): { arrows: 'green' | 'near' | null; words: boolean } {
  const onGreen = lie === LIE.green || lie === LIE.cut;
  const reads = reader && loft === 0;
  return { arrows: onGreen ? 'green' : reads ? 'near' : null, words: greensSet && (onGreen || reads) };
}

/** Whether a hole of minigolf has ground that leans, so that it shows the break as golf does: false for a golf hole, which always does, and for every level hole. */
export function leansOnMinigolf(layout: Layout): boolean {
  return !layout.golf && greenArrows(layout).length > 0;
}

/** What a putt from (x, y) to the cup will do: how far across its line it breaks, and how much it climbs. */
export interface Break {
  /** How far to aim to one side of the cup for the ball to arrive at it, in yards: positive to the right looking from the ball to the cup, negative to the left. */
  across: number;
  /** How much higher the cup stands than the ball, in yards. */
  rise: number;
}

/**
 * How the break is worked out, and how much it may cost. A putt is judged as the ball that arrives at the cup so slowly that
 * on a level green it would die half a yard past it (`dead`): the speed a good putt is struck to, a hair too firm to hang on
 * the lip and not so firm it lips out. `step` is how far along its path the ball goes at each step of the sum, in yards; `tries` how
 * many aims are tried at most; `tolerance` how near the aim must come to the ball, in yards at the cup's distance, to be
 * called found; `farthest` how far off the cup a putt is worked out at all, past which no one is putting; and `most` the
 * most slopes read for one putt, which the test holds a call to, since the cost of a call is the number of times the ground is
 * read and a count does not depend on how busy the machine is.
 */
export const PUTT = { dead: 0.5, step: 0.75, tries: 12, tolerance: 0.01, farthest: 120, most: 3000 } as const;

/**
 * A putt as it is worked out: the break (`across`, `rise`), and what the putt is. `aim` is the direction to strike it in,
 * radians from east as the ground is, `speed` how fast along the ground the putter strikes it (from a ball on the green: from
 * other ground a club takes a share off), `arrival` the way it is going when it reaches the cup, and `work` how many
 * times the slope was read to find them: nought for a putt that is not worked out. A `speed` past the putter's hardest,
 * `HARDEST_SHOT`, is a putt no one can strike: see `puttFrom`.
 */
export interface Putt extends Break {
  aim: number;
  speed: number;
  arrival: number;
  work: number;
}

/** An angle brought to between minus a half turn and a half turn. */
const wrap = (a: number) => a - Math.PI * 2 * Math.round(a / (Math.PI * 2));

/**
 * The putt from (x, y) to the cup of the hole, on the ground it crosses, for greens that run at `greens` (the hole's
 * `HoleDef.greens`; `GREENS.normal` if it has none): the one that arrives at the cup and would die half a yard past it on
 * the level, which is the break a player is shown.
 *
 * The convention. `across` is how far from the cup to aim, at the cup's distance, to the side the ball will not be going:
 * positive to the RIGHT of the cup looking from the ball toward it, so a putt that breaks left, carried by the ground
 * to the left of where it is aimed, has a positive across, and one that breaks right a negative. Aim at the point that
 * far to that side of the cup, along the line across the putt, and the ball comes back to the cup. `rise` is how much
 * higher the cup is than the ball, in yards.
 *
 * How it is found. The ball is treated as a point on the same smoothed ground the physics rolls it on (`slopeAt`), pulled
 * along it by gravity (the slope over one and the slope squared) and slowed by the roll of whatever it is rolling over
 * (`groundRoll`, the lie under it at each step, as the kit's ball rolls on it), so a putt that runs from the fringe onto the green is slowed by each. The sum
 * is done backward in time, from the cup, with the speed it arrives at and an arrival direction that is tried: the path
 * back is followed until it is as far from the cup as the ball is, and the direction is adjusted (a secant on the bearing
 * of where the path comes out, from the ball's own) until it comes out where the ball is. What is found there is the aim
 * and the speed to strike it. A step is a fixed length along the path (`PUTT.step`), taken as a midpoint, so a putt of
 * twenty-five yards is thirty-three of them, and one is found in about six to ten aims; the cost is counted in `work`.
 *
 * A ball too far from the cup to be putted (`PUTT.farthest`), on it, or without a place is no break: nought across, and the
 * rise worked out where it can be. And a putt that would need more than the putter's hardest (about 50 yards on a normal
 * green, 36 on a slow, 66 on a fast, less from the first cut and the rough) is worked out as though it could be struck
 * that hard, which is the aim of a putt that would arrive and which no putter can make, flagged by a `speed` past
 * `HARDEST_SHOT`: struck at the hardest it would rest short, with a break a little more than this, and no figure is better.
 */
export function puttFrom(
  layout: Layout,
  x: number,
  y: number,
  greens: number = GREENS.normal,
  kit: Kit = NO_KIT,
): Putt {
  const { cup } = layout;
  const dx = cup.x - x,
    dy = cup.y - y;
  const length = Math.hypot(dx, dy);
  const toCup = Math.atan2(dy, dx);
  const rise = Number.isFinite(length) ? heightAt(layout, cup.x, cup.y) - heightAt(layout, x, y) : 0;
  const level = Math.sqrt(2 * greens * rollScale(LIE.green, kit) * (Math.min(length, PUTT.farthest) + PUTT.dead));
  const none: Putt = {
    across: 0,
    rise,
    speed: Number.isFinite(level) ? level : 0,
    aim: toCup,
    arrival: toCup,
    work: 0,
  };
  if (!(length > TILE / 12) || length > PUTT.farthest || !Number.isFinite(rise)) return none;

  let work = 0;
  const slope: [number, number] = [0, 0];
  const arriving = Math.sqrt(2 * groundRoll(lieAt(layout, cup.x, cup.y), greens, kit) * PUTT.dead);
  /** How the ball's velocity changes as it goes: slowed by the ground it rolls over and pulled down the slope, per second. */
  const accel = (px: number, py: number, ux: number, uy: number, out: [number, number]) => {
    work++;
    slopeInto(layout, px, py, slope);
    const speed = Math.hypot(ux, uy) || 1;
    const roll = groundRoll(lieAt(layout, px, py), greens, kit);
    const pull = PHYSICS.gravity / (1 + slope[0] * slope[0] + slope[1] * slope[1]);
    out[0] = -(roll * ux) / speed - pull * slope[0];
    out[1] = -(roll * uy) / speed - pull * slope[1];
  };
  const a1: [number, number] = [0, 0],
    a2: [number, number] = [0, 0];
  /** The path back from the cup that arrives `turn` radians round from the line from the ball: where it is at the ball's distance, and how fast and which way it was going. */
  const back = (turn: number) => {
    const phi = toCup + turn;
    let px = cup.x,
      py = cup.y,
      ux = arriving * Math.cos(phi),
      uy = arriving * Math.sin(phi);
    const steps = Math.ceil((length * 3) / PUTT.step) + 50;
    for (let k = 0; k < steps; k++) {
      const speed = Math.hypot(ux, uy);
      const dt = PUTT.step / speed;
      accel(px, py, ux, uy, a1);
      // back in time: the ball was where it is less its velocity, going as fast as it is less its slowing
      const mx = px - (ux * dt) / 2,
        my = py - (uy * dt) / 2;
      accel(mx, my, ux - (a1[0] * dt) / 2, uy - (a1[1] * dt) / 2, a2);
      const nx = px - (ux - (a1[0] * dt) / 2) * dt,
        ny = py - (uy - (a1[1] * dt) / 2) * dt;
      const vx = ux - a2[0] * dt,
        vy = uy - a2[1] * dt;
      const before = Math.hypot(px - cup.x, py - cup.y),
        after = Math.hypot(nx - cup.x, ny - cup.y);
      if (after >= length) {
        // across the circle the ball is on, this step: the point and velocity at it, by how far through the step it is
        const f = after > before ? (length - before) / (after - before) : 1;
        const qx = px + (nx - px) * f,
          qy = py + (ny - py) * f;
        return {
          found: true,
          miss: wrap(Math.atan2(qy - cup.y, qx - cup.x) - (toCup + Math.PI)),
          speed: Math.hypot(ux + (vx - ux) * f, uy + (vy - uy) * f),
          heading: Math.atan2(uy + (vy - uy) * f, ux + (vx - ux) * f),
        };
      }
      px = nx;
      py = ny;
      ux = vx;
      uy = vy;
    }
    return { found: false, miss: 0, speed: 0, heading: toCup };
  };

  // the arrival direction that brings the path back to the ball: a secant on how far round the cup it comes out
  let lo = 0,
    hi = 0.04;
  let flo = back(lo),
    fhi = back(hi);
  let best = Math.abs(flo.miss) <= Math.abs(fhi.miss) ? { turn: lo, ...flo } : { turn: hi, ...fhi };
  for (let k = 0; k < PUTT.tries && best.found && Math.abs(best.miss) * length > PUTT.tolerance; k++) {
    const slopeOfMiss = fhi.miss - flo.miss;
    if (!(Math.abs(slopeOfMiss) > 1e-12)) break;
    const next = Math.max(-1.2, Math.min(1.2, hi - (fhi.miss * (hi - lo)) / slopeOfMiss));
    lo = hi;
    flo = fhi;
    hi = next;
    fhi = back(hi);
    if (!fhi.found) break;
    if (Math.abs(fhi.miss) < Math.abs(best.miss)) best = { turn: hi, ...fhi };
  }
  if (!best.found) return { ...none, work };
  const aimed = wrap(best.heading - toCup);
  // aimed more than half a right angle round (the aim point then further to the side than the cup is far) is no putt's break,
  // but a hill too steep for the putt to be worked out: none is said
  if (Math.abs(aimed) > Math.PI / 4) return { ...none, work };
  // aimed that far round, the aim point at the cup's distance is that far to the side of the cup; to the right is negative round
  const across = -length * Math.tan(Math.max(-1.2, Math.min(1.2, aimed)));
  if (!Number.isFinite(across) || !Number.isFinite(best.speed)) return { ...none, work };
  return { across, rise, speed: best.speed, aim: best.heading, arrival: toCup + best.turn, work };
}

/**
 * The break of a putt from (x, y) to the cup of the hole, on the ground it crosses, for greens that run at `greens` (the
 * hole's `HoleDef.greens`; `GREENS.normal` if it has none): `puttFrom`'s `across` and `rise`, which says how it is found and
 * what the signs mean.
 */
export function breakOf(
  layout: Layout,
  x: number,
  y: number,
  greens: number = GREENS.normal,
  kit: Kit = NO_KIT,
): Break {
  const { across, rise } = puttFrom(layout, x, y, greens, kit);
  return { across, rise };
}

/** What a hole's greens are called, from how fast they run: `fast` at 12.5 and under, `slow` over 17, and `medium` between. */
export function speedName(greens: number): 'fast' | 'medium' | 'slow' {
  return greens <= 12.5 ? 'fast' : greens > 17 ? 'slow' : 'medium';
}
