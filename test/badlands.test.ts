/**
 * The Badlands, the hard course of the desert: nine holes of par 37, long, with fairways of eight to eleven tiles, a wood of
 * cactus along the whole of four holes, a lane cut through the cactus on four doglegs, the most the ground may be lifted
 * (`heighten` up to two and a half), a great many bunkers, and the strongest wind the autopilot is measured to, fifteen miles
 * an hour, on every hole. What is held here is every count the course was asked for, exactly, on the holes as made, since a seed
 * chosen by playing is where a count slips: a wood that did not grow, a lane left off a bend, a pan refused for a seed. The pace
 * it is held to is not here: it is `test/desert-pace.test.ts`'s, from the pace gate's player.
 */
import { describe, expect, it } from 'vitest';
import { Autopilot } from '../src/autopilot';
import { BADLANDS_SPECS, BADLANDS_SUMMARY, badlands } from '../src/badlands';
import { Game, LIMIT_OVER_PAR } from '../src/game';
import { HEIGHTEN, WOOD, WOODS, laneOf } from '../src/golf';
import { checkInvariants } from '../src/invariants';
import { Progress, memoryStore } from '../src/progress';
import { seeded } from '../src/random';
import { WIND } from '../src/shaping';
import { TREE } from '../src/trees';
import { DT } from './helpers';
import { DESERT, driveLane, holeProblems, laneRoom, madeOf, takenNames, tiles, windProblems } from './desert';

const NAME = 'The Badlands';
const { holes, layouts, ms } = madeOf(BADLANDS_SPECS);
const names = BADLANDS_SPECS.map((s) => s.name);
const bent = BADLANDS_SPECS.filter((s) => s.bend !== 0);

describe(NAME, () => {
  it('is nine holes of par 37: 4, 5, 3, 4, 5, 4, 3, 5, 4', () => {
    expect(DESERT[NAME]).toBe(BADLANDS_SPECS);
    expect(BADLANDS_SPECS.map((s) => s.par)).toEqual([4, 5, 3, 4, 5, 4, 3, 5, 4]);
    expect(badlands().map((h) => h.par)).toEqual(BADLANDS_SPECS.map((s) => s.par));
    expect(BADLANDS_SUMMARY).toEqual({ holes: 9, par: 37 });
    expect(badlands()).toBe(badlands());
  });

  it('has every hole in the desert, with ground the physics takes, a way to the cup and no water', () => {
    holes.forEach((h, i) => holeProblems(h, layouts[i]));
  });

  it('is long: a three of 235 to 240 yards, a four of 470 to 560 and a five of 620 to 760', () => {
    const band = { 3: [235, 240], 4: [470, 560], 5: [620, 760] } as const;
    for (const s of BADLANDS_SPECS) {
      const [least, most] = band[s.par as 3 | 4 | 5];
      expect(s.length, s.name).toBeGreaterThanOrEqual(least);
      expect(s.length, s.name).toBeLessThanOrEqual(most);
    }
  });

  it('has a fairway of eight to eleven tiles on every hole, the narrowest the generator makes on two', () => {
    for (const s of BADLANDS_SPECS) {
      expect(s.width, s.name).toBeGreaterThanOrEqual(8);
      expect(s.width, s.name).toBeLessThanOrEqual(11);
    }
    expect(BADLANDS_SPECS.filter((s) => s.width === 8).map((s) => s.name)).toEqual([
      'Hell Hollow',
      'Buzzard Roost',
      'Thirst',
    ]);
  });

  it('blows fifteen miles an hour on every hole, which the holes as made carry, and is no more than the wind may be', () => {
    for (const s of BADLANDS_SPECS) expect(s.wind, s.name).toBe(15);
    expect(WIND.most).toBeGreaterThanOrEqual(15);
    expect(holes.map((h) => h.wind)).toEqual(BADLANDS_SPECS.map((s) => s.wind));
  });

  it('has a wood of cactus along the whole of exactly four holes, grown: no scattered cacti besides, and a stand on both sides of the first leg', () => {
    const wooded = BADLANDS_SPECS.filter((s) => s.woods);
    expect(wooded.map((s) => s.name)).toEqual(['Rattlesnake Ridge', 'Hell Hollow', 'Buzzard Roost', 'Last Water']);
    for (const s of wooded) {
      expect(s.trees, s.name).toBe(0);
      const i = BADLANDS_SPECS.indexOf(s);
      const l = layouts[i];
      expect(l.trees.length, `${s.name}: cacti`).toBeGreaterThanOrEqual(120);
      const leg = l.trees.filter((t) => t.y > l.tee.y + 20 && t.y < l.tee.y + 0.45 * s.length);
      expect(leg.filter((t) => t.x < l.tee.x - 8).length, `${s.name}: left of the first leg`).toBeGreaterThan(5);
      expect(leg.filter((t) => t.x > l.tee.x + 8).length, `${s.name}: right of the first leg`).toBeGreaterThan(5);
      // the wood is open for the tiles `WOODS.from` asks off the fairway: no cactus's crown over a ball played from it
      let nearest = Infinity;
      holes[i].map.forEach((row, r) => {
        for (let c = 0; c < row.length; c++) {
          if (row[c] !== 'f') continue;
          const x = l.originX + (c + 0.5) * 3,
            y = l.originY + (holes[i].map.length - 1 - r + 0.5) * 3;
          for (const t of l.trees) nearest = Math.min(nearest, Math.hypot(x - t.x, y - t.y));
        }
      });
      expect(nearest, `${s.name}: fairway`).toBeGreaterThan(TREE.radius);
      expect(nearest, `${s.name}: fairway`).toBeGreaterThanOrEqual(WOODS.from * 3 - 1e-6);
    }
    for (const s of BADLANDS_SPECS.filter((s) => !s.woods)) expect(s.trees, s.name).toBeGreaterThanOrEqual(65);
  });

  it('has exactly four doglegs, of 40 to 50 degrees, turning both ways, each with a lane cut through the cactus', () => {
    expect(bent.map((s) => s.name)).toEqual(['Rattlesnake Ridge', 'Skull Gulch', 'Gallows Wash', 'Buzzard Roost']);
    for (const s of bent) {
      expect(Math.abs(s.bend), s.name).toBeGreaterThanOrEqual(WOOD.bend);
      expect(Math.abs(s.bend), s.name).toBeLessThanOrEqual(50);
    }
    expect(bent.filter((s) => s.bend > 0).length).toBeGreaterThan(0);
    expect(bent.filter((s) => s.bend < 0).length).toBeGreaterThan(0);
    const lanes = holes.map((h, i) => [BADLANDS_SPECS[i], laneOf(h)] as const);
    expect(lanes.filter(([, l]) => l).map(([s]) => s.name)).toEqual(bent.map((s) => s.name));
    for (const [spec, lane] of lanes) expect(!!spec.gap, spec.name).toBe(!!lane);
  });

  it('keeps each lane clear of cactus, and lets a driver struck true down it in a still air meet none and come down on it', () => {
    for (const [i, h] of holes.entries()) {
      const lane = laneOf(h);
      if (!lane) continue;
      const name = BADLANDS_SPECS[i].name;
      expect(laneRoom(layouts[i], lane), `${name}: a cactus in the lane`).toBeGreaterThanOrEqual(-1e-6);
      const drive = driveLane(h, lane);
      expect(drive.knocks, `${name}: through the lane`).toBe(0);
      expect(drive.lost, `${name}: lost`).toBe(false);
      expect(drive.at, `${name}: comes down`).not.toBeNull();
      // a drive carries 190 to 280 yards with the hills it comes down on; a lane no drive reaches down is no shortcut
      expect(drive.carry, `${name}: carry`).toBeGreaterThan(180);
    }
  });

  it('lifts the ground high: a heighten of 1.2 to the most there is on the holes that ask, and a shelf to land on at 180 to 400 yards on three', () => {
    for (const s of BADLANDS_SPECS) {
      expect(s.heighten ?? 1, s.name).toBeGreaterThanOrEqual(1);
      expect(s.heighten ?? 1, s.name).toBeLessThanOrEqual(HEIGHTEN.most);
    }
    expect(BADLANDS_SPECS.filter((s) => (s.heighten ?? 1) >= 2.3).map((s) => s.name)).toEqual([
      'Skull Gulch',
      'Hell Hollow',
      'Buzzard Roost',
      'Boneyard',
    ]);
    expect(Math.max(...BADLANDS_SPECS.map((s) => s.heighten ?? 1))).toBe(HEIGHTEN.most);
  });

  it('has a pan on exactly four holes, and bunkers by the dozen: a hundred tiles of sand a hole at least', () => {
    const pans = holes.map((h) => tiles(h.map, 'd'));
    expect(holes.filter((_, i) => pans[i] > 0).map((h) => h.name)).toEqual([
      'Scorpion Drop',
      'Hell Hollow',
      'Thirst',
      'Boneyard',
      'Last Water',
    ]);
    for (const [i, h] of holes.entries()) {
      expect(!!BADLANDS_SPECS[i].ponds.length, h.name).toBe(pans[i] > 0);
      if (pans[i] > 0) expect(pans[i], `${h.name}: tiles of pan`).toBeGreaterThanOrEqual(40);
      expect(tiles(h.map, 's'), `${h.name}: sand`).toBeGreaterThanOrEqual(90);
      const bunkers = BADLANDS_SPECS[i].bunkers;
      expect(bunkers.fairway + bunkers.green, `${h.name}: bunkers`).toBeGreaterThanOrEqual(4);
    }
    expect(BADLANDS_SPECS.reduce((a, s) => a + s.bunkers.fairway + s.bunkers.green, 0)).toBeGreaterThanOrEqual(60);
  });

  it('has quick, turned greens: 11.2 and the most contour', () => {
    for (const s of BADLANDS_SPECS) {
      expect(s.greens, s.name).toBe(11.2);
      expect(s.contour, s.name).toBe(1);
    }
    expect(holes.map((h) => h.greens)).toEqual(BADLANDS_SPECS.map((s) => s.greens));
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
