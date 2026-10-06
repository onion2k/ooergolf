/** The bursts of particles for what happens: a puff of grass at a stroke, confetti and sparkles at the cup, and a splash. */
import { describe, expect, it } from 'vitest';
import { WATER_LEVEL } from '../src/arena';
import { cupBurst, splash, strikePuff } from '../src/bursts';

describe('the bursts', () => {
  it('puff grass from under the ball when it is struck, more of it for a harder shot', () => {
    const soft = strikePuff(3, 4, 0.1),
      hard = strikePuff(3, 4, 1);
    expect(soft.length).toBeGreaterThan(0);
    const count = (es: typeof soft) => es.reduce((a, e) => a + e.count, 0);
    expect(count(hard)).toBeGreaterThan(count(soft));
    for (const e of hard) {
      expect(e.position.slice(0, 2)).toEqual([3, 4]);
      expect(e.colour[1], 'grass is green').toBeGreaterThan(e.colour[0]);
    }
  });

  it('puffs sand from under a ball struck out of sand, as much of it, in the colour of sand and not of grass', () => {
    const grass = strikePuff(3, 4, 0.6),
      sand = strikePuff(3, 4, 0.6, 'sand');
    expect(sand.reduce((a, e) => a + e.count, 0)).toBe(grass.reduce((a, e) => a + e.count, 0));
    for (const e of sand) {
      expect(e.position.slice(0, 2)).toEqual([3, 4]);
      // sand: red over green over blue, warm and light; not grass, which is green over red
      expect(e.colour[0], 'warm').toBeGreaterThan(e.colour[1]);
      expect(e.colour[1]).toBeGreaterThan(e.colour[2]);
      expect(e.colour[0], 'light').toBeGreaterThan(0.8);
    }
    expect(strikePuff(3, 4, 0.6, 'grass')).toEqual(grass);
  });

  it('throws confetti of many colours up out of the cup, and sparkles with it, more for a hole in one', () => {
    const par = cupBurst(1, 2, false),
      ace = cupBurst(1, 2, true);
    const colours = new Set(par.map((e) => e.colour.join()));
    expect(colours.size, 'confetti of many colours').toBeGreaterThanOrEqual(4);
    for (const e of par) {
      expect(e.velocity[2], 'up out of the cup').toBeGreaterThan(0);
      expect(e.gravity ?? 1, 'and falls back').toBeGreaterThan(0);
    }
    expect(ace.reduce((a, e) => a + e.count, 0)).toBeGreaterThan(par.reduce((a, e) => a + e.count, 0));
    expect(
      par.some((e) => e.alpha === 0),
      'sparkles glow, drawn additively',
    ).toBe(true);
  });

  it('is exactly what it was without a style: a call that gives none and one that gives the plain style are the same', () => {
    for (const ace of [false, true]) {
      expect(cupBurst(1, 2, ace, 'plain')).toEqual(cupBurst(1, 2, ace));
      expect(cupBurst(1, 2, ace, undefined)).toEqual(cupBurst(1, 2, ace));
    }
    // held to a literal, so the default never moves by a figure drawn elsewhere
    const par = cupBurst(1, 2, false);
    expect(par.length).toBe(6);
    expect(par.map((e) => [e.count, e.life, e.spread])).toEqual([
      [14, 1.8, 5],
      [14, 1.8, 5],
      [14, 1.8, 5],
      [14, 1.8, 5],
      [14, 1.8, 5],
      [14, 0.7, 5],
    ]);
  });

  it('throws more confetti, for longer, wider and in the colours of the rainbow, when the cup is the confetti cup', () => {
    for (const ace of [false, true]) {
      const plain = cupBurst(1, 2, ace),
        big = cupBurst(1, 2, ace, 'confetti');
      const count = (es: typeof plain) => es.reduce((a, e) => a + e.count, 0);
      expect(count(big)).toBeGreaterThanOrEqual(count(plain) * 2.4);
      const bits = big.filter((e) => e.alpha !== 0),
        was = plain.filter((e) => e.alpha !== 0);
      expect(Math.max(...bits.map((e) => e.life))).toBeGreaterThanOrEqual(2.6);
      expect(Math.max(...bits.map((e) => e.life))).toBeGreaterThan(Math.max(...was.map((e) => e.life)));
      expect(Math.min(...bits.map((e) => e.spread))).toBeGreaterThan(Math.max(...was.map((e) => e.spread)));
      expect(new Set(bits.map((e) => e.colour.join())).size, 'six colours of the rainbow').toBe(6);
      for (const e of big) {
        expect(e.position.slice(0, 2)).toEqual([1, 2]);
        expect(e.velocity[2]).toBeGreaterThan(0);
      }
    }
  });

  it("keeps even the biggest burst inside the renderer's ring of 1024 particles, with room for a stroke's puff and a splash", () => {
    const total = (es: { count: number }[]) => es.reduce((a, e) => a + e.count, 0);
    const ace = total(cupBurst(0, 0, true, 'confetti'));
    expect(ace).toBeLessThanOrEqual(1024 - total(strikePuff(0, 0, 1)) - total(splash(0, 0)));
  });

  it('splashes up where the ball went in, in the colour of water', () => {
    const [s] = splash(5, 6);
    // from the water's own surface, which lies below the grass, and falls back onto it
    expect(s.position).toEqual([5, 6, WATER_LEVEL]);
    expect(s.floor).toBeLessThan(WATER_LEVEL);
    expect(s.colour[2]).toBeGreaterThan(s.colour[0]);
  });
});
