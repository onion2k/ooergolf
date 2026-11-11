/**
 * The rules of the daily slot: what is true of it however the game was played, and what may never change between one moment and the
 * next (a day's strokes once set, and the day itself never going back). The first is held every frame by `checkInvariants`; the second
 * is asked of the save before and after anything the fuzzer does.
 */
import { describe, expect, it } from 'vitest';
import { Game } from '../src/game';
import { checkInvariants, dailyKeptProblems, dailyProblems } from '../src/invariants';
import { Progress, memoryStore } from '../src/progress';
import { seeded } from '../src/random';
import { GREEN } from './helpers';
import { holeInOne, next } from './rounds';

const DAY = '2026-11-11';
const game = () => new Game(new Progress(memoryStore(null)), {}, { random: seeded(3), course: [GREEN] });

describe('what is true of the slot', () => {
  it('holds nothing wrong in a fresh save, at the first stroke or at the end of a go, or in a later go', () => {
    const g = game();
    expect(dailyProblems(g)).toEqual([]);
    g.playDaily(GREEN, DAY);
    expect(dailyProblems(g)).toEqual([]);
    holeInOne(g);
    expect(dailyProblems(g)).toEqual([]);
    next(g);
    g.playDaily(GREEN, DAY);
    holeInOne(g);
    expect(dailyProblems(g)).toEqual([]);
    expect(checkInvariants(g)).toEqual([]);
  });

  it('names a day that is not a day, a count that is not one, and strokes with no par or no run', () => {
    const g = game();
    g.progress.save.daily = { day: 'today', strokes: 2.5, par: -1, streak: 1 };
    const said = dailyProblems(g).join('\n');
    expect(said).toMatch(/is not a day/);
    expect(said).toMatch(/strokes are 2.5/);
    expect(said).toMatch(/par is -1/);
    g.progress.save.daily = { day: DAY, strokes: 3, par: 0, streak: 0 };
    expect(dailyProblems(g).join()).toMatch(/par of 0/);
    expect(dailyProblems(g).join()).toMatch(/run of 0/);
    expect(checkInvariants(g).join()).toMatch(/the daily hole/);
  });

  it('names more strokes than the limit lets a hole take', () => {
    const g = game();
    g.progress.save.daily = { day: DAY, strokes: GREEN.par + 6, par: GREEN.par, streak: 1 };
    expect(dailyProblems(g).join()).toMatch(/more than the limit/);
  });

  it('names a go that pays whose day or par is not in the slot, and a hole done that is not scored in it', () => {
    const g = game();
    g.playDaily(GREEN, DAY);
    holeInOne(g);
    g.progress.save.daily.day = '2026-11-10';
    expect(dailyProblems(g).join()).toMatch(/slot is of 2026-11-10, not the day played/);
    g.progress.save.daily = { day: DAY, strokes: 3, par: GREEN.par, streak: 1 };
    expect(dailyProblems(g).join()).toMatch(/slot has 3 strokes, and the go was scored 1/);
    g.progress.save.daily = { day: DAY, strokes: 1, par: GREEN.par + 1, streak: 1 };
    expect(dailyProblems(g).join()).toMatch(/par is/);
  });

  it('names a later go over a slot of an earlier day, which would be a go that paid', () => {
    const g = game();
    g.progress.save.daily = { day: '2026-11-10', strokes: 2, par: 3, streak: 1 };
    g.playDaily(GREEN, '2026-11-02');
    expect(g.daily?.pays).toBe(false);
    expect(dailyProblems(g)).toEqual([]);
    g.progress.save.daily.day = '2026-10-01';
    expect(dailyProblems(g).join()).toMatch(/earlier than the day being played/);
  });
});

describe('what may never change', () => {
  const slot = (day: string, strokes: number, streak = 1) => ({ day, strokes, par: 4, streak });

  it('lets a day be taken, finished, and followed by a later day', () => {
    expect(dailyKeptProblems(slot('', 0, 0), slot(DAY, 0, 0))).toEqual([]);
    expect(dailyKeptProblems(slot(DAY, 0, 0), slot(DAY, 3))).toEqual([]);
    expect(dailyKeptProblems(slot(DAY, 3), slot('2026-11-12', 0))).toEqual([]);
    expect(dailyKeptProblems(slot(DAY, 3), slot(DAY, 3))).toEqual([]);
  });

  it('names strokes changed once set, a run changed on a day finished, and a day that goes back', () => {
    expect(dailyKeptProblems(slot(DAY, 3), slot(DAY, 2)).join()).toMatch(/strokes changed from 3 to 2/);
    expect(dailyKeptProblems(slot(DAY, 3), slot(DAY, 3, 2)).join()).toMatch(/run changed/);
    expect(dailyKeptProblems(slot(DAY, 3), slot(DAY, 0)).join()).toMatch(/strokes changed/);
    expect(dailyKeptProblems(slot('2026-11-12', 3), slot(DAY, 3)).join()).toMatch(/went back/);
  });
});
