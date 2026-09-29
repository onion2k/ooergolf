/**
 * What the ground of a hole is like, as figures: how high it rises and falls,
 * how steep it gets, how bumpy it is, and how much of it is a broad swell and
 * how much small detail on the swell. What a test holds a feel to, so
 * "gentle", "rolling" and "choppy" are things that can be measured, and not
 * only looked at.
 */
import { TILE, heightAt, slopeAt, type Layout } from '../src/arena';

export interface GroundFigures {
  /** From the lowest point of the ground the ball can reach to the highest, in units. */
  relief: number;
  /** The steepest slope anywhere, as a rise for a unit along. */
  steepest: number;
  /** How quickly the slope changes, on the mean, over a unit and a half: a bumpy ground turns it often. */
  bumpiness: number;
  /** How much of the height is small detail: its spread about the mean of the tiles round it, over its spread about the whole. */
  detail: number;
  /** How much of the ground a ball rests on where it lies: slope no steeper than `holds`, as a share. */
  rests: number;
}

/** Points half a unit apart over the tiles inside the rail. */
function inside(l: Layout): [number, number][] {
  const points: [number, number][] = [];
  for (let x = l.originX + TILE * 1.5; x < l.originX + (l.cols - 1) * TILE - 1e-9; x += 0.5)
    for (let y = l.originY + TILE * 1.5; y < l.originY + (l.rows - 1) * TILE - 1e-9; y += 0.5) points.push([x, y]);
  return points;
}

export function groundFigures(l: Layout, holds = 0.2286): GroundFigures {
  const points = inside(l);
  let lo = Infinity,
    hi = -Infinity,
    steepest = 0,
    bump = 0,
    rests = 0;
  const h = 1.5;
  for (const [x, y] of points) {
    const z = heightAt(l, x, y);
    lo = Math.min(lo, z);
    hi = Math.max(hi, z);
    const [sx, sy] = slopeAt(l, x, y);
    const s = Math.hypot(sx, sy);
    steepest = Math.max(steepest, s);
    if (s / Math.sqrt(1 + s * s) <= holds) rests++;
    const [ax, ay] = slopeAt(l, x + h, y),
      [bx, by] = slopeAt(l, x, y + h);
    bump += (Math.hypot(ax - sx, ay - sy) + Math.hypot(bx - sx, by - sy)) / (2 * h);
  }
  // the height over the tiles' middles, against its mean over the five by five tiles round
  let whole = 0,
    fine = 0,
    n = 0;
  const middles: number[][] = [];
  for (let ty = 0; ty < l.rows; ty++) {
    const row: number[] = [];
    for (let tx = 0; tx < l.cols; tx++) row.push(l.terrain[ty * l.cols + tx]);
    middles.push(row);
  }
  const mean = middles.flat().reduce((a, b) => a + b, 0) / (l.cols * l.rows);
  for (let ty = 2; ty < l.rows - 2; ty++)
    for (let tx = 2; tx < l.cols - 2; tx++) {
      let box = 0;
      for (let dy = -2; dy <= 2; dy++) for (let dx = -2; dx <= 2; dx++) box += middles[ty + dy][tx + dx];
      const z = middles[ty][tx];
      whole += (z - mean) ** 2;
      fine += (z - box / 25) ** 2;
      n++;
    }
  return {
    relief: hi - lo,
    steepest,
    bumpiness: bump / points.length,
    detail: Math.sqrt(fine / n) / Math.sqrt(whole / n || 1),
    rests: rests / points.length,
  };
}
