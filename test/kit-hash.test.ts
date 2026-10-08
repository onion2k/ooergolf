/**
 * A game with no kit is the game as it was before the shop had three aisles, bit for bit. Each hash below was taken
 * by this very code run against 01c994f (the commit before the feature), with the autopilot playing 3,600 frames of a
 * seeded round on every course; they are not to be written again unless a change is meant to move a game that wears
 * nothing. What is hashed is the world (every live body's place and speed), the clock, the strokes, the hole and the
 * card, every hundred frames, and not the save, whose shape is the one thing the feature changed. The Isles' seed 11
 * was taken again against e8f846b, whose stones by the water play that round differently (db8bcb04 before them); every
 * other round is the same on both, and this code run against e8f846b alone gives all twelve.
 */
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { Autopilot } from '../src/autopilot';
import { COURSES } from '../src/course';
import { Game } from '../src/game';
import { Progress, memoryStore } from '../src/progress';
import { seeded } from '../src/random';
import { PLAYER } from '../scripts/pace';

const DT = 1 / 60;
const FRAMES = 3600;
const EVERY = 100;
const SEEDS = [3, 11];

/** FNV-1a over the bits of every number fed to it. */
function hasher() {
  let h = 0x811c9dc5;
  const bits = new DataView(new ArrayBuffer(8));
  return {
    eat(n: number) {
      bits.setFloat64(0, n);
      for (let b = 0; b < 8; b++) {
        h ^= bits.getUint8(b);
        h = Math.imul(h, 0x01000193);
      }
    },
    get hex() {
      return (h >>> 0).toString(16).padStart(8, '0');
    },
  };
}

/** Plays `FRAMES` frames of the autopilot on `course` from `seed` and hashes the game as it goes. */
export function roundHash(course: string, seed: number, json: string | null = null): string {
  const holes = COURSES.find((c) => c.name === course)!.holes;
  const game = new Game(new Progress(memoryStore(json)), {}, { random: seeded(seed), course: holes });
  const pilot = new Autopilot(game, { skill: PLAYER, random: seeded(seed * 13 + 5), replay: true });
  const hash = hasher();
  const eat = (n: number) => hash.eat(n);
  const { world } = game;
  for (let f = 1; f <= FRAMES; f++) {
    pilot.step(DT);
    if (f % EVERY) continue;
    eat(world.count);
    for (let i = 0; i < world.count; i++) {
      eat(world.alive[i]);
      if (!world.alive[i]) continue;
      for (const a of [i, world.kind, world.x, world.y, world.z, world.vx, world.vy, world.vz, world.asleep])
        eat(typeof a === 'number' ? a : a[i]);
    }
    eat(game.t);
    eat(game.strokes);
    eat(game.hole);
    for (const score of game.card) eat(score);
  }
  return hash.hex;
}

/** The hashes of a game with no kit, against 01c994f and, for The Isles' seed 11, e8f846b, by course and seed. */
export const BEFORE: Record<string, string> = {
  'The Meadow/3': '8e0be55f',
  'The Meadow/11': '58eae7aa',
  'The Pinball Shed/3': 'd8481b16',
  'The Pinball Shed/11': 'fa53edaa',
  'The Waterworks/3': '51299ab1',
  'The Waterworks/11': 'a42d8d4a',
  'The Links/3': '19cb25ee',
  'The Links/11': '9f54762f',
  'The Fells/3': '16cbc938',
  'The Fells/11': '82b907ec',
  'The Isles/3': '224f0994',
  'The Isles/11': 'd57366ed',
};

describe('a game with no kit is the game as it was', () => {
  if (process.env.KIT_HASH_PRINT) {
    it('prints the hashes', () => {
      const out: Record<string, string> = {};
      for (const c of COURSES) for (const s of SEEDS) out[`${c.name}/${s}`] = roundHash(c.name, s);
      console.log('KIT_HASHES ' + JSON.stringify(out));
    }, 600_000);
    return;
  }

  for (const c of COURSES)
    for (const seed of SEEDS)
      it(`${c.name}, seed ${seed}, plays the round it played before`, () => {
        expect(BEFORE[`${c.name}/${seed}`], 'a hash was taken for it').toBeDefined();
        expect(roundHash(c.name, seed)).toBe(BEFORE[`${c.name}/${seed}`]);
      }, 120_000);

  it('plays an old save, with items it no longer knows worn, as no kit', () => {
    const old = readFileSync(new URL('saves/04-items.json', import.meta.url), 'utf8');
    for (const c of ['The Meadow', 'The Links']) {
      expect(roundHash(c, 3, old), c).toBe(roundHash(c, 3));
      expect(roundHash(c, 3, old), c).toBe(BEFORE[`${c}/3`]);
    }
  }, 120_000);
});
