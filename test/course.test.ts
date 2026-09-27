/** The holes as content: every map makes a hole that can be played, and a layout says where everything is. */
import { describe, expect, it } from 'vitest';
import { TILE, layoutOf, onFloor } from '../src/arena';
import { COURSE, CUP } from '../src/course';

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

  it('refuses grass on the edge of the map, where the ball could leave the world', () => {
    expect(() => layoutOf(['.C.', '#T#', '###'])).toThrow(/edge/);
  });
});

describe('the course', () => {
  it('has holes, each with a par, a cup the ball fits, and grass the whole way from the tee to the cup', () => {
    expect(COURSE.length).toBeGreaterThanOrEqual(2);
    expect(CUP.radius).toBeGreaterThan(1);
    for (const hole of COURSE) {
      const l = layoutOf(hole.map);
      expect(hole.par, hole.name).toBeGreaterThanOrEqual(2);
      expect(hole.par, hole.name).toBeLessThanOrEqual(5);
      // a flood from the tee over the grass reaches the cup
      const seen = new Set<number>();
      const tile = (x: number, y: number) =>
        Math.floor((y - l.originY) / TILE) * l.cols + Math.floor((x - l.originX) / TILE);
      const queue = [tile(l.tee.x, l.tee.y)];
      while (queue.length) {
        const t = queue.pop()!;
        if (seen.has(t) || l.solid[t]) continue;
        seen.add(t);
        queue.push(t + 1, t - 1, t + l.cols, t - l.cols);
      }
      expect(seen.has(tile(l.cup.x, l.cup.y)), `${hole.name}: the cup can be reached`).toBe(true);
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
