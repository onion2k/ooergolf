/**
 * The bag: the clubs a golf hole is played with, fixed and all there from the start. Each has a loft and a hardest
 * launch speed; how far it carries is worked out from them, and a bag is only a bag if its clubs go further one after
 * another, so a player always has a club for the distance they have left.
 */
import { describe, expect, it } from 'vitest';
import { HARDEST_SHOT } from '../src/arena';
import { BAG, PUTTER, bagClub, carryOf } from '../src/bag';
import { PHYSICS } from '../src/physics';

describe('the bag', () => {
  it('has a club with an id, a name, a loft between nought and ninety, and a speed to strike at', () => {
    expect(BAG.length).toBeGreaterThanOrEqual(8);
    expect(new Set(BAG.map((c) => c.id)).size, 'ids are unique').toBe(BAG.length);
    for (const c of BAG) {
      expect(c.name.length).toBeGreaterThan(2);
      expect(c.loft).toBeGreaterThanOrEqual(0);
      expect(c.loft).toBeLessThan(90);
      expect(c.hardest).toBeGreaterThan(0);
      expect(c.spread).toBeGreaterThanOrEqual(0);
    }
  });

  it('starts with a driver and ends with the putter, which strikes as the minigolf putter does', () => {
    expect(BAG[0].id).toBe('driver');
    expect(BAG[BAG.length - 1]).toBe(PUTTER);
    expect(PUTTER.loft).toBe(0);
    expect(PUTTER.hardest).toBe(HARDEST_SHOT);
    // a putt is the player's aim and no one else's
    expect(PUTTER.spread).toBe(0);
  });

  it('is found by its id, and the driver for one that is not there', () => {
    for (const c of BAG) expect(bagClub(c.id)).toBe(c);
    expect(bagClub('nine-iron-of-doom')).toBe(BAG[0]);
  });

  it('lofts higher and carries less from each club to the next, so every distance has a club', () => {
    for (let k = 1; k < BAG.length - 1; k++) {
      expect(BAG[k].loft, `${BAG[k].id} is lofted more than ${BAG[k - 1].id}`).toBeGreaterThan(BAG[k - 1].loft);
      expect(carryOf(BAG[k], 1), `${BAG[k].id} carries less than ${BAG[k - 1].id}`).toBeLessThan(
        carryOf(BAG[k - 1], 1),
      );
    }
  });

  it('carries about what a real bag carries, in yards, a unit being a yard', () => {
    const carry = (id: string) => carryOf(bagClub(id), 1);
    expect(carry('driver')).toBeGreaterThan(230);
    expect(carry('driver')).toBeLessThan(290);
    expect(carry('7-iron')).toBeGreaterThan(130);
    expect(carry('7-iron')).toBeLessThan(170);
    expect(carry('pitching-wedge')).toBeGreaterThan(85);
    expect(carry('pitching-wedge')).toBeLessThan(115);
    expect(carry('sand-wedge')).toBeGreaterThan(60);
    expect(carry('sand-wedge')).toBeLessThan(95);
  });

  it('carries in proportion to the power dragged, as a putt rolls in proportion to it', () => {
    for (const c of BAG.slice(0, -1)) {
      expect(carryOf(c, 0.5), c.id).toBeCloseTo(carryOf(c, 1) / 2, 6);
      expect(carryOf(c, 0)).toBe(0);
    }
  });

  it('carries by the formula of a ball flung at the loft, at the physics’ gravity', () => {
    const c = bagClub('7-iron');
    const loft = (c.loft * Math.PI) / 180;
    expect(carryOf(c, 1)).toBeCloseTo((c.hardest ** 2 * Math.sin(2 * loft)) / PHYSICS.gravity, 6);
  });

  it('flies for a time a player can wait out: under three seconds for every club, at full power', () => {
    for (const c of BAG) {
      const up = c.hardest * Math.sin((c.loft * Math.PI) / 180);
      expect((2 * up) / PHYSICS.gravity, c.id).toBeLessThan(3);
    }
  });
});
