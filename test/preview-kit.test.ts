/**
 * A preview begins where the ball lies. A ball that is ready on a slope may still be creeping (`KEPT_MOVING`), and a
 * shot is struck from where it is; the rehearsal that works a preview out used to settle the ball it put down there,
 * which rolled it on yards down the slope, so the flight began away from the ball (seed 5 on The Fells, 8 yards off).
 */
import { describe, expect, it } from 'vitest';
import { bagClub } from '../src/bag';
import { fells } from '../src/fells';
import { Game } from '../src/game';
import { Previewer } from '../src/preview';
import { Progress, memoryStore } from '../src/progress';

describe('a preview on a slope', () => {
  it('begins at the ball, wherever on The Fells it lies, creeping or not', () => {
    const holes = fells();
    const off: string[] = [];
    let tried = 0,
      creeping = 0;
    for (let h = 0; h < holes.length; h++) {
      const game = new Game(new Progress(memoryStore()), {}, { random: () => 0.5, course: holes });
      game.begin(h);
      const previewer = new Previewer(game);
      const { layout, world } = game;
      for (let y = 2; y < layout.rows * 0.9; y += 6)
        for (let x = 2; x < layout.cols * 0.9; x += 6) {
          try {
            game.place(x, y);
          } catch {
            continue;
          }
          if (!game.ready) continue;
          const bx = world.x[game.ball],
            by = world.y[game.ball];
          if (world.asleep[game.ball] !== 1) creeping++;
          const p = previewer.run({ x: bx, y: by }, bagClub('7-iron'), 0, 0.03);
          tried++;
          if (p.n && Math.hypot(p.points[0] - bx, p.points[1] - by) > 0.6) off.push(`hole ${h} at ${x},${y}`);
        }
    }
    // a check that reached nothing passes in silence: it must have tried many, and met creeping balls
    expect(tried).toBeGreaterThan(200);
    expect(creeping).toBeGreaterThan(0);
    expect(off).toEqual([]);
  });
});
