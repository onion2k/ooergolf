import { describe, expect, it } from 'vitest';
import { againstPar, scoreName } from '../src/score';

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

  it('says a round against par as a card does', () => {
    expect(againstPar(9, 9)).toBe('E');
    expect(againstPar(12, 9)).toBe('+3');
    expect(againstPar(7, 9)).toBe('−2');
  });
});
