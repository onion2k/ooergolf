/**
 * The scenery round a hole: trees, hedges, flowers and rocks on the rough, for
 * fun, which the physics never sees. Where each stands comes from the hole's
 * name and never from the game's chance, so the same hole looks the same
 * every time, and a round played from a seed is not moved by the drawing.
 *
 * It is handed a hole's layout and says what stands where; the scene draws it.
 */
import { TILE, tileAt, type Layout } from './arena';
import { seeded } from './random';

export type SceneryKind = 'round tree' | 'pine' | 'hedge' | 'flowers' | 'rock';

export interface Piece {
  kind: SceneryKind;
  x: number;
  y: number;
  /** Which way it is turned, and how much bigger or smaller than its model. */
  yaw: number;
  scale: number;
  /** For flowers, which of their colours. */
  variant: number;
}

/**
 * How much scenery a hole has, how far it keeps from the grass and the rail,
 * how far apart, and how far out from the course it may stand: close enough
 * to be seen from the camera's usual place, far enough not to crowd it.
 */
export const SCENERY = { least: 12, most: 30, clear: 3, spacing: 4.5, reach: 16 } as const;

/** How often each kind is chosen. */
const WEIGHTS: [SceneryKind, number][] = [
  ['round tree', 3],
  ['pine', 2],
  ['hedge', 1.5],
  ['flowers', 2.5],
  ['rock', 1],
];

/** A seed from a name: FNV-1a, so the same name always scatters alike. */
function seedOf(name: string): number {
  let h = 0x811c9dc5;
  for (const c of name) h = Math.imul(h ^ c.charCodeAt(0), 0x01000193);
  return h >>> 0;
}

/** Whether a point is on the rough, clear of every tile of the course and its rail by `SCENERY.clear`. */
function onRough(l: Layout, x: number, y: number): boolean {
  for (let a = 0; a < 8; a++) {
    const t = tileAt(
      l,
      x + Math.cos((a / 8) * Math.PI * 2) * SCENERY.clear,
      y + Math.sin((a / 8) * Math.PI * 2) * SCENERY.clear,
    );
    if (t >= 0 && (l.solid[t] === 0 || l.rail[t] === 1)) return false;
  }
  const t = tileAt(l, x, y);
  return t < 0 || (l.solid[t] === 1 && l.rail[t] === 0);
}

/** What stands round the hole laid out as `layout`, called `name`. */
export function scatter(layout: Layout, name: string): Piece[] {
  const random = seeded(seedOf(name));
  const { originX, originY, cols, rows } = layout;
  const minX = originX - SCENERY.reach,
    minY = originY - SCENERY.reach,
    w = cols * TILE + SCENERY.reach * 2,
    h = rows * TILE + SCENERY.reach * 2;
  const total = WEIGHTS.reduce((a, [, n]) => a + n, 0);
  const out: Piece[] = [];
  for (let tries = 0; tries < 800 && out.length < SCENERY.most; tries++) {
    const x = minX + random() * w,
      y = minY + random() * h;
    if (!onRough(layout, x, y)) continue;
    if (out.some((p) => Math.hypot(p.x - x, p.y - y) < SCENERY.spacing)) continue;
    let pick = random() * total,
      kind: SceneryKind = 'rock';
    for (const [k, n] of WEIGHTS)
      if ((pick -= n) < 0) {
        kind = k;
        break;
      }
    out.push({
      kind,
      x,
      y,
      yaw: random() * Math.PI * 2,
      scale: 0.8 + random() * 0.45,
      variant: Math.floor(random() * 3),
    });
  }
  return out;
}
