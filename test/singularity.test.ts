/**
 * The Singularity, the hard course of the Future: nine long holes, narrow fairways, the fastest greens, the strongest winds, and
 * a lake of quicksilver with an island on every hole, one of them an island green. What is held here is every count the course
 * was asked for, exactly, on the holes as they are made, since a seed chosen by playing is where a count slips: a lake that
 * was refused for a seed and a pond put in its place, an island dropped, a second island green. Without these a hole could lose
 * its lake to a respec and still be a pleasant hole, and nothing would say that the course had stopped being the one that was
 * asked for. How it plays is `test/future-pace.test.ts`'s, and what every Future course shares is `test/future-course.ts`'s.
 */
import { describe, expect, it } from 'vitest';
import { TILE, layoutOf, lieAt } from '../src/arena';
import { CHROME_SPECS } from '../src/chrome';
import { golfHole } from '../src/golf';
import { NEON_PARK_SPECS } from '../src/neonpark';
import { SINGULARITY_SPECS, SINGULARITY_SUMMARY, singularity } from '../src/singularity';
import { checkInvariants } from '../src/invariants';
import { GREENS, LIE } from '../src/surfaces';
import { DT, golfGame } from './helpers';
import { LAKE_TILES, mirror, sharedChecks } from './future-course';

const holes = singularity();
const layouts = holes.map((h) => layoutOf(h.map, h.terrain, undefined, 'future'));

describe('The Singularity', () => {
  sharedChecks({
    title: 'The Singularity',
    specs: SINGULARITY_SPECS,
    others: [...NEON_PARK_SPECS, ...CHROME_SPECS],
    holes: singularity,
  });

  it('is nine holes, a par three, four or five each, that add to thirty-eight: 4, 4, 5, 4, 5, 3, 5, 4, 4', () => {
    expect(SINGULARITY_SPECS.length).toBe(9);
    expect(holes.map((h) => h.par)).toEqual([4, 4, 5, 4, 5, 3, 5, 4, 4]);
    expect(holes.map((h) => h.par)).toEqual(SINGULARITY_SPECS.map((s) => s.par));
    expect(SINGULARITY_SUMMARY).toEqual({ holes: 9, par: 38 });
  });

  it('is long: the fours 480 to 500 yards, the threes as long as 235, the fives 600 to 660', () => {
    expect(SINGULARITY_SPECS.map((s) => s.length)).toEqual([480, 480, 640, 480, 660, 235, 600, 500, 500]);
    for (const s of SINGULARITY_SPECS) {
      const [least, most] = { 3: [220, 240], 4: [480, 500], 5: [600, 660] }[s.par as 3 | 4 | 5];
      expect(s.length, s.name).toBeGreaterThanOrEqual(least);
      expect(s.length, s.name).toBeLessThanOrEqual(most);
    }
  });

  it('has narrow fairways, eight to ten tiles', () => {
    expect(SINGULARITY_SPECS.map((s) => s.width)).toEqual([8, 9, 9, 9, 8, 9, 10, 8, 9]);
    for (const s of SINGULARITY_SPECS) {
      expect(s.width, s.name).toBeGreaterThanOrEqual(8);
      expect(s.width, s.name).toBeLessThanOrEqual(11);
    }
  });

  it('has a lake of quicksilver on every hole, none of them a pond: nine lakes, each over a hundred and twenty tiles, with an island or two', () => {
    expect(SINGULARITY_SPECS.map((s) => s.lakes?.length)).toEqual([1, 1, 1, 1, 1, 1, 1, 1, 1]);
    for (const [i, s] of SINGULARITY_SPECS.entries()) {
      expect(s.ponds, s.name).toEqual([]);
      expect(mirror(layouts[i]), s.name).toBeGreaterThanOrEqual(LAKE_TILES);
      expect(s.lakes![0].islands.length, s.name).toBeGreaterThanOrEqual(1);
      expect(s.lakes![0].carry ?? 45, s.name).toBeGreaterThanOrEqual(42);
    }
    // one island each, and a pair on the last hole
    expect(SINGULARITY_SPECS.map((s) => s.lakes![0].islands.length)).toEqual([1, 1, 1, 1, 1, 1, 1, 1, 2]);
    expect(layouts.map(mirror)).toEqual(MIRROR);
  });

  it('has one island green, Dead Pixel’s, and no other: the cup and its apron are all the land in a lake round it', () => {
    const round = SINGULARITY_SPECS.filter((s) => s.lakes?.some((l) => l.at === 'green'));
    expect(round.map((s) => s.name)).toEqual(['Dead Pixel']);
    expect(round[0].lakes![0].islands).toEqual([{ kind: 'green', radius: 7 }]);
    for (const s of SINGULARITY_SPECS)
      if (s !== round[0]) for (const l of s.lakes!) expect(l.at, s.name).not.toBe('green');
  });

  it('has seven doglegs of twenty to forty degrees, both ways, and straight the island green and the par three; no gap through a wood', () => {
    expect(SINGULARITY_SPECS.map((s) => s.bend)).toEqual([20, 0, -20, -40, 25, 0, 30, -20, 25]);
    for (const s of SINGULARITY_SPECS) {
      expect(Math.abs(s.bend), s.name).toBeLessThanOrEqual(40);
      expect(s.gap, s.name).toBeUndefined();
    }
    expect(SINGULARITY_SPECS.filter((s) => s.bend === 0).map((s) => s.name)).toEqual(['Dead Pixel', 'Zero Day']);
    expect(SINGULARITY_SPECS.filter((s) => s.bend > 0).length).toBe(4);
    expect(SINGULARITY_SPECS.filter((s) => s.bend < 0).length).toBe(3);
  });

  it('has the strongest winds of the three courses, twelve to fifteen miles an hour', () => {
    expect(SINGULARITY_SPECS.map((s) => s.wind)).toEqual([15, 13, 14, 13, 15, 14, 12, 14, 15]);
    for (const s of SINGULARITY_SPECS) {
      expect(s.wind!, s.name).toBeGreaterThanOrEqual(12);
      expect(s.wind!, s.name).toBeLessThanOrEqual(15);
    }
    expect(holes.map((h) => h.wind)).toEqual(SINGULARITY_SPECS.map((s) => s.wind));
  });

  it('has the fastest greens there are, every contour at its most, and holograms in groves', () => {
    for (const s of SINGULARITY_SPECS) {
      expect(s.greens, s.name).toBe(GREENS.fast);
      expect(s.contour, s.name).toBe(1);
      expect(s.woods, s.name).toBeUndefined();
    }
    expect(holes.map((h) => h.greens)).toEqual(SINGULARITY_SPECS.map((s) => s.greens));
    expect(layouts.map((l) => l.trees.length)).toEqual(SINGULARITY_SPECS.map((s) => s.trees));
    expect(SINGULARITY_SPECS.map((s) => s.trees)).toEqual([100, 60, 100, 80, 100, 60, 50, 100, 100]);
  });

  it('has the bunkers it was given: four along the fairway and four at the green on every hole but the island green’s, which has its own', () => {
    for (const s of SINGULARITY_SPECS) {
      if (s.name === 'Dead Pixel') expect(s.bunkers).toEqual({ fairway: 0, green: 0 });
      else if (s.par === 3) expect(s.bunkers).toEqual({ fairway: 0, green: 4 });
      else expect(s.bunkers).toEqual({ fairway: 4, green: 4 });
    }
  });

  it('has a mirror beside the green on the island: a ball putted off the edge of it is lost, costs a stroke and is put back on the green', () => {
    const i = SINGULARITY_SPECS.findIndex((s) => s.name === 'Dead Pixel');
    const l = layouts[i];
    // the water tile nearest the cup, and the way to it from the cup
    let wet = { x: 0, y: 0 };
    let near = Infinity;
    for (let t = 0; t < l.cols * l.rows; t++) {
      if (!l.water[t] || l.solid[t]) continue;
      const x = l.originX + ((t % l.cols) + 0.5) * TILE,
        y = l.originY + (Math.floor(t / l.cols) + 0.5) * TILE;
      const d = Math.hypot(x - l.cup.x, y - l.cup.y);
      if (d < near) {
        near = d;
        wet = { x, y };
      }
    }
    expect(near, 'the mirror lies within the green’s apron of the cup').toBeLessThan(10 * TILE);
    const toward = Math.atan2(wet.y - l.cup.y, wet.x - l.cup.x);
    // a place on the green on that side, as near the water as a ball can be put down, and then putted at it
    let from: { x: number; y: number } | null = null;
    for (let d = near - 1.5; d > 4 && !from; d -= 0.5) {
      const x = l.cup.x + Math.cos(toward) * d,
        y = l.cup.y + Math.sin(toward) * d;
      if (lieAt(l, x, y) !== LIE.green) continue;
      try {
        golfGame(holes[i]).game.place(x, y);
        from = { x, y };
      } catch {
        // not level grass: a place nearer the cup
      }
    }
    expect(from, 'a place to stand on the island').not.toBeNull();
    const { game, calls } = golfGame(holes[i]);
    game.place(from!.x, from!.y);
    for (let f = 0; f < 30; f++) game.step(DT);
    const lie = { x: game.world.x[game.ball], y: game.world.y[game.ball] };
    game.pick('putter');
    expect(game.shoot(toward, 1)).toBe(true);
    for (let f = 0; f < 60 * 30 && !game.ready && game.phase !== 'over'; f++) game.step(DT);
    for (let f = 0; f < 30; f++) game.step(DT);
    expect(
      calls.some(([n]) => n === 'splash'),
      'the ball was lost to the mirror',
    ).toBe(true);
    expect(game.strokes, 'the stroke and its penalty').toBe(2);
    expect(game.world.x[game.ball]).toBeCloseTo(lie.x, 1);
    expect(game.world.y[game.ball]).toBeCloseTo(lie.y, 1);
    expect(lieAt(l, game.world.x[game.ball], game.world.y[game.ball]), 'put back on the green').toBe(LIE.green);
    expect(checkInvariants(game)).toEqual([]);
  });

  it('makes the same hole twice from the same spec', () => {
    for (const [i, s] of SINGULARITY_SPECS.entries()) expect(golfHole(s).map, s.name).toEqual(holes[i].map);
  });
});

/** The tiles of quicksilver on each hole as the generator laid them, from the seeds in the table. */
const MIRROR = [463, 445, 620, 492, 522, 512, 485, 616, 445];
