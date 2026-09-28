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
 * The hardest the starting club strikes, in units a second along the ground:
 * on the green it rolls about fifty units, three quarters of the longest
 * hole, as it did under the drag it was first chosen with.
 */
export const HARDEST_SHOT = 40;

/**
 * How the green holds back a rolling ball: a steady slowing, in units a
 * second a second, as a putt dies on a green, so how far a ball rolls goes
 * as the square of its speed. At 16 the hardest shot rolls fifty units and
 * stops in under three seconds; the drag it replaced rolled it as far over
 * nearly five, with a long slow tail a player waited out.
 */
export const ROLL = { roll: 16 };

/**
 * How much of its speed into a thing a ball keeps coming back off it: the
 * rail, timber, sends a ball at thirty degrees away at about twenty, keeping
 * nine tenths of its speed; and what is on the course, plastic, a little
 * less lively. At the physics' own figure of a tenth, a ball met the rail
 * and ran along it.
 */
export const BOUNCE = { rail: 0.65, box: 0.5 };

/** How far a ball struck at `speed` rolls on the green before it stops. */
export function rollsFor(speed: number): number {
  return (speed * speed) / (2 * ROLL.roll);
}

/**
 * The speed a shot of `power` strikes at, with a club whose hardest is
 * `hardest`. The drag's length is how far the ball rolls, a half drag half as
 * far, so the aim line tells the truth; and since the distance goes as the
 * square of the speed, the speed goes as the root of the power.
 */
export function strikeSpeed(power: number, hardest: number): number {
  return hardest * Math.sqrt(power);
}

/** The power that strikes at `speed`, with a club whose hardest is `hardest`: `strikeSpeed` undone. */
export function powerFor(speed: number, hardest: number): number {
  return (speed / hardest) ** 2;
}

/**
 * How high a step of raised grass is, a digit in a map a step: less than
 * the ball's radius, so the ball rolls up one, and a rise of three steps
 * (1.2) is a wall to it from below and a drop from above. Measured: a ball
 * climbs a step of up to 0.9 at no cost to its speed, and not one of 1.2.
 */
export const STEP = 0.4;
/** How low water's floor is: under the world's bottom, so a ball rolled onto water falls out of the world, and is lost. */
export const WATER_FLOOR = -10;
/** The world's bottom: below it a ball has left the world, into water. */
export const BOTTOM = -5;

/** A grid of tiles, which are solid and which are water: all that is needed to say whether a point is on the grass. */
export interface Ground {
  cols: number;
  rows: number;
  originX: number;
  originY: number;
  /** One byte a tile, row by row from the south: 1 where the ball cannot go. */
  solid: Uint8Array;
  /** One byte a tile: 1 where there is water, which the ball can roll onto, and is lost in. */
  water: Uint8Array;
}

/** A hole laid out from its map: the grid, which tiles are rail, the tee and the cup, and the grass's extent. */
export interface Layout extends Ground {
  /** One byte a tile: 1 where the rail is drawn. The rest of what is solid is off the course. */
  rail: Uint8Array;
  /** How high the floor stands on each tile: nought for level grass, a step a digit, and far below for water. */
  floor: Float32Array;
  tee: { x: number; y: number };
  cup: { x: number; y: number };
  /** The box round the grass, in world units. */
  bounds: { minX: number; minY: number; maxX: number; maxY: number };
}

/**
 * A hole's layout from its map, drawn as seen from the tee with the far end
 * first, one character a tile: `#` rail, `.` grass, `T` the tee and `C` the
 * cup on level grass, a digit for grass raised that many steps, `~` water,
 * and a space for off the course. The grid is centred on the origin. A map with anything else in it, not exactly one tee and one cup, or
 * grass on its edge, where a ball would leave the world, is refused.
 */
export function layoutOf(map: readonly string[]): Layout {
  const rows = map.length;
  const cols = Math.max(...map.map((r) => r.length));
  const originX = -(cols * TILE) / 2,
    originY = -(rows * TILE) / 2;
  const solid = new Uint8Array(cols * rows),
    rail = new Uint8Array(cols * rows),
    water = new Uint8Array(cols * rows),
    floor = new Float32Array(cols * rows);
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
      else if (c === '~') {
        water[t] = 1;
        floor[t] = WATER_FLOOR;
      } else if (c >= '1' && c <= '9') floor[t] = (c.charCodeAt(0) - 48) * STEP;
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
  return {
    cols,
    rows,
    originX,
    originY,
    solid,
    rail,
    water,
    floor,
    tee: { x: teeX, y: teeY },
    cup: { x: cupX, y: cupY },
    bounds,
  };
}

/** The tile a point is in, or -1 off the grid. */
export function tileAt(g: Ground, x: number, y: number): number {
  const tx = Math.floor((x - g.originX) / TILE),
    ty = Math.floor((y - g.originY) / TILE);
  return tx < 0 || ty < 0 || tx >= g.cols || ty >= g.rows ? -1 : ty * g.cols + tx;
}

/** Whether a point is on the grass: on the grid, not solid, and not water. */
export function onFloor(g: Ground, x: number, y: number): boolean {
  const t = tileAt(g, x, y);
  return t >= 0 && g.solid[t] === 0 && g.water[t] === 0;
}
