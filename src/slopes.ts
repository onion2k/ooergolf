/**
 * Whether a tile's ground holds a ball, and how much of a hole's fairway does not: a leaf of arithmetic over a layout, the
 * one place the rule is written. A ball rests where the slope's pull along the ground, which is the slope over the root of
 * one and its square, is no more than its lie's roll holds against gravity (97 in a hundred of it, so a ball is not left
 * on the very edge of rolling). The generator asks it of a hole it is making, and a test or a course's gate asks how much
 * of a hole's fairway is ground a ball runs down; without one place for it the two would drift apart.
 */
import { PHYSICS, TILE, slopeAt, terrainAt, type Layout } from './arena';
import { LIE, rollOf } from './surfaces';

/** Whether tile `t` of the layout, of a lie that is not solid or out of bounds, is ground its lie holds a ball on, on greens that run at `greens` (the normal speed if left out). */
export function holdsBall(l: Layout, t: number, greens?: number): boolean {
  const [sx, sy] = slopeAt(
    l,
    l.originX + ((t % l.cols) + 0.5) * TILE,
    l.originY + (Math.floor(t / l.cols) + 0.5) * TILE,
  );
  const s = Math.hypot(sx, sy);
  return (
    s / Math.sqrt(1 + s * s) <= (0.97 * rollOf(l.lie[t] as Parameters<typeof rollOf>[0], greens)) / PHYSICS.gravity
  );
}

/** The share of a hole's fairway tiles whose slope the fairway does not hold a ball on: nought for ground a ball rests on everywhere, and nought for a hole with no fairway. */
export function runningShare(l: Layout, greens?: number): number {
  let fairway = 0,
    running = 0;
  for (let t = 0; t < l.cols * l.rows; t++) {
    if (l.solid[t] || l.oob[t] || l.lie[t] !== LIE.fairway) continue;
    fairway++;
    if (!holdsBall(l, t, greens)) running++;
  }
  return fairway === 0 ? 0 : running / fairway;
}

/**
 * The first tile of fairway or first cut that a ball put down cannot be left on and whose way down, tile by tile by the
 * steepest descent of the ground as a ball meets it, does not end well, or -1 if there is none. A way ends well on ground a ball rests on, on
 * rough or sand or water (which take what runs down to them: the rough holds a ball on any slope the physics allows, and a
 * lake only costs a stroke), and ends badly on rock, on out of bounds, or on a hollow too steep to hold it. A generator that
 * lets fairway run asks this, so that a ball that rolls off a bank is never lost to the edge of the course.
 */
export function drainFault(l: Layout, greens?: number): number {
  const n = l.cols * l.rows;
  // 0 not yet known, 1 a way that ends well, 2 one that does not
  const verdict = new Uint8Array(n);
  const runs = (t: number) => !l.solid[t] && !l.oob[t] && (l.lie[t] === LIE.fairway || l.lie[t] === LIE.cut);
  // the ground as the ball meets it, smoothed between the tiles' middles: the foot of a cliff in the tiles' heights is a flat
  // of equal tiles, and on the smoothed ground it slopes away from the cliff, which is where a ball goes
  const high = new Float64Array(n).fill(NaN);
  const ht = (t: number) =>
    (high[t] = Number.isNaN(high[t])
      ? terrainAt(l, l.originX + ((t % l.cols) + 0.5) * TILE, l.originY + (Math.floor(t / l.cols) + 0.5) * TILE)
      : high[t]);
  const path: number[] = [];
  for (let start = 0; start < n; start++) {
    if (!runs(start) || verdict[start] || holdsBall(l, start, greens)) continue;
    path.length = 0;
    let at = start,
      end = 0;
    for (;;) {
      if (verdict[at]) {
        end = verdict[at];
        break;
      }
      path.push(at);
      let next = -1,
        low = ht(at);
      const c = at % l.cols,
        r = Math.floor(at / l.cols);
      for (let dr = -1; dr <= 1; dr++)
        for (let dc = -1; dc <= 1; dc++) {
          const cc = c + dc,
            rr = r + dr;
          if ((!dc && !dr) || cc < 0 || rr < 0 || cc >= l.cols || rr >= l.rows) continue;
          const k = rr * l.cols + cc;
          // the lowest neighbour, and of equals one a ball may enter over one it may not
          if (
            ht(k) < low ||
            (ht(k) === low && next >= 0 && (l.solid[next] || l.oob[next]) && !(l.solid[k] || l.oob[k]))
          ) {
            low = ht(k);
            next = k;
          }
        }
      if (next < 0) {
        end = runs(at) && !holdsBall(l, at, greens) ? 2 : 1;
        break;
      }
      at = next;
      if (l.solid[at] || l.oob[at]) {
        end = 2;
        break;
      }
      // ground that is not fairway or cut takes the ball, and fairway or cut that holds it keeps it
      if (!runs(at) || holdsBall(l, at, greens)) {
        end = 1;
        break;
      }
    }
    for (const p of path) verdict[p] = end;
    if (end === 2) return start;
  }
  return -1;
}
