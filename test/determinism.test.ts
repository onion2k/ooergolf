/**
 * The same seed gives the same game, twice over. Everything that holds the
 * game to a figure rests on that; where it fails, those figures wander for
 * reasons nobody can see.
 */
import { describe, expect, it } from 'vitest';
import { hashGame, playTwice } from '../scripts/determinism';
import { BALL } from '../src/arena';
import { COURSES } from '../src/course';
import { DT, newGame } from './helpers';

describe('the same seed gives the same game', () => {
  it('plays out the same, twice from a seed', () => {
    const run = playTwice({ seed: 3, frames: 1200, every: 100 });
    expect(run.diverged, run.note).toBe(null);
    expect(run.checkpoints.length).toBe(12);
    // and the ball was played: the checkpoints are not all one still course
    expect(new Set(run.checkpoints).size).toBeGreaterThan(6);
  });

  it('plays out the same, twice from a seed, on every course: ground that slopes, and ground from noise, as well as the level', () => {
    for (const course of COURSES.map((c) => c.name)) {
      const run = playTwice({ seed: 3, frames: 1200, every: 100, course });
      expect(run.course).toBe(course);
      expect(run.diverged, run.note).toBe(null);
      expect(new Set(run.checkpoints).size, `${course} was played`).toBeGreaterThan(6);
    }
    expect(() => playTwice({ seed: 3, frames: 10, course: 'The Nowhere' })).toThrow(/no course/);
  });

  it('hashes what a game is, so anything moved shows', () => {
    const one = newGame(5).game;
    const two = newGame(5).game;
    const slot = one.world.spawn(BALL, 2, 3, 4);
    two.world.spawn(BALL, 2, 3, 4);
    for (let f = 0; f < 60; f++) {
      one.step(DT);
      two.step(DT);
    }
    const hash = hashGame(one);
    expect(hashGame(two)).toBe(hash);
    // a ball nudged by a thousandth, the clock a shade on, a stroke more, a ball more: all different games
    const x = one.world.x[slot];
    one.world.x[slot] += 0.001;
    expect(hashGame(one)).not.toBe(hash);
    one.world.x[slot] = x;
    expect(hashGame(one)).toBe(hash);
    one.t += 1e-9;
    expect(hashGame(one)).not.toBe(hash);
    one.t = two.t;
    one.strokes++;
    expect(hashGame(one)).not.toBe(hash);
    one.strokes--;
    one.hole++;
    expect(hashGame(one), 'another hole').not.toBe(hash);
    one.hole--;
    one.card.push(2);
    expect(hashGame(one), 'a score on the card').not.toBe(hash);
    one.card.pop();
    expect(hashGame(one)).toBe(hash);
    one.world.spawn(BALL, -2, -3, 4);
    expect(hashGame(one)).not.toBe(hash);
  });

  it('says where two runs first parted, when they do', () => {
    let frame = 0;
    const run = playTwice({
      seed: 4,
      frames: 400,
      every: 100,
      // a second run with a ball dropped in part way through: the check must catch it, and say when
      meddle: (game, pass) => {
        if (pass === 1 && ++frame === 250) game.world.spawn(BALL, 0, 0, 4);
      },
    });
    expect(run.diverged).toBe(300);
    expect(run.note).toMatch(/parted by frame 300/);
  });
});
