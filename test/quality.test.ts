/** Stepping the picture down on a slow machine: a rung at a time, for frames that are slow and stay slow, and never back up by itself. */
import { describe, expect, it } from 'vitest';
import { FRAME_BUDGET_MS, Governor, RUNGS, economyFor } from '../src/quality';

/** Frames of `ms` each, `n` of them, into the governor; how many times it stepped. */
function feed(g: Governor, ms: number, n: number) {
  let stepped = 0;
  for (let i = 0; i < n; i++) if (g.frame(ms)) stepped++;
  return stepped;
}

describe('the quality ladder', () => {
  it('has rungs that only ever take things away: particles and half the grass, then shade, then the rest and the grass', () => {
    expect(RUNGS.length).toBeGreaterThanOrEqual(4);
    const off = RUNGS.map((r) => economyFor(r));
    expect(off[0]).toMatchObject({
      particles: true,
      shadows: true,
      occlusion: true,
      post: true,
      fog: true,
      effects: 1,
      grass: 1,
      wind: true,
    });
    expect(off[1]).toMatchObject({
      particles: false,
      shadows: true,
      occlusion: true,
      post: true,
      fog: true,
      grass: 0.5,
      wind: false,
    });
    expect(off[2]).toMatchObject({
      particles: false,
      shadows: false,
      occlusion: false,
      post: true,
      fog: true,
      grass: 0.5,
      wind: false,
    });
    expect(off[3]).toMatchObject({
      particles: false,
      shadows: false,
      occlusion: false,
      post: false,
      fog: false,
      effects: 0,
      grass: 0,
    });
  });

  it('stays where it is on a machine that keeps up', () => {
    const g = new Governor();
    expect(feed(g, 8, 2000)).toBe(0);
    expect(g.rung).toBe(0);
  });

  it('steps down a rung for frames that stay slow, waits to see before the next, and stops at the last', () => {
    const g = new Governor();
    const slow = FRAME_BUDGET_MS * 1.5;
    expect(feed(g, slow, g.window - 1), 'not before it has seen enough').toBe(0);
    expect(feed(g, slow, 1)).toBe(1);
    expect(g.rung).toBe(1);
    expect(feed(g, slow, g.window - 1), 'it waits a window after a step').toBe(0);
    feed(g, slow, 10_000);
    expect(g.rung).toBe(RUNGS.length - 1);
    feed(g, 8, 10_000);
    expect(g.rung, 'never back up by itself').toBe(RUNGS.length - 1);
  });

  it('pays no mind to a stall, or to a gap where the page was hidden', () => {
    const g = new Governor();
    for (let i = 0; i < 2000; i++) g.frame(i % 100 === 0 ? 60 : 8);
    expect(g.rung, 'a hitch now and then').toBe(0);
    for (let i = 0; i < 50; i++) g.frame(2000);
    expect(g.rung, 'the page hidden').toBe(0);
  });

  it('can be put on a rung and held there, for a test or a player who asks', () => {
    const g = new Governor(2);
    expect(g.rung).toBe(2);
    expect(g.held).toBe(true);
    feed(g, 100, 10_000);
    expect(g.rung).toBe(2);
    expect(new Governor(99).rung, 'no lower than the last').toBe(RUNGS.length - 1);
  });
});
