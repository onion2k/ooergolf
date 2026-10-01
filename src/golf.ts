/**
 * Golf holes made from a spec and a seed: a fairway along a way of play from a tee to a green, straight or bent once
 * as a dogleg, with rough either side of it, out of bounds beyond the rough and rock beyond that; a round green round the
 * cup and a box at the tee; and where the spec asks bunkers by the green and along the fairway, ponds, and trees in the
 * rough, each placed where it suits and never where it would spoil the hole: off the tee and the cup, a tile from its
 * neighbours, and never so that no way three tiles wide is left from the tee to the cup. The ground is hills, as The Moors'
 * is, with the tee, the green and every bunker's bed levelled and every pond lying at nought, since the game's water is
 * at a fixed height under the ground.
 *
 * Pure and seeded: the same spec is the same hole, and nothing here reaches for chance of its own. A spec that cannot be
 * made is refused, by name, and never returned as a hole that cannot be played. It is content's tool: handed a spec and
 * giving back a `HoleDef`, importing no content, only the type of a hole.
 */
import { PHYSICS, TILE, layoutOf, slopeAt } from './arena';
import type { HoleDef } from './course';
import { FEELS, gradientNoise, noiseGround, type Feel, type Flat } from './noise';

import { seeded, type Random } from './random';
import { WIND } from './shaping';
import { LIE, SURFACES } from './surfaces';

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
/** The play a ball rolls on, which a way three tiles wide must run over: fairway, rough, green, the tee and its box, the cup and sand. */
const PLAY = 'frgtTCs';
const SAMPLES = 16;
/** How much gentler the ground is made each time the fairway is found too steep to rest a ball, and how many times it is tried. */
const GENTLER = { by: 0.93, tries: 8 };
/** How high a pond's ground may stand before it is levelled, as a share of the ground's height: a hollow, or its bank is a pit's wall and the hills round it are scaled flat. */
const HOLLOW = 0.6;

/** A spec that is not a hole is refused here, by what is wrong with it. */
function refuse(spec: GolfSpec) {
  const { name, par, seed, length, bend, width, steepness, bunkers, ponds, trees, corner, wind } = spec;
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

/** Whether the tee, the fairway and the green of a hole are ground a ball rests on: no steeper than their roll holds it against gravity. */
function rests(l: ReturnType<typeof layoutOf>): boolean {
  for (let t = 0; t < l.cols * l.rows; t++) {
    const lie = l.lie[t];
    if (l.solid[t] || l.oob[t] || (lie !== LIE.fairway && lie !== LIE.green && lie !== LIE.tee)) continue;
    const x = l.originX + ((t % l.cols) + 0.5) * TILE,
      y = l.originY + (Math.floor(t / l.cols) + 0.5) * TILE;
    const [sx, sy] = slopeAt(l, x, y);
    const s = Math.hypot(sx, sy);
    if (s / Math.sqrt(1 + s * s) > (0.97 * SURFACES[lie].roll) / PHYSICS.gravity) return false;
  }
  return true;
}

/** A tile of the map: its column, and its row from the south. */
type Tile = [number, number];

export function golfHole(spec: GolfSpec): HoleDef {
  refuse(spec);
  const { name, par, seed, feel, steepness, width, bunkers, ponds, trees, wind } = spec;
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

  const map = grid
    .slice()
    .reverse()
    .map((row) => row.join(''));
  const flat = layoutOf(map);
  // the ground, as steep as asked, and gentler by a little each time until the tee, the fairway and the green all rest a
  // ball: a hole that cannot be played is never returned
  for (let k = 0, steep = steepness; k < GENTLER.tries; k++, steep *= GENTLER.by) {
    const terrain = noiseGround(flat, { seed, feel, steepness: steep, flats });
    if (rests(layoutOf(map, terrain))) return { name, par, map, terrain, ...(wind ? { wind } : {}) };
  }
  throw new Error(`${name}: its fairway will not rest a ball, however gentle its hills`);
}
