/**
 * Saves from every shape the game has ever written, kept in `test/saves`, all
 * still loading and playing. A player's save outlives the code that wrote it.
 *
 * A save whose shape is new needs a file here. The last test sees to that: it
 * fails when the game writes a field no file in the corpus has.
 */
import { readFileSync, readdirSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { Game } from '../src/game';
import { checkInvariants } from '../src/invariants';
import { Progress, memoryStore } from '../src/progress';
import { seeded } from '../src/random';

const DIR = new URL('saves/', import.meta.url);
const files = readdirSync(DIR)
  .filter((f) => f.endsWith('.json'))
  .sort();
const read = (file: string) => readFileSync(new URL(file, DIR), 'utf8');

/** A save with nothing in it yet, as every field's default makes it. */
const FRESH = { coins: 0, gems: 0, owned: ['putter'], club: 'putter', best: {} };

/**
 * What each save loads as. The first is the template's stub's, a bank the
 * game no longer has, and the second the empty save of a course with no
 * cup: both must still load, as a fresh save, with nothing of them kept.
 */
const KEPT: Record<string, Record<string, unknown>> = {
  '01-first.json': FRESH,
  '02-empty.json': FRESH,
  '03-shop.json': {
    coins: 145,
    gems: 2,
    owned: ['putter', 'brass'],
    club: 'brass',
    best: { Straight: { strokes: 1, club: 'putter' }, 'Dog-leg': { strokes: 2, club: 'brass' } },
  },
};

describe('saves from every shape the game has written', () => {
  it('has a file for every shape, oldest first', () => {
    expect(files).toEqual(Object.keys(KEPT).sort());
  });

  for (const file of files) {
    describe(file, () => {
      it('loads with what it kept, and nothing the game no longer knows', () => {
        const save = new Progress(memoryStore(read(file))).save;
        expect(save).toEqual(KEPT[file]);
      });

      it('plays on from where it left off, and breaks no rule', () => {
        const game = new Game(new Progress(memoryStore(read(file))), {}, { random: seeded(7) });
        for (let f = 0; f < 300; f++) game.step(1 / 60);
        expect(checkInvariants(game)).toEqual([]);
      });

      it('comes back as it went, written again in the shape of today', () => {
        const store = memoryStore(read(file));
        const before = new Progress(store).save;
        expect(store.json, 'loading alone must not write').toBe(read(file));
        const game = new Game(new Progress(store));
        game.persist();
        const after = new Progress(memoryStore(store.json)).save;
        expect(after).toEqual(before);
      });
    });
  }

  it('shrugs at what it cannot read, and at what is not what it should be', () => {
    expect(new Progress(memoryStore('not json')).save).toEqual(FRESH);
    expect(new Progress(memoryStore('[1, 2]')).save).toEqual(FRESH);
    expect(new Progress(memoryStore('{"bank": "lots"}')).save).toEqual(FRESH);
    // coins that are not a whole number of them, a club not owned, a club no one sells, a best that is nonsense
    const odd = new Progress(
      memoryStore(
        JSON.stringify({
          coins: -4,
          gems: 1.5,
          owned: ['putter', 'unheard of', 7],
          club: 'gold',
          best: { Straight: { strokes: 0, club: 'putter' }, 'Dog-leg': 'two', Nowhere: { strokes: 3 } },
        }),
      ),
    ).save;
    expect(odd).toEqual({ ...FRESH, best: { Nowhere: { strokes: 3, club: 'putter' } } });
  });

  it('has the shape the game writes now: a new field means a new file here', () => {
    const game = new Game(new Progress(memoryStore()));
    game.persist();
    const now = Object.keys(JSON.parse(JSON.stringify(game.progress.save)) as object).sort();
    const newest = Object.keys(JSON.parse(read(files[files.length - 1])) as object).sort();
    expect(newest, 'add a save in the new shape to test/saves').toEqual(now);
  });
});
