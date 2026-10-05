/**
 * The route to the cup: how far a ball is from it by the way it has to be played, round the water, the out of bounds,
 * the rock and the trees that lie between, and where along that way to aim. What the planner knows of the shape of a
 * hole, since on a dogleg the cup is not where to aim and a lay-up is a place on the way and never on the line.
 *
 * A flood back from the cup over the tiles, eight ways and the way of the ground: the fairway is what a ball is best
 * played over, the rough a little less and the sand a good deal less, so the way keeps to the one and cuts across the
 * others only where it saves much. Tiles under a canopy are not on it, since a ball is not played through a tree, and a
 * ball lying under one is as far as the ground beside it. Made once for a hole and asked as often as wanted.
 *
 * Where some land is not joined to the cup over land (an island, or a shore a lake runs right across), the flood also
 * crosses water, at the fairway's cost, since a ball is flown over it and is never played on it: water has no distance of
 * its own and a way point never stops on it. Where all the land is joined the flood is what it always was, to the bit.
 *
 * Arithmetic only: it is handed a layout, and reads it.
 */
import { TILE, type Layout } from './arena';
import { LIE } from './surfaces';
import { TREE } from './trees';

/** How much harder a ball is played over each kind of ground, as a multiple of the same distance of fairway. */
const COST: Record<number, number> = { [LIE.sand]: 2, [LIE.rough]: 1.25, [LIE.cut]: 1.1 };
/** How near a trunk a tile's middle may be for the tile to be under a canopy, as a share of the canopy's width. */
const UNDER = 0.9;

/** The fewest tiles of land, cut off by water, that are an island to fly to and not a stray tile of the shore. */
const ISLAND = 6;

/** How much of the distance asked a way point over water may fall short by, as a share of it, before it goes on to the far side. */
const HALF = 0.5;

const STEPS: [number, number][] = [
  [1, 0],
  [-1, 0],
  [0, 1],
  [0, -1],
  [1, 1],
  [1, -1],
  [-1, 1],
  [-1, -1],
];

export class Route {
  /** The route's length from each tile's middle to the cup, in units; infinity where there is no way, and on water. */
  private readonly far: Float32Array;
  /**
   * The flood a way point walks down. The same array as `far` unless the flood crossed water, when it also holds the
   * water's tiles, which `far` leaves at infinity since a ball is never on one.
   */
  private readonly flow: Float32Array;
  /** The tiles under a canopy, which have no way of their own. */
  private readonly canopy: Uint8Array;

  constructor(private readonly layout: Layout) {
    const { cols, rows } = layout;
    const n = cols * rows;
    this.canopy = new Uint8Array(n);
    const blocked = new Uint8Array(n);
    for (let t = 0; t < n; t++) blocked[t] = layout.solid[t] | layout.water[t] | layout.oob[t];
    for (const tree of layout.trees)
      for (
        let ty = Math.max(0, Math.floor((tree.y - layout.originY) / TILE) - 3);
        ty <= Math.min(rows - 1, Math.floor((tree.y - layout.originY) / TILE) + 3);
        ty++
      )
        for (
          let tx = Math.max(0, Math.floor((tree.x - layout.originX) / TILE) - 3);
          tx <= Math.min(cols - 1, Math.floor((tree.x - layout.originX) / TILE) + 3);
          tx++
        ) {
          const x = layout.originX + (tx + 0.5) * TILE,
            y = layout.originY + (ty + 0.5) * TILE;
          if (Math.hypot(x - tree.x, y - tree.y) < TREE.radius * UNDER) this.canopy[ty * cols + tx] = 1;
        }
    const cup =
      Math.floor((layout.cup.y - layout.originY) / TILE) * cols + Math.floor((layout.cup.x - layout.originX) / TILE);
    // the ground a way may go over: open, and not under a canopy, but for the cup's own tile
    const land = (t: number) => !blocked[t] && (!this.canopy[t] || t === cup);
    // water a ball may be flown over: the wet that is not also rock or out of bounds
    const wet = (t: number) => layout.water[t] === 1 && !layout.solid[t] && !layout.oob[t];
    const cost = (t: number) => (layout.water[t] ? 1 : (COST[layout.sand[t] ? LIE.sand : layout.lie[t]] ?? 1));
    // land that is on the course: the ground off it, beyond the rock, is open to the flood's eye and joined to nothing
    const played = (t: number) => land(t) && (layout.lie[t] !== LIE.none || layout.sand[t] === 1);
    const flood = (open: (t: number) => boolean): Float32Array => {
      const far = new Float32Array(n).fill(Infinity);
      // a flood back from the cup, nearest first, off a heap of (distance, tile)
      const keys: number[] = [],
        items: number[] = [];
      const push = (key: number, item: number) => {
        let i = keys.length;
        keys.push(key);
        items.push(item);
        while (i > 0) {
          const parent = (i - 1) >> 1;
          if (keys[parent] <= key) break;
          keys[i] = keys[parent];
          items[i] = items[parent];
          i = parent;
        }
        keys[i] = key;
        items[i] = item;
      };
      const pop = (): number => {
        const item = items[0];
        const key = keys.pop()!,
          last = items.pop()!;
        const size = keys.length;
        if (size > 0) {
          let i = 0;
          for (;;) {
            let c = 2 * i + 1;
            if (c >= size) break;
            if (c + 1 < size && keys[c + 1] < keys[c]) c++;
            if (keys[c] >= key) break;
            keys[i] = keys[c];
            items[i] = items[c];
            i = c;
          }
          keys[i] = key;
          items[i] = last;
        }
        return item;
      };
      far[cup] = 0;
      push(0, cup);
      const done = new Uint8Array(n);
      while (keys.length) {
        const key = keys[0];
        const t = pop();
        if (done[t]) continue;
        done[t] = 1;
        const tx = t % cols,
          ty = Math.floor(t / cols);
        for (const [dx, dy] of STEPS) {
          const nx = tx + dx,
            ny = ty + dy;
          if (nx < 0 || ny < 0 || nx >= cols || ny >= rows) continue;
          const u = ny * cols + nx;
          if (done[u] || !open(u)) continue;
          // a diagonal step may not cut a corner of what is closed
          if (dx && dy && (!open(ty * cols + nx) || !open(ny * cols + tx))) continue;
          const d = key + Math.hypot(dx, dy) * TILE * cost(u);
          if (d < far[u]) {
            far[u] = d;
            push(d, u);
          }
        }
      }
      return far;
    };
    this.far = flood(land);
    this.flow = this.far;
    // land that cannot be got to over land, canopies and all: an island, or a shore with water right across it. A pocket a
    // ring of canopies shuts in is not one, since the trees are what stops the flood and not the water, and a ball over it
    // is flown as ever.
    let cut = false;
    if (layout.water.includes(1)) {
      const joined = new Uint8Array(n),
        stack = [cup];
      const ground = (t: number) => !blocked[t];
      joined[cup] = 1;
      while (stack.length) {
        const t = stack.pop()!;
        const tx = t % cols,
          ty = Math.floor(t / cols);
        for (const [dx, dy] of STEPS) {
          const nx = tx + dx,
            ny = ty + dy;
          if (nx < 0 || ny < 0 || nx >= cols || ny >= rows) continue;
          const u = ny * cols + nx;
          if (joined[u] || !ground(u)) continue;
          if (dx && dy && (!ground(ty * cols + nx) || !ground(ny * cols + tx))) continue;
          joined[u] = 1;
          stack.push(u);
        }
      }
      // an island is somewhere to be played from, which a lone tile of rough in a pond's edge is not
      for (let t = 0; t < n && !cut; t++) {
        if (!played(t) || joined[t]) continue;
        let size = 0;
        joined[t] = 1;
        stack.push(t);
        while (stack.length) {
          const v = stack.pop()!;
          size++;
          const vx = v % cols,
            vy = Math.floor(v / cols);
          for (const [dx, dy] of STEPS) {
            const nx = vx + dx,
              ny = vy + dy;
            if (nx < 0 || ny < 0 || nx >= cols || ny >= rows) continue;
            const u = ny * cols + nx;
            if (joined[u] || !ground(u)) continue;
            joined[u] = 1;
            stack.push(u);
          }
        }
        if (size >= ISLAND) cut = true;
      }
    }
    if (cut) {
      this.flow = flood((t) => land(t) || wet(t));
      this.far = this.flow.slice();
      for (let t = 0; t < n; t++) if (wet(t)) this.far[t] = Infinity;
    }
  }

  /** The tile a point is on, or -1. */
  private tileOf(x: number, y: number): number {
    const { layout } = this;
    const tx = Math.floor((x - layout.originX) / TILE),
      ty = Math.floor((y - layout.originY) / TILE);
    return tx < 0 || ty < 0 || tx >= layout.cols || ty >= layout.rows ? -1 : ty * layout.cols + tx;
  }

  /**
   * How far from the cup a point is by the route, in units: a tile's, from its middle, and for a point under a canopy that
   * of the ground beside it and a tile more. Infinity where there is no way: water, out of bounds, rock, off the map.
   */
  distance(x: number, y: number): number {
    const t = this.tileOf(x, y);
    if (t < 0) return Infinity;
    if (Number.isFinite(this.far[t])) return this.far[t];
    if (!this.canopy[t]) return Infinity;
    return this.nearestBeside(t).far + TILE;
  }

  /** Of the tiles round `t`, the nearest the cup by `flood` (the route's own by default), and its tile. */
  private nearestBeside(t: number, flood: Float32Array = this.far): { far: number; tile: number } {
    const { cols, rows } = this.layout;
    const tx = t % cols,
      ty = Math.floor(t / cols);
    let best = { far: Infinity, tile: t };
    for (const [dx, dy] of STEPS) {
      const nx = tx + dx,
        ny = ty + dy;
      if (nx < 0 || ny < 0 || nx >= cols || ny >= rows) continue;
      const u = ny * cols + nx;
      if (flood[u] < best.far) best = { far: flood[u], tile: u };
    }
    return best;
  }

  /**
   * The point `along` units along the route from (x, y) toward the cup, or the cup if it is nearer than that or there is
   * no way: a step at a time down the flood, to the middle of a tile and on, and the last step cut to what is left. Never
   * a point on water: where the way flies over it and the distance ends there, it is the last land before it, or, where
   * that falls short of half of what was asked (a lay-up that gets no further than the shore is none), the first land
   * after it.
   */
  waypoint(x: number, y: number, along: number): { x: number; y: number } {
    const { layout, flow } = this;
    const { cols } = layout;
    const cup = { x: layout.cup.x, y: layout.cup.y };
    let t = this.tileOf(x, y);
    if (t < 0) return cup;
    if (!Number.isFinite(this.far[t])) {
      if (!this.canopy[t]) return cup;
      t = this.nearestBeside(t).tile;
      if (!Number.isFinite(this.far[t])) return cup;
    }
    let px = x,
      py = y,
      left = along;
    // the last middle of a tile of land passed on the way, and the point the distance ran out at, if that was on water
    let landed: { x: number; y: number } | null = null;
    let landedAt = 0;
    let short = false;
    for (let guard = 0; guard < 2000; guard++) {
      if (flow[t] <= 0) return cup;
      const next = this.nearestBeside(t, flow);
      if (!(next.far < flow[t])) return cup;
      const nx = layout.originX + ((next.tile % cols) + 0.5) * TILE,
        ny = layout.originY + (Math.floor(next.tile / cols) + 0.5) * TILE;
      const len = Math.hypot(nx - px, ny - py);
      if (!short && len >= left) {
        const k = left / (len || 1);
        const at = { x: px + (nx - px) * k, y: py + (ny - py) * k };
        const there = this.tileOf(at.x, at.y);
        if (there < 0 || !layout.water[there]) return at;
        if (landed && landedAt >= along * HALF) return landed;
        // no land worth stopping on since the ball: go on to the first there is
        short = true;
      }
      left -= len;
      px = nx;
      py = ny;
      t = next.tile;
      if (!layout.water[t]) {
        if (short) return { x: px, y: py };
        landed = { x: px, y: py };
        landedAt = along - left;
      }
    }
    return cup;
  }
}
