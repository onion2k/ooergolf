/** The shop's kit: the empty shop, the neutral kit, what a save of the three aisles reads as, and golf paying into it. */
import { describe, expect, it } from 'vitest';
import { AISLES, CEILINGS, ITEMS, NO_KIT, PAY, itemById, kitOf, paid } from '../src/items';
import { checkInvariants } from '../src/invariants';
import { Progress, memoryStore } from '../src/progress';
import { golfGame, field, newGame, DT } from './helpers';

describe('the catalogue', () => {
  it('has fifteen items in each aisle, with unique ids, and sells nothing by an id that was withdrawn', () => {
    for (const aisle of AISLES) expect(ITEMS.filter((i) => i.aisle === aisle)).toHaveLength(15);
    expect(new Set(ITEMS.map((i) => i.id)).size).toBe(ITEMS.length);
    for (const id of ['', 'putter', 'glow', 'glove', 'penny', 'mulligan']) expect(itemById(id), id).toBeUndefined();
  });
});

describe('the kit', () => {
  it('is NO_KIT itself for three empty slots, and for slots no one sells', () => {
    expect(kitOf({ club: '', ball: '', accessory: '' })).toBe(NO_KIT);
    expect(kitOf({ club: 'glove', ball: 'x', accessory: '' })).toBe(NO_KIT);
  });

  it('has every neutral figure inside its ceiling', () => {
    for (const [key, range] of Object.entries(CEILINGS)) {
      const n = NO_KIT[key as keyof typeof NO_KIT] as number;
      expect(n, key).toBeGreaterThanOrEqual(range.least ?? -Infinity);
      expect(n, key).toBeLessThanOrEqual(range.most ?? Infinity);
    }
    expect(NO_KIT.underParPay).toBe(PAY.underPar);
  });

  it('is the game’s own with nothing worn, and the rehearsal’s too', () => {
    const { game } = newGame(1, JSON.stringify({ coins: 10_000, gems: 20 }));
    expect(game.kit).toBe(NO_KIT);
    expect(game.rehearsal().kit).toBe(NO_KIT);
    expect(game.slots).toEqual({ club: '', ball: '', accessory: '' });
    expect(checkInvariants(game)).toEqual([]);
  });
});

describe('buying and equipping', () => {
  it('refuses what is not sold, and an aisle emptied stays empty', () => {
    const { game } = newGame(1, JSON.stringify({ coins: 10_000, gems: 20 }));
    expect(game.buy('glove')).toBe(false);
    expect(game.buy('')).toBe(false);
    expect(game.equip('glove')).toBe(false);
    for (const aisle of AISLES) game.unequip(aisle);
    expect(game.slots).toEqual({ club: '', ball: '', accessory: '' });
    expect(game.progress.save.coins).toBe(10_000);
  });
});

describe('buying, wearing one from each aisle and taking it off', () => {
  it('charges coins and gems, refuses what cannot be paid for or is owned, and tells of it', () => {
    const { game, told } = newGame(1, JSON.stringify({ coins: 170, gems: 0 }));
    expect(game.buy('gold'), 'a gold set wants gems').toBe(false);
    expect(game.buy('mallet'), 'a mallet wants 160').toBe(true);
    expect(game.progress.save.coins).toBe(10);
    expect(told).toContain('bought 160 0');
    expect(game.buy('mallet'), 'owned already').toBe(false);
    expect(game.buy('clay'), 'too dear now').toBe(false);
    expect(game.progress.save.owned).toEqual(['mallet']);
  });

  it('wears one from each aisle at once, a second of an aisle in the place of the first, and takes one off', () => {
    const { game, told } = newGame(1, JSON.stringify({ coins: 5000, gems: 20 }));
    for (const id of ['mallet', 'bender', 'clay', 'comet']) expect(game.buy(id)).toBe(true);
    expect(game.equip('lob'), 'not owned').toBe(false);
    for (const id of ['mallet', 'clay', 'comet']) expect(game.equip(id), id).toBe(true);
    expect(game.slots).toEqual({ club: 'mallet', ball: 'clay', accessory: 'comet' });
    expect(game.kit.touch).toBe(1.5);
    expect(game.kit.roll).toBe(1.15);
    expect(game.kit.trail).toBe(true);
    game.equip('bender');
    expect(game.slots.club).toBe('bender');
    expect(game.kit.touch, 'the mallet is off').toBe(1);
    expect(game.kit.curve).toBe(2);
    expect(game.kit.roll, 'the ball stays on').toBe(1.15);
    game.unequip('ball');
    expect(game.slots).toEqual({ club: 'bender', ball: '', accessory: 'comet' });
    expect(game.kit.roll).toBe(1);
    expect(told.filter((t) => t.startsWith('equipped')).length).toBe(5);
    expect(checkInvariants(game)).toEqual([]);
    // and it is saved: a game opened on the save wears the same
    const again = new Progress(memoryStore(JSON.stringify(game.progress.save))).save;
    expect(again.kit).toEqual({ club: 'bender', ball: '', accessory: 'comet' });
  });
});

describe('the save', () => {
  it('reads the kit slot by slot, only an owned item of its own aisle, and drops an old save’s item', () => {
    const save = new Progress(
      memoryStore(JSON.stringify({ owned: ['glow', 'brass'], item: 'glow', kit: { club: 'brass', ball: 7 } })),
    ).save;
    expect(save.owned).toEqual([]);
    expect(save.kit).toEqual({ club: '', ball: '', accessory: '' });
    expect(Object.keys(save)).not.toContain('item');
  });

  it('reads a best’s old `item` or `club` as an empty kit, tolerates an unknown one, and writes `kit`', () => {
    const store = memoryStore(
      JSON.stringify({
        best: { A: { strokes: 2, club: 'glove' }, B: { strokes: 3, item: 'zzz' }, C: { strokes: 4 } },
      }),
    );
    const progress = new Progress(store);
    const none = { club: '', ball: '', accessory: '' };
    expect(progress.save.best).toEqual({
      A: { strokes: 2, kit: none },
      B: { strokes: 3, kit: none },
      C: { strokes: 4, kit: none },
    });
    progress.persist();
    const written = JSON.parse(store.json!) as { best: Record<string, unknown> };
    expect(written.best.A).toEqual({ strokes: 2, kit: none });
  });
});

describe('golf pays', () => {
  it('pays the same as minigolf for the same score, a hole in one’s gem included, and nothing for a pick-up', () => {
    const hole = field('g');
    const { game, told } = golfGame(hole);
    game.pick('putter');
    game.place(game.layout.cup.x + 6, game.layout.cup.y);
    game.shoot(Math.PI, 0.14);
    for (let f = 0; f < 60 * 30 && game.phase === 'play'; f++) game.step(DT);
    const due = paid(1, hole.par, false);
    expect(due.gems).toBe(PAY.holeInOne);
    expect(game.progress.save).toMatchObject({ coins: due.coins, gems: due.gems });
    expect(told).toContain(`paid ${due.coins} ${due.gems}`);
    expect(paid(9, hole.par, true)).toEqual({ coins: 0, gems: 0 });
  });
});
