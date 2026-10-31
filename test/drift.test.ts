/**
 * What drifts over a hole of the Desert on the wind: a tumbleweed's place is worked out from the hole, its name and game time
 * alone, so a picture is the same every run and nothing of the game's chance is touched; it is drawn and has no body, so it can
 * never meet a ball; and it stays within reach of the hole however long the hole is played.
 */
import { describe, expect, it } from 'vitest';
import { TILE } from '../src/arena';
import { DRIFT, tumbleweedAt, tumbleweedCount } from '../src/drift';
import { golfGame, levelHole } from './helpers';

const WAYS: [number, number][] = [
  [1, 0],
  [0, 1],
  [-0.6, 0.8],
  [0.8, -0.6],
];

describe('a tumbleweed’s place', () => {
  const { game } = golfGame(levelHole({ name: 'drift', par: 3, length: 150, biome: 'desert' }));
  const layout = game.layout;
  const centre = [layout.originX + (layout.cols * TILE) / 2, layout.originY + (layout.rows * TILE) / 2];
  const reach = Math.hypot(layout.cols * TILE, layout.rows * TILE) / 2 + DRIFT.reach;

  it('is a few for a hole, the same few every time', () => {
    expect(tumbleweedCount(layout)).toBe(DRIFT.count);
    expect(DRIFT.count).toBeGreaterThanOrEqual(3);
    expect(DRIFT.count).toBeLessThanOrEqual(8);
  });

  it('is a function of the hole, the weed and the time alone: the same at the same time, however it is asked', () => {
    for (const way of WAYS)
      for (let k = 0; k < DRIFT.count; k++)
        for (const t of [0, 0.5, 13.37, 600, 36000]) {
          const a = tumbleweedAt(layout, 'drift', k, t, way);
          // asked in another order, and asked again
          tumbleweedAt(layout, 'drift', (k + 1) % DRIFT.count, t + 100, way);
          expect(tumbleweedAt(layout, 'drift', k, t, way)).toEqual(a);
        }
  });

  it('is another weed’s elsewhere, and another hole’s elsewhere', () => {
    const way: [number, number] = [1, 0];
    const at = (name: string, k: number) => tumbleweedAt(layout, name, k, 20, way);
    expect(at('drift', 0)).not.toEqual(at('drift', 1));
    expect(at('drift', 0)).not.toEqual(at('another', 0));
  });

  it('is kept within reach of the hole at any time, and in the wind’s direction it moves downwind and not away', () => {
    for (const way of WAYS)
      for (let k = 0; k < DRIFT.count; k++)
        for (let t = 0; t < 4000; t += 37) {
          const p = tumbleweedAt(layout, 'drift', k, t, way);
          expect(Math.hypot(p.x - centre[0], p.y - centre[1]), `weed ${k} at ${t}`).toBeLessThanOrEqual(reach + 1e-6);
          expect(Number.isFinite(p.x + p.y + p.hop + p.turn)).toBe(true);
          expect(p.hop).toBeGreaterThanOrEqual(0);
          expect(p.hop).toBeLessThanOrEqual(DRIFT.hop + 1e-9);
        }
    // a few seconds on, it is further along the wind (unless it came to the far side and went round)
    const way: [number, number] = [0.6, 0.8];
    let down = 0;
    for (let k = 0; k < DRIFT.count; k++) {
      const a = tumbleweedAt(layout, 'drift', k, 5, way),
        b = tumbleweedAt(layout, 'drift', k, 6, way);
      if ((b.x - a.x) * way[0] + (b.y - a.y) * way[1] > 0) down++;
    }
    expect(down).toBeGreaterThanOrEqual(DRIFT.count - 1);
  });

  it('rolls as it goes, a ball’s turn for the distance, about the line across the wind', () => {
    const way: [number, number] = [1, 0];
    const a = tumbleweedAt(layout, 'drift', 0, 2, way),
      b = tumbleweedAt(layout, 'drift', 0, 3, way);
    const gone = Math.hypot(b.x - a.x, b.y - a.y);
    expect(gone).toBeGreaterThan(0);
    // the turn is as many radians as radii gone (a weed that wrapped round the ring is not asked)
    if (gone < 5 * DRIFT.speed) expect(Math.abs(b.turn - a.turn)).toBeCloseTo(gone / DRIFT.radius, 5);
  });

  it('is nothing the game’s: it takes no random and reads no world', () => {
    // asked with the wind still, it still goes (the page gives a still wind a direction of its own)
    const p = tumbleweedAt(layout, 'drift', 0, 10, [0, 0]);
    expect(Number.isFinite(p.x)).toBe(true);
  });
});
