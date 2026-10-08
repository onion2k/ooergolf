/**
 * The shop's prices held to the rule `items.ts` gives them: measured by `npm run value`, so that only the two items that
 * save more than the wobble are priced from it, a look is cheap, an item that costs the pace player strokes sits at its
 * aisle's floor without a gem, and gems are asked of the top two or three of each aisle. Without it a price edited by
 * hand for one item could drift out of the order the rest were measured into, and no gate would see it.
 */
import { describe, expect, it } from 'vitest';
import { AISLES, ITEMS, itemById, type Item } from '../src/items';

const inAisle = (aisle: Item['aisle']) => ITEMS.filter((i) => i.aisle === aisle);
const item = (id: string): Item => {
  const found = itemById(id);
  if (!found) throw new Error(`no item ${id}`);
  return found;
};

/** The items that cost the pace player more than the wobble (npm run value, 8 October 2026). */
const COSTLY = ['super', 'bouncer', 'hickory', 'stinger', 'cap', 'cork', 'steel', 'bowling', 'links'];
/** The accessories that are only a look. */
const LOOKS = ['comet', 'streamers', 'pennant', 'fireworks'];

describe('the shop prices', () => {
  it('asks most for the two accessories that save more than the wobble', () => {
    const accessories = inAisle('accessory').map((i) => i.id);
    const dearest = [...inAisle('accessory')].sort((a, b) => b.coins - a.coins).map((i) => i.id);
    expect(dearest.slice(0, 2)).toEqual(['horseshoe', 'snorkel']);
    expect(accessories).toContain('horseshoe');
    expect(item('horseshoe').coins).toBeGreaterThan(item('snorkel').coins);
  });

  it('puts what costs the pace player strokes at the floor of its aisle, without a gem', () => {
    for (const id of COSTLY) {
      // The Hickory Set is the one at 150: it is the dearest of the clubs that cost strokes, as its shape and bend are a human's.
      expect(item(id).coins, id).toBeLessThanOrEqual(id === 'hickory' ? 150 : 120);
      expect(item(id).gems, id).toBe(0);
    }
  });

  it('prices a look from 60 to 120 coins and asks no gem for it', () => {
    for (const id of LOOKS) {
      expect(item(id).coins, id).toBeGreaterThanOrEqual(60);
      // The Hickory Set is the one at 150: it is the dearest of the clubs that cost strokes, as its shape and bend are a human's.
      expect(item(id).coins, id).toBeLessThanOrEqual(id === 'hickory' ? 150 : 120);
      expect(item(id).gems, id).toBe(0);
    }
  });

  it('asks gems of three clubs and accessories and of the top ball, the dearest of each aisle', () => {
    // The brief's prices give the balls one gem item, the Gem Ball, and not two or three, so the floor here is one.
    for (const aisle of AISLES) {
      const items = inAisle(aisle);
      const gemmed = items.filter((i) => i.gems > 0);
      expect(gemmed.length, aisle).toBeGreaterThanOrEqual(1);
      expect(gemmed.length, aisle).toBeLessThanOrEqual(3);
      const cheapestGemmed = Math.min(...gemmed.map((i) => i.coins));
      for (const i of items.filter((x) => x.gems === 0)) expect(i.coins, i.id).toBeLessThanOrEqual(cheapestGemmed);
    }
    expect(inAisle('club').filter((i) => i.gems > 0)).toHaveLength(3);
    expect(inAisle('accessory').filter((i) => i.gems > 0)).toHaveLength(3);
  });

  it('lists each aisle cheapest first, every price a multiple of five', () => {
    for (const aisle of AISLES) {
      const prices = inAisle(aisle).map((i) => i.coins);
      expect(prices, aisle).toEqual([...prices].sort((a, b) => a - b));
    }
    for (const i of ITEMS) expect(i.coins % 5, i.id).toBe(0);
  });
});
