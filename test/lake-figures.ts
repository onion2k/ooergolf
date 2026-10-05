/**
 * What a lake hole is, worked out from its map alone and for itself, never from the generator's own bookkeeping: which
 * tiles of play are one piece of land (a way three tiles wide over what a ball rolls on), and where a ball can be flown
 * from one piece to another over water, in a straight line, and how much water that is. The lake tests hold the generator to
 * these, and the measuring script reads the same figures, so a test that says a lake leaves no way round is saying it by
 * a count that is not the one the generator used to place it.
 */
import { layoutOf, TILE } from '../src/arena';
import type { HoleDef } from '../src/course';

/** The tiles a ball rolls on and is played from: fairway, rough, the first cut, green, the tee and its box, the cup and sand. */
const PLAY = 'frcgtTCs';

/** A hole's map as columns and rows from the south-west, the way the layout has it, and its tiles' kinds as the map draws them. */
export interface Grid {
  cols: number;
  rows: number;
  /** The map's character at a column and a row from the south, or a space off the map. */
  kind: (c: number, r: number) => string;
  tee: [number, number];
  cup: [number, number];
}

export function gridOf(hole: HoleDef): Grid {
  const rows = hole.map.length,
    cols = hole.map[0].length;
  const kind = (c: number, r: number) => (c < 0 || r < 0 || c >= cols || r >= rows ? ' ' : hole.map[rows - 1 - r][c]);
  let tee: [number, number] = [0, 0],
    cup: [number, number] = [0, 0];
  for (let r = 0; r < rows; r++)
    for (let c = 0; c < cols; c++) {
      if (kind(c, r) === 'T') tee = [c, r];
      if (kind(c, r) === 'C') cup = [c, r];
    }
  return { cols, rows, kind, tee, cup };
}

/** The pieces of land of a hole: each wide-open tile (it and its eight neighbours are play) labelled by its piece, from one. */
export interface Land {
  grid: Grid;
  /** Label by `r * cols + c`: nought where a tile is not wide-open. */
  label: Int32Array;
  /** How many tiles each piece has, by label (index nought is unused). */
  sizes: number[];
  open: (c: number, r: number) => boolean;
  wide: (c: number, r: number) => boolean;
}

export function landOf(hole: HoleDef): Land {
  const grid = gridOf(hole);
  const { cols, rows, kind } = grid;
  const open = (c: number, r: number) => PLAY.includes(kind(c, r));
  const wide = (c: number, r: number) => {
    for (let dc = -1; dc <= 1; dc++) for (let dr = -1; dr <= 1; dr++) if (!open(c + dc, r + dr)) return false;
    return true;
  };
  const label = new Int32Array(cols * rows);
  const sizes = [0];
  for (let r0 = 0; r0 < rows; r0++)
    for (let c0 = 0; c0 < cols; c0++) {
      if (label[r0 * cols + c0] || !wide(c0, r0)) continue;
      const id = sizes.length;
      let n = 0;
      const stack = [r0 * cols + c0];
      label[stack[0]] = id;
      while (stack.length) {
        const t = stack.pop()!;
        n++;
        const c = t % cols,
          r = Math.floor(t / cols);
        for (const [dc, dr] of [
          [1, 0],
          [-1, 0],
          [0, 1],
          [0, -1],
        ]) {
          const k = (r + dr) * cols + (c + dc);
          if (c + dc >= 0 && c + dc < cols && r + dr >= 0 && r + dr < rows && !label[k] && wide(c + dc, r + dr)) {
            label[k] = id;
            stack.push(k);
          }
        }
      }
      sizes.push(n);
    }
  return { grid, label, sizes, open, wide };
}

/** A straight flight from a shore over water to land three tiles wide: the pieces it joins, and how much water it crossed, in tiles. */
export interface Crossing {
  from: number;
  to: number;
  run: number;
  /** The shore tile it left from and the tile it came down on. */
  shore: [number, number];
  land: [number, number];
}

/**
 * The shortest straight crossing from each piece of land to each other piece it can be flown to over water, tried every
 * half a degree from every tile of its shore. The run is the water under the line, tile by tile along it, and a line that
 * meets anything but water before land (a tree, rock, out of bounds) is no crossing.
 */
export function crossings(hole: HoleDef, most = 80): Crossing[] {
  const land = landOf(hole);
  const { grid, label } = land;
  const { cols, rows, kind } = grid;
  const best = new Map<string, Crossing>();
  for (let r = 0; r < rows; r++)
    for (let c = 0; c < cols; c++) {
      const from = label[r * cols + c];
      if (!from) continue;
      // a tile of the shore: land three wide, so a tile in from the water's edge, with water within two tiles
      let shore = false;
      for (let dc = -2; dc <= 2 && !shore; dc++)
        for (let dr = -2; dr <= 2 && !shore; dr++) if (kind(c + dc, r + dr) === '~') shore = true;
      if (!shore) continue;
      for (let a = 0; a < 720; a++) {
        const dx = Math.cos((a * Math.PI) / 360),
          dy = Math.sin((a * Math.PI) / 360);
        // the water under the line: from where it first meets water to the last water before land
        let first = -1,
          last = -1;
        for (let d = 0.5; d <= most; d += 0.5) {
          const tc = Math.round(c + dx * d),
            tr = Math.round(r + dy * d);
          const here = kind(tc, tr);
          if (here === '~') {
            if (first < 0) first = d;
            last = d;
            continue;
          }
          if (first < 0) {
            // still on the shore's own land, a few tiles of it
            if (PLAY.includes(here) && d <= 3.5) continue;
            break;
          }
          // past the water: on, over the first tiles of the far land, to a tile three wide
          const to = label[tr * cols + tc];
          if (to) {
            if (to !== from) {
              const run = last - first + 0.5;
              const key = `${from}>${to}`;
              const known = best.get(key);
              if (!known || run < known.run) best.set(key, { from, to, run, shore: [c, r], land: [tc, tr] });
            }
            break;
          }
          if (!PLAY.includes(here) || d > last + 3.5) break;
        }
      }
    }
  return [...best.values()];
}

/** Whether the cup is on the tee's piece of land: a way round, over land alone. */
export function wayRound(hole: HoleDef): boolean {
  const land = landOf(hole);
  const { grid, label } = land;
  return label[grid.tee[1] * grid.cols + grid.tee[0]] === label[grid.cup[1] * grid.cols + grid.cup[0]];
}

/**
 * The pieces of land a ball can be got to from the tee by flights of no more than `carry` tiles of water, over land between
 * (a piece is joined to the tee's by land or by a crossing), as labels.
 */
export function reached(hole: HoleDef, carry: number): Set<number> {
  const land = landOf(hole);
  const { grid, label } = land;
  const start = label[grid.tee[1] * grid.cols + grid.tee[0]];
  const hops = crossings(hole).filter((x) => x.run <= carry);
  const seen = new Set([start]);
  for (let grew = true; grew;) {
    grew = false;
    for (const h of hops)
      if (seen.has(h.from) && !seen.has(h.to)) {
        seen.add(h.to);
        grew = true;
      }
  }
  return seen;
}

/** Water tiles, and the tiles of each island: pieces of land that are not the tee's or the cup's, of more than six tiles of play. */
export function figures(hole: HoleDef) {
  const land = landOf(hole);
  const { grid, label } = land;
  let water = 0;
  for (let r = 0; r < grid.rows; r++) for (let c = 0; c < grid.cols; c++) if (grid.kind(c, r) === '~') water++;
  const tee = label[grid.tee[1] * grid.cols + grid.tee[0]],
    cup = label[grid.cup[1] * grid.cols + grid.cup[0]];
  const islands: { label: number; tiles: number; centre: [number, number] }[] = [];
  for (let id = 1; id < land.sizes.length; id++) {
    if (id === tee || id === cup) continue;
    let n = 0,
      sc = 0,
      sr = 0;
    for (let r = 0; r < grid.rows; r++)
      for (let c = 0; c < grid.cols; c++)
        if (label[r * grid.cols + c] === id) {
          n++;
          sc += c;
          sr += r;
        }
    if (n >= 6) islands.push({ label: id, tiles: n, centre: [sc / n, sr / n] });
  }
  // the biggest first: a lake's shore may be cut into pockets of land that are not the island that was laid
  islands.sort((a, b) => b.tiles - a.tiles);
  return { water, islands, tee, cup };
}

/** The middle of a tile, in the layout's yards, for a hole's layout. */
export function centre(hole: HoleDef, c: number, r: number): { x: number; y: number } {
  const l = layoutOf(hole.map, hole.terrain);
  return { x: l.originX + (c + 0.5) * TILE, y: l.originY + (r + 0.5) * TILE };
}
