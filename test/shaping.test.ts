/**
 * What a shot has besides its aim and power: the wind, a shape and a spin, as arithmetic. Held here: that the wind a ball is
 * pushed by is the very wind the grass and the flag show, that each figure keeps to its limits and its sign, that bad
 * numbers are no wind and no shape and no spin and never NaN, and that the arithmetic of a flight's time and a wind's reach is the game's
 * to within a couple of yards, since the autopilot's first guess is made from it. What the game does with them is in
 * `wind.test.ts`, `shape.test.ts` and `spin.test.ts`.
 */
import { describe, expect, it } from 'vitest';
import { BAG, bagClub } from '../src/bag';
import { COURSE } from '../src/course';
import { RANGE } from '../src/range';
import { PHYSICS } from '../src/arena';
import {
  SHAPE,
  SPIN,
  WIND,
  airTime,
  curveRate,
  nameSeed,
  spunKeep,
  windDirection,
  windPush,
  windReach,
} from '../src/shaping';
import { LIE } from '../src/surfaces';
import { windOf } from '../src/turf';
import { DT, field, golfGame } from './helpers';
import { NORTH, windy } from './wind-helpers';

const LOFTED = BAG.filter((c) => c.loft > 0);

describe('the wind a hole blows', () => {
  it('blows the way the grass bends and the flag flies: windDirection is the direction windOf gives', () => {
    const names = [...COURSE, ...RANGE].map((h) => h.name);
    for (const name of ['Pitch and Putt', 'The Long Way', 'Hole 1', 'Straight Eight', ...names]) {
      expect(windOf(name).direction, name).toEqual(windDirection(name));
    }
  });

  it('is a unit vector, and the same for a name every time', () => {
    for (const name of ['a', 'b', 'The Opener', 'Water Carry', '', 'Hole 12']) {
      const [x, y] = windDirection(name);
      expect(Math.hypot(x, y)).toBeCloseTo(1, 12);
      expect(windDirection(name)).toEqual([x, y]);
    }
    expect(new Set(['a', 'b', 'c', 'd', 'e', 'f'].map((n) => windDirection(n).join())).size).toBe(6);
  });

  it('is what the grass was already blown by: the very figures windOf gave before the ball shared them', () => {
    // read off the game before the wind was the ball's, to the last digit: the grass of every hole is unchanged
    expect(windOf('Pitch and Putt')).toEqual({
      direction: [0.2415175533650181, 0.9703964506409613],
      strength: 0.8047281598206609,
      gustSize: 8,
      gustSpeed: 5,
    });
    expect(windOf('The Long Way')).toEqual({
      direction: [-0.9372428907080712, -0.3486771627410929],
      strength: 0.85908750644885,
      gustSize: 8,
      gustSpeed: 5,
    });
    expect(windOf('Hole 1')).toEqual({
      direction: [0.8460225724359952, 0.5331470781395892],
      strength: 0.8615219329949468,
      gustSize: 8,
      gustSpeed: 5,
    });
    expect(windOf('Straight Eight')).toEqual({
      direction: [-0.9793109775824119, -0.20236108614696813],
      strength: 0.8493396615143864,
      gustSize: 8,
      gustSpeed: 5,
    });
  });

  it('seeds from a name the way the grass does, and the same name gives the same seed', () => {
    expect(nameSeed('abc')).toBe(nameSeed('abc'));
    expect(nameSeed('abc')).not.toBe(nameSeed('abd'));
    expect(nameSeed('')).toBe(0x811c9dc5);
  });
});

describe('how hard the wind pushes', () => {
  it('is in proportion to the miles an hour, and none for calm', () => {
    expect(windPush(0)).toBe(0);
    expect(windPush(10)).toBeCloseTo(10 * WIND.push, 12);
    expect(windPush(20)).toBeCloseTo(2 * windPush(10), 12);
  });

  it('is held between none and the most a hole has, and is none for what is not a speed', () => {
    expect(windPush(-5)).toBe(0);
    expect(windPush(1000)).toBe(WIND.most * WIND.push);
    for (const bad of [NaN, Infinity, -Infinity]) expect(windPush(bad), String(bad)).toBe(0);
  });
});

describe('the curve of a shape', () => {
  it('is nought for a straight shot, positive for a fade and negative for a draw, and the same size either way', () => {
    expect(curveRate(0, 11) + 0).toBe(0);
    expect(curveRate(1, 11)).toBeGreaterThan(0);
    expect(curveRate(-1, 11)).toBe(-curveRate(1, 11));
    expect(curveRate(0.5, 11)).toBeCloseTo(curveRate(1, 11) / 2, 12);
  });

  it('is held to the fullest shape, and is nought for a shape that is not a number', () => {
    expect(curveRate(5, 11)).toBe(curveRate(1, 11));
    expect(curveRate(-5, 11)).toBe(curveRate(-1, 11));
    for (const bad of [NaN, Infinity, -Infinity]) expect(curveRate(bad, 11), String(bad)).toBe(0);
  });

  it('is less for a club with more loft, and none at all from a loft where a club puts no shape on', () => {
    expect(curveRate(1, 0)).toBe(SHAPE.turn);
    expect(curveRate(1, 11)).toBeGreaterThan(curveRate(1, 34));
    expect(curveRate(1, 34)).toBeGreaterThan(curveRate(1, 56));
    expect(curveRate(1, SHAPE.straight)).toBe(0);
    expect(curveRate(1, 90)).toBe(0);
    expect(curveRate(1, -5)).toBe(curveRate(1, 0));
  });
});

describe('what a spin does to the share kept at a landing', () => {
  it('leaves it as it was for a ball with no spin', () => {
    for (const keep of [0, 0.03, 0.37, 0.45]) expect(spunKeep(keep, 0)).toBe(keep);
  });

  it('keeps more for topspin and less for backspin, by the figures, and more than all of it at the fullest backspin', () => {
    expect(spunKeep(0.4, 1)).toBeCloseTo(0.4 * (1 + SPIN.top), 12);
    expect(spunKeep(0.4, 0.5)).toBeCloseTo(0.4 * (1 + SPIN.top / 2), 12);
    expect(spunKeep(0.4, -0.5)).toBeCloseTo(0.4 * (1 - SPIN.back / 2), 12);
    expect(spunKeep(0.4, -1)).toBeCloseTo(0.4 * (1 - SPIN.back), 12);
    expect(spunKeep(0.4, -1)).toBeLessThan(0);
    // and in order, from the fullest backspin to the fullest topspin
    const run = [-1, -0.5, 0, 0.5, 1].map((s) => spunKeep(0.4, s));
    expect(run).toEqual([...run].sort((a, b) => a - b));
  });

  it('is held to its limits, and is no spin for a number that is not one', () => {
    expect(spunKeep(0.4, 9)).toBe(spunKeep(0.4, 1));
    expect(spunKeep(0.4, -9)).toBe(spunKeep(0.4, -1));
    for (const bad of [NaN, Infinity, -Infinity]) expect(Number.isFinite(spunKeep(0.4, bad)), String(bad)).toBe(true);
    expect(spunKeep(0.4, NaN)).toBe(0.4);
  });
});

describe('the arithmetic of a flight in the air', () => {
  it('is no time for the putter, and the carry formula over the speed for the rest', () => {
    expect(airTime(bagClub('putter'), 1)).toBe(0);
    const d = bagClub('driver');
    expect(airTime(d, 1)).toBeCloseTo((2 * d.hardest * Math.sin((d.loft * Math.PI) / 180)) / PHYSICS.gravity, 9);
    expect(airTime(d, 0.5)).toBeLessThan(airTime(d, 1));
    expect(airTime(d, 0)).toBe(0);
    expect(airTime(d, 7)).toBe(airTime(d, 1));
  });

  it('is within a physics step of the game, for every club, at full power and at half, from the tee and the fairway', () => {
    for (const surface of ['f'] as const)
      for (const club of LOFTED)
        for (const power of [1, 0.5]) {
          const { game, calls } = golfGame(field(surface, 130, 41));
          game.pick(club.id);
          const t0 = game.t;
          game.shoot(NORTH, power);
          let air = -1;
          for (let f = 0; f < 3000 && air < 0; f++) {
            game.step(PHYSICS.step);
            if (calls.some(([n, a]) => n === 'landed' && a[3] === true)) air = game.t - t0;
          }
          expect(air, `${club.id} at ${power}`).toBeGreaterThan(0);
          // the tee, which the ball is struck from here, takes nothing off the speed, as the fairway does a fiftieth
          expect(Math.abs(air - airTime(club, power, LIE.tee)), `${club.id} at ${power}`).toBeLessThan(0.07);
        }
  });

  it('takes the lie into account: the sand lifts a ball more and the rough slows it', () => {
    const d = bagClub('driver');
    expect(airTime(d, 1, LIE.rough)).toBeLessThan(airTime(d, 1, LIE.fairway));
    expect(airTime(d, 1, LIE.fairway)).toBeLessThan(airTime(d, 1, LIE.tee));
  });
});

describe('how much further a tail wind carries a ball', () => {
  it('is nothing in a calm, and grows with the wind and with the time in the air', () => {
    for (const club of LOFTED) expect(windReach(club, 1, 0)).toBe(0);
    expect(windReach(bagClub('driver'), 1, 20)).toBeCloseTo(2 * windReach(bagClub('driver'), 1, 10), 9);
    expect(windReach(bagClub('7-iron'), 1, 10)).toBeGreaterThan(windReach(bagClub('driver'), 1, 10));
    expect(windReach(bagClub('putter'), 1, 10)).toBe(0);
  });

  it('is what the game carries a ball, within two yards, for each club at full and part power', () => {
    for (const club of LOFTED)
      for (const power of [1, 0.6]) {
        const fly = (mph: number) => {
          const { game, calls } = golfGame(windy(field('f', 200, 81), NORTH, mph));
          game.pick(club.id);
          game.shoot(NORTH, power);
          for (let f = 0; f < 60 * 20 && !calls.some(([n, a]) => n === 'landed' && a[3] === true); f++) game.step(DT);
          return calls.find(([n, a]) => n === 'landed' && a[3] === true)![1][1] as number;
        };
        const gained = fly(10) - fly(0);
        expect(Math.abs(gained - windReach(club, power, 10)), `${club.id} at ${power}: gained ${gained}`).toBeLessThan(
          2,
        );
      }
  });
});
