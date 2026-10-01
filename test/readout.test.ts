/** What a golfer is told of the pin: how far it is and how much higher or lower than the ball, in yards. */
import { describe, expect, it } from 'vitest';
import { heightAt, layoutOf } from '../src/arena';
import { GREENS } from '../src/surfaces';
import {
  greensText,
  landingText,
  pinReadout,
  pinText,
  puttText,
  shapingWords,
  windArrow,
  windText,
} from '../src/readout';
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

describe('the words for a shot with a shape and a spin', () => {
  const base = { carry: 262.2, end: 'landed' as const, lie: LIE.fairway, hit: false };

  it('says the shape and the spin first, and nothing for a shot that is straight and flat', () => {
    expect(landingText({ ...base, shape: 1 })).toBe('fade \u00b7 lands 262 yd \u00b7 fairway');
    expect(landingText({ ...base, shape: -1 })).toBe('draw \u00b7 lands 262 yd \u00b7 fairway');
    expect(landingText({ ...base, spin: -1 })).toBe('back \u00b7 lands 262 yd \u00b7 fairway');
    expect(landingText({ ...base, spin: 1 })).toBe('top \u00b7 lands 262 yd \u00b7 fairway');
    expect(landingText({ ...base, shape: 1, spin: -1 })).toBe('fade \u00b7 back \u00b7 lands 262 yd \u00b7 fairway');
    // none given, or nought, is as it always was
    expect(landingText({ ...base, shape: 0, spin: 0 })).toBe(landingText(base));
    expect(landingText(base)).toBe('lands 262 yd \u00b7 fairway');
  });

  it('keeps the shape before a tree, the water and the cup', () => {
    expect(landingText({ ...base, shape: -1, hit: true })).toBe(
      'draw \u00b7 hits a tree \u00b7 lands 262 yd \u00b7 fairway',
    );
    expect(landingText({ ...base, shape: 1, end: 'water' })).toBe('fade \u00b7 lands 262 yd \u00b7 in the water');
    expect(landingText({ ...base, spin: 1, end: 'holed' })).toBe('top \u00b7 drops in the cup');
  });

  it('names a shape and a spin by the way of its sign', () => {
    expect(shapingWords(0, 0)).toEqual([]);
    expect(shapingWords(0.5, -0.2)).toEqual(['fade', 'back']);
    expect(shapingWords(-1, 1)).toEqual(['draw', 'top']);
  });
});

describe('the wind on the page', () => {
  it('is whole miles an hour, or calm, so a player always knows', () => {
    expect(windText(0)).toBe('calm');
    expect(windText(0.4)).toBe('calm');
    expect(windText(12)).toBe('12 mph');
    expect(windText(11.6)).toBe('12 mph');
    expect(windText(25)).toBe('25 mph');
  });

  it('turns an arrow drawn pointing up by the way the wind blows across the screen, for a camera facing north', () => {
    // the camera at azimuth nought faces +y: up the screen is up the course and its right is +x
    expect(windArrow(0, 1, 0)).toBeCloseTo(0, 9);
    expect(windArrow(1, 0, 0)).toBeCloseTo(90, 9);
    expect(Math.abs(windArrow(0, -1, 0))).toBeCloseTo(180, 9);
    expect(windArrow(-1, 0, 0)).toBeCloseTo(-90, 9);
  });

  it('turns with the camera: turned a quarter, a wind that blew up the screen blows from the side', () => {
    // facing (sin a, cos a): at a quarter turn it faces +x, whose right is -y, so +x is up and +y is to the left
    expect(windArrow(1, 0, Math.PI / 2)).toBeCloseTo(0, 9);
    expect(windArrow(0, 1, Math.PI / 2)).toBeCloseTo(-90, 9);
    expect(windArrow(0, -1, Math.PI / 2)).toBeCloseTo(90, 9);
    // and every heading of the camera keeps the wind where it is round the compass, by the camera's turn
    for (const wind of [0.3, 2, 4.4]) {
      const x = Math.cos(wind),
        y = Math.sin(wind);
      for (const a of [-3, -1.2, 0, 0.7, 2.5]) {
        const turned = windArrow(x, y, a) - windArrow(x, y, 0);
        const wrapped = ((((turned + a * (180 / Math.PI)) % 360) + 540) % 360) - 180;
        expect(wrapped, `wind ${wind}, camera ${a}`).toBeCloseTo(0, 6);
      }
    }
  });
});

describe('the readout of a putt’s break', () => {
  it('says how far to aim off the cup and to which side, in yards to a tenth, and how much it climbs', () => {
    expect(puttText({ across: 1.6, rise: 0.4 })).toBe('Putt: aim 1.6 yd right, uphill 0.4 yd');
    expect(puttText({ across: -2.26, rise: -1.04 })).toBe('Putt: aim 2.3 yd left, downhill 1.0 yd');
  });

  it('says nothing of the aim under a tenth of a yard, and nothing of the rise under it either', () => {
    expect(puttText({ across: 0.09, rise: 0.4 })).toBe('Putt: uphill 0.4 yd');
    expect(puttText({ across: -0.04, rise: -0.5 })).toBe('Putt: downhill 0.5 yd');
    expect(puttText({ across: 1.2, rise: 0.09 })).toBe('Putt: aim 1.2 yd right');
    expect(puttText({ across: -1.2, rise: -0.09 })).toBe('Putt: aim 1.2 yd left');
    // exactly a tenth is a tenth
    expect(puttText({ across: 0.1, rise: 0.1 })).toBe('Putt: aim 0.1 yd right, uphill 0.1 yd');
  });

  it('is a straight, level putt when there is neither, and never a number that is not one', () => {
    expect(puttText({ across: 0, rise: 0 })).toBe('Putt: straight');
    expect(puttText({ across: NaN, rise: Infinity })).toBe('Putt: straight');
  });

  it('names the greens’ speed from the hole’s own, for a golf hole that has one, and nothing for one that has none', () => {
    expect(greensText(GREENS.fast)).toBe('Fast greens');
    expect(greensText(GREENS.normal)).toBe('Medium greens');
    expect(greensText(GREENS.slow)).toBe('Slow greens');
    expect(greensText(undefined)).toBeNull();
    // between the three, as `speedName` says
    expect(greensText(14)).toBe('Fast greens');
    expect(greensText(19.5)).toBe('Slow greens');
  });
});
