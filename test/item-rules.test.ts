/**
 * The items that change the rules of a round and not a number of a shot: waders (the first ball lost on a hole costs no
 * stroke), the mulligan (one retake a round) and the lucky penny (the next hole pays double, then it is spent), and the
 * two that show more of a shot: the ghost shot (the aim carries on to where the ball rests) and the break reader (the
 * break shown on any putt). Each is held to its edge cases through the real game, played from a save that has the item
 * bought and equipped as a player's would, and to being an exact no-op where it is not held.
 */
import { describe, expect, it } from 'vitest';
import { Autopilot } from '../src/autopilot';
import { BAG, bagClub } from '../src/bag';
import type { HoleDef } from '../src/course';
import { Game, type GameEvents } from '../src/game';
import { checkInvariants, previewProblems } from '../src/invariants';
import { itemById } from '../src/items';
import { Previewer } from '../src/preview';
import { Rehearsal } from '../src/planner';
import { Progress, memoryStore } from '../src/progress';
import { seeded } from '../src/random';
import { DT, FLAT, field, levelHole } from './helpers';

const NORTH = Math.PI / 2;

/** A golf hole of fairway with a band of `band` (water or out of bounds) a little way north of the tee, across the middle. */
function banded(band: '~' | 'x', name = `Band of ${band}`): HoleDef {
  const base = field('f', 130, 41);
  const rows = base.map.slice();
  const tee = rows.findIndex((r) => r.includes('T'));
  for (let r = tee - 6; r >= tee - 8; r--)
    rows[r] = rows[r].slice(0, 3) + band.repeat(rows[r].length - 6) + rows[r].slice(rows[r].length - 3);
  return { ...base, name, map: rows };
}

interface Held {
  game: Game;
  calls: [string, unknown[]][];
}

/** A game on `holes` from a save that owns and has equipped `item` (none for ''), every event kept with its arguments. */
function held(holes: HoleDef[], item = '', owned: string[] = item ? [item] : [], coins = 0, seed = 1): Held {
  const calls: [string, unknown[]][] = [];
  const events: GameEvents = new Proxy(
    {},
    {
      get:
        (_, name: string) =>
        (...args: unknown[]) => {
          calls.push([name, args]);
        },
    },
  );
  const save = JSON.stringify({ owned, item, coins });
  const game = new Game(new Progress(memoryStore(save)), events, { random: seeded(seed), course: holes });
  return { game, calls };
}

/** Played until the ball is ready again or the hole is over. */
function settle(game: Game, seconds = 40) {
  for (let f = 0; f < seconds * 60 && game.phase === 'play'; f++) {
    game.step(DT);
    if (f > 1 && game.ready) break;
  }
}

const told = (h: Held, name: string) => h.calls.filter(([n]) => n === name);

/** Putts north from the tee across the band, hard enough to go into it. */
function intoTheBand(h: Held) {
  h.game.pick('putter');
  expect(h.game.shoot(NORTH, 0.6)).toBe(true);
  settle(h.game);
}

describe('waders', () => {
  for (const band of ['~', 'x'] as const) {
    const what = band === '~' ? 'water' : 'out of bounds';
    const event = band === '~' ? 'splash' : 'outOfBounds';
    describe(what, () => {
      it('costs no stroke the first time: the stroke taken stands, the ball is back where it was struck from, and it is told of', () => {
        const h = held([banded(band)], 'waders');
        const { game } = h;
        const tee = { x: game.world.x[game.ball], y: game.world.y[game.ball] };
        intoTheBand(h);
        expect(told(h, event), `${event} is still told`).toHaveLength(1);
        expect(told(h, 'waded')).toHaveLength(1);
        expect(game.strokes).toBe(1);
        expect(game.world.x[game.ball]).toBeCloseTo(tee.x, 6);
        expect(game.world.y[game.ball]).toBeCloseTo(tee.y, 6);
        expect(game.ready).toBe(true);
        expect(game.wadersUsed).toBe(true);
        expect(checkInvariants(game)).toEqual([]);
      });

      it('costs the stroke as it always did the second time on the hole', () => {
        const h = held([banded(band)], 'waders');
        intoTheBand(h);
        intoTheBand(h);
        expect(told(h, event)).toHaveLength(2);
        expect(told(h, 'waded'), 'told once, for the first').toHaveLength(1);
        expect(h.game.strokes).toBe(3);
      });

      it('is the plain game without the item: a stroke for the first, and nothing told of it', () => {
        const h = held([banded(band)], '');
        intoTheBand(h);
        expect(h.game.strokes).toBe(2);
        expect(told(h, 'waded')).toHaveLength(0);
        expect(h.game.wadersUsed).toBe(false);
      });

      it('is given again on the next hole, and not before', () => {
        const h = held([banded(band, 'One'), banded(band, 'Two')], 'waders');
        intoTheBand(h);
        expect(h.game.wadersUsed).toBe(true);
        h.game.begin(1);
        expect(h.game.wadersUsed).toBe(false);
        intoTheBand(h);
        expect(h.game.strokes).toBe(1);
        expect(told(h, 'waded')).toHaveLength(2);
      });
    });
  }

  it('does not cover sand, which a ball is never lost in: a stroke is not given back for a bunker', () => {
    const hole = levelHole({ name: 'Sandy', par: 4, length: 330, bunker: true });
    const { game } = held([hole], 'waders');
    game.pick('driver');
    game.shoot(NORTH, 1);
    settle(game);
    expect(game.strokes).toBe(1);
    expect(game.wadersUsed).toBe(false);
  });

  it('is held to the limit: the last stroke allowed, lost, is still picked up', () => {
    const h = held([banded('~')], 'waders');
    const { game } = h;
    // a game of strokes up to the limit: the stroke in the air is the limit's
    (game as unknown as { strokes: number }).strokes = game.limit - 1;
    intoTheBand(h);
    expect(game.phase).toBe('done');
    expect(game.card[0]).toBe(game.limit);
  });

  it('is told to the rehearsal: a trial lost in the water is lost still, though it cost no stroke, and the preview ends in the water', () => {
    const hole = FLAT.pond;
    const withWaders = held([hole], 'waders').game;
    const plain = held([hole], '').game;
    const at = { x: withWaders.world.x[withWaders.ball], y: withWaders.world.y[withWaders.ball] };
    let water = 0;
    for (const club of BAG.filter((c) => c.loft > 0)) {
      for (const power of [0.5, 0.6, 0.7, 0.8, 0.9, 1]) {
        const a = new Rehearsal(plain.rehearsal()).shot(at, club.id, NORTH, power);
        const b = new Rehearsal(withWaders.rehearsal()).shot(at, club.id, NORTH, power);
        expect(b.lost, `${club.id} ${power}`).toBe(a.lost);
        expect(b.holed).toBe(a.holed);
        expect(b.x).toBeCloseTo(a.x, 9);
        expect(b.y).toBeCloseTo(a.y, 9);
        const pa = new Previewer(plain).run(at, club, NORTH, power);
        const pb = new Previewer(withWaders).run(at, club, NORTH, power);
        expect(pb.end).toBe(pa.end);
        expect(pb.x).toBeCloseTo(pa.x, 9);
        if (a.lost) water++;
      }
    }
    expect(water, 'the shots that reach the pond are counted').toBeGreaterThan(2);
  });

  it('draws no chance of its own', () => {
    const draws = (item: string) => {
      let n = 0;
      const game = new Game(
        new Progress(memoryStore(JSON.stringify({ owned: item ? [item] : [], item }))),
        {},
        {
          random: () => (n++, 0.5),
          course: [banded('~')],
        },
      );
      game.pick('putter');
      game.shoot(NORTH, 0.6);
      settle(game);
      return n;
    };
    expect(draws('waders')).toBe(draws(''));
  });
});

describe('the mulligan', () => {
  const hole = field('f', 130, 41);
  const driven = (h: Held) => {
    h.game.pick('driver');
    expect(h.game.shoot(NORTH, 1)).toBe(true);
    settle(h.game);
  };

  it('is refused with no stroke taken, and does nothing', () => {
    const h = held([hole], 'mulligan');
    expect(h.game.mulligan()).toBe(false);
    expect(h.game.strokes).toBe(0);
    expect(h.game.mulliganUsed).toBe(false);
  });

  it('undoes the stroke: one fewer, the ball back on its last lie, ready, and told of', () => {
    const h = held([hole], 'mulligan');
    const { game } = h;
    const tee = { x: game.world.x[game.ball], y: game.world.y[game.ball] };
    driven(h);
    expect(game.strokes).toBe(1);
    expect(game.world.y[game.ball]).toBeGreaterThan(tee.y + 100);
    expect(game.mulligan()).toBe(true);
    expect(game.strokes).toBe(0);
    expect(game.world.x[game.ball]).toBeCloseTo(tee.x, 6);
    expect(game.world.y[game.ball]).toBeCloseTo(tee.y, 6);
    expect(game.ready).toBe(true);
    expect(told(h, 'mulliganed')).toHaveLength(1);
    expect(game.mulliganUsed).toBe(true);
    expect(checkInvariants(game)).toEqual([]);
    // and the stroke can be played again
    driven(h);
    expect(game.strokes).toBe(1);
  });

  it('puts the ball back on the lie of the second stroke when it is the second that is retaken', () => {
    const h = held([hole], 'mulligan');
    const { game } = h;
    driven(h);
    const second = { x: game.world.x[game.ball], y: game.world.y[game.ball] };
    game.pick('putter');
    game.shoot(NORTH, 0.5);
    settle(game);
    expect(game.strokes).toBe(2);
    expect(game.mulligan()).toBe(true);
    expect(game.strokes).toBe(1);
    expect(game.world.x[game.ball]).toBeCloseTo(second.x, 6);
    expect(game.world.y[game.ball]).toBeCloseTo(second.y, 6);
  });

  it('may be taken while the ball is still in flight, which is the retake of a stroke just taken', () => {
    const h = held([hole], 'mulligan');
    const { game } = h;
    game.pick('driver');
    game.shoot(NORTH, 1);
    game.step(DT * 20);
    expect(game.ready).toBe(false);
    expect(game.mulligan()).toBe(true);
    expect(game.strokes).toBe(0);
    expect(game.ready).toBe(true);
    // nothing of the flight is left to land, lose or knock
    for (let f = 0; f < 600; f++) game.step(DT);
    expect(game.strokes).toBe(0);
    expect(checkInvariants(game)).toEqual([]);
  });

  it('is one a round: a second is refused, on this hole and on the next', () => {
    const h = held([hole, hole], 'mulligan');
    const { game } = h;
    driven(h);
    expect(game.mulligan()).toBe(true);
    driven(h);
    expect(game.mulligan()).toBe(false);
    expect(game.strokes).toBe(1);
    game.begin(1);
    driven(h);
    expect(game.mulligan()).toBe(false);
    expect(game.strokes).toBe(1);
  });

  it('is given again by a new round', () => {
    const h = held([hole], 'mulligan');
    const { game } = h;
    driven(h);
    game.mulligan();
    game.newRound();
    expect(game.mulliganUsed).toBe(false);
    driven(h);
    expect(game.mulligan()).toBe(true);
  });

  it('is refused once the hole is done, whether holed or picked up, and the strokes stand', () => {
    const h = held([levelHole({ name: 'Tiny', par: 3, length: 105 })], 'mulligan');
    const { game } = h;
    game.pick('putter');
    game.shoot(NORTH, 1);
    // a hole picked up at the limit: strokes put to it by hand, as the limit is a long way of play
    (game as unknown as { strokes: number }).strokes = game.limit;
    for (let f = 0; f < 60 * 30 && game.phase === 'play'; f++) game.step(DT);
    expect(game.phase).toBe('done');
    const strokes = game.strokes;
    expect(game.mulligan()).toBe(false);
    expect(game.strokes).toBe(strokes);
    expect(game.mulliganUsed).toBe(false);
  });

  it('is refused without the item in hand, whatever is owned, and takes the item equipped now', () => {
    const owned = held([hole], '', ['mulligan']);
    driven(owned);
    expect(owned.game.mulligan()).toBe(false);
    expect(owned.game.strokes).toBe(1);
    // equipped mid-hole it counts: the effect is looked up when asked
    owned.game.equip('mulligan');
    expect(owned.game.mulligan()).toBe(true);
    // and none at all in a new game with no save
    const bare = held([hole]);
    driven(bare);
    expect(bare.game.mulligan()).toBe(false);
  });

  it('never takes the strokes below nought, and is no stroke itself', () => {
    const h = held([hole], 'mulligan');
    driven(h);
    h.game.mulligan();
    expect(h.game.strokes).toBe(0);
    expect(h.game.mulligan()).toBe(false);
    expect(h.game.strokes).toBe(0);
  });

  it('leaves the club, shape and spin the player chose as they were', () => {
    const game = new Game(
      new Progress(memoryStore(JSON.stringify({ owned: ['mulligan'], item: 'mulligan' }))),
      {},
      {
        random: seeded(5),
        course: [hole],
      },
    );
    game.pick('7-iron');
    game.shoot(NORTH, 1);
    game.pick('9-iron');
    game.setShape(1);
    game.setSpin(-1);
    game.mulligan();
    expect(game.inHand.id).toBe('9-iron');
    expect(game.shape).toBe(1);
    expect(game.spin).toBe(-1);
  });

  it('is held to every rule on every frame of a round played with it', () => {
    const h = held([hole], 'mulligan', ['mulligan'], 0, 3);
    const { game } = h;
    for (let k = 0; k < 3; k++) {
      game.pick('driver');
      game.shoot(NORTH + (k - 1) * 0.1, 1);
      for (let f = 0; f < 120; f++) {
        game.step(DT);
        expect(checkInvariants(game), `stroke ${k} frame ${f}`).toEqual([]);
        if (k === 1 && f === 50) game.mulligan();
      }
    }
    expect(game.mulliganUsed).toBe(true);
  });
});

describe('the lucky penny', () => {
  const tiny = levelHole({ name: 'Penny pitch', par: 3, length: 105 });
  /** A hole holed in the fewest strokes the rehearsal's autopilot can: the ball is put in the cup by the game's own end. */
  const holeOut = (game: Game) => {
    (game as unknown as { done(how: 'holed' | 'pickedUp'): void }).done('holed');
  };

  it('is described as a consumable: double coins, then used up', () => {
    expect(itemById('penny')?.effect).toBe('Next hole pays double coins. Used up.');
  });

  it('pays double coins for the hole begun with it, and is then spent: not owned, not equipped', () => {
    const plain = held([tiny, tiny], '', [], 0);
    plain.game.shoot(NORTH, 0.5);
    holeOut(plain.game);
    const normal = plain.game.progress.save.coins;
    expect(normal).toBeGreaterThan(0);

    const h = held([tiny, tiny], 'penny', ['penny'], 0);
    h.game.shoot(NORTH, 0.5);
    holeOut(h.game);
    expect(h.game.progress.save.coins).toBe(normal * 2);
    // a hole in one's gem is not doubled, only the coins
    expect(told(h, 'paid')[0][1]).toEqual([normal * 2, 1]);
    expect(h.game.progress.save.gems).toBe(1);
    expect(h.game.progress.save.owned).not.toContain('penny');
    expect(h.game.item).toBe('');
    expect(told(h, 'spent')).toEqual([['spent', ['penny']]]);
  });

  it('is spent once: the next hole pays as normal', () => {
    const h = held([tiny, tiny], 'penny', ['penny'], 0);
    h.game.shoot(NORTH, 0.5);
    holeOut(h.game);
    const first = h.game.progress.save.coins;
    h.game.begin(1);
    h.game.shoot(NORTH, 0.5);
    holeOut(h.game);
    expect(h.game.progress.save.coins - first).toBe(first / 2);
  });

  it('is not spent by a hole picked up, which pays nothing, and stands for the next', () => {
    const h = held([tiny, tiny], 'penny', ['penny'], 0);
    h.game.shoot(NORTH, 0.5);
    (h.game as unknown as { done(how: string): void }).done('pickedUp');
    expect(h.game.progress.save.coins).toBe(0);
    expect(h.game.progress.save.owned).toContain('penny');
    expect(h.game.item).toBe('penny');
    h.game.begin(1);
    h.game.shoot(NORTH, 0.5);
    holeOut(h.game);
    expect(h.game.progress.save.owned).not.toContain('penny');
    expect(h.game.progress.save.coins).toBeGreaterThan(5);
  });

  it('counts only for a hole begun with it equipped: put on mid-hole, it waits for the next', () => {
    const h = held([tiny, tiny], '', ['penny'], 0);
    h.game.equip('penny');
    h.game.shoot(NORTH, 0.5);
    holeOut(h.game);
    const plainPay = h.game.progress.save.coins;
    expect(plainPay).toBe(5 + 5 * 2);
    expect(h.game.progress.save.owned, 'not spent by a hole it did not begin').toContain('penny');
    expect(h.game.item).toBe('penny');
    h.game.begin(1);
    h.game.shoot(NORTH, 0.5);
    holeOut(h.game);
    expect(h.game.progress.save.coins).toBe(plainPay + 2 * plainPay);
  });

  it('can be bought again once spent, and not while it is owned', () => {
    const h = held([tiny], 'penny', ['penny'], 1000);
    expect(h.game.buy('penny')).toBe(false);
    h.game.shoot(NORTH, 0.5);
    holeOut(h.game);
    const coins = h.game.progress.save.coins;
    expect(h.game.buy('penny')).toBe(true);
    expect(h.game.progress.save.coins).toBe(coins - itemById('penny')!.coins);
    expect(h.game.equip('penny')).toBe(true);
    expect(h.game.item).toBe('penny');
  });

  it('is saved spent: reloaded from the written save, it is gone', () => {
    const store = memoryStore(JSON.stringify({ owned: ['penny'], item: 'penny' }));
    const game = new Game(new Progress(store), {}, { random: seeded(1), course: [tiny] });
    game.shoot(NORTH, 0.5);
    holeOut(game);
    const again = new Progress(store);
    expect(again.save.owned).not.toContain('penny');
    expect(again.save.item).toBe('');
  });

  it('is no part of a rehearsal: a trial that holes out spends nothing of the game it rehearses', () => {
    const game = held([tiny], 'penny', ['penny'], 0).game;
    const r = game.rehearsal();
    r.trial(game.world.x[game.ball], game.world.y[game.ball]);
    holeOut(r);
    expect(game.progress.save.owned).toContain('penny');
    expect(game.progress.save.coins).toBe(0);
  });
});

describe('every rule holds on every frame of a round with each of the rule and sight items', () => {
  const holes = [
    FLAT.pitch,
    levelHole({ name: 'Rules windy', par: 4, length: 330, bunker: true, wind: 14 }),
    FLAT.pond,
  ];
  for (const id of ['waders', 'mulligan', 'penny', 'ghost', 'reader']) {
    it(`${id}: seeded rounds of the autopilot's, golf and minigolf, a retake tried every so often`, () => {
      let frames = 0;
      for (const [k, hole] of [...holes, field('f', 130, 41)].entries()) {
        const h = held([hole, hole], id, [id], 0, 5 + k);
        const { game } = h;
        const pilot = new Autopilot(game, { replay: true });
        const previewer = new Previewer(game);
        for (let f = 0; f < 60 * 30; f++) {
          pilot.step(DT);
          if (f % 90 === 0) game.mulligan();
          if (f % 45 === 0 && game.ready && game.layout.golf) {
            const at = { x: game.world.x[game.ball], y: game.world.y[game.ball] };
            const p = previewer.run(at, bagClub('7-iron'), NORTH, 0.8);
            expect(previewProblems(game, at, bagClub('7-iron'), p), `${id} preview, frame ${f}`).toEqual([]);
          }
          const bad = checkInvariants(game);
          if (bad.length) throw new Error(`${id} on ${hole.name}, frame ${f}: ${bad.join('; ')}`);
          frames++;
        }
      }
      expect(frames).toBe(60 * 30 * 4);
    });
  }
});
