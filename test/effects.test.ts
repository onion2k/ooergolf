/** The five places the cup's gold glints at: worked out once a hole, and the same numbers the page worked out each frame before. */
import { describe, expect, it } from 'vitest';
import { heightAt } from '../src/arena';
import { RIM_ANGLES, RIM_PLACES, rimPlacesInto } from '../src/effects';
import { SAMPLE_HOLES, newGame } from './helpers';

/** What the page's `glinting()` made each frame: kept here as the arithmetic the new one is held to. */
function oldPlaces(layout: Parameters<typeof heightAt>[0] & { cup: { x: number; y: number } }, radius: number) {
  const { cup } = layout;
  const rim = radius + 0.15;
  const on = (x: number, y: number) => heightAt(layout, x, y);
  return [
    ...[0.3, 1.9, 3.4, 4.9].map((a): [number, number, number] => {
      const x = cup.x + Math.cos(a) * rim,
        y = cup.y + Math.sin(a) * rim;
      return [x, y, on(x, y) + 0.1];
    }),
    [cup.x, cup.y, on(cup.x, cup.y) + 8.75],
  ];
}

describe('the places the gold glints at', () => {
  it('are four round the rim and one on the knob', () => {
    expect(RIM_ANGLES).toEqual([0.3, 1.9, 3.4, 4.9]);
    expect(RIM_PLACES).toBe(5);
  });

  it('are the same numbers as before, on a hole of each kind and for the cup as the kit widens it', () => {
    const out = new Float64Array(RIM_PLACES * 3);
    let checked = 0;
    for (const hole of SAMPLE_HOLES.slice(0, 12)) {
      const { game } = newGame(3, null, [hole]);
      for (const radius of [game.cup.radius, game.cup.radius * 1.5]) {
        rimPlacesInto(game.layout, radius, out);
        oldPlaces(game.layout, radius).forEach((p, k) => {
          for (let i = 0; i < 3; i++) expect(out[k * 3 + i]).toBe(p[i]);
          checked++;
        });
      }
    }
    expect(checked).toBeGreaterThan(50);
  });
});
