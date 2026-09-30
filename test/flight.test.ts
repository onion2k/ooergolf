/**
 * The strike: a club, the power dragged, the aim and the lie in, and a launch out. Pure arithmetic and chance
 * handed in, so it is tried without a game: the split of the speed by the loft, what a lie takes off it, and the
 * scatter, which is the same for a seed, grows with the power dragged, never gives a club more than it has, and
 * spends no chance at all on a putt.
 */
import { describe, expect, it } from 'vitest';
import { BAG, PUTTER, bagClub } from '../src/bag';
import { DISPERSION, maxScatter, strike } from '../src/flight';
import { strikeSpeed } from '../src/arena';
import { LIE, SURFACES } from '../src/surfaces';
import { seeded } from '../src/random';

/** A chance that always says the middle: no scatter, whatever the club. */
const middle = () => 0.5;

const speedOf = (v: { vx: number; vy: number; vz: number }) => Math.hypot(v.vx, v.vy, v.vz);

describe('the strike', () => {
  it('is the club’s speed at the loft, along the aim, with no scatter and no lie to take from it', () => {
    const c = bagClub('7-iron');
    const s = strike(c, 0.64, 0.3, LIE.tee, middle);
    const speed = strikeSpeed(0.64, c.hardest);
    const loft = (c.loft * Math.PI) / 180;
    expect(speedOf(s)).toBeCloseTo(speed, 6);
    expect(s.vz).toBeCloseTo(speed * Math.sin(loft), 6);
    expect(Math.atan2(s.vy, s.vx)).toBeCloseTo(0.3, 6);
    expect(Math.hypot(s.vx, s.vy)).toBeCloseTo(speed * Math.cos(loft), 6);
  });

  it('is flat along the ground for a putter, as the minigolf putter is, and the same speed as strikeSpeed', () => {
    const s = strike(PUTTER, 0.5, -1, LIE.green, middle);
    expect(s.vz).toBe(0);
    expect(Math.hypot(s.vx, s.vy)).toBeCloseTo(strikeSpeed(0.5, PUTTER.hardest), 6);
  });

  it('takes from the speed what the lie takes, and adds the sand’s loft', () => {
    const c = bagClub('sand-wedge');
    const tee = strike(c, 1, 0, LIE.tee, middle);
    for (const lie of [LIE.fairway, LIE.rough, LIE.sand]) {
      const s = strike(c, 1, 0, lie, middle);
      expect(speedOf(s), `the lie ${lie}`).toBeCloseTo(speedOf(tee) * SURFACES[lie].power, 6);
    }
    // the rough costs a quarter of the club’s speed or so, and the sand more
    expect(SURFACES[LIE.rough].power).toBeLessThan(0.85);
    expect(SURFACES[LIE.rough].power).toBeGreaterThan(0.65);
    expect(SURFACES[LIE.sand].power).toBeLessThan(SURFACES[LIE.rough].power);
    // more loft from the sand: a steeper launch
    const rise = (v: { vx: number; vy: number; vz: number }) => Math.atan2(v.vz, Math.hypot(v.vx, v.vy));
    expect(rise(strike(c, 1, 0, LIE.sand, middle))).toBeGreaterThan(rise(strike(c, 1, 0, LIE.fairway, middle)) + 0.05);
  });

  it('is the same for a seed, and different for another', () => {
    const c = bagClub('driver');
    const a = strike(c, 1, 0, LIE.tee, seeded(7)),
      b = strike(c, 1, 0, LIE.tee, seeded(7)),
      other = strike(c, 1, 0, LIE.tee, seeded(8));
    expect(a).toEqual(b);
    expect(a).not.toEqual(other);
  });

  it('scatters more the harder the drag: the spread of a hundred swings at full power is more than at a quarter', () => {
    const c = bagClub('driver');
    const spread = (power: number) => {
      const random = seeded(3);
      let sum = 0;
      for (let k = 0; k < 400; k++) {
        const s = strike(c, power, 0, LIE.tee, random);
        sum += Math.atan2(s.vy, s.vx) ** 2;
      }
      return Math.sqrt(sum / 400);
    };
    expect(spread(1)).toBeGreaterThan(spread(0.25) * 2.5);
    expect(spread(0.25)).toBeGreaterThan(spread(0.05));
    // and the aim is on average true: it is a scatter and not a pull to one side
    const random = seeded(4);
    let mean = 0;
    for (let k = 0; k < 400; k++) {
      const s = strike(c, 1, 0, LIE.tee, random);
      mean += Math.atan2(s.vy, s.vx) / 400;
    }
    expect(Math.abs(mean)).toBeLessThan(0.006);
  });

  it('never scatters past what the club’s spread allows, and never strikes harder than the club can or a mishit loses more than it may', () => {
    for (const c of BAG) {
      const random = seeded(11);
      for (let k = 0; k < 300; k++) {
        const power = random();
        const lie = [LIE.tee, LIE.fairway, LIE.rough, LIE.sand, LIE.green][k % 5];
        const s = strike(c, power, 0.7, lie, random);
        const off = Math.atan2(s.vy, s.vx) - 0.7;
        expect(Math.abs(off), `${c.id} off the aim`).toBeLessThanOrEqual(maxScatter(c, lie, power) + 1e-9);
        const clean = strikeSpeed(power, c.hardest) * SURFACES[lie].power;
        expect(speedOf(s), `${c.id} speed`).toBeLessThanOrEqual(clean * 1.0000001);
        expect(speedOf(s), `${c.id} loses no more than it may`).toBeGreaterThanOrEqual(
          clean * (1 - DISPERSION.loss * power) * 0.9999999,
        );
      }
    }
  });

  it('has a limit to its scatter that grows with the power, is none for a putter, and is wider from the rough', () => {
    const c = bagClub('driver');
    expect(maxScatter(c, LIE.tee, 0)).toBe(0);
    expect(maxScatter(c, LIE.tee, 1)).toBeCloseTo((c.spread * Math.PI) / 180, 9);
    expect(maxScatter(c, LIE.tee, 0.5)).toBeCloseTo(maxScatter(c, LIE.tee, 1) / 2, 9);
    expect(maxScatter(c, LIE.rough, 1)).toBeGreaterThan(maxScatter(c, LIE.tee, 1));
    expect(maxScatter(PUTTER, LIE.rough, 1)).toBe(0);
  });

  it('never gives a mishit more speed than the club has, only less', () => {
    const c = bagClub('driver');
    const random = seeded(5);
    let lost = 0;
    for (let k = 0; k < 500; k++) {
      const s = strike(c, 1, 0, LIE.tee, random);
      expect(speedOf(s)).toBeLessThanOrEqual(c.hardest + 1e-9);
      if (speedOf(s) < c.hardest - 1e-6) lost++;
    }
    // about half swing true and half lose a little: neither is all of them
    expect(lost).toBeGreaterThan(100);
    expect(lost).toBeLessThan(400);
  });

  it('spends no chance on a putt, so a round of minigolf plays as it did', () => {
    let drawn = 0;
    const counting = () => (drawn++, 0.3);
    strike(PUTTER, 1, 0, LIE.green, counting);
    strike(PUTTER, 0.2, 2, LIE.rough, counting);
    expect(drawn).toBe(0);
  });

  it('is wilder from the rough than from the tee, at the same power', () => {
    const c = bagClub('7-iron');
    const spread = (lie: number) => {
      const random = seeded(9);
      let sum = 0;
      for (let k = 0; k < 400; k++) {
        const s = strike(c, 1, 0, lie as (typeof LIE)[keyof typeof LIE], random);
        sum += Math.atan2(s.vy, s.vx) ** 2;
      }
      return Math.sqrt(sum / 400);
    };
    expect(spread(LIE.rough)).toBeGreaterThan(spread(LIE.tee) * 1.2);
  });
});
