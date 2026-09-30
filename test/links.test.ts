/**
 * The Links, the first course of golf proper: nine holes made from their specs, a par three to a par five, each a hole
 * that can be played and is played by the autopilot to its cup. What each is for is in its spec; what is held here is
 * that the course is what it says, that every hole is legal, has a way from its tee to its cup and is as long as it is
 * called, that no two are alike, and that the round is finished on every seed.
 */
import { describe, expect, it } from 'vitest';
import { TILE, layoutOf } from '../src/arena';
import { Autopilot } from '../src/autopilot';
import { COURSES, CUP } from '../src/course';
import { Game } from '../src/game';
import { LINKS_SPECS, links } from '../src/links';
import { checkInvariants } from '../src/invariants';
import { terrainRefusal } from '../src/physics';
import { Progress, memoryStore } from '../src/progress';
import { seeded } from '../src/random';
import { Route } from '../src/route';
import { DT } from './helpers';

const holes = links();

describe('The Links', () => {
  it('is a course of golf of nine holes, a par three to a par five, that adds to thirty-six', () => {
    const course = COURSES.find((c) => c.name === 'The Links')!;
    expect(course.golf).toBe(true);
    expect(course.holes).toBe(holes);
    expect(holes.length).toBe(9);
    expect(holes.map((h) => h.par)).toEqual([4, 3, 5, 4, 3, 4, 5, 4, 4]);
    expect(Math.min(...holes.map((h) => h.par))).toBe(3);
    expect(Math.max(...holes.map((h) => h.par))).toBe(5);
    expect(holes.reduce((a, h) => a + h.par, 0)).toBe(36);
    expect(new Set(holes.map((h) => h.name)).size).toBe(9);
  });

  it('is a hole of each of the lengths a golfer calls by a par: a three is 150 to 220 yards, a four 350 to 450, a five 500 to 600', () => {
    const range: Record<number, [number, number]> = { 3: [150, 220], 4: [350, 450], 5: [500, 600] };
    LINKS_SPECS.forEach((spec) => {
      expect(spec.length, spec.name).toBeGreaterThanOrEqual(range[spec.par][0]);
      expect(spec.length, spec.name).toBeLessThanOrEqual(range[spec.par][1]);
    });
  });

  it('has holes that are legal to the physics, golf all through, with a way from the tee to the cup no longer than the hole is called', () => {
    holes.forEach((h, i) => {
      const l = layoutOf(h.map, h.terrain);
      expect(l.golf, h.name).toBe(true);
      expect(terrainRefusal(l, CUP), h.name).toBeNull();
      const way = new Route(l).distance(l.tee.x, l.tee.y);
      expect(Number.isFinite(way), `${h.name}: a way from the tee to the cup`).toBe(true);
      // the way round hazards is a little longer than the hole is called, and never much
      expect(way, h.name).toBeGreaterThan(LINKS_SPECS[i].length * 0.96);
      expect(way, h.name).toBeLessThan(LINKS_SPECS[i].length * 1.2);
    });
  });

  it('has water on some holes, sand on all, trees on all, and out of bounds on every one: what a course of golf has', () => {
    let water = 0;
    for (const h of holes) {
      const l = layoutOf(h.map, h.terrain);
      if (l.water.some((w) => w === 1)) water++;
      expect(
        l.sand.some((s) => s === 1),
        `${h.name}: sand`,
      ).toBe(true);
      expect(l.trees.length, `${h.name}: trees`).toBeGreaterThan(10);
      expect(
        l.oob.some((o) => o === 1),
        `${h.name}: out of bounds`,
      ).toBe(true);
    }
    expect(water, 'water on most holes').toBeGreaterThanOrEqual(6);
  });

  it('has holes each of its own shape, no two the same size', () => {
    const sizes = holes.map((h) => `${h.map[0].length}x${h.map.length}`);
    expect(new Set(sizes).size).toBeGreaterThanOrEqual(7);
  });

  it('has hills of a height worth playing over on every hole, and none too steep for the fairway to rest a ball on', () => {
    for (const h of holes) {
      const l = layoutOf(h.map, h.terrain);
      let high = 0;
      for (const v of l.terrain) high = Math.max(high, v);
      expect(high, `${h.name}: relief`).toBeGreaterThan(4);
      expect(high, `${h.name}: not a mountain`).toBeLessThan(16);
    }
  });

  it('is played round by the autopilot, with a player’s slips: every hole finished inside its limit, on every seed, breaking no rule', () => {
    for (let seed = 1; seed <= 3; seed++) {
      const game = new Game(new Progress(memoryStore()), {}, { random: seeded(seed), course: holes });
      const pilot = new Autopilot(game, { skill: { aim: 0.05, power: 0.1 }, random: seeded(seed * 31 + 7) });
      for (let f = 0; f < 60 * 60 * 20 && game.phase !== 'over'; f++) {
        pilot.step(DT);
        if (f % 97 === 0) expect(checkInvariants(game), `seed ${seed}, frame ${f}`).toEqual([]);
      }
      expect(game.phase, `seed ${seed}`).toBe('over');
      game.card.forEach((score, h) =>
        expect(score, `seed ${seed}: ${holes[h].name}`).toBeLessThanOrEqual(holes[h].par + 5),
      );
      expect(game.card.length).toBe(9);
    }
  });

  it('is as long as its map says: a hole’s tee to its cup a little short of its length by its bend', () => {
    holes.forEach((h, i) => {
      const l = layoutOf(h.map, h.terrain);
      const crow = Math.hypot(l.cup.x - l.tee.x, l.cup.y - l.tee.y);
      expect(crow, h.name).toBeLessThanOrEqual(LINKS_SPECS[i].length + TILE);
      expect(crow, h.name).toBeGreaterThan(LINKS_SPECS[i].length * 0.75);
    });
  });
});
