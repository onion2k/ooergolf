/**
 * The range, the first course of golf: three holes with nothing on them but their ground, so that every club of the
 * bag can be tried from every lie before the holes that ask more of it are drawn. A unit is a yard, so a hole is as long
 * as it is called; a tee's box, a fairway, rough either side and a round green, in a rail well off the line of any drive.
 */
import { describe, expect, it } from 'vitest';
import { TILE, layoutOf, lieAt, tileAt } from '../src/arena';
import { COURSES } from '../src/course';
import { RANGE, rangeHole, type RangeSpec } from '../src/range';
import { GREENS, LIE } from '../src/surfaces';
import { windDirection } from '../src/shaping';

const range = () => COURSES.find((c) => c.name === 'The Range')!;
const dist = (l: ReturnType<typeof layoutOf>) => Math.hypot(l.cup.x - l.tee.x, l.cup.y - l.tee.y);
type Layout = ReturnType<typeof layoutOf>;
/** The tile a place is on, by yards east and north of the tee, as the hazards of a spec name it. */
const at = (l: Layout, east: number, north: number) => tileAt(l, l.tee.x + east, l.tee.y + north);
const THE_OLD_THREE = ['Pitch and Putt', 'Iron Alley', 'The Long Way'];
const NEW_SIX = ['Sand Trap', 'Narrow Straits', 'Over the Pond', 'Gusty', 'The Corner', 'The Long Road'];
/** Whether a ball can be walked from the tee to the cup over tiles that are not rail, rock or water, eight ways. */
const wayThrough = (l: Layout) => {
  const open = (t: number) => t >= 0 && !l.solid[t] && !l.water[t];
  const from = tileAt(l, l.tee.x, l.tee.y),
    to = tileAt(l, l.cup.x, l.cup.y);
  const seen = new Uint8Array(l.cols * l.rows);
  const todo = [from];
  seen[from] = 1;
  while (todo.length) {
    const t = todo.pop()!;
    if (t === to) return true;
    for (let dy = -1; dy <= 1; dy++)
      for (let dx = -1; dx <= 1; dx++) {
        const n = t + dy * l.cols + dx;
        if (!seen[n] && open(n)) {
          seen[n] = 1;
          todo.push(n);
        }
      }
  }
  return false;
};

describe('the range', () => {
  it('is a course of golf on the start screen, with nine holes of par 32, the old three first and in their order, and says so without making them', () => {
    const c = range();
    expect(c.golf).toBe(true);
    expect(c.holes).toBe(RANGE);
    expect(c.summary).toEqual({ holes: 9, par: 32 });
    expect(RANGE.map((h) => h.name)).toEqual([...THE_OLD_THREE, ...NEW_SIX]);
    expect(RANGE.map((h) => h.par)).toEqual([3, 3, 4, 3, 4, 3, 3, 4, 5]);
    expect(new Set(RANGE.map((h) => h.name)).size, 'a best score is kept by name, so a name is one hole’s').toBe(9);
  });

  it('draws a spec the old way where it names no width, and a wider fairway where it does, refusing what it cannot make', () => {
    const spec: RangeSpec = { name: 'Test', par: 4, length: 175 };
    const plain = rangeHole(spec);
    expect(rangeHole({ ...spec, width: 13 }).map, 'thirteen is what it was').toEqual(plain.map);
    const wide = rangeHole({ ...spec, width: 17 });
    expect(wide.map[0].length - plain.map[0].length, 'four tiles wider').toBe(4);
    expect(() => rangeHole({ ...spec, width: 12 })).toThrow(/odd number/);
    expect(() => rangeHole({ ...spec, width: 1 })).toThrow(/odd number/);
  });

  it('refuses a bend, a corner, a hazard, a wind or a green that cannot be made, by the hole’s name', () => {
    const spec: RangeSpec = { name: 'Test', par: 4, length: 200 };
    for (const bad of [{ bend: 120 }, { bend: NaN }, { bend: 20, corner: 0.05 }, { bend: 20, corner: 1 }])
      expect(() => rangeHole({ ...spec, ...bad }), JSON.stringify(bad)).toThrow(/Test.*(bend|corner)/);
    expect(() => rangeHole({ ...spec, hazards: [{ kind: 'sand', along: 100, across: 0, radius: 0 }] })).toThrow(
      /Test.*radius/,
    );
    expect(() => rangeHole({ ...spec, hazards: [{ kind: 'sand', along: NaN, across: 0, radius: 5 }] })).toThrow(/Test/);
    expect(() => rangeHole({ ...spec, hazards: [{ kind: 'water', along: 500, across: 0, radius: 5 }] })).toThrow(
      /Test.*course/,
    );
    expect(() => rangeHole({ ...spec, hazards: [{ kind: 'sand', along: 0, across: 0, radius: 5 }] })).toThrow(
      /Test.*tee/,
    );
    expect(() => rangeHole({ ...spec, hazards: [{ kind: 'water', along: 200, across: 2, radius: 5 }] })).toThrow(
      /Test.*cup/,
    );
    expect(() => rangeHole({ ...spec, hazards: [{ kind: 'tree', x: 0, y: 0 }] })).toThrow(/Test.*tee/);
    expect(() => rangeHole({ ...spec, hazards: [{ kind: 'tree', x: 400, y: 0 }] })).toThrow(/Test.*course/);
    expect(() => rangeHole({ ...spec, wind: -1 })).toThrow(/Test.*wind/);
    expect(() => rangeHole({ ...spec, wind: 90 })).toThrow(/Test.*wind/);
    expect(() => rangeHole({ ...spec, greens: 5 })).toThrow(/Test.*greens/);
    expect(() => rangeHole({ ...spec, greens: 30 })).toThrow(/Test.*greens/);
    expect(rangeHole({ ...spec, greens: GREENS.fast, wind: 25 })).toMatchObject({ greens: GREENS.fast, wind: 25 });
    expect(rangeHole(spec), 'and a hole that names none has none').not.toHaveProperty('wind');
    expect(rangeHole(spec)).not.toHaveProperty('greens');
  });

  it('puts a hazard where it says, in yards from the tee, across to the right and along the way: sand, water and a tree', () => {
    const spec: RangeSpec = {
      name: 'Test',
      par: 4,
      length: 240,
      hazards: [
        { kind: 'sand', along: 90, across: 21, radius: 7 },
        { kind: 'water', along: 150, across: -21, radius: 9 },
        { kind: 'tree', x: 30, y: 60 },
      ],
    };
    const h = rangeHole(spec),
      l = layoutOf(h.map);
    expect(lieAt(l, l.tee.x + 21, l.tee.y + 90), 'sand to the right').toBe(LIE.sand);
    expect(l.water[at(l, -21, 150)], 'water to the left').toBe(1);
    expect(l.water[at(l, 21, 150)], 'and none on the right').toBe(0);
    expect(l.trees.length).toBe(1);
    expect(tileAt(l, l.trees[0].x, l.trees[0].y)).toBe(at(l, 30, 60));
    expect(lieAt(l, l.trees[0].x, l.trees[0].y), 'a tree stands in the rough').toBe(LIE.rough);
    // a hole that names none draws none
    const bare = layoutOf(rangeHole({ ...spec, hazards: [] }).map);
    expect(bare.sand.every((s) => s === 0) && bare.water.every((w) => w === 0) && bare.trees.length === 0).toBe(true);
    expect(wayThrough(l)).toBe(true);
    expect(rangeHole(spec), 'the same every time').toEqual(h);
  });

  it('bends a hole where it says, the way of play turning right by the bend at the share of the way', () => {
    const spec: RangeSpec = { name: 'Test', par: 4, length: 300, bend: 40, corner: 0.5 };
    const l = layoutOf(rangeHole(spec).map);
    const a = 150,
      b = 150,
      t = (40 * Math.PI) / 180;
    expect(Math.abs(dist(l) - Math.hypot(a * Math.sin(0) + b * Math.sin(t), a + b * Math.cos(t)))).toBeLessThanOrEqual(
      TILE,
    );
    expect(l.cup.x, 'the cup is to the right of the tee').toBeGreaterThan(l.tee.x + 50);
    const left = layoutOf(rangeHole({ ...spec, bend: -40 }).map);
    expect(left.cup.x, 'and to the left for a bend the other way').toBeLessThan(left.tee.x - 50);
    expect(wayThrough(l)).toBe(true);
    // fairway down the first leg and out along the second
    expect(lieAt(l, l.tee.x, l.tee.y + 60)).toBe(LIE.fairway);
    expect(l.golf, 'and legal to the physics, which layoutOf checks').toBe(true);
  });

  it('is the old three exactly where a spec names nothing new, whatever a bend’s default is', () => {
    const spec: RangeSpec = { name: 'Test', par: 4, length: 175, bunker: true };
    expect(rangeHole({ ...spec, bend: 0 }).map).toEqual(rangeHole(spec).map);
    expect(rangeHole({ ...spec, hazards: [] }).map).toEqual(rangeHole(spec).map);
  });

  it('has the six holes after the three, each as long as it is called and with what it is for: the hazard in its place', () => {
    const six = RANGE.slice(3);
    const lengths = [135, 315, 150, 165, 345, 600];
    six.forEach((hole, k) => {
      const l = layoutOf(hole.map);
      expect(l.golf, hole.name).toBe(true);
      expect(lieAt(l, l.tee.x, l.tee.y), hole.name).toBe(LIE.tee);
      expect(lieAt(l, l.cup.x, l.cup.y), hole.name).toBe(LIE.green);
      expect(wayThrough(l), `${hole.name}: a way from the tee to the cup`).toBe(true);
      // no hazard in the tee’s box or the cup’s tile, and nothing walls the cup in
      for (const [dx, dy] of [
        [0, 0],
        [1, 0],
        [-1, 0],
        [0, 1],
        [0, -1],
        [1, 1],
        [-1, -1],
        [1, -1],
        [-1, 1],
      ]) {
        const tt = tileAt(l, l.tee.x + dx * TILE, l.tee.y + dy * TILE);
        expect(l.sand[tt] + l.water[tt], `${hole.name}: tee box`).toBe(0);
        const ct = tileAt(l, l.cup.x + dx * TILE, l.cup.y + dy * TILE);
        expect(l.water[ct], `${hole.name}: cup`).toBe(0);
      }
      const length = hole.name === 'The Corner' ? 0 : lengths[k];
      if (length) expect(Math.abs(dist(l) - length), hole.name).toBeLessThanOrEqual(TILE);
    });
    const sand = (i: number) => layoutOf(RANGE[i].map).sand.reduce((a, b) => a + b, 0);
    const water = (i: number) => layoutOf(RANGE[i].map).water.reduce((a, b) => a + b, 0);
    const trees = (i: number) => layoutOf(RANGE[i].map).trees.length;
    expect(sand(3), 'Sand Trap: three bunkers').toBeGreaterThan(30);
    expect(water(3)).toBe(0);
    expect(sand(4), 'Narrow Straits: two bunkers').toBeGreaterThan(20);
    expect(water(5), 'Over the Pond: a pond across the line').toBeGreaterThan(30);
    expect(sand(5)).toBe(0);
    expect(water(6) > 0 && sand(6) > 0, 'Gusty: a pond and a bunker').toBe(true);
    expect(trees(7), 'The Corner: six trees on the line').toBe(6);
    expect(sand(8) > 0 && water(8) > 0, 'The Long Road: bunkers and a pond at the green').toBe(true);
    for (const i of [0, 1, 2, 3, 4, 5, 6, 8]) expect(trees(i), RANGE[i].name).toBe(0);
  });

  it('makes the fairway of Narrow Straits narrower than the others and the corner of The Corner a bend to the right', () => {
    const fairway = (i: number) => {
      const l = layoutOf(RANGE[i].map);
      let n = 0;
      for (let x = l.originX; x < l.originX + l.cols * TILE; x += TILE)
        if (lieAt(l, x, l.tee.y + 3 * TILE * 10) === LIE.fairway) n++;
      return n;
    };
    expect(fairway(4)).toBe(7);
    expect(fairway(2)).toBe(13);
    const corner = layoutOf(RANGE[7].map);
    expect(corner.cup.x - corner.tee.x, 'the cup is well to the right of the tee').toBeGreaterThan(60);
    expect(corner.cup.y - corner.tee.y, 'and a long way on').toBeGreaterThan(250);
  });

  it('has a wind on Gusty alone, eight miles an hour from the hole’s name, and a quicker green on The Long Road alone', () => {
    expect(RANGE.filter((h) => h.wind !== undefined).map((h) => [h.name, h.wind])).toEqual([['Gusty', 8]]);
    expect(RANGE.filter((h) => h.greens !== undefined).map((h) => [h.name, h.greens])).toEqual([
      ['The Long Road', 12.5],
    ]);
    expect(windDirection('Gusty')[0], 'it pushes to the right, as it was measured').toBeGreaterThan(0.9);
  });

  it('is golf all through and no other course is: a course’s flag is what its holes’ layouts say', () => {
    for (const c of COURSES)
      for (const h of c.holes) expect(layoutOf(h.map, h.terrain).golf, `${c.name}: ${h.name}`).toBe(c.golf === true);
  });

  it('is as long as each hole is called, tee to cup, in yards, within a tile', () => {
    for (const [hole, length] of [
      [RANGE[0], 105],
      [RANGE[1], 175],
      [RANGE[2], 330],
    ] as const)
      expect(Math.abs(dist(layoutOf(hole.map)) - length), hole.name).toBeLessThanOrEqual(TILE);
  });

  it('is teed on a tee and holed on a green, with a fairway between them, rough either side, and nothing else in the way', () => {
    for (const hole of RANGE.slice(0, 3)) {
      const l = layoutOf(hole.map);
      expect(lieAt(l, l.tee.x, l.tee.y), hole.name).toBe(LIE.tee);
      expect(lieAt(l, l.cup.x, l.cup.y)).toBe(LIE.green);
      // straight down the middle, a tile at a time from past the tee’s box to the green: fairway
      for (let y = l.tee.y + 3 * TILE; y < l.cup.y - 6 * TILE; y += TILE)
        expect(lieAt(l, l.tee.x, y), `${hole.name} at ${y}`).toBe(LIE.fairway);
      // and rough a long way to either side of it, before the rail
      expect(lieAt(l, l.tee.x + 10 * TILE, l.tee.y + 20 * TILE)).toBe(LIE.rough);
      expect(lieAt(l, l.tee.x - 10 * TILE, l.tee.y + 20 * TILE)).toBe(LIE.rough);
      expect(l.bumpers.length).toBe(0);
      expect(l.trees.length).toBe(0);
      if (THE_OLD_THREE.includes(hole.name)) expect(l.water.every((w) => w === 0)).toBe(true);
    }
  });

  it('has a bunker short of the green where it says so, and none where it does not', () => {
    const sand = (i: number) => layoutOf(RANGE[i].map).sand.reduce((a, b) => a + b, 0);
    expect(sand(0)).toBe(0);
    expect(sand(1)).toBeGreaterThan(6);
    expect(sand(2)).toBeGreaterThan(6);
  });

  it('keeps its rail far enough from the fairway that a drive scattered as far as a club may is not out of play', () => {
    const l = layoutOf(RANGE[2].map);
    // from the middle of the fairway to the nearest rail, in yards: past the driver’s widest miss at full carry
    const wall = (Math.min(l.tee.x - l.bounds.minX, l.bounds.maxX - l.tee.x) / 1) | 0;
    expect(wall).toBeGreaterThanOrEqual(45);
    expect(dist(l) * Math.tan((5 * Math.PI) / 180)).toBeLessThan(wall);
  });

  it('is made by rangeHole from a spec, a bunker or not, and is the same every time', () => {
    const a = rangeHole({ name: 'x', par: 3, length: 140, bunker: true }),
      b = rangeHole({ name: 'x', par: 3, length: 140, bunker: true });
    expect(a).toEqual(b);
    expect(layoutOf(a.map).golf).toBe(true);
    expect(rangeHole({ name: 'x', par: 3, length: 140 }).map).not.toEqual(a.map);
  });
});
