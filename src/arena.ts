/**
 * What a hole is made of, and what a ball is: the size of a tile, the kinds
 * of body, the hardest shot, how a ball rolls, and a hole's layout read from
 * its map in `course.ts`. Content and the arithmetic of reading it, not
 * logic: the game reads it and the page draws it, and the lower modules go
 * on knowing nothing of any hole.
 */
import { LIE, type Lie } from './surfaces';
import { TREE } from './trees';

export const TILE = 3;
/**
 * The physics' fixed step, and its gravity: the package's defaults, which the game steps and predicts by. Here, with the
 * figures a hole is made of, since a hole's ground is judged by what it holds a ball against gravity, and the tools that
 * make holes must not import the package. `physics.ts` gives them again for what steps a world.
 */
export const PHYSICS = { step: 1 / 120, gravity: 70 } as const;
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

/**
 * Sand: a steady slowing, as the green's, but nearly four times as heavy.
 * A putt that reaches it at 20 dies three units in, and the hardest shot
 * ploughs thirteen, about four tiles; and since it is a steady slowing, as
 * the green's is, how hard to strike across both is one sum.
 */
export const SAND = { roll: 60 };

/**
 * A bumper: a round post a unit in radius, standing a little over the
 * ball, which throws a ball off it faster than it came, as a pinball post
 * does: a fifth faster straight on, where the rail keeps 0.65 of it.
 */
export const BUMPER = { radius: 1, height: 1.6, restitution: 1.2 } as const;

/**
 * The fastest the course may throw a ball, as a share of the hardest shot
 * of the club that struck it. A post throws a ball faster than it came, and
 * a ball on the line between two posts facing each other would be thrown
 * back and forth faster each time, to thousands a second; the game holds it
 * to this. Off that line a ball leaves the posts within a few bounces, at up
 * to about 1.35 times what it was struck at.
 */
export const FASTEST = 1.5;

/**
 * A knock: the ball's velocity turned by at least `least` units a second in
 * one of the physics' steps, by the rail, a post, a box, the cup or a riser,
 * or its fall stopped by the ground it drops onto. Measured over both
 * courses and every club, nothing else turns it by as much: in a step, the
 * green, the sand and a slope turn a ball by at most 3.3, and a belt 4.5,
 * where a drop off one step lands at about 7.5 and a rail met at 4 a second
 * straight on turns it by 6.6. Knocks closer together than `apart` seconds
 * are one, unless the later is the harder, so what a ball meets twice in a
 * corner, or goes on meeting in the cup, is not a knock a step.
 */
export const KNOCK = { least: 6, apart: 0.1 } as const;

/**
 * Ground that slopes: a height for every tile, a digit a tile in a hole's
 * `terrain`, each this much higher than nought. A digit between neighbours
 * is a gentle slope a ball rests on; two is one it rolls down; three is the
 * steepest the physics allows, half a tile over a tile.
 */
export const TERRAIN = { step: 0.5 } as const;

/** The characters of a golf hole's map that name a kind of ground. */
const GOLF_TILES: Record<string, Lie> = { f: LIE.fairway, r: LIE.rough, g: LIE.green, t: LIE.tee };

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
/**
 * How far below the grass water's surface is drawn, which the earth at a pond's edge comes down to. The ball never
 * meets it: it is lost the moment it is over water, and the floor it falls through is `WATER_FLOOR`. A pond a step
 * below the grass, and not a stain on it.
 */
export const WATER_LEVEL = -0.3;
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
  /** One byte a tile: 1 where there is sand, level ground a ball rolls on and is slowed hard by. */
  sand: Uint8Array;
  /**
   * One byte a tile, of a golf hole: what its ground is, by `LIE` (the tee, the fairway, the rough, the green), which
   * the physics rolls a ball on and a landing is scrubbed by. Sand is its own array, and `lieAt` says the whole. All
   * nought on a hole of minigolf, which has no surfaces but its green, its sand and its belts.
   */
  lie: Uint8Array;
  /** Whether this is a golf hole, drawn with golf's tiles: a ball on it is struck with a club from the bag, and lands. */
  golf: boolean;
  /**
   * One byte a tile, of a golf hole: 1 where the ground is out of bounds, drawn `x`: rough to the physics, and lost the
   * moment a ball is on it, as one in water is. All nought on a hole of minigolf, whose edge is a rail.
   */
  oob: Uint8Array;
  /** Where each tree stands, in the middle of its tile, of a golf hole: a trunk of `TREE.trunk` and a canopy over it. None on minigolf. */
  trees: { x: number; y: number }[];
  /** Where each post stands: in the middle of its tile, on grass. */
  bumpers: { x: number; y: number }[];
  /** How high the floor stands on each tile: nought for level grass, a step a digit, and far below for water. */
  floor: Float32Array;
  /** How high the ground slopes on each tile, at its middle, on top of its step: all nought on a hole that is flat. */
  terrain: Float32Array;
  tee: { x: number; y: number };
  cup: { x: number; y: number };
  /** The box round the grass, in world units. */
  bounds: { minX: number; minY: number; maxX: number; maxY: number };
}

/**
 * A hole's layout from its map, drawn as seen from the tee with the far end
 * first, one character a tile: `#` rail, `.` grass, `T` the tee and `C` the
 * cup on level grass, a digit for grass raised that many steps, `~` water,
 * `s` sand, `o` a post standing on grass, and a space for off the course. A golf hole is drawn in `f` fairway, `r` rough,
 * `g` green, `t` the tee's box and `x` out of bounds instead of `.` and the digits, with the same `T`, `C`, `s`, `~` and `o`, and `^`, a tree: the tee is
 * a tee and the cup a green whatever they are drawn on, and a post stands in the rough.
 * `terrain`, if given, is how high the ground slopes on each tile: a grid the
 * shape of the map with a digit a tile, or real heights, one a tile, row by
 * row from the south as a layout has them, which is how ground made from
 * noise comes (see `noise.ts`). Whether the physics will take it is the
 * physics' to say: see `terrainRefusal`. The grid is centred on the origin. A map with anything else in it, not exactly one tee and one cup, or
 * grass on its edge, where a ball would leave the world, is refused.
 */
export function layoutOf(map: readonly string[], terrain?: readonly string[] | Float32Array): Layout {
  const rows = map.length;
  const cols = Math.max(...map.map((r) => r.length));
  const originX = -(cols * TILE) / 2,
    originY = -(rows * TILE) / 2;
  const solid = new Uint8Array(cols * rows),
    rail = new Uint8Array(cols * rows),
    water = new Uint8Array(cols * rows),
    sand = new Uint8Array(cols * rows),
    lie = new Uint8Array(cols * rows),
    oob = new Uint8Array(cols * rows),
    floor = new Float32Array(cols * rows);
  const bumpers: { x: number; y: number }[] = [];
  const trees: { x: number; y: number }[] = [];
  const treeTiles: number[] = [];
  const tees: [number, number][] = [],
    cups: [number, number][] = [];
  // the tiles that are not of a kind of ground by their letter, which a golf hole gives their own, and whether either
  // sort of grass has been drawn: a hole is one or the other
  const teeTiles: number[] = [],
    cupTiles: number[] = [],
    postTiles: number[] = [];
  let golf = false,
    minigolf = false;
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
      if (c === 'T') {
        tees.push([x, y]);
        teeTiles.push(t);
      } else if (c === 'C') {
        cups.push([x, y]);
        cupTiles.push(t);
      } else if (c === '~') {
        water[t] = 1;
        floor[t] = WATER_FLOOR;
      } else if (c === 's') sand[t] = 1;
      else if (c === 'o') {
        bumpers.push({ x, y });
        postTiles.push(t);
      } else if (c === '^') {
        // a tree stands in the rough: a trunk and a canopy
        golf = true;
        trees.push({ x, y });
        treeTiles.push(t);
      } else if (c === 'x') {
        // out of bounds: rough to roll on and play from, and a line the ball is lost across
        golf = true;
        lie[t] = LIE.rough;
        oob[t] = 1;
      } else if (c in GOLF_TILES) {
        golf = true;
        lie[t] = GOLF_TILES[c];
      } else if (c >= '1' && c <= '9') {
        minigolf = true;
        floor[t] = (c.charCodeAt(0) - 48) * STEP;
      } else if (c === '.') minigolf = true;
      else throw new Error(`a hole's map has "${c}" in it, which is not a tile`);
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
  if (golf && minigolf)
    throw new Error("a hole's map mixes the minigolf's grass, or its raised steps, with golf's fairway and rough");
  if (golf) {
    // whatever they were drawn on, a ball is teed up on a tee, the cup is cut in a green, and a post stands in the rough
    for (const t of teeTiles) lie[t] = LIE.tee;
    for (const t of cupTiles) lie[t] = LIE.green;
    for (const t of postTiles) lie[t] = LIE.rough;
    for (const t of treeTiles) lie[t] = LIE.rough;
  }
  const heights = terrainOf(terrain, cols, rows);
  return {
    cols,
    rows,
    originX,
    originY,
    solid,
    rail,
    water,
    sand,
    lie,
    golf,
    oob,
    trees,
    bumpers,
    floor,
    terrain: heights,
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

/**
 * The step the ground stands on at a point: the tile's floor, nought off the
 * grid. A step is what the physics takes for a wall from below and an edge
 * from above, so it is what the autopilot judges a rise by, and what a ball
 * must be level on to be put down; ground that slopes never is a wall.
 */
export function stepAt(l: Layout, x: number, y: number): number {
  const t = tileAt(l, x, y);
  return t < 0 ? 0 : l.floor[t];
}

/**
 * How high the ground is at a point: the one place the game reads it, so
 * that ground that slopes is read the same way by everything that stands on
 * it. The step the point stands on, and the terrain smoothed between the
 * tiles' middles as the physics smooths it.
 */
export function heightAt(l: Layout, x: number, y: number): number {
  return stepAt(l, x, y) + smoothed(l, x, y, false, false);
}

/** How high the ground slopes at a point, above the step it stands on. */
export function terrainAt(l: Layout, x: number, y: number): number {
  return smoothed(l, x, y, false, false);
}

/** Each hole's highest slope, worked out once: it is read every step a ball goes faster than a post may throw it. */
const highest = new WeakMap<Layout, number>();

/** The highest the ground slopes anywhere on a hole: no point is higher, since the smoothing is an average of heights. */
export function highestTerrain(l: Layout): number {
  let most = highest.get(l);
  if (most === undefined) {
    most = 0;
    for (const h of l.terrain) most = Math.max(most, h);
    highest.set(l, most);
  }
  return most;
}

/** How the ground slopes at a point, across X and along Y: the terrain's, since a step is an edge and not a slope. */
export function slopeAt(l: Layout, x: number, y: number): [number, number] {
  return [smoothed(l, x, y, true, false) / TILE, smoothed(l, x, y, false, true) / TILE];
}

/** The same, written into `out`, for what is asked on every frame. */
export function slopeInto(l: Layout, x: number, y: number, out: [number, number]): void {
  out[0] = smoothed(l, x, y, true, false) / TILE;
  out[1] = smoothed(l, x, y, false, true) / TILE;
}

/** How far a ball's middle stands above the ground under it, resting there: further than its radius on a slope. */
export function restingAbove(l: Layout, x: number, y: number, radius: number): number {
  const [sx, sy] = slopeAt(l, x, y);
  return radius * Math.sqrt(1 + sx * sx + sy * sy);
}

/**
 * A uniform cubic B-spline's four weights at `t` of the way through a span,
 * for the control points either side and one beyond each; or their
 * derivatives. The physics' own, from its terrain session: it smooths the
 * heights, does not pass through them, and keeps height and slope smooth.
 */
function weights(t: number, derivative: boolean): [number, number, number, number] {
  if (derivative) return [-((1 - t) ** 2) / 2, (3 * t * t - 4 * t) / 2, (-3 * t * t + 2 * t + 1) / 2, (t * t) / 2];
  return [(1 - t) ** 3 / 6, (3 * t ** 3 - 6 * t * t + 4) / 6, (-3 * t ** 3 + 3 * t * t + 3 * t + 1) / 6, t ** 3 / 6];
}

/**
 * The terrain at a point, with the tiles' middles for control points and
 * the tiles at the edge repeated off the grid; or its rate across X or along
 * Y, in height a tile. Nought on a hole with none.
 */
function smoothed(l: Layout, x: number, y: number, dx: boolean, dy: boolean): number {
  const u = (x - l.originX) / TILE - 0.5,
    v = (y - l.originY) / TILE - 0.5;
  const kx = Math.floor(u),
    ky = Math.floor(v);
  const wx = weights(u - kx, dx),
    wy = weights(v - ky, dy);
  let h = 0;
  for (let b = 0; b < 4; b++) {
    const row = Math.min(l.rows - 1, Math.max(0, ky - 1 + b));
    for (let a = 0; a < 4; a++) {
      const col = Math.min(l.cols - 1, Math.max(0, kx - 1 + a));
      h += wx[a] * wy[b] * l.terrain[row * l.cols + col];
    }
  }
  return h;
}

/**
 * The heights a hole's `terrain` gives each tile, row by row from the south;
 * all nought without one. Real heights are the hole's own copy, so nothing a
 * game does to a layout reaches the content they came from.
 */
function terrainOf(grid: readonly string[] | Float32Array | undefined, cols: number, rows: number): Float32Array {
  const out = new Float32Array(cols * rows);
  if (!grid) return out;
  if (grid instanceof Float32Array) {
    if (grid.length !== cols * rows)
      throw new Error(`a hole's terrain is not the shape of its map, ${cols} by ${rows}`);
    for (const h of grid)
      if (!Number.isFinite(h) || h < 0)
        throw new Error(`a hole's terrain has ${h} in it, which is not a height above nought`);
    out.set(grid);
    return out;
  }
  if (grid.length !== rows || grid.some((r) => r.length !== cols))
    throw new Error(`a hole's terrain is not the shape of its map, ${cols} by ${rows}`);
  for (let r = 0; r < rows; r++)
    for (let tx = 0; tx < cols; tx++) {
      const c = grid[r][tx];
      if (c < '0' || c > '9') throw new Error(`a hole's terrain has "${c}" in it, which is not a digit`);
      out[(rows - 1 - r) * cols + tx] = (c.charCodeAt(0) - 48) * TERRAIN.step;
    }
  return out;
}

/** Whether a point is on a tile of sand: where a stroke throws sand up, and not grass. Off the grid, never. */
export function onSand(l: Layout, x: number, y: number): boolean {
  const t = tileAt(l, x, y);
  return t >= 0 && l.sand[t] === 1;
}

/**
 * What the ground is at a point, by `LIE`: sand wherever there is sand, else the tile's own kind on a golf hole, and
 * none anywhere else, off the grid too. The one place a surface is read, so the physics, a landing and a strike agree.
 */
export function lieAt(l: Layout, x: number, y: number): Lie {
  const t = tileAt(l, x, y);
  if (t < 0) return LIE.none;
  return l.sand[t] ? LIE.sand : (l.lie[t] as Lie);
}

/** Whether a point is on the ground the ball rolls on, grass or sand: on the grid, not solid, and not water. */
export function onFloor(g: Ground, x: number, y: number): boolean {
  const t = tileAt(g, x, y);
  return t >= 0 && g.solid[t] === 0 && g.water[t] === 0;
}

/** How far a point is from the side of the nearest tree's trunk, or Infinity on a hole with none. */
export function fromTrees(l: Layout, x: number, y: number): number {
  let near = Infinity;
  for (const t of l.trees) near = Math.min(near, Math.hypot(x - t.x, y - t.y) - TREE.trunk);
  return near;
}

/** How far a point is from the side of the nearest post, or Infinity on a hole with none. */
export function fromPosts(l: Layout, x: number, y: number): number {
  let near = Infinity;
  for (const p of l.bumpers) near = Math.min(near, Math.hypot(x - p.x, y - p.y) - BUMPER.radius);
  return near;
}
