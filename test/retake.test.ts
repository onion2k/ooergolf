/** When the Retake button is on the course: the Mulligan item held, a stroke taken, the round's retake unused, the hole not done. */
import { describe, expect, it } from 'vitest';
import { Game } from '../src/game';
import { Progress, memoryStore } from '../src/progress';
import { retakeShown } from '../src/retake';
import { seeded } from '../src/random';
import { DT, FLAT_HOLES } from './helpers';

const ready = { held: true, strokes: 1, used: false, phase: 'play', choosing: false } as const;

describe('when the retake button is shown', () => {
  it('is shown with the item held, a stroke taken, the retake unused and the hole in play', () => {
    expect(retakeShown(ready)).toBe(true);
    expect(retakeShown({ ...ready, strokes: 4 })).toBe(true);
  });

  it('is put away if any one of those is not so', () => {
    expect(retakeShown({ ...ready, held: false }), 'another item or none').toBe(false);
    expect(retakeShown({ ...ready, strokes: 0 }), 'nothing to retake yet').toBe(false);
    expect(retakeShown({ ...ready, used: true }), 'one a round').toBe(false);
    expect(retakeShown({ ...ready, phase: 'done' }), 'holed').toBe(false);
    expect(retakeShown({ ...ready, phase: 'over' }), 'the card').toBe(false);
    expect(retakeShown({ ...ready, choosing: true }), 'under the start screen').toBe(false);
  });

  it('agrees with the game: shown exactly when pressing it would do something', () => {
    for (const item of ['', 'mulligan']) {
      const g = new Game(
        new Progress(memoryStore(JSON.stringify({ owned: item ? [item] : [], item }))),
        {},
        { random: seeded(3), course: [FLAT_HOLES[0]] },
      );
      const shown = () =>
        retakeShown({
          held: g.effects.has('mulligan'),
          strokes: g.strokes,
          used: g.mulliganUsed,
          phase: g.phase,
          choosing: false,
        });
      expect(shown()).toBe(false);
      g.shoot(Math.PI / 2, 0.4);
      for (let f = 0; f < 5; f++) g.step(DT);
      expect(shown(), `${item || 'no item'} after a stroke`).toBe(item === 'mulligan');
      // what is shown is what pressing does
      expect(g.mulligan()).toBe(item === 'mulligan');
      expect(shown(), 'used, or never held').toBe(false);
    }
  });
});
