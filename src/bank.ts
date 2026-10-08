/**
 * The first bank of a straight aim: where a ray from the ball meets the first tile it cannot enter, and the way it is
 * sent on from there, by the tile's geometry alone (the face it met, not the physics' own bounce, which has a ball's
 * radius, a rail's give and a spin in it). What the chalk draws past a rail on minigolf: a few more dots along the
 * reflected line, so a bank shot can be lined up by eye. Without a function of its own the page would work the
 * reflection out in a frame, and the fuzzer would have nothing to hold it to.
 */
import { TILE, tileAt, type Ground } from './arena';

/** How far apart the ray is sampled, in yards: a fraction of a tile, so no corner is stepped over. */
const STEP = 0.05;

/** Where a ray met the first solid tile, how far along it that is, and the unit direction it leaves in. */
export interface Bank {
  x: number;
  y: number;
  /** How far from the start the ray got before it met the tile. */
  along: number;
  /** The reflected direction, a unit vector. */
  dx: number;
  dy: number;
}

/** A bank made once, written into by `bankOf`, so a frame that finds one makes nothing. */
export const makeBank = (): Bank => ({ x: 0, y: 0, along: 0, dx: 0, dy: 0 });

const solidAt = (g: Ground, x: number, y: number): boolean => {
  const t = tileAt(g, x, y);
  return t < 0 || g.solid[t] === 1;
};

/**
 * Whether the ray from (x, y) along `angle` meets a solid tile within `most` yards, and if so the first bank written into
 * `out`: the last point of free ground before it, the distance to there, and the direction the ray is reflected into by
 * the face it met (a corner sends it straight back). A ray that starts in a solid tile, or never meets one, has no bank.
 */
export function bankOf(g: Ground, x: number, y: number, angle: number, most: number, out: Bank): boolean {
  const c = Math.cos(angle),
    s = Math.sin(angle);
  if (solidAt(g, x, y)) return false;
  let px = x,
    py = y;
  for (let d = STEP; d <= most; d += STEP) {
    const qx = x + c * d,
      qy = y + s * d;
    if (!solidAt(g, qx, qy)) {
      px = qx;
      py = qy;
      continue;
    }
    // the face met: the tile edge crossed in x, in y, or both at a corner, told by which neighbour of the last free point is solid
    const ix = Math.floor((qx - g.originX) / TILE) - Math.floor((px - g.originX) / TILE),
      iy = Math.floor((qy - g.originY) / TILE) - Math.floor((py - g.originY) / TILE);
    let flipX = ix !== 0,
      flipY = iy !== 0;
    if (flipX && flipY) {
      const aheadX = solidAt(g, qx, py),
        aheadY = solidAt(g, px, qy);
      if (aheadX && !aheadY) flipY = false;
      else if (aheadY && !aheadX) flipX = false;
    }
    out.x = px;
    out.y = py;
    out.along = d - STEP;
    out.dx = flipX ? -c : c;
    out.dy = flipY ? -s : s;
    return true;
  }
  return false;
}
