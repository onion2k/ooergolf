/**
 * The daily hole's making: a hole from a day, the same for everyone, and the day itself worked out without a clock. The hole is
 * a golf hole made by the generator, so thirty days of them are built here (which is why this is a slow file); that the pace
 * player can play four hundred of them is `npm run daily:check`'s.
 */
import { describe, expect, it } from 'vitest';
import { BIOMES } from '../src/biome';
import {
  GAME_ADDRESS,
  RETRIES,
  TURN,
  biomeOfDay,
  dailyBuild,
  dailyHole,
  dailySpec,
  dayNumber,
  dayWords,
  followsDay,
  isDay,
  plainSpec,
  shareText,
  shiftDay,
  utcDay,
} from '../src/daily';
import { golfHole } from '../src/golf';
import { hashHole } from './helpers';

const DAY = '2026-11-11';
const days = (n: number, from = DAY) => Array.from({ length: n }, (_, k) => shiftDay(from, k));

describe('the day', () => {
  it('turns at midnight UTC, whatever the clock of the machine says', () => {
    expect(utcDay(new Date('2026-11-11T23:59:59.999Z'))).toBe('2026-11-11');
    expect(utcDay(new Date('2026-11-12T00:00:00.000Z'))).toBe('2026-11-12');
    // 23:30 at UTC-5 is already the next day at Greenwich, and 00:30 at UTC+9 is still the day before there
    expect(utcDay(new Date('2026-11-11T23:30:00-05:00'))).toBe('2026-11-12');
    expect(utcDay(new Date('2026-11-12T00:30:00+09:00'))).toBe('2026-11-11');
  });

  it('is counted in days since 1970 by the calendar, across months, years and leap days', () => {
    expect(dayNumber('1970-01-01')).toBe(0);
    for (const day of ['1999-12-31', '2000-02-29', '2024-02-29', '2026-11-11', '2100-03-01', '2027-01-01'])
      expect(dayNumber(day), day).toBe(Date.parse(`${day}T00:00:00Z`) / 86_400_000);
    expect(shiftDay('2026-11-30', 1)).toBe('2026-12-01');
    expect(shiftDay('2026-12-31', 1)).toBe('2027-01-01');
    expect(shiftDay('2024-02-28', 1)).toBe('2024-02-29');
    expect(shiftDay('2026-02-28', 1)).toBe('2026-03-01');
    expect(shiftDay('2026-03-01', -1)).toBe('2026-02-28');
    expect(shiftDay(DAY, 0)).toBe(DAY);
  });

  it('knows a day from what is not one, and the day after from every other', () => {
    for (const bad of ['', '2026-13-01', '2026-02-30', '2026-1-1', '26-11-11', '2026-11-11T00:00', 7, null, undefined])
      expect(isDay(bad), String(bad)).toBe(false);
    expect(isDay('2024-02-29')).toBe(true);
    expect(isDay('2026-02-29')).toBe(false);
    expect(followsDay('2026-11-11', '2026-11-12')).toBe(true);
    expect(followsDay('2026-12-31', '2027-01-01')).toBe(true);
    expect(followsDay('2026-11-11', '2026-11-11')).toBe(false);
    expect(followsDay('2026-11-11', '2026-11-13')).toBe(false);
    expect(followsDay('2026-11-12', '2026-11-11')).toBe(false);
    expect(followsDay('nonsense', '2026-11-11')).toBe(false);
  });

  it('is said as a person says it', () => {
    expect(dayWords('2026-11-11')).toBe('11 Nov 2026');
    expect(dayWords('2027-01-05')).toBe('5 Jan 2027');
  });

  it('turns through the four biomes, one a day', () => {
    const seen = days(8).map(biomeOfDay);
    expect(seen.slice(0, 4).sort()).toEqual([...TURN].sort());
    expect(seen.slice(4)).toEqual(seen.slice(0, 4));
  });
});

describe('a spec from a day', () => {
  it('is the same for the same day, and moves with the day and with the attempt', () => {
    expect(dailySpec(DAY)).toEqual(dailySpec(DAY));
    expect(dailySpec(DAY)).not.toEqual(dailySpec(shiftDay(DAY, 1)));
    expect(dailySpec(DAY, 1).seed).toBe(dailySpec(DAY, 0).seed + 1);
    expect({ ...dailySpec(DAY, 1), seed: 0 }).toEqual({ ...dailySpec(DAY, 0), seed: 0 });
  });

  it('is named for its day, and refuses what is not a day', () => {
    expect(dailySpec(DAY).name).toBe(`Daily ${DAY}`);
    expect(() => dailySpec('2026-02-30')).toThrow(/YYYY-MM-DD/);
  });

  it('stays inside what the generator takes, and has no tree where there is none', () => {
    for (const day of days(120)) {
      const spec = dailySpec(day);
      expect(spec.par, day).toBeGreaterThanOrEqual(3);
      expect(spec.par, day).toBeLessThanOrEqual(5);
      expect(spec.biome, day).toBe(biomeOfDay(day));
      if (spec.par === 3) expect(spec.bend, day).toBe(0);
      expect(Math.abs(spec.bend), day).toBeLessThanOrEqual(45);
      if (BIOMES[spec.biome!].tree === null) expect(spec.trees, day).toBe(0);
    }
    // all three pars and a hole with water and one without turn up in a season of days
    const pars = new Set(days(120).map((d) => dailySpec(d).par));
    expect([...pars].sort()).toEqual([3, 4, 5]);
    expect(days(120).some((d) => dailySpec(d).ponds.length > 0)).toBe(true);
    expect(days(120).some((d) => dailySpec(d).ponds.length === 0)).toBe(true);
  });
});

describe('a hole from a day', () => {
  it('is the same hole the same day, byte for byte, and another the next day', () => {
    expect(hashHole(dailyHole(DAY))).toBe(hashHole(dailyHole(DAY)));
    expect(hashHole(dailyHole(DAY))).not.toBe(hashHole(dailyHole(shiftDay(DAY, 1))));
  });

  it('builds for thirty days running, each a golf hole of its biome named for its day', () => {
    for (const day of days(30)) {
      const built = dailyBuild(day);
      expect(built.hole.name, day).toBe(`Daily ${day}`);
      expect(built.hole.par, day).toBe(built.plain ? 4 : dailySpec(day).par);
      expect(built.hole.biome, day).toBe(biomeOfDay(day));
      expect(built.refused, day).toBeLessThanOrEqual(RETRIES + 1);
    }
  });

  it('is never in the plain spec for a day the generator takes', () => {
    expect(dailyBuild(DAY).plain).toBe(false);
  });

  it('tries the next seed up where the generator refuses, and says how often it did', () => {
    const seeds: number[] = [];
    const refuse = (n: number) => (spec: Parameters<typeof golfHole>[0]) => {
      seeds.push(spec.seed);
      if (seeds.length <= n) throw new RangeError(`${spec.name}: could not place a pond 1 of 1 in 600 tries`);
      return golfHole(spec);
    };
    const built = dailyBuild(DAY, refuse(3));
    expect(built.refused).toBe(3);
    expect(built.plain).toBe(false);
    expect(seeds).toEqual([0, 1, 2, 3].map((k) => dailySpec(DAY).seed + k));
  });

  it('is the plain spec after the last retry, and the plain spec is never refused, in any biome', () => {
    const built = dailyBuild(DAY, (spec) => {
      if (
        spec.name === plainSpec(DAY).name &&
        spec.length === plainSpec(DAY).length &&
        spec.trees === 0 &&
        spec.par === 4 &&
        spec.seed === 1
      )
        return golfHole(spec);
      throw new RangeError(`${spec.name}: its fairway will not rest a ball, however gentle its hills`);
    });
    expect(built.plain).toBe(true);
    expect(built.refused).toBe(RETRIES + 1);
    for (const day of days(TURN.length)) {
      const plain = golfHole(plainSpec(day));
      expect(plain.biome, day).toBe(biomeOfDay(day));
      expect(plain.name).toBe(`Daily ${day}`);
    }
  });

  it('does not hide a fault of its own behind a retry', () => {
    expect(() =>
      dailyBuild(DAY, () => {
        throw new TypeError('something else is wrong');
      }),
    ).toThrow(/something else/);
  });

  it('has no tree on the Moon', () => {
    const moon = days(8).find((d) => biomeOfDay(d) === 'moon')!;
    const hole = dailyHole(moon);
    expect(hole.map.join('')).not.toContain('^');
  });
});

describe('what is shared', () => {
  it('is the day, the par, the strokes, what they are called and the game’s address, and nothing else', () => {
    expect(shareText(DAY, 4, 3)).toBe(`ooergolf daily, 11 Nov 2026\nPar 4: 3 strokes, Birdie\n${GAME_ADDRESS}`);
    expect(shareText(DAY, 4, 1)).toBe(`ooergolf daily, 11 Nov 2026\nPar 4: 1 stroke, Hole in one\n${GAME_ADDRESS}`);
    expect(shareText(DAY, 3, 5)).toBe(`ooergolf daily, 11 Nov 2026\nPar 3: 5 strokes, Double bogey\n${GAME_ADDRESS}`);
    expect(GAME_ADDRESS).toBe('https://golf.ooer.com/');
  });
});
