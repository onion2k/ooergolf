/**
 * The Isles, the second hard course of golf: nine long holes round big lakes, each with an island to lay up on, one of them
 * an island green, and sand everywhere. Held here are the user's own counts, exactly: nine holes; every par from four to six
 * and the mean par five; a large lake with an island on every hole; one island green; at least eighty bunkers in all and from
 * eight to twelve a hole; the lengths a par is (a four to 480 yards, a five 540 to 600, a six 740 to 800, the generator's
 * limit); every flight over water within `CARRY`; no name that another course has. Without these a hole could lose its island
 * to a seed chosen for how it plays, or a flight over water could be asked that no club makes, and nothing would say so.
 * The counts are read off each hole's map for itself (`lake-figures.ts`), never from what the generator said it placed.
 */
import { describe, expect, it } from 'vitest';
import { layoutOf } from '../src/arena';
import { Autopilot } from '../src/autopilot';
import { COURSES, CUP } from '../src/course';
import { Game } from '../src/game';
import { CARRY } from '../src/golf';
import { checkInvariants } from '../src/invariants';
import { ISLES_SPECS, ISLES_SUMMARY, isles } from '../src/isles';
import { terrainRefusal } from '../src/physics';
import { Progress, memoryStore } from '../src/progress';
import { seeded } from '../src/random';
import { GREENS } from '../src/surfaces';
import { DT } from './helpers';
import { figures, gridOf, reached, wayRound } from './lake-figures';

/** The Fells' hole names as the plan has them: the course is not made yet, and its names must stay clear of The Isles'. */
const FELLS = [
  'Fell Foot',
  'The Pinewood',
  'Tarn',
  'Scree Corner',
  'The Drop',
  'Beck Bend',
  'The Shortcut',
  'Waterfall',
  'The Fell Race',
];

const started = performance.now();
const holes = isles();
const madeIn = performance.now() - started;

/** How many separate beds of sand a map has (tiles touching, corners and all, are one bed). */
function sandBeds(map: readonly string[]): number {
  const rows = map.length,
    cols = map[0].length;
  const seen = new Uint8Array(rows * cols);
  let beds = 0;
  for (let r = 0; r < rows; r++)
    for (let c = 0; c < cols; c++) {
      if (map[r][c] !== 's' || seen[r * cols + c]) continue;
      beds++;
      const stack = [[r, c]];
      seen[r * cols + c] = 1;
      while (stack.length) {
        const [y, x] = stack.pop()!;
        for (let dy = -1; dy <= 1; dy++)
          for (let dx = -1; dx <= 1; dx++) {
            const yy = y + dy,
              xx = x + dx;
            if (yy < 0 || xx < 0 || yy >= rows || xx >= cols || map[yy][xx] !== 's' || seen[yy * cols + xx]) continue;
            seen[yy * cols + xx] = 1;
            stack.push([yy, xx]);
          }
      }
    }
  return beds;
}

/** The bunkers a spec asks for in all, and how many of its islands are sand (a bed on the map that is not a bunker). */
const bunkersOf = (spec: (typeof ISLES_SPECS)[number]) =>
  spec.bunkers.fairway +
  spec.bunkers.green +
  (spec.bunkers.island ?? 0) +
  spec.lakes!.flatMap((l) => l.islands).reduce((n, i) => n + (i.bunkers ?? 0), 0);
const sandIslesOf = (spec: (typeof ISLES_SPECS)[number]) =>
  spec.lakes!.flatMap((l) => l.islands).filter((i) => i.kind === 'sand').length;

/**
 * The pieces of ground of a hole that water divides, found for itself: every tile that is not water, joined to the next
 * across a side. A piece is an island if nothing of it touches out of bounds, the rock or the map's edge, which every shore does.
 */
function pieces(hole: (typeof holes)[number]) {
  const g = gridOf(hole);
  const seen = new Uint8Array(g.cols * g.rows);
  const out: { size: number; tee: boolean; cup: boolean; island: boolean }[] = [];
  for (let r0 = 0; r0 < g.rows; r0++)
    for (let c0 = 0; c0 < g.cols; c0++) {
      const k0 = g.kind(c0, r0);
      if (seen[r0 * g.cols + c0] || k0 === '~' || k0 === ' ') continue;
      const piece = { size: 0, tee: false, cup: false, island: true };
      const stack = [[c0, r0]];
      seen[r0 * g.cols + c0] = 1;
      while (stack.length) {
        const [c, r] = stack.pop()!;
        piece.size++;
        const here = g.kind(c, r);
        if (here === 'T') piece.tee = true;
        if (here === 'C') piece.cup = true;
        if (here === 'x') piece.island = false;
        for (const [dc, dr] of [
          [1, 0],
          [-1, 0],
          [0, 1],
          [0, -1],
        ]) {
          const there = g.kind(c + dc, r + dr);
          if (there === ' ') piece.island = false;
          if (there === '~' || there === ' ' || seen[(r + dr) * g.cols + c + dc]) continue;
          seen[(r + dr) * g.cols + c + dc] = 1;
          stack.push([c + dc, r + dr]);
        }
      }
      out.push(piece);
    }
  return out;
}

/** Whether the hole's cup stands on an island, all round it water: the piece it is on touches nothing but lake. */
const islandGreen = (index: number) => pieces(holes[index]).some((p) => p.cup && p.island);
/** The islands of a hole that are not its green: pieces wholly in the water, of at least five tiles, with neither tee nor cup. */
const islandsOf = (index: number) => pieces(holes[index]).filter((p) => p.island && !p.cup && !p.tee && p.size >= 5);

describe('The Isles', () => {
  it('is nine holes of golf, each par four to six, adding to forty-five: a mean par of five', () => {
    expect(holes.length).toBe(9);
    expect(ISLES_SPECS.length).toBe(9);
    expect(holes.map((h) => h.par)).toEqual([5, 4, 6, 5, 4, 6, 5, 4, 6]);
    for (const h of holes) {
      expect(h.par, h.name).toBeGreaterThanOrEqual(4);
      expect(h.par, h.name).toBeLessThanOrEqual(6);
    }
    const total = holes.reduce((a, h) => a + h.par, 0);
    expect(total).toBe(45);
    expect(total / holes.length).toBeGreaterThanOrEqual(4);
    expect(total / holes.length).toBeLessThanOrEqual(6);
    expect(ISLES_SUMMARY).toEqual({ holes: 9, par: 45 });
  });

  it('is made once, when first asked for, and the same holes each time', () => {
    expect(isles()).toBe(holes);
  });

  it('has names of its own: nine, and none that another course has or the Fells will have, which the save keeps a best score by', () => {
    const names = holes.map((h) => h.name);
    expect(new Set(names).size).toBe(9);
    const others = new Set(COURSES.filter((c) => c.name !== 'The Isles').flatMap((c) => c.holes.map((h) => h.name)));
    for (const n of FELLS) others.add(n);
    for (const n of names) expect(others.has(n), n).toBe(false);
  });

  it('has a large lake on every hole, with an island in it: land of its own that the tee’s land is not, in the water', () => {
    holes.forEach((h, i) => {
      const spec = ISLES_SPECS[i];
      expect(spec.lakes!.length, h.name).toBeGreaterThanOrEqual(1);
      for (const lake of spec.lakes!)
        expect(lake.islands.length, `${h.name}: an island in each lake`).toBeGreaterThanOrEqual(1);
      const f = figures(h);
      // large: well over the three or four hundred tiles of water a pond-and-a-half is (The Links' ponds are 32 to 114)
      expect(f.water, `${h.name}: tiles of water`).toBeGreaterThanOrEqual(300);
      // an island: a piece of ground wholly in the water that is neither the tee's nor the cup's, or the cup's own when it is the green
      expect(islandsOf(i).length + (islandGreen(i) ? 1 : 0), `${h.name}: islands`).toBeGreaterThanOrEqual(1);
    });
  });

  it('has exactly one island green, and it is the cup’s own land, all of it in the water', () => {
    expect(ISLES_SPECS.filter((s) => s.lakes!.some((l) => l.islands.some((i) => i.kind === 'green'))).length).toBe(1);
    const greens = holes.map((_, i) => i).filter(islandGreen);
    expect(greens.length).toBe(1);
    expect(holes[greens[0]].name).toBe('The Green Isle');
    // no way to it over land: a carry that is a flight
    expect(wayRound(holes[greens[0]])).toBe(false);
  });

  it('has plenty of bunkers: eight to twelve on every hole and at least eighty in all, counted as beds of sand on the map', () => {
    let all = 0;
    holes.forEach((h, i) => {
      const beds = sandBeds(h.map) - sandIslesOf(ISLES_SPECS[i]);
      expect(beds, `${h.name}: bunkers on the map`).toBe(bunkersOf(ISLES_SPECS[i]));
      expect(beds, h.name).toBeGreaterThanOrEqual(8);
      expect(beds, h.name).toBeLessThanOrEqual(12);
      all += beds;
    });
    expect(all).toBeGreaterThanOrEqual(80);
  });

  it('is as long as a par is for it: a four to 480 yards, a five 540 to 600, a six 740 to 800 and no more', () => {
    const range: Record<number, [number, number]> = { 4: [400, 480], 5: [540, 600], 6: [740, 800] };
    ISLES_SPECS.forEach((spec, i) => {
      expect(spec.length, spec.name).toBeGreaterThanOrEqual(range[spec.par][0]);
      expect(spec.length, spec.name).toBeLessThanOrEqual(range[spec.par][1]);
      const l = layoutOf(holes[i].map, holes[i].terrain);
      const crow = Math.hypot(l.cup.x - l.tee.x, l.cup.y - l.tee.y);
      expect(crow, spec.name).toBeLessThanOrEqual(spec.length + 3);
      expect(crow, spec.name).toBeGreaterThan(spec.length * 0.75);
    });
  });

  it('asks no flight over water longer than `CARRY`: the cup is got to from the tee by land and by flights of that much water or less, over the map’s own tiles', () => {
    holes.forEach((h, i) => {
      const f = figures(h);
      const spec = ISLES_SPECS[i];
      const limit = Math.min(CARRY, ...spec.lakes!.map((l) => l.carry ?? CARRY));
      expect(reached(h, CARRY).has(f.cup), `${h.name}: the cup is reached`).toBe(true);
      // the least water a flight must cross to get from the tee to the cup, by the map's own tiles, is within what the spec allows
      let least = Infinity;
      for (let carry = 0.5; carry <= CARRY && least === Infinity; carry += 0.5)
        if (reached(h, carry).has(f.cup)) least = carry;
      expect(least, `${h.name}: the carry the hole needs`).toBeLessThanOrEqual(limit);
      // and the islands of fairway that the spec asked for, the biggest first, are places to fly to
      const seen = reached(h, CARRY);
      const wanted = spec
        .lakes!.flatMap((l) => l.islands)
        .filter((isle) => isle.kind === 'fairway' && isle.radius >= 4).length;
      for (const isle of f.islands.slice(0, wanted))
        expect(seen.has(isle.label), `${h.name}: an island is reached`).toBe(true);
    });
    // a lake across the line has no way round, and where there is one (a hole of two lakes at its sides) it is land
    const across = ISLES_SPECS.map((s, i) => [s, i] as const).filter(([s]) =>
      s.lakes!.some((l) => l.at !== 'green' && l.side === 0),
    );
    expect(across.length).toBeGreaterThanOrEqual(5);
    for (const [s, i] of across) expect(wayRound(holes[i]), s.name).toBe(false);
  });

  it('is legal to the physics, golf all through, with a way to the cup that flies the water', () => {
    holes.forEach((h) => {
      const l = layoutOf(h.map, h.terrain);
      expect(l.golf, h.name).toBe(true);
      expect(terrainRefusal(l, CUP), h.name).toBeNull();
    });
  });

  it('has hills as asked: hills or long hills at 0.75, lifted one to one and three tenths, no more than the plan', () => {
    for (const s of ISLES_SPECS) {
      expect(['hills', 'long hills'], s.name).toContain(s.feel);
      expect(s.steepness, s.name).toBe(0.75);
      expect(s.heighten!, s.name).toBeGreaterThanOrEqual(1);
      expect(s.heighten!, s.name).toBeLessThanOrEqual(1.3);
    }
  });

  it('has a wind and a green of its own on every hole, a fresh breeze at most and the greens fast', () => {
    holes.forEach((h, i) => {
      const s = ISLES_SPECS[i];
      expect(h.wind, h.name).toBe(s.wind);
      expect(h.wind!, h.name).toBeGreaterThanOrEqual(8);
      expect(h.wind!, h.name).toBeLessThanOrEqual(15);
      expect(h.greens, h.name).toBe(s.greens);
      expect(s.greens!, h.name).toBeGreaterThanOrEqual(GREENS.fast);
      expect(s.greens!, h.name).toBeLessThanOrEqual(14);
      expect(s.contour!, h.name).toBeGreaterThanOrEqual(0.6);
      expect(s.contour!, h.name).toBeLessThanOrEqual(1);
    });
  });

  it('is made quickly: the nine holes in node in a few seconds, the biggest of them a part of a second', () => {
    // a figure of this machine under load, not a gate: the page's own begin is held by `perf`
    expect(madeIn).toBeLessThan(8000);
    const biggest = Math.max(...holes.map((h) => h.map.length * h.map[0].length));
    expect(biggest).toBeLessThan(60000);
  });

  it('is played round by the autopilot, with a player’s slips: every hole finished inside its limit, breaking no rule', () => {
    for (let seed = 1; seed <= 2; seed++) {
      const game = new Game(new Progress(memoryStore()), {}, { random: seeded(seed), course: holes });
      const pilot = new Autopilot(game, { skill: { aim: 0.05, power: 0.1 }, random: seeded(seed * 31 + 7) });
      for (let f = 0; f < 60 * 60 * 30 && game.phase !== 'over'; f++) {
        pilot.step(DT);
        if (f % 211 === 0) expect(checkInvariants(game), `seed ${seed}, frame ${f}`).toEqual([]);
      }
      expect(game.phase, `seed ${seed}`).toBe('over');
      game.card.forEach((score, h) =>
        expect(score, `seed ${seed}: ${holes[h].name}`).toBeLessThanOrEqual(holes[h].par + 5),
      );
      expect(game.card.length).toBe(9);
    }
  }, 120000);
});
