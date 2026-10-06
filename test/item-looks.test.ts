/**
 * The three cosmetic items, as the scene and the page's pieces draw them: the rainbow flag's six strips moving as the
 * one cloth does, the confetti cup's burst picked by the item held, and the glow ball's trail only while the ball
 * moves. Each is nothing at all where the item is not held.
 */
import type { Wind } from 'artshape-render/game/grass';
import { describe, expect, it } from 'vitest';
import { Scene } from '../src/scene';
import { FLAT_HOLES } from './helpers';
import { Game } from '../src/game';
import { Progress, memoryStore } from '../src/progress';
import { seeded } from '../src/random';

const WIND: Wind = { direction: [1, 0], strength: 0.5, gustSize: 8, gustSpeed: 5 };

function layoutOf() {
  const g = new Game(new Progress(memoryStore('')), {}, { random: seeded(1), course: [FLAT_HOLES[0]] });
  return g.layout;
}

describe('the rainbow flag in the scene', () => {
  const layout = layoutOf();
  const build = (rainbow?: boolean) => {
    const scene = new Scene();
    const still = scene.static(layout, 'rainbow');
    const groups = scene.dynamic(undefined, layout, 'rainbow', WIND, rainbow ? { rainbow } : {});
    return { scene, still, groups };
  };

  it('is one cloth on a hole begun without the item, and six strips on one begun with it', () => {
    const plain = build(),
      rain = build(true);
    expect(plain.scene.flagStrips()).toBe(1);
    expect(rain.scene.flagStrips()).toBe(6);
    expect(rain.groups.length).toBe(plain.groups.length + 5);
    // the pole and its knob are the same standing parts either way
    expect(rain.still.length).toBe(plain.still.length);
    // and a scene given no items says what it always did
    expect(build(false).groups.length).toBe(plain.groups.length);
    expect(new Scene().flagStrips()).toBe(0);
  });

  it('flies every strip as the one cloth flies, and waggles them together as a ball drops', () => {
    const plain = build(),
      rain = build(true);
    for (const t of [0, 0.7, 3.3]) {
      plain.scene.holedAt = rain.scene.holedAt = t - 0.05;
      const one = plain.scene.writeMoving(t)[0].matrices;
      const strips = rain.scene.writeMoving(t).slice(0, 6);
      expect(strips).toHaveLength(6);
      for (const s of strips) expect(Array.from(s.matrices)).toEqual(Array.from(one));
    }
  });
});
