/** The glow ball's trail: a fixed ring of where the ball has been, written as sprites that fade by game time. */
import { describe, expect, it } from 'vitest';
import { SPRITE_STRIDE } from 'artshape-render/game/particles';
import { PALETTE } from '../src/models/palette';
import { RUNGS } from '../src/quality';
import { TRAIL, Trail, trailDrawn, trailInto } from '../src/trail';

const colour = PALETTE.trail;

describe('the glow ball trail', () => {
  it('keeps a fixed ring of 48 past places, however far the ball goes', () => {
    const trail = new Trail();
    expect(trail.capacity).toBe(48);
    expect(TRAIL.most).toBe(48);
    for (let i = 0; i < 500; i++) trail.record(i / 60, i * 0.5, 0, 0.35);
    expect(trail.count).toBe(48);
    expect(trail.x.length, 'the ring is never grown').toBe(48);
    expect(trail.at.length).toBe(48);
  });

  it('is written once a frame while the ball moves, and not for a ball at rest or a repeat of the same moment', () => {
    const trail = new Trail();
    expect(trail.record(0, 1, 1, 0.3)).toBe(true);
    expect(trail.record(0, 5, 5, 0.3), 'the same moment drawn again').toBe(false);
    expect(trail.record(1 / 60, 1, 1, 0.3), 'not moved').toBe(false);
    expect(trail.record(2 / 60, 1.5, 1, 0.3)).toBe(true);
    expect(trail.count).toBe(2);
  });

  it('is cleared, and a clock gone backwards starts it afresh', () => {
    const trail = new Trail();
    for (let i = 0; i < 10; i++) trail.record(i / 60, i, 0, 0.3);
    trail.clear();
    expect(trail.count).toBe(0);
    for (let i = 0; i < 10; i++) trail.record(10 + i / 60, i, 0, 0.3);
    trail.record(1, 0, 0, 0.3);
    expect(trail.count, 'a new round puts game time back').toBe(1);
  });

  it("writes the renderer's sprites, eight floats each, newest first and brightest, fading and shrinking with age", () => {
    const trail = new Trail();
    for (let i = 0; i < 20; i++) trail.record(i / 60, i * 0.5, 2, 0.4);
    const out = new Float32Array(256 * SPRITE_STRIDE);
    const now = 19 / 60;
    const n = trailInto(out, trail, now, 0.35, colour);
    expect(n).toBe(20);
    let last = Infinity,
      lastSize = Infinity;
    for (let k = 0; k < n; k++) {
      const o = k * SPRITE_STRIDE;
      expect([out[o + 4], out[o + 5], out[o + 6]]).toEqual(colour.map(Math.fround));
      expect(out[o + 7], 'fades with age').toBeLessThan(last);
      expect(out[o + 3], 'shrinks with age').toBeLessThan(lastSize);
      expect(out[o + 7]).toBeGreaterThan(0);
      expect(out[o + 7]).toBeLessThanOrEqual(Math.fround(TRAIL.alpha));
      last = out[o + 7];
      lastSize = out[o + 3];
    }
    expect(out[0], 'the newest is where the ball is').toBeCloseTo(9.5);
    expect(out[3]).toBeLessThanOrEqual(0.35 * TRAIL.size + 1e-6);
  });

  it('is gone once its life is up, exactly, and after the ball is gone it dies out with the clock', () => {
    const trail = new Trail();
    for (let i = 0; i < 10; i++) trail.record(i / 60, i, 0, 0.3);
    const out = new Float32Array(256 * SPRITE_STRIDE);
    const t0 = 9 / 60;
    expect(trailInto(out, trail, t0, 0.35, colour)).toBe(10);
    expect(trailInto(out, trail, t0 + TRAIL.lasts + 1, 0.35, colour)).toBe(0);
    // the oldest goes first
    const half = trailInto(out, trail, 9 / 60 + TRAIL.lasts - 5 / 60, 0.35, colour);
    expect(half).toBeLessThan(10);
    expect(half).toBeGreaterThan(0);
  });

  it('is the same every time for the same game time, and never reads the clock or chance', () => {
    const run = () => {
      const trail = new Trail();
      for (let i = 0; i < 30; i++) trail.record(i / 60, Math.sin(i), Math.cos(i), 0.4);
      const out = new Float32Array(256 * SPRITE_STRIDE);
      const n = trailInto(out, trail, 30 / 60, 0.35, colour);
      return Array.from(out.slice(0, n * SPRITE_STRIDE));
    };
    expect(run()).toEqual(run());
  });

  it("stays inside the renderer's 256 sprite slots", () => {
    expect(TRAIL.most).toBeLessThanOrEqual(256);
  });

  it('is drawn only with the item held, and not on a rung of the ladder that gives the particles up', () => {
    expect(trailDrawn(true, RUNGS[0])).toBe(true);
    expect(trailDrawn(false, RUNGS[0]), 'no item, no trail').toBe(false);
    for (const rung of RUNGS.slice(1)) expect(trailDrawn(true, rung)).toBe(false);
    expect(trailDrawn(true, RUNGS[RUNGS.length - 1]), 'the lowest rung').toBe(false);
  });
});
