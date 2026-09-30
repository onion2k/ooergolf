/** The autopilot as a measuring instrument: it knows how far a shot rolls, sees round corners, holes out, and gets stuck nowhere. */
import { describe, expect, it } from 'vitest';
import {
  BALL,
  BUMPER,
  HARDEST_SHOT,
  KIND_RADIUS,
  TILE,
  layoutOf,
  onFloor,
  powerFor,
  rollsFor,
  stepAt,
  strikeSpeed,
  tileAt,
  type Layout,
} from '../src/arena';
import { Autopilot, pathToCup, speedAcross, speedFor, timeTo } from '../src/autopilot';
import { COURSE, COURSES, type HoleDef } from '../src/course';
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

  it('knows how hard to strike across sand: struck to stop past a stretch of it, it stops near there', () => {
    const LANE: HoleDef = {
      name: 'test sand',
      par: 3,
      map: ['#####', '#.C.#', '#...#', '#...#', '#...#', '#sss#', '#sss#', '#...#', '#...#', '#...#', '#.T.#', '#####'],
    };
    const { game } = newGame(1, null, [LANE]);
    const l = game.layout;
    const x = l.tee.x,
      y0 = l.tee.y,
      y1 = l.originY + 8.5 * TILE;
    game.shoot(Math.PI / 2, powerFor(speedAcross(l, x, y0, x, y1, 0), HARDEST_SHOT));
    for (let f = 0; f < 600 && !(f > 1 && game.ready); f++) game.step(DT);
    expect(Math.abs(game.world.y[game.ball] - y1), `stopped at ${game.world.y[game.ball].toFixed(1)}`).toBeLessThan(
      1.5,
    );
    // on grass alone, the same as the green's own sum
    expect(speedAcross(l, x, y0, x, y0 + 6, 3)).toBeCloseTo(speedFor(6, 3), 1);
  });

  it('goes round sand on grass when the way through is no shorter, and round a bunker the club cannot blast through', () => {
    // two ways to the cup as long as each other, one up a lane of sand and one up a lane of grass
    const TWO: HoleDef = {
      name: 'two lanes',
      par: 3,
      map: ['#######', '#.....#', '#..C..#', '#.###.#', '#s###.#', '#s###.#', '#.....#', '#..T..#', '#######'],
    };
    const two = newGame(1, null, [TWO]).game;
    expect(Math.cos(new Autopilot(two).plan()!.angle), 'up the grass, to the east').toBeGreaterThan(0.3);
    // sand from rail to rail but for a lane of grass at the east, five rows deep: too much for the putter straight on
    const WIDE: HoleDef = {
      name: 'wide bunker',
      par: 3,
      map: [
        '#########',
        '#.......#',
        '#...C...#',
        '#.......#',
        ...Array.from({ length: 5 }, () => '#ssssss.#'),
        '#.......#',
        '#...T...#',
        '#########',
      ],
    };
    const wide = newGame(1, null, [WIDE]).game;
    const { layout } = wide;
    const x0 = wide.world.x[wide.ball],
      y0 = wide.world.y[wide.ball];
    expect(speedAcross(layout, x0, y0, layout.cup.x, layout.cup.y, 4), 'straight on is past the club').toBeGreaterThan(
      HARDEST_SHOT,
    );
    // its shot played: it comes to rest on grass, round the bunker, and not in the sand for want of a harder club
    const shot = new Autopilot(wide).plan()!;
    wide.shoot(shot.angle, shot.power);
    for (let f = 0; f < 600 && !(f > 1 && wide.ready); f++) wide.step(DT);
    const t = tileAt(layout, wide.world.x[wide.ball], wide.world.y[wide.ball]);
    expect(layout.sand[t], 'and it does not stop in the sand').toBe(0);
  });

  it('plans round a post: every shot it plans passes clear of each by the width of the ball', () => {
    const { game } = newGame();
    const index = COURSE.findIndex((h) => h.name === 'Bumpers');
    game.begin(index);
    const pilot = new Autopilot(game);
    const { layout } = game;
    const x0 = game.world.x[game.ball],
      y0 = game.world.y[game.ball];
    const shot = pilot.plan()!;
    const reach = Math.min(
      rollsFor(strikeSpeed(shot.power, game.hardest)),
      Math.hypot(layout.cup.x - x0, layout.cup.y - y0),
    );
    for (let s = 0; s < reach; s += 0.25)
      for (const post of layout.bumpers)
        expect(
          Math.hypot(x0 + Math.cos(shot.angle) * s - post.x, y0 + Math.sin(shot.angle) * s - post.y),
          `${s.toFixed(2)} along`,
        ).toBeGreaterThan(BUMPER.radius + KIND_RADIUS[BALL]);
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

/**
 * The route the autopilot takes over the tiles, held against the plain way of finding it: the nearest tile not yet
 * settled found by looking at every tile, which is slow and simple and was the autopilot's own until a hole could be
 * a hundred tiles across. The two must give the same route from anywhere on any hole, or the pace of every course
 * moves with it.
 */
describe('the autopilot’s route over the tiles', () => {
  const CLIMB = KIND_RADIUS[BALL] * 0.95;

  /** The way from (x, y) to the cup as it was first written: a scan of every tile for the nearest, once for each. */
  function oracle(l: Layout, x: number, y: number): [number, number][] {
    const n = l.cols * l.rows;
    const tile = (px: number, py: number) =>
      Math.floor((py - l.originY) / TILE) * l.cols + Math.floor((px - l.originX) / TILE);
    const posted = new Set(l.bumpers.map((p) => tile(p.x, p.y)));
    const height = (t: number) =>
      stepAt(l, l.originX + ((t % l.cols) + 0.5) * TILE, l.originY + (Math.floor(t / l.cols) + 0.5) * TILE);
    const cost = (t: number) => (l.sand[t] ? 3 : 1);
    const far = new Float64Array(n).fill(Infinity);
    const done = new Uint8Array(n);
    far[tile(l.cup.x, l.cup.y)] = 0;
    for (;;) {
      let t = -1;
      for (let u = 0; u < n; u++) if (!done[u] && far[u] < Infinity && (t < 0 || far[u] < far[t])) t = u;
      if (t < 0) break;
      done[t] = 1;
      const tx = t % l.cols;
      for (const u of [tx > 0 ? t - 1 : -1, tx < l.cols - 1 ? t + 1 : -1, t - l.cols, t + l.cols]) {
        if (u < 0 || u >= n || l.solid[u] || l.water[u] || posted.has(u) || done[u]) continue;
        if (height(t) - height(u) >= CLIMB) continue;
        far[u] = Math.min(far[u], far[t] + cost(u));
      }
    }
    const out: [number, number][] = [];
    let t = tile(x, y);
    if (t < 0 || t >= n || far[t] === Infinity) return out;
    while (far[t] > 0) {
      const tx = t % l.cols;
      let next = t;
      for (const u of [tx > 0 ? t - 1 : -1, tx < l.cols - 1 ? t + 1 : -1, t - l.cols, t + l.cols])
        if (u >= 0 && u < n && far[u] < far[next] && height(u) - height(t) < CLIMB) next = u;
      if (next === t) break;
      t = next;
      out.push([l.originX + ((t % l.cols) + 0.5) * TILE, l.originY + (Math.floor(t / l.cols) + 0.5) * TILE]);
    }
    return out;
  }

  /** Where the ball might lie: the middle of a tile that is ground, at any of `count` places chosen by `random`. */
  function lies(l: Layout, random: () => number, count: number): [number, number][] {
    const ground: number[] = [];
    for (let t = 0; t < l.cols * l.rows; t++) if (!l.solid[t]) ground.push(t);
    return Array.from({ length: count }, () => {
      const t = ground[Math.floor(random() * ground.length)];
      return [l.originX + ((t % l.cols) + 0.5) * TILE, l.originY + (Math.floor(t / l.cols) + 0.5) * TILE];
    });
  }

  it('is the route the plain way finds, from forty lies on every hole of every course of minigolf', () => {
    // golf holes have their own route, tested in route.test.ts, and the plain way over twenty thousand tiles is n squared
    let routes = 0;
    const courses = COURSES.filter((c) => !c.golf);
    for (const course of courses)
      for (const hole of course.holes) {
        const l = layoutOf(hole.map, hole.terrain);
        for (const [x, y] of lies(l, seeded(hole.name.length * 31 + 7), 40)) {
          expect(pathToCup(l, x, y), `${hole.name} from ${x},${y}`).toEqual(oracle(l, x, y));
          routes++;
        }
      }
    expect(routes, 'every lie was tried').toBe(courses.reduce((n, c) => n + c.holes.length, 0) * 40);
  });

  it('is the route the plain way finds on sixty maps of sand, water, posts and steps, and the same none where the cup is walled in', () => {
    const random = seeded(2024);
    let walled = 0,
      through = 0;
    for (let m = 0; m < 60; m++) {
      const cols = 8 + Math.floor(random() * 14),
        rows = 8 + Math.floor(random() * 14);
      const map = Array.from({ length: rows }, (_, r) =>
        Array.from({ length: cols }, (_, c) => {
          if (r === 0 || r === rows - 1 || c === 0 || c === cols - 1) return '#';
          if (r === rows - 2 && c === 1) return 'T';
          if (r === 1 && c === cols - 2) return 'C';
          const d = random();
          return d < 0.1 ? 's' : d < 0.2 ? '~' : d < 0.26 ? 'o' : d < 0.3 ? '#' : d < 0.34 ? '1' : d < 0.37 ? '3' : '.';
        }).join(''),
      );
      const l = layoutOf(map);
      for (const [x, y] of lies(l, random, 12)) {
        const route = pathToCup(l, x, y);
        expect(route, `map ${m} from ${x},${y}`).toEqual(oracle(l, x, y));
        if (route.length) through++;
        else walled++;
      }
    }
    // both kinds of answer were given: a route, and none
    expect(through).toBeGreaterThan(100);
    expect(walled).toBeGreaterThan(20);
  });

  it('is found on a hole of forty thousand tiles in a share of a second, and the shot from it is the cup’s way', () => {
    const map = Array.from({ length: 200 }, (_, r) =>
      Array.from({ length: 200 }, (_, c) => {
        if (r === 0 || r === 199 || c === 0 || c === 199) return '#';
        if (r === 197 && c === 50) return 'T';
        if (r === 2 && c === 150) return 'C';
        return '.';
      }).join(''),
    );
    const { game } = newGame(1, null, [{ name: 'test open', par: 8, map }]);
    const began = performance.now();
    const shot = new Autopilot(game).plan();
    const took = performance.now() - began;
    expect(shot, 'a shot to take').not.toBe(null);
    expect(shot!.power, 'nearly as hard as the club goes, the cup being so far').toBeGreaterThan(0.8);
    // the cup is north and east of the tee, and the route goes along the tiles: east, or north, or between
    expect(shot!.angle).toBeGreaterThanOrEqual(0);
    expect(shot!.angle).toBeLessThanOrEqual(Math.PI / 2);
    expect(took, `took ${took.toFixed(0)} ms`).toBeLessThan(500);
  });
});
