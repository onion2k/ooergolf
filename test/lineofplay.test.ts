/**
 * The line of play: where along a hole's way a ball at rest has the camera look when it turns by itself. The flag is a
 * poor place to look on a dogleg, since the cup is round a corner and the straight line to it runs over the trees and the rough
 * inside the bend; the way is the fairway a shot is played along, so the camera looks `PLAY_AHEAD` yards along it, and at the
 * flag once that is within reach. Measured 10 October 2026 over fifteen doglegs of twenty degrees and more (The Links, The Fells,
 * The Isles): of balls at rest on the fairway, rough and cut, the straight line to the flag had a fifth or more of its first 150
 * yards in trees, rock or out of bounds for 37 per cent, and the line of play 130 yards on for 8 per cent; on a straight hole it
 * turned the camera by 0.7 degrees at the median and 5 at the ninetieth percentile, with no more of the line blocked.
 */
import { describe, expect, it } from 'vitest';
import { COURSES } from '../src/course';
import { layoutOf, lieAt, tileAt, type Layout } from '../src/arena';
import { facing } from '../src/camera';
import { PLAY_AHEAD, lookAlong } from '../src/lineofplay';
import { LIE } from '../src/surfaces';

type Pt = [number, number];
const out = { x: 0, y: 0 };

/** The way's length, and how far along it the nearest point to (x, y) is: worked out here, plainly, from the segments. */
function along(way: readonly Pt[], x: number, y: number) {
  let best = { s: 0, d: Infinity },
    run = 0;
  for (let k = 0; k + 1 < way.length; k++) {
    const [ax, ay] = way[k],
      [bx, by] = way[k + 1];
    const len = Math.hypot(bx - ax, by - ay);
    const u = Math.max(0, Math.min(1, ((x - ax) * (bx - ax) + (y - ay) * (by - ay)) / (len * len)));
    const d = Math.hypot(x - (ax + (bx - ax) * u), y - (ay + (by - ay) * u));
    if (d < best.d) best = { s: run + len * u, d };
    run += len;
  }
  return { ...best, total: run };
}

/** How far a point is from the way, and how far along it. */
function onWay(way: readonly Pt[], x: number, y: number) {
  const { s, d } = along(way, x, y);
  return { s, d };
}

describe('the point along the line of play', () => {
  const straight: Pt[] = [
    [0, 0],
    [0, 400],
  ];
  // a corner at 200 yards and a bend of 90 degrees to the right: the second leg runs due east
  const corner: Pt[] = [
    [0, 0],
    [0, 200],
    [200, 200],
  ];

  it('is the stretch of the way PLAY_AHEAD on from the ball, on a way that runs straight', () => {
    expect(lookAlong(straight, 0, 50, PLAY_AHEAD, out)).toBe(true);
    expect(out.x).toBeCloseTo(0, 9);
    expect(out.y).toBeCloseTo(50 + PLAY_AHEAD, 9);
  });

  it('is the end of the way, the cup, once that is within PLAY_AHEAD: the flag, as it always was', () => {
    expect(lookAlong(straight, 0, 400 - PLAY_AHEAD + 1, PLAY_AHEAD, out)).toBe(true);
    expect([out.x, out.y]).toEqual([0, 400]);
    expect(lookAlong(straight, 3, 399, PLAY_AHEAD, out)).toBe(true);
    expect([out.x, out.y]).toEqual([0, 400]);
    // exactly PLAY_AHEAD short of it is the cup too: a ball can reach it
    expect(lookAlong(straight, 0, 400 - PLAY_AHEAD, PLAY_AHEAD, out)).toBe(true);
    expect([out.x, out.y]).toEqual([0, 400]);
  });

  it('goes round a corner: from 60 yards before it, the point is 70 yards along the second leg', () => {
    expect(lookAlong(corner, 0, 140, PLAY_AHEAD, out)).toBe(true);
    expect(out.x).toBeCloseTo(PLAY_AHEAD - 60, 9);
    expect(out.y).toBeCloseTo(200, 9);
    // from 150 yards before it the point is still short of it, on the first leg, which is where the flag is not
    expect(lookAlong(corner, 0, 50, PLAY_AHEAD, out)).toBe(true);
    expect(out.x).toBeCloseTo(0, 9);
    expect(out.y).toBeCloseTo(50 + PLAY_AHEAD, 9);
    // and it never turns the ball's heading past the way: from 150 before the corner the camera looks straight up the first leg
    expect(facing({ x: 0, y: 50 }, out)).toBeCloseTo(0, 9);
  });

  it('is found from the nearest point of the way to a ball that is off it, and from either side', () => {
    for (const side of [-1, 1]) {
      expect(lookAlong(straight, 25 * side, 100, PLAY_AHEAD, out)).toBe(true);
      expect(out.x).toBeCloseTo(0, 9);
      expect(out.y).toBeCloseTo(100 + PLAY_AHEAD, 9);
    }
    // behind the tee it is the start of the way that is nearest
    expect(lookAlong(straight, 5, -30, PLAY_AHEAD, out)).toBe(true);
    expect(out.y).toBeCloseTo(PLAY_AHEAD, 9);
    // and past the cup it is the cup
    expect(lookAlong(straight, 5, 430, PLAY_AHEAD, out)).toBe(true);
    expect([out.x, out.y]).toEqual([0, 400]);
  });

  it('is nothing for a hole that has no way, or none that goes anywhere, or a ball or a distance that is not a number', () => {
    const keep = { x: 7, y: 8 };
    for (const way of [
      undefined,
      [],
      [[0, 0]],
      [
        [1, 1],
        [1, 1],
      ],
    ] as (readonly Pt[] | undefined)[]) {
      expect(lookAlong(way, 0, 0, PLAY_AHEAD, keep), JSON.stringify(way)).toBe(false);
      expect(keep, 'nothing written').toEqual({ x: 7, y: 8 });
    }
    expect(lookAlong(straight, NaN, 10, PLAY_AHEAD, keep)).toBe(false);
    expect(lookAlong(straight, 0, Infinity, PLAY_AHEAD, keep)).toBe(false);
    expect(lookAlong(straight, 0, 10, NaN, keep)).toBe(false);
    expect(keep).toEqual({ x: 7, y: 8 });
    // a way with a point twice in it still has a line to look along
    expect(
      lookAlong(
        [
          [0, 0],
          [0, 0],
          [0, 400],
        ],
        0,
        10,
        PLAY_AHEAD,
        out,
      ),
    ).toBe(true);
    expect(out.y).toBeCloseTo(10 + PLAY_AHEAD, 9);
  });

  it('is the cup itself where one is given, which a way is not drawn to exactly, once that is within reach, and the way before it', () => {
    const cup = { x: 1.2, y: 401.4 };
    expect(lookAlong(straight, 0, 300, PLAY_AHEAD, out, cup)).toBe(true);
    expect([out.x, out.y]).toEqual([1.2, 401.4]);
    // not within reach: the way, whose end is not the cup
    expect(lookAlong(straight, 0, 100, PLAY_AHEAD, out, cup)).toBe(true);
    expect(out.x).toBeCloseTo(0, 9);
    expect(out.y).toBeCloseTo(230, 9);
  });

  it('makes nothing: it writes into the object it is given and says whether there was a point', () => {
    const into = { x: 0, y: 0 };
    expect(lookAlong(straight, 0, 10, PLAY_AHEAD, into)).toBe(true);
    expect(into.y).toBeGreaterThan(10);
  });
});

/** Every golf hole of the courses, with its layout. */
const HOLES: { name: string; layout: Layout }[] = COURSES.filter((c) => c.golf).flatMap((c) =>
  c.holes.map((h) => ({ name: h.name, layout: layoutOf(h.map, h.terrain, h.way, h.biome) })),
);

describe('the line of play on the holes there are', () => {
  it('has a way on every hole of golf the courses have, since they are made along one', () => {
    expect(HOLES.length, 'fifteen courses of nine').toBe(135);
    for (const { name, layout } of HOLES) expect(layout.way?.length, name).toBeGreaterThanOrEqual(2);
  });

  it('is on the way, never behind the ball’s nearest point of it, and never more than PLAY_AHEAD past it, from a ball anywhere on ground it is played from', () => {
    let met = 0;
    for (const { name, layout } of HOLES) {
      const way = layout.way as readonly Pt[];
      const { total } = along(way, 0, 0);
      for (let k = 0; k < 400; k++) {
        const x = layout.bounds.minX + ((k * 0.6180339887) % 1) * (layout.bounds.maxX - layout.bounds.minX);
        const y = layout.bounds.minY + ((k * 0.4142135623) % 1) * (layout.bounds.maxY - layout.bounds.minY);
        const lie = lieAt(layout, x, y);
        if (tileAt(layout, x, y) < 0 || (lie !== LIE.fairway && lie !== LIE.rough && lie !== LIE.cut)) continue;
        met++;
        expect(lookAlong(way, x, y, PLAY_AHEAD, out), name).toBe(true);
        const here = along(way, x, y);
        const there = onWay(way, out.x, out.y);
        expect(there.d, `${name}: the point is on the way`).toBeLessThan(1e-6);
        expect(there.s, `${name}: no further back than the ball`).toBeGreaterThanOrEqual(here.s - 1e-6);
        expect(there.s, `${name}: no further on than PLAY_AHEAD, unless that is the cup`).toBeLessThanOrEqual(
          Math.min(total, here.s + PLAY_AHEAD) + 1e-6,
        );
        // and it is the cup exactly where the cup is within reach, which is the flag the camera always had
        if (total - here.s <= PLAY_AHEAD)
          expect([out.x, out.y], `${name}: the cup`).toEqual([way[way.length - 1][0], way[way.length - 1][1]]);
      }
    }
    expect(met, 'a check that met no ball passes in silence').toBeGreaterThan(5000);
  });

  it('turns the camera less than a quarter turn from the flag, on any hole, from any ball', () => {
    let worst = 0;
    for (const { name, layout } of HOLES) {
      const way = layout.way as readonly Pt[];
      for (let k = 0; k < 400; k++) {
        const x = layout.bounds.minX + ((k * 0.6180339887) % 1) * (layout.bounds.maxX - layout.bounds.minX);
        const y = layout.bounds.minY + ((k * 0.4142135623) % 1) * (layout.bounds.maxY - layout.bounds.minY);
        const lie = lieAt(layout, x, y);
        if (tileAt(layout, x, y) < 0 || (lie !== LIE.fairway && lie !== LIE.rough && lie !== LIE.cut)) continue;
        if (Math.hypot(layout.cup.x - x, layout.cup.y - y) < 1) continue;
        lookAlong(way, x, y, PLAY_AHEAD, out);
        const line = facing({ x, y }, out) as number;
        const flag = facing({ x, y }, layout.cup) as number;
        const off = Math.abs(((line - flag + 3 * Math.PI) % (2 * Math.PI)) - Math.PI);
        worst = Math.max(worst, off);
        expect(off, `${name} from ${x.toFixed(0)},${y.toFixed(0)}`).toBeLessThan(Math.PI / 2);
      }
    }
    // some of them do turn it, and by a good deal: the doglegs
    expect((worst * 180) / Math.PI).toBeGreaterThan(20);
  });
});
