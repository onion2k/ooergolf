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
 * A hole may have large lakes (`lakes`), water too big to go round that has to be carried, with islands of land in them to
 * be flown to and played from, or the green itself an island. They are laid before anything else that is water or sand, so
 * that a spec without them is the hole it was, and a way from the tee to the cup is then land and flights over water of no
 * more than `CARRY`: a lake that would leave none is not laid.
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
import { drainFault, holdsBall } from './slopes';
import { GREENS, LIE } from './surfaces';

/** A pond: how far along the way of play it lies, which side of it (nought is across it, on the line) and how big, in tiles of radius. */
export interface PondSpec {
  /** A share of the way from the tee to the cup, from a tenth to nine tenths. */
  at: number;
  side: -1 | 0 | 1;
  size: [min: number, max: number];
}

/** A piece of land in a lake: of what ground, how big (a radius, in tiles) and how many bunkers it has of its own. */
export interface IslandSpec {
  kind: 'fairway' | 'rough' | 'sand' | 'green';
  radius: number;
  bunkers?: number;
}

/**
 * A lake: water too big to go round, which has to be carried. `at` is how far along the way (a tenth to nine tenths) or
 * `'green'` for a lake round the green, which is then its one island; `side` is which side of the line it lies, nought across
 * it (spanning the fairway and the rough, from rock to rock), or left or right of it, against the fairway's edge; `size` is
 * the range its radius along the way is drawn from, in tiles; `islands` are the land in it, each at least `LAKE.water` tiles
 * from the shore and from the next. Where it lies is not its spec's to say but the hollow it is set in, the lowest of a few
 * places, as a pond's is.
 */
export interface LakeSpec {
  at: number | 'green';
  side: -1 | 0 | 1;
  size: [min: number, max: number];
  islands: IslandSpec[];
  /** The most water, in tiles, a flight over this lake may have to cross, no more than `CARRY` (which it is unless told less): a hole's limit is the least of its lakes'. */
  carry?: number;
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
  /**
   * How many bunkers of each place. `island` is bunkers on the lakes' islands that are not of fairway or sand, over and
   * above any an island is given of its own, and counts with the fairway's in the twelve.
   */
  bunkers: { fairway: number; green: number; island?: number };
  ponds: PondSpec[];
  /** Large lakes, placed before everything else that is water or sand, so that a spec without them is the hole it was. */
  lakes?: LakeSpec[];
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
  /**
   * How much higher the hills are made than `steepness` alone makes them, from one (the hills as they were) to
   * `HEIGHTEN.most`, and then cut to the step the physics takes (`noiseGround`'s `heighten`): steeper ground a ball runs
   * down. With more than one the whole fairway is no longer asked to rest a ball, only the tee, the green and its plate and
   * the `shelves`, and every tile of fairway or cut that runs must drain (`drainFault`).
   */
  heighten?: number;
  /**
   * Where level ground is made on the way, in yards from the tee: a shelf of `SHELF.radius` tiles, for a landing to rest
   * on among hills that run. Each is at least `SHELF.apart` yards from the tee and from the cup.
   */
  shelves?: number[];
  /**
   * A shortcut across the corner of a dogleg, threaded through a wood: only on a bend of `WOOD.bend` degrees or more. `to` is
   * how far from the tee, straight, the lane lands on the second leg's fairway (a shelf is made there, so the landing rests),
   * and `width` is how many yards are clear between the canopies' bases along the lane (`WOOD.width` unless told). The rough
   * on the inside of the corner is planted, three tiles apart, so that a drive cutting the corner is stopped by it, and no
   * trunk stands within half the width and the canopy's base from the lane's line. See `laneOf`.
   */
  gap?: { to: number; width?: number };
}

/** How high `heighten` may go, and the shelf: its radius in tiles and how far in yards from the tee and the cup it may lie. */
export const HEIGHTEN = { most: 2.5 };
export const SHELF = { radius: 4, apart: 40 };
/**
 * The gap: the least bend a lane may be cut across, in degrees; the width clear between canopies' bases by default and its
 * range, in yards; the wood's planting, three tiles apart, each row shifted a tile along from the last so no straight line
 * runs between two rows; how far past the lane's end the wood goes and how far a trunk stands from the tee, in yards; and
 * the least a canopy's inflated base is (a ball's radius over the canopy's own, `TREE.radius`), which is how far a trunk is
 * kept from the lane's edge past half its width.
 */
export const WOOD = { bend: 35, width: 8, widths: [4, 20], apart: 3, shift: 1, past: 20, base: 6.5 };

/**
 * The longest flight over water a hole asks of a ball, in tiles of water on a straight line: a hundred and thirty-five
 * yards, which the longer clubs carry with a little to spare. A hole's lakes must leave a way from the tee to the cup of land
 * and flights of no more than this, and the generator refuses to make one that does not.
 */
export const CARRY = 45;
/**
 * A lake: its radius's range in tiles, how many lakes a hole may have and islands a lake, the water round an island in tiles,
 * an island's radius's range, how far the radius of a bunker on an island is drawn from, and how many directions a carry is
 * looked for in, which is as fine as a landing three tiles wide is found at the longest carry.
 */
export const LAKE = {
  size: [6, 20],
  most: 4,
  islands: 4,
  water: 3,
  radius: [2, 10],
  bunker: [1.2, 1.8],
  rays: 72,
} as const;

/** Where a hole's lane is, in the layout's own units: the tee and the lane's far end on the second leg, and how wide it is. */
export interface Lane {
  from: { x: number; y: number };
  to: { x: number; y: number };
  /** Yards clear between the canopies' bases, as asked. */
  width: number;
  /** How far a trunk is kept from the lane's line, in yards: half the width and a canopy base's inflated radius. */
  keep: number;
}

const LANES = new WeakMap<HoleDef, Lane>();

/**
 * The lane a hole with a gap was made with, or undefined for a hole without: for tests, the fuzzer and the autopilot to
 * aim along. It is kept beside the hole and not in it, so a hole is what it always was in every field a save or a hash reads.
 */
export function laneOf(hole: HoleDef): Lane | undefined {
  return LANES.get(hole);
}

/** How wide the rough is either side of the fairway, and how wide out of bounds is beyond it, in tiles, and the rock beyond that. */
const ROUGH = 7,
  OUT = 4,
  WALL = 2;
/** How wide the green is round the cup, in tiles: about eighteen yards, a green of thirty-odd across. */
const GREEN = 5.5;
/** How far an island green's land goes past the green's edge at the least, in tiles: the first cut and a little more. */
const ISLAND_APRON = 1.5;
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
/** How far a lake's ground takes to come back to the noise, as a share of the feel's swell: a lake's wall is a long one. */
const LAKE_BLEND = 0.45;
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
  const {
    name,
    par,
    seed,
    length,
    bend,
    width,
    steepness,
    bunkers,
    ponds,
    trees,
    corner,
    wind,
    contour,
    greens,
    heighten,
    shelves,
    gap,
  } = spec;
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
  if (heighten !== undefined && !(heighten >= 1 && heighten <= HEIGHTEN.most))
    throw fault(`its heighten is from one to ${HEIGHTEN.most}, not ${heighten}`);
  for (const y of shelves ?? [])
    if (!(y >= SHELF.apart && y <= length - SHELF.apart))
      throw fault(`a shelf is ${SHELF.apart} yards or more from the tee and from the cup, not ${y} of ${length}`);
  if (gap) {
    if (!(Math.abs(bend) >= WOOD.bend))
      throw fault(`a gap is cut across a bend of ${WOOD.bend} degrees or more, and this one is ${bend}`);
    const [least, most] = WOOD.widths;
    if (gap.width !== undefined && !(gap.width >= least && gap.width <= most))
      throw fault(`a gap is from ${least} to ${most} yards clear, not ${gap.width}`);
    const out = gapTarget(spec);
    if (!out || !(out.along >= 10 && out.along <= (1 - (corner ?? 0.55)) * length - SHELF.apart))
      throw fault(
        `a gap's target is on the second leg, ten yards past the corner and ${SHELF.apart} short of the cup, not ${gap.to} yards from the tee`,
      );
  }
  if (greens !== undefined && !(greens >= GREENS.fast && greens <= GREENS.slow))
    throw fault(`its greens run from ${GREENS.fast} (fast) to ${GREENS.slow} (slow), not ${greens}`);
  for (const [what, n] of [
    ['fairway bunkers', bunkers.fairway],
    ['greenside bunkers', bunkers.green],
  ] as const)
    if (!Number.isInteger(n) || n < 0 || n > 12)
      throw fault(`its ${what} are a whole number from nought to twelve, not ${n}`);
  if (!Number.isInteger(trees) || trees < 0) throw fault(`its trees are a whole number from nought, not ${trees}`);
  if (bunkers.island !== undefined && (!Number.isInteger(bunkers.island) || bunkers.island < 0 || bunkers.island > 12))
    throw fault(`its island bunkers are a whole number from nought to twelve, not ${bunkers.island}`);
  if (bunkers.fairway + (bunkers.island ?? 0) > 12)
    throw fault(
      `its fairway bunkers and island bunkers are twelve at most between them, not ${bunkers.fairway} and ${bunkers.island}`,
    );
  refuseLakes(spec, fault);
  if (
    (bunkers.island ?? 0) > 0 &&
    !(spec.lakes ?? []).some((lake) => lake.islands.some((island) => island.kind !== 'sand'))
  )
    throw fault('its island bunkers need an island of fairway, rough or green to stand on, and it has none');
  for (const p of ponds) {
    if (!(p.at >= 0.1 && p.at <= 0.9)) throw fault(`a pond is a tenth to nine tenths of the way, not ${p.at}`);
    if (![-1, 0, 1].includes(p.side)) throw fault(`a pond is on one side, the other or across the line, not ${p.side}`);
    if (!(p.size[0] > 0 && p.size[0] <= p.size[1]))
      throw fault(`a pond is from more than nought to as much again in radius, not ${p.size[0]} to ${p.size[1]}`);
  }
}

/** A lake that cannot be made is refused here, by what is wrong with it. */
function refuseLakes(spec: GolfSpec, fault: (what: string) => RangeError) {
  const lakes = spec.lakes ?? [];
  if (lakes.length > LAKE.most) throw fault(`a hole has at most ${LAKE.most} lakes, not ${lakes.length}`);
  const [least, most] = LAKE.size;
  for (const lake of lakes) {
    const round = lake.at === 'green';
    if (!round && !(typeof lake.at === 'number' && lake.at >= 0.1 && lake.at <= 0.9))
      throw fault(`a lake is a tenth to nine tenths of the way, or round the green, not ${lake.at}`);
    if (![-1, 0, 1].includes(lake.side))
      throw fault(`a lake is on one side of the line, the other, or across it, not ${lake.side}`);
    const [a, b] = lake.size;
    if (!(a >= least && a <= b && b <= most))
      throw fault(
        `a lake is from ${least} to ${most} tiles in radius, and its range from least to most, not ${a} to ${b}`,
      );
    if (lake.carry !== undefined && !(lake.carry >= 1 && lake.carry <= CARRY))
      throw fault(`a lake's carry is from one to ${CARRY} tiles of water, not ${lake.carry}`);
    if (lake.islands.length > LAKE.islands)
      throw fault(`a lake has at most ${LAKE.islands} islands, not ${lake.islands.length}`);
    if (round) {
      if (lakes.length > 1) throw fault('a lake round the green leaves no room for another lake');
      if (lake.side !== 0) throw fault(`a lake round the green is across the line, side nought, not ${lake.side}`);
      if (lake.islands.length !== 1 || lake.islands[0].kind !== 'green')
        throw fault('a lake round the green has one island, the green');
    }
    for (const island of lake.islands) {
      if (!['fairway', 'rough', 'sand', 'green'].includes(island.kind))
        throw fault(`an island's kind is fairway, rough, sand or green, not ${island.kind}`);
      if (island.kind === 'green' && !round) throw fault('a green island is the green in a lake round it');
      const [small, big] = LAKE.radius;
      if (!(island.radius >= small))
        throw fault(`an island's radius is from ${small} to ${big} tiles, not ${island.radius}`);
      if (island.radius + LAKE.water >= a)
        throw fault(
          `an island of ${island.radius} tiles' radius is too big for a lake of ${a}: it leaves ${LAKE.water} tiles of water round it only where the lake is as wide as its radius and ${LAKE.water} more`,
        );
      if (!(island.radius <= big))
        throw fault(`an island's radius is from ${small} to ${big} tiles, not ${island.radius}`);
      if (
        island.bunkers !== undefined &&
        !(Number.isInteger(island.bunkers) && island.bunkers >= 0 && island.bunkers <= 12)
      )
        throw fault(`an island's bunkers are a whole number from nought to twelve, not ${island.bunkers}`);
      if (round && !(island.radius >= GREEN + ISLAND_APRON))
        throw fault(
          `a green island is at least ${GREEN + ISLAND_APRON} tiles in radius, to hold the green, not ${island.radius}`,
        );
    }
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

/**
 * Where a gap's lane lands: how far along the second leg, in yards from the corner, the point `to` yards straight from the
 * tee is (the law of cosines: the legs meet at the bend's angle), or undefined where there is none.
 */
function gapTarget(spec: GolfSpec): { along: number; s: number } | undefined {
  if (!spec.gap) return undefined;
  const c = (spec.corner ?? 0.55) * spec.length;
  const k = c * Math.cos((spec.bend * Math.PI) / 180);
  const root = k * k - (c * c - spec.gap.to * spec.gap.to);
  if (!(root >= 0)) return undefined;
  const along = -k + Math.sqrt(root);
  return { along, s: c + along };
}

/** How far along the way, from its start, the nearest point to `p` is, how far `p` is from it, and which side of it. */
function along(points: Pt[], p: Pt): { s: number; d: number; side: number } {
  let best = { s: 0, d: Infinity, side: 0 };
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
    // which side of the way it is on, by the cross product: positive to the left of the way, negative to its right
    if (d < best.d) best = { s: run + len * t, d, side: Math.sign(lx * (p[1] - ay) - ly * (p[0] - ax)) };
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
function rests(l: ReturnType<typeof layoutOf>, greens: number | undefined, only?: Uint8Array): boolean {
  for (let t = 0; t < l.cols * l.rows; t++) {
    const lie = l.lie[t];
    if (l.solid[t] || l.oob[t] || (lie !== LIE.fairway && lie !== LIE.green && lie !== LIE.tee)) continue;
    if (only && !only[t]) continue;
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
  const lakes = spec.lakes ?? [];
  const greenLake = lakes.some((lake) => lake.at === 'green');
  // the most water a flight has to cross: the least any of the lakes asks
  const carry = Math.min(CARRY, ...lakes.map((lake) => lake.carry ?? CARRY));
  const { heighten = 1 } = spec;
  // a gap's lane lands on a shelf, so the landing rests among hills that run
  const target = gapTarget(spec);
  const shelves = target ? [...(spec.shelves ?? []), target.s] : (spec.shelves ?? []);
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
  // the shelves, each a level disc on the way: where a landing rests among hills that run
  const shelfAt: Tile[] = shelves.map((y) => tile(at(points, y / TILE).p));
  for (const [x, y] of shelfAt) flats.push({ x, y, r: SHELF.radius, blend: 3 });
  const swell = FEELS[feel].swell.size;
  const highest = Math.max(...plain);

  const between = (least: number, most: number, chance: Random) => least + chance() * (most - least);
  const inMap = (c: number, r: number) => c >= 0 && r >= 0 && c < cols && r < rows;

  /**
   * Whether a route three tiles wide, over what a ball rolls on and past no tree, joins the tee and the cup. On a hole with
   * lakes a ball may also be flown: from a tile of the shore reached, over water, in a straight line, of no more than the hole's carry (`CARRY`
   * tiles of it unless a lake says less), to land three tiles wide. A hole without lakes has no flights, and is what it always was.
   */
  const joined = (): boolean => {
    const open = (c: number, r: number) => inMap(c, r) && PLAY.includes(grid[r][c]);
    const wide = (c: number, r: number) => {
      for (let dc = -1; dc <= 1; dc++) for (let dr = -1; dr <= 1; dr++) if (!open(c + dc, r + dr)) return false;
      return true;
    };
    const seen = new Uint8Array(cols * rows);
    const todo = [tee[1] * cols + tee[0]];
    seen[todo[0]] = 1;
    // where the next look for a flight begins: every tile reached before it has been looked from
    let scanned = 0;
    for (let head = 0; ;) {
      for (; head < todo.length; head++) {
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
      if (!lakes.length) return false;
      // the flights from every tile of shore reached since the last look, each over water to land three wide
      const from = scanned;
      scanned = todo.length;
      for (let i = from; i < scanned; i++) {
        const c0 = todo[i] % cols,
          r0 = Math.floor(todo[i] / cols);
        // a tile of the shore: reached land (three wide, so a tile in from the water's edge) with water within two tiles
        let shore = false;
        for (let dc = -2; dc <= 2 && !shore; dc++)
          for (let dr = -2; dr <= 2 && !shore; dr++)
            if (inMap(c0 + dc, r0 + dr) && grid[r0 + dr][c0 + dc] === '~') shore = true;
        if (!shore) continue;
        for (let a = 0; a < LAKE.rays; a++) {
          const dx = Math.cos((a * 2 * Math.PI) / LAKE.rays),
            dy = Math.sin((a * 2 * Math.PI) / LAKE.rays);
          let run = 0,
            ashore = 0;
          for (let d = 1; d <= carry + 6; d++) {
            const c = Math.round(c0 + dx * d),
              r = Math.round(r0 + dy * d);
            if (!inMap(c, r)) break;
            if (grid[r][c] === '~' && !ashore) {
              if (++run > carry) break;
              continue;
            }
            // before the water, only the shore's own tiles are crossed: a flight is over water from the first of it
            if (!run) {
              if (d > 3 || !open(c, r)) break;
              continue;
            }
            // land at the far end of the water: a place to come down on, the first tile of it that is three wide, which
            // is a step or two in from the water's edge
            if (wide(c, r)) {
              if (!seen[r * cols + c]) {
                seen[r * cols + c] = 1;
                todo.push(r * cols + c);
              }
              break;
            }
            if (!open(c, r) || ++ashore > 3) break;
          }
        }
      }
      // nothing new to be reached by a flight: no way
      if (todo.length === scanned) return false;
    }
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
      // a hazard leaves a shelf as it is: its bed would be levelled at a height of its own across the landing
      for (const [sc, sr] of shelfAt) if (Math.hypot(c - sc, r - sr) < SHELF.radius + 2) return false;
      if (Math.hypot(c - tee[0], r - tee[1]) < KEEP.hazard || Math.hypot(c - cup[0], r - cup[1]) < KEEP.cup)
        return false;
      for (let dc = -GAP; dc <= GAP; dc++)
        for (let dr = -GAP; dr <= GAP; dr++)
          if (inMap(c + dc, r + dr) && '~s^'.includes(grid[r + dr][c + dc])) return false;
    }
    return true;
  };

  /**
   * Puts a bunker or a pond, its middle at (cx, cy) and its bed levelled, or says it would not go. A bunker's bed is
   * levelled at the height the ground has there, or, with `floor`, at nought: an island in a lake stands at the lake's floor.
   */
  const place = (
    kind: 'sand' | 'pond',
    cx: number,
    cy: number,
    r0: number,
    kinds: string,
    floor = kind === 'pond',
  ): boolean => {
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
      floor,
      blend: Math.max(2, BLEND[kind === 'pond' ? 'pond' : 'sand'] * swell),
    });
    return true;
  };

  const fail = (what: string, n: number, of: number) =>
    new Error(`${name}: could not place ${what} ${n + 1} of ${of} in ${TRIES} tries`);

  // the lakes, first, so that what is placed after them is placed round them: each in the lowest ground of a few places,
  // its islands laid back as land in it and its bed at nought. The land the hole has to be played over is joined by flights
  // over the water, of no more than `CARRY`, or the lake is not laid
  const islands: { kind: IslandSpec['kind']; tiles: Tile[] }[] = [];
  lakes.forEach((lake, n) => {
    const round = lake.at === 'green';
    const rim = (a: number, p2: number, p3: number) =>
      1 + WOBBLE.two * Math.sin(2 * a + p2) + WOBBLE.three * Math.sin(3 * a + p3);
    /** Whether a tile is rock, or has rock or the map's edge beside it: water is kept a tile off both. */
    const nearRock = (c: number, r: number) => {
      for (let dc = -1; dc <= 1; dc++)
        for (let dr = -1; dr <= 1; dr++) if (!inMap(c + dc, r + dr) || grid[r + dr][c + dc] === ' ') return true;
      return false;
    };
    /** The tiles of an ellipse about (cx, cy), `ra` along `dir` and `rc` across it, its edge wandering, less any near rock. */
    const lakeBlob = (cx: number, cy: number, ra: number, rc: number, dir: Pt): Tile[] => {
      const p2 = random() * Math.PI * 2,
        p3 = random() * Math.PI * 2;
      const span = Math.ceil(Math.max(ra, rc) * (1 + WOBBLE.two + WOBBLE.three)) + 1;
      const tiles: Tile[] = [];
      for (let r = Math.floor(cy) - span; r <= Math.ceil(cy) + span; r++)
        for (let c = Math.floor(cx) - span; c <= Math.ceil(cx) + span; c++) {
          if (!inMap(c, r) || nearRock(c, r)) continue;
          const u = (c - cx) * dir[0] + (r - cy) * dir[1],
            v = -(c - cx) * dir[1] + (r - cy) * dir[0];
          if (Math.hypot(u / ra, v / rc) <= rim(Math.atan2(v, u), p2, p3)) tiles.push([c, r]);
        }
      return tiles;
    };
    /** The island of `spec` in the lake `mask` (one where there is water), or null if there is no room for it clear of the shore and the others. */
    const islandIn = (spec: IslandSpec, lakeTiles: Tile[], mask: Uint8Array): Tile[] | null => {
      for (let attempt = 0; attempt < 40; attempt++) {
        let tiles: Tile[];
        if (round) {
          // the green and a margin of land round it, wandering a little, never less than the green and its apron
          const p2 = random() * Math.PI * 2,
            p3 = random() * Math.PI * 2;
          tiles = [];
          const span = Math.ceil(spec.radius * (1 + WOBBLE.two + WOBBLE.three)) + 1;
          for (let r = cup[1] - span; r <= cup[1] + span; r++)
            for (let c = cup[0] - span; c <= cup[0] + span; c++) {
              const reach = Math.max(
                GREEN + ISLAND_APRON,
                spec.radius * rim(Math.atan2(r - cup[1], c - cup[0]), p2, p3),
              );
              if (inMap(c, r) && Math.hypot(c - cup[0], r - cup[1]) <= reach) tiles.push([c, r]);
            }
        } else {
          const [cx, cy] = lakeTiles[Math.floor(random() * lakeTiles.length)];
          tiles = blob(cx, cy, spec.radius);
        }
        const own = new Set(tiles.map(([c, r]) => r * cols + c));
        // every tile within `LAKE.water` of the island is water of this lake, or the island's own
        const clear = tiles.every(([c, r]) => {
          if (!inMap(c, r) || mask[r * cols + c] !== 1) return false;
          for (let dc = -LAKE.water; dc <= LAKE.water; dc++)
            for (let dr = -LAKE.water; dr <= LAKE.water; dr++) {
              if (Math.hypot(dc, dr) > LAKE.water) continue;
              const k = (r + dr) * cols + c + dc;
              if (!inMap(c + dc, r + dr) || (mask[k] !== 1 && !own.has(k))) return false;
            }
          return true;
        });
        if (tiles.length >= 3 && clear) return tiles;
      }
      return null;
    };

    let placed = false;
    for (let attempt = 0; attempt < TRIES && !placed; attempt++) {
      let best: {
        score: number;
        water: Tile[];
        land: Tile[][];
        cx: number;
        cy: number;
        ra: number;
        rc: number;
      } | null = null;
      for (let k = 0; k < (round ? 1 : SAMPLES); k++) {
        const r0 = between(lake.size[0], lake.size[1], random);
        let cx = cup[0],
          cy = cup[1],
          rc = r0,
          dir: Pt = [0, 1];
        const ra = r0;
        if (!round) {
          const s = ((lake.at as number) + (random() - 0.5) * 0.3) * total;
          const here = at(points, s);
          dir = here.dir;
          if (lake.side === 0) {
            // across: from rock to rock, so that there is no way round it, and as long along the way as it says
            rc = half(s) + band(s) + OUT + 2;
            const off = (random() - 0.5) * 2;
            [cx, cy] = [here.p[0] - dir[1] * off - minX, here.p[1] + dir[0] * off - minY];
          } else {
            // beside it: its near edge a little into the fairway, its far edge at the end of out of bounds, no wider than long
            const inner = half(s) - between(0, 3, random);
            const far = half(s) + band(s) + OUT;
            rc = Math.min(r0, (far - inner) / 2);
            if (rc < 3) continue;
            const off = lake.side * (inner + rc);
            [cx, cy] = [here.p[0] - dir[1] * off - minX, here.p[1] + dir[0] * off - minY];
          }
        }
        const lakeTiles = lakeBlob(cx, cy, ra, rc, dir);
        const mask = new Uint8Array(cols * rows);
        for (const [c, r] of lakeTiles) mask[r * cols + c] = 1;
        const land: Tile[][] = [];
        let ok = lakeTiles.length > 0;
        for (const spec of lake.islands) {
          const tiles = ok ? islandIn(spec, lakeTiles, mask) : null;
          if (!tiles) {
            ok = false;
            break;
          }
          for (const [c, r] of tiles) mask[r * cols + c] = 2;
          land.push(tiles);
        }
        if (!ok) continue;
        const water = lakeTiles.filter(([c, r]) => mask[r * cols + c] === 1);
        if (!fits(water, 'frx')) continue;
        // set in a hollow: the lowest ground of the places tried, the mean over the water, and low enough to be one
        const mean = water.reduce((sum, [c, r]) => sum + heightAt(c, r), 0) / water.length;
        if (mean <= HOLLOW * highest && (!best || mean < best.score))
          best = { score: mean, water, land, cx, cy, ra, rc };
      }
      if (!best) continue;
      // laid, and kept only if the hole can still be got from the tee to the cup by land and flights of `CARRY` or less
      const tiles = [...best.water, ...best.land.flat()];
      const was = tiles.map(([c, r]) => grid[r][c]);
      for (const [c, r] of best.water) grid[r][c] = '~';
      best.land.forEach((land, i) => {
        const kind = lake.islands[i].kind;
        const ch = kind === 'sand' ? 's' : kind === 'rough' ? 'r' : 'f';
        // an island green keeps the green and the cup it was drawn with, and the land round it is mown fairway
        for (const [c, r] of land) if (!(kind === 'green' && 'gC'.includes(grid[r][c]))) grid[r][c] = ch;
      });
      if (!joined()) {
        tiles.forEach(([c, r], i) => (grid[r][c] = was[i]));
        continue;
      }
      placed = true;
      best.land.forEach((land, i) => islands.push({ kind: lake.islands[i].kind, tiles: land }));
      // the bed at nought wherever the lake is, islands and all, as discs enough to cover it: a pond's one disc is too round for this
      const all = [...best.water, ...best.land.flat()];
      const disc = Math.max(3, 0.5 * Math.min(best.ra, best.rc));
      const covering: { x: number; y: number }[] = [];
      for (const [c, r] of all)
        if (!covering.some((d) => Math.hypot(c - d.x, r - d.y) <= disc)) covering.push({ x: c, y: r });
      for (const d of covering)
        flats.push({ x: d.x, y: d.y, r: disc, floor: true, blend: Math.max(2, LAKE_BLEND * swell) });
    }
    if (!placed) throw fail('a lake', n, lakes.length);
  });

  // the bunkers on the islands: each island's own, and the hole's `island` ones over those islands that are land to play from
  // and not sand, a little at a time round them. A small bunker, on level ground at the lake's floor, a tile off the water
  const kept = lakes.flatMap((lake) => lake.islands);
  const wanted = kept.map((island) => island.bunkers ?? 0);
  const hosts = kept.flatMap((island, i) => (island.kind === 'sand' ? [] : [i]));
  for (let k = 0; k < (bunkers.island ?? 0); k++) {
    if (!hosts.length) throw fail('a bunker on an island', k, bunkers.island ?? 0);
    wanted[hosts[k % hosts.length]]++;
  }
  wanted.forEach((count, i) => {
    for (let n = 0; n < count; n++) {
      let placed = false;
      for (let attempt = 0; attempt < TRIES && !placed; attempt++) {
        const [c, r] = islands[i].tiles[Math.floor(random() * islands[i].tiles.length)];
        const r0 = between(LAKE.bunker[0], LAKE.bunker[1], random);
        placed = place('sand', c + (random() - 0.5), r + (random() - 0.5), r0, 'frg', true);
      }
      if (!placed) throw fail('a bunker on an island', n, count);
    }
  });
  // the bunkers by the green, on the side the ball comes from and round it, each against its edge
  const approach = at(points, total * 0.98).dir;
  for (let n = 0; n < bunkers.green; n++) {
    let placed = false;
    for (let attempt = 0; attempt < TRIES && !placed; attempt++) {
      const a = Math.atan2(-approach[1], -approach[0]) + (random() - 0.5) * Math.PI * 1.5;
      // on an island the green's land is a ring a few tiles wide, so its bunkers are smaller
      const r0 = greenLake ? between(LAKE.bunker[0], 2, random) : between(2, 3.2, random);
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

  // a gap's lane, in tiles: the tee's tile to the target's, which no trunk may stand within `keepT` of
  const wayTo = target ? tile(at(points, target.s / TILE).p) : undefined;
  const keepT = ((spec.gap?.width ?? WOOD.width) / 2 + WOOD.base) / TILE;
  /** How far, in tiles, (c, r) is from the lane's line, a segment from the tee to the target; infinity where there is none. */
  const fromLane = (c: number, r: number): number => {
    if (!wayTo) return Infinity;
    const lx = wayTo[0] - tee[0],
      ly = wayTo[1] - tee[1];
    const u = Math.max(0, Math.min(1, ((c - tee[0]) * lx + (r - tee[1]) * ly) / (lx * lx + ly * ly)));
    return Math.hypot(c - tee[0] - lx * u, r - tee[1] - ly * u);
  };

  // the trees, in clusters in the rough, off the tee and the green and clear of one another's trunks
  const placedTrees: Tile[] = [];
  const treeFits = (c: number, r: number) => {
    if (!inMap(c, r) || grid[r][c] !== 'r') return false;
    if (fromLane(c, r) < keepT) return false;
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
  // the wood of a gap, before the scattered trees so they come round it: every tile of the rough inside the corner that a
  // trunk may stand on, three tiles apart, then the lane's edges, each trunk as near the lane as `keepT` lets it. Chance is
  // spent on none of it, so the scattered trees, the ground and everything else are what they would have been
  let made: Lane | undefined;
  if (target && wayTo) {
    const lane: Pt = [wayTo[0] - tee[0], wayTo[1] - tee[1]];
    const laneLength = Math.hypot(lane[0], lane[1]);
    const unit: Pt = [lane[0] / laneLength, lane[1] / laneLength];
    const room = (c: number, r: number) => {
      const w = along(points, world(c, r));
      return (
        w.side * spec.bend < 0 &&
        w.s <= target.s / TILE + WOOD.past / TILE &&
        Math.hypot(c - tee[0], r - tee[1]) <= laneLength + WOOD.past / TILE
      );
    };
    // the lane's edges first, so the planting round them leaves the lane the width asked
    for (let u = KEEP.tree; u <= laneLength + WOOD.past / TILE; u += KEEP.trees)
      for (const side of [-1, 1]) {
        const ideal: Pt = [
          tee[0] + unit[0] * u - unit[1] * side * (keepT + 0.3),
          tee[1] + unit[1] * u + unit[0] * side * (keepT + 0.3),
        ];
        let best: { c: number; r: number; d: number } | null = null;
        for (let dc = -2; dc <= 2; dc++)
          for (let dr = -2; dr <= 2; dr++) {
            const c = Math.round(ideal[0]) + dc,
              r = Math.round(ideal[1]) + dr;
            const d = fromLane(c, r);
            if (d >= keepT && (!best || d < best.d) && treeFits(c, r) && room(c, r)) best = { c, r, d };
          }
        if (best) {
          grid[best.r][best.c] = '^';
          placedTrees.push([best.c, best.r]);
        }
      }
    for (let r = 0; r < rows; r += WOOD.apart)
      for (let c = ((r / WOOD.apart) * WOOD.shift) % WOOD.apart; c < cols; c += WOOD.apart)
        if (treeFits(c, r) && room(c, r)) {
          grid[r][c] = '^';
          placedTrees.push([c, r]);
        }
    if (!joined()) throw new Error(`${name}: its wood leaves no way from the tee to the cup`);
    const cell = (t: Tile) => ({ x: (t[0] + 0.5 - cols / 2) * TILE, y: (t[1] + 0.5 - rows / 2) * TILE });
    made = { from: cell(tee), to: cell(wayTo), width: spec.gap?.width ?? WOOD.width, keep: keepT * TILE };
  }
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
  // with heighten the ground runs, and a ball is only asked to rest on the tee, the green and the plate round it, and the
  // shelves: the fairway elsewhere may run, and must drain instead
  let only: Uint8Array | undefined;
  if (heighten > 1) {
    only = new Uint8Array(flat.cols * flat.rows);
    for (let r = 0; r < flat.rows; r++)
      for (let c = 0; c < flat.cols; c++) {
        const t = r * flat.cols + c;
        const lie = flat.lie[t];
        if (lie === LIE.tee || lie === LIE.green) only[t] = 1;
        else if (Math.hypot(c - cup[0], r - cup[1]) <= GREEN + PLATE.full) only[t] = 1;
        else if (shelfAt.some(([sc, sr]) => Math.hypot(c - sc, r - sr) <= SHELF.radius)) only[t] = 1;
      }
  }
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
    const playable = rests(layoutOf(drawn, ground), greens, only);
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
        (!playable || rests(layoutOf(drawn, out), greens, only))
      )
        break;
    }
    return out;
  };
  // the ground, as steep as asked, and gentler by a little each time until the tee, the fairway and the green all rest a
  // ball: a hole that cannot be played is never returned. It is tried against the hole as it was drawn, before the cut,
  // so that the cut changes what a ball rolls on and not how steep a hole may be
  for (let k = 0, steep = steepness; k < GENTLER.tries; k++, steep *= GENTLER.by) {
    const ground = noiseGround(flat, { seed, feel, steepness: steep, flats, ...(heighten > 1 ? { heighten } : {}) });
    const terrain = field ? contoured(ground, field) : ground;
    // the ground that runs must drain, judged on the hole as it is mown, since the first cut is ground a ball is played from;
    // and it must still be a ground the physics takes: a plate blended into steep hills can be a step past half a tile
    if (
      rests(layoutOf(drawn, terrain), greens, only) &&
      (!only ||
        (steepestStep(terrain, 0, 0, cols - 1, rows - 1) <= TILE / 2 && drainFault(layoutOf(map, terrain), greens) < 0))
    ) {
      const hole: HoleDef = {
        name,
        par,
        map,
        terrain,
        ...(wind ? { wind } : {}),
        ...(greens !== undefined ? { greens } : {}),
      };
      if (made) LANES.set(hole, made);
      return hole;
    }
  }
  throw new Error(`${name}: its fairway will not rest a ball, however gentle its hills`);
}
