/**
 * The Mesa, the middle course of the desert: nine holes of par 36, doglegs round cactus with a lane cut through the corner on
 * four of them, fairways of eleven to fourteen tiles, ground that runs and is lifted (`heighten` up to a little over two) with a
 * shelf for a landing on three holes, and the strongest steady wind the desert has but the Badlands' (twelve to fifteen
 * miles an hour). What is held here is every count the course was asked for, exactly, on the holes as made, since a seed
 * chosen by playing is where a count slips: a lane left off a bend, a pan refused for a seed, a shelf that did not stand. The pace
 * it is held to is not here: it is `test/desert-pace.test.ts`'s, from the pace gate's player.
 */
import { describe, expect, it } from 'vitest';
import { Autopilot } from '../src/autopilot';
import { Game, LIMIT_OVER_PAR } from '../src/game';
import { SHELF, WOOD, laneOf } from '../src/golf';
import { checkInvariants } from '../src/invariants';
import { MESA_SPECS, MESA_SUMMARY, mesa } from '../src/mesa';
import { Progress, memoryStore } from '../src/progress';
import { seeded } from '../src/random';
import { DT } from './helpers';
import { DESERT, driveLane, holeProblems, laneRoom, madeOf, takenNames, tiles, windProblems } from './desert';

const NAME = 'The Mesa';
const { holes, layouts, ms } = madeOf(MESA_SPECS);
const names = MESA_SPECS.map((s) => s.name);
const bent = MESA_SPECS.filter((s) => s.bend !== 0);

describe(NAME, () => {
  it('is nine holes of par 36: 4, 4, 3, 5, 4, 3, 4, 5, 4', () => {
    expect(DESERT[NAME]).toBe(MESA_SPECS);
    expect(MESA_SPECS.map((s) => s.par)).toEqual([4, 4, 3, 5, 4, 3, 4, 5, 4]);
    expect(mesa().map((h) => h.par)).toEqual(MESA_SPECS.map((s) => s.par));
    expect(MESA_SUMMARY).toEqual({ holes: 9, par: 36 });
    expect(mesa()).toBe(mesa());
  });

  it('has every hole in the desert, with ground the physics takes, a way to the cup and no water', () => {
    holes.forEach((h, i) => holeProblems(h, layouts[i]));
  });

  it('is the lengths the pars call for, a long course: a three of 235 to 240 yards, a four of 420 to 540, a five of 600 to 610', () => {
    const band = { 3: [235, 240], 4: [420, 540], 5: [600, 610] } as const;
    for (const s of MESA_SPECS) {
      const [least, most] = band[s.par as 3 | 4 | 5];
      expect(s.length, s.name).toBeGreaterThanOrEqual(least);
      expect(s.length, s.name).toBeLessThanOrEqual(most);
    }
  });

  it('has a fairway of eleven to fourteen tiles on every hole', () => {
    for (const s of MESA_SPECS) {
      expect(s.width, s.name).toBeGreaterThanOrEqual(11);
      expect(s.width, s.name).toBeLessThanOrEqual(14);
    }
  });

  it('has a wind of twelve to fifteen miles an hour on every hole, which the holes as made carry', () => {
    for (const s of MESA_SPECS) {
      expect(s.wind, s.name).toBeGreaterThanOrEqual(12);
      expect(s.wind, s.name).toBeLessThanOrEqual(15);
    }
    expect(holes.map((h) => h.wind)).toEqual(MESA_SPECS.map((s) => s.wind));
  });

  it('has exactly four doglegs, of 40 to 45 degrees, turning both ways, each with a lane cut through the cactus on its corner', () => {
    expect(bent.map((s) => s.name)).toEqual(['Sidewinder', 'The Anvil', 'Cholla Bend', 'Red Rim']);
    for (const s of bent) {
      expect(Math.abs(s.bend), s.name).toBeGreaterThanOrEqual(WOOD.bend);
      expect(Math.abs(s.bend), s.name).toBeLessThanOrEqual(45);
    }
    expect(bent.filter((s) => s.bend > 0).length).toBeGreaterThan(0);
    expect(bent.filter((s) => s.bend < 0).length).toBeGreaterThan(0);
    const lanes = holes.map((h, i) => [MESA_SPECS[i], laneOf(h)] as const);
    expect(lanes.filter(([, l]) => l).map(([s]) => s.name)).toEqual(bent.map((s) => s.name));
    for (const [spec, lane] of lanes) expect(!!spec.gap, spec.name).toBe(!!lane);
  });

  it('keeps each lane clear of cactus, and lets a driver struck true down it in a still air meet none and come down on it', () => {
    for (const [i, h] of holes.entries()) {
      const lane = laneOf(h);
      if (!lane) continue;
      const name = MESA_SPECS[i].name;
      expect(laneRoom(layouts[i], lane), `${name}: a cactus in the lane`).toBeGreaterThanOrEqual(-1e-6);
      const drive = driveLane(h, lane);
      expect(drive.knocks, `${name}: through the lane`).toBe(0);
      expect(drive.lost, `${name}: lost`).toBe(false);
      expect(drive.at, `${name}: comes down`).not.toBeNull();
      // a drive carries 190 to 280 yards with the hills it comes down on; a lane no drive reaches down is no shortcut
      expect(drive.carry, `${name}: carry`).toBeGreaterThan(180);
    }
  });

  it('lifts the ground at most to about two (a hole’s heighten from 1.5 to 2.2), with a shelf to land on at 140 to 280 yards on three holes', () => {
    for (const s of MESA_SPECS) {
      expect(s.heighten ?? 1, s.name).toBeLessThanOrEqual(2.2);
    }
    expect(MESA_SPECS.filter((s) => (s.heighten ?? 1) >= 1.8).map((s) => s.name)).toEqual([
      'Dry Wash',
      'The Anvil',
      'Cholla Bend',
      'Ochre Ledge',
      'Canyon Mouth',
    ]);
    expect(Math.max(...MESA_SPECS.map((s) => s.heighten ?? 1))).toBe(2.2);
    const shelved = MESA_SPECS.filter((s) => s.shelves?.length);
    expect(shelved.map((s) => s.name)).toEqual(['The Anvil', 'Ochre Ledge', 'Canyon Mouth']);
    for (const s of shelved)
      for (const y of s.shelves!) {
        expect(y, s.name).toBeGreaterThanOrEqual(SHELF.apart);
        expect(y, s.name).toBeLessThanOrEqual(s.length - SHELF.apart);
      }
  });

  it('has a pan on exactly four holes, big enough to be a pan, and cacti of 55 to 165 a hole', () => {
    const pans = holes.map((h) => tiles(h.map, 'd'));
    expect(holes.filter((_, i) => pans[i] > 0).map((h) => h.name)).toEqual([
      'Dry Wash',
      'Mesa Edge',
      'Butte Drop',
      'Canyon Mouth',
    ]);
    for (const [i, h] of holes.entries()) {
      expect(!!MESA_SPECS[i].ponds.length, h.name).toBe(pans[i] > 0);
      if (pans[i] > 0) expect(pans[i], `${h.name}: tiles of pan`).toBeGreaterThanOrEqual(40);
      expect(layouts[i].trees.length, `${h.name}: cacti`).toBeGreaterThanOrEqual(55);
      expect(layouts[i].trees.length, `${h.name}: cacti`).toBeLessThanOrEqual(165);
    }
  });

  it('has bunkers on every hole: two to five by the fairway and three to five by the green', () => {
    for (const s of MESA_SPECS) {
      expect(s.bunkers.fairway, s.name).toBeLessThanOrEqual(3);
      expect(s.bunkers.green, s.name).toBeGreaterThanOrEqual(2);
      expect(s.bunkers.green, s.name).toBeLessThanOrEqual(5);
    }
    for (const [i, h] of holes.entries())
      expect(tiles(h.map, 's'), h.name).toBeGreaterThan(MESA_SPECS[i].bunkers.green * 4);
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
