/** The bursts of particles for what happens: a puff of grass at a stroke, confetti and sparkles at the cup, and a splash. */
import { describe, expect, it } from 'vitest';
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

  it('splashes up where the ball went in, in the colour of water', () => {
    const [s] = splash(5, 6);
    expect(s.position).toEqual([5, 6, 0]);
    expect(s.colour[2]).toBeGreaterThan(s.colour[0]);
  });
});
