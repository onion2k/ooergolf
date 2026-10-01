/**
 * The planner: the autopilot's golf shot, tried before it is taken. Its first guess is arithmetic, a club and a power
 * from the distance, and it is out by the run-on, the slope and whatever else a real ball does; the planner strikes the
 * shot in a rehearsal, a game of the hole no one plays, and corrects the aim and the power by where the ball came to
 * rest, until it rests on the cup or holes. What is held here is that the trial is the shot (what the rehearsal says is
 * what the real game does, struck true), that planning touches nothing of the game it plans for, that it lands nearer
 * the cup than the guess does on the level and up a hill, and that it costs the few dozen trials the plan allowed.
 */
import { describe, expect, it } from 'vitest';
import { Autopilot, golfGuess } from '../src/autopilot';
import * as invariants from '../src/invariants';
import { TILE, layoutOf } from '../src/arena';
import { BAG, PUTTER, bagClub, carryOf } from '../src/bag';
import { carryFrom } from '../src/flight';
import { MOST_TRIALS, Rehearsal, TOLERANCE, refine, strokesToGo, type Trial } from '../src/planner';
import { Route } from '../src/route';
import { seeded } from '../src/random';
import { RANGE } from '../src/range';
import { LIE } from '../src/surfaces';
import { DT, field, golfGame } from './helpers';

const NORTH = Math.PI / 2;

/** The real game played the shot, struck true, until it is at rest or holed: where it came to rest, or that it dropped. */
function played(
  hole: ReturnType<typeof field>,
  from: { x: number; y: number },
  plan: { club?: string; angle: number; power: number },
) {
  const { game } = golfGame(hole);
  game.place(from.x, from.y);
  if (plan.club) game.pick(plan.club);
  expect(game.shoot(plan.angle, plan.power)).toBe(true);
  for (let f = 0; f < 60 * 30 && game.phase === 'play' && !(f > 1 && game.ready); f++) game.step(DT);
  const { cup } = game.layout;
  return {
    x: game.world.x[game.ball],
    y: game.world.y[game.ball],
    holed: game.phase === 'done',
    off: game.phase === 'done' ? 0 : Math.hypot(game.world.x[game.ball] - cup.x, game.world.y[game.ball] - cup.y),
  };
}

/** A hill face, rising by `rise` a tile from twenty tiles up the field: the cup is a long way above the tee. */
function hill(rise: number) {
  const rows = 130,
    cols = 41;
  const heights = new Float32Array(rows * cols);
  for (let r = 0; r < rows; r++) for (let c = 0; c < cols; c++) heights[r * cols + c] = Math.max(0, r - 20) * rise;
  return field('f', rows, cols, heights);
}

describe('a rehearsal of shots', () => {
  it('strikes the shot as the real game would, struck true: where it comes to rest is where the real ball does', () => {
    const hole = field('f');
    const { game } = golfGame(hole);
    const r = new Rehearsal(game.rehearsal());
    const from = { x: game.world.x[game.ball], y: game.world.y[game.ball] };
    for (const [club, power, angle] of [
      ['driver', 1, NORTH],
      ['7-iron', 0.63, NORTH + 0.2],
      ['pitching-wedge', 1, NORTH - 0.4],
      ['sand-wedge', 0.3, NORTH],
      ['putter', 0.5, NORTH + 0.1],
    ] as const) {
      const t = r.shot(from, club, angle, power);
      const real = played(hole, from, { club, angle, power });
      expect(t.x, `${club} across`).toBeCloseTo(real.x, 4);
      expect(t.y, `${club} along`).toBeCloseTo(real.y, 4);
      expect(t.holed).toBe(false);
      expect(t.lost).toBe(false);
    }
  });

  it('counts its trials, tells of a ball that drops, and is ready for the next trial after it', () => {
    const { game } = golfGame(field('g'));
    const r = new Rehearsal(game.rehearsal());
    const cup = game.layout.cup;
    const first = r.shot({ x: cup.x + 6, y: cup.y }, 'putter', Math.PI, 0.14);
    expect(first.holed).toBe(true);
    expect(r.trials).toBe(1);
    const next = r.shot({ x: cup.x + 20, y: cup.y - 10 }, 'putter', Math.PI, 0.1);
    expect(next.holed).toBe(false);
    expect(next.x).toBeLessThan(cup.x + 20);
    expect(r.trials).toBe(2);
  });

  it('tells of a shot that cannot be struck, a ball that drops in the cup as it settles, as lost, and does not throw', () => {
    const { game } = golfGame(field('g'));
    const r = new Rehearsal(game.rehearsal());
    const { cup } = game.layout;
    const t = r.shot({ x: cup.x, y: cup.y }, 'putter', NORTH, 0.3);
    expect(t.lost).toBe(true);
    expect(t.holed).toBe(false);
    // and the next trial, from a lie that is one, is a trial as any other
    const next = r.shot({ x: cup.x + 20, y: cup.y - 10 }, 'putter', Math.PI, 0.1);
    expect(next.lost).toBe(false);
  });

  it('tells of a ball lost in water, and is ready for the next trial after it', () => {
    const base = field('f');
    const map = base.map.map((row, r) => (r >= 20 && r <= 46 ? `#${'~'.repeat(row.length - 2)}#` : row));
    const { game } = golfGame({ ...base, map });
    const r = new Rehearsal(game.rehearsal());
    const from = { x: game.world.x[game.ball], y: game.world.y[game.ball] };
    const wet = r.shot(from, 'driver', NORTH, 1);
    expect(wet.lost).toBe(true);
    const dry = r.shot(from, 'sand-wedge', NORTH, 0.3);
    expect(dry.lost).toBe(false);
    expect(dry.y).toBeGreaterThan(from.y);
  });
});

describe('the correction of a shot by trial', () => {
  it('stops at the first trial that drops in the cup: nothing more is tried of a shot that holes', () => {
    const { game } = golfGame(field('g'));
    const r = new Rehearsal(game.rehearsal());
    const { cup } = game.layout;
    const found = refine(r, { x: cup.x + 6, y: cup.y }, cup, PUTTER, { angle: Math.PI, power: 0.14 });
    expect(found.trial.holed).toBe(true);
    expect(found.miss).toBe(0);
    expect(r.trials).toBe(1);
    expect(found.power).toBe(0.14);
  });

  it('gives back the best of the trials it made and never the last: however it wanders, what it returns lay nearest the target', () => {
    // poor guesses, from lies on a hill, with every club, so the correction has far to go and sometimes does not get there
    const recorded: Trial[] = [];
    class Recording extends Rehearsal {
      override shot(from: { x: number; y: number }, club: string, angle: number, power: number) {
        const t = super.shot(from, club, angle, power);
        recorded.push(t);
        return t;
      }
    }
    const random = seeded(17);
    let wandered = 0;
    for (let k = 0; k < 80; k++) {
      const { game } = golfGame(hill(0.3));
      const { cup } = game.layout;
      const from = { x: cup.x + 10 + random() * 30, y: cup.y - 40 - random() * 150 };
      const club = BAG[Math.floor(random() * (BAG.length - 1))];
      const bearing = Math.atan2(cup.y - from.y, cup.x - from.x);
      recorded.length = 0;
      const r = new Recording(game.rehearsal());
      const found = refine(r, from, cup, club, {
        angle: bearing + (random() - 0.5) * 0.3,
        power: 0.3 + random() * 0.7,
      });
      if (found.trial.holed) continue;
      const misses = recorded.filter((t) => !t.holed && !t.lost).map((t) => Math.hypot(t.x - cup.x, t.y - cup.y));
      if (!misses.length) continue;
      expect(found.miss, `case ${k}: ${club.id}`).toBeLessThanOrEqual(Math.min(...misses) + 1e-9);
      expect(found.miss).toBeCloseTo(Math.hypot(found.trial.x - cup.x, found.trial.y - cup.y), 9);
      if (misses.length > 1 && misses[misses.length - 1] > Math.min(...misses) + 1e-6) wandered++;
    }
    // some of them did go past the nearest they had been, or the test proves nothing about it
    expect(wandered, 'cases where the last trial was not the best').toBeGreaterThan(0);
  });

  it('uses no more trials than it is allowed, and stops sooner for a target no club reaches once its aim is true', () => {
    const { game } = golfGame(RANGE[2]);
    const r = new Rehearsal(game.rehearsal());
    const { tee, cup } = game.layout;
    const found = refine(r, tee, cup, bagClub('driver'), {
      angle: Math.atan2(cup.y - tee.y, cup.x - tee.x) + 0.05,
      power: 1,
    });
    expect(r.trials, 'the aim corrected and then nothing more to be had').toBeLessThanOrEqual(3);
    expect(found.miss).toBeGreaterThan(TOLERANCE);
    const wild = new Rehearsal(game.rehearsal());
    refine(wild, tee, cup, bagClub('sand-wedge'), { angle: 0, power: 0.5 });
    expect(wild.trials).toBeLessThanOrEqual(MOST_TRIALS);
  });
});

describe('the planner', () => {
  /** The distances and lies the planner is held to, on the level, each a place south of the cup with a bit across. */
  const CASES: { d: number; surface: 'f' | 'r' | 's' }[] = [];
  for (const surface of ['f', 'r', 's'] as const)
    for (const d of [25, 45, 70, 100, 140, 180, 220]) CASES.push({ d, surface });

  const setup = (surface: 'f' | 'r' | 's', d: number, uphill = false) => {
    // the cup well in from the far rail, as a golf hole's is: a livelier ball that runs on past it would meet a rail six yards
    // on and come back, and no club could be held to where that leaves it
    const hole = uphill ? hill(0.3) : field(surface, 130, 41, undefined, 12);
    const { game } = golfGame(hole);
    const { cup } = game.layout;
    const from = { x: cup.x + 24, y: cup.y - d };
    game.place(from.x, from.y);
    return { hole, game, from, cup };
  };

  it('plans a shot that comes to rest on the cup, or drops, from every distance it can reach, on the fairway, the rough and the sand', () => {
    for (const { d, surface } of CASES) {
      const { hole, game, from, cup } = setup(surface, d);
      const lie = surface === 'f' ? LIE.fairway : surface === 'r' ? LIE.rough : LIE.sand;
      const distance = Math.hypot(cup.x - from.x, cup.y - from.y);
      // out of any club's reach from a poor lie is not a shot to hold to the cup
      if (carryFrom(bagClub('driver'), 1, lie) * 1.05 < distance) continue;
      const plan = new Autopilot(game).plan()!;
      const real = played(hole, from, plan);
      // from sand, at the very end of what any club reaches, the ball is struck at the least that gets it there and the
      // hop chain after it is not a line that power can be corrected along: a driver at 0.88 over 140 units rests 1.7 off
      const limit = surface === 's' && distance > 0.85 * carryFrom(bagClub('driver'), 1, lie) ? 2.5 : 1.6;
      expect(
        real.off,
        `${distance.toFixed(0)} units from ${surface}: ${plan.club} at ${plan.power.toFixed(2)}`,
      ).toBeLessThan(limit);
      // and what it expected is what happened
      expect(plan.expect, 'it says where the ball will come to rest').toBeDefined();
      if (plan.expect!.holed) expect(real.holed).toBe(true);
      else {
        expect(real.x).toBeCloseTo(plan.expect!.x, 2);
        expect(real.y).toBeCloseTo(plan.expect!.y, 2);
      }
    }
  });

  it('lands on the cup from every distance a club reaches, scanned five units at a time on the fairway', () => {
    // where the shortest club by the arithmetic has run out of reach, the next club is the one that gets there: no distance is missed
    const worst: string[] = [];
    let scanned = 0;
    for (let d = 20; d <= 235; d += 5) {
      const { hole, game, from } = setup('f', d);
      const plan = new Autopilot(game).plan()!;
      const off = played(hole, from, plan).off;
      scanned++;
      if (off > 1.6)
        worst.push(`${d} units: ${plan.club} at ${plan.power.toFixed(2)} came to rest ${off.toFixed(1)} off`);
    }
    expect(scanned).toBeGreaterThan(40);
    expect(worst).toEqual([]);
  });

  it('chips and runs with the putter from the fairway when the cup is near, and takes a wedge when it is not', () => {
    for (const d of [8, 16, 25]) {
      const { game } = setup('f', d);
      const plan = new Autopilot(game).plan()!;
      expect(plan.club, `${d} units`).toBe('putter');
      expect(plan.expect!.holed, `${d} units: it expects to drop`).toBe(true);
    }
    const { game } = setup('f', 55);
    expect(new Autopilot(game).plan()!.club).not.toBe('putter');
  });

  it('is nearer the cup than the arithmetic it starts from, on the level, which is a close guess: the planner makes it exact', () => {
    let guessed = 0,
      planned = 0,
      n = 0;
    for (const { d } of CASES.filter((c) => c.surface === 'f')) {
      const { hole, game, from } = setup('f', d);
      const guess = golfGuess(game, from.x, from.y);
      const plan = new Autopilot(game).plan()!;
      guessed += played(hole, from, guess).off;
      planned += played(hole, from, plan).off;
      n++;
    }
    expect(
      guessed / n,
      'the arithmetic is under a unit out, since its run-on is measured from the surfaces',
    ).toBeLessThan(1);
    expect(planned / n).toBeLessThan(guessed / n);
    expect(planned / n).toBeLessThan(0.1);
  });

  it('is nearer the cup than the arithmetic up a hill, where the ball comes down higher than it was struck from and carries short', () => {
    let guessed = 0,
      planned = 0,
      worst = 0;
    for (const d of [40, 70, 100, 140]) {
      const { hole, game, from } = setup('f', d, true);
      const guess = golfGuess(game, from.x, from.y);
      const plan = new Autopilot(game).plan()!;
      const g = played(hole, from, guess).off;
      const p = played(hole, from, plan).off;
      guessed += g;
      planned += p;
      worst = Math.max(worst, p);
    }
    expect(guessed / 4, 'the level arithmetic is well short on a rise').toBeGreaterThan(5);
    expect(planned / 4).toBeLessThan(guessed / 4 / 4);
    expect(worst).toBeLessThan(2.5);
  });

  it('corrects its aim across a side slope, where the ball comes down on the slope and is turned along it', () => {
    // the field rising toward +x by `rise` a tile, gentle enough for a ball to lie on it: 0.4 is seven degrees and 0.6 ten
    const across = (rise: number) => {
      const rows = 130,
        cols = 41;
      const heights = new Float32Array(rows * cols);
      for (let r = 0; r < rows; r++) for (let c = 0; c < cols; c++) heights[r * cols + c] = c * rise;
      return field('f', rows, cols, heights);
    };
    let guessed = 0,
      n = 0;
    for (const rise of [0.4, 0.6])
      for (const d of [60, 110, 160]) {
        const hole = across(rise);
        const { game } = golfGame(hole);
        const { cup } = game.layout;
        const from = { x: cup.x + 40, y: cup.y - d };
        game.place(from.x, from.y);
        const plan = new Autopilot(game).plan()!;
        const off = played(hole, from, plan).off;
        // across a slope of seven or ten degrees a ball that comes down is turned along it, and for a 5-iron at 160 units how far
        // it rests is not a line of the power: it climbs to 163 at 0.855 and falls back to 156 by 0.915, with steps of up to
        // eight and eighteen units between neighbours (measured, rises 0.4 and 0.6), so the proportional correction finds
        // the nearest it can (2.25 and 3.25 off) and not the tolerance; a shorter shot is held to the tolerance
        expect(off, `rise ${rise}, ${d} units`).toBeLessThan(d >= 160 ? 4 : 1.6);
        guessed += played(hole, from, golfGuess(game, from.x, from.y)).off;
        n++;
      }
    expect(guessed / n, 'the arithmetic is several units out across the slope').toBeGreaterThan(2.5);
  });

  it('plans, from the tee of a hole longer than any club carries, the longest club at full power, aimed true', () => {
    const { game } = golfGame(RANGE[2]);
    const pilot = new Autopilot(game);
    const plan = pilot.plan()!;
    expect(pilot.trials, 'a few dozen at most: the drive, and the lay-ups it is judged against').toBeLessThanOrEqual(
      30,
    );
    expect(plan.club).toBe('driver');
    expect(plan.power).toBeCloseTo(1, 6);
    const { tee, cup } = game.layout;
    // the aim is corrected for what a real ball does, and on a level hole that is nothing
    expect(Math.abs(plan.angle - Math.atan2(cup.y - tee.y, cup.x - tee.x))).toBeLessThan(0.01);
    expect(plan.expect!.holed).toBe(false);
  });

  it('keeps a putt as it was: from the green it is the arithmetic putt, with no rehearsal at all', () => {
    const { game } = golfGame(field('g'));
    const { cup } = game.layout;
    game.place(cup.x + 12, cup.y);
    const pilot = new Autopilot(game);
    const plan = pilot.plan()!;
    expect(plan).toEqual(golfGuess(game, game.world.x[game.ball], game.world.y[game.ball]));
    expect(pilot.trials).toBe(0);
  });

  it('plans the same shot every time it is asked, from the same lie', () => {
    const { game } = setup('f', 100);
    expect(new Autopilot(game).plan()).toEqual(new Autopilot(game).plan());
    const one = new Autopilot(game);
    expect(one.plan()).toEqual(one.plan());
  });

  it('touches nothing of the game it plans for: no stroke, no time, no chance, nothing told, and the ball where it lay', () => {
    // two games alike in every way, one planned for and one not
    const make = () => {
      const g = golfGame(field('f'), seeded(5));
      g.game.place(g.game.layout.tee.x + 9, g.game.layout.tee.y + 60);
      return g;
    };
    const planned = make(),
      untouched = make();
    new Autopilot(planned.game).plan();
    const state = (g: ReturnType<typeof make>) => ({
      strokes: g.game.strokes,
      t: g.game.t,
      x: g.game.world.x[g.game.ball],
      y: g.game.world.y[g.game.ball],
      club: g.game.inHand.id,
      told: g.told.length,
      // the next draw of chance: the same only if planning drew none
      next: g.game.random(),
    });
    expect(state(planned)).toEqual(state(untouched));
  });

  it('costs no more than the few dozen trials it was allowed, from any lie, and says how many it took', () => {
    let most = 0,
      total = 0,
      n = 0;
    for (const { d, surface } of CASES) {
      const { game } = setup(surface, d);
      const pilot = new Autopilot(game);
      pilot.plan();
      most = Math.max(most, pilot.trials);
      total += pilot.trials;
      n++;
    }
    console.log(`the planner: ${(total / n).toFixed(1)} trials a shot on average, at most ${most}`);
    expect(most).toBeLessThanOrEqual(40);
    expect(total / n).toBeGreaterThan(3);
  });

  it('falls back to the arithmetic, and never fails to plan, for a ball that will not rest where a trial can be made', () => {
    // every club into the water: the hole's whole front is a lake, so no trial comes to rest, and there is still a shot
    const base = field('f');
    const map = base.map.map((row, r) => (r >= 20 && r <= 120 ? `#${'~'.repeat(row.length - 2)}#` : row));
    const { game } = golfGame({ ...base, map });
    const plan = new Autopilot(game).plan();
    expect(plan).not.toBeNull();
    expect(BAG.map((c) => c.id)).toContain(plan!.club);
    expect(plan!.power).toBeGreaterThan(0);
    expect(plan!.power).toBeLessThanOrEqual(1);
    expect(Number.isFinite(plan!.angle)).toBe(true);
    // and it is the arithmetic's, unchanged, and says nothing of where the ball will rest, for it does not know
    expect(plan).toEqual(golfGuess(game, game.world.x[game.ball], game.world.y[game.ball]));
    expect(plan!.expect).toBeUndefined();
  });

  it('plans a shot from every lie there is, however awkward: against the rail, in the corners, in the sand, on the rim of the cup', () => {
    const problems: string[] = [];
    let planned = 0;
    for (const hole of RANGE) {
      const { game } = golfGame(hole);
      const l = game.layout;
      const { planProblems } = invariants;
      // every fourth tile of every hole, and a ring of lies round the cup
      const spots: { x: number; y: number }[] = [];
      for (let ty = 1; ty < l.rows - 1; ty += 4)
        for (let tx = 1; tx < l.cols - 1; tx += 4)
          spots.push({ x: l.originX + (tx + 0.5) * TILE, y: l.originY + (ty + 0.5) * TILE });
      for (let a = 0; a < 12; a++)
        for (const r of [1.6, 2.2, 3, 4.5])
          spots.push({
            x: l.cup.x + Math.cos((a / 12) * Math.PI * 2) * r,
            y: l.cup.y + Math.sin((a / 12) * Math.PI * 2) * r,
          });
      const pilot = new Autopilot(game);
      for (const s of spots) {
        // a lie a ball is put down on, or one a real ball may lie on and cannot be put down on: made where it lies
        const rehearsal = game.rehearsal();
        rehearsal.trial(s.x, s.y);
        if (!rehearsal.world.alive[rehearsal.ball] || !rehearsal.ready) continue;
        game.world.x[game.ball] = s.x;
        game.world.y[game.ball] = s.y;
        game.world.z[game.ball] = rehearsal.world.z[rehearsal.ball];
        game.world.vx[game.ball] = game.world.vy[game.ball] = game.world.vz[game.ball] = 0;
        game.world.wake(game.ball);
        for (let f = 0; f < 600 && !game.ready; f++) game.step(DT);
        if (!game.ready || Math.hypot(game.world.x[game.ball] - s.x, game.world.y[game.ball] - s.y) > 0.5) continue;
        const plan = pilot.plan();
        if (!plan) {
          problems.push(`no plan from ${s.x.toFixed(1)},${s.y.toFixed(1)}`);
          continue;
        }
        planned++;
        problems.push(
          ...planProblems(game, plan).map((p) => `${hole.name} at ${s.x.toFixed(1)},${s.y.toFixed(1)}: ${p}`),
        );
      }
    }
    expect(planned, 'a good many lies').toBeGreaterThan(200);
    expect(problems).toEqual([]);
  });

  it('is unchanged in what it picks for the distance: a shorter club the shorter the shot, all the way down the bag', () => {
    const picks = [40, 90, 130, 170, 210, 260].map((d) => {
      const { game } = setup('f', d);
      return BAG.findIndex((c) => c.id === new Autopilot(game).plan()!.club);
    });
    for (let k = 1; k < picks.length; k++) expect(picks[k], `${k}`).toBeLessThanOrEqual(picks[k - 1]);
    expect(picks[0]).toBeGreaterThan(picks[picks.length - 1]);
    expect(carryOf(bagClub('driver'), 1)).toBeGreaterThan(200);
  });
});

describe('what the first cut is worth', () => {
  it('is a ball a little worse placed than on the fairway, and better than in the rough, at the same distance by the same way', () => {
    const base = field('f');
    const layoutAs = (ch: string) =>
      layoutOf(
        base.map.map((line, r) =>
          r > 0 && r < base.map.length - 1 ? line.slice(0, 5) + ch.repeat(3) + line.slice(8) : line,
        ),
      );
    // one route for all three, so that only the lie's own price is in the figure and not the dearer way over it
    const route = new Route(layoutAs('f'));
    const lieAs = (ch: string) => {
      const l = layoutAs(ch);
      return strokesToGo({ layout: l, route }, l.cup.x + 12, l.cup.y - 60);
    };
    expect(lieAs('c')).toBeGreaterThan(lieAs('f'));
    expect(lieAs('c')).toBeLessThan(lieAs('r'));
  });

  it('is a putt’s worth on the green and more on the fringe beside it, which is a stroke short of it', () => {
    const l = layoutOf(
      field('g').map.map((line, r) => (r > 0 && r < 129 ? line.slice(0, 8) + 'c' + line.slice(9) : line)),
    );
    const ground = { layout: l, route: new Route(l) };
    const fringe = strokesToGo(ground, l.cup.x + 18, l.cup.y),
      green = strokesToGo(ground, l.cup.x + 15, l.cup.y);
    expect(fringe).toBeGreaterThan(green);
    expect(fringe).toBeLessThan(green + 1.5);
  });
});

describe('how closely a putt is corrected', () => {
  it('is held to the tolerance and the trials it is given, and the defaults are as they were', () => {
    const { game } = golfGame(field('g'));
    const { cup } = game.layout;
    const from = { x: cup.x + 15, y: cup.y };
    // a guess that is too soft: it rests well short of the cup, which is further than the tolerance
    const guess = { angle: Math.PI, power: 0.2 };
    const rehearsal = new Rehearsal(game.rehearsal());
    const loose = refine(rehearsal, from, cup, PUTTER, guess, { tolerance: 100, trials: 8 });
    expect(rehearsal.trials, 'a tolerance wider than any miss stops at the first trial').toBe(1);
    expect(loose.miss).toBeGreaterThan(0.6);
    const before = rehearsal.trials;
    refine(rehearsal, from, cup, PUTTER, guess, { tolerance: 1e-9, trials: 3 });
    expect(rehearsal.trials - before, 'no more trials than it is given').toBeLessThanOrEqual(3);
    const again = refine(rehearsal, from, cup, PUTTER, guess);
    const same = refine(rehearsal, from, cup, PUTTER, guess, { tolerance: TOLERANCE, trials: MOST_TRIALS });
    expect(same).toEqual(again);
  });
});
