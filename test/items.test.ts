/** The shop's items: the catalogue, buying and equipping one at a time, the save it is kept in, and golf paying into it. */
import { describe, expect, it } from 'vitest';
import { ITEMS, NO_EFFECTS, PAY, effectsOf, itemById, paid } from '../src/items';
import { checkInvariants } from '../src/invariants';
import { Progress, memoryStore } from '../src/progress';
import { golfGame, field, newGame, DT } from './helpers';

const IDS = [
  'glow',
  'confetti',
  'rainbow',
  'ghost',
  'mulligan',
  'penny',
  'magnet',
  'grip',
  'glove',
  'spin',
  'curve',
  'sock',
  'wedge',
  'waders',
  'rubber',
  'sticky',
  'reader',
  'slow',
];

const rich = () => newGame(1, JSON.stringify({ coins: 10_000, gems: 20 }));

describe('the catalogue', () => {
  it('has the eighteen items, each id once, each priced and described, in a kind', () => {
    expect(ITEMS.map((i) => i.id).sort()).toEqual([...IDS].sort());
    expect(new Set(ITEMS.map((i) => i.id)).size).toBe(ITEMS.length);
    expect(ITEMS.filter((i) => i.kind === 'cosmetic').map((i) => i.id)).toEqual(['glow', 'confetti', 'rainbow']);
    for (const i of ITEMS) {
      expect(i.name.length, i.id).toBeGreaterThan(0);
      expect(i.effect.length, i.id).toBeGreaterThan(10);
      expect(Number.isInteger(i.coins) && i.coins > 0, i.id).toBe(true);
      expect(Number.isInteger(i.gems) && i.gems >= 0 && i.gems <= 3, i.id).toBe(true);
      expect(
        i.colour.every((c) => c >= 0 && c <= 1),
        i.id,
      ).toBe(true);
      expect(i.coins, i.id).toBeGreaterThanOrEqual(i.kind === 'cosmetic' ? 60 : 120);
      expect(i.coins, i.id).toBeLessThanOrEqual(i.kind === 'cosmetic' ? 120 : 400);
    }
    for (const id of ['glove', 'magnet', 'waders', 'mulligan']) expect(itemById(id)!.gems, id).toBeGreaterThan(0);
    expect(itemById('')).toBeUndefined();
    expect(itemById('putter')).toBeUndefined();
  });

  it('is set against a round: a cosmetic is within two rounds of nine holes at par, the dearest within nine', () => {
    const round = 9 * PAY.finish;
    for (const i of ITEMS) expect(i.coins / round, i.id).toBeLessThanOrEqual(i.kind === 'cosmetic' ? 3 : 9);
  });

  it('says what is on through Effects: nothing for no item, and only the equipped one', () => {
    for (const i of ITEMS) expect(NO_EFFECTS.has(i.id)).toBe(false);
    const fx = effectsOf('magnet');
    expect(fx.has('magnet')).toBe(true);
    expect(fx.has('glove')).toBe(false);
    expect(effectsOf('').has('')).toBe(false);
    expect(effectsOf('nonsense').has('nonsense')).toBe(false);
  });
});

describe('buying and equipping', () => {
  it('buys for the price, once, with coins and gems both, and refuses what is not sold', () => {
    const { game, told } = newGame(1, JSON.stringify({ coins: 399, gems: 3 }));
    expect(game.buy('glove'), 'a coin short').toBe(false);
    game.progress.save.coins += 1;
    expect(game.buy('glove')).toBe(true);
    expect(game.progress.save).toMatchObject({ coins: 0, gems: 0, owned: ['glove'] });
    expect(told).toContain('bought 400 3');
    expect(game.buy('glove'), 'not twice').toBe(false);
    expect(game.buy('putter')).toBe(false);
    expect(game.buy('')).toBe(false);
    const poor = newGame(1, JSON.stringify({ coins: 400, gems: 2 })).game;
    expect(poor.buy('glove'), 'a gem short').toBe(false);
    expect(poor.progress.save.coins).toBe(400);
  });

  it('equips only an item owned, one at a time, and none with the empty id', () => {
    const { game, told } = rich();
    expect(game.item).toBe('');
    expect(game.equip('glow'), 'not owned yet').toBe(false);
    game.buy('glow');
    game.buy('spin');
    expect(game.item, 'buying does not equip').toBe('');
    expect(game.equip('glow')).toBe(true);
    expect(game.item).toBe('glow');
    expect(told).toContain('equipped');
    expect(game.equip('spin')).toBe(true);
    expect(game.item, 'the second replaces the first').toBe('spin');
    expect(game.equip('curve'), 'not owned').toBe(false);
    expect(game.item).toBe('spin');
    expect(game.equip('')).toBe(true);
    expect(game.item).toBe('');
    expect(game.progress.save.owned, 'unequipping keeps it').toEqual(['glow', 'spin']);
    expect(checkInvariants(game)).toEqual([]);
  });

  it('puts the equipped item into the game’s effects, none by default, and into a rehearsal of it', () => {
    const { game } = rich();
    for (const i of ITEMS) expect(game.effects.has(i.id)).toBe(false);
    game.buy('sock');
    game.equip('sock');
    expect(game.effects.has('sock')).toBe(true);
    expect(game.effects.has('slow')).toBe(false);
    expect(game.rehearsal().effects.has('sock'), 'the rehearsal agrees').toBe(true);
    game.equip('');
    expect(game.rehearsal().effects.has('sock')).toBe(false);
  });

  it('writes the save on buying and on equipping, and a reload keeps both', () => {
    const { game, store } = rich();
    game.buy('rainbow');
    expect(new Progress(memoryStore(store.json)).save.owned).toEqual(['rainbow']);
    game.equip('rainbow');
    const again = new Progress(memoryStore(store.json)).save;
    expect(again.item).toBe('rainbow');
    expect(again.coins).toBe(10_000 - itemById('rainbow')!.coins);
  });

  it('stamps a best with the item equipped when the hole was holed', () => {
    const { game } = rich();
    game.buy('glow');
    game.equip('glow');
    const { cup } = game.layout;
    game.place(cup.x, cup.y - 4);
    game.shoot(Math.PI / 2, 0.1);
    for (let f = 0; f < 600 && game.phase === 'play'; f++) game.step(DT);
    expect(game.phase).toBe('done');
    expect(Object.values(game.progress.save.best)[0].item).toBe('glow');
  });
});

describe('the save', () => {
  it('drops an owned id the shop does not sell and any repeat, and an item not owned', () => {
    const save = new Progress(
      memoryStore(JSON.stringify({ owned: ['glow', 'brass', 'glow', 'magnet'], item: 'brass' })),
    ).save;
    expect(save.owned).toEqual(['glow', 'magnet']);
    expect(save.item).toBe('');
    expect(new Progress(memoryStore(JSON.stringify({ owned: ['glow'], item: 'magnet' }))).save.item).toBe('');
    expect(new Progress(memoryStore(JSON.stringify({ owned: ['glow'], item: 7 }))).save.item).toBe('');
  });

  it('reads a best’s old `club` as its item, tolerates an unknown one, and writes `item`', () => {
    const store = memoryStore(
      JSON.stringify({
        best: { A: { strokes: 2, club: 'glove' }, B: { strokes: 3, item: 'zzz' }, C: { strokes: 4 } },
      }),
    );
    const progress = new Progress(store);
    expect(progress.save.best).toEqual({
      A: { strokes: 2, item: 'glove' },
      B: { strokes: 3, item: '' },
      C: { strokes: 4, item: '' },
    });
    progress.persist();
    const written = JSON.parse(store.json!) as { best: Record<string, unknown> };
    expect(written.best.A).toEqual({ strokes: 2, item: 'glove' });
    expect(Object.keys(written)).not.toContain('club');
  });

  it('round-trips a save with every item owned', () => {
    const progress = new Progress(memoryStore());
    progress.save.owned = ITEMS.map((i) => i.id);
    progress.save.item = 'slow';
    const store = memoryStore(JSON.stringify(progress.save));
    expect(new Progress(store).save).toEqual(progress.save);
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
