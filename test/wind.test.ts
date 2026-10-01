/**
 * The wind on a golf hole: it pushes a ball while it is in the air and no other time, along the way the hole's grass
 * and flag show, by the figures `shaping.ts` holds; a hole with none, which is all of minigolf and The Range, plays to the digit as
 * it did before there was any; and what is planned for it, by the rehearsal the autopilot tries its shots in and the preview a
 * drag draws, is what the game does, since each is a trial in a game of the same hole.
 */
import { describe, expect, it } from 'vitest';
import { Autopilot } from '../src/autopilot';
import { BAG, bagClub } from '../src/bag';
import { COURSE } from '../src/course';
import { golfHole } from '../src/golf';
import { checkInvariants } from '../src/invariants';
import { LINKS_SPECS } from '../src/links';
import { Rehearsal } from '../src/planner';
import { Previewer } from '../src/preview';
import { seeded } from '../src/random';
import { RANGE } from '../src/range';
import { windDirection, windReach } from '../src/shaping';
import { DT, GREEN, field, golfGame, newGame } from './helpers';
import { NORTH, blowing, openField, windy } from './wind-helpers';

/** Where a shot of `club` first came down and where it came to rest, from where it was struck, across the aim and along it. */
function fly(
  hole: ReturnType<typeof field>,
  club: string,
  o: { angle?: number; power?: number; shape?: number; spin?: number; random?: () => number } = {},
) {
  const { game, calls } = golfGame(hole, o.random);
  const angle = o.angle ?? NORTH;
  game.pick(club);
  game.setShape(o.shape ?? 0);
  game.setSpin(o.spin ?? 0);
  const x0 = game.world.x[game.ball],
    y0 = game.world.y[game.ball];
  expect(game.shoot(angle, o.power ?? 1)).toBe(true);
  for (let f = 0; f < 60 * 40 && !(f > 1 && game.ready); f++) game.step(DT);
  const land = (calls.find(([n, a]) => n === 'landed' && a[3] === true)?.[1] as number[] | undefined) ?? [x0, y0];
  const frame = (x: number, y: number) => ({
    along: (x - x0) * Math.cos(angle) + (y - y0) * Math.sin(angle),
    // to the left of the aim is positive, as an angle that grows is
    across: -(x - x0) * Math.sin(angle) + (y - y0) * Math.cos(angle),
  });
  return {
    landing: frame(land[0], land[1]),
    rest: frame(game.world.x[game.ball], game.world.y[game.ball]),
    game,
    calls,
  };
}

const LEVEL = field('f', 200, 81);

describe('a wind of ten miles an hour', () => {
  for (const club of ['driver', '7-iron', 'sand-wedge']) {
    it(`takes a ${club} off its line by what windReach says, across it, and more or less far along it with and against it`, () => {
      const calm = fly(LEVEL, club).landing;
      // left of north is toward -x, which is a quarter turn from north in the way angles go: toward is where it blows
      for (const [name, toward, along, across] of [
        ['with', NORTH, 1, 0],
        ['against', -NORTH, -1, 0],
        ['across, to the left', NORTH + Math.PI / 2, 0, 1],
        ['across, to the right', NORTH - Math.PI / 2, 0, -1],
      ] as const) {
        const w = fly(windy(LEVEL, toward, 10), club).landing;
        const reach = windReach(bagClub(club), 1, 10);
        expect(w.along - calm.along, `${name}: along`).toBeCloseTo(along * reach, -0.3);
        expect(w.across - calm.across, `${name}: across`).toBeCloseTo(across * reach, -0.3);
        // and what is not pushed is not moved
        if (!along) expect(Math.abs(w.along - calm.along), `${name}: along`).toBeLessThan(0.6);
        if (!across) expect(Math.abs(w.across - calm.across), `${name}: across`).toBeLessThan(0.6);
      }
    });
  }

  it('moves a full driver eight to twelve yards, with it or against it or across it', () => {
    const calm = fly(LEVEL, 'driver').landing;
    for (const toward of [NORTH, -NORTH, NORTH + Math.PI / 2, NORTH - Math.PI / 2]) {
      const w = fly(windy(LEVEL, toward, 10), 'driver').landing;
      const moved = Math.hypot(w.along - calm.along, w.across - calm.across);
      expect(moved, `toward ${toward}`).toBeGreaterThan(8);
      expect(moved, `toward ${toward}`).toBeLessThan(12);
    }
  });

  it('blows twice as hard at twenty miles an hour, and not at all in a calm', () => {
    const calm = fly(LEVEL, '7-iron').landing;
    const ten = fly(windy(LEVEL, NORTH, 10), '7-iron').landing;
    const twenty = fly(windy(LEVEL, NORTH, 20), '7-iron').landing;
    expect((twenty.along - calm.along) / (ten.along - calm.along)).toBeCloseTo(2, 1);
    const none = fly(windy(LEVEL, NORTH, 0), '7-iron').landing;
    expect(none).toEqual(calm);
  });

  it('is held to the most a hole has, and a hole with a wind of nothing, or none, plays as one with no wind field at all', () => {
    const calm = fly(LEVEL, 'driver');
    expect(fly({ ...LEVEL, wind: 0 }, 'driver').rest).toEqual(calm.rest);
    expect(fly({ ...LEVEL, wind: -4 }, 'driver').rest).toEqual(calm.rest);
    expect(fly({ ...LEVEL, wind: NaN }, 'driver').rest).toEqual(calm.rest);
    const most = fly(windy(LEVEL, NORTH, 25), 'driver').landing.along;
    const over = fly(windy(LEVEL, NORTH, 400), 'driver').landing.along;
    expect(over).toBeCloseTo(most, 6);
  });

  it('pushes a ball in the air whatever club struck it, and not one on the ground, or the putter', () => {
    // a putt along the ground is the same with the wind at its hardest as with none
    const calm = fly(LEVEL, 'putter', { power: 0.6 });
    const gale = fly(windy(LEVEL, NORTH + Math.PI / 2, 25), 'putter', { power: 0.6 });
    expect(gale.rest).toEqual(calm.rest);
    // and a ball at rest stays where it is, however it blows: the game is stepped for a minute
    const { game } = golfGame(windy(LEVEL, NORTH + 1, 25));
    const [x, y] = [game.world.x[game.ball], game.world.y[game.ball]];
    for (let f = 0; f < 3600; f++) game.step(DT);
    expect([game.world.x[game.ball], game.world.y[game.ball]]).toEqual([x, y]);
  });

  it('keeps every rule that must always hold, in a gale from every side, for every club, with a shape and a spin', () => {
    for (const toward of [0, 1, 2.2, 4, 5.5]) {
      for (const club of BAG) {
        const { game } = golfGame(windy(LEVEL, toward, 25));
        game.pick(club.id);
        game.setShape(toward > 3 ? 1 : -1);
        game.setSpin(toward > 3 ? -1 : 1);
        game.shoot(NORTH, 1);
        for (let f = 0; f < 60 * 20 && !(f > 1 && game.ready); f++) {
          game.step(DT);
          expect(checkInvariants(game), `${club.id} toward ${toward}, frame ${f}`).toEqual([]);
        }
        expect(game.ready, `${club.id} toward ${toward}: it came to rest`).toBe(true);
      }
    }
  });
});

describe('a game with no wind, no shape and no spin', () => {
  // read off the game before the wind, the shape and the spin were in it: first landing x, y and where it came to rest x, y
  const BEFORE = {
    'driver on the fairway, a true swing': {
      random: () => 0.5,
      club: 'driver',
      at: [-56.6651725769043, 2.7356882095336914, -52.067073822021484, 25.603944778442383],
    },
    '7-iron on the fairway, a swing of the game’s own chance': {
      random: seeded(7),
      club: '7-iron',
      at: [-31.28902244567871, -82.67829132080078, -32.743465423583984, -77.80592346191406],
    },
    'sand wedge on the fairway, a true swing': {
      random: () => 0.5,
      club: 'sand-wedge',
      at: [-19.022672653198242, -126.00567626953125, -19.32667350769043, -125.0233154296875],
    },
  } as const;

  for (const [what, { random, club, at }] of Object.entries(BEFORE)) {
    it(`strikes the ${what} exactly as it did before`, () => {
      const { game, calls } = golfGame(field('f'), random);
      game.pick(club);
      game.shoot(Math.PI / 2 + 0.3, 0.8);
      for (let f = 0; f < 60 * 30 && !game.ready; f++) game.step(DT);
      const landed = calls.find(([n, a]) => n === 'landed' && a[3] === true)![1] as number[];
      expect([landed[0], landed[1], game.world.x[game.ball], game.world.y[game.ball]]).toEqual(at);
    });
  }

  it('is unchanged by a wind put on a hole of minigolf, whose balls never leave the ground: it plays the same shot to the digit', () => {
    const play = (wind: number | undefined) => {
      const { game } = newGame(3, null, [{ ...GREEN, ...(wind === undefined ? {} : { wind, name: blowing(1) }) }]);
      game.setShape(1);
      game.setSpin(-1);
      game.shoot(NORTH + 0.4, 0.9);
      for (let f = 0; f < 60 * 20 && !(f > 1 && game.ready); f++) game.step(DT);
      return [game.world.x[game.ball], game.world.y[game.ball], game.shape, game.spin];
    };
    expect(play(25)).toEqual(play(undefined));
    expect(play(25).slice(2)).toEqual([0, 0]);
  });

  it('has no wind on The Range or the courses of minigolf, and a wind from the hole on The Links', () => {
    for (const hole of [...COURSE, ...RANGE]) expect(hole.wind, hole.name).toBeUndefined();
    const { game } = golfGame(RANGE[0]);
    expect(game.wind.speed).toBe(0);
    const links = golfHole({ ...LINKS_SPECS[0], wind: 7 });
    expect(links.wind).toBe(7);
    expect(golfHole(LINKS_SPECS[1]).wind).toBe(LINKS_SPECS[1].wind);
    const [x, y] = windDirection(links.name);
    expect(golfGame(links).game.wind).toEqual({ x, y, speed: 7 });
  });

  it('refuses a wind that is not a wind when a hole is made, by name', () => {
    expect(() => golfHole({ ...LINKS_SPECS[0], wind: -1 })).toThrow(/The Opener.*wind/);
    expect(() => golfHole({ ...LINKS_SPECS[0], wind: 90 })).toThrow(/wind/);
    expect(() => golfHole({ ...LINKS_SPECS[0], wind: NaN })).toThrow(/wind/);
  });

  it('is the wind of each hole as it begins and not the last hole’s: nothing is kept across holes', () => {
    const calm = field('f', 130, 41);
    const { game } = golfGame(windy(calm, NORTH, 20));
    game.playCourse([windy(calm, NORTH, 20), calm]);
    expect(game.wind.speed).toBe(20);
    game.begin(1);
    expect(game.wind.speed).toBe(0);
    game.pick('driver');
    game.shoot(NORTH, 1);
    for (let f = 0; f < 60 * 30 && !(f > 1 && game.ready); f++) game.step(DT);
    // the second hole's ball is struck as if the first had never been windy
    const alone = fly(calm, 'driver').game;
    expect([game.world.x[game.ball], game.world.y[game.ball]]).toEqual([
      alone.world.x[alone.ball],
      alone.world.y[alone.ball],
    ]);
    game.begin(0);
    expect(game.wind.speed).toBe(20);
  });
});

describe('the rehearsal and the preview of a shot in the wind', () => {
  it('is a trial of the same hole, so what it says of a shot in the wind is what the game does, to the digit', () => {
    for (const toward of [NORTH, -NORTH, 0, Math.PI]) {
      const hole = windy(LEVEL, toward, 15);
      const { game } = golfGame(hole);
      const rehearsal = new Rehearsal(game.rehearsal());
      const from = { x: game.world.x[game.ball], y: game.world.y[game.ball] };
      for (const club of ['driver', '7-iron', 'sand-wedge'])
        for (const shape of [-1, 0, 1]) {
          const t = rehearsal.shot(from, club, NORTH + 0.1, 0.8, shape, 0);
          const real = fly(hole, club, { angle: NORTH + 0.1, power: 0.8, shape }).game;
          expect(t.x, `${club} toward ${toward}, shape ${shape}`).toBe(real.world.x[real.ball]);
          expect(t.y).toBe(real.world.y[real.ball]);
        }
    }
  });

  it('is not changed by the choosing of a shape or a spin for the preview: the game that is played keeps its own', () => {
    const { game } = golfGame(windy(LEVEL, 1, 12));
    game.setShape(0.5);
    game.setSpin(-0.5);
    const previewer = new Previewer(game);
    previewer.run({ x: game.world.x[game.ball], y: game.world.y[game.ball] }, bagClub('driver'), NORTH, 1, -1, 1);
    expect([game.shape, game.spin]).toEqual([0.5, -0.5]);
  });
});

describe('the autopilot in the wind', () => {
  /** A ball `d` yards south of the cup, in the middle of the width of a hole whose wind is `mph` toward `toward`, and the plan it makes. */
  const plan = (d: number, toward: number, mph: number) => {
    const hole = windy(openField('f'), toward, mph);
    const { game } = golfGame(hole);
    const { cup } = game.layout;
    game.place(cup.x, cup.y - d);
    const autopilot = new Autopilot(game);
    const p = autopilot.plan()!;
    const struck = golfGame(hole);
    struck.game.place(cup.x, cup.y - d);
    struck.game.pick(p.club!);
    struck.game.shoot(p.angle, p.power);
    for (let f = 0; f < 60 * 30 && struck.game.phase === 'play' && !(f > 1 && struck.game.ready); f++)
      struck.game.step(DT);
    const g = struck.game;
    const holed = g.phase !== 'play';
    const off = holed ? 0 : Math.hypot(g.world.x[g.ball] - cup.x, g.world.y[g.ball] - cup.y);
    return { p, off, holed, trials: autopilot.trials, game: g };
  };

  for (const [name, toward] of [
    ['a headwind', -NORTH],
    ['a crosswind', 0],
    ['a tailwind', NORTH],
  ] as const) {
    for (const d of [120, 200]) {
      it(`plays its shot from ${d} yards in a fifteen mile an hour ${name} to within three yards of the cup, in no more trials than it takes in a calm and a few`, () => {
        const calm = plan(d, toward, 0);
        const windy15 = plan(d, toward, 15);
        expect(windy15.off, `${windy15.p.club} at ${windy15.p.power}`).toBeLessThan(3);
        expect(windy15.trials).toBeLessThanOrEqual(calm.trials + 10);
        // and no more than any plan allows: five trials a candidate, of a handful
        expect(windy15.trials).toBeLessThanOrEqual(5 * 8);
      });
    }

    it(`plays a shot at the very limit of the driver, from 300 yards, in a fifteen mile an hour ${name}, as far as the club can go, and says where`, () => {
      const w = plan(300, toward, 15);
      expect(w.p.club).toBe('driver');
      expect(w.p.power).toBe(1);
      // what it expects is what the game does: it saw the wind
      expect(w.game.world.x[w.game.ball]).toBeCloseTo(w.p.expect!.x, 3);
      expect(w.game.world.y[w.game.ball]).toBeCloseTo(w.p.expect!.y, 3);
    });
  }

  it('reaches further with a tail wind than a calm, and takes a longer club against a head wind, by the arithmetic of its first guess', () => {
    const club = (toward: number, mph: number) => plan(150, toward, mph).p.club;
    const order = (id: string | undefined) => BAG.findIndex((c) => c.id === id);
    // a lower index is a longer club
    expect(order(club(NORTH, 15))).toBeGreaterThan(order(club(NORTH, 0)));
    expect(order(club(-NORTH, 15))).toBeLessThan(order(club(NORTH, 0)));
  });
});
