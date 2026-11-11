/** When the aim's preview is worked out again: any one thing that changed makes it so, and nothing changed leaves it. */
import { describe, expect, it } from 'vitest';
import { flightStale, restedAnew, rollStale, type PreviewedShot } from '../src/aimstale';
import { END_RING, Preview } from '../src/preview';

const done: PreviewedShot = { x: 1, y: 2, angle: 0.5, power: 0.6, club: '7i', shape: 0, spin: 0, tick: 3 };
const flight = (o: Partial<PreviewedShot> = {}) => {
  const s = { ...done, ...o };
  return flightStale(done, s.x, s.y, s.angle, s.power, s.club, s.shape, s.spin);
};
const roll = (o: Partial<PreviewedShot> = {}) => {
  const s = { ...done, ...o };
  return rollStale(done, s.x, s.y, s.angle, s.power, s.shape, s.spin, s.tick);
};

describe('a flight is stale', () => {
  it('when nothing it was worked out for has changed, it is not', () => {
    expect(flight()).toBe(false);
  });

  it('when any one of the ball, the aim, the club, the shape or the spin has', () => {
    for (const [what, change] of [
      ['ball x', { x: 1.1 }],
      ['ball y', { y: 2.1 }],
      ['angle', { angle: 0.6 }],
      ['power', { power: 0.7 }],
      ['club', { club: 'driver' }],
      ['shape', { shape: 1 }],
      ['spin', { spin: -1 }],
    ] as const) {
      expect(flight(change), what).toBe(true);
    }
  });

  it('after the club is forgotten, as it is when the aim is put away, and before any was made', () => {
    expect(flightStale({ ...done, club: '' }, 1, 2, 0.5, 0.6, '7i', 0, 0)).toBe(true);
    const fresh: PreviewedShot = { x: NaN, y: NaN, angle: NaN, power: NaN, club: '', shape: NaN, spin: NaN, tick: NaN };
    expect(flightStale(fresh, 1, 2, 0.5, 0.6, '7i', 0, 0)).toBe(true);
  });

  it("and does not mind the pushers' tick, which is a hole of minigolf's", () => {
    expect(flight({ tick: 9 })).toBe(false);
  });
});

describe('a roll is stale', () => {
  it('when nothing has changed, it is not', () => {
    expect(roll()).toBe(false);
  });

  it('when any one of the ball, the aim, the shape, the spin or the tick has', () => {
    for (const [what, change] of [
      ['ball x', { x: 1.1 }],
      ['ball y', { y: 2.1 }],
      ['angle', { angle: 0.6 }],
      ['power', { power: 0.7 }],
      ['shape', { shape: 1 }],
      ['spin', { spin: 1 }],
      ['tick', { tick: 4 }],
    ] as const) {
      expect(roll(change), what).toBe(true);
    }
  });

  it('and does not mind the club, which is the putter', () => {
    expect(roll({ club: 'wedge' })).toBe(false);
  });
});

describe('a reading of where the ball lies is stale', () => {
  it('when the ball has moved from where it was read, or nothing was read', () => {
    expect(restedAnew({ x: 1, y: 2 }, 1, 2)).toBe(false);
    expect(restedAnew({ x: 1, y: 2 }, 1.5, 2)).toBe(true);
    expect(restedAnew({ x: 1, y: 2 }, 1, 2.5)).toBe(true);
    expect(restedAnew({ x: NaN, y: NaN }, 1, 2)).toBe(true);
  });

  it("and, for the putt's words, when the arrows they were worked out for have changed", () => {
    expect(restedAnew({ x: 1, y: 2 }, 1, 2, 'green', 'green')).toBe(false);
    expect(restedAnew({ x: 1, y: 2 }, 1, 2, 'green', 'near')).toBe(true);
    expect(restedAnew({ x: 1, y: 2 }, 1, 2, null, 'green')).toBe(true);
  });
});

describe("how a preview ends is the ring's code", () => {
  it('is none for a landing, 1 for water, 2 for out and 3 for the cup', () => {
    const p = new Preview();
    const code = (end: Preview['end']) => ((p.end = end), END_RING(p.end));
    expect([code('landed'), code('water'), code('out'), code('holed')]).toEqual([0, 1, 2, 3]);
  });
});
