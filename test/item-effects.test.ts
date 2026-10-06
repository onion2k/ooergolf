/**
 * What the play items do to a number: curve master, spin doctor, sticky ball, wind sock, slow roll, power glove, steady
 * grip, sand wedge, magnet cup and rubber ball. Each is held to its figure (`ITEM_FIGURES`), to the effect it has through
 * the real game on a small hole, to being an exact no-op where it is not held, and to the preview and the autopilot's
 * rehearsal agreeing with the shot, since they read the item through the same game. A game with no item must be the game
 * as it was before there were items, to the digit, which the other test files (the determinism hash, the pace figures,
 * the hashes of every hole) also hold.
 */
import { describe, expect, it } from 'vitest';
import { BALL, HARDEST_SHOT, KIND_RADIUS, ROLL, powerFor, strikeSpeed } from '../src/arena';
import { Autopilot } from '../src/autopilot';
import { BAG, PUTTER, bagClub, carryOf, gloved } from '../src/bag';
import { CUP, type HoleDef } from '../src/course';
import { DISPERSION, carryFrom, lossOf, maxScatter, strike } from '../src/flight';
import { CLEAR_OF_CUP, Game, type GameEvents } from '../src/game';
import { checkInvariants, previewProblems } from '../src/invariants';
import { ITEM_FIGURES, NO_EFFECTS, effectsOf, scaled, type Effects } from '../src/items';
import { heightAt, layoutOf } from '../src/arena';
import { makeWorld } from '../src/physics';
import { Previewer } from '../src/preview';
import { Progress, memoryStore } from '../src/progress';
import { seeded } from '../src/random';
import { reachOf } from '../src/aimview';
import { PALETTE } from '../src/models/palette';
import { Scene } from '../src/scene';
import { GREENS, LIE, SURFACES, surfaceFor } from '../src/surfaces';
import { airTime, curveRate, spunKeep, windPush, windReach } from '../src/shaping';
import { DT, FLAT, GREEN, field, levelHole, onGreen } from './helpers';

const NORTH = Math.PI / 2;
const ROWS = 200,
  COLS = 81;

/** A game on `hole` with `item` held (none for ''), chance as given, and every event kept with its arguments. */
function playing(hole: HoleDef, item = '', random: () => number = () => 0.5, extra: GameEvents = {}) {
  const calls: [string, unknown[]][] = [];
  const events: GameEvents = new Proxy(extra, {
    get:
      (target, name: string) =>
      (...args: unknown[]) => {
        calls.push([name, args]);
        (target as Record<string, ((...a: unknown[]) => void) | undefined>)[name]?.(...args);
      },
  });
  const game = new Game(new Progress(memoryStore(null)), events, {
    random,
    course: [hole],
    ...(item ? { effects: effectsOf(item) } : {}),
  });
  return { game, calls };
}

/** Played until the ball is ready again or the hole is over. */
function rest(game: Game, seconds = 40) {
  for (let f = 0; f < seconds * 60 && game.phase === 'play'; f++) {
    game.step(DT);
    if (f > 1 && game.ready) break;
  }
  return { x: game.world.x[game.ball], y: game.world.y[game.ball] };
}

interface Shot {
  from: { x: number; y: number };
  land: { x: number; y: number };
  rest: { x: number; y: number };
  /** The ball's speed along the ground the step it first landed, after the landing was made. */
  after: number;
  game: Game;
  calls: [string, unknown[]][];
}

/** A shot from where a ball lies on the tee (or `from`), with the club, power, shape and spin given, and what came of it. */
function shot(
  hole: HoleDef,
  item: string,
  club: string,
  power: number,
  o: { shape?: number; spin?: number; angle?: number; draws?: number[]; from?: { x: number; y: number } } = {},
): Shot {
  let queue: number[] | null = null;
  let after = NaN;
  let g: Game | null = null;
  const { game, calls } = playing(hole, item, () => (queue ? (queue.shift() ?? 0.5) : 0.5), {
    landed: (_x, _y, _into, first) => {
      if (first && g) after = Math.hypot(g.world.vx[g.ball], g.world.vy[g.ball]);
    },
  });
  g = game;
  if (o.from) game.place(o.from.x, o.from.y);
  for (let f = 0; f < 600 && !game.ready; f++) game.step(DT);
  const from = { x: game.world.x[game.ball], y: game.world.y[game.ball] };
  game.pick(club);
  game.setShape(o.shape ?? 0);
  game.setSpin(o.spin ?? 0);
  queue = o.draws ? o.draws.slice() : null;
  expect(game.shoot(o.angle ?? NORTH, power)).toBe(true);
  const stillQueued = queue;
  void stillQueued;
  const at = rest(game);
  const hit = calls.find(([n, a]) => n === 'landed' && a[3] === true);
  const land = hit ? { x: hit[1][0] as number, y: hit[1][1] as number } : { x: NaN, y: NaN };
  return { from, land, rest: at, after, game, calls };
}

const dist = (a: { x: number; y: number }, b: { x: number; y: number }) => Math.hypot(a.x - b.x, a.y - b.y);
/** How far along the north line, and how far across it, a point is from another. */
const along = (a: { x: number; y: number }, b: { x: number; y: number }) => a.y - b.y;
const across = (a: { x: number; y: number }, b: { x: number; y: number }) => a.x - b.x;

const FAIRWAY = field('f', ROWS, COLS);

describe('the figures', () => {
  it('are the ones the plan names, and said once', () => {
    expect(ITEM_FIGURES.curve.rate).toBe(2);
    expect(ITEM_FIGURES.spin.strength).toBe(2);
    expect(ITEM_FIGURES.sticky.keep).toBe(0.6);
    expect(ITEM_FIGURES.sock.push).toBe(0.5);
    expect(ITEM_FIGURES.slow.greens).toBe(1.15);
    expect(ITEM_FIGURES.glove.hardest).toBe(1.08);
    expect(ITEM_FIGURES.grip).toEqual({ scatter: 0.5, loss: 0.5 });
    expect(ITEM_FIGURES.wedge).toEqual({ power: 0.9, loft: 2, wild: 1.1 });
    expect(ITEM_FIGURES.magnet.radius).toBe(1.9);
    expect(ITEM_FIGURES.rubber.bounce).toBe(1.5);
    expect(CUP.radius).toBe(1.45);
  });

  it('are a multiplier of one where the item is not held, to the bit', () => {
    for (const id of ['curve', 'spin', 'sticky', 'sock', 'slow', 'glove', 'grip', 'rubber']) {
      expect(scaled(NO_EFFECTS, id, 7)).toBe(1);
      expect(scaled(effectsOf(id), id, 7)).toBe(7);
    }
    // another item held leaves this one's number alone
    expect(scaled(effectsOf('glove'), 'curve', 2)).toBe(1);
  });
});

describe('curve master', () => {
  const has = effectsOf('curve');
  it('turns the heading twice as fast: curveRate x2, and unchanged without it', () => {
    for (const loft of [0, 11, 34, 56]) {
      expect(curveRate(1, loft, has)).toBeCloseTo(2 * curveRate(1, loft), 12);
      expect(curveRate(-0.5, loft, has)).toBeCloseTo(2 * curveRate(-0.5, loft), 12);
      expect(curveRate(1, loft, NO_EFFECTS)).toBe(curveRate(1, loft));
    }
  });

  it('puts a fade about twice as far off the line through the real game, and a draw the other way', () => {
    const plain = shot(FAIRWAY, '', 'driver', 1, { shape: 1 });
    const curved = shot(FAIRWAY, 'curve', 'driver', 1, { shape: 1 });
    const a = across(plain.land, plain.from),
      b = across(curved.land, curved.from);
    expect(a).toBeGreaterThan(5);
    expect(b / a).toBeGreaterThan(1.85);
    expect(b / a).toBeLessThan(2.15);
    const draw = shot(FAIRWAY, 'curve', 'driver', 1, { shape: -1 });
    expect(across(draw.land, draw.from)).toBeLessThan(-5);
  });

  it('does nothing to a straight shot or a putt', () => {
    const plain = shot(FAIRWAY, '', '7-iron', 0.8);
    const held = shot(FAIRWAY, 'curve', '7-iron', 0.8);
    expect(held.land).toEqual(plain.land);
    expect(held.rest).toEqual(plain.rest);
  });
});

describe('spin doctor', () => {
  const has = effectsOf('spin');
  it('doubles what a spin does to the keep, to a ceiling no landing is sent on faster than', () => {
    // backspin: 1 + 1.4 s becomes 1 + 2.8 s
    expect(spunKeep(0.12, -1, has)).toBeCloseTo(0.12 * (1 - 2.8), 12);
    expect(spunKeep(0.12, -0.5, has)).toBeCloseTo(0.12 * (1 - 1.4), 12);
    // topspin: 1 + s becomes 1 + 2 s, until the ceiling
    expect(spunKeep(0.12, 1, has)).toBeCloseTo(0.36, 12);
    expect(spunKeep(0.48, 1, has)).toBe(ITEM_FIGURES.spin.keepMost);
    expect(spunKeep(0.58, 1, has)).toBe(ITEM_FIGURES.spin.keepMost);
    // and the table's own, plain, is never clamped, which is what keeps a game with no item as it was
    expect(spunKeep(0.58, 1)).toBeCloseTo(1.16, 12);
    expect(spunKeep(0.58, 1, NO_EFFECTS)).toBe(spunKeep(0.58, 1));
    expect(spunKeep(0.48, 0, has)).toBe(0.48);
  });

  const hole = field('f', ROWS, COLS);
  it('rolls a topspun ball on further, and checks a backspun one harder, through the real game', () => {
    const flat = shot(hole, '', '7-iron', 1);
    const top = shot(hole, '', '7-iron', 1, { spin: 1 });
    const topX2 = shot(hole, 'spin', '7-iron', 1, { spin: 1 });
    const back = shot(hole, '', '7-iron', 1, { spin: -1 });
    const backX2 = shot(hole, 'spin', '7-iron', 1, { spin: -1 });
    // the first landing is the same place: a spin tells after it
    expect(topX2.land).toEqual(flat.land);
    expect(backX2.land).toEqual(flat.land);
    expect(along(topX2.rest, topX2.land)).toBeGreaterThan(along(top.rest, top.land) + 1);
    expect(along(backX2.rest, backX2.land)).toBeLessThan(along(back.rest, back.land) - 1);
    // and without a spin chosen the item does nothing
    const none = shot(hole, 'spin', '7-iron', 1);
    expect(none.rest).toEqual(flat.rest);
  });

  it('is told as a landing, and every rule holds with a full backspin or topspin on every club', () => {
    for (const spin of [-1, 1])
      for (const club of BAG.filter((c) => c.loft > 0)) {
        const r = shot(hole, 'spin', club.id, 1, { spin });
        expect(checkInvariants(r.game), `${club.id} ${spin}`).toEqual([]);
      }
  });
});

describe('sticky ball', () => {
  it('keeps 0.6 of what the surface lets it at the first landing: its ground speed is 0.6 of the plain ball, level', () => {
    const plain = shot(FAIRWAY, '', '7-iron', 1);
    const sticky = shot(FAIRWAY, 'sticky', '7-iron', 1);
    expect(sticky.land).toEqual(plain.land);
    expect(sticky.after / plain.after).toBeCloseTo(ITEM_FIGURES.sticky.keep, 2);
    expect(dist(sticky.rest, sticky.from)).toBeLessThan(dist(plain.rest, plain.from));
  });

  it('is a first landing and a golf ball only: the hop after is the plain ball’s, and minigolf is untouched', () => {
    const { game } = onGreen();
    const held = playing(GREEN, 'sticky').game;
    game.shoot(NORTH, 0.5);
    held.shoot(NORTH, 0.5);
    for (let f = 0; f < 240; f++) {
      game.step(DT);
      held.step(DT);
    }
    expect(held.world.y[held.ball]).toBe(game.world.y[game.ball]);
  });
});

describe('wind sock', () => {
  const windy = levelHole({ name: 'Sock hole', par: 4, length: 300, wind: 20 });
  it('halves what a wind carries a ball, in the camera’s arithmetic too', () => {
    const club = bagClub('driver');
    const has = effectsOf('sock');
    expect(windReach(club, 1, 20, LIE.tee, has)).toBeCloseTo(0.5 * windReach(club, 1, 20), 9);
    expect(windReach(club, 1, 20, LIE.tee, NO_EFFECTS)).toBe(windReach(club, 1, 20));
    // so the reach the camera frames is the shorter, never the longer, by the half of a tailwind's
    const plain = reachOf(club, LIE.tee, 20);
    const sock = reachOf(club, LIE.tee, 20, has);
    expect(plain - sock).toBeCloseTo(0.5 * windReach(club, 1, 20), 9);
    expect(reachOf(club, LIE.tee, 20, NO_EFFECTS)).toBe(plain);
  });

  it('moves the ball half as far off where a calm day would put it, and the wind shown is the true wind', () => {
    const calm = shot({ ...windy, wind: 0 }, '', 'driver', 1);
    const wind = shot(windy, '', 'driver', 1);
    const sock = shot(windy, 'sock', 'driver', 1);
    const pushed = { x: wind.land.x - calm.land.x, y: wind.land.y - calm.land.y };
    const halved = { x: sock.land.x - calm.land.x, y: sock.land.y - calm.land.y };
    expect(Math.hypot(pushed.x, pushed.y)).toBeGreaterThan(10);
    expect(Math.hypot(halved.x, halved.y) / Math.hypot(pushed.x, pushed.y)).toBeGreaterThan(0.47);
    expect(Math.hypot(halved.x, halved.y) / Math.hypot(pushed.x, pushed.y)).toBeLessThan(0.53);
    expect(sock.game.wind.speed).toBe(20);
    expect(sock.game.wind.x).toBe(wind.game.wind.x);
    expect(windPush(20)).toBe(20 * 1.4);
  });
});

describe('slow roll', () => {
  const quick = FLAT.road; // greens 12.5
  it('is one getter: the hole’s greens 15% slower, def.greens never changed', () => {
    const { game } = playing(quick, 'slow');
    expect(game.greens).toBeCloseTo(12.5 * 1.15, 12);
    expect(game.def.greens).toBe(12.5);
    expect(playing(quick).game.greens).toBe(12.5);
    // a golf hole that says none has the normal speed to slow, and none without the item
    expect(playing(FLAT.pitch).game.greens).toBeUndefined();
    expect(playing(FLAT.pitch, 'slow').game.greens).toBeCloseTo(GREENS.normal * 1.15, 12);
    // minigolf rolls on ROLL, which it is not given
    expect(onGreen().game.greens).toBeUndefined();
  });

  it('feeds the roll the game reports on the green and on the first cut, and no other ground', () => {
    const plain = playing(quick).game;
    const slow = playing(quick, 'slow').game;
    const { cup } = slow.layout;
    expect(slow.rollAt(cup.x, cup.y + 1)).toBeCloseTo(plain.rollAt(cup.x, cup.y + 1) * 1.15, 9);
    const { tee } = slow.layout;
    expect(slow.rollAt(tee.x, tee.y)).toBe(plain.rollAt(tee.x, tee.y));
  });

  it('rolls a putt about 15% less far through the world the game made', () => {
    const run = (item: string) => {
      const { game } = playing(quick, item);
      const { cup } = game.layout;
      game.place(cup.x, cup.y - 30);
      game.pick('putter');
      game.shoot(NORTH, 0.6);
      const y0 = game.world.y[game.ball];
      rest(game);
      return Math.abs(game.world.y[game.ball] - y0);
    };
    const plain = run(''),
      slow = run('slow');
    expect(slow / plain).toBeGreaterThan(1 / 1.15 - 0.03);
    expect(slow / plain).toBeLessThan(1 / 1.15 + 0.03);
  });
});

describe('power glove', () => {
  const has = effectsOf('glove');
  it('makes every club’s hardest 1.08 times, the putter’s too, and leaves the bag itself alone', () => {
    const { game } = playing(FAIRWAY, 'glove');
    for (const club of BAG) {
      game.pick(club.id);
      expect(game.inHand.id).toBe(club.id);
      expect(game.inHand.hardest).toBeCloseTo(club.hardest * 1.08, 9);
      expect(game.hardest).toBe(game.inHand.hardest);
      expect(game.club(club)).toBe(gloved(club));
    }
    expect(BAG.find((c) => c.id === 'driver')!.hardest).toBe(216);
    expect(gloved(PUTTER).hardest).toBeCloseTo(HARDEST_SHOT * 1.08, 9);
    expect(has.has('glove')).toBe(true);
  });

  it('is the bag’s own club, the very object, where it is not held', () => {
    const { game } = playing(FAIRWAY);
    for (const club of BAG) {
      game.pick(club.id);
      expect(game.inHand).toBe(club);
      expect(game.hardest).toBe(club.hardest);
    }
  });

  it('is 43.2 on minigolf, and a full putt leaves the putter at that speed', () => {
    const { game } = playing(GREEN, 'glove');
    expect(game.hardest).toBeCloseTo(43.2, 9);
    const { world, ball } = game;
    game.shoot(NORTH, 1);
    // the physics keeps its speeds in single precision
    expect(Math.hypot(world.vx[ball], world.vy[ball])).toBeCloseTo(strikeSpeed(1, 43.2), 4);
    // the course's ceiling follows it, so the first step is not clamped back to forty
    game.step(DT);
    expect(Math.hypot(world.vx[ball], world.vy[ball])).toBeGreaterThan(41);
    expect(checkInvariants(game)).toEqual([]);
  });

  it('carries a golf shot about 17% further, and the preview’s reach and its carry check hold the gloved club', () => {
    const plain = shot(FAIRWAY, '', 'driver', 1);
    const gloved8 = shot(FAIRWAY, 'glove', 'driver', 1);
    const ratio = dist(gloved8.land, gloved8.from) / dist(plain.land, plain.from);
    expect(ratio).toBeGreaterThan(1.15);
    expect(ratio).toBeLessThan(1.19);
    expect(carryOf(gloved(bagClub('driver')), 1) / carryOf(bagClub('driver'), 1)).toBeCloseTo(1.08 ** 2, 9);
    const { game } = playing(FAIRWAY, 'glove');
    const club = bagClub('driver');
    const at = { x: game.world.x[game.ball], y: game.world.y[game.ball] };
    const p = new Previewer(game).run(at, game.inHand, NORTH, 1);
    expect(previewProblems(game, at, club, p)).toEqual([]);
    expect(previewProblems(game, at, game.inHand, p)).toEqual([]);
  });

  it('puts the club in hand in the bag as far as the invariants are concerned', () => {
    const { game } = playing(FAIRWAY, 'glove');
    expect(checkInvariants(game)).toEqual([]);
    game.inHand = { ...BAG[2] };
    expect(game.inHand.hardest).toBeCloseTo(BAG[2].hardest * 1.08, 9);
  });
});

describe('steady grip', () => {
  const has = effectsOf('grip');
  const driver = bagClub('driver');
  it('halves the scatter and the speed a mishit loses', () => {
    expect(maxScatter(driver, LIE.fairway, 1, has)).toBeCloseTo(0.5 * maxScatter(driver, LIE.fairway, 1), 12);
    expect(maxScatter(driver, LIE.fairway, 1, NO_EFFECTS)).toBe(maxScatter(driver, LIE.fairway, 1));
    expect(lossOf(has)).toBeCloseTo(DISPERSION.loss / 2, 12);
    expect(lossOf()).toBe(DISPERSION.loss);
    expect(lossOf(NO_EFFECTS)).toBe(DISPERSION.loss);
  });

  it('strikes with half the miss and half the loss for the same draws, and the same number of them', () => {
    const draws = (random: () => number, effects: Effects) => strike(driver, 1, NORTH, LIE.fairway, random, effects);
    // a worst case: aimed off by the whole scatter, the most speed lost
    const worst = () => 1;
    const plain = draws(worst, NO_EFFECTS);
    const held = draws(worst, has);
    const off = (l: { vx: number; vy: number }) => Math.atan2(l.vy, l.vx) - NORTH;
    expect(off(held) / off(plain)).toBeCloseTo(0.5, 9);
    const speed = (l: { vx: number; vy: number; vz: number }) => Math.hypot(l.vx, l.vy, l.vz);
    const clean = strikeSpeed(1, driver.hardest) * SURFACES[LIE.fairway].power;
    expect((clean - speed(held)) / (clean - speed(plain))).toBeCloseTo(0.5, 9);
    let n = 0,
      m = 0;
    strike(driver, 1, NORTH, LIE.fairway, () => (n++, 0.3), NO_EFFECTS);
    strike(driver, 1, NORTH, LIE.fairway, () => (m++, 0.3), has);
    expect(m).toBe(n);
    expect(n).toBe(4);
  });

  it('draws what a putt never does: nothing, with or without it', () => {
    let n = 0;
    strike(PUTTER, 1, NORTH, LIE.green, () => (n++, 0.5), has);
    expect(n).toBe(0);
  });

  it('is the footprint the preview shows: halved across and short, from the same game', () => {
    const preview = (item: string) => {
      const { game } = playing(FAIRWAY, item);
      const at = { x: game.world.x[game.ball], y: game.world.y[game.ball] };
      return new Previewer(game).run(at, driver, NORTH, 0.9);
    };
    const plain = preview(''),
      held = preview('grip');
    expect(held.carry).toBe(plain.carry);
    // the scatter is halved, and the width is the sine of it
    expect(held.footprint.across / plain.footprint.across).toBeCloseTo(0.5, 2);
    const shortest = (p: typeof plain, loss: number) => p.carry * (1 - loss * 0.9) ** 2;
    expect(2 * held.footprint.along).toBeCloseTo(held.carry - shortest(held, DISPERSION.loss / 2), 6);
    expect(2 * plain.footprint.along).toBeCloseTo(plain.carry - shortest(plain, DISPERSION.loss), 6);
  });

  it('lands the worst swing inside the footprint the preview showed, with the grip held', () => {
    const { game } = playing(FAIRWAY, 'grip');
    const at = { x: game.world.x[game.ball], y: game.world.y[game.ball] };
    const p = new Previewer(game).run(at, driver, NORTH, 0.9);
    const f = { across: p.footprint.across, along: p.footprint.along };
    for (const draws of [
      [1, 1, 0.5, 0.5],
      [0, 0, 0.5, 0.5],
      [0.5, 0.5, 1, 1],
    ]) {
      const r = shot(FAIRWAY, 'grip', 'driver', 0.9, { draws });
      const dx = Math.abs(r.land.x - r.from.x),
        short = p.y - r.land.y;
      expect(dx, 'across').toBeLessThan(f.across + 0.6);
      expect(short, 'short').toBeLessThan(2 * f.along + 1.7);
      expect(short, 'never past the ring').toBeGreaterThan(-0.5);
    }
  });
});

describe('sand wedge', () => {
  const has = effectsOf('wedge');
  it('reads a bunker as power 0.9, loft +2, wild 1.1, and every other lie as the table has it', () => {
    const s = surfaceFor(LIE.sand, has);
    expect(s.power).toBe(0.9);
    expect(s.loft).toBe(2);
    expect(s.wild).toBe(1.1);
    // the landing and the roll are the sand's own
    expect(s.keep).toBe(SURFACES[LIE.sand].keep);
    expect(s.bounce).toBe(SURFACES[LIE.sand].bounce);
    expect(s.roll).toBe(SURFACES[LIE.sand].roll);
    expect(SURFACES[LIE.sand].power).toBe(0.66);
    for (const lie of [LIE.tee, LIE.fairway, LIE.rough, LIE.green, LIE.cut, LIE.none] as const)
      expect(surfaceFor(lie, has)).toBe(SURFACES[lie]);
    expect(surfaceFor(LIE.sand, NO_EFFECTS)).toBe(SURFACES[LIE.sand]);
  });

  it('reads alike in the strike, the carry, the time in the air and the scatter', () => {
    const club = bagClub('sand-wedge');
    const speed = strikeSpeed(1, club.hardest) * 0.9;
    expect(carryFrom(club, 1, LIE.sand, has)).toBeCloseTo(
      (speed * speed * Math.sin((2 * (club.loft + 2) * Math.PI) / 180)) / 70,
      6,
    );
    expect(carryFrom(club, 1, LIE.sand, NO_EFFECTS)).toBe(carryFrom(club, 1, LIE.sand));
    expect(airTime(club, 1, LIE.sand, has)).toBeGreaterThan(0);
    expect(airTime(club, 1, LIE.sand, has)).not.toBe(airTime(club, 1, LIE.sand));
    expect(maxScatter(club, LIE.sand, 1, has) / maxScatter(club, LIE.fairway, 1)).toBeCloseTo(1.1, 9);
    expect(maxScatter(club, LIE.sand, 1) / maxScatter(club, LIE.fairway, 1)).toBeCloseTo(1.25, 9);
    // the same draws, struck: the launch is the wedge's
    const l = strike(club, 1, NORTH, LIE.sand, () => 0.5, has);
    expect(Math.hypot(l.vx, l.vy, l.vz)).toBeCloseTo(speed, 9);
    expect(Math.atan2(l.vz, Math.hypot(l.vx, l.vy))).toBeCloseTo(((club.loft + 2) * Math.PI) / 180, 9);
  });

  const bunker = field('s', ROWS, COLS);
  const from = (() => {
    const { game } = playing(bunker);
    return { x: game.world.x[game.ball], y: game.world.y[game.ball] + 20 };
  })();

  it('takes less off a shot from a bunker through the real game, and nothing off one from the fairway', () => {
    const plain = shot(bunker, '', '9-iron', 1, { from });
    const held = shot(bunker, 'wedge', '9-iron', 1, { from });
    expect(dist(held.land, held.from)).toBeGreaterThan(dist(plain.land, plain.from) * 1.2);
    const f = shot(FAIRWAY, '', '9-iron', 1),
      g = shot(FAIRWAY, 'wedge', '9-iron', 1);
    expect(g.land).toEqual(f.land);
    expect(g.rest).toEqual(f.rest);
  });

  it('is what the preview and the aim’s carry show: the first landing is the shot’s, to the yard', () => {
    for (const id of ['9-iron', 'sand-wedge', '5-iron']) {
      const real = shot(bunker, 'wedge', id, 0.8, { from });
      const { game } = playing(bunker, 'wedge');
      game.place(from.x, from.y);
      for (let f = 0; f < 600 && !game.ready; f++) game.step(DT);
      const at = { x: game.world.x[game.ball], y: game.world.y[game.ball] };
      const p = new Previewer(game).run(at, game.inHand, NORTH, 0.8);
      void p;
      game.pick(id);
      const q = new Previewer(game).run(at, game.inHand, NORTH, 0.8);
      expect(q.lie, id).toBe(LIE.sand);
      expect(dist(q, real.land), `${id} preview`).toBeLessThan(0.5);
      // the aim’s marker is the arithmetic carry, four in a hundred short of what the game does
      const carry = carryFrom(bagClub(id), 0.8, LIE.sand, has);
      expect(Math.abs(dist(real.land, real.from) / carry - 1), `${id} marker`).toBeLessThan(0.1);
    }
  });
});

describe('magnet cup', () => {
  const OPEN: HoleDef = {
    name: 'Open green',
    par: 2,
    map: [
      '#################',
      ...Array.from({ length: 7 }, () => '#...............#'),
      '#.......C.......#',
      ...Array.from({ length: 7 }, () => '#...............#'),
      '#.......T.......#',
      '#################',
    ],
  };
  const make = (item: string) => playing(OPEN, item);

  it('is a cup 1.9 across, in the game, its world, and where a ball may be put down', () => {
    const plain = make('').game,
      held = make('magnet').game;
    expect(plain.cup).toBe(CUP);
    expect(held.cup).toEqual({ ...CUP, radius: 1.9 });
    expect(held.world.holes[0].radius).toBe(1.9);
    expect(plain.world.holes[0].radius).toBe(1.45);
    const { cup } = held.layout;
    expect(() => plain.place(cup.x, cup.y - CLEAR_OF_CUP - 0.01)).not.toThrow();
    const clear = 1.9 + KIND_RADIUS[BALL] + 0.5;
    expect(() => held.place(cup.x, cup.y - clear + 0.05)).toThrow(/too near the cup/);
    expect(() => held.place(cup.x, cup.y - clear - 0.05)).not.toThrow();
  });

  /** A ball struck north from just clear of the cup, `aside` off its middle, arriving at the cup's near edge at `speed`. */
  function putt(item: string, speed: number, aside: number) {
    const { game, calls } = make(item);
    const { cup } = game.layout;
    const y0 = cup.y - 6;
    game.place(cup.x + aside, y0);
    const power = powerFor(Math.sqrt(speed * speed + 2 * ROLL.roll * 6), HARDEST_SHOT);
    game.shoot(NORTH, power);
    for (let f = 0; f < 400 && game.phase === 'play'; f++) {
      game.step(DT);
      if (game.ready && f > 10) break;
    }
    return { holed: game.phase !== 'play', game, calls };
  }

  it('takes a ball that passes outside the plain cup’s mouth but inside the magnet’s', () => {
    expect(putt('', 3, 1.7).holed).toBe(false);
    expect(putt('magnet', 3, 1.7).holed).toBe(true);
    expect(putt('magnet', 3, 1.2).holed).toBe(true);
    expect(putt('magnet', 3, 2.2).holed).toBe(false);
  });

  it('still lips out: a ball too fast runs on over it, the middle and a little off, as the plain cup’s does', () => {
    for (const aside of [0, 1]) expect(putt('magnet', 38, aside).holed, `38 a second, ${aside} aside`).toBe(false);
    for (const v of [2, 5, 9]) expect(putt('magnet', v, 0).holed, `${v} a second`).toBe(true);
  });

  it('holes a ball once and once only, paid once, however long the game goes on', () => {
    const { game, calls } = putt('magnet', 3, 1.2);
    for (let f = 0; f < 600; f++) game.step(DT);
    expect(calls.filter(([n]) => n === 'holed')).toHaveLength(1);
    expect(game.card).toHaveLength(1);
    expect(checkInvariants(game)).toEqual([]);
  });

  it('counts a ball sunk in the mouth as on the lip out to the magnet’s radius, and to the plain cup’s without it', () => {
    // the lip rule reads the cup this game was made with, and not the course's own: a ball hanging in the magnet's mouth, past 1.45, is woken
    const sunk = (item: string, off: number) => {
      const { game } = make(item);
      const { cup } = game.layout;
      const { world, ball, layout } = game;
      world.x[ball] = cup.x + off;
      world.y[ball] = cup.y;
      world.z[ball] = heightAt(layout, cup.x + off, cup.y) - 0.5;
      return (game as unknown as { onTheLip(): boolean }).onTheLip();
    };
    expect(sunk('magnet', 1.7)).toBe(true);
    expect(sunk('magnet', 1.95)).toBe(false);
    expect(sunk('', 1.7)).toBe(false);
    expect(sunk('', 1.3)).toBe(true);
  });

  it('is on the page too: the scene draws the cup at the radius the game says, its lining on the mouth', () => {
    for (const [item, radius] of [
      ['', CUP.radius],
      ['magnet', 1.9],
    ] as const) {
      const { game } = make(item);
      expect(game.cup.radius).toBe(radius);
      const groups = new Scene().static(game.layout, game.def.name, game.obstacles, game.cup.radius);
      // the lining is the one group in the cup's dark colour, and its top, where the grass meets it, is on the radius the game says
      const [liner, ...others] = groups.filter((g) => PALETTE.hole.every((c, k) => c === g.albedo![k]));
      expect(others, 'one lining').toEqual([]);
      const tops = Array.from({ length: liner.mesh.positions.length / 3 }, (_, i) =>
        liner.mesh.positions.slice(i * 3, i * 3 + 3),
      ).filter((p) => Math.abs(p[2]) < 1e-6);
      expect(tops.length).toBeGreaterThan(0);
      for (const [x, y] of tops) expect(Math.hypot(x, y)).toBeCloseTo(radius, 5);
    }
  });
});

describe('rubber ball', () => {
  it('returns the rail, a post and a kicker 1.5 times as hard, and a tree and a moving barrier as they were', () => {
    const map = ['##########', '#...o....#', '#....k...#', '#........#', '#...T..C.#', '##########'];
    const layout = layoutOf(map);
    const plain = makeWorld(layout, CUP, () => 0.5);
    const rubber = makeWorld(layout, CUP, () => 0.5, new Set(), undefined, 1.5);
    expect(rubber.bumpers).toHaveLength(plain.bumpers.length);
    expect(plain.bumpers.length).toBeGreaterThanOrEqual(2);
    plain.bumpers.forEach((b, i) => {
      expect(rubber.bumpers[i].restitution).toBeCloseTo(b.restitution * 1.5, 12);
      expect(rubber.bumpers[i].radius).toBe(b.radius);
    });
    // a world with the scale left out is the world it was
    const same = makeWorld(layout, CUP, () => 0.5, new Set(), undefined, 1);
    same.bumpers.forEach((b, i) => expect(b.restitution).toBe(plain.bumpers[i].restitution));
    // a tree's trunk is a post to the physics and is not scaled: the game's own list is checked in the next test
  });

  it('leaves a tree’s trunk as it was, on a golf hole', () => {
    const hole = field('r', 40, 31);
    const rows = hole.map.slice();
    const mid = rows[10].split('');
    mid[10] = '^';
    rows[10] = mid.join('');
    const withTree: HoleDef = { ...hole, name: 'Tree hole', map: rows };
    const plain = playing(withTree).game,
      rub = playing(withTree, 'rubber').game;
    expect(plain.layout.trees).toHaveLength(1);
    expect(rub.world.bumpers).toHaveLength(plain.world.bumpers.length);
    expect(rub.world.bumpers[0].restitution).toBe(plain.world.bumpers[0].restitution);
  });

  /** The speed a ball has the step after it meets the north rail head on, struck from near it. */
  function rail(item: string) {
    const { game } = playing(GREEN, item);
    // from ten yards short of the cup's row, up the tee's own line (the cup is in the north-west corner), at the north wall
    game.place(game.layout.tee.x, game.layout.cup.y - 10);
    game.shoot(NORTH, 1);
    const { world, ball } = game;
    let before = 0;
    for (let f = 0; f < 120; f++) {
      const vy = world.vy[ball];
      game.step(DT);
      if (world.vy[ball] < 0 && vy > 0) return { before, after: Math.abs(world.vy[ball]) };
      before = vy;
    }
    throw new Error('never met the rail');
  }

  it('sends the ball back off the rail 1.5 times as hard through the real game', () => {
    const plain = rail(''),
      held = rail('rubber');
    expect(plain.before).toBeGreaterThan(30);
    expect(plain.after / plain.before).toBeGreaterThan(0.6);
    expect(plain.after / plain.before).toBeLessThan(0.7);
    expect(held.after / held.before / (plain.after / plain.before)).toBeGreaterThan(1.4);
    expect(held.after / held.before / (plain.after / plain.before)).toBeLessThan(1.6);
  });

  it('keeps every speed rule: a ball thrown by a kicker is held to the ceiling, at the hardest shot', () => {
    const hole: HoleDef = {
      name: 'Kicker row',
      par: 2,
      map: [
        '#################',
        '#...............#',
        '#.......C.......#',
        '#...............#',
        '#.......k.......#',
        '#...............#',
        '#.......T.......#',
        '#################',
      ],
    };
    const { game } = playing(hole, 'rubber');
    game.shoot(NORTH, 1);
    for (let f = 0; f < 600 && game.phase === 'play'; f++) {
      game.step(DT);
      expect(checkInvariants(game), `frame ${f}`).toEqual([]);
    }
  });
});

describe('the preview and the autopilot’s rehearsal agree with the shot, with each item held', () => {
  const windyBunker = levelHole({ name: 'Agree hole', par: 4, length: 330, bunker: true, wind: 14, greens: 12.5 });
  for (const id of ['curve', 'spin', 'sticky', 'sock', 'slow', 'glove', 'grip', 'wedge', 'magnet', 'rubber']) {
    it(`${id}: the ring is where the game puts the ball, and a rehearsed trial is the shot struck true`, () => {
      const real = shot(windyBunker, id, '7-iron', 0.9, { shape: 1, spin: id === 'spin' ? 1 : 0 });
      const { game } = playing(windyBunker, id);
      const at = { x: game.world.x[game.ball], y: game.world.y[game.ball] };
      game.pick('7-iron');
      const p = new Previewer(game).run(at, game.inHand, NORTH, 0.9, 1, id === 'spin' ? 1 : 0);
      expect(p.end).toBe('landed');
      expect(dist(p, real.land), 'preview against shot').toBeLessThan(0.5);
      expect(previewProblems(game, at, game.inHand, p)).toEqual([]);
      // and the rehearsal the autopilot tries its shots in lands it at the same place, to the digit
      const rehearsal = game.rehearsal({});
      rehearsal.trial(at.x, at.y);
      rehearsal.pick('7-iron');
      rehearsal.setShape(1);
      rehearsal.setSpin(id === 'spin' ? 1 : 0);
      rehearsal.shoot(NORTH, 0.9);
      const rests = rest(rehearsal);
      expect(dist(rests, real.rest), 'rehearsal against shot').toBeLessThan(1e-6);
    });

    it(`${id}: every rule holds for a hole played with it, golf and minigolf`, () => {
      for (const hole of [FLAT.pitch, windyBunker, GREEN]) {
        const { game } = playing(hole, id, seeded(7));
        const pilot = new Autopilot(game, { replay: true });
        for (let f = 0; f < 60 * 25; f++) {
          pilot.step(DT);
          const bad = checkInvariants(game);
          if (bad.length) throw new Error(`${id} on ${hole.name}, frame ${f}: ${bad.join('; ')}`);
        }
      }
    });
  }
});

describe('a game with no item is a game that never heard of items', () => {
  /** The ball's place every frame of a round of the autopilot's, from the same seed. */
  function trace(hole: HoleDef, effects: Effects | undefined, item = '') {
    const game = new Game(
      new Progress(memoryStore(JSON.stringify(item ? { owned: [item], item } : {}))),
      {},
      {
        random: seeded(11),
        course: [hole],
        ...(effects ? { effects } : {}),
      },
    );
    const pilot = new Autopilot(game, { replay: false });
    const out: number[] = [];
    for (let f = 0; f < 60 * 30; f++) {
      pilot.step(DT);
      if (game.world.alive[game.ball])
        out.push(game.world.x[game.ball], game.world.y[game.ball], game.world.z[game.ball]);
    }
    return out;
  }

  for (const hole of [FLAT.windy, FLAT.long, GREEN]) {
    it(`on ${hole.name}: no item, an item with no effect on play, and every item held but false give one trace`, () => {
      const base = trace(hole, undefined);
      expect(base.length).toBeGreaterThan(600);
      expect(trace(hole, NO_EFFECTS)).toEqual(base);
      // a cosmetic is held and changes nothing of play
      expect(trace(hole, undefined, 'glow')).toEqual(base);
      expect(trace(hole, undefined, 'rainbow')).toEqual(base);
      // an effects object that says no to everything it is asked, however it is asked
      expect(trace(hole, { has: () => false })).toEqual(base);
    });
  }

  it('draws the same chance with an item held as without: no item changes the number of draws', () => {
    for (const id of ['curve', 'spin', 'sticky', 'sock', 'slow', 'glove', 'grip', 'wedge', 'magnet', 'rubber']) {
      const draws = (item: string) => {
        let n = 0;
        const { game } = playing(FLAT.long, item, () => (n++, 0.5));
        game.pick('driver');
        game.setShape(1);
        game.shoot(NORTH, 1);
        return n;
      };
      expect(draws(id), id).toBe(draws(''));
    }
  });

  it('is unchanged by an item put on mid-hole in the world: it takes hold at the next hole', () => {
    const { game } = playing(GREEN);
    expect(game.cup).toBe(CUP);
    game.progress.save.owned.push('magnet');
    expect(game.equip('magnet')).toBe(true);
    expect(game.cup).toBe(CUP);
    game.begin(0);
    expect(game.cup.radius).toBe(1.9);
    expect(game.equip('')).toBe(true);
    game.begin(0);
    expect(game.cup).toBe(CUP);
  });
});
