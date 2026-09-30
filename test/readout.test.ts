/** What a golfer is told of the pin: how far it is and how much higher or lower than the ball, in yards. */
import { describe, expect, it } from 'vitest';
import { heightAt, layoutOf } from '../src/arena';
import { landingText, pinReadout, pinText } from '../src/readout';
import { LIE } from '../src/surfaces';
import { field } from './helpers';

const rows = 60,
  cols = 41;

/** The ground rising to the north by `per` a tile, from the south. */
function rising(per: number) {
  return Float32Array.from({ length: rows * cols }, (_, k) => per * Math.floor(k / cols));
}

describe('the readout of the pin', () => {
  it('is the distance along the ground to the cup in yards, a unit being a yard, and level on level ground', () => {
    const l = layoutOf(field('f', rows, cols).map);
    const r = pinReadout(l, l.tee.x, l.tee.y);
    expect(r.yards).toBeCloseTo(Math.hypot(l.cup.x - l.tee.x, l.cup.y - l.tee.y), 9);
    expect(r.rise).toBe(0);
    // from any other spot on the ground, the same sum
    const p = pinReadout(l, l.cup.x + 30, l.cup.y - 40);
    expect(p.yards).toBeCloseTo(50, 9);
  });

  it('says how much higher the cup stands than the ball, and lower as a number under nought', () => {
    const l = layoutOf(field('f', rows, cols, rising(0.3)).map, rising(0.3));
    const up = pinReadout(l, l.tee.x, l.tee.y);
    expect(up.rise).toBeCloseTo(heightAt(l, l.cup.x, l.cup.y) - heightAt(l, l.tee.x, l.tee.y), 9);
    expect(up.rise).toBeGreaterThan(10);
    const down = pinReadout(l, l.cup.x, l.cup.y + 1);
    expect(down.rise).toBeLessThan(0);
    expect(down.rise).toBeCloseTo(heightAt(l, l.cup.x, l.cup.y) - heightAt(l, l.cup.x, l.cup.y + 1), 9);
  });

  it('is the ball at the cup when the ball is in it: nothing to go', () => {
    const l = layoutOf(field('f', rows, cols).map);
    expect(pinReadout(l, l.cup.x, l.cup.y)).toEqual({ yards: 0, rise: 0 });
  });

  it('reads as words: whole yards, and an arrow for a rise or a fall of half a yard or more', () => {
    expect(pinText({ yards: 503.4, rise: 4.2 })).toBe('503 yd ▲ 4');
    expect(pinText({ yards: 120.6, rise: -7.6 })).toBe('121 yd ▼ 8');
    expect(pinText({ yards: 88, rise: 0.4 })).toBe('88 yd');
    expect(pinText({ yards: 88, rise: -0.49 })).toBe('88 yd');
    expect(pinText({ yards: 0, rise: 0 })).toBe('0 yd');
  });
});

describe('the words for where a shot would come down', () => {
  const base = { carry: 249.4, end: 'landed' as const, lie: LIE.fairway, hit: false };

  it('says how far it goes and what it comes down on, in whole yards', () => {
    expect(landingText(base)).toBe('lands 249 yd · fairway');
    expect(landingText({ ...base, carry: 120.6, lie: LIE.sand })).toBe('lands 121 yd · sand');
    expect(landingText({ ...base, carry: 8, lie: LIE.green })).toBe('lands 8 yd · putting green');
    expect(landingText({ ...base, lie: LIE.rough })).toBe('lands 249 yd · rough');
  });

  it('says so when it goes in the water or out of bounds, which is the news, and when it drops in the cup', () => {
    expect(landingText({ ...base, end: 'water' })).toBe('lands 249 yd · in the water');
    expect(landingText({ ...base, end: 'out' })).toBe('lands 249 yd · out of bounds');
    expect(landingText({ ...base, end: 'holed' })).toBe('drops in the cup');
  });

  it('says a tree is in the way, before where it comes down after it', () => {
    expect(landingText({ ...base, carry: 88, hit: true })).toBe('hits a tree · lands 88 yd · fairway');
    expect(landingText({ ...base, end: 'water', hit: true })).toBe('hits a tree · lands 249 yd · in the water');
  });
});
