/**
 * Open holes: a hole many times the size of any that is drawn by hand, made from a spec and a seed. A green inside a
 * rail with the tee and the cup on it, and on it ponds, bunkers and stands of posts, placed where they suit and never
 * where they would spoil the hole: clear of the tee and the cup and the rail, a tile from one another, and never so
 * that no route wide enough to putt along is left between the tee and the cup. Its ground is noise, as The Downs' is,
 * with a level bed under each bunker and each pond lying in a hollow at nought, since the water of the game is at a
 * fixed height under the ground and a pond on a hill would be a pit.
 *
 * Pure and seeded: the same spec is the same hole, and nothing here reaches for chance of its own. A spec that cannot
 * be made is refused, by name, and never returned as a hole that cannot be played. It is content's tool, handed a
 * spec and giving back a `HoleDef`; it imports no content, only the type of a hole.
 */
import { layoutOf } from './arena';
import type { HoleDef } from './course';
import { noiseGround, type Feel, type Flat } from './noise';
import { seeded, type Random } from './random';

/** What is put on a hole: a kind, how many, and how big each is. */
export interface Feature {
  /** A pond, a bunker, or a stand of posts. */
  kind: 'pond' | 'sand' | 'stand';
  count: number;
  /**
   * How big each is: the radius of a pond or a bunker, in tiles, from the least to the most, or the number of posts in
   * a stand, a whole number from one to nine.
   */
  size: [min: number, max: number];
}

export interface OpenSpec {
  name: string;
  par: number;
  /** Tiles across and long, the map, and the tee's and the cup's column and row from the top, each two tiles in from the rail. */
  shape: [cols: number, rows: number, tee: [number, number], cup: [number, number]];
  feel: Feel;
  steepness: number;
  seed: number;
  /** In the order they are placed: what is first has the pick of the ground. */
  features: Feature[];
}

/** How near a feature may come to the tee and the cup, in tiles, and how far in from the rail its first tile is. */
const KEEP = 3.5,
  EDGE = 2;
/** The tiles left clear between one feature and the next. */
const GAP = 1;
/** How many places are tried for each feature before it is given up as not fitting. */
const TRIES = 400;
/** How high a pond's tiles may stand on the ground before it is levelled, on the mean, as a share of the ground's height: a hollow. */
const HOLLOW = 0.4;
/**
 * The share of the ground, the lowest of it, that a pond is centred in. Measured over sixty seeds of each feel: at 0.15 and
 * a hollow of 0.3 a choppy ground, whose hollows are small, would not take a pond on half its seeds; at 0.3 and 0.4 two
 * ponds are placed on every seed of every feel.
 */
const LOW = 0.3;
/** How much a blob's edge wanders, as a share of its radius: at most 0.4, so it is never more than 1.4 times as wide as it says. */
const WOBBLE = { two: 0.25, three: 0.15 };
/** How many tiles either side of the middle of a route must be open as well, so it is three tiles wide: room for a ball to roll along. */
const HALF_WIDTH = 1;

/**
 * A green `cols` tiles across and `rows` long inside a rail, the tee and the cup on it at a column and a row from the
 * top of the map. A map as `course.ts` draws them.
 */
export function fairway(cols: number, rows: number, tee: [number, number], cup: [number, number]): string[] {
  return Array.from({ length: rows }, (_, r) =>
    Array.from({ length: cols }, (_, c) => {
      if (r === 0 || r === rows - 1 || c === 0 || c === cols - 1) return '#';
      if (c === tee[0] && r === tee[1]) return 'T';
      if (c === cup[0] && r === cup[1]) return 'C';
      return '.';
    }).join(''),
  );
}

/** A spec that is not a hole is refused here, by what is wrong with it. */
function refuse(spec: OpenSpec) {
  const { name, par, seed, shape, features } = spec;
  const fault = (what: string) => new RangeError(`${name || 'an open hole'}: ${what}`);
  if (!name) throw new RangeError('an open hole has to have a name');
  if (!Number.isInteger(par) || par < 1) throw fault(`its par is a whole number from one, not ${par}`);
  if (!Number.isInteger(seed)) throw fault(`its seed is a whole number, not ${seed}`);
  const [cols, rows, tee, cup] = shape;
  if (!Number.isInteger(cols) || !Number.isInteger(rows) || cols < 10 || rows < 10)
    throw fault(`it is ten tiles or more each way, not ${cols} by ${rows}`);
  for (const [what, [c, r]] of [
    ['tee', tee],
    ['cup', cup],
  ] as const)
    if (
      !Number.isInteger(c) ||
      !Number.isInteger(r) ||
      c < EDGE ||
      r < EDGE ||
      c > cols - 1 - EDGE ||
      r > rows - 1 - EDGE
    )
      throw fault(`the ${what} at column ${c}, row ${r} is not ${EDGE} tiles in from the rail`);
  if (Math.hypot(tee[0] - cup[0], tee[1] - cup[1]) < 2 * KEEP)
    throw fault(`the tee and the cup are ${(2 * KEEP).toFixed(0)} tiles apart or more`);
  for (const { kind, count, size } of features) {
    if (!(['pond', 'sand', 'stand'] as string[]).includes(kind))
      throw fault(`there is no feature called ${String(kind)}`);
    if (!Number.isInteger(count) || count < 0)
      throw fault(`the count of ${kind}s is a whole number from nought, not ${count}`);
    const [least, most] = size;
    if (!(least > 0 && least <= most))
      throw fault(`the size of a ${kind} is from more than nought to as much again, not ${least} to ${most}`);
    if (kind === 'stand' && (!Number.isInteger(least) || !Number.isInteger(most) || most > 9))
      throw fault(`the size of a stand is a whole number of posts from one to nine, not ${least} to ${most}`);
  }
}

/** Whether a route wide enough to putt along joins the tee and the cup, over grass and sand and no rail, water or post. */
function joined(grid: string[][], tee: [number, number], cup: [number, number]): boolean {
  const rows = grid.length,
    cols = grid[0].length;
  const open = (c: number, r: number) => c >= 0 && r >= 0 && c < cols && r < rows && '.TCs'.includes(grid[r][c]);
  // a tile is on the way if it and every tile within `HALF_WIDTH` of it are open
  const wide = (c: number, r: number) => {
    for (let dc = -HALF_WIDTH; dc <= HALF_WIDTH; dc++)
      for (let dr = -HALF_WIDTH; dr <= HALF_WIDTH; dr++) if (!open(c + dc, r + dr)) return false;
    return true;
  };
  const seen = new Uint8Array(cols * rows);
  const todo = [tee[1] * cols + tee[0]];
  seen[todo[0]] = 1;
  for (let head = 0; head < todo.length; head++) {
    const c = todo[head] % cols,
      r = Math.floor(todo[head] / cols);
    if (c === cup[0] && r === cup[1]) return true;
    for (const [dc, dr] of [
      [1, 0],
      [-1, 0],
      [0, 1],
      [0, -1],
    ]) {
      const k = (r + dr) * cols + (c + dc);
      if (open(c + dc, r + dr) && !seen[k] && wide(c + dc, r + dr)) {
        seen[k] = 1;
        todo.push(k);
      }
    }
  }
  return false;
}

/** A tile of the map: its column, and its row from the top. */
type Tile = [number, number];

export function openHole(spec: OpenSpec): HoleDef {
  refuse(spec);
  const { name, par, shape, feel, steepness, seed, features } = spec;
  const [cols, rows, tee, cup] = shape;
  const random = seeded(seed);
  const grid = fairway(cols, rows, tee, cup).map((row) => [...row]);
  const level = layoutOf(grid.map((row) => row.join('')));
  // the ground before anything is levelled, to see where the hollows are: a pond is placed in one
  const plain = noiseGround(level, { seed, feel, steepness });
  const highest = Math.max(...plain);
  const height = (c: number, r: number) => plain[(rows - 1 - r) * cols + c];
  const flats: Flat[] = [];
  // where a pond may be centred: the lowest of the ground in from the rail, the hollows
  const inside: Tile[] = [];
  for (let r = EDGE; r <= rows - 1 - EDGE; r++) for (let c = EDGE; c <= cols - 1 - EDGE; c++) inside.push([c, r]);
  const hollows = inside
    .sort((a, b) => height(a[0], a[1]) - height(b[0], b[1]))
    .slice(0, Math.max(40, Math.floor(inside.length * LOW)));

  /** Whether a tile may take a feature: grass, in from the rail, clear of the tee and the cup, and a gap from the others. */
  const fits = (c: number, r: number) => {
    if (c < EDGE || r < EDGE || c > cols - 1 - EDGE || r > rows - 1 - EDGE || grid[r][c] !== '.') return false;
    if (Math.hypot(c - tee[0], r - tee[1]) < KEEP || Math.hypot(c - cup[0], r - cup[1]) < KEEP) return false;
    for (let dc = -GAP; dc <= GAP; dc++)
      for (let dr = -GAP; dr <= GAP; dr++) if ('~so'.includes(grid[r + dr][c + dc])) return false;
    return true;
  };

  /** Puts `ch` on `tiles` if the way from the tee to the cup is still there, and says whether it was. */
  const lay = (tiles: Tile[], ch: string): boolean => {
    for (const [c, r] of tiles) grid[r][c] = ch;
    if (joined(grid, tee, cup)) return true;
    for (const [c, r] of tiles) grid[r][c] = '.';
    return false;
  };

  const between = (least: number, most: number, chance: Random) => least + chance() * (most - least);

  for (const { kind, count, size } of features)
    for (let n = 0; n < count; n++) {
      let placed = false;
      for (let attempt = 0; attempt < TRIES && !placed; attempt++) {
        if (kind === 'stand') {
          // a few posts on a lattice two tiles apart, a tile of grass between each, nearest the middle first
          const c0 = EDGE + Math.floor(random() * (cols - 2 * EDGE)),
            r0 = EDGE + Math.floor(random() * (rows - 2 * EDGE));
          const posts = Math.min(9, Math.round(between(size[0], size[1] + 0.999999, random) - 0.5));
          const lattice: Tile[] = [];
          for (let i = -1; i <= 1; i++) for (let j = -1; j <= 1; j++) lattice.push([c0 + 2 * i, r0 + 2 * j]);
          lattice.sort((a, b) => Math.hypot(a[0] - c0, a[1] - r0) - Math.hypot(b[0] - c0, b[1] - r0) || random() - 0.5);
          const tiles = lattice.slice(0, posts);
          if (tiles.every(([c, r]) => c >= 0 && r >= 0 && c < cols && r < rows && fits(c, r))) placed = lay(tiles, 'o');
          continue;
        }
        // a pond or a bunker: a blob about a middle, its edge wandering a little
        const r0 = between(size[0], size[1], random);
        let cx = EDGE + random() * (cols - 1 - 2 * EDGE),
          cy = EDGE + random() * (rows - 1 - 2 * EDGE);
        if (kind === 'pond') {
          const [lc, lr] = hollows[Math.floor(random() * hollows.length)];
          cx = lc + random() - 0.5;
          cy = lr + random() - 0.5;
        }
        const p2 = random() * Math.PI * 2,
          p3 = random() * Math.PI * 2;
        const tiles: Tile[] = [];
        const reach = Math.ceil(r0 * (1 + WOBBLE.two + WOBBLE.three));
        for (let r = Math.floor(cy) - reach; r <= Math.ceil(cy) + reach; r++)
          for (let c = Math.floor(cx) - reach; c <= Math.ceil(cx) + reach; c++) {
            const a = Math.atan2(r - cy, c - cx);
            const edge = r0 * (1 + WOBBLE.two * Math.sin(2 * a + p2) + WOBBLE.three * Math.sin(3 * a + p3));
            if (Math.hypot(c - cx, r - cy) <= edge) tiles.push([c, r]);
          }
        if (tiles.length < 3 || !tiles.every(([c, r]) => c >= 0 && r >= 0 && c < cols && r < rows && fits(c, r)))
          continue;
        // a pond in a hollow, the ground there low already
        if (kind === 'pond' && tiles.reduce((sum, [c, r]) => sum + height(c, r), 0) / tiles.length > HOLLOW * highest)
          continue;
        if (!lay(tiles, kind === 'pond' ? '~' : 's')) continue;
        // levelled as far as its farthest tile, and no farther, so its bed never reaches the next feature
        const radius = Math.max(0.5, ...tiles.map(([c, r]) => Math.hypot(c - cx, r - cy)));
        flats.push({ x: cx, y: rows - 1 - cy, r: radius, floor: kind === 'pond' });
        placed = true;
      }
      if (!placed) throw new Error(`${name}: could not place ${kind} ${n + 1} of ${count} in ${TRIES} tries`);
    }

  const map = grid.map((row) => row.join(''));
  return { name, par, map, terrain: noiseGround(level, { seed, feel, steepness, flats }) };
}
