/**
 * The game's side of a season of tournaments: entering an event (the fee taken once, the round kept from the first hole),
 * going on with it after a reload, being placed at its last hole and paid, a season's end promoting the top three, an event
 * given up counting as a withdrawal, and practice, which pays and keeps nothing. Played on a small season of the test's own,
 * of courses of three practice greens: see `small-season.ts`.
 */
import { describe, expect, it } from 'vitest';
import { Game, type GameEvents, type Placement } from '../src/game';
import { careerProblems, checkInvariants } from '../src/invariants';
import { paid } from '../src/items';
import { Progress, memoryStore } from '../src/progress';
import { seeded } from '../src/random';
import { PRIZE } from '../src/season';
import { GREEN } from './helpers';
import { holeInOne, next, pickUp } from './rounds';
import { SMALL, SMALL_A, SMALL_B, SMALL_C, roundOfEvent } from './small-season';

const HOLE_PAY = paid(1, GREEN.par, false).coins;
const NOTHING = { club: '', ball: '', accessory: '' };
/** The fees: 25 coins a point of the purse, so The Small Links' 1.2 is 30, The Small Heath's 1.5 is 38 and The Small Meadow's 1 is 25. */
const FEE = { a: 30, b: 38, c: 25 };

/** A game with a small season, its save in a store the test keeps (1000 coins unless given a save), and every event told. */
/** A save at the county grade on both tours, where an event has a fee (the club grade is entered for nothing). */
const atCounty = (save: Record<string, unknown> = { coins: 1000 }) => {
  const county = { grade: 'county', begun: 0, played: [], titles: 0 };
  return JSON.stringify({ ...save, season: { golf: county, mini: county } });
};

function season(json: string | null = JSON.stringify({ coins: 1000 }), withSeason = true) {
  const store = memoryStore(json);
  const calls: [string, unknown[]][] = [];
  const events: GameEvents = new Proxy(
    {},
    {
      get:
        (_, name: string) =>
        (...args: unknown[]) =>
          calls.push([name, args]),
    },
  );
  const game = new Game(new Progress(store), events, {
    random: seeded(3),
    course: SMALL_A.holes,
    today: () => '2026-10-15',
    ...(withSeason ? { season: SMALL } : {}),
  });
  return { game, store, calls };
}
const told = (calls: [string, unknown[]][], ...names: string[]) => calls.filter(([n]) => names.includes(n));
/** The place told, once an event is over. */
const placement = (calls: [string, unknown[]][]) => told(calls, 'placed').map(([, a]) => a[0] as Placement);

/** The event in play holed in one on every hole. */
function winEvent(g: Game) {
  for (let h = 0; h < 3; h++) {
    holeInOne(g);
    next(g);
  }
  expect(g.phase).toBe('over');
}

/** The event in play with every hole picked up. */
function loseEvent(g: Game) {
  for (let h = 0; h < 3; h++) {
    pickUp(g);
    next(g);
  }
  expect(g.phase).toBe('over');
}

describe('entering an event', () => {
  it('costs nothing at the club grade, so a player with no coins can start the career, and plays for the same pot', () => {
    const club = { grade: 'club', begun: 0, played: [], titles: 0 };
    const { game, calls } = season(JSON.stringify({ coins: 0, season: { golf: club, mini: club } }));
    expect(game.enter('golf')).toBe(true);
    expect(game.progress.save.coins).toBe(0);
    expect(told(calls, 'entered')).toEqual([['entered', [0]]]);
    winEvent(game);
    const [won] = placement(calls);
    expect(won.place).toBe(1);
    expect(won.prize, 'half of twelve stakes, though none was paid in').toBe(Math.floor(FEE.a * 12 * 0.5));
    expect(checkInvariants(game)).toEqual([]);
  });

  it('takes the fee once, tells entered, and keeps the round at its first hole', () => {
    const { game, store, calls } = season(atCounty());
    expect(game.enter('golf')).toBe(true);
    const save = game.progress.save;
    expect(save.coins).toBe(1000 - FEE.a);
    expect(told(calls, 'entered')).toEqual([['entered', [FEE.a]]]);
    expect(save.round).toEqual({
      tour: 'golf',
      course: SMALL_A.name,
      hole: 0,
      card: [],
      retaken: false,
      pickedUp: false,
    });
    expect(game.event).toEqual({ tour: 'golf', index: 0 });
    expect(game.counting).toBe(true);
    expect(game.of).toEqual(roundOfEvent(SMALL_A));
    expect(game.course).toBe(SMALL_A.holes);
    expect([game.hole, game.strokes, game.card.length, game.phase]).toEqual([0, 0, 0, 'play']);
    // written at once, so a reload now does not lose the fee
    expect(new Progress(memoryStore(store.json)).save.coins).toBe(1000 - FEE.a);
    expect(new Progress(memoryStore(store.json)).save.round).toEqual(save.round);
    // and the fee is taken once: holes played take no more
    holeInOne(game);
    expect(game.progress.save.coins).toBe(1000 - FEE.a + HOLE_PAY);
    expect(told(calls, 'entered').length).toBe(1);
    expect(checkInvariants(game)).toEqual([]);
  });

  it('enters the tour’s season at the event it is on, whatever the course the game was on', () => {
    const { game } = season(
      JSON.stringify({ coins: 1000, season: { golf: { grade: 'county', begun: 3, played: [null], titles: 0 } } }),
    );
    expect(game.enter('golf')).toBe(true);
    expect(game.event).toEqual({ tour: 'golf', index: 1 });
    expect(game.progress.save.round!.course).toBe(SMALL_B.name);
    expect(game.progress.save.coins).toBe(1000 - FEE.b);
  });

  it('is refused in free play, without a season to enter, for a tour there is not, and short of coins, changing nothing', () => {
    const free = season(JSON.stringify({ coins: 1000, mode: 'free' }));
    expect(free.game.enter('golf')).toBe(false);
    expect(free.game.progress.save.coins).toBe(1000);
    expect(free.game.progress.save.round).toBeNull();
    const bare = season(undefined, false);
    expect(bare.game.enter('golf')).toBe(false);
    expect(bare.game.progress.save.coins).toBe(1000);
    const odd = season();
    expect(odd.game.enter('senior' as never)).toBe(false);
    const poor = season(atCounty({ coins: FEE.a - 1 }));
    expect(poor.game.enter('golf')).toBe(false);
    expect(poor.game.progress.save.coins).toBe(FEE.a - 1);
    expect(poor.game.progress.save.round).toBeNull();
    expect(poor.game.event).toBeNull();
    for (const c of [free, bare, odd, poor]) expect(told(c.calls, 'entered'), 'not told').toEqual([]);
    // the fee is enough at its price, to the coin
    const exact = season(atCounty({ coins: FEE.a }));
    expect(exact.game.enter('golf')).toBe(true);
    expect(exact.game.progress.save.coins).toBe(0);
  });

  it('leaves a round kept where it was when the entry is refused for coins', () => {
    const { game, store } = season(atCounty());
    game.enter('mini');
    game.progress.save.coins = FEE.c - 1;
    game.persist();
    const before = [store.json, JSON.stringify(game.progress.save)];
    // the kept round would be given up by an entry (which, the mini tour having one event, would close its season), and the
    // event costs more than there is: refused, and nothing given up, in the store or in the game
    expect(game.enter('mini')).toBe(false);
    expect([store.json, JSON.stringify(game.progress.save)]).toEqual(before);
    expect(game.progress.save.round).not.toBeNull();
    expect(game.progress.save.season.mini).toEqual({ grade: 'county', begun: 0, played: [], titles: 0 });
    expect(game.counting).toBe(true);
  });

  it('closes a season that has played all its events before entering the next', () => {
    const { game } = season(
      JSON.stringify({ coins: 1000, season: { golf: { grade: 'club', begun: 4, played: [null, null], titles: 0 } } }),
    );
    expect(game.enter('golf')).toBe(true);
    expect(game.progress.save.season.golf).toEqual({ grade: 'club', begun: 5, played: [], titles: 0 });
    expect(game.event).toEqual({ tour: 'golf', index: 0 });
    expect(careerProblems(game)).toEqual([]);
  });
});

describe('going on with an event after a reload', () => {
  it('goes on before the first hole is done, from its tee, with the fee still spent', () => {
    const first = season(atCounty());
    first.game.enter('golf');
    const { game, calls } = season(first.store.json);
    expect(game.progress.save.coins).toBe(1000 - FEE.a);
    expect(game.resume(SMALL_A.holes, roundOfEvent(SMALL_A))).toBe(true);
    expect([game.hole, game.card.length, game.event]).toEqual([0, 0, { tour: 'golf', index: 0 }]);
    expect(game.counting).toBe(true);
    expect(told(calls, 'entered'), 'the fee is not taken again, nor told again').toEqual([]);
    expect(game.progress.save.coins).toBe(1000 - FEE.a);
    winEvent(game);
    expect(placement(calls)[0].place).toBe(1);
    expect(checkInvariants(game)).toEqual([]);
  });

  it('goes on between holes, from the next, with the card as it was', () => {
    const first = season();
    first.game.enter('golf');
    holeInOne(first.game);
    next(first.game);
    holeInOne(first.game);
    const { game } = season(first.store.json);
    expect(game.resume(SMALL_A.holes, roundOfEvent(SMALL_A))).toBe(true);
    expect([game.hole, game.card]).toEqual([2, [1, 1]]);
    expect(game.event).toEqual({ tour: 'golf', index: 0 });
    expect(checkInvariants(game)).toEqual([]);
  });

  it('is refused without a season’s context, as the game of a page that has none', () => {
    const first = season();
    first.game.enter('golf');
    const { game } = season(first.store.json, false);
    expect(game.resume(SMALL_A.holes, roundOfEvent(SMALL_A))).toBe(false);
  });
});

describe('the last hole of an event', () => {
  it('places the player, pays the share and the record bonus, tells roundPaid then placed, and moves played on', () => {
    const { game, calls } = season();
    game.enter('golf');
    const coins = game.progress.save.coins;
    winEvent(game);
    const share = Math.floor(0.5 * FEE.a * 12);
    expect(game.progress.save.coins - coins).toBe(3 * HOLE_PAY + share + PRIZE.record);
    expect(told(calls, 'roundPaid')).toEqual([['roundPaid', [share + PRIZE.record, true]]]);
    expect(placement(calls)).toEqual([
      {
        place: 1,
        tied: false,
        prize: share,
        points: 25,
        record: true,
        seasonOver: false,
        promotedTo: null,
        title: false,
      },
    ]);
    const order = calls.map(([n]) => n).filter((n) => ['paid', 'roundPaid', 'placed', 'finished'].includes(n));
    expect(order.slice(-4)).toEqual(['paid', 'roundPaid', 'placed', 'finished']);
    const save = game.progress.save;
    expect(save.season.golf).toEqual({ grade: 'club', begun: 0, played: [[1, 1, 1]], titles: 0 });
    expect(save.season.mini.played, 'the other tour’s season is not touched').toEqual([]);
    expect(save.round).toBeNull();
    expect(save.records[SMALL_A.name].strokes).toBe(3);
    expect(game.progress.save.coins).toBeGreaterThan(coins);
    expect(checkInvariants(game)).toEqual([]);
    // and the next event of the season is the second
    expect(game.enter('golf')).toBe(true);
    expect(game.event).toEqual({ tour: 'golf', index: 1 });
  });

  it('shares a tied place’s money and points, rounding down, and pays nothing outside the first three', () => {
    // a club field scores 12, 15 and 18 over the three holes (four rivals, then four, then three): 12 ties the four best
    const tied = season();
    tied.game.enter('golf');
    for (let h = 0; h < 3; h++) {
      // four strokes a hole: three taps that go nowhere, and the ball put to the cup and holed
      for (let s = 0; s < 3; s++) {
        tied.game.shoot(0, 0.05);
        for (let f = 0; f < 60 * 40 && !(f > 2 && tied.game.ready); f++) tied.game.step(1 / 60);
      }
      holeInOne(tied.game);
      next(tied.game);
    }
    const result = placement(tied.calls)[0];
    expect(result.tied).toBe(true);
    expect(result.place).toBe(1);
    // five share first: the pot's three prizes pooled over the five of them, 360 coins in all, each 72
    expect(result.prize).toBe(72);
    expect(result.points).toBe(25);
    const bad = season();
    bad.game.enter('golf');
    loseEvent(bad.game);
    expect(placement(bad.calls)[0]).toMatchObject({ place: 12, prize: 0, points: 1, record: false });
    expect(told(bad.calls, 'roundPaid')).toEqual([['roundPaid', [0, false]]]);
  });

  it('is the same field for the same season, whoever plays it', () => {
    const a = season(),
      b = season();
    for (const c of [a, b]) {
      c.game.enter('golf');
      winEvent(c.game);
    }
    expect(placement(a.calls)).toEqual(placement(b.calls));
    expect(a.store.json).toBe(b.store.json);
  });
});

describe('the end of a season', () => {
  it('promotes the top three of the order of merit, keeps the record, and begins another season with nothing played', () => {
    const { game, calls } = season();
    for (let e = 0; e < 2; e++) {
      expect(game.enter('golf')).toBe(true);
      winEvent(game);
    }
    const [one, two] = placement(calls);
    expect([one.seasonOver, one.promotedTo]).toEqual([false, null]);
    expect([two.seasonOver, two.promotedTo, two.title]).toEqual([true, 'county', false]);
    expect(game.progress.save.season.golf).toEqual({ grade: 'county', begun: 1, played: [], titles: 0 });
    expect(game.progress.save.season.mini.grade, 'the other tour stays at its grade').toBe('club');
    expect(checkInvariants(game)).toEqual([]);
    // the new season's first event is at the county grade, with another field
    expect(game.enter('golf')).toBe(true);
    expect(game.event).toEqual({ tour: 'golf', index: 0 });
  });

  it('leaves the player where they were when they finish out of the top three, and still closes the season', () => {
    const { game, calls } = season();
    for (let e = 0; e < 2; e++) {
      game.enter('golf');
      loseEvent(game);
    }
    expect(placement(calls).map((p) => [p.seasonOver, p.promotedTo, p.title])).toEqual([
      [false, null, false],
      [true, null, false],
    ]);
    expect(game.progress.save.season.golf).toEqual({ grade: 'club', begun: 1, played: [], titles: 0 });
  });

  it('keeps the championship’s top three where they are and adds a title there', () => {
    const { game, calls } = season(
      JSON.stringify({
        coins: 1000,
        season: { golf: { grade: 'championship', begun: 2, played: [], titles: 1 } },
      }),
    );
    for (let e = 0; e < 2; e++) {
      game.enter('golf');
      winEvent(game);
    }
    expect(placement(calls)[1]).toMatchObject({ seasonOver: true, promotedTo: null, title: true });
    expect(game.progress.save.season.golf).toEqual({ grade: 'championship', begun: 3, played: [], titles: 2 });
  });
});

describe('giving up an event', () => {
  /** The game with an event entered on the golf tour at the county grade, 1000 coins less its fee. */
  function entered() {
    const c = season(atCounty());
    c.game.enter('golf');
    return c;
  }
  const withdrawn = (game: Game) => {
    const save = game.progress.save;
    expect(save.round).toBeNull();
    expect(save.season.golf.played).toEqual([null]);
    expect(save.coins, 'no refund').toBe(1000 - FEE.a);
    expect(game.event).toBeNull();
    expect(game.counting).toBe(false);
  };

  it('by choosing a course, records a withdrawal and refunds nothing', () => {
    const { game, store } = entered();
    game.playCourse(SMALL_C.holes, roundOfEvent(SMALL_C));
    withdrawn(game);
    expect(new Progress(memoryStore(store.json)).save.season.golf.played, 'written').toEqual([null]);
    expect(checkInvariants(game)).toEqual([]);
  });

  it('by a new round of the same course', () => {
    const { game } = entered();
    game.newRound();
    withdrawn(game);
  });

  it('by naming the first tee as a course’s', () => {
    const { game } = entered();
    expect(game.adopt(roundOfEvent(SMALL_C))).toBe(true);
    withdrawn(game);
  });

  it('by entering again, which is then the next event of the season', () => {
    const { game, calls } = entered();
    expect(game.enter('golf')).toBe(true);
    const save = game.progress.save;
    expect(save.season.golf.played).toEqual([null]);
    expect(save.coins).toBe(1000 - FEE.a - FEE.b);
    expect(save.round!.course).toBe(SMALL_B.name);
    expect(game.event).toEqual({ tour: 'golf', index: 1 });
    expect(told(calls, 'entered').map(([, a]) => a[0])).toEqual([FEE.a, FEE.b]);
  });

  it('by entering the other tour, whose own season is not touched', () => {
    const { game } = entered();
    expect(game.enter('mini')).toBe(true);
    expect(game.progress.save.season.golf.played).toEqual([null]);
    expect(game.progress.save.season.mini.played).toEqual([]);
    expect(game.event).toEqual({ tour: 'mini', index: 0 });
  });

  it('on a season’s last event, which closes the season with the player out of its order of merit', () => {
    const { game } = entered();
    game.enter('golf');
    game.newRound();
    expect(game.progress.save.season.golf).toEqual({ grade: 'county', begun: 1, played: [], titles: 0 });
    expect(game.progress.save.coins).toBe(1000 - FEE.a - FEE.b);
    expect(careerProblems(game)).toEqual([]);
  });

  it('but not by a round that is no course’s, which leaves it kept, nor by a mode changed, nor by practice', () => {
    const { game } = entered();
    game.playCourse(SMALL_C.holes);
    expect(game.progress.save.round).not.toBeNull();
    expect(game.event).toBeNull();
    game.setMode('free');
    game.setMode('career');
    expect(game.progress.save.round).not.toBeNull();
    game.practise(SMALL_C.holes, roundOfEvent(SMALL_C));
    expect(game.progress.save.round).not.toBeNull();
    expect(game.progress.save.season.golf.played).toEqual([]);
  });

  it('and a career round of a course with no event keeps no round and counts no withdrawal where none was kept', () => {
    const { game } = season();
    game.playCourse(SMALL_C.holes, roundOfEvent(SMALL_C));
    holeInOne(game);
    expect(game.progress.save.round).toBeNull();
    expect(game.progress.save.season.mini.played).toEqual([]);
  });
});

describe('practice', () => {
  it('pays its holes and keeps their bests, as any paid hole does, so a player short of a fee can earn it; and no prize, record, round or season', () => {
    const { game, calls } = season(JSON.stringify({ coins: 0, mode: 'career' }));
    const { season: seasons, records, round } = structuredClone(game.progress.save);
    game.practise(SMALL_C.holes, roundOfEvent(SMALL_C));
    expect(game.practising).toBe(true);
    expect(game.progress.save.mode).toBe('career');
    let owed = 0;
    for (let h = 0; h < 3; h++) {
      owed += paid(1, SMALL_C.holes[h].par, false, game.kit.underParPay).coins;
      holeInOne(game);
      next(game);
    }
    expect(game.phase).toBe('over');
    expect(game.progress.save.coins, 'each hole paid as a hole in one').toBe(owed);
    expect(owed).toBeGreaterThan(0);
    for (const h of SMALL_C.holes) expect(game.progress.save.best[h.name].strokes).toBe(1);
    expect(game.progress.save.season, 'the season untouched').toEqual(seasons);
    expect(game.progress.save.records, 'no record').toEqual(records);
    expect(game.progress.save.round, 'no round kept').toEqual(round);
    expect(told(calls, 'roundPaid', 'placed', 'entered')).toEqual([]);
    expect(told(calls, 'paid').length).toBe(3);
    expect(game.counting).toBe(false);
    expect(checkInvariants(game)).toEqual([]);
  });

  it('leaves an event round kept to go on with, and is let go by a round that is not practice', () => {
    const { game } = season();
    game.enter('golf');
    holeInOne(game);
    next(game);
    const kept = JSON.stringify(game.progress.save.round);
    game.practise(SMALL_B.holes, roundOfEvent(SMALL_B));
    holeInOne(game);
    next(game);
    expect(JSON.stringify(game.progress.save.round), 'untouched by a practice hole').toBe(kept);
    game.startAt(0);
    expect(game.practising).toBe(false);
    game.practise(SMALL_B.holes, roundOfEvent(SMALL_B));
    game.playCourse(SMALL_C.holes);
    expect(game.practising, 'a round begun otherwise is not practice').toBe(false);
    game.practise(SMALL_B.holes, roundOfEvent(SMALL_B));
    expect(game.enter('mini')).toBe(true);
    expect(game.practising, 'nor is an event').toBe(false);
  });
});

describe('the retake', () => {
  it('is refused in an event, where a stroke counts against the field, and given in a round that is not', () => {
    const watch = JSON.stringify({ coins: 1000, gems: 2, owned: ['watch'], kit: { accessory: 'watch' } });
    const event = season(watch);
    event.game.enter('golf');
    event.game.shoot(Math.PI / 2, 0.2);
    expect(event.game.mulligan()).toBe(false);
    expect(event.game.mulliganUsed).toBe(false);
    expect(event.game.strokes).toBe(1);
    const other = season(watch);
    other.game.playCourse(SMALL_C.holes, roundOfEvent(SMALL_C));
    other.game.shoot(Math.PI / 2, 0.2);
    expect(other.game.mulligan()).toBe(true);
    const practice = season(watch);
    practice.game.practise(SMALL_C.holes, roundOfEvent(SMALL_C));
    practice.game.shoot(Math.PI / 2, 0.2);
    expect(practice.game.mulligan(), 'nothing is at stake in practice').toBe(true);
  });
});

describe('a save without the season', () => {
  it('begins both tours at the club grade, with no season begun, and plays on', () => {
    const { game } = season(JSON.stringify({ coins: 10 }));
    expect(game.progress.save.season).toEqual({
      golf: { grade: 'club', begun: 0, played: [], titles: 0 },
      mini: { grade: 'club', begun: 0, played: [], titles: 0 },
    });
    expect(game.progress.save.kit).toEqual(NOTHING);
    expect(checkInvariants(game)).toEqual([]);
  });
});
