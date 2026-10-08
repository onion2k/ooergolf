/**
 * The autopilot reads the kit as the game does. The value tool (`scripts/value.ts`) prices the shop by what the pace player
 * saves with each item, so a player who misreads an item (a loft it does not know of, a ball that hops higher than it
 * guesses) reads as an item that costs strokes, and the shop is priced by the player's fault and not the item's. These
 * hold its arithmetic to the game's, item by item, and that no ball leaves a shot hopping for ever.
 */
import { describe, expect, it } from 'vitest';
import { Autopilot, runOn } from '../src/autopilot';
import { COURSES } from '../src/course';
import { seeded } from '../src/random';
import { PLAYER, paceRun } from '../scripts/pace';
import { play } from '../scripts/value';
import { BAG } from '../src/bag';
import { ITEMS, kitOf } from '../src/items';
import { LIE } from '../src/surfaces';
import { TILE } from '../src/arena';
import { DT, field } from './helpers';
import { slotsOf, wearing } from './kits';

const NORTH = Math.PI / 2;
const LOFTED = BAG.filter((c) => c.loft > 0);

/** A club struck north on the fairway, wearing `ids`, until it is at rest: where it first came down, where it rested, and how long it took. */
function run(ids: readonly string[], club: string, power = 1) {
  const { game, calls } = wearing(ids, [field('f')]);
  game.place(game.layout.tee.x, game.layout.tee.y + 2 * TILE);
  const { world, ball } = game;
  game.pick(club);
  const y0 = world.y[ball];
  expect(game.shoot(NORTH, power)).toBe(true);
  let carry = 0,
    landed = 0,
    seconds = 0;
  for (let f = 0; f < 40 / DT && !(f > 1 && game.ready); f++) {
    game.step(DT);
    seconds = (f + 1) * DT;
    const told = calls.filter((c) => c[0] === 'landed').length;
    if (told > landed && landed === 0) carry = world.y[ball] - y0;
    landed = told;
  }
  return { carry, rest: world.y[ball] - y0, seconds, asleep: world.asleep[ball] === 1 };
}

describe('the autopilot’s guess of a run-out', () => {
  it('is the game’s, to within two points of the carry, for every club and every ball of the shop, on the fairway', () => {
    const off: string[] = [];
    for (const item of ITEMS.filter((i) => i.aisle !== 'accessory')) {
      const kit = kitOf(slotsOf([item.id]));
      for (const club of LOFTED) {
        const r = run([item.id], club.id);
        const real = (r.rest - r.carry) / r.carry;
        const guess = runOn(wearing([item.id], [field('f')]).game.club(club), LIE.fairway, kit);
        // the featherie's hop of 3.6 is on the edge of what the game tells of as a landing (3), so whether it scrubs once more is a
        // coin the guess cannot call; the planner’s trials correct it, and it is held to a looser figure
        const least = item.id === 'feather' ? 0.08 : 0.02;
        if (Math.abs(guess - real) >= least)
          off.push(`${item.id}/${club.id}: guessed ${guess.toFixed(3)}, the game ran ${real.toFixed(3)}`);
      }
    }
    expect(off).toEqual([]);
  });
});

describe('a ball that hops', () => {
  it('comes to rest, asleep and not merely allowed to be struck, within eight seconds, every ball of the shop and every lofted club at full power on the fairway', () => {
    const slow: string[] = [];
    for (const item of ITEMS.filter((i) => i.aisle === 'ball'))
      for (const club of LOFTED) {
        const r = run([item.id], club.id);
        if (!r.asleep || r.seconds > 8)
          slow.push(
            `${item.id}/${club.id}: ${r.seconds.toFixed(1)} s, ${r.asleep ? 'asleep' : 'still moving when it was let be struck'}`,
          );
      }
    expect(slow).toEqual([]);
  });
});

describe('a putt struck harder, or a ball that runs differently', () => {
  const bigWheel = COURSES.find((c) => c.name === 'The Waterworks')!.holes.find((h) => h.name === 'The Big Wheel')!;

  /** How long the pace player waits on The Big Wheel's tee before its first stroke, wearing `ids`, when the hole is begun `offset` seconds before it picks up its club. */
  function wait(ids: readonly string[], offset: number) {
    const { game } = wearing(ids, [bigWheel], seeded(3));
    const pilot = new Autopilot(game, { skill: PLAYER, random: seeded(5) });
    for (let t = 0; t < offset; t += DT) game.step(DT);
    const began = game.t;
    for (let f = 0; f < 30 / DT && game.strokes === 0; f++) pilot.step(DT);
    expect(game.strokes, 'a stroke was struck').toBe(1);
    return game.t - began;
  }

  it('is not left waiting out the whole of its time and striking blind on The Big Wheel: where the way has no window for a faster ball it settles for a nearer place that has one', () => {
    // the hole's timing is a window a few hundredths of the time wide at the speed the plain putter strikes at, and none at all from a
    // speed of 40 up, so a ball that is struck faster for the same distance (a harder putt, a ball that slows sooner) finds it shut
    for (const ids of [['cavity'], ['mallet'], ['clay']]) expect(wait(ids, 0), ids.join()).toBeLessThan(9.99);
  });
});

describe('the value tool’s no-item round', () => {
  it('is the pace player’s round, stroke for stroke, on a course of golf and one of minigolf, so what an item saves is measured against the pace gate’s own figure', () => {
    for (const [name, seeds] of [
      ['The Links', [1, 2]],
      ['The Waterworks', [1]],
    ] as const) {
      const holes = COURSES.find((c) => c.name === name)!.holes;
      for (const seed of seeds)
        expect(play('', name, seed).strokes, `${name}, seed ${seed}`).toBe(paceRun(seed, undefined, holes).strokes);
    }
  });
});
