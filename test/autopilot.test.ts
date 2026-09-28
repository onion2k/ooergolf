/** The autopilot as a measuring instrument: it knows how far a shot rolls, sees round corners, holes out, and gets stuck nowhere. */
import { describe, expect, it } from 'vitest';
import { HARDEST_SHOT, TILE, layoutOf, onFloor, powerFor, rollsFor, strikeSpeed } from '../src/arena';
import { Autopilot, speedFor, timeTo } from '../src/autopilot';
import { COURSE, type HoleDef } from '../src/course';
import { checkInvariants } from '../src/invariants';
import { seeded } from '../src/random';
import { DT, newGame, onGreen } from './helpers';

describe('the autopilot', () => {
  it('knows how far a shot rolls: struck to stop at a distance, it stops near it', () => {
    for (const d of [5, 10, 20, 30, 40]) {
      const { game } = onGreen();
      const { tee } = game.layout;
      game.shoot(Math.PI / 2, powerFor(speedFor(d, 0), HARDEST_SHOT));
      for (let f = 0; f < 600 && !game.ready; f++) game.step(DT);
      const went = game.world.y[game.ball] - tee.y;
      expect(Math.abs(went - d), `asked for ${d}, went ${went.toFixed(1)}`).toBeLessThan(Math.max(1.5, d * 0.12));
    }
  });

  it('knows when a shot gets somewhere, so it can time what moves: each distance at the moment it says', () => {
    const { game } = onGreen();
    const { tee } = game.layout;
    const speed = 30;
    game.shoot(Math.PI / 2, powerFor(speed, HARDEST_SHOT));
    for (const d of [5, 15, 25]) {
      while (game.world.y[game.ball] - tee.y < d) game.step(1 / 120);
      expect(Math.abs(game.t - timeTo(d, speed)), `${d} along`).toBeLessThan(0.03);
    }
    expect(timeTo(100, speed), 'never, past where it stops').toBe(Infinity);
  });

  it('sees round a corner: every shot it plans has clear grass the whole way', () => {
    const { game } = newGame();
    game.begin(1);
    const pilot = new Autopilot(game);
    const shot = pilot.plan()!;
    const { layout } = game;
    const x0 = game.world.x[game.ball],
      y0 = game.world.y[game.ball];
    const cupAngle = Math.atan2(layout.cup.y - y0, layout.cup.x - x0);
    expect(Math.abs(shot.angle - cupAngle), 'not straight at a cup behind the rail').toBeGreaterThan(0.1);
    // the first twelve units along the shot are clear of the rail for the ball's width
    for (let s = 0; s < 12; s += 0.5)
      expect(onFloor(layout, x0 + Math.cos(shot.angle) * s, y0 + Math.sin(shot.angle) * s)).toBe(true);
  });

  it('holes out every hole of the course without a slip, within par, breaking no rule', () => {
    const { game } = newGame(1);
    const pilot = new Autopilot(game);
    const card: number[] = [];
    for (let f = 0; f < 60 * 60 * 3 && game.phase !== 'over'; f++) {
      pilot.step(DT);
      if (f % 30 === 0) expect(checkInvariants(game)).toEqual([]);
      card.splice(0, card.length, ...game.card);
    }
    expect(game.phase).toBe('over');
    card.forEach((score, h) => expect(score, COURSE[h].name).toBeLessThanOrEqual(COURSE[h].par));
  });

  it('plays as a player does with a skill: slips of aim and power from its own chance, the same from the same seed', () => {
    const round = (seed: number) => {
      const { game } = newGame(seed);
      const pilot = new Autopilot(game, { skill: { aim: 0.05, power: 0.1 }, random: seeded(seed * 31 + 7) });
      for (let f = 0; f < 60 * 60 * 5 && game.phase !== 'over'; f++) pilot.step(DT);
      return [...game.card];
    };
    expect(round(3)).toEqual(round(3));
    const cards = [1, 2, 3, 4, 5, 6].map(round);
    for (const card of cards) expect(card.length, 'every round finished').toBe(COURSE.length);
    expect(new Set(cards.map((c) => c.join())).size, 'the slips make rounds differ').toBeGreaterThan(1);
  });

  it('plans no shot when none can be taken', () => {
    const { game } = newGame();
    game.shoot(0, 0.5);
    expect(new Autopilot(game).plan()).toBe(null);
  });

  it('goes round water, never through it, and up a ramp to grass it can reach no other way', () => {
    const holes: HoleDef[] = [
      {
        name: 'round the pond',
        par: 3,
        map: ['#########', '#...C...#', '#.......#', '#~~~~~..#', '#~~~~~..#', '#.......#', '#...T...#', '#########'],
      },
      {
        name: 'up and over',
        par: 3,
        map: [
          '#######',
          '#..C..#',
          '#.....#',
          '#~444~#',
          '#~444~#',
          '#~333~#',
          '#~222~#',
          '#~111~#',
          '#.....#',
          '#..T..#',
          '#######',
        ],
      },
    ];
    for (const hole of holes) {
      const { game, told } = newGame(1, null, [hole]);
      const pilot = new Autopilot(game);
      for (let f = 0; f < 60 * 60 && game.phase === 'play'; f++) {
        pilot.step(DT);
        if (f % 20 === 0) expect(checkInvariants(game)).toEqual([]);
      }
      expect(game.phase, hole.name).not.toBe('play');
      expect(
        told.filter((t) => t.startsWith('splash')),
        `${hole.name}: into the water`,
      ).toEqual([]);
      expect(game.card[0], hole.name).toBeLessThanOrEqual(hole.par);
    }
  });

  it('times its shots past what moves: waits for the door of the windmill and the barriers to be clear', () => {
    // walking up to the tee at every moment of the windmill's turn and the barriers' slide: untimed, some of them meet
    // a blade or a barrier on the way
    for (const name of ['Windmill', 'Barriers']) {
      const hole = COURSE.find((h) => h.name === name)!;
      for (let wait = 0; wait < 8; wait += 0.5) {
        const { game } = newGame(1, null, [hole]);
        for (let f = 0; f < wait * 60; f++) game.step(DT);
        const pilot = new Autopilot(game);
        for (let f = 0; f < 60 * 90 && game.phase === 'play'; f++) pilot.step(DT);
        expect(game.phase, `${name}, from ${wait} s`).not.toBe('play');
        expect(game.card[0], `${name}, from ${wait} s`).toBeLessThanOrEqual(hole.par);
      }
    }
  });

  it('never plans a shot through water, nor up a rise too high to roll up, from anywhere it could lie', () => {
    const holes: HoleDef[] = [
      {
        name: 'water across',
        par: 3,
        map: ['#########', '#...C...#', '#.......#', '#~~~~~~.#', '#.......#', '#...T...#', '#########'],
      },
      {
        name: 'a wall across',
        par: 3,
        map: ['#########', '#...C...#', '#.......#', '#333333.#', '#.......#', '#...T...#', '#########'],
      },
    ];
    for (const hole of holes) {
      const { game } = newGame(1, null, [hole]);
      const l = game.layout;
      for (const [x, y] of [
        [l.tee.x, l.tee.y],
        // on the grass short of the water or the wall, to one side and to the other, and at its very edge
        [l.originX + 2.5 * TILE, l.originY + 1.5 * TILE],
        [l.originX + 6.5 * TILE, l.originY + 2.5 * TILE],
        [l.originX + 3.5 * TILE, l.originY + 2.5 * TILE],
      ]) {
        game.place(x, y);
        const shot = new Autopilot(game).plan()!;
        // the whole of the shot, as far as the ball would roll, is on level grass and clear of it
        const rolls = rollsFor(strikeSpeed(shot.power, game.hardest));
        for (let s = 0; s < rolls; s += 0.25) {
          const px = x + Math.cos(shot.angle) * s,
            py = y + Math.sin(shot.angle) * s;
          const t = Math.floor((py - l.originY) / TILE) * l.cols + Math.floor((px - l.originX) / TILE);
          expect(l.water[t] || l.floor[t] > 0 ? `${hole.name}: into it from ${x},${y}` : 'clear').toBe('clear');
        }
      }
    }
  });

  it('finds its way on any map the course could have', () => {
    const map = ['#########', '#......C#', '#.#######', '#.#      ', '#.#      ', '#T#      ', '###      '];
    const l = layoutOf(map);
    expect(onFloor(l, l.cup.x, l.cup.y)).toBe(true);
  });
});
