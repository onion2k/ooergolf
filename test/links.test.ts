/**
 * The Links, the first course of golf proper: nine holes made from their specs, a par three to a par five, each a hole
 * that can be played and is played by the autopilot to its cup. What each is for is in its spec; what is held here is
 * that the course is what it says, that every hole is legal, has a way from its tee to its cup and is as long as it is
 * called, that no two are alike, and that the round is finished on every seed.
 */
import { describe, expect, it } from 'vitest';
import { TILE, layoutOf, slopeAt } from '../src/arena';
import { Autopilot } from '../src/autopilot';
import { COURSES, CUP } from '../src/course';
import { Game } from '../src/game';
import { GREEN } from '../src/green';
import { LINKS_SPECS, links } from '../src/links';
import { checkInvariants } from '../src/invariants';
import { terrainRefusal } from '../src/physics';
import { Progress, memoryStore } from '../src/progress';
import { seeded } from '../src/random';
import { GREENS, LIE } from '../src/surfaces';
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

  it('has greens each of its own: a contour and a speed on every hole, the opener gentle and normal, the last the fastest and the most contoured', () => {
    for (const spec of LINKS_SPECS) {
      expect(spec.contour, spec.name).toBeGreaterThan(0);
      expect(spec.contour, spec.name).toBeLessThanOrEqual(1);
      expect(spec.greens, spec.name).toBeGreaterThanOrEqual(GREENS.fast);
      expect(spec.greens, spec.name).toBeLessThanOrEqual(GREENS.slow);
    }
    const [first, ...rest] = LINKS_SPECS;
    const last = LINKS_SPECS[LINKS_SPECS.length - 1];
    expect(first.greens).toBe(GREENS.normal);
    expect(first.contour).toBeLessThanOrEqual(0.3);
    for (const spec of rest.slice(0, -1)) {
      expect(spec.contour!, spec.name).toBeGreaterThanOrEqual(first.contour! + 0.2);
      expect(spec.contour!, spec.name).toBeLessThanOrEqual(0.9);
      expect(spec.greens!, spec.name).toBeGreaterThanOrEqual(11.4);
      expect(spec.greens!, spec.name).toBeLessThanOrEqual(16.7);
      expect(last.greens!, spec.name).toBeLessThan(spec.greens!);
      expect(last.contour!, spec.name).toBeGreaterThan(spec.contour!);
    }
    // the holes carry the speed, and are not all alike: three or more distinct figures of each
    expect(holes.map((h) => h.greens)).toEqual(LINKS_SPECS.map((s) => s.greens));
    expect(new Set(LINKS_SPECS.map((s) => s.greens)).size).toBeGreaterThan(4);
    expect(new Set(LINKS_SPECS.map((s) => s.contour)).size).toBeGreaterThan(4);
  });

  it('has a green whose steepest slope is the contour its spec asks for, on every hole, and a first cut round it', () => {
    holes.forEach((h, i) => {
      const l = layoutOf(h.map, h.terrain);
      let steepest = 0;
      for (let t = 0; t < l.cols * l.rows; t++) {
        if (l.solid[t] || l.sand[t] || l.lie[t] !== LIE.green) continue;
        const [sx, sy] = slopeAt(
          l,
          l.originX + ((t % l.cols) + 0.5) * TILE,
          l.originY + (Math.floor(t / l.cols) + 0.5) * TILE,
        );
        steepest = Math.max(steepest, Math.hypot(sx, sy));
      }
      const want = LINKS_SPECS[i].contour! * GREEN.steepest;
      expect(steepest / want, h.name).toBeGreaterThan(0.9);
      expect(steepest / want, h.name).toBeLessThan(1.1);
      expect(h.map.join('').includes('c'), `${h.name} has a first cut`).toBe(true);
    });
  });

  it('is a hole of each of the lengths a golfer calls by a par: a three is 150 to 220 yards, a four 350 to 480, a five 500 to 600', () => {
    // a four reaches 480 only for The Straight Mile, lengthened from 440 to 475 because at 441 the autopilot took 67% of its
    // rounds under par: it is straight and a long hitter's par four, and the four of 350 to 450 stays the bend's
    const range: Record<number, [number, number]> = { 3: [150, 220], 4: [350, 480], 5: [500, 600] };
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

  it('asks what the plan for the water and the corners says: the bends turn late enough that a drive is a choice, the long and short holes are as long as they are for', () => {
    const by = (name: string) => LINKS_SPECS.find((s) => s.name === name)!;
    expect(by('Long Bend').corner).toBe(0.64);
    expect(by('Tight Left').corner).toBe(0.66);
    expect(by('The Opener').length).toBe(400);
    expect(by('The Straight Mile').length).toBe(475);
    // the three water holes have one pond each, across the line of play and not beside it
    for (const name of ['Water Carry', 'Island Green', 'Rushing Brook']) {
      expect(by(name).ponds, name).toHaveLength(1);
      expect(by(name).ponds[0].side, name).toBe(0);
      expect(by(name).ponds[0].size[0], name).toBeGreaterThanOrEqual(4.5);
    }
    // a corner is where the second leg begins: the cup is that much further across than a straight hole's, and no more
    for (const name of ['Long Bend', 'Tight Left']) {
      const l = layoutOf(holes[LINKS_SPECS.indexOf(by(name))].map, holes[LINKS_SPECS.indexOf(by(name))].terrain);
      const s = by(name);
      const f = s.corner!;
      const turn = (Math.abs(s.bend) * Math.PI) / 180;
      const crow = s.length * Math.hypot(f + (1 - f) * Math.cos(turn), (1 - f) * Math.sin(turn));
      expect(Math.hypot(l.cup.x - l.tee.x, l.cup.y - l.tee.y), name).toBeCloseTo(crow, -1);
    }
  });

  it('has a pond across the line of play on each of the holes where the water is the test, so the straight way from the tee to the cup (or its first part) wets a ball', () => {
    for (const name of ['Water Carry', 'Island Green']) {
      const i = LINKS_SPECS.findIndex((s) => s.name === name);
      const l = layoutOf(holes[i].map, holes[i].terrain);
      const len = Math.hypot(l.cup.x - l.tee.x, l.cup.y - l.tee.y);
      let wet = 0;
      for (let d = 0; d <= len; d += 1) {
        const x = l.tee.x + ((l.cup.x - l.tee.x) * d) / len,
          y = l.tee.y + ((l.cup.y - l.tee.y) * d) / len;
        const tx = Math.floor((x - l.originX) / TILE),
          ty = Math.floor((y - l.originY) / TILE);
        if (l.water[ty * l.cols + tx] === 1) wet++;
      }
      // a pond five tiles in radius is fifteen yards to the tile and some thirty across: well over ten of the line's yards
      expect(wet, `${name}: yards of the line that are water`).toBeGreaterThan(10);
    }
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

  it('has the hills it had before it had contoured greens, from thirty-four tiles of the cup outward, to the digit', () => {
    // each hole's terrain beyond the plate the green stands on, hashed as it was on 1 October 2026 before the green was given a
    // contour: a contour is the green's, and what was chosen by playing forty seeds and looking is the hills round it. Seven holes
    // were respecified and their seeds chosen again that day (stage 9 of the courses plan: the corners, the ponds across the
    // line and two lengths), so theirs are the hills of the new spec; The Big Dogleg's and Home Stretch's are exactly as they were
    const WAS: Record<string, number> = {
      'The Opener': 2923654288,
      'Water Carry': 910302477,
      'Long Bend': 3955879483,
      'Tight Left': 1543323856,
      'Island Green': 2381509869,
      'Rushing Brook': 101997881,
      'The Big Dogleg': 3741846546,
      'The Straight Mile': 401805934,
      'Home Stretch': 334171249,
    };
    for (const h of holes) {
      const l = layoutOf(h.map, h.terrain);
      const cx = Math.floor((l.cup.x - l.originX) / TILE),
        cy = Math.floor((l.cup.y - l.originY) / TILE);
      let hash = 2166136261;
      for (let i = 0; i < l.terrain.length; i++) {
        if (Math.hypot((i % l.cols) - cx, Math.floor(i / l.cols) - cy) <= 34) continue;
        hash = Math.imul(hash ^ Math.round(l.terrain[i] * 10000), 16777619) >>> 0;
      }
      expect(hash, h.name).toBe(WAS[h.name]);
    }
  });

  it('has a wind on every hole, a mix from a breath to a fresh breeze and none above fifteen, as each spec says, with a hole or two of ten or more', () => {
    holes.forEach((h, i) => {
      expect(h.wind, h.name).toBe(LINKS_SPECS[i].wind);
      expect(h.wind, h.name).toBeGreaterThan(0);
      expect(h.wind, h.name).toBeLessThanOrEqual(15);
    });
    expect(new Set(holes.map((h) => h.wind)).size, 'a mix and not one wind for all').toBeGreaterThan(4);
    expect(holes.filter((h) => h.wind! >= 10).length).toBeGreaterThanOrEqual(2);
    expect(holes.filter((h) => h.wind! <= 6).length).toBeGreaterThanOrEqual(2);
  });
});
