/** The holes as content: every map makes a hole that can be played, and a layout says where everything is. */
import { describe, expect, it } from 'vitest';
import { BALL, BOTTOM, KIND_RADIUS, STEP, TILE, WATER_FLOOR, layoutOf, onFloor } from '../src/arena';
import { COURSE, COURSES, CUP } from '../src/course';

describe('a hole from its map', () => {
  const map = ['#####', '#.C.#', '#...#', '#.T.#', '#####'];

  it('puts the tee and the cup in the middle of their tiles, the first row being the far end', () => {
    const l = layoutOf(map);
    expect([l.cols, l.rows]).toEqual([5, 5]);
    expect(l.cup.y).toBeGreaterThan(l.tee.y);
    expect(l.cup.y - l.tee.y).toBeCloseTo(2 * TILE, 9);
    expect(l.tee.x).toBeCloseTo(l.cup.x, 9);
    expect(onFloor(l, l.tee.x, l.tee.y)).toBe(true);
    expect(onFloor(l, l.originX + 1, l.originY + 1), 'the rail').toBe(false);
  });

  it('makes rail and the void outside it both solid, and tells them apart for drawing', () => {
    const l = layoutOf(['  ###', '  #C#', '###.#', '#T..#', '#####']);
    const at = (tx: number, ty: number) => ty * l.cols + tx;
    // the top-left corner is void: solid to the ball, drawn as the rough and not as rail
    expect(l.solid[at(0, 4)]).toBe(1);
    expect(l.rail[at(0, 4)]).toBe(0);
    expect(l.solid[at(2, 4)]).toBe(1);
    expect(l.rail[at(2, 4)]).toBe(1);
    expect(l.solid[at(1, 1)]).toBe(0);
  });

  it('pads short rows, and refuses a map without exactly one tee and one cup', () => {
    expect(layoutOf(['###', '#C#', '#T#', '##']).cols).toBe(3);
    expect(() => layoutOf(['###', '#.#', '#T#', '###'])).toThrow(/cup/);
    expect(() => layoutOf(['###', '#C#', '#.#', '###'])).toThrow(/tee/);
    expect(() => layoutOf(['#####', '#CTT#', '#####'])).toThrow(/tee/);
    expect(() => layoutOf(['#####', '#x.C#', '#T..#', '#####'])).toThrow(/x/);
  });

  it('reads water as a floor far below, and a digit as grass raised a step a digit', () => {
    const l = layoutOf(['#######', '#..C..#', '#.123.#', '#~~.~~#', '#..T..#', '#######']);
    const at = (tx: number, ty: number) => ty * l.cols + tx;
    expect(l.floor[at(3, 1)], 'the tee').toBe(0);
    expect(l.floor[at(2, 3)]).toBeCloseTo(STEP, 5);
    expect(l.floor[at(4, 3)]).toBeCloseTo(3 * STEP, 5);
    expect(l.water[at(1, 2)]).toBe(1);
    expect(l.floor[at(1, 2)]).toBe(WATER_FLOOR);
    expect(l.solid[at(1, 2)], 'water is not rock: the ball rolls onto it, and falls').toBe(0);
    expect(l.water[at(3, 2)]).toBe(0);
    expect(onFloor(l, l.tee.x, l.tee.y)).toBe(true);
    expect(onFloor(l, l.originX + 1.5 * TILE, l.originY + 2.5 * TILE), 'water is not grass to stand on').toBe(false);
    expect(WATER_FLOOR).toBeLessThan(BOTTOM);
  });

  it('reads sand as level ground the ball rolls on, and a post as one standing in the middle of its tile', () => {
    const l = layoutOf(['#######', '#..C..#', '#.sso.#', '#..T..#', '#######']);
    const at = (tx: number, ty: number) => ty * l.cols + tx;
    expect(l.sand[at(2, 2)]).toBe(1);
    expect(l.sand[at(3, 2)]).toBe(1);
    expect(l.sand[at(1, 2)], 'grass').toBe(0);
    expect(l.solid[at(2, 2)], 'played on').toBe(0);
    expect(l.floor[at(2, 2)], 'level').toBe(0);
    expect(l.water[at(2, 2)]).toBe(0);
    expect(l.bumpers).toEqual([{ x: l.originX + 4.5 * TILE, y: l.originY + 2.5 * TILE }]);
    // a post stands on grass, which is not sand and not solid
    expect(l.solid[at(4, 2)]).toBe(0);
    expect(l.sand[at(4, 2)]).toBe(0);
  });

  it('refuses grass on the edge of the map, where the ball could leave the world', () => {
    expect(() => layoutOf(['.C.', '#T#', '###'])).toThrow(/edge/);
  });
});

describe('the course', () => {
  it('has holes, each with a par, a cup the ball fits, and grass the whole way from the tee to the cup, on every course', () => {
    expect(COURSE.length).toBeGreaterThanOrEqual(2);
    expect(CUP.radius).toBeGreaterThan(1);
    for (const hole of COURSES.flatMap((c) => c.holes)) {
      const l = layoutOf(hole.map, hole.terrain);
      expect(hole.par, hole.name).toBeGreaterThanOrEqual(2);
      expect(hole.par, hole.name).toBeLessThanOrEqual(5);
      // the cup sits on level grass, where its lining, collar and flag are drawn; the physics could cut it higher
      const cupTile = Math.floor((l.cup.y - l.originY) / TILE) * l.cols + Math.floor((l.cup.x - l.originX) / TILE);
      expect(l.floor[cupTile], `${hole.name}: the cup on level grass`).toBe(0);
      // a flood from the tee over the grass reaches the cup
      const seen = new Set<number>();
      const tile = (x: number, y: number) =>
        Math.floor((y - l.originY) / TILE) * l.cols + Math.floor((x - l.originX) / TILE);
      const queue = [tile(l.tee.x, l.tee.y)];
      while (queue.length) {
        const t = queue.pop()!;
        if (seen.has(t) || l.solid[t] || l.water[t]) continue;
        seen.add(t);
        queue.push(t + 1, t - 1, t + l.cols, t - l.cols);
      }
      expect(seen.has(tile(l.cup.x, l.cup.y)), `${hole.name}: the cup can be reached`).toBe(true);
      // a barrier never closes the gap to the rail at either end of its travel to less than the ball can pass
      for (const o of hole.obstacles ?? []) {
        if (o.kind !== 'barrier') continue;
        const y = l.originY + (l.rows - 1 - o.at[1] + 0.5) * TILE;
        const x = l.originX + (o.at[0] + 0.5) * TILE;
        const half = (o.length * TILE) / 2;
        for (const end of [-1, 1]) {
          const edge = x + end * (o.travel + half);
          let gap = 0;
          while (onFloor(l, edge + end * (gap + 0.05), y)) gap += 0.05;
          expect(gap, `${hole.name}: the barrier at ${o.at.join(',')}, ${end < 0 ? 'west' : 'east'}`).toBeGreaterThan(
            KIND_RADIUS[BALL] * 2 + 0.2,
          );
        }
      }
      // the cup is clear of the rail by more than its own width, so the ball can drop in from any side
      for (const [dx, dy] of [
        [1, 0],
        [-1, 0],
        [0, 1],
        [0, -1],
      ])
        expect(onFloor(l, l.cup.x + dx * (CUP.radius + 1), l.cup.y + dy * (CUP.radius + 1)), hole.name).toBe(true);
    }
  });
});
