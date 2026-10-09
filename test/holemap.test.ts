/** The map of a hole: its ground seen from above, tee at the bottom, small enough to sit over the course. */
import { describe, expect, it } from 'vitest';
import { layoutOf } from '../src/arena';
import { paintMap, mapPoint, mapSize, ZONE_COLOUR } from '../src/holemap';
import { links } from '../src/links';
import { zonesOf } from '../src/zones';
import { LIE } from '../src/surfaces';
import { field } from './helpers';

/**
 * A map of `cols` by `rows` tiles, rough inside a rail, drawn on from the top with blocks of ground: a map is painted by the
 * zones the ground is drawn by, which a curve keeps only for a piece of ground a few tiles across (a single tile of sand
 * blurs away), so each kind here is a block.
 */
function blocks(
  cols: number,
  rows: number,
  draws: [r0: number, r1: number, c0: number, c1: number, ch: string][],
): string[] {
  const grid: string[][] = Array.from({ length: rows }, (_, r) =>
    Array.from({ length: cols }, (_, c) => (r === 0 || r === rows - 1 || c === 0 || c === cols - 1 ? '#' : 'r')),
  );
  for (const [r0, r1, c0, c1, ch] of draws)
    for (let r = r0; r <= r1; r++) for (let c = c0; c <= c1; c++) grid[r][c] = ch;
  return grid.map((row) => row.join(''));
}

const pixel = (img: Uint8ClampedArray, w: number, x: number, y: number) => {
  const o = (Math.floor(y) * w + Math.floor(x)) * 4;
  return Array.from(img.slice(o, o + 4));
};

describe('the hole map', () => {
  it('is sized to fit its box, whole pixels, the hole at its own shape, and never bigger than a pixel a tile', () => {
    const l = layoutOf(field('f', 100, 41).map);
    const s = mapSize(l, 90, 200);
    expect(s.width).toBeLessThanOrEqual(90);
    expect(s.height).toBeLessThanOrEqual(200);
    expect(Number.isInteger(s.width) && Number.isInteger(s.height)).toBe(true);
    // a hole 41 tiles across by 100 up is about 0.41 as wide as it is tall, however much room it is given
    expect(s.width / s.height).toBeCloseTo(41 / 100, 1);
    // a box with more room than the hole needs does not stretch it past three pixels a tile
    const roomy = mapSize(l, 4000, 4000);
    expect(roomy.width).toBeLessThanOrEqual(41 * 3);
  });

  it('puts the tee at the bottom and the cup at the top, the way the course is drawn as seen from the tee', () => {
    const l = layoutOf(field('f', 100, 41).map);
    const s = mapSize(l, 90, 200);
    const tee = mapPoint(l, s, l.tee.x, l.tee.y);
    const cup = mapPoint(l, s, l.cup.x, l.cup.y);
    expect(tee[1]).toBeGreaterThan(cup[1]);
    expect(tee[1]).toBeLessThan(s.height);
    expect(cup[1]).toBeGreaterThan(0);
    // and east is to the right: the field's cup is in its west corner
    expect(cup[0]).toBeLessThan(tee[0]);
  });

  it('paints each kind of ground in its own colour, nothing off the course, and every pixel seen', () => {
    const l = layoutOf(
      blocks(31, 26, [
        [2, 9, 4, 9, 'f'],
        [2, 7, 13, 18, 'g'],
        [4, 4, 15, 15, 'C'],
        [12, 16, 3, 7, 's'],
        [12, 14, 11, 13, '~'],
        [18, 22, 1, 8, 'x'],
        [20, 22, 14, 18, 't'],
        [21, 21, 16, 16, 'T'],
        [24, 24, 24, 24, '^'],
      ]),
    );
    const s = mapSize(l, 450, 270);
    const img = new Uint8ClampedArray(s.width * s.height * 4);
    paintMap(l, s, img);
    const at = (col: number, row: number) => {
      // the middle of a tile, row counted from the top as the map is drawn
      const [x, y] = [l.originX + (col + 0.5) * 3, l.originY + (l.rows - row - 0.5) * 3];
      const [px, py] = mapPoint(l, s, x, y);
      return pixel(img, s.width, px, py);
    };
    const kinds = {
      rough: at(25, 10),
      fairway: at(6, 5),
      green: at(16, 3),
      sand: at(5, 14),
      water: at(12, 13),
      oob: at(4, 20),
      tree: at(24, 24),
      tee: at(15, 21),
    };
    const distinct = new Set(Object.values(kinds).map((c) => c.join(',')));
    expect(distinct.size, 'eight kinds, eight colours').toBe(8);
    for (const [name, c] of Object.entries(kinds)) expect(c[3], `${name} is drawn`).toBe(255);
    // the colour of a kind is the same wherever it is
    expect(at(26, 12)).toEqual(kinds.rough);
    expect(at(7, 6)).toEqual(kinds.fairway);
    // ground that is off the course is not drawn at all, so the map has the shape of the hole and not of its box
    const gap = layoutOf(['#######', '#rrrrr#', '#r   r#', '#rrCrr#', '#rrTrr#', '#######']);
    const g = mapSize(gap, 210, 180);
    const gi = new Uint8ClampedArray(g.width * g.height * 4);
    paintMap(gap, g, gi);
    const [hx, hy] = mapPoint(gap, g, gap.originX + 3.5 * 3, gap.originY + 3.5 * 3);
    expect(pixel(gi, g.width, hx, hy)[3], 'off the course').toBe(0);
    expect(LIE.green).toBeGreaterThan(0);
  });

  it('paints the first cut in a colour of its own, between the fairway and the green, as the course draws it', () => {
    // a green over a fairway, and the cut a tile round them, which is the band outside their curves and no block of its own
    const l = layoutOf(
      blocks(21, 20, [
        [2, 6, 5, 11, 'g'],
        [4, 4, 8, 8, 'C'],
        [8, 13, 5, 11, 'f'],
        [16, 18, 7, 9, 't'],
        [17, 17, 8, 8, 'T'],
      ]),
    );
    const s = mapSize(l, 210, 150);
    const img = new Uint8ClampedArray(s.width * s.height * 4);
    paintMap(l, s, img);
    const at = (col: number, row: number) => {
      const [x, y] = [l.originX + (col + 0.5) * 3, l.originY + (l.rows - row - 0.5) * 3];
      const [px, py] = mapPoint(l, s, x, y);
      return pixel(img, s.width, px, py);
    };
    const cut = at(4, 4),
      fairway = at(8, 11),
      green = at(8, 3),
      rough = at(1, 1);
    expect(cut[3]).toBe(255);
    expect(new Set([cut, fairway, green, rough].map((c) => c.join(','))).size, 'four colours').toBe(4);
    const lum = (c: number[]) => c[0] * 0.2126 + c[1] * 0.7152 + c[2] * 0.0722;
    expect(lum(cut)).toBeGreaterThan(lum(fairway));
    expect(lum(cut)).toBeLessThan(lum(green));
  });

  it('paints each pixel of a golf hole by the zone at its point, so the map shows what is played', () => {
    const hole = links()[2];
    const l = layoutOf(hole.map, hole.terrain);
    const zones = zonesOf(l);
    const s = mapSize(l, 300, 500);
    const img = new Uint8ClampedArray(s.width * s.height * 4);
    paintMap(l, s, img);
    let checked = 0;
    const seen = new Set<string>();
    for (let py = 0; py < s.height; py++)
      for (let px = 0; px < s.width; px++) {
        const x = s.west + (px + 0.5) / s.scale,
          y = s.north - (py + 0.5) / s.scale;
        const t = Math.floor((y - l.originY) / 3) * l.cols + Math.floor((x - l.originX) / 3);
        if (l.solid[t] || l.water[t]) continue;
        const zone = zones.at(x, y);
        // a tree's dot is drawn over the ground
        if (l.trees.some((tr) => Math.hypot(tr.x - x, tr.y - y) < 4)) continue;
        const want = ZONE_COLOUR[zone];
        expect(pixel(img, s.width, px, py).slice(0, 3), `${zone} at ${x.toFixed(1)},${y.toFixed(1)}`).toEqual([
          ...want,
        ]);
        seen.add(zone);
        checked++;
      }
    expect(checked, 'pixels checked').toBeGreaterThan(5000);
    expect(seen.size, 'kinds of ground met').toBeGreaterThanOrEqual(6);
  });

  it('is the same picture every time, from the same hole', () => {
    // a hole drawn here and not made by the generator, so that a change to what the map shows is a change to the map, and the
    // hash does not move whenever a hole of The Links is made differently
    const l = layoutOf(
      blocks(30, 40, [
        [3, 9, 8, 15, 'g'],
        [6, 6, 11, 11, 'C'],
        [12, 28, 8, 14, 'f'],
        [14, 18, 20, 26, '~'],
        [20, 26, 2, 5, 's'],
        [31, 35, 1, 6, 'x'],
        [33, 35, 11, 15, 't'],
        [34, 34, 13, 13, 'T'],
        [12, 12, 22, 22, '^'],
        [30, 30, 3, 3, '^'],
      ]),
    );
    const s = mapSize(l, 100, 230);
    const a = new Uint8ClampedArray(s.width * s.height * 4),
      b = new Uint8ClampedArray(a.length);
    paintMap(l, s, a);
    paintMap(l, s, b);
    expect(a).toEqual(b);
    let sum = 0;
    for (const v of a) sum = (sum * 31 + v) >>> 0;
    // a hash of the picture, held so that a change to what the map shows is a change made on purpose
    expect(sum).toBe(PICTURE);
  });
});

/** The hash of that hole's map at 100 by 230, written down when the first cut was added to the map (1 October 2026). */
// written again on 8 October 2026, when the course's palette became the title picture's warmer greens, which the map paints in
// and again on 9 October 2026, when the map was painted by the zones the ground is drawn by (a curve keeps only ground a few tiles
// across, so the hole is redrawn in blocks); the pixel-by-zone test above is what says the picture is right
// and again on 9 October 2026, when the rough and the first cut were made the title's lighter greens (the map paints in both)
const PICTURE = 2024166387;
