/**
 * Out of bounds: a golf hole's edge is not a wall to a ball that lands past it but a line, drawn in `x` tiles, that a
 * ball on the ground past it is lost across, as one in water is: a stroke, told of, and the ball put back where it was
 * struck from. A ball in the air over it is not lost, only one that comes down on it, and a ball at rest is never
 * out of bounds, since one that lay there would be lost the moment it did.
 */
import { describe, expect, it } from 'vitest';
import { layoutOf, lieAt, tileAt } from '../src/arena';
import { COURSE } from '../src/course';
import { checkInvariants } from '../src/invariants';
import { LIE } from '../src/surfaces';
import { DT, field, golfGame } from './helpers';

const NORTH = Math.PI / 2;

/** A field with a band of out of bounds across it, from row `from` to row `to` counted from the top. */
function withBand(from: number, to: number, surface: 'f' | 'r' = 'f') {
  const base = field(surface);
  const map = base.map.map((row, r) => (r >= from && r <= to ? `#${'x'.repeat(row.length - 2)}#` : row));
  return { ...base, map };
}

/** Play until the ball is at rest or the hole is done, the rules checked every frame. */
function untilStill(game: ReturnType<typeof golfGame>['game'], seconds = 30) {
  for (let f = 0; f < seconds * 60; f++) {
    game.step(DT);
    expect(checkInvariants(game), `frame ${f}`).toEqual([]);
    if (game.phase !== 'play' || (f > 1 && game.ready)) return;
  }
  throw new Error('the ball never came to rest');
}

describe('an out of bounds tile', () => {
  it('is read from an `x` in a golf hole’s map: ground the ball rolls on, rough to play from, and out of bounds', () => {
    const l = layoutOf(['#####', '#gCg#', '#xxx#', '#gTg#', '#####']);
    expect(l.golf).toBe(true);
    const at = (col: number, row: number) => ({
      x: l.originX + (col + 0.5) * 3,
      y: l.originY + (l.rows - 1 - row + 0.5) * 3,
    });
    const p = at(2, 2);
    const t = tileAt(l, p.x, p.y);
    expect(l.oob[t]).toBe(1);
    expect(l.solid[t]).toBe(0);
    expect(lieAt(l, p.x, p.y)).toBe(LIE.rough);
    const q = at(1, 1);
    expect(l.oob[tileAt(l, q.x, q.y)]).toBe(0);
  });

  it('is on no hole of minigolf: none of them names one', () => {
    for (const hole of COURSE)
      expect(
        layoutOf(hole.map, hole.terrain).oob.every((v) => v === 0),
        hole.name,
      ).toBe(true);
  });
});

describe('a ball out of bounds', () => {
  it('lands past the line, is lost, costs a stroke and is put back where it was struck from', () => {
    // the band is 80 to 90 tiles up the field, past where a 7-iron at full power comes down, so a driver, which carries 250, lands in it
    const { game, told } = golfGame(withBand(38, 46));
    game.pick('driver');
    const from = { x: game.world.x[game.ball], y: game.world.y[game.ball] };
    game.shoot(NORTH, 1);
    untilStill(game);
    expect(told.filter((t) => t.startsWith('outOfBounds ')).length).toBe(1);
    expect(game.strokes, 'the stroke, and the stroke it cost').toBe(2);
    expect(game.world.x[game.ball]).toBeCloseTo(from.x, 1);
    expect(game.world.y[game.ball]).toBeCloseTo(from.y, 1);
    expect(game.ready).toBe(true);
  });

  it('is not lost in the air: a ball that flies over the line and comes down in bounds beyond it is not', () => {
    // a narrow band close to the tee, which a driver clears by a long way
    const { game, told } = golfGame(withBand(118, 120));
    game.pick('driver');
    game.shoot(NORTH, 1);
    untilStill(game);
    expect(told.filter((t) => t.startsWith('outOfBounds ')).length).toBe(0);
    expect(game.strokes).toBe(1);
    expect(game.world.y[game.ball]).toBeGreaterThan(game.layout.tee.y + 200);
  });

  it('is lost by rolling onto the line as well as by landing on it', () => {
    const { game, told } = golfGame(withBand(122, 124));
    game.pick('putter');
    const from = { x: game.world.x[game.ball], y: game.world.y[game.ball] };
    // a putt from the tee, at full power, rolls forty units or so on the tee and the fairway: the band is a few tiles up
    game.shoot(NORTH, 1);
    untilStill(game);
    expect(told.filter((t) => t.startsWith('outOfBounds ')).length).toBe(1);
    expect(game.strokes).toBe(2);
    expect(game.world.y[game.ball]).toBeCloseTo(from.y, 1);
  });

  it('tells where it went over, and tells it once, never as water', () => {
    const { game, told } = golfGame(withBand(38, 46));
    game.pick('driver');
    game.shoot(NORTH, 1);
    untilStill(game);
    const line = told
      .find((t) => t.startsWith('outOfBounds '))!
      .split(' ')
      .slice(1)
      .map(Number);
    expect(line[1], 'north of the tee, in the band').toBeGreaterThan(game.layout.tee.y + 100);
    expect(told.some((t) => t.startsWith('splash '))).toBe(false);
  });

  it('is picked up, and the hole is done, when the penalty takes the strokes to the limit', () => {
    const { game, told } = golfGame(withBand(38, 46));
    game.strokes = game.limit - 1;
    game.pick('driver');
    game.shoot(NORTH, 1);
    untilStill(game);
    expect(game.phase).toBe('done');
    expect(game.card).toEqual([game.limit]);
    expect(told.filter((t) => t.startsWith('outOfBounds ')).length).toBe(1);
  });

  it('is never put down out of bounds, and the rule says a ball at rest there is wrong', () => {
    const { game } = golfGame(withBand(38, 46));
    const l = game.layout;
    const inBand = { x: l.tee.x + 3, y: l.originY + (l.rows - 1 - 42 + 0.5) * 3 };
    expect(() => game.place(inBand.x, inBand.y)).toThrow(/out of bounds/);
    // a ball found asleep on the line, by whatever means, is reported
    game.world.x[game.ball] = inBand.x;
    game.world.y[game.ball] = inBand.y;
    game.world.asleep[game.ball] = 1;
    expect(checkInvariants(game).join('\n')).toMatch(/at rest out of bounds/);
  });

  it('is what a rehearsal calls lost, so a plan never counts on ground out of bounds', async () => {
    const { Rehearsal } = await import('../src/planner');
    const { game } = golfGame(withBand(38, 46));
    const r = new Rehearsal(game.rehearsal());
    const from = { x: game.world.x[game.ball], y: game.world.y[game.ball] };
    expect(r.shot(from, 'driver', NORTH, 1).lost).toBe(true);
    expect(r.shot(from, 'sand-wedge', NORTH, 0.3).lost).toBe(false);
  });
});
