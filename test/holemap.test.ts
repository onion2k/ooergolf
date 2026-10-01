/** The map of a hole: its ground seen from above, tee at the bottom, small enough to sit over the course. */
import { describe, expect, it } from 'vitest';
import { layoutOf } from '../src/arena';
import { paintMap, mapPoint, mapSize } from '../src/holemap';
import { LIE } from '../src/surfaces';
import { field } from './helpers';

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
    const l = layoutOf([
      '###############',
      '#rrrfffgrrrrrr#',
      '#rrrfffCrrrrrr#',
      '#rsrf~fgrrrrrr#',
      '#rrxxfffrrrrrr#',
      '#rrrrtTtrrrrrr#',
      '#rrrrrrrrrrr^r#',
      '#rrrrrrrrrrrrr#',
      '###############',
    ]);
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
      rough: at(1, 1),
      fairway: at(4, 1),
      green: at(7, 1),
      sand: at(2, 3),
      water: at(5, 3),
      oob: at(3, 4),
      tree: at(12, 6),
      tee: at(5, 5),
    };
    const distinct = new Set(Object.values(kinds).map((c) => c.join(',')));
    expect(distinct.size, 'eight kinds, eight colours').toBe(8);
    for (const [name, c] of Object.entries(kinds)) expect(c[3], `${name} is drawn`).toBe(255);
    // the colour of a kind is the same wherever it is
    expect(at(1, 2)).toEqual(kinds.rough);
    expect(at(6, 4)).toEqual(kinds.fairway);
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
    const l = layoutOf(['#######', '#rcccgr#', '#rcfCgr#', '#rccccr#', '#rrtTtr#', '#######']);
    const s = mapSize(l, 210, 150);
    const img = new Uint8ClampedArray(s.width * s.height * 4);
    paintMap(l, s, img);
    const at = (col: number, row: number) => {
      const [x, y] = [l.originX + (col + 0.5) * 3, l.originY + (l.rows - row - 0.5) * 3];
      const [px, py] = mapPoint(l, s, x, y);
      return pixel(img, s.width, px, py);
    };
    const cut = at(2, 1),
      fairway = at(3, 2),
      green = at(5, 2),
      rough = at(1, 1);
    expect(cut[3]).toBe(255);
    expect(new Set([cut, fairway, green, rough].map((c) => c.join(','))).size, 'four colours').toBe(4);
    const lum = (c: number[]) => c[0] * 0.2126 + c[1] * 0.7152 + c[2] * 0.0722;
    expect(lum(cut)).toBeGreaterThan(lum(fairway));
    expect(lum(cut)).toBeLessThan(lum(green));
  });

  it('is the same picture every time, from the same hole', () => {
    // a hole drawn here and not made by the generator, so that a change to what the map shows is a change to the map, and the
    // hash does not move whenever a hole of The Links is made differently
    const l = layoutOf([
      '#################',
      '#xxxxxxxxxxxxxxx#',
      '#xrrrrrrrrrrrrrx#',
      '#xrrcccccccrrrrx#',
      '#xrrcgggggcrr^rx#',
      '#xrrcgggCggcrrrx#',
      '#xrscgggggccrrrx#',
      '#xrssccccccfrrrx#',
      '#xrrrcfffffcr~~x#',
      '#xrrrcfffffc~~~x#',
      '#xrrrcfffffcrrrx#',
      '#xrr^cfffffcrrrx#',
      '#xrrrrcfffcrrrrx#',
      '#xrrrrrttTtrrrrx#',
      '#xxxxxxxxxxxxxxx#',
      '#################',
    ]);
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
const PICTURE = 4280028507;
