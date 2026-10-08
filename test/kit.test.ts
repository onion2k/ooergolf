/**
 * The kit and the catalogue it is worked out from: the empty kit is the game, the slots combine as the figures say, no
 * combination passes a ceiling, and the forty-five items are what the plan's sheet says of each aisle.
 */
import { describe, expect, it } from 'vitest';
import { BAG, PUTTER, strikeFactor, tuned } from '../src/bag';
import {
  AISLES,
  CEILINGS,
  FIRST_STROKE_MOST,
  ITEMS,
  NO_KIT,
  emptySlots,
  itemById,
  kitOf,
  type Item,
  type Kit,
} from '../src/items';
import { slotsOf } from './kits';

const OLD_IDS = [
  'glow', 'confetti', 'rainbow', 'ghost', 'penny', 'spin', 'curve', 'sock', 'wedge', 'grip',
  'sticky', 'rubber', 'slow', 'reader', 'mulligan', 'waders', 'magnet', 'glove',
]; // prettier-ignore

const inAisle = (aisle: Item['aisle']) => ITEMS.filter((i) => i.aisle === aisle);
const keysOf = (item: Item) => Object.keys(item.figures) as (keyof Kit)[];

/** The figures that change how a golf shot is struck or flies (the putter's, on a golf green, among them). */
const GOLF_STRIKE: (keyof Kit)[] = [
  'power', 'woods', 'ironScatter', 'ironLoss', 'putterPower', 'scatter', 'loss', 'curve', 'spin', 'loft',
  'wedgeLoft', 'wedgeSpin', 'wind', 'sandStrike', 'roughStrike', 'touch',
]; // prettier-ignore
/** The figures that change how a putt on minigolf is struck. */
const MINI_STRIKE: (keyof Kit)[] = [
  'power', 'putterPower', 'touch', 'puttScatter', 'puttScatterScale', 'bend', 'puttSpin', 'chipSand', 'chipAll',
  'sandPutt',
]; // prettier-ignore
/** How the ball moves on the ground: a ball sets these and nothing else. */
const GROUND: (keyof Kit)[] = ['roll', 'sand', 'green', 'rough', 'rail', 'keep', 'hop', 'belt'];
/** The ground figures that bite on a hole of golf, and on a hole of minigolf (no rough, landing or hop there; no belt on golf). */
const GOLF_GROUND: (keyof Kit)[] = ['roll', 'sand', 'green', 'rough', 'rail', 'keep', 'hop'];
const MINI_GROUND: (keyof Kit)[] = ['roll', 'sand', 'green', 'rail', 'belt'];

describe('the empty kit', () => {
  it('is NO_KIT itself for empty slots, and for slots that name nothing the shop sells', () => {
    expect(kitOf(emptySlots())).toBe(NO_KIT);
    expect(kitOf({ club: 'glove', ball: 'sticky', accessory: 'waders' })).toBe(NO_KIT);
  });

  it('is neutral in every figure: ones, noughts, switches off', () => {
    for (const key of Object.keys(NO_KIT) as (keyof Kit)[]) {
      const v = NO_KIT[key];
      const neutral = v === null || v === false || v === 0 || v === 1 || key === 'underParPay' || key === 'firstStroke';
      expect(neutral, key).toBe(true);
    }
    expect(NO_KIT.firstStroke).toEqual({ power: 1, scatter: 1 });
    for (const club of [...BAG, PUTTER]) expect(strikeFactor(club, NO_KIT)).toBe(1);
    for (const club of [...BAG, PUTTER]) expect(tuned(club, NO_KIT), club.id).toBe(club);
  });
});

describe('combining the slots', () => {
  it('multiplies a multiplier, adds an offset and takes the larger of a maximum, as the figure says', () => {
    // two multipliers: the cavity backs' touch and scatter with the gloves'
    const k = kitOf(slotsOf(['cavity', 'gloves']));
    expect(k.touch).toBeCloseTo(1.15 * 1.2, 12);
    expect(k.scatter).toBeCloseTo(0.75 * 0.6, 12);
    expect(k.loss).toBeCloseTo(0.75 * 0.6, 12);
    expect(k.putterPower).toBeCloseTo(1.04, 12);
    // a club and a ball and an accessory each in their own figures: the other two are not touched
    const all = kitOf(slotsOf(['bender', 'bouncer', 'cap']));
    expect(all.curve).toBe(2);
    expect(all.bend).toBe(0.35);
    expect(all.rail).toBe(1.5);
    expect(all.hop).toBe(1.5);
    expect(all.wind).toBe(0.6);
    expect(all.belt).toBe(0.6);
    expect(all.scatter).toBe(1);
    // a ball and an accessory that both pull a belt multiply: the featherie's 1.3 and the cap's 0.6
    expect(kitOf(slotsOf(['feather', 'cap'])).belt).toBeCloseTo(1.3 * 0.6, 12);
    // and the unworn slot leaves the rest as it was
    expect(kitOf(slotsOf(['clay'])).roll).toBe(1.15);
    expect(kitOf(slotsOf(['clay'])).power).toBe(1);
  });

  it('works the first stroke, the pay and the cup out from the one item that sets each', () => {
    const k = kitOf(slotsOf(['tee', 'long']));
    expect(k.firstStroke).toEqual({ power: 1.05, scatter: 0.5 });
    expect(kitOf(slotsOf(['clover'])).underParPay).toBe(7);
    expect(kitOf(slotsOf(['horseshoe'])).cupRadius).toBe(1.8);
    expect(kitOf(slotsOf(['watch'])).retake).toBe(true);
    // a club's sand override is the club's, whole
    expect(kitOf(slotsOf(['bunker'])).sandStrike).toEqual({ power: 0.9, loft: 2, wild: 1.1 });
    expect(kitOf(slotsOf(['rescue'])).roughStrike).toEqual({ power: 0.9, wild: 1.2 });
  });

  it('does not change the shared NO_KIT when it combines, whatever is worn', () => {
    const before = JSON.stringify(NO_KIT);
    for (const item of ITEMS) kitOf(slotsOf([item.id]));
    expect(JSON.stringify(NO_KIT)).toBe(before);
  });
});

describe('the ceilings', () => {
  it('hold for every club, ball and accessory worn together', () => {
    const clubs = inAisle('club'),
      balls = inAisle('ball'),
      accessories = inAisle('accessory');
    let worst = 0;
    for (const c of clubs)
      for (const b of balls)
        for (const a of accessories) {
          const kit = kitOf({ club: c.id, ball: b.id, accessory: a.id });
          for (const [key, range] of Object.entries(CEILINGS)) {
            const n = kit[key as keyof Kit] as number;
            expect(n, `${c.id} ${b.id} ${a.id} ${key}`).toBeGreaterThanOrEqual((range.least ?? -Infinity) - 1e-12);
            expect(n, `${c.id} ${b.id} ${a.id} ${key}`).toBeLessThanOrEqual((range.most ?? Infinity) + 1e-12);
          }
          // the power of any club the kit strikes, the three figures together, and the first stroke's gift over it
          for (const club of [...BAG, PUTTER]) {
            const f = strikeFactor(club, kit);
            worst = Math.max(worst, f);
            expect(f, `${c.id} ${a.id} ${club.id}`).toBeLessThanOrEqual(1.2 + 1e-12);
            expect(f * kit.firstStroke.power, `${c.id} ${a.id} ${club.id} first`).toBeLessThanOrEqual(
              FIRST_STROKE_MOST + 1e-12,
            );
          }
        }
    // the ceiling was reached (the mallet and the shoes, the long bombers and the shoes), so the min was asked for
    expect(worst).toBeCloseTo(1.2, 12);
    expect(FIRST_STROKE_MOST).toBeCloseTo(1.2 * 1.05, 12);
  });

  it('clamps the power of a putter to 1.2 where its figures come to 1.219', () => {
    const kit = kitOf(slotsOf(['mallet', 'shoes']));
    expect(kit.power * kit.putterPower).toBeCloseTo(1.219, 12);
    expect(strikeFactor(PUTTER, kit)).toBe(1.2);
    // and the woods: the titanium driver with the shoes is under it, and with the long bombers under it too
    expect(strikeFactor(BAG[0], kitOf(slotsOf(['titan', 'shoes'])))).toBeCloseTo(1.12 * 1.06, 12);
  });
});

describe('the catalogue', () => {
  it('has fifteen in each aisle, every id once, and none of the eighteen withdrawn ids', () => {
    for (const aisle of AISLES) expect(inAisle(aisle), aisle).toHaveLength(15);
    expect(ITEMS).toHaveLength(45);
    expect(new Set(ITEMS.map((i) => i.id)).size).toBe(45);
    expect(new Set(ITEMS.map((i) => i.name)).size, 'names').toBe(45);
    for (const id of OLD_IDS) expect(itemById(id), id).toBeUndefined();
  });

  it('prices each aisle cheapest first, and asks gems only of the strongest', () => {
    for (const aisle of AISLES) {
      const prices = inAisle(aisle).map((i) => i.coins);
      expect(prices, aisle).toEqual([...prices].sort((a, b) => a - b));
      for (const i of inAisle(aisle)) expect(i.coins, i.id).toBeGreaterThan(0);
    }
    expect(ITEMS.filter((i) => i.gems > 0).length).toBeLessThanOrEqual(12);
  });

  it('gives a club a figure for a golf shot and one for a putt, and none for the ground', () => {
    for (const club of inAisle('club')) {
      const keys = keysOf(club);
      expect(
        keys.some((k) => GOLF_STRIKE.includes(k) && k !== 'touch' && k !== 'putterPower') ||
          keys.includes('putterPower') ||
          keys.includes('touch'),
        `${club.id} golf`,
      ).toBe(true);
      expect(
        keys.some((k) => MINI_STRIKE.includes(k)),
        `${club.id} minigolf`,
      ).toBe(true);
      for (const k of keys) expect(GROUND.includes(k), `${club.id} sets ${k}`).toBe(false);
      for (const k of keys)
        expect([...GOLF_STRIKE, ...MINI_STRIKE].includes(k), `${club.id} sets ${k}, which is not a strike`).toBe(true);
      expect(club.look, `${club.id} has no ball look`).toBeUndefined();
    }
  });

  it('gives a ball a ground figure that bites on golf and one that bites on minigolf, and no strike figure', () => {
    for (const ball of inAisle('ball')) {
      const keys = keysOf(ball);
      for (const k of keys) expect(GROUND.includes(k), `${ball.id} sets ${k}, which is not the ground`).toBe(true);
      // a figure that is not the neutral one
      const moves = (list: (keyof Kit)[]) => list.some((k) => keys.includes(k) && ball.figures[k] !== NO_KIT[k]);
      expect(moves(GOLF_GROUND), `${ball.id} on golf`).toBe(true);
      expect(moves(MINI_GROUND), `${ball.id} on minigolf`).toBe(true);
    }
  });

  it('gives an accessory a figure of the kit that is not a club’s or a ball’s alone, and every accessory something to do on each kind', () => {
    const flags: (keyof Kit)[] = [
      'trail', 'streamers', 'pennant', 'fireworks', 'piggy', 'firstStroke', 'rest', 'chalk', 'underParPay', 'retake',
      'freeLoss', 'cupRadius',
    ]; // prettier-ignore
    // what an accessory moves on a golf hole and on a hole of minigolf (the flags and the pay and the cup are on both)
    const golf = [...flags, 'wind', 'scatter', 'loss', 'touch', 'power', 'roll'] as (keyof Kit)[];
    const mini = [...flags, 'belt', 'touch', 'puttScatterScale', 'power', 'roll'] as (keyof Kit)[];
    for (const a of inAisle('accessory')) {
      const keys = keysOf(a);
      expect(keys.length, a.id).toBeGreaterThan(0);
      expect(
        keys.some((k) => golf.includes(k)),
        `${a.id} on golf`,
      ).toBe(true);
      expect(
        keys.some((k) => mini.includes(k)),
        `${a.id} on minigolf`,
      ).toBe(true);
    }
  });

  it('gives every item a line of what it does, a swatch colour of three channels, and a ball a look', () => {
    for (const i of ITEMS) {
      expect(i.effect.length, i.id).toBeGreaterThan(10);
      expect(i.colour, i.id).toHaveLength(3);
      for (const c of i.colour) expect(c).toBeGreaterThanOrEqual(0);
      expect(!!i.look, `${i.id} look`).toBe(i.aisle === 'ball');
    }
  });
});

describe('how each ball looks', () => {
  const balls = inAisle('ball');
  const same = (a: Item, b: Item) =>
    JSON.stringify([a.look!.colour, a.look!.second, a.look!.pattern, a.look!.scale, a.look!.finish]) ===
    JSON.stringify([b.look!.colour, b.look!.second, b.look!.pattern, b.look!.scale, b.look!.finish]);

  it('is different for every ball, in colour, second colour, pattern and finish together', () => {
    for (let i = 0; i < balls.length; i++)
      for (let j = i + 1; j < balls.length; j++)
        expect(same(balls[i], balls[j]), `${balls[i].id} ${balls[j].id}`).toBe(false);
  });

  it('keeps the main colours at least 0.2 apart in red, green and blue, so a ball is picked by its colour', () => {
    let nearest = Infinity;
    for (let i = 0; i < balls.length; i++)
      for (let j = i + 1; j < balls.length; j++) {
        const [a, b] = [balls[i].look!.colour, balls[j].look!.colour];
        const d = Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2]);
        nearest = Math.min(nearest, d);
        expect(d, `${balls[i].id} and ${balls[j].id}`).toBeGreaterThanOrEqual(0.2);
      }
    // the least is a figure that was seen, so the loop compared pairs
    expect(nearest).toBeLessThan(1);
  });

  it('is a swatch of the same colour as the look’s', () => {
    for (const b of balls) expect(b.colour).toEqual(b.look!.colour);
  });
});
