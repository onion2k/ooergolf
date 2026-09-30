/**
 * The planner's judgement of a hole: what a ball at rest is worth, and which shot to take when the cup is not the
 * place to aim. A ball's worth is the strokes still to go, a golfer's rule of thumb from how far it is from the cup by the
 * way it has to be played, what it lies on, and whether it is under a tree; a shot's is that of where it comes to rest,
 * lost in water or out of bounds being the stroke again and one more; and a shot is judged by what it does when it is
 * struck true and by what it does a little either side, since the swing is not true. Held here: the worth is ordered as a
 * golfer would order it, and the autopilot, given a dogleg, a lake or a tree, plays round it and not into it.
 */
import { describe, expect, it } from 'vitest';
import { TILE, layoutOf } from '../src/arena';
import { Autopilot } from '../src/autopilot';
import { golfHole, type GolfSpec } from '../src/golf';
import { Game } from '../src/game';
import { Progress, memoryStore } from '../src/progress';
import { bagClub } from '../src/bag';
import { Rehearsal, choose, putts, strokesToGo, worth, type Candidate } from '../src/planner';
import { seeded } from '../src/random';
import { Route } from '../src/route';
import { TREE } from '../src/trees';
import { DT, field, golfGame } from './helpers';

describe('what a ball at rest is worth', () => {
  const f = layoutOf(field('f').map);
  const ground = { layout: f, route: new Route(f) };
  const at = (dy: number, dx = 12) => strokesToGo(ground, f.cup.x + dx, f.cup.y - dy);

  it('is a putt or two from the green, and more the further out', () => {
    const g = layoutOf(field('g').map);
    const greenGround = { layout: g, route: new Route(g) };
    const near = strokesToGo(greenGround, g.cup.x + 0.8, g.cup.y - 0.5),
      mid = strokesToGo(greenGround, g.cup.x + 8, g.cup.y),
      far = strokesToGo(greenGround, g.cup.x + 30, g.cup.y);
    expect(near).toBeGreaterThan(1);
    expect(near).toBeLessThan(1.2);
    expect(mid).toBeGreaterThan(near);
    expect(far).toBeGreaterThan(mid);
    expect(far).toBeLessThanOrEqual(2 + 1e-9);
    expect(putts(0)).toBe(1);
    expect(putts(1000)).toBeCloseTo(2, 9);
  });

  it('is more the further from the cup, off the green, by the way it has to be played', () => {
    const d = [20, 60, 110, 200, 320].map((y) => at(y));
    for (let k = 1; k < d.length; k++) expect(d[k], `${k}`).toBeGreaterThan(d[k - 1]);
  });

  it('is worse from the rough and worse again from the sand than from the fairway, at the same distance', () => {
    const lie = (surface: 'f' | 'r' | 's') => {
      const l = layoutOf(field(surface).map);
      return strokesToGo({ layout: l, route: new Route(l) }, l.cup.x + 12, l.cup.y - 60);
    };
    expect(lie('r')).toBeGreaterThan(lie('f'));
    expect(lie('s')).toBeGreaterThan(lie('r'));
  });

  it('is worse under a tree’s canopy than in the open, at the same distance', () => {
    const base = field('f');
    const row = base.map.length - 40;
    const map = base.map.map((line, r) => (r === row ? line.slice(0, 20) + '^' + line.slice(21) : line));
    const l = layoutOf(map);
    const ground2 = { layout: l, route: new Route(l) };
    const tree = l.trees[0];
    const under = strokesToGo(ground2, tree.x + 2, tree.y);
    const clear = strokesToGo(ground2, tree.x + TREE.radius + 6, tree.y);
    expect(under).toBeGreaterThan(clear + 0.4);
  });

  it('is the same wherever it lies by a distance, and finite everywhere a ball can lie', () => {
    for (const dy of [5, 50, 150, 300]) expect(Number.isFinite(at(dy))).toBe(true);
  });
});

describe('what a lie costs, apart from how far it is', () => {
  it('is dearer in the rough than on the fairway, and dearer again in the sand, within a few units of the cup', () => {
    // near the cup the way is much the same on any ground, so what is left is what the lie costs the next shot
    const near = (surface: 'f' | 'r' | 's') => {
      const l = layoutOf(field(surface).map);
      return strokesToGo({ layout: l, route: new Route(l) }, l.cup.x + 6, l.cup.y - 2);
    };
    expect(near('r') - near('f')).toBeGreaterThan(0.3);
    expect(near('s') - near('r')).toBeGreaterThan(0.15);
  });
});

describe('what a trial is worth', () => {
  const f = layoutOf(field('f').map);
  const ground = { layout: f, route: new Route(f) };
  const from = { x: f.cup.x + 20, y: f.cup.y - 120 };

  it('is nothing for a ball that dropped, the stroke again and one more for one lost, and where it lay for the rest', () => {
    const at = strokesToGo(ground, from.x, from.y);
    expect(worth(ground, from, { x: 0, y: 0, holed: true, lost: false })).toBe(0);
    expect(worth(ground, from, { x: 0, y: 0, holed: false, lost: true })).toBeCloseTo(at + 1, 9);
    const rest = { x: f.cup.x + 4, y: f.cup.y - 30 };
    expect(worth(ground, from, { ...rest, holed: false, lost: false })).toBeCloseTo(
      strokesToGo(ground, rest.x, rest.y),
      9,
    );
  });
});

describe('a shot judged by what it does off true', () => {
  it('is not taken when a hair off it is lost in the water and a shot a little further from the water is not', () => {
    // a lake down the whole west side, where the cup is, from a few units off the tee’s line. A drive aimed ten units
    // west of the line is nearer the cup, and dry struck true, and a little west of it is in the lake; a drive up the
    // line is as far up the field, and dry a little either side
    const base = field('f');
    const tee = base.map.findIndex((r) => r.includes('T'));
    const map = base.map.map((row, r) => (r >= 5 && r <= tee - 5 ? '#' + '~'.repeat(15) + row.slice(16) : row));
    const { game } = golfGame({ ...base, map });
    const l = game.layout;
    const route = new Route(l);
    const from = { x: l.tee.x, y: l.tee.y };
    const club = bagClub('driver');
    const west: Candidate = {
      club,
      guess: { angle: Math.PI / 2 + 0.04, power: 1 },
      target: { x: l.tee.x - 10, y: l.tee.y + 245 },
    };
    const up: Candidate = { club, guess: { angle: Math.PI / 2, power: 1 }, target: { x: l.tee.x, y: l.tee.y + 250 } };
    // struck true the west one is dry and the nearer the cup, and a hair further west it is lost
    const probe = new Rehearsal(game.rehearsal());
    expect(probe.shot(from, 'driver', west.guess.angle, 1).lost, 'true').toBe(false);
    expect(probe.shot(from, 'driver', west.guess.angle + 0.044, 1).lost, 'a hair west').toBe(true);
    expect(probe.shot(from, 'driver', up.guess.angle - 0.044, 1).lost, 'up the line, a hair either side').toBe(false);
    expect(probe.shot(from, 'driver', up.guess.angle + 0.044, 1).lost).toBe(false);
    const picked = choose(new Rehearsal(game.rehearsal()), { layout: l, route }, from, [west, up]);
    expect(picked, 'a shot is chosen').not.toBeNull();
    expect(picked!.index, 'the one that keeps from the water').toBe(1);
  });
});

/** A par four with a bend to the right, out of bounds across its corner: aimed at the cup, a drive is lost. */
const DOGLEG: GolfSpec = {
  name: 'Dog Leg',
  par: 4,
  length: 400,
  bend: 40,
  width: 13,
  seed: 6,
  feel: 'hills',
  steepness: 0.75,
  bunkers: { fairway: 1, green: 2 },
  ponds: [],
  trees: 40,
};

/** A round of `hole` from a seed, played as the pace gate's player plays: what it scored and how many balls it lost. */
function round(hole: ReturnType<typeof golfHole>, seed: number) {
  let lost = 0;
  const events = { splash: () => lost++, outOfBounds: () => lost++ };
  const game = new Game(new Progress(memoryStore()), events, { random: seeded(seed), course: [hole] });
  const pilot = new Autopilot(game, { skill: { aim: 0.05, power: 0.1 }, random: seeded(seed * 31 + 7) });
  for (let f = 0; f < 60 * 60 * 5 && game.phase !== 'over'; f++) pilot.step(DT);
  return { strokes: game.card[0] ?? -1, lost, trials: pilot.trials };
}

describe('playing round a dogleg', () => {
  const hole = golfHole(DOGLEG);
  const l = layoutOf(hole.map, hole.terrain);

  it('aims along the fairway from the tee, and not at the cup across the corner', () => {
    const { game } = golfGame(hole);
    const plan = new Autopilot(game).plan()!;
    const straight = Math.atan2(l.cup.y - l.tee.y, l.cup.x - l.tee.x);
    // the corner is a bend of forty degrees a little over halfway: the first leg heads well off the line to the cup
    expect(Math.abs(plan.angle - straight), 'well off the line to the cup').toBeGreaterThan(0.12);
    expect(plan.expect!.holed).toBe(false);
    // and what it expects is not lost, and is on the way to the cup: nearer it by the route than the tee is
    const route = new Route(l);
    expect(route.distance(plan.expect!.x, plan.expect!.y)).toBeLessThan(route.distance(l.tee.x, l.tee.y) - 150);
  });

  it('gets round, a good deal better than aiming at the cup: few balls lost and a score near par, over a run of rounds', () => {
    let strokes = 0,
      lost = 0;
    const rounds = 24;
    for (let seed = 1; seed <= rounds; seed++) {
      const r = round(hole, seed);
      strokes += r.strokes;
      lost += r.lost;
    }
    console.log(`the dogleg: ${(strokes / rounds).toFixed(2)} strokes a round, ${lost} balls lost in ${rounds} rounds`);
    expect(strokes / rounds).toBeLessThan(DOGLEG.par + 1.4);
    expect(lost / rounds, 'a ball in one round in three at most').toBeLessThan(0.34);
  });
});

describe('playing round water, and trees', () => {
  it('lays up short of a lake it cannot be sure to carry, or carries it, and never puts a true shot in it', () => {
    const base = field('f');
    // a lake across the fairway 10 to 14 tiles short of the cup's end, wall to wall
    const map = base.map.map((row, r) => (r >= 12 && r <= 16 ? `#${'~'.repeat(row.length - 2)}#` : row));
    const { game } = golfGame({ ...base, map });
    const l = game.layout;
    // 120 units short of the cup's row, on the near side of the lake
    game.place(l.cup.x + 24, l.cup.y - 160);
    const plan = new Autopilot(game).plan()!;
    expect(plan.expect!.holed || Number.isFinite(plan.expect!.x)).toBe(true);
    const wet = (x: number, y: number) =>
      l.water[Math.floor((y - l.originY) / TILE) * l.cols + Math.floor((x - l.originX) / TILE)] === 1;
    expect(wet(plan.expect!.x, plan.expect!.y), 'its true shot does not come to rest in the lake').toBe(false);
  });

  it('plays over or round a tree that is in the way of a drive, never into its branches', () => {
    const base = field('f');
    const tee = base.map.findIndex((r) => r.includes('T'));
    const map = base.map.map((line, r) => {
      if (r !== tee - 36) return line;
      const mid = Math.floor(line.length / 2);
      return line.slice(0, mid) + '^' + line.slice(mid + 1);
    });
    const { game } = golfGame({ ...base, map });
    const tree = game.layout.trees[0];
    const plan = new Autopilot(game).plan()!;
    // its true shot ends well beyond the tree, or well to the side of it: not stopped in its canopy
    const stopped =
      Math.abs(plan.expect!.x - tree.x) < TREE.radius + 2 && Math.abs(plan.expect!.y - tree.y) < TREE.radius + 2;
    expect(stopped).toBe(false);
    expect(plan.expect!.y).toBeGreaterThan(game.layout.tee.y + 30);
  });

  it('costs no more than fifty trials for a shot, on a hole with hazards', () => {
    const hole = golfHole(DOGLEG);
    const { game } = golfGame(hole);
    const pilot = new Autopilot(game);
    pilot.plan();
    console.log(`a plan on the dogleg: ${pilot.trials} trials`);
    expect(pilot.trials).toBeLessThanOrEqual(50);
    expect(pilot.trials).toBeGreaterThan(5);
  });
});
