/** A round: holed, picked up, the next hole, the card, and the round over. */
import { describe, expect, it } from 'vitest';
import { HARDEST_SHOT, onFloor } from '../src/arena';
import { COURSE, CUP } from '../src/course';
import { BETWEEN_HOLES, CLEAR_OF_CUP, LIMIT_OVER_PAR, type Game } from '../src/game';
import { checkInvariants } from '../src/invariants';
import { DT, newGame } from './helpers';

/** Play `seconds`, checking the invariants every frame. */
function play(game: Game, seconds: number) {
  for (let f = 0; f < seconds * 60; f++) {
    game.step(DT);
    const broken = checkInvariants(game);
    if (broken.length) throw new Error(`frame ${f}: ${broken.join('; ')}`);
  }
}

/** The ball put down just clear of the cup, on whichever side has grass, and putted at it at `speed`, `aside` off its middle. */
function putt(game: Game, speed: number, aside = 0) {
  const { cup } = game.layout;
  const back = CLEAR_OF_CUP + 0.1;
  for (const a of [-Math.PI / 2, Math.PI, 0, Math.PI / 2]) {
    const x = cup.x + Math.cos(a) * back - Math.sin(a) * aside,
      y = cup.y + Math.sin(a) * back + Math.cos(a) * aside;
    if (!onFloor(game.layout, x - 1.2, y) || !onFloor(game.layout, x + 1.2, y)) continue;
    if (!onFloor(game.layout, x, y - 1.2) || !onFloor(game.layout, x, y + 1.2)) continue;
    game.place(x, y);
    game.shoot(a + Math.PI, speed / HARDEST_SHOT);
    return;
  }
  throw new Error('no grass beside the cup to putt from');
}

describe('a round', () => {
  it('starts on the first hole, on its tee, with no strokes and nothing on the card', () => {
    const { game, told } = newGame();
    expect(game.hole).toBe(0);
    expect(game.phase).toBe('play');
    expect(game.card).toEqual([]);
    expect(game.world.x[game.ball]).toBeCloseTo(game.layout.tee.x, 1);
    expect(game.world.y[game.ball]).toBeCloseTo(game.layout.tee.y, 1);
    expect(told).toEqual([`started 0 ${COURSE[0].par}`]);
  });

  it('holes a ball rolled gently into the cup, scores it, and begins the next hole a moment later', () => {
    const { game, told } = newGame();
    putt(game, 8);
    // holed within a second, and the next hole not yet begun
    play(game, 1.5);
    expect(told).toContain(`holed 1 ${COURSE[0].par}`);
    expect(game.card).toEqual([1]);
    expect(game.phase).toBe('done');
    expect(game.shoot(0, 1), 'no shot between holes').toBe(false);
    play(game, BETWEEN_HOLES);
    expect(game.hole).toBe(1);
    expect(game.phase).toBe('play');
    expect(game.strokes).toBe(0);
    expect(game.ready).toBe(true);
    expect(game.world.x[game.ball]).toBeCloseTo(game.layout.tee.x, 1);
    expect(told).toContain(`started 1 ${COURSE[1].par}`);
  });

  it('plays on when the ball runs past the cup', () => {
    const { game, told } = newGame();
    putt(game, 34, CUP.radius * 1.3);
    play(game, 5);
    expect(told.some((t) => t.startsWith('holed'))).toBe(false);
    expect(game.card).toEqual([]);
    expect(game.phase).toBe('play');
    expect(game.ready).toBe(true);
  });

  it('picks the ball up at the limit, scored at the limit', () => {
    const { game, told } = newGame();
    const limit = COURSE[0].par + LIMIT_OVER_PAR;
    for (let s = 1; s <= limit; s++) {
      // soft putts sideways, never near the cup
      game.place(game.layout.tee.x, game.layout.tee.y);
      expect(game.shoot(s % 2 ? 0 : Math.PI, 0.1), `stroke ${s}`).toBe(true);
      play(game, 4);
    }
    expect(told).toContain(`pickedUp ${limit} ${COURSE[0].par}`);
    expect(game.card).toEqual([limit]);
    expect(game.phase).toBe('done');
  });

  it('ends the round after the last hole, with the card, and starts again when asked', () => {
    const { game, told } = newGame();
    for (let h = 0; h < COURSE.length; h++) {
      expect(game.hole).toBe(h);
      putt(game, 7);
      play(game, 3 + BETWEEN_HOLES);
    }
    expect(game.phase).toBe('over');
    expect(game.card).toEqual(COURSE.map(() => 1));
    const par = COURSE.reduce((a, h) => a + h.par, 0);
    expect(told[told.length - 1]).toBe(`finished ${COURSE.length} ${par}`);
    expect(game.shoot(0, 1), 'no shot once the round is over').toBe(false);
    play(game, 5);
    expect(game.phase, 'the card stays until asked').toBe('over');
    game.newRound();
    expect(game.hole).toBe(0);
    expect(game.card).toEqual([]);
    expect(game.ready).toBe(true);
    expect(checkInvariants(game)).toEqual([]);
  });
});
