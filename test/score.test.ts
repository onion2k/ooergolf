import { describe, expect, it } from 'vitest';
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
});
