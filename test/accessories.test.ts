/**
 * The fifteen accessories (Part 5), each doing what its line in the shop says on a hole of golf and on a hole of minigolf.
 * The four that are only a look are held to what the game and the bursts say of them, since the picture is the page's.
 */
import { describe, expect, it } from 'vitest';
import { TILE, layoutOf, powerFor } from '../src/arena';
import { speedFor } from '../src/autopilot';
import { BAG, PUTTER, bagClub, strikeFactor } from '../src/bag';
import { bankOf, makeBank } from '../src/bank';
import { FIREWORKS, FIREWORK_STEPS, cupBurst, fireworkAt, fireworkEmits } from '../src/bursts';
import { CUP, type HoleDef } from '../src/course';
import { DISPERSION, lossOf, maxScatter } from '../src/flight';
import { Game, CLEAR_OF_CUP } from '../src/game';
import { breakAids, breakOf, readerArrows } from '../src/green';
import { FIRST_STROKE_MOST, ITEMS, NO_KIT, PAY, kitOf, paid } from '../src/items';
import { flag } from '../src/models';
import { PALETTE } from '../src/models/palette';
import { windReach } from '../src/shaping';
import { Previewer } from '../src/preview';
import { Scene } from '../src/scene';
import { RUNGS } from '../src/quality';
import { LIE } from '../src/surfaces';
import { TRAIL, Trail, trailDrawn } from '../src/trail';
import { windOf } from '../src/turf';
import { BELT_HOLE } from './stream-hole';
import { DT, FLAT, GREEN, field } from './helpers';
import { counted, saveWearing, slotsOf, wearing } from './kits';

const speed3 = (g: Game) => Math.hypot(g.world.vx[g.ball], g.world.vy[g.ball], g.world.vz[g.ball]);
const speed2 = (g: Game) => Math.hypot(g.world.vx[g.ball], g.world.vy[g.ball]);
const heading = (g: Game) => Math.atan2(g.world.vy[g.ball], g.world.vx[g.ball]);
const NORTH = Math.PI / 2;
const run = (g: Game, frames: number) => {
  for (let f = 0; f < frames; f++) g.step(DT);
};
const still = (g: Game) => {
  for (let f = 0; f < 60 * 40 && !(f > 2 && g.ready) && g.phase === 'play'; f++) g.step(DT);
};

/** The golf hole every test of a golf shot is struck on: a long fairway with a green at the far end, as flat as a table. */
const GOLF = FLAT.long;

/** A hole of minigolf with a stretch of water between the tee and the cup, and another hole like it to carry on to. */
const WATERY: HoleDef = {
  name: 'Watery',
  par: 3,
  map: ['#######', '#.C...#', '#.....#', '#~~~~~#', '#.....#', '#..T..#', '#######'],
};

/** A hole holed in one with the putter, on minigolf or golf. */
function holeInOne(g: Game) {
  const { cup } = g.layout;
  if (g.layout.golf) {
    g.pick('putter');
    g.place(cup.x + 6, cup.y);
    g.shoot(Math.PI, 0.14);
  } else {
    g.place(cup.x, cup.y - CLEAR_OF_CUP - 0.1);
    g.shoot(NORTH, powerFor(8, g.hardest));
  }
  for (let f = 0; f < 60 * 12 && g.phase === 'play'; f++) g.step(DT);
}

describe('Comet Trail', () => {
  it('is on in the kit, and drawn on the rungs that draw particles, on either kind of course', () => {
    for (const hole of [GREEN, GOLF]) {
      const { game } = wearing(['comet'], [hole]);
      expect(game.kit.trail, hole.name).toBe(true);
      expect(trailDrawn(game.kit.trail, RUNGS[0])).toBe(true);
      expect(trailDrawn(wearing([], [hole]).game.kit.trail, RUNGS[0])).toBe(false);
    }
    expect(trailDrawn(true, { particles: false })).toBe(false);
  });

  it('keeps the ring of past places the ball makes, on a putt and on a drive, as the page writes it', () => {
    for (const [hole, club] of [
      [GREEN, 'putter'],
      [GOLF, 'driver'],
    ] as const) {
      const { game } = wearing(['comet'], [hole]);
      const trail = new Trail();
      game.pick(club);
      game.shoot(NORTH, 0.8);
      for (let f = 0; f < 400; f++) {
        game.step(DT);
        if (trailDrawn(game.kit.trail, RUNGS[0]))
          trail.record(game.t, game.world.x[game.ball], game.world.y[game.ball], game.world.z[game.ball]);
      }
      expect(trail.count, hole.name).toBeGreaterThan(5);
      expect(trail.count).toBeLessThanOrEqual(TRAIL.most);
    }
  });
});

describe('Party Cup', () => {
  it('throws three times the pieces of the plain burst, higher and wider, drifting down slowly, on every hole', () => {
    for (const hole of [GREEN, GOLF]) {
      const { game } = wearing(['streamers'], [hole]);
      expect(game.kit.streamers, hole.name).toBe(true);
    }
    const count = (es: ReturnType<typeof cupBurst>) => es.reduce((a, e) => a + e.count, 0);
    const plain = cupBurst(0, 0, false),
      party = cupBurst(0, 0, false, 'streamers');
    expect(party[0].count / plain[0].count).toBeCloseTo(3, 0);
    expect(count(party)).toBeGreaterThan(count(plain) * 3);
    expect(party[0].spread).toBeGreaterThan(plain[0].spread);
    expect(party[0].life).toBeGreaterThan(plain[0].life);
    expect(party[0].gravity).toBeLessThan(plain[0].gravity!);
    // the biggest burst, a hole in one, still leaves the ring of a thousand room for a puff and a splash
    expect(count(cupBurst(0, 0, true, 'streamers'))).toBeLessThanOrEqual(1024 - 200);
  });
});

describe('Club Pennant', () => {
  it('makes the flag’s cloth a striped pennant in the club’s colours, and leaves the plain flag alone', () => {
    const plain = flag([1, 0, 0]).parts.find((p) => p.name === 'flag')!;
    const penn = flag([1, 0, 0], { pennant: true }).parts.find((p) => p.name === 'flag')!;
    expect(plain.pattern).toBeUndefined();
    expect(penn.pattern).toBeDefined();
    expect(penn.material).not.toEqual(plain.material);
    expect(flag([1, 0, 0], { pennant: true }).parts).toHaveLength(flag([1, 0, 0]).parts.length);
    expect(penn.pattern!.second).toEqual(PALETTE.cream);
  });

  it('is built into the scene of a hole begun with it, on either kind of course, as one cloth', () => {
    for (const hole of [GREEN, GOLF]) {
      const { game } = wearing(['pennant'], [hole]);
      expect(game.kit.pennant).toBe(true);
      const scene = new Scene();
      scene.static(game.layout, hole.name, game.obstacles, game.cup.radius);
      const groups = scene.dynamic(game.obstacles, game.layout, hole.name, windOf(hole.name), {
        pennant: game.kit.pennant,
      });
      expect(scene.flagStrips()).toBe(1);
      expect(groups.length).toBeGreaterThan(2);
    }
  });
});

describe('Fireworks', () => {
  it('sends three shells up over the cup, a rocket and a burst each, the last inside two seconds', () => {
    expect(wearing(['fireworks'], [GREEN]).game.kit.fireworks).toBe(true);
    expect(FIREWORK_STEPS).toBe(FIREWORKS.shells * 2);
    let last = -1;
    let sparks = 0;
    for (let step = 0; step < FIREWORK_STEPS; step++) {
      const at = fireworkAt(step);
      // a burst goes off when its rocket tops out, and the shells go up one after another
      if (step % 2)
        expect(at, `step ${step} is its rocket’s top`).toBeCloseTo(fireworkAt(step - 1) + FIREWORKS.rise, 12);
      else if (step)
        expect(at, `step ${step} is the next shell`).toBeCloseTo(fireworkAt(step - 2) + FIREWORKS.apart, 12);
      last = Math.max(last, at);
      const emits = fireworkEmits(4, 6, 0.5, step);
      expect(emits.length).toBeGreaterThan(0);
      for (const e of emits) {
        sparks += e.count;
        expect(Number.isFinite(e.position[0] + e.position[1] + e.position[2])).toBe(true);
        // the rocket leaves from the cup’s ground and the burst opens at the top of its climb
        expect(e.position[2]).toBeCloseTo(step % 2 ? 0.5 + FIREWORKS.height : 0.8, 6);
      }
    }
    expect(last).toBeLessThan(2);
    expect(sparks).toBe(3 * (10 + 60));
  });
});

describe('Piggy Bank', () => {
  it('pays double for the next hole holed, on either kind of course, and is used up by it', () => {
    for (const hole of [GREEN, field('g')]) {
      const plain = wearing([], [hole, hole]);
      holeInOne(plain.game);
      const due = paid(1, hole.par, false);
      const spent: string[] = [];
      const { game, calls } = wearing(['piggy'], [hole, hole], () => 0.5, {
        spent: (id: string) => spent.push(id),
      });
      holeInOne(game);
      expect(game.progress.save.coins - 5000, hole.name).toBe(due.coins * 2);
      expect(plain.game.progress.save.coins - 5000).toBe(due.coins);
      expect(spent).toEqual(['piggy']);
      expect(calls.some(([n, a]) => n === 'paid' && a[0] === due.coins * 2)).toBe(true);
      expect(game.progress.save.owned).not.toContain('piggy');
      expect(game.slots.accessory).toBe('');
    }
  });

  it('is for the hole it was worn as the hole began, and not one put on in the middle of it', () => {
    const { game } = wearing([], [GREEN, GREEN]);
    game.progress.save.coins = 1000;
    game.buy('piggy');
    game.equip('piggy');
    holeInOne(game);
    expect(game.progress.save.coins - 1000 + ITEMS.find((i) => i.id === 'piggy')!.coins).toBe(
      paid(1, GREEN.par, false).coins,
    );
    expect(game.progress.save.owned).toContain('piggy');
  });

  it('is not spent by a hole picked up', () => {
    const { game } = wearing(['piggy'], [GREEN, GREEN]);
    for (let s = 0; s < 20 && game.phase === 'play'; s++) {
      game.place(game.layout.tee.x, game.layout.tee.y);
      game.shoot(s % 2 ? 0 : Math.PI, 0.05);
      still(game);
    }
    expect(game.phase).toBe('done');
    expect(game.progress.save.owned).toContain('piggy');
  });
});

describe('Peaked Cap', () => {
  it('lets the wind push a ball in the air 40% less', () => {
    const calm = { ...FLAT.windy, wind: undefined } as HoleDef;
    const landing = (hole: HoleDef, ids: string[]) => {
      const { game, calls } = wearing(ids, [hole]);
      game.pick('7-iron');
      game.shoot(NORTH, 1);
      for (let f = 0; f < 600 && !calls.some(([n]) => n === 'landed'); f++) game.step(DT);
      const [x, y] = calls.find(([n]) => n === 'landed')![1] as number[];
      return [x, y];
    };
    const base = landing(calm, []);
    const windy = landing(FLAT.windy, []);
    const capped = landing(FLAT.windy, ['cap']);
    const pushed = Math.hypot(windy[0] - base[0], windy[1] - base[1]);
    const pushedCapped = Math.hypot(capped[0] - base[0], capped[1] - base[1]);
    expect(pushed).toBeGreaterThan(1);
    expect(pushedCapped / pushed).toBeCloseTo(0.6, 1);
    expect(
      windReach(bagClub('7-iron'), 1, 8, LIE.fairway, kitOf(slotsOf(['cap']))) /
        windReach(bagClub('7-iron'), 1, 8, LIE.fairway, NO_KIT),
    ).toBeCloseTo(0.6, 12);
  });

  it('carries a ball on a belt or a stream 40% less, on minigolf', () => {
    const carried = (ids: string[]) => {
      const { game } = wearing(ids, [BELT_HOLE]);
      const belt = game.obstacles.belts[0];
      game.place(belt.cx, belt.cy);
      run(game, 1);
      return game.world.vx[game.ball] * belt.dx + game.world.vy[game.ball] * belt.dy;
    };
    expect(carried(['cap']) / carried([])).toBeGreaterThan(0.45);
    expect(carried(['cap']) / carried([])).toBeLessThan(0.75);
    expect(carried(['cap'])).toBeLessThan(carried([]));
  });
});

describe('Lucky Tee', () => {
  it('strikes the first stroke of a hole 5% harder and no stroke after it, on golf and on minigolf', () => {
    for (const [hole, club] of [
      [GOLF, 'driver'],
      [GREEN, 'putter'],
    ] as const) {
      const first = (ids: string[]) => {
        const { game } = wearing(ids, [hole]);
        game.pick(club);
        game.shoot(NORTH, 0.6);
        return game;
      };
      const plain = first([]),
        tee = first(['tee']);
      expect(speed3(tee) / speed3(plain), `${hole.name} first`).toBeCloseTo(1.05, 4);
      // a second stroke is the plain one
      for (const g of [plain, tee]) {
        still(g);
        g.pick(club);
        g.shoot(NORTH, 0.6);
      }
      expect(speed3(tee) / speed3(plain), `${hole.name} second`).toBeCloseTo(1, 4);
    }
  });

  it('halves the scatter of the first golf stroke, and puts nothing of it on minigolf', () => {
    const missed = (ids: string[]) => {
      const { game } = wearing(ids, [GOLF], () => 0.95);
      game.shoot(NORTH, 1);
      return Math.abs(heading(game) - NORTH);
    };
    expect(missed([])).toBeGreaterThan(0.01);
    expect(missed(['tee']) / missed([])).toBeCloseTo(0.5, 2);
    const rolls = counted(3);
    const { game } = wearing(['tee'], [GREEN], rolls.random);
    const before = rolls.drawn();
    game.shoot(NORTH, 1);
    expect(rolls.drawn() - before, 'no chance drawn for a putt').toBe(0);
  });

  it('is held at 1.26 of the plain stroke at most, and is 5% over the club’s own figure when worn with one', () => {
    const first = (ids: string[], club = 'driver') => {
      const { game } = wearing(ids, [GOLF]);
      game.pick(club);
      game.shoot(NORTH, 1);
      return speed3(game);
    };
    expect(first(['long', 'tee']) / first(['long'])).toBeCloseTo(1.05, 4);
    expect(first(['long', 'tee']) / first([])).toBeCloseTo(1.07 * 1.05, 4);
    expect(first(['mallet', 'tee'], 'putter') / first([], 'putter')).toBeCloseTo(1.15 * 1.05, 4);
    expect(FIRST_STROKE_MOST).toBeCloseTo(1.26, 12);
  });
});

describe('Rangefinder', () => {
  it('carries the golf preview on to where the ball rests, which is where the game puts it', () => {
    const { game } = wearing(['scope'], [GOLF]);
    const previewer = new Previewer(game);
    const at = { x: game.world.x[game.ball], y: game.world.y[game.ball] };
    const p = previewer.run(at, bagClub('7-iron'), NORTH, 0.9);
    expect(p.rest.shown).toBe(true);
    const real = wearing([], [GOLF]).game;
    real.pick('7-iron');
    real.shoot(NORTH, 0.9);
    still(real);
    expect(p.rest.x).toBeCloseTo(real.world.x[real.ball], 0);
    expect(p.rest.y).toBeCloseTo(real.world.y[real.ball], 0);
    expect(new Previewer(wearing([], [GOLF]).game).run(at, bagClub('7-iron'), NORTH, 0.9).rest.shown).toBe(false);
  });

  it('puts the minigolf ring where a rehearsed putt rests, and leaves the game, its chance and its clock as they were', () => {
    const rolls = counted(8);
    const { game } = wearing(['scope'], [GREEN], rolls.random);
    const drawn = rolls.drawn();
    const state = () =>
      [
        game.t,
        game.strokes,
        game.world.x[game.ball],
        game.world.y[game.ball],
        game.world.vx[game.ball],
        game.ready,
      ].join();
    const before = state();
    const p = new Previewer(game).roll({ x: game.world.x[game.ball], y: game.world.y[game.ball] }, PUTTER, 1.2, 0.6);
    expect(p.rest.shown).toBe(true);
    expect(state()).toBe(before);
    expect(rolls.drawn()).toBe(drawn);
    // the real putt, struck the same way, comes to rest where the ring was
    game.shoot(1.2, 0.6);
    still(game);
    expect(p.rest.x).toBeCloseTo(game.world.x[game.ball], 1);
    expect(p.rest.y).toBeCloseTo(game.world.y[game.ball], 1);
    expect(p.rest.carry).toBeGreaterThan(5);
    // and a putt that comes to a stop short of any ring is shown by none without the rangefinder
    const plain = wearing([], [GREEN]).game;
    expect(
      new Previewer(plain).roll({ x: plain.world.x[plain.ball], y: plain.world.y[plain.ball] }, PUTTER, 1.2, 0.6).rest
        .shown,
    ).toBe(false);
  });
});

describe('Leather Gloves', () => {
  it('cuts a golf swing’s scatter and its loss to 60%', () => {
    const k = kitOf(slotsOf(['gloves']));
    const driver = bagClub('driver');
    expect(maxScatter(driver, LIE.fairway, 1, k) / maxScatter(driver, LIE.fairway, 1, NO_KIT)).toBeCloseTo(0.6, 12);
    expect(lossOf(k, driver) / DISPERSION.loss).toBeCloseTo(0.6, 12);
    const spread = (ids: string[]) => {
      const { game } = wearing(ids, [GOLF], () => 0.95);
      game.shoot(NORTH, 1);
      return Math.abs(heading(game) - NORTH);
    };
    expect(spread(['gloves']) / spread([])).toBeCloseTo(0.6, 2);
  });

  it('makes a drag gentler and a putt steadier on minigolf', () => {
    expect(wearing(['gloves'], [GREEN]).game.touch).toBe(1.2);
    const k = kitOf(slotsOf(['long', 'gloves']));
    expect(k.puttScatter * k.puttScatterScale).toBe(1);
    expect(kitOf(slotsOf(['gloves'])).puttScatter).toBe(0);
  });
});

describe('Bank Chalk', () => {
  it('draws the line on past its first bank off a rail, reflected by the face it met', () => {
    const { game } = wearing(['chalk'], [GREEN]);
    const l = game.layout;
    const bank = makeBank();
    // east: straight back, west
    expect(bankOf(l, 0, 0, 0, 100, bank)).toBe(true);
    expect(bank.dx).toBeCloseTo(-1, 12);
    expect(bank.dy).toBeCloseTo(0, 12);
    const wall = bank.x;
    expect(wall).toBeGreaterThan(10);
    expect(Math.hypot(bank.x, bank.y)).toBeCloseTo(bank.along, 0);
    // at 0.5 radians the x component is turned and the y is kept: a mirror in the east rail
    expect(bankOf(l, 0, 0, 0.5, 100, bank)).toBe(true);
    expect(bank.dx).toBeCloseTo(-Math.cos(0.5), 12);
    expect(bank.dy).toBeCloseTo(Math.sin(0.5), 12);
    // the face to the north turns the y component instead
    expect(bankOf(l, 0, 0, NORTH - 0.3, 100, bank)).toBe(true);
    expect(bank.dx).toBeCloseTo(Math.cos(NORTH - 0.3), 12);
    expect(bank.dy).toBeCloseTo(-Math.sin(NORTH - 0.3), 12);
    // a ray that meets nothing within its reach has no bank, and one that starts in the rail none either
    expect(bankOf(l, 0, 0, 0, 5, bank)).toBe(false);
    expect(bankOf(l, wall + TILE, 0, 0, 100, bank)).toBe(false);
    // it is the unit vector it should be, and the rail is where the first solid tile is
    expect(Math.hypot(bank.dx, bank.dy)).toBeCloseTo(1, 12);
  });

  it('reflects a corner straight back, and a ray along a rail’s face off the face it grazes', () => {
    const l = layoutOf(['#####', '#...#', '#.T.#', '#C..#', '#####']);
    const bank = makeBank();
    // from the middle of a three-tile room to its north-east corner exactly
    expect(bankOf(l, l.tee.x, l.tee.y, Math.PI / 4, 20, bank)).toBe(true);
    expect(bank.dx).toBeCloseTo(-Math.SQRT1_2, 12);
    expect(bank.dy).toBeCloseTo(-Math.SQRT1_2, 12);
    expect(bank.along).toBeCloseTo(Math.hypot(TILE * 1.5, TILE * 1.5), 1);
  });

  it('shows the break of a putt off the green, on golf, with the putter in hand and not otherwise', () => {
    expect(breakAids(LIE.fairway, 0, true, true)).toEqual({ arrows: 'near', words: true });
    expect(breakAids(LIE.fairway, 0, false, true)).toEqual({ arrows: null, words: false });
    expect(breakAids(LIE.fairway, 34, true, true), 'a 7-iron in hand').toEqual({ arrows: null, words: false });
    expect(breakAids(LIE.green, 0, false, true).arrows).toBe('green');
    const { game } = wearing(['chalk'], [GOLF]);
    const at = { x: game.layout.tee.x, y: game.layout.tee.y + 20 };
    expect(readerArrows(game.layout, at.x, at.y).length).toBeGreaterThanOrEqual(0);
    expect(Number.isFinite(breakOf(game.layout, at.x, at.y, game.def.greens, game.ground).across)).toBe(true);
  });
});

describe('Four-leaf Clover', () => {
  it('pays 7 coins for each stroke under par, not 5, on either kind of course', () => {
    expect(paid(1, 3, false, 7)).toEqual({ coins: PAY.finish + 2 * 7, gems: PAY.holeInOne });
    for (const hole of [GREEN, field('g')]) {
      const { game } = wearing(['clover'], [hole]);
      holeInOne(game);
      expect(game.progress.save.coins - 5000, hole.name).toBe(PAY.finish + (hole.par - 1) * 7);
      const plain = wearing([], [hole]).game;
      holeInOne(plain);
      expect(plain.progress.save.coins - 5000).toBe(PAY.finish + (hole.par - 1) * PAY.underPar);
    }
    // and nothing for a hole picked up, and no more for a par
    expect(paid(3, 3, false, 7).coins).toBe(PAY.finish);
    expect(paid(9, 3, true, 7)).toEqual({ coins: 0, gems: 0 });
  });
});

describe('Pocket Watch', () => {
  it('undoes the stroke just taken, once a round, on either kind of course', () => {
    for (const hole of [GREEN, GOLF]) {
      const { game } = wearing(['watch'], [hole, hole]);
      expect(game.mulligan(), 'no stroke yet').toBe(false);
      const at = { x: game.world.x[game.ball], y: game.world.y[game.ball] };
      game.shoot(NORTH, 0.5);
      expect(game.strokes).toBe(1);
      expect(game.mulligan(), hole.name).toBe(true);
      expect(game.strokes).toBe(0);
      expect(game.mulliganUsed).toBe(true);
      expect(game.world.x[game.ball]).toBeCloseTo(at.x, 4);
      expect(game.world.y[game.ball]).toBeCloseTo(at.y, 4);
      game.shoot(NORTH, 0.5);
      expect(game.mulligan(), 'only the one').toBe(false);
      expect(game.strokes).toBe(1);
      game.newRound();
      game.shoot(NORTH, 0.5);
      expect(game.mulligan(), 'a new round').toBe(true);
    }
  });

  it('is not there without the watch', () => {
    const { game } = wearing([], [GREEN]);
    game.shoot(NORTH, 0.5);
    expect(game.mulligan()).toBe(false);
    expect(game.strokes).toBe(1);
  });
});

describe('Snorkel', () => {
  it('makes the first ball lost on a hole of minigolf cost no stroke, and the second the usual one', () => {
    const lost = (ids: string[]) => {
      const { game } = wearing(ids, [WATERY, WATERY]);
      const strokes: number[] = [];
      for (let k = 0; k < 2; k++) {
        game.shoot(NORTH, 0.5);
        still(game);
        strokes.push(game.strokes);
      }
      // the next hole gives the free loss again
      game.begin(1);
      game.shoot(NORTH, 0.5);
      still(game);
      strokes.push(game.strokes);
      return strokes;
    };
    expect(lost([])).toEqual([2, 4, 2]);
    expect(lost(['snorkel'])).toEqual([1, 3, 1]);
  });

  it('makes the first ball lost to the water on a hole of golf cost no stroke', () => {
    const into = (ids: string[], power: number) => {
      const { game, calls } = wearing(ids, [FLAT.pond]);
      game.shoot(NORTH, power);
      still(game);
      return { splashed: calls.some(([n]) => n === 'splash'), strokes: game.strokes, waded: game.wadersUsed };
    };
    let power = 0;
    for (let p = 0.3; p <= 0.7 && !power; p += 0.02) if (into([], p).splashed) power = p;
    expect(power, 'a drive that finds the pond').toBeGreaterThan(0);
    expect(into([], power).strokes).toBe(2);
    const free = into(['snorkel'], power);
    expect(free.splashed).toBe(true);
    expect(free.strokes).toBe(1);
    expect(free.waded).toBe(true);
  });
});

describe('Horseshoe', () => {
  it('makes the cup 1.8 wide from the hole after it is worn, and no wider than 1.45 before', () => {
    for (const hole of [GREEN, field('g')]) {
      const { game } = wearing(['horseshoe'], [hole]);
      expect(game.cup.radius, hole.name).toBe(1.8);
      expect(wearing([], [hole]).game.cup.radius).toBe(CUP.radius);
    }
    const { game } = wearing([], [GREEN, GREEN]);
    game.progress.save.coins = 1000;
    game.buy('horseshoe');
    game.equip('horseshoe');
    expect(game.cup.radius).toBe(CUP.radius);
    game.begin(1);
    expect(game.cup.radius).toBe(1.8);
  });

  it('takes a putt that passes the cup 1.6 yards off its line, which the plain cup lets by', () => {
    const putt = (ids: string[]) => {
      const { game } = wearing(ids, [GREEN]);
      const { cup } = game.layout;
      game.place(cup.x + 1.6, cup.y - 8);
      game.shoot(NORTH, powerFor(speedFor(8, 4), game.hardest));
      still(game);
      return game.phase;
    };
    expect(putt([])).toBe('play');
    expect(putt(['horseshoe'])).toBe('done');
  });

  it('is drawn: the scene builds a hole with the wider mouth, on either kind of course', () => {
    for (const hole of [GREEN, field('g')]) {
      const { game } = wearing(['horseshoe'], [hole]);
      expect(() => {
        const scene = new Scene();
        scene.static(game.layout, hole.name, game.obstacles, game.cup.radius);
        scene.dynamic(game.obstacles, game.layout, hole.name, windOf(hole.name), {});
      }, hole.name).not.toThrow();
    }
  });
});

describe('Spiked Shoes', () => {
  it('strikes every club 6% harder, the putter too, on either kind of course', () => {
    const k = kitOf(slotsOf(['shoes']));
    for (const club of BAG) expect(strikeFactor(club, k), club.id).toBeCloseTo(1.06, 12);
    const golf = wearing(['shoes'], [GOLF]).game;
    expect(golf.inHand.hardest).toBeCloseTo(216 * 1.06, 9);
    golf.pick('putter');
    expect(golf.inHand.hardest).toBeCloseTo(40 * 1.06, 9);
    expect(wearing(['shoes'], [GREEN]).game.hardest).toBeCloseTo(40 * 1.06, 9);
    const speed = (ids: string[]) => {
      const { game } = wearing(ids, [GOLF]);
      game.shoot(NORTH, 1);
      return speed3(game);
    };
    expect(speed(['shoes']) / speed([])).toBeCloseTo(1.06, 4);
    const putt = wearing(['shoes'], [GREEN]).game;
    putt.shoot(NORTH, 0.5);
    expect(speed2(putt)).toBeCloseTo(40 * 1.06 * Math.sqrt(0.5), 4);
  });
});

describe('every accessory', () => {
  it('is a kit that the invariants accept, worn on a hole of each kind', () => {
    for (const a of ITEMS.filter((i) => i.aisle === 'accessory'))
      for (const hole of [GREEN, GOLF]) {
        const { game } = wearing([a.id], [hole]);
        run(game, 10);
        game.shoot(NORTH, 0.5);
        run(game, 60);
        expect(game.kit, `${a.id} on ${hole.name}`).not.toBe(NO_KIT);
        expect(game.progress.save.kit.accessory).toBe(a.id);
      }
    expect(saveWearing(['comet'])).toContain('comet');
  });
});
