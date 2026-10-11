/**
 * The line of play: a golf hole's way, from the tee by its corner to the cup, as a place to look along. A camera that turns
 * by itself to a ball come to rest used to face the flag, which on a dogleg is round the corner: the straight line to it runs
 * over the trees and the rough inside the bend, and the fairway, where the next shot is played, is off to one side. So it looks
 * a way along the line of play instead, `PLAY_AHEAD` yards from where the ball's nearest point of it is, which is on the
 * fairway, and at the flag itself once the flag is within that (a green is played at, and a hole with no bend has the flag
 * on its line).
 *
 * Pure arithmetic on the way, a leaf that is handed what it needs and makes nothing: a point is written into the object it is given.
 */

/**
 * How far along the line of play the camera looks, in yards, from the nearest point of it to the ball. 130 is about half a
 * driver's carry. Of the distances tried on fifteen doglegs of twenty degrees and more (The Links, The Fells, The Isles), balls at
 * rest on the fairway, rough and cut, and the share of them with a fifth or more of the first 150 yards of the line of sight in
 * trees, rock or out of bounds (the flag: 37 per cent): 60 yards 14, 100 yards 8, 130 yards 8, 160 yards 9, 200 yards 14, a full
 * driver's 260 yards 24. Short of 100 the camera looks along the fairway and not at what it is to be played to, and past 200 it
 * looks at the flag. On a straight hole the shorter ones turn the camera a few degrees off the flag for a ball that lies off the
 * line, and 130 turns it 0.7 degrees at the median and 5 at the ninetieth percentile.
 */
export const PLAY_AHEAD = 130;

type Way = readonly (readonly [number, number])[];

/**
 * Where on `way` the camera looks from a ball at (x, y): the point `ahead` yards along it from the way's nearest point to the
 * ball, or the cup where that is no more than `ahead` further on: the way's last point, or `cup` itself when it is given, since
 * a way is drawn to the tile the cup was aimed at and the cup is a tile's middle, up to a yard or so off it. Written into `out`;
 * whether there was one, which is not for a hole with no way (minigolf, and a hole a test makes), a way that goes nowhere, and a
 * ball or a distance that is not a number.
 */
export function lookAlong(
  way: Way | undefined,
  x: number,
  y: number,
  ahead: number,
  out: { x: number; y: number },
  cup?: { x: number; y: number },
): boolean {
  if (!way || way.length < 2 || !Number.isFinite(x) || !Number.isFinite(y) || !Number.isFinite(ahead)) return false;
  // how far along the way the ball's nearest point of it is, and how long the way is
  let near = Infinity,
    at = 0,
    run = 0;
  for (let k = 0; k + 1 < way.length; k++) {
    const [ax, ay] = way[k],
      [bx, by] = way[k + 1];
    const lx = bx - ax,
      ly = by - ay;
    const len = Math.hypot(lx, ly);
    if (!(len > 1e-9)) continue;
    const u = Math.max(0, Math.min(1, ((x - ax) * lx + (y - ay) * ly) / (len * len)));
    const d = Math.hypot(x - (ax + lx * u), y - (ay + ly * u));
    if (d < near) {
      near = d;
      at = run + len * u;
    }
    run += len;
  }
  if (!(run > 0)) return false;
  const to = at + Math.max(0, ahead);
  if (run - at <= Math.max(0, ahead)) {
    const [cx, cy] = way[way.length - 1];
    out.x = cup ? cup.x : cx;
    out.y = cup ? cup.y : cy;
    return true;
  }
  // the point `to` along the way
  let gone = 0;
  for (let k = 0; k + 1 < way.length; k++) {
    const [ax, ay] = way[k],
      [bx, by] = way[k + 1];
    const len = Math.hypot(bx - ax, by - ay);
    if (!(len > 1e-9)) continue;
    if (to <= gone + len) {
      const u = (to - gone) / len;
      out.x = ax + (bx - ax) * u;
      out.y = ay + (by - ay) * u;
      return true;
    }
    gone += len;
  }
  // unreachable but for a rounding at the very end: the cup
  const [cx, cy] = way[way.length - 1];
  out.x = cup ? cup.x : cx;
  out.y = cup ? cup.y : cy;
  return true;
}
