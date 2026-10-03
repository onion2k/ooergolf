/**
 * A knock: the game telling of the ball's velocity turned sharply in a step,
 * by the rail, a post, the cup or the ground it drops onto, so the page can
 * squash the ball along it. What is met hard is told once; a ball rolling
 * along the rail, dying on the green or in the sand, climbing a step or
 * fitted to a slope as it is struck is told of never.
 */
import { describe, expect, it } from 'vitest';
import { BALL, HARDEST_SHOT, KNOCK, ROLL, TILE, powerFor, stepAt } from '../src/arena';
import { COURSE, type HoleDef } from '../src/course';
import { SIDE_HILL } from './hills';
import { CLEAR_OF_CUP, Game } from '../src/game';
import { checkInvariants, knockProblems } from '../src/invariants';
import { THE_CUP } from '../src/physics';
import { Progress, memoryStore } from '../src/progress';
import { seeded } from '../src/random';
import { DT, newGame, onGreen } from './helpers';

/** The speed to strike a ball so it is going `arrive` after rolling `distance` on the green. */
const arriving = (arrive: number, distance: number) => Math.sqrt(arrive * arrive + 2 * ROLL.roll * distance);

/** Each knock told, as its numbers: how hard, where, and which way the ball was pushed. */
function knocks(told: string[]) {
  return told
    .filter((t) => t.startsWith('knocked '))
    .map((t) => {
      const [hard, x, y, dx, dy, dz] = t.split(' ').slice(1).map(Number);
      return { hard, x, y, dx, dy, dz };
    });
}

/** Play until the ball is ready again, or the hole is done, checking the rules every frame. */
function untilStill(game: Game, seconds = 8) {
  for (let f = 0; f < seconds * 60; f++) {
    game.step(DT);
    expect(checkInvariants(game), `frame ${f}`).toEqual([]);
    if (game.phase !== 'play' || (f > 1 && game.ready)) return;
  }
  throw new Error('the ball never came to rest');
}

/** The practice green's north rail, where its face is, and a place well along it. */
function northRail(game: Game) {
  const l = game.layout;
  return { face: l.originY + (l.rows - 1) * TILE, x: l.originX + 6 * TILE };
}

describe('a knock', () => {
  it('is told once of a ball driven into the rail at speed: as hard as the rail turned it, and back off it', () => {
    const { game, told } = onGreen();
    const { face, x } = northRail(game);
    game.place(x, face - 8);
    // straight at it, arriving at 20 after the seven units to it
    game.shoot(Math.PI / 2, powerFor(arriving(20, 7), HARDEST_SHOT));
    untilStill(game);
    const all = knocks(told);
    expect(all.length, told.join('\n')).toBe(1);
    const [k] = all;
    // met at about 20 and sent back at the rail's 0.65 of it: turned by about 33
    expect(k.hard).toBeGreaterThan(28);
    expect(k.hard).toBeLessThan(38);
    expect(k.dy, 'pushed back off the rail').toBeLessThan(-0.95);
    expect(Math.hypot(k.dx, k.dy, k.dz), 'a direction').toBeCloseTo(1, 1);
    expect(k.y, 'where it met the rail').toBeGreaterThan(face - 2);
  });

  it('is never told of a ball rolling gently along the rail, though it rubs it', () => {
    const { game, told } = onGreen();
    const { face, x } = northRail(game);
    game.place(x, face - 1.2);
    // along it, and a little into it, at a gentle 12 a second: it rubs the rail, turned by a few units a second, and
    // runs on along it
    game.shoot(0.2, powerFor(12, HARDEST_SHOT));
    let rubbed = false;
    for (let f = 0; f < 6 * 60 && !(f > 1 && game.ready); f++) {
      game.step(DT);
      if (game.world.vy[game.ball] < 0) rubbed = true;
    }
    expect(rubbed, 'it met the rail').toBe(true);
    expect(game.world.x[game.ball] - x, 'and ran along it').toBeGreaterThan(3);
    expect(knocks(told), told.join('\n')).toEqual([]);
  });

  it('is not told of a ball that leaves the world in the step it is turned: holed, not knocked', () => {
    const { game, told } = onGreen();
    const { world, ball } = game;
    // a step of the physics in which the ball is turned hard and goes down the cup, as a fast one may be in one step
    const step = world.step.bind(world);
    world.step = (_dt, collect) => {
      world.vx[ball] = -40;
      collect(BALL, world.x[ball], world.y[ball], ball, THE_CUP);
      world.remove(ball);
      world.step = step;
    };
    game.step(DT);
    expect(told.filter((t) => t.startsWith('holed')).length, 'holed').toBe(1);
    expect(knocks(told), 'and not knocked').toEqual([]);
  });

  it('is never told of a putt that dies on the green, or in the sand', () => {
    const green = onGreen();
    green.game.shoot(Math.PI / 2, 0.3);
    untilStill(green.game);
    expect(knocks(green.told)).toEqual([]);
    const bunker = COURSE.find((h) => h.name === 'The Bunker')!;
    const sand = newGame(1, null, [bunker]);
    sand.game.shoot(Math.PI / 2, 0.3);
    untilStill(sand.game);
    const { layout, world, ball } = sand.game;
    expect(layout.sand[Math.floor((world.y[ball] - layout.originY) / TILE) * layout.cols + 4], 'died in the sand').toBe(
      1,
    );
    expect(knocks(sand.told)).toEqual([]);
  });

  /** A lane with a raised bank across it, one step up, between the tee and the cup. */
  const BANK: HoleDef = {
    name: 'test bank',
    par: 3,
    map: [
      '#######',
      '#..C..#',
      '#.....#',
      '#.....#',
      '#.....#',
      '#11111#',
      '#11111#',
      '#11111#',
      '#.....#',
      '#.....#',
      '#..T..#',
      '#######',
    ],
  };

  it('is told of a ball dropping off a step, pushed up by the ground it lands on, and not of one rolling up it', () => {
    const { game, told } = newGame(1, null, [BANK]);
    const { tee } = game.layout;
    // up onto the bank, which rolls it up the step and on across it, and down off its far side
    const top = Math.max(
      ...[...Array(40).keys()].map((k) => tee.y + k).filter((y) => stepAt(game.layout, tee.x, y) > 0),
    );
    game.shoot(Math.PI / 2, powerFor(arriving(8, top - tee.y + 1), HARDEST_SHOT));
    let up = -1;
    for (let f = 0; f < 6 * 60 && !(f > 1 && game.ready); f++) {
      game.step(DT);
      if (up < 0 && stepAt(game.layout, tee.x, game.world.y[game.ball]) > 0) up = told.length;
    }
    expect(up, 'it climbed the bank').toBeGreaterThan(0);
    expect(game.world.y[game.ball], 'and went down off its far side').toBeGreaterThan(top);
    expect(knocks(told.slice(0, up)), 'none rolling up the step').toEqual([]);
    const down = knocks(told);
    expect(down.length, told.join('\n')).toBe(1);
    expect(down[0].dz, 'the ground pushing it up').toBeGreaterThan(0.9);
    expect(down[0].hard, 'a step of 0.4 falls at about 7.5').toBeGreaterThan(KNOCK.least);
    expect(down[0].hard).toBeLessThan(10);
  });

  it('is told of a ball thrown back off a post', () => {
    const POST: HoleDef = {
      name: 'test post',
      par: 3,
      map: [
        '#######',
        '#..C..#',
        '#.....#',
        '#..o..#',
        '#.....#',
        '#.....#',
        '#.....#',
        '#.....#',
        '#..T..#',
        '#######',
      ],
    };
    const { game, told } = newGame(1, null, [POST]);
    const { tee, bumpers } = game.layout;
    game.shoot(Math.PI / 2, powerFor(arriving(15, bumpers[0].y - 1 - tee.y - 1), HARDEST_SHOT));
    for (let f = 0; f < 90; f++) game.step(DT);
    const [first] = knocks(told);
    expect(first, told.join('\n')).toBeDefined();
    // met at 15 and thrown back faster: turned by more than twice it
    expect(first.hard).toBeGreaterThan(30);
    expect(first.dy).toBeLessThan(-0.9);
  });

  it('is not told of a ball struck across a slope, which the physics fits to the ground in the first step', () => {
    // the gold putter, the hardest there is, straight up the tilt of Side-hill: struck along the level, the ball is
    // turned up the slope in the physics' first step by as much as a knock, and that is the strike's, not a knock
    const { game, told } = newGame(1, JSON.stringify({ owned: ['putter', 'gold'], club: 'gold' }), [SIDE_HILL]);
    expect(game.hardest).toBe(48);
    game.shoot(0, 1);
    for (let f = 0; f < 6; f++) game.step(DT);
    expect(game.world.vz[game.ball], 'turned up the slope').toBeGreaterThan(KNOCK.least);
    expect(knocks(told)).toEqual([]);
  });

  it('is told of a ball struck from against the rail into it, the first step along the ground', () => {
    const { game, told } = onGreen();
    const { face, x } = northRail(game);
    game.place(x, face - 1.05);
    game.shoot(Math.PI / 2, 1);
    game.step(DT);
    const [k] = knocks(told);
    expect(k, told.join('\n')).toBeDefined();
    expect(k.hard).toBeGreaterThan(HARDEST_SHOT);
    expect(k.dy).toBeLessThan(-0.95);
  });

  /** The ball on the practice green thrown at the north rail at `speed`, from just short of it, outside a strike. */
  const throwAt = (game: Game, speed: number) => {
    const { face, x } = northRail(game);
    const { world, ball } = game;
    world.wake(ball);
    world.x[ball] = x;
    world.y[ball] = face - 1.3;
    world.vx[ball] = world.vz[ball] = 0;
    world.vy[ball] = speed;
  };

  it('is one knock for what comes close after it, unless that is harder', () => {
    const { game, told } = onGreen();
    throwAt(game, 20);
    for (let f = 0; f < 3; f++) game.step(DT);
    expect(knocks(told).length).toBe(1);
    // a harder one straight after is told; a softer one straight after that is part of it
    throwAt(game, 40);
    for (let f = 0; f < 3; f++) game.step(DT);
    expect(knocks(told).length, 'the harder told').toBe(2);
    throwAt(game, 8);
    for (let f = 0; f < 3; f++) game.step(DT);
    expect(knocks(told).length, 'the softer not').toBe(2);
    // and once that knock is past, a soft one is a knock of its own
    for (let f = 0; f < 10; f++) game.step(DT);
    throwAt(game, 8);
    for (let f = 0; f < 3; f++) game.step(DT);
    expect(knocks(told).length, 'a soft one, later').toBe(3);
    expect(KNOCK.apart).toBeLessThanOrEqual(0.1);
  });

  it('is not held back on a hole begun again by one on the hole before', () => {
    const { game, told } = onGreen();
    throwAt(game, 40);
    for (let f = 0; f < 3; f++) game.step(DT);
    expect(knocks(told).length).toBe(1);
    game.startAt(0);
    throwAt(game, 8);
    for (let f = 0; f < 3; f++) game.step(DT);
    expect(knocks(told).length, 'a soft knock straight after, on the hole begun again').toBe(2);
  });

  it('is told of a ball rattling into the cup before it is holed, which is once, and never after', () => {
    const OPEN: HoleDef = {
      name: 'test open',
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
    // through the middle at 15, as fast as drops: it crosses the mouth and knocks the far wall on its way down
    const { game, told } = newGame(1, null, [OPEN]);
    const { cup } = game.layout;
    const y0 = cup.y - CLEAR_OF_CUP - 0.1;
    game.place(cup.x, y0);
    game.shoot(Math.PI / 2, powerFor(arriving(15, cup.y - 1.45 - y0), HARDEST_SHOT));
    for (let f = 0; f < 240; f++) game.step(DT);
    const holed = told.findIndex((t) => t.startsWith('holed'));
    expect(holed, 'holed').toBeGreaterThan(0);
    expect(told.filter((t) => t.startsWith('holed')).length, 'once').toBe(1);
    expect(knocks(told.slice(0, holed)).length, 'knocked in the cup on the way down').toBeGreaterThan(0);
    expect(knocks(told.slice(holed)), 'and nothing once it is holed').toEqual([]);
    expect(game.card).toEqual([1]);
  });

  it('is told only of the ball where it is, as hard as a knock is, along a direction, and the same from the same seed', () => {
    const play = () => {
      const seen: string[] = [],
        problems: string[] = [];
      const game: Game = new Game(
        new Progress(memoryStore()),
        {
          // checked as it is told, with the game as it stands then
          knocked(...k) {
            seen.push(k.join(' '));
            problems.push(...knockProblems(game, ...k));
          },
        },
        { random: seeded(4) },
      );
      // hard any way, round the course: off the rail, the posts and the barriers, down the steps and into the water
      for (let s = 0; s < 120; s++) {
        if (game.phase === 'over') game.newRound();
        if (game.ready) game.shoot(s * 2.1, 1);
        for (let f = 0; f < 60; f++) game.step(DT);
      }
      return { seen, problems };
    };
    const one = play(),
      two = play();
    expect(one.problems).toEqual([]);
    expect(one.seen.length, 'knocks told').toBeGreaterThan(20);
    expect(two.seen).toEqual(one.seen);
  });

  it('breaks the rule for a knock told of a ball that is not where it is, too soft, or along no direction', () => {
    const { game } = onGreen();
    const { world, ball } = game;
    const x = world.x[ball],
      y = world.y[ball];
    expect(knockProblems(game, 20, x, y, 0, -1, 0)).toEqual([]);
    expect(knockProblems(game, KNOCK.least - 1, x, y, 0, -1, 0).join()).toMatch(/softer than a knock/);
    expect(knockProblems(game, NaN, x, y, 0, -1, 0).join()).toMatch(/softer than a knock/);
    expect(knockProblems(game, 20, x + 3, y, 0, -1, 0).join()).toMatch(/not where the ball is/);
    expect(knockProblems(game, 20, x, y, 0, -0.5, 0).join()).toMatch(/along no direction/);
    world.alive[ball] = 0;
    expect(knockProblems(game, 20, x, y, 0, -1, 0).join()).toMatch(/no ball/);
  });
});
