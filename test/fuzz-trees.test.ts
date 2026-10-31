/**
 * The trees of a biome under play: The Woods' holes made in the desert and in the future (throwaway biomes, since no course is
 * one yet), so every tree is a cactus or a hologram. The autopilot plays a round of each with the rules held as it goes, and the
 * monkey drives at a tree on a chance of its own. Apart from `fuzz.test.ts`, which says why.
 */
import { describe, expect, it } from 'vitest';
import { fuzz } from '../scripts/fuzzer';
import { Autopilot } from '../src/autopilot';
import type { BiomeName } from '../src/biome';
import { Game } from '../src/game';
import { golfHole } from '../src/golf';
import { checkInvariants } from '../src/invariants';
import { Progress, memoryStore } from '../src/progress';
import { seeded } from '../src/random';
import { WOODS_SPECS } from '../src/woods';
import { DT } from './helpers';

/**
 * The first three holes of The Woods on gentle land (a tenth of its hills, unrolled): a cactus's crown stands two yards over its
 * foot, so on The Woods' own hills every one is felled for the crown a ball at rest beside it would lie in (`felled`), which is
 * for the desert's courses to remember and not for this test to wait on.
 */
const holesIn = (biome: BiomeName) =>
  WOODS_SPECS.slice(0, 3).map((s) =>
    golfHole({ ...s, steepness: s.steepness * 0.1, rolling: false, heighten: undefined, biome }),
  );

describe('a round among cacti and holograms', () => {
  for (const biome of ['desert', 'future'] as const) {
    it(`is played by the autopilot to the end in the ${biome}, the rules held`, () => {
      const holes = holesIn(biome);
      expect(
        holes.some((h) => h.map.some((row) => row.includes('^'))),
        'a wood',
      ).toBe(true);
      const game = new Game(new Progress(memoryStore()), {}, { random: seeded(11), course: holes });
      const pilot = new Autopilot(game, { random: seeded(13) });
      let checked = 0;
      for (let f = 0; f < 60 * 60 * 12 && game.phase !== 'over'; f++) {
        pilot.step(DT);
        if (f % 20 === 0) {
          checked++;
          expect(checkInvariants(game), `frame ${f}, hole ${game.hole}`).toEqual([]);
        }
      }
      expect(checked).toBeGreaterThan(50);
      expect(game.phase).toBe('over');
      expect(game.card.length).toBe(3);
    });

    it(`is driven at by the monkey in the ${biome}, every seed clean`, () => {
      const holes = holesIn(biome);
      let drove = 0,
        struck = 0;
      for (const seed of [1, 2, 3]) {
        const r = fuzz(seed, 8000, holes);
        expect(r.failure, `seed ${seed}: ${JSON.stringify(r.failure)}`).toBe(null);
        drove += r.done['drive at a tree'] || 0;
        struck += r.happened.struck || 0;
      }
      expect(struck, 'strokes were taken').toBeGreaterThan(30);
      expect(drove, 'a ball was driven at a tree').toBeGreaterThan(2);
    });

    it(`keeps the drive through a wood's lane fair in the ${biome}`, () => {
      const holes = WOODS_SPECS.filter((s) => s.gap)
        .slice(0, 2)
        .map((s) => golfHole({ ...s, steepness: s.steepness * 0.1, rolling: false, heighten: undefined, biome }));
      expect(holes.length).toBeGreaterThan(0);
      let drove = 0;
      for (const seed of [1, 2, 3]) {
        const r = fuzz(seed, 8000, holes);
        expect(r.failure, `seed ${seed}: ${JSON.stringify(r.failure)}`).toBe(null);
        drove += r.done['drive the lane'] || 0;
      }
      expect(drove, 'a lane was driven').toBeGreaterThan(0);
    });
  }
});
