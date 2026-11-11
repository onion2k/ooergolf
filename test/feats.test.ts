/**
 * The feats: each a function of the save alone, so a player earns what they had already done, each earned and not earned at its
 * edge, every id given out once and held by an entry, and the game telling a feat once as the hole that earns it is done.
 */
import { describe, expect, it } from 'vitest';
import { COURSES } from '../src/course';
import { FEAT_IDS } from '../src/featids';
import { FEATS, DOWNTOWN, featOf, newFeats } from '../src/feats';
import { Game, type GameEvents } from '../src/game';
import { ITEMS } from '../src/items';
import { Progress, memoryStore, type Save } from '../src/progress';
import { seeded } from '../src/random';
import { TOURS } from '../src/season';
import { GREEN } from './helpers';
import { holeInOne } from './rounds';

/** A fresh save with `change` made to it. */
function saved(change: (save: Save) => void = () => undefined): Save {
  const save = new Progress(memoryStore(null)).save;
  change(save);
  return save;
}
const earned = (id: string, save: Save) => featOf(id as (typeof FEAT_IDS)[number]).earned(save);
const MINI = COURSES.find((c) => !c.golf)!;
const GOLF = COURSES.find((c) => c.golf)!;

describe('the table of feats', () => {
  it('holds an entry for every id given out, once, in the order the ids are given', () => {
    expect(FEATS.map((f) => f.id)).toEqual([...FEAT_IDS]);
    expect(new Set(FEATS.map((f) => f.id)).size).toBe(FEATS.length);
  });

  it('gives each a name, the words for how it is earned and a mark to draw, none of them twice', () => {
    for (const f of FEATS) {
      expect(f.name, f.id).not.toBe('');
      expect(f.how, f.id).not.toBe('');
      expect(f.icon, f.id).not.toBe('');
    }
    expect(new Set(FEATS.map((f) => f.name)).size).toBe(FEATS.length);
  });

  it('is earned by nothing in a save with nothing in it', () => {
    expect(newFeats(saved())).toEqual([]);
  });
});

describe('each feat, earned and not', () => {
  it('Ace: a hole in one', () => {
    expect(earned('ace', saved())).toBe(false);
    expect(
      earned(
        'ace',
        saved((s) => (s.life.aces = 1)),
      ),
    ).toBe(true);
  });

  it('Ten aces: ten holes in one, and not nine', () => {
    expect(
      earned(
        'tenAces',
        saved((s) => (s.life.aces = 9)),
      ),
    ).toBe(false);
    expect(
      earned(
        'tenAces',
        saved((s) => (s.life.aces = 10)),
      ),
    ).toBe(true);
  });

  it('Eagle: two under on golf', () => {
    expect(earned('eagle', saved())).toBe(false);
    expect(
      earned(
        'eagle',
        saved((s) => (s.life.eagles = 1)),
      ),
    ).toBe(true);
  });

  it('Red figures: a round of golf under par, which a record of a golf course holds, and not minigolf’s or a round at par', () => {
    const record = (course: string, strokes: number, par: number) => (s: Save) => {
      s.records[course] = { strokes, par, kit: { club: '', ball: '', accessory: '' }, when: '' };
    };
    expect(earned('redFigures', saved())).toBe(false);
    expect(earned('redFigures', saved(record(GOLF.name, 36, 36)))).toBe(false);
    expect(earned('redFigures', saved(record(MINI.name, 15, 26)))).toBe(false);
    expect(earned('redFigures', saved(record('A course no longer played', 10, 36)))).toBe(false);
    expect(earned('redFigures', saved(record(GOLF.name, 35, 36)))).toBe(true);
  });

  it('Winner: an event won', () => {
    expect(earned('winner', saved())).toBe(false);
    expect(
      earned(
        'winner',
        saved((s) => (s.life.wins = 1)),
      ),
    ).toBe(true);
  });

  it('Champion: a title won, on any tour', () => {
    expect(earned('champion', saved())).toBe(false);
    expect(
      earned(
        'champion',
        saved((s) => (s.season.moon.titles = 1)),
      ),
    ).toBe(true);
  });

  it('Grand slam: a title on every tour, and not on all but one', () => {
    const titles = (except?: string) => (s: Save) => {
      for (const t of TOURS) s.season[t].titles = t === except ? 0 : 1;
    };
    for (const t of TOURS) expect(earned('grandSlam', saved(titles(t))), `all but ${t}`).toBe(false);
    expect(earned('grandSlam', saved(titles()))).toBe(true);
  });

  it('Record book: a record on every course, and not on all but one', () => {
    const all = (except?: string) => (s: Save) => {
      for (const c of COURSES)
        if (c.name !== except)
          s.records[c.name] = { strokes: 99, par: 36, kit: { club: '', ball: '', accessory: '' }, when: '' };
    };
    expect(earned('recordBook', saved(all(MINI.name)))).toBe(false);
    expect(earned('recordBook', saved(all()))).toBe(true);
  });

  it('From downtown: a putt of twenty yards', () => {
    expect(DOWNTOWN).toBe(20);
    expect(
      earned(
        'downtown',
        saved((s) => (s.life.longestPutt = DOWNTOWN - 1)),
      ),
    ).toBe(false);
    expect(
      earned(
        'downtown',
        saved((s) => (s.life.longestPutt = DOWNTOWN)),
      ),
    ).toBe(true);
  });

  it('Kitted out: fifteen things owned', () => {
    const own = (n: number) => (s: Save) => (s.owned = ITEMS.slice(0, n).map((i) => i.id));
    expect(earned('kittedOut', saved(own(14)))).toBe(false);
    expect(earned('kittedOut', saved(own(15)))).toBe(true);
  });

  it('lists only the feats earned and not yet kept', () => {
    const save = saved((s) => {
      s.life.aces = 10;
      s.life.wins = 1;
      s.feats = ['ace'];
    });
    expect(newFeats(save).map((f) => f.id)).toEqual(['tenAces', 'winner']);
  });
});

/** A game on the practice green that tells its feats, from a save with `json` in it. */
function told(json: Record<string, unknown> = {}) {
  const feats: string[] = [];
  const order: string[] = [];
  const events: GameEvents = {
    feat: (id) => {
      feats.push(id);
      order.push('feat');
    },
    paid: () => order.push('paid'),
    holed: () => order.push('holed'),
  };
  const game = new Game(new Progress(memoryStore(JSON.stringify(json))), events, {
    random: seeded(3),
    course: [GREEN, GREEN],
  });
  return { game, feats, order };
}

describe('a feat told by the game', () => {
  it('tells a first ace once, after the hole is paid, and keeps it in the save', () => {
    const { game, feats, order } = told();
    holeInOne(game);
    expect(feats).toEqual(['ace']);
    expect(game.progress.save.feats).toEqual(['ace']);
    expect(order).toEqual(['holed', 'paid', 'feat']);
    for (let f = 0; f < 60 * 3 && game.phase === 'done'; f++) game.step(1 / 60);
    holeInOne(game);
    expect(feats, 'told once').toEqual(['ace']);
  });

  it('tells none in free play, where nothing is counted', () => {
    const { game, feats } = told({ mode: 'free' });
    holeInOne(game);
    expect(feats).toEqual([]);
  });

  it('lets a save from before the trophy room earn what it had already done, at its next hole', () => {
    const { game, feats } = told({ life: { aces: 25, wins: 3 } });
    expect(feats).toEqual([]);
    game.strokes = 2;
    holeInOne(game);
    expect(feats).toEqual(['ace', 'tenAces', 'winner']);
  });

  it('tells Kitted out as the fifteenth thing is bought, and writes the save', () => {
    const owned = ITEMS.slice(0, 14).map((i) => i.id);
    const { game, feats } = told({ coins: 100_000, gems: 1000, owned });
    expect(game.buy(ITEMS[14].id)).toBe(true);
    expect(feats).toEqual(['kittedOut']);
    expect(game.progress.save.feats).toEqual(['kittedOut']);
  });
});
