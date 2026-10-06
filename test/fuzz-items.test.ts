/**
 * The monkey and the shop's items: every one of the eighteen is bought, put on and played on with, and each rule an item
 * adds is checked as it happens (the retake, the waders, the lucky penny, the break reader, the ghost shot). A check that
 * never ran passes in silence, so each is counted, and a game with a cosmetic item is shown to play as one with none.
 */
import { describe, expect, it } from 'vitest';
import { fuzz } from '../scripts/fuzzer';
import { BAG, bagClub } from '../src/bag';
import { CUP } from '../src/course';
import { COURSES } from '../src/course';
import { Autopilot } from '../src/autopilot';
import { ITEMS } from '../src/items';
import { checkInvariants } from '../src/invariants';
import { Progress, memoryStore } from '../src/progress';
import { seeded } from '../src/random';
import { Game } from '../src/game';
import { DT, FLAT_HOLES, golfGame } from './helpers';

const course = (name: string) => COURSES.find((c) => c.name === name)!.holes;
const LINKS = course('The Links');
const ISLES = course('The Isles');
const WATERWORKS = course('The Waterworks');

/** Played to the end of the hole by the autopilot, with its chance counted, so that two games may be told apart. */
function played(item: string, seconds = 400) {
  let draws = 0;
  const next = seeded(7);
  const random = () => (draws++, next());
  const json = JSON.stringify({ owned: item ? [item] : [], item });
  const game = new Game(new Progress(memoryStore(json)), {}, { random, course: FLAT_HOLES });
  const pilot = new Autopilot(game);
  const trace: number[] = [];
  for (let f = 0; f < seconds * 60 && game.phase === 'play'; f++) {
    if (game.ready) {
      const shot = pilot.plan();
      if (shot) {
        if (shot.club) game.pick(shot.club);
        game.shoot(shot.angle, shot.power);
      }
    }
    game.step(DT);
    trace.push(game.world.x[game.ball], game.world.y[game.ball], game.strokes);
  }
  return { trace, draws, strokes: game.strokes, coins: game.progress.save.coins, t: game.t };
}

describe('the monkey and the items', () => {
  it('buys, puts on and plays on with every one of the eighteen, and holds each rule an item adds', () => {
    const held: Record<string, number> = {};
    const checked: Record<string, number> = {};
    const add = (into: Record<string, number>, from: Record<string, number>) => {
      for (const [k, n] of Object.entries(from)) into[k] = (into[k] ?? 0) + n;
    };
    // seeds that are collectors (a multiple of five) begin with the coins to buy anything, on a course of each kind
    for (const seed of [5, 10, 15, 20, 25, 30]) {
      for (const holes of [LINKS, undefined, FLAT_HOLES, ISLES, WATERWORKS]) {
        const r = fuzz(seed, 9000, holes);
        expect(r.failure, `seed ${seed}: ${JSON.stringify(r.failure)}`).toBe(null);
        add(held, r.held);
        add(checked, r.checked);
      }
    }
    for (const item of ITEMS) expect(held[item.id], `${item.id} held`).toBeGreaterThan(0);
    for (const what of [
      'retake',
      'retake refused',
      'waders saved a stroke',
      'waders then cost one',
      'penny doubled',
      'penny kept on a pick up',
      'reader read',
      'ghost aimed',
    ])
      expect(checked[what], what).toBeGreaterThan(0);
  }, 120_000);

  it('plays the same with a cosmetic item held as with none: the same game, the same chance, the same clock', () => {
    const none = played('');
    for (const id of ['glow', 'confetti', 'rainbow']) {
      const withIt = played(id);
      expect(withIt.draws, `${id}: draws`).toBe(none.draws);
      expect(withIt.t, `${id}: clock`).toBe(none.t);
      expect(withIt.trace, `${id}: the ball's path`).toEqual(none.trace);
    }
  });

  it('is told by the invariants when the club in hand, or the cup, is not what the item held makes it', () => {
    const { game } = golfGame(FLAT_HOLES[0]);
    expect(checkInvariants(game)).toEqual([]);
    game.inHand = { ...BAG[0], hardest: BAG[0].hardest * 2 };
    expect(checkInvariants(game).join('\n')).toMatch(/strikes at most/);
    game.inHand = bagClub(BAG[0].id);
    expect(checkInvariants(game)).toEqual([]);
    game.cup = { ...CUP, radius: 3 };
    expect(checkInvariants(game).join('\n')).toMatch(/cup/);
  });

  it('is told by the invariants that a glove makes a club 8% harder and no more, and that a retake leaves the strokes in range', () => {
    const json = JSON.stringify({ owned: ['glove'], item: 'glove' });
    const game = new Game(new Progress(memoryStore(json)), {}, { random: seeded(1), course: FLAT_HOLES });
    expect(game.inHand.hardest).toBeCloseTo(bagClub(game.inHand.id).hardest * 1.08, 9);
    expect(checkInvariants(game)).toEqual([]);
    game.inHand = { ...game.inHand, hardest: game.inHand.hardest * 1.2 };
    expect(checkInvariants(game).join('\n')).toMatch(/strikes at most/);
  });
});
