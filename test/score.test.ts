import { describe, expect, it } from 'vitest';
import { LIMIT_OVER_PAR } from '../src/game';
import { DT, field, golfGame } from './helpers';
import { SCORE_KINDS, againstPar, scoreKind, scoreName } from '../src/score';

describe('what a score is called', () => {
  it('names a score against par, a hole in one before anything', () => {
    expect(scoreName(1, 2)).toBe('Hole in one!');
    expect(scoreName(1, 4)).toBe('Hole in one!');
    expect(scoreName(2, 5)).toBe('Albatross!');
    expect(scoreName(2, 4)).toBe('Eagle!');
    expect(scoreName(2, 3)).toBe('Birdie!');
    expect(scoreName(3, 3)).toBe('Par');
    expect(scoreName(4, 3)).toBe('Bogey');
    expect(scoreName(5, 3)).toBe('Double bogey');
    expect(scoreName(6, 3)).toBe('Triple bogey');
    expect(scoreName(7, 3)).toBe('4 over par');
    expect(scoreName(8, 3, true)).toBe('Picked up');
  });

  it('says what kind of score it is, as the page colours it: a hole in one before anything, and picked up before that', () => {
    expect(scoreKind(1, 2)).toBe('ace');
    expect(scoreKind(1, 1)).toBe('ace');
    expect(scoreKind(2, 5)).toBe('under');
    expect(scoreKind(2, 3)).toBe('under');
    expect(scoreKind(3, 3)).toBe('par');
    expect(scoreKind(4, 3)).toBe('over');
    expect(scoreKind(9, 3)).toBe('over');
    expect(scoreKind(8, 3, true)).toBe('picked');
    // every kind is one the page has a colour for
    for (const [s, p, up] of [
      [1, 2, false],
      [2, 3, false],
      [3, 3, false],
      [4, 3, false],
      [8, 3, true],
    ] as const)
      expect(SCORE_KINDS).toContain(scoreKind(s, p, up));
    expect(new Set(SCORE_KINDS).size, 'each kind once').toBe(SCORE_KINDS.length);
  });

  it('says a round against par as a card does', () => {
    expect(againstPar(9, 9)).toBe('E');
    expect(againstPar(12, 9)).toBe('+3');
    expect(againstPar(7, 9)).toBe('−2');
  });

  it('names four or more under par a condor, on a par six: a hole in one first, and three under still an albatross', () => {
    expect(scoreName(2, 6)).toBe('Condor!');
    expect(scoreName(3, 6)).toBe('Albatross!');
    expect(scoreName(1, 6)).toBe('Hole in one!');
    expect(scoreName(2, 5)).toBe('Albatross!');
    expect(scoreName(1, 5)).toBe('Hole in one!');
    expect(scoreName(11, 6, true)).toBe('Picked up');
    // a condor is under par to the page's colours, and a par six at par is par
    expect(scoreKind(2, 6)).toBe('under');
    expect(scoreKind(6, 6)).toBe('par');
    expect(againstPar(8, 6)).toBe('+2');
  });

  it('plays a par six to the card: holed in one, then picked up at the limit, each with the right total', () => {
    const hole = { ...field('g'), name: 'A par six', par: 6 };
    // holed from six units in one
    const a = golfGame(hole);
    a.game.pick('putter');
    a.game.place(a.game.layout.cup.x + 6, a.game.layout.cup.y);
    a.game.shoot(Math.PI, 0.14);
    for (let f = 0; f < 60 * 30 && a.game.phase === 'play'; f++) a.game.step(DT);
    expect(a.game.phase).toBe('done');
    expect(a.game.card).toEqual([1]);
    expect(a.game.total).toBe(1);
    expect(a.game.coursePar).toBe(6);
    expect(a.told.filter((t) => t.startsWith('holed ')).length).toBe(1);
    expect(a.calls.find(([n]) => n === 'holed')![1]).toEqual([1, 6]);

    // never holed: eleven strokes is the limit, and the hole is scored at it
    const b = golfGame(hole);
    expect(b.game.limit).toBe(6 + LIMIT_OVER_PAR);
    b.game.pick('putter');
    for (let k = 0; k < b.game.limit && b.game.phase === 'play'; k++) {
      for (let f = 0; f < 60 * 30 && !b.game.ready; f++) b.game.step(DT);
      b.game.shoot(0, 0.02);
    }
    for (let f = 0; f < 60 * 30 && b.game.phase === 'play'; f++) b.game.step(DT);
    expect(b.game.phase).toBe('done');
    expect(b.game.card).toEqual([11]);
    expect(b.game.total).toBe(11);
    expect(b.calls.find(([n]) => n === 'pickedUp')![1]).toEqual([11, 6]);
    expect(scoreName(b.game.card[0], 6, true)).toBe('Picked up');
  });
});
