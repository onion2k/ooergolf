/**
 * What a hole is made of, and what a ball is: the size of a tile, the kinds
 * of body, the hardest shot, how a ball rolls, and a hole's layout read from
 * its map in `course.ts`. Content and the arithmetic of reading it, not
 * logic: the game reads it and the page draws it, and the lower modules go
 * on knowing nothing of any hole.
 */
export const TILE = 3;
/** The most bodies the world can hold. */
export const BODY_CAPACITY = 64;
/** The kinds of body there are, one radius each, and what each is called. */
export const KIND_RADIUS = [1.0];
export const KIND_NAME = ['ball'];
export const BALL = 0;
export const KINDS = KIND_RADIUS.length;

/**
 * The hardest the starting club strikes, in units a second along the ground.
 * At the roll below it carries about 48 units, measured before it was
 * chosen; the upgrades take it to about 60.
 */
export const HARDEST_SHOT = 40;

/**
 * How the course holds back a rolling ball: the physics' drag on anything
 * touching the floor, as a rate a second. The package's own 5.5 stops a putt
 * in under a second; at 0.8 a putt of 20 a second rolls 24 units over about
 * four. It is a world-wide figure until the physics has rolling resistance by
 * surface, and then it goes.
 */
export const ROLL = { floorDrag: 0.8 };

/** A grid of tiles and which are solid: all that is needed to say whether a point is on the grass. */
export interface Ground {
  cols: number;
  rows: number;
  originX: number;
  originY: number;
  /** One byte a tile, row by row from the south: 1 where the ball cannot go. */
  solid: Uint8Array;
}

/** A hole laid out from its map: the grid, which tiles are rail, the tee and the cup, and the grass's extent. */
export interface Layout extends Ground {
  /** One byte a tile: 1 where the rail is drawn. The rest of what is solid is off the course. */
  rail: Uint8Array;
  tee: { x: number; y: number };
  cup: { x: number; y: number };
  /** The box round the grass, in world units. */
  bounds: { minX: number; minY: number; maxX: number; maxY: number };
}

/**
 * A hole's layout from its map, drawn as seen from the tee with the far end
 * first, one character a tile: `#` rail, `.` grass, `T` the tee and `C` the
 * cup on grass, and a space for off the course. The grid is centred on the
 * origin. A map with anything else in it, not exactly one tee and one cup, or
 * grass on its edge, where a ball would leave the world, is refused.
 */
export function layoutOf(map: readonly string[]): Layout {
  const rows = map.length;
  const cols = Math.max(...map.map((r) => r.length));
  const originX = -(cols * TILE) / 2,
    originY = -(rows * TILE) / 2;
  const solid = new Uint8Array(cols * rows),
    rail = new Uint8Array(cols * rows);
  const tees: [number, number][] = [],
    cups: [number, number][] = [];
  const bounds = { minX: Infinity, minY: Infinity, maxX: -Infinity, maxY: -Infinity };
  for (let r = 0; r < rows; r++) {
    const ty = rows - 1 - r;
    for (let tx = 0; tx < cols; tx++) {
      const c = map[r][tx] ?? ' ';
      const t = ty * cols + tx;
      const x = originX + (tx + 0.5) * TILE,
        y = originY + (ty + 0.5) * TILE;
      if (c === '#') {
        solid[t] = rail[t] = 1;
        continue;
      }
      if (c === ' ') {
        solid[t] = 1;
        continue;
      }
      if (c === 'T') tees.push([x, y]);
      else if (c === 'C') cups.push([x, y]);
      else if (c !== '.') throw new Error(`a hole's map has "${c}" in it, which is not a tile`);
      if (tx === 0 || ty === 0 || tx === cols - 1 || ty === rows - 1)
        throw new Error(`a hole's map has grass on its edge, at column ${tx} of row ${r}`);
      bounds.minX = Math.min(bounds.minX, x - TILE / 2);
      bounds.maxX = Math.max(bounds.maxX, x + TILE / 2);
      bounds.minY = Math.min(bounds.minY, y - TILE / 2);
      bounds.maxY = Math.max(bounds.maxY, y + TILE / 2);
    }
  }
  if (tees.length !== 1) throw new Error(`a hole's map has ${tees.length} tees, not one`);
  if (cups.length !== 1) throw new Error(`a hole's map has ${cups.length} cups, not one`);
  const [[teeX, teeY]] = tees,
    [[cupX, cupY]] = cups;
  return { cols, rows, originX, originY, solid, rail, tee: { x: teeX, y: teeY }, cup: { x: cupX, y: cupY }, bounds };
}

/** The tile a point is in, or -1 off the grid. */
export function tileAt(g: Ground, x: number, y: number): number {
  const tx = Math.floor((x - g.originX) / TILE),
    ty = Math.floor((y - g.originY) / TILE);
  return tx < 0 || ty < 0 || tx >= g.cols || ty >= g.rows ? -1 : ty * g.cols + tx;
}

/** Whether a point is on the grass: on the grid and not solid. */
export function onFloor(g: Ground, x: number, y: number): boolean {
  const t = tileAt(g, x, y);
  return t >= 0 && g.solid[t] === 0;
}
