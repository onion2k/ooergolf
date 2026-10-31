/**
 * The Saltpan, the easy course of the desert: nine holes of par 34 on wide fairways (fourteen to twenty tiles), a pan on every
 * one that a drive can run across, a wind of nine to twelve miles an hour, gentle hills, a few bunkers and cacti scattered forty to
 * ninety to a hole. What is held here is every count the course was asked for, exactly, on the holes as made, since a seed chosen
 * by playing is where a count slips: a pan refused for a seed and put on another hole, a wind too still to move the grass, a width
 * that drifted. The pace it is held to is not here: it is `test/desert-pace.test.ts`'s, from the pace gate's player.
 */
import { describe, expect, it } from 'vitest';
import { Autopilot } from '../src/autopilot';
import { Game, LIMIT_OVER_PAR } from '../src/game';
import { checkInvariants } from '../src/invariants';
import { Progress, memoryStore } from '../src/progress';
import { seeded } from '../src/random';
import { SALTPAN_SPECS, SALTPAN_SUMMARY, saltpan } from '../src/saltpan';
import { DT } from './helpers';
import { DESERT, holeProblems, madeOf, takenNames, tiles, windProblems } from './desert';

const NAME = 'The Saltpan';
const { holes, layouts, ms } = madeOf(SALTPAN_SPECS);
const names = SALTPAN_SPECS.map((s) => s.name);

describe(NAME, () => {
  it('is nine holes of par 34: 3, 4, 4, 3, 4, 3, 4, 4, 5', () => {
    expect(DESERT[NAME]).toBe(SALTPAN_SPECS);
    expect(SALTPAN_SPECS.map((s) => s.par)).toEqual([3, 4, 4, 3, 4, 3, 4, 4, 5]);
    expect(saltpan().map((h) => h.par)).toEqual(SALTPAN_SPECS.map((s) => s.par));
    expect(SALTPAN_SUMMARY).toEqual({ holes: 9, par: 34 });
    expect(saltpan()).toBe(saltpan());
  });

  it('has every hole in the desert, with ground the physics takes, a way to the cup and no water', () => {
    holes.forEach((h, i) => holeProblems(h, layouts[i]));
  });

  it('is the lengths the pars call for: a three of 220 to 225 yards, a four of 430 to 490 and a five of 570', () => {
    const band = { 3: [220, 225], 4: [430, 490], 5: [570, 570] } as const;
    for (const s of SALTPAN_SPECS) {
      const [least, most] = band[s.par as 3 | 4 | 5];
      expect(s.length, s.name).toBeGreaterThanOrEqual(least);
      expect(s.length, s.name).toBeLessThanOrEqual(most);
    }
  });

  it('has a fairway of fourteen to twenty tiles on every hole', () => {
    for (const s of SALTPAN_SPECS) {
      expect(s.width, s.name).toBeGreaterThanOrEqual(14);
      expect(s.width, s.name).toBeLessThanOrEqual(20);
    }
  });

  it('has a wind of nine to twelve miles an hour on every hole, which the holes as made carry', () => {
    for (const s of SALTPAN_SPECS) {
      expect(s.wind, s.name).toBeGreaterThanOrEqual(9);
      expect(s.wind, s.name).toBeLessThanOrEqual(12);
    }
    expect(holes.map((h) => h.wind)).toEqual(SALTPAN_SPECS.map((s) => s.wind));
  });

  it('has a pan on every hole, big enough to be run across, and a second pan on one', () => {
    for (const [i, h] of holes.entries()) {
      const spec = SALTPAN_SPECS[i];
      expect(spec.ponds.length, h.name).toBeGreaterThanOrEqual(1);
      expect(spec.lakes, h.name).toBeUndefined();
      const pan = tiles(h.map, 'd');
      // 56 to 168 tiles a hole were measured: a pan, and not the dry lake of a hole
      expect(pan, `${h.name}: tiles of pan`).toBeGreaterThanOrEqual(50);
      expect(pan, `${h.name}: tiles of pan`).toBeLessThanOrEqual(170);
    }
    expect(SALTPAN_SPECS.filter((s) => s.ponds.length > 1).map((s) => s.name)).toEqual(['Tumbleweed Run']);
  });

  it('has gentle hills: none of the ground is lifted, none is shelved, none is a bank or a gap', () => {
    for (const [i, s] of SALTPAN_SPECS.entries()) {
      expect(s.heighten, s.name).toBeUndefined();
      expect(s.shelves, s.name).toBeUndefined();
      expect(s.gap, s.name).toBeUndefined();
      expect(s.woods, s.name).toBeUndefined();
      expect(Math.max(...layouts[i].terrain), `${s.name}: the highest ground, in yards`).toBeLessThanOrEqual(17);
    }
  });

  it('has cacti scattered forty to ninety to a hole, on the holes as made, and bunkers: a few', () => {
    for (const [i, s] of SALTPAN_SPECS.entries()) {
      expect(s.trees, s.name).toBeGreaterThanOrEqual(40);
      expect(s.trees, s.name).toBeLessThanOrEqual(90);
      // the generator may leave a few out where they would be in the way, but not a third
      expect(layouts[i].trees.length, `${s.name}: cacti grown`).toBeGreaterThanOrEqual(s.trees * 0.66);
      expect(layouts[i].trees.length, `${s.name}: cacti grown`).toBeLessThanOrEqual(s.trees);
      const n = s.bunkers.fairway + s.bunkers.green;
      expect(n, `${s.name}: bunkers`).toBeGreaterThanOrEqual(2);
      expect(n, `${s.name}: bunkers`).toBeLessThanOrEqual(6);
    }
  });

  it('has slow, flat greens: 14, and a gentle contour', () => {
    for (const s of SALTPAN_SPECS) {
      expect(s.greens, s.name).toBe(14);
      expect(s.contour, s.name).toBeLessThanOrEqual(0.4);
    }
    expect(holes.map((h) => h.greens)).toEqual(SALTPAN_SPECS.map((s) => s.greens));
  });

  it('has bends of no more than thirty degrees, and straight holes besides', () => {
    for (const s of SALTPAN_SPECS) expect(Math.abs(s.bend), s.name).toBeLessThanOrEqual(30);
    expect(SALTPAN_SPECS.filter((s) => s.bend === 0).map((s) => s.name)).toEqual([
      'Salt Flat',
      'White Wash',
      'Dry Well',
      'Glass Pan',
      'Tumbleweed Run',
    ]);
  });

  it('has a name of its own on every hole: unique across every course, and each draws a wind that moves the grass', () => {
    expect(new Set(names).size).toBe(9);
    const taken = takenNames(NAME);
    for (const name of names) {
      expect(taken, name).not.toContain(name);
      expect(windProblems(name), name).toEqual([]);
    }
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
        expect(score, `seed ${seed}: ${holes[h].name}`).toBeLessThanOrEqual(holes[h].par + LIMIT_OVER_PAR),
      );
      expect(game.card.length).toBe(9);
    }
  }, 120000);

  it('is made in under three seconds, all nine holes, in node', () => {
    expect(ms).toBeLessThan(3000);
    for (const l of layouts) expect(l.cols * l.rows).toBeLessThan(40000);
  });
});
