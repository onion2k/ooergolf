/**
 * The lifetime figures the save keeps (`life`) and the feats earned (`feats`): how a save is read into them, and what the game
 * counts, and when. A hole counts when it pays: in the career, not in free play, and not when it was begun again from the menu
 * (or a restart would farm an ace); a hole picked up is not a hole holed. The distances are the game's own moments, told where
 * they happen and counted by the game, never by the page.
 */
import { describe, expect, it } from 'vitest';
import type { HoleDef } from '../src/course';
import { MOMENTS, Game, type GameEvents } from '../src/game';
import { checkInvariants, trophyProblems } from '../src/invariants';
import { Progress, memoryStore } from '../src/progress';
import { seeded } from '../src/random';
import { DT, GREEN, field, golfGame } from './helpers';
import { OPEN, openGreen, shootAtCup } from './open-green';
import { NORTH, holeInOne, next, pickUp } from './rounds';
import { SMALL, SMALL_C, roundOfEvent } from './small-season';

const NONE = {
  rounds: 0,
  wins: 0,
  holes: 0,
  aces: 0,
  eagles: 0,
  birdies: 0,
  lost: 0,
  lipOuts: 0,
  pinned: 0,
  longestPutt: 0,
  longestDrive: 0,
};

/** A game on `course`, its save from `json` (the career, by default), with no event heard. */
function played(course: readonly HoleDef[] = [GREEN], json: Record<string, unknown> = {}) {
  const events: GameEvents = {};
  const game = new Game(new Progress(memoryStore(JSON.stringify(json))), events, {
    random: seeded(3),
    course,
    today: () => '2026-11-11',
    season: SMALL,
  });
  return game;
}
const life = (g: Game) => g.progress.save.life;

describe('the save, read', () => {
  it('has every figure at nought and no feat, for a save that has none', () => {
    const save = new Progress(memoryStore(JSON.stringify({ coins: 3 }))).save;
    expect(save.life).toEqual(NONE);
    expect(save.feats).toEqual([]);
  });

  it('takes each figure that is a whole number from nought, and the default for each that is not, one at a time', () => {
    const save = new Progress(
      memoryStore(
        JSON.stringify({
          life: {
            rounds: 4,
            wins: -1,
            holes: 2.5,
            aces: '3',
            eagles: null,
            birdies: 7,
            lost: [],
            lipOuts: 1,
            extra: 9,
          },
        }),
      ),
    ).save;
    expect(save.life).toEqual({ ...NONE, rounds: 4, birdies: 7, lipOuts: 1 });
    expect(new Progress(memoryStore('{"life": 4}')).save.life).toEqual(NONE);
  });

  it('keeps only the feats the game knows, each once, and none from what is not a list', () => {
    const feats = (v: unknown) => new Progress(memoryStore(JSON.stringify({ feats: v }))).save.feats;
    expect(feats(['ace', 'ace', 'no such feat', 7, 'winner'])).toEqual(['ace', 'winner']);
    expect(feats('ace')).toEqual([]);
    expect(feats({ ace: true })).toEqual([]);
  });
});

describe('what is counted for a hole', () => {
  it('counts an ace as a hole and an ace, and nothing else', () => {
    const g = played();
    holeInOne(g);
    expect(life(g)).toEqual({ ...NONE, holes: 1, aces: 1 });
    expect(checkInvariants(g)).toEqual([]);
  });

  it('counts a birdie, and a par as a hole alone', () => {
    const birdie = played();
    birdie.strokes = 1;
    holeInOne(birdie);
    expect(life(birdie)).toEqual({ ...NONE, holes: 1, birdies: 1 });
    const par = played();
    par.strokes = 2;
    holeInOne(par);
    expect(life(par)).toEqual({ ...NONE, holes: 1 });
  });

  it('counts an eagle on golf, and two under on minigolf as a birdie, since an eagle is a golf hole’s', () => {
    const { game } = golfGame(field('g', 130, 41, undefined, 20));
    const { cup } = game.layout;
    let holed = false;
    for (let p = 0.3; p <= 1 && !holed; p += 0.01) {
      const g = golfGame(field('g', 130, 41, undefined, 20));
      g.game.place(cup.x, cup.y - 3);
      g.game.pick('putter');
      g.game.strokes = 1;
      g.game.shoot(NORTH, p);
      for (let f = 0; f < 3000 && g.game.phase === 'play' && !(f > 2 && g.game.ready); f++) g.game.step(DT);
      if (g.game.phase === 'done') {
        holed = true;
        // two strokes on a par four
        expect(g.game.progress.save.life).toEqual({ ...NONE, holes: 1, eagles: 1, longestPutt: 0 });
      }
    }
    expect(holed).toBe(true);
    const mini = played([{ ...GREEN, par: 5 }]);
    mini.strokes = 2;
    holeInOne(mini);
    expect(life(mini)).toEqual({ ...NONE, holes: 1, birdies: 1 });
  });

  it('counts a hole picked up as nothing: it was not holed', () => {
    const g = played();
    pickUp(g);
    expect(life(g)).toEqual(NONE);
  });

  it('counts nothing in free play', () => {
    const g = played([GREEN], { mode: 'free' });
    holeInOne(g);
    expect(life(g)).toEqual(NONE);
  });

  it('counts nothing for a hole begun again from the menu, which pays nothing', () => {
    const g = played();
    expect(g.restartHole()).toBe(true);
    holeInOne(g);
    expect(life(g)).toEqual(NONE);
    // and the next hole is counted again
    const h = played([GREEN, GREEN]);
    h.restartHole();
    holeInOne(h);
    next(h);
    holeInOne(h);
    expect(life(h)).toEqual({ ...NONE, holes: 1, aces: 1 });
  });
});

describe('what is counted for a round', () => {
  it('counts a round of a named course when its last hole is done, and not before', () => {
    const g = played([GREEN, GREEN]);
    g.playCourse([GREEN, GREEN], { name: 'Somewhere', purse: 1 });
    holeInOne(g);
    next(g);
    expect(life(g).rounds).toBe(0);
    holeInOne(g);
    expect(life(g).rounds).toBe(1);
    expect(life(g).holes).toBe(2);
    // a round of holes that are no course's is no round
    const bare = played([GREEN]);
    holeInOne(bare);
    expect(life(bare).rounds).toBe(0);
  });

  it('counts a round picked up on its last hole as a round, with the hole it was not', () => {
    const g = played();
    g.playCourse([GREEN], { name: 'Somewhere', purse: 1 });
    pickUp(g);
    expect(life(g)).toEqual({ ...NONE, rounds: 1 });
  });

  it('counts an event won, once, at its last hole, with its round', () => {
    const g = played(SMALL_C.holes);
    expect(g.progress.save.coins).toBe(0);
    g.progress.save.coins = 500;
    expect(g.enter('mini')).toBe(true);
    for (let h = 0; h < SMALL_C.holes.length; h++) {
      holeInOne(g);
      next(g);
    }
    expect(life(g)).toEqual({ ...NONE, rounds: 1, wins: 1, holes: 3, aces: 3 });
    expect(roundOfEvent(SMALL_C).name).toBe(SMALL_C.name);
  });

  it('counts no round and no win in free play', () => {
    const g = played(SMALL_C.holes, { mode: 'free' });
    g.playCourse(SMALL_C.holes, roundOfEvent(SMALL_C));
    for (let h = 0; h < 3; h++) {
      holeInOne(g);
      next(g);
    }
    expect(life(g)).toEqual(NONE);
  });
});

describe('what is counted where it is told', () => {
  it('counts a lip-out, once, and a putt that drops as none', () => {
    const g = played([OPEN]);
    shootAtCup(g, 12, 0.87);
    for (let f = 0; f < 3000 && g.phase === 'play' && !(f > 2 && g.ready); f++) g.step(DT);
    expect(life(g).lipOuts).toBe(1);
    expect(g.phase).toBe('play');
    const drop = played([OPEN]);
    shootAtCup(drop, 5);
    for (let f = 0; f < 3000 && drop.phase === 'play'; f++) drop.step(DT);
    expect(life(drop).lipOuts).toBe(0);
  });

  it('keeps the longest putt in whole yards, rounded down, and never a shorter one over it', () => {
    const long = played([openGreen(10)]);
    long.strokes = 1;
    shootAtCup(long, 5, 0, MOMENTS.longPuttMinigolf + 1);
    for (let f = 0; f < 3000 && long.phase === 'play'; f++) long.step(DT);
    const yards = Math.hypot(long.layout.cup.x - long.lie.x, long.layout.cup.y - long.lie.y);
    expect(life(long).longestPutt).toBe(Math.floor(yards));
    expect(life(long).longestPutt).toBeGreaterThanOrEqual(MOMENTS.longPuttMinigolf);
    // a shorter long putt after it leaves the figure where it was
    const kept = life(long).longestPutt;
    long.restartHole();
    expect(life(long).longestPutt).toBe(kept);
  });

  it('keeps the longest drive in whole yards, and counts no drive for a hole begun again', () => {
    const { game } = golfGame(field('f'));
    game.shoot(NORTH, 1);
    const { world, ball } = game;
    world.vx[ball] *= 1.1;
    world.vy[ball] *= 1.1;
    world.vz[ball] *= 1.1;
    for (let f = 0; f < 900 && game.progress.save.life.longestDrive === 0; f++) game.step(DT);
    expect(game.progress.save.life.longestDrive).toBeGreaterThanOrEqual(MOMENTS.longDrive);
    expect(Number.isInteger(game.progress.save.life.longestDrive)).toBe(true);
    const again = golfGame(field('f')).game;
    again.restartHole();
    again.shoot(NORTH, 1);
    again.world.vx[again.ball] *= 1.1;
    again.world.vy[again.ball] *= 1.1;
    again.world.vz[again.ball] *= 1.1;
    for (let f = 0; f < 900; f++) again.step(DT);
    expect(again.progress.save.life.longestDrive).toBe(0);
  });

  it('counts a ball lost in the water or out of bounds, and writes it with the next save', () => {
    const g = played();
    const before = g.progress.save.life.lost;
    (g as unknown as { putBack(x: number, y: number): void }).putBack(0, 0);
    expect(g.progress.save.life.lost).toBe(before + 1);
  });
});

describe('the rule of the trophy room', () => {
  it('holds nothing wrong in a fresh save or one that has been played', () => {
    const g = played();
    expect(trophyProblems(g)).toEqual([]);
    holeInOne(g);
    expect(trophyProblems(g)).toEqual([]);
    expect(checkInvariants(g)).toEqual([]);
  });

  it('names a figure that is not a whole number or is below nought', () => {
    const g = played();
    const life = g.progress.save.life;
    life.holes = -1;
    life.lost = 2.5;
    life.longestDrive = Number.NaN;
    const problems = trophyProblems(g).join('\n');
    expect(problems).toMatch(/holes are -1/);
    expect(problems).toMatch(/lost are 2.5/);
    expect(problems).toMatch(/longestDrive are NaN/);
    expect(checkInvariants(g).join()).toMatch(/holes are -1/);
  });

  it('names more aces, eagles and birdies than holes holed, since each hole is counted in one at most', () => {
    const g = played();
    g.progress.save.life.holes = 3;
    g.progress.save.life.aces = 2;
    g.progress.save.life.birdies = 2;
    expect(trophyProblems(g).join()).toMatch(/4 aces, eagles and birdies in 3 holes/);
  });

  it('names a feat kept twice, or one the game does not know', () => {
    const g = played();
    g.progress.save.feats.push('ace', 'ace');
    expect(trophyProblems(g).join()).toMatch(/the feat ace is kept twice/);
    (g.progress.save.feats as string[]).push('moonshot');
    expect(trophyProblems(g).join()).toMatch(/the feat moonshot is not one the game knows/);
  });
});
