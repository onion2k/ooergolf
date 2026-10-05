/**
 * Golf holes made from a spec and a seed: a fairway along a way of play from a tee to a green, straight or bent once
 * as a dogleg, with rough either side of it, out of bounds beyond the rough and rock beyond that; a round green round the
 * cup and a box at the tee; and where the spec asks bunkers by the green and along the fairway, ponds, and trees in the
 * rough, each placed where it suits and never where it would spoil the hole: off the tee and the cup, a tile from its
 * neighbours, and never so that no way three tiles wide is left from the tee to the cup. The ground is hills, as The Moors'
 * is, with the tee, the green and every bunker's bed levelled and every pond lying at nought, since the game's water is
 * at a fixed height under the ground. A green may be given a contour, swells and swales in its ground that a putt breaks
 * across (made with the terrain the physics already has, so putting is the minigolf's own model), and a speed; and the hole
 * is mown last, a first cut one tile wide round the green and along both edges of the fairway, from the grass alone and
 * with no chance spent, so that every hazard and tree is where it would be without it.
 *
 * Pure and seeded: the same spec is the same hole, and nothing here reaches for chance of its own. A spec that cannot be
 * made is refused, by name, and never returned as a hole that cannot be played. It is content's tool: handed a spec and
 * giving back a `HoleDef`, importing no content, only the type of a hole.
 */
import { TILE, layoutOf } from './arena';
import type { HoleDef } from './course';
import { GREEN as GREEN_RULES } from './green';
import { FEELS, gradientNoise, greenContour, noiseGround, smoothstep, type Feel, type Flat } from './noise';

import { seeded, type Random } from './random';
import { WIND } from './shaping';
import { holdsBall } from './slopes';
import { GREENS, LIE } from './surfaces';

/** A pond: how far along the way of play it lies, which side of it (nought is across it, on the line) and how big, in tiles of radius. */
export interface PondSpec {
  /** A share of the way from the tee to the cup, from a tenth to nine tenths. */
  at: number;
  side: -1 | 0 | 1;
  size: [min: number, max: number];
}

export interface GolfSpec {
  name: string;
  par: number;
  /** How long the way of play is, tee to cup, in yards, which is units. */
  length: number;
  /** How far the second leg turns from the first, in degrees, positive to the right: nought for a straight hole. */
  bend: number;
  /** Where along the way the bend is, as a share of it; the middle a little on toward the cup unless told. */
  corner?: number;
  /** How wide the fairway is, in tiles, on average. */
  width: number;
  seed: number;
  feel: Feel;
  steepness: number;
  bunkers: { fairway: number; green: number };
  ponds: PondSpec[];
  trees: number;
  /** How hard the wind blows on the hole, in miles an hour: calm unless told. See `HoleDef.wind`. */
  wind?: number;
  /**
   * How much the green is contoured, from nought (level, as it was) to one (the most a green may be, which is 5 per
   * cent slope): it has swells and swales in it, which a putt breaks across. See `green.ts`.
   */
  contour?: number;
  /** How fast the greens are: `HoleDef.greens`. */
  greens?: number;
}

/** How wide the rough is either side of the fairway, and how wide out of bounds is beyond it, in tiles, and the rock beyond that. */
const ROUGH = 7,
  OUT = 4,
  WALL = 2;
/** How wide the green is round the cup, in tiles: about eighteen yards, a green of thirty-odd across. */
const GREEN = 5.5;
/** How near a hazard may come to the tee and the cup, in tiles, and how far a tree may from the cup, and how near another tree. */
const KEEP = { hazard: 4, cup: 2.5, tree: 6, green: 9, trees: 2 };
/** The tiles left clear between one hazard and the next. */
const GAP = 1;
/** How many places are tried for each thing before it is given up as not fitting. */
const TRIES = 600;
/** How much the width of the fairway and of the rough wander along the hole, as a share: at most a fifth. */
const WANDER = { fairway: 0.22, rough: 0.3 };
/** How far a blob's edge wanders, as a share of its radius, as `open.ts` has it: never more than 1.4 times as wide as it says. */
const WOBBLE = { two: 0.25, three: 0.15 };
/** How far a pond's ground and a bunker's take to come back to the noise, as a share of the feel's swell: as `open.ts` has it. */
const BLEND = { pond: 0.3, sand: 0.12 };
/** The play a ball rolls on, which a way three tiles wide must run over: fairway, rough, the first cut, green, the tee and its box, the cup and sand. */
const PLAY = 'frcgtTCs';
const SAMPLES = 16;
/** How much gentler the ground is made each time the fairway is found too steep to rest a ball, and how many times it is tried. */
const GENTLER = { by: 0.93, tries: 8 };
/** How high a pond's ground may stand before it is levelled, as a share of the ground's height: a hollow, or its bank is a pit's wall and the hills round it are scaled flat. */
const HOLLOW = 0.6;
/**
 * The plate a contoured green stands on, in tiles past the green's edge: the ground is exactly the green's own (the cup's
 * level, the tilt through it and its swells on that) as far as the physics' smoothing reaches (two tiles) from the last tile
 * of green, so what the game reads as a green's slope is the contour's and not the hills'; and it comes back to the hills
 * over `blend` more tiles, or as many more up to `most` as it takes for no step between tiles to be steeper than the hills'
 * own and for the fairway under it to rest a ball: the plate is a plane, and the hills round it are not, so a short blend is
 * a cliff where they stand high or low. The tilt is carried on through the blend, which is what tapers it, so the field
 * is made to reach as far as the blend can.
 */
const PLATE = { full: 2, blend: 3, most: 24 };

/** A spec that is not a hole is refused here, by what is wrong with it. */
function refuse(spec: GolfSpec) {
  const { name, par, seed, length, bend, width, steepness, bunkers, ponds, trees, corner, wind, contour, greens } =
    spec;
  const fault = (what: string) => new RangeError(`${name || 'a golf hole'}: ${what}`);
  if (!name) throw new RangeError('a golf hole has to have a name');
  if (!Number.isInteger(par) || par < 1) throw fault(`its par is a whole number from one, not ${par}`);
  if (!Number.isInteger(seed)) throw fault(`its seed is a whole number, not ${seed}`);
  if (!(length >= 60 && length <= 800)) throw fault(`its length is from sixty to eight hundred yards, not ${length}`);
  if (!(width >= 8 && width <= 30)) throw fault(`its fairway width is from eight to thirty tiles, not ${width}`);
  if (!(Math.abs(bend) <= 70)) throw fault(`its bend is no more than seventy degrees either way, not ${bend}`);
  if (corner !== undefined && !(corner >= 0.3 && corner <= 0.7))
    throw fault(`its bend is a third to seven tenths of the way, not ${corner}`);
  if (wind !== undefined && !(wind >= 0 && wind <= WIND.most))
    throw fault(`its wind is from nought to ${WIND.most} miles an hour, not ${wind}`);
  if (!(steepness > 0 && steepness < 1)) throw fault(`its steepness is between nought and one, not ${steepness}`);
  if (contour !== undefined && !(contour >= 0 && contour <= 1))
    throw fault(`its contour is from nought to one, not ${contour}`);
  if (greens !== undefined && !(greens >= GREENS.fast && greens <= GREENS.slow))
    throw fault(`its greens run from ${GREENS.fast} (fast) to ${GREENS.slow} (slow), not ${greens}`);
  for (const [what, n] of [
    ['fairway bunkers', bunkers.fairway],
    ['greenside bunkers', bunkers.green],
  ] as const)
    if (!Number.isInteger(n) || n < 0 || n > 12)
      throw fault(`its ${what} are a whole number from nought to twelve, not ${n}`);
  if (!Number.isInteger(trees) || trees < 0) throw fault(`its trees are a whole number from nought, not ${trees}`);
  for (const p of ponds) {
    if (!(p.at >= 0.1 && p.at <= 0.9)) throw fault(`a pond is a tenth to nine tenths of the way, not ${p.at}`);
    if (![-1, 0, 1].includes(p.side)) throw fault(`a pond is on one side, the other or across the line, not ${p.side}`);
    if (!(p.size[0] > 0 && p.size[0] <= p.size[1]))
      throw fault(`a pond is from more than nought to as much again in radius, not ${p.size[0]} to ${p.size[1]}`);
  }
}

type Pt = [number, number];

/** The way of play as points in tiles, from the tee: to the corner and on to the cup. */
function way(spec: GolfSpec): { points: Pt[]; total: number } {
  const L = spec.length / TILE;
  const f = spec.corner ?? 0.55;
  const t = (spec.bend * Math.PI) / 180;
  const corner: Pt = [0, f * L];
  const cup: Pt = [corner[0] + Math.sin(t) * (1 - f) * L, corner[1] + Math.cos(t) * (1 - f) * L];
  return { points: [[0, 0], corner, cup], total: L };
}

/** How far along the way, from its start, the nearest point to `p` is, and how far `p` is from it. */
function along(points: Pt[], p: Pt): { s: number; d: number } {
  let best = { s: 0, d: Infinity };
  let run = 0;
  for (let k = 0; k + 1 < points.length; k++) {
    const [ax, ay] = points[k],
      [bx, by] = points[k + 1];
    const lx = bx - ax,
      ly = by - ay;
    const len = Math.hypot(lx, ly);
    const u = ((p[0] - ax) * lx + (p[1] - ay) * ly) / (len * len);
    const t = Math.max(0, Math.min(1, u));
    const d = Math.hypot(p[0] - (ax + lx * t), p[1] - (ay + ly * t));
    if (d < best.d) best = { s: run + len * t, d };
    run += len;
  }
  return best;
}

/** Whether `p` is behind the start of the way, or past its finish: off the end of it. */
function offEnd(points: Pt[], p: Pt, finish: boolean): boolean {
  const [ax, ay] = finish ? points[points.length - 2] : points[0],
    [bx, by] = finish ? points[points.length - 1] : points[1];
  const u = ((p[0] - ax) * (bx - ax) + (p[1] - ay) * (by - ay)) / ((bx - ax) ** 2 + (by - ay) ** 2);
  return finish ? u > 1 : u < 0;
}

/** The point `s` along the way, and which way it is going as a unit vector. */
function at(points: Pt[], s: number): { p: Pt; dir: Pt } {
  let run = 0;
  for (let k = 0; k + 1 < points.length; k++) {
    const [ax, ay] = points[k],
      [bx, by] = points[k + 1];
    const len = Math.hypot(bx - ax, by - ay);
    if (s <= run + len || k === points.length - 2) {
      const t = Math.max(0, Math.min(1, (s - run) / len));
      return { p: [ax + (bx - ax) * t, ay + (by - ay) * t], dir: [(bx - ax) / len, (by - ay) / len] };
    }
    run += len;
  }
  throw new Error('unreachable');
}

/**
 * Whether the tee, the fairway and the green of a hole are ground a ball rests on: no steeper than their roll holds it
 * against gravity, which is the green's own speed on a green, since a fast green holds a ball on less of a slope.
 */
function rests(l: ReturnType<typeof layoutOf>, greens: number | undefined): boolean {
  for (let t = 0; t < l.cols * l.rows; t++) {
    const lie = l.lie[t];
    if (l.solid[t] || l.oob[t] || (lie !== LIE.fairway && lie !== LIE.green && lie !== LIE.tee)) continue;
    if (!holdsBall(l, t, greens)) return false;
  }
  return true;
}

/** A tile of the map: its column, and its row from the south. */
type Tile = [number, number];

/**
 * The first cut, laid on a finished hole: the rough and the fairway that lie within a tile (eight ways, so a fringe has no
 * gap at a corner) of the putting green become `c`, a fringe three yards wide all the way round it, and so does the rough
 * within a tile of the fairway, a first cut along both its edges. Only a tile that is exactly `r` or `f` is ever turned, so
 * sand, water, out of bounds, rock, a tree, the tee and its box and the cup are as they were; and it is done last, from the
 * grass alone, so nothing placed before it (a hazard, a tree, the way of play) is anywhere else for it, and it spends no
 * chance. Judged against the grid as it was, so the cut does not spread tile by tile.
 */
function mown(grid: readonly (readonly string[])[]): string[][] {
  const rows = grid.length,
    cols = grid[0].length;
  const out = grid.map((row) => row.slice());
  const near = (c: number, r: number, kinds: string) => {
    for (let dr = -1; dr <= 1; dr++)
      for (let dc = -1; dc <= 1; dc++) {
        const cc = c + dc,
          rr = r + dr;
        if ((dc || dr) && cc >= 0 && rr >= 0 && cc < cols && rr < rows && kinds.includes(grid[rr][cc])) return true;
      }
    return false;
  };
  for (let r = 0; r < rows; r++)
    for (let c = 0; c < cols; c++) {
      const here = grid[r][c];
      if (here === 'f' ? near(c, r, 'gC') : here === 'r' && (near(c, r, 'gC') || near(c, r, 'f'))) out[r][c] = 'c';
    }
  return out;
}

export function golfHole(spec: GolfSpec): HoleDef {
  refuse(spec);
  const { name, par, seed, feel, steepness, width, bunkers, ponds, trees, wind, greens, contour = 0 } = spec;
  const random = seeded(seed);
  const { points, total } = way(spec);
  const shape = gradientNoise(seed * 3 + 1);
  // the widths at a place along the way: a fairway that swells and narrows, and a rough that does
  const half = (s: number) => (width / 2) * (1 + WANDER.fairway * 2 * shape(s / 11, 0.5));
  const band = (s: number) => ROUGH * (1 + WANDER.rough * 2 * shape(s / 7, 40.5));
  // the box round the way, the room for the widest of it, and the origin that puts its south-west corner at nought
  const room = Math.ceil((width / 2) * (1 + WANDER.fairway) + ROUGH * (1 + WANDER.rough) + OUT + WALL + 1);
  const xs = points.map((p) => p[0]),
    ys = points.map((p) => p[1]);
  const minX = Math.min(...xs) - room,
    minY = Math.min(...ys) - room;
  const cols = Math.ceil(Math.max(...xs) - Math.min(...xs)) + 2 * room + 1,
    rows = Math.ceil(Math.max(...ys) - Math.min(...ys)) + 2 * room + 1;
  const tee: Tile = [Math.round(points[0][0] - minX), Math.round(points[0][1] - minY)];
  const cup: Tile = [Math.round(points[2][0] - minX), Math.round(points[2][1] - minY)];
  const world = (c: number, r: number): Pt => [c + minX, r + minY];
  const before = (p: Pt) => offEnd(points, p, false),
    past = (p: Pt) => offEnd(points, p, true);
  const tile = (p: Pt): Tile => [Math.round(p[0] - minX), Math.round(p[1] - minY)];

  // the ground kinds, by distance from the way: fairway, rough, out of bounds, rock, and how far from it each tile is
  const grid: string[][] = Array.from({ length: rows }, () => Array.from({ length: cols }, () => ' '));
  const reach = new Float32Array(cols * rows),
    edge = new Float32Array(cols * rows),
    outer = new Float32Array(cols * rows);
  for (let r = 0; r < rows; r++)
    for (let c = 0; c < cols; c++) {
      const { s, d } = along(points, world(c, r));
      const e = half(s);
      const b = band(s);
      reach[r * cols + c] = d;
      edge[r * cols + c] = e;
      outer[r * cols + c] = e + b;
      grid[r][c] = d <= e ? 'f' : d <= e + b ? 'r' : d <= e + b + OUT ? 'x' : ' ';
      // no fairway behind the tee or past the cup, where the way stops: rough, the same as it would be beside it
      if (grid[r][c] === 'f' && (before(world(c, r)) || past(world(c, r)))) grid[r][c] = 'r';
    }
  // the green round the cup, and the tee's box, five across and three deep, with the tee in it
  for (let r = 0; r < rows; r++)
    for (let c = 0; c < cols; c++)
      if (grid[r][c] !== ' ' && Math.hypot(c - cup[0], r - cup[1]) <= GREEN) grid[r][c] = 'g';
  for (let dr = -1; dr <= 1; dr++) for (let dc = -2; dc <= 2; dc++) grid[tee[1] + dr][tee[0] + dc] = 't';
  grid[tee[1]][tee[0]] = 'T';
  grid[cup[1]][cup[0]] = 'C';

  const level = layoutOf(
    grid
      .slice()
      .reverse()
      .map((row) => row.join('')),
  );
  // the ground before anything is levelled, to see where the hollows are: a pond is set in one
  const plain = noiseGround(level, { seed, feel, steepness });
  const heightAt = (c: number, r: number) => plain[r * cols + c];
  const flats: Flat[] = [
    { x: cup[0], y: cup[1], r: GREEN * 0.75, blend: 3 },
    { x: tee[0], y: tee[1], r: 2, blend: 3 },
  ];
  const swell = FEELS[feel].swell.size;
  const highest = Math.max(...plain);

  const between = (least: number, most: number, chance: Random) => least + chance() * (most - least);
  const inMap = (c: number, r: number) => c >= 0 && r >= 0 && c < cols && r < rows;

  /** Whether a route three tiles wide, over what a ball rolls on and past no tree, joins the tee and the cup. */
  const joined = (): boolean => {
    const open = (c: number, r: number) => inMap(c, r) && PLAY.includes(grid[r][c]);
    const wide = (c: number, r: number) => {
      for (let dc = -1; dc <= 1; dc++) for (let dr = -1; dr <= 1; dr++) if (!open(c + dc, r + dr)) return false;
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
  };

  /** Puts `ch` on `tiles` if the way from the tee to the cup is still there, and says whether it was. */
  const lay = (tiles: Tile[], ch: string): boolean => {
    const was = tiles.map(([c, r]) => grid[r][c]);
    tiles.forEach(([c, r]) => (grid[r][c] = ch));
    if (joined()) return true;
    tiles.forEach(([c, r], i) => (grid[r][c] = was[i]));
    return false;
  };

  /** The tiles of a blob about (cx, cy), its edge wandering a little. */
  const blob = (cx: number, cy: number, r0: number): Tile[] => {
    const p2 = random() * Math.PI * 2,
      p3 = random() * Math.PI * 2;
    const tiles: Tile[] = [];
    const span = Math.ceil(r0 * (1 + WOBBLE.two + WOBBLE.three));
    for (let r = Math.floor(cy) - span; r <= Math.ceil(cy) + span; r++)
      for (let c = Math.floor(cx) - span; c <= Math.ceil(cx) + span; c++) {
        const a = Math.atan2(r - cy, c - cx);
        const rim = r0 * (1 + WOBBLE.two * Math.sin(2 * a + p2) + WOBBLE.three * Math.sin(3 * a + p3));
        if (Math.hypot(c - cx, r - cy) <= rim) tiles.push([c, r]);
      }
    return tiles;
  };

  /** Whether every tile of a blob is of the `kinds`, in the map, clear of the tee and the cup, and a gap from every other hazard. */
  const fits = (tiles: Tile[], kinds: string) => {
    if (tiles.length < 3) return false;
    for (const [c, r] of tiles) {
      if (!inMap(c, r) || !kinds.includes(grid[r][c])) return false;
      if (Math.hypot(c - tee[0], r - tee[1]) < KEEP.hazard || Math.hypot(c - cup[0], r - cup[1]) < KEEP.cup)
        return false;
      for (let dc = -GAP; dc <= GAP; dc++)
        for (let dr = -GAP; dr <= GAP; dr++)
          if (inMap(c + dc, r + dr) && '~s^'.includes(grid[r + dr][c + dc])) return false;
    }
    return true;
  };

  /** Puts a bunker or a pond, its middle at (cx, cy) and its bed levelled, or says it would not go. */
  const place = (kind: 'sand' | 'pond', cx: number, cy: number, r0: number, kinds: string): boolean => {
    const tiles = blob(cx, cy, r0);
    if (!fits(tiles, kinds)) return false;
    // a pond in a hollow, the ground there low already
    if (!lay(tiles, kind === 'pond' ? '~' : 's')) return false;
    // levelled as far as its farthest tile, and no farther, so its bed never reaches the next feature
    const radius = Math.max(0.5, ...tiles.map(([c, r]) => Math.hypot(c - cx, r - cy)));
    flats.push({
      x: cx,
      y: cy,
      r: radius,
      floor: kind === 'pond',
      blend: Math.max(2, BLEND[kind === 'pond' ? 'pond' : 'sand'] * swell),
    });
    return true;
  };

  const fail = (what: string, n: number, of: number) =>
    new Error(`${name}: could not place ${what} ${n + 1} of ${of} in ${TRIES} tries`);

  // the bunkers by the green, on the side the ball comes from and round it, each against its edge
  const approach = at(points, total * 0.98).dir;
  for (let n = 0; n < bunkers.green; n++) {
    let placed = false;
    for (let attempt = 0; attempt < TRIES && !placed; attempt++) {
      const a = Math.atan2(-approach[1], -approach[0]) + (random() - 0.5) * Math.PI * 1.5;
      const r0 = between(2, 3.2, random);
      const dist = GREEN + r0 * 0.55;
      placed = place('sand', cup[0] + Math.cos(a) * dist, cup[1] + Math.sin(a) * dist, r0, 'frg');
    }
    if (!placed) throw fail('a greenside bunker', n, bunkers.green);
  }
  // the bunkers along the fairway, where a drive comes down, at its edge, on a side or the other
  for (let n = 0; n < bunkers.fairway; n++) {
    let placed = false;
    for (let attempt = 0; attempt < TRIES && !placed; attempt++) {
      const s = between(0.3, 0.7, random) * total;
      const { p, dir } = at(points, s);
      const side = random() < 0.5 ? -1 : 1;
      const r0 = between(2, 3.2, random);
      const off = half(s) + r0 * 0.55;
      const [wx, wy] = [p[0] - dir[1] * side * off, p[1] + dir[0] * side * off];
      const [c, r] = tile([wx, wy]);
      placed = place('sand', c + (random() - 0.5), r + (random() - 0.5), r0, 'fr');
    }
    if (!placed) throw fail('a fairway bunker', n, bunkers.fairway);
  }
  // the ponds, each where its spec says, the lowest ground of a few tries
  ponds.forEach((pond, n) => {
    let placed = false;
    for (let attempt = 0; attempt < TRIES && !placed; attempt++) {
      // of a few places, those it fits in, the lowest ground: a pond is set in a hollow
      let best: { c: number; r: number; h: number; r0: number } | null = null;
      for (let k = 0; k < SAMPLES; k++) {
        const s = (pond.at + (random() - 0.5) * 0.3) * total;
        const { p, dir } = at(points, s);
        const r0 = between(pond.size[0], pond.size[1], random);
        const off = pond.side === 0 ? (random() - 0.5) * 2 : pond.side * (half(s) + r0 - 1.5 + random());
        const [c, r] = tile([p[0] - dir[1] * off, p[1] + dir[0] * off]);
        if (!inMap(c, r)) continue;
        const h = heightAt(c, r);
        if (h <= HOLLOW * highest && (!best || h < best.h) && fits(blob(c, r, r0), 'fr')) best = { c, r, h, r0 };
      }
      if (best) placed = place('pond', best.c, best.r, best.r0, 'fr');
    }
    if (!placed) throw fail('a pond', n, ponds.length);
  });

  // the trees, in clusters in the rough, off the tee and the green and clear of one another's trunks
  const placedTrees: Tile[] = [];
  const treeFits = (c: number, r: number) => {
    if (!inMap(c, r) || grid[r][c] !== 'r') return false;
    const k = r * cols + c;
    // in the rough, not up against the fairway or out of bounds
    if (reach[k] < edge[k] + 1.5 || reach[k] > outer[k] - 1.5) return false;
    if (Math.hypot(c - tee[0], r - tee[1]) < KEEP.tree || Math.hypot(c - cup[0], r - cup[1]) < KEEP.green) return false;
    for (const [tc, tr] of placedTrees) if (Math.hypot(c - tc, r - tr) < KEEP.trees) return false;
    for (let dc = -GAP; dc <= GAP; dc++)
      for (let dr = -GAP; dr <= GAP; dr++)
        if (inMap(c + dc, r + dr) && '~s'.includes(grid[r + dr][c + dc])) return false;
    return true;
  };
  for (let n = 0; n < trees;) {
    let placed = false;
    for (let attempt = 0; attempt < TRIES && !placed; attempt++) {
      const c0 = Math.floor(random() * cols),
        r0 = Math.floor(random() * rows);
      if (!treeFits(c0, r0)) continue;
      // a cluster of one to five about it
      const size = Math.min(trees - n, 1 + Math.floor(random() * 5));
      let laid = 0;
      for (let k = 0; k < size * 6 && laid < size; k++) {
        const c = c0 + Math.round((random() - 0.5) * 6),
          r = r0 + Math.round((random() - 0.5) * 6);
        if (!treeFits(c, r)) continue;
        grid[r][c] = '^';
        placedTrees.push([c, r]);
        laid++;
      }
      if (laid) {
        n += laid;
        placed = true;
      }
    }
    if (!placed) throw fail('a tree', n, trees);
  }

  const rowsOf = (g: readonly (readonly string[])[]) =>
    g
      .slice()
      .reverse()
      .map((row) => row.join(''));
  // the ground is made against the hole as it was drawn, and the first cut laid on it after, so that the cut changes
  // what a ball rolls on and not the hills it rolls over
  const drawn = rowsOf(grid);
  const map = rowsOf(mown(grid));
  const flat = layoutOf(drawn);
  // the green's swells and swales, if it is to have any: made once, for the tiles of green the hole is drawn with
  const greenTiles: number[] = [];
  for (let t = 0; t < flat.cols * flat.rows; t++) if (flat.lie[t] === LIE.green) greenTiles.push(t);
  const field =
    contour > 0
      ? greenContour(flat, {
          seed,
          x: cup[0],
          y: cup[1],
          radius: GREEN,
          reach: GREEN + PLATE.full + PLATE.most + 2,
          slope: contour * GREEN_RULES.steepest,
          tiles: greenTiles,
        })
      : undefined;
  /** The steepest step between neighbouring tiles of `h`, within the box of tiles from (c0, r0) to (c1, r1). */
  const steepestStep = (h: Float32Array, c0: number, r0: number, c1: number, r1: number) => {
    let most = 0;
    for (let r = Math.max(0, r0); r <= Math.min(rows - 1, r1); r++)
      for (let c = Math.max(0, c0); c <= Math.min(cols - 1, c1); c++) {
        if (c < cols - 1 && c < c1) most = Math.max(most, Math.abs(h[r * cols + c + 1] - h[r * cols + c]));
        if (r < rows - 1 && r < r1) most = Math.max(most, Math.abs(h[(r + 1) * cols + c] - h[r * cols + c]));
      }
    return most;
  };
  /**
   * The ground with the contour laid on it: the green made a plane through the height the cup has, tilted, the swells on
   * that, and the plate eased back into the hills, over as short a blend as keeps every step as gentle as the hills' own
   * and the fairway under it resting a ball. A green whose
   * swales would go under nought stands as much higher as they would, so the ground is never below nought, and the lifted
   * green is eased into the hills as the rest of the plate is.
   */
  const contoured = (ground: Float32Array, swells: Float32Array): Float32Array => {
    const level = ground[cup[1] * cols + cup[0]];
    // the lift is for the green and its plate's level part: past it the plate is blended into ground that is not below nought
    let lowest = 0;
    for (let r = 0; r < rows; r++)
      for (let c = 0; c < cols; c++)
        if (Math.hypot(c - cup[0], r - cup[1]) <= GREEN + PLATE.full) lowest = Math.min(lowest, swells[r * cols + c]);
    const top = level + Math.max(0, -(level + lowest));
    const hills = steepestStep(ground, 0, 0, cols - 1, rows - 1);
    // a plate that is tilted stands high or low of the hills where it ends, so a short blend is a slope steeper than a ball
    // rests on, on the fairway that is under it: it is lengthened for that too, unless the hills alone are already too steep
    // to rest one (the hole is then made gentler, and that is tried again)
    const playable = rests(layoutOf(drawn, ground), greens);
    let out = ground;
    for (let blend = PLATE.blend; blend <= PLATE.most; blend++) {
      const edge = GREEN + PLATE.full,
        reach = Math.ceil(edge + blend) + 1;
      out = Float32Array.from(ground);
      for (let r = Math.max(0, cup[1] - reach); r <= Math.min(rows - 1, cup[1] + reach); r++)
        for (let c = Math.max(0, cup[0] - reach); c <= Math.min(cols - 1, cup[0] + reach); c++) {
          const t = r * cols + c;
          const w = 1 - smoothstep(edge, edge + blend, Math.hypot(c - cup[0], r - cup[1]));
          out[t] = Math.max(0, ground[t] + (top + swells[t] - ground[t]) * w);
        }
      if (
        steepestStep(out, cup[0] - reach - 1, cup[1] - reach - 1, cup[0] + reach + 1, cup[1] + reach + 1) <= hills &&
        (!playable || rests(layoutOf(drawn, out), greens))
      )
        break;
    }
    return out;
  };
  // the ground, as steep as asked, and gentler by a little each time until the tee, the fairway and the green all rest a
  // ball: a hole that cannot be played is never returned. It is tried against the hole as it was drawn, before the cut,
  // so that the cut changes what a ball rolls on and not how steep a hole may be
  for (let k = 0, steep = steepness; k < GENTLER.tries; k++, steep *= GENTLER.by) {
    const ground = noiseGround(flat, { seed, feel, steepness: steep, flats });
    const terrain = field ? contoured(ground, field) : ground;
    if (rests(layoutOf(drawn, terrain), greens))
      return { name, par, map, terrain, ...(wind ? { wind } : {}), ...(greens !== undefined ? { greens } : {}) };
  }
  throw new Error(`${name}: its fairway will not rest a ball, however gentle its hills`);
}
