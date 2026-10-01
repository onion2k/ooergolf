/**
 * The route: how far a ball is from the cup by the way it would have to be played, round the water, the out of bounds
 * and the trees that are between, and where along that way to aim. What the planner knows of a hole's shape: on a
 * dogleg the cup is not where the ball should be aimed, and a lay-up is a place on the way, not a place on the line.
 */
import { describe, expect, it } from 'vitest';
import { TILE, layoutOf, lieAt } from '../src/arena';
import { golfHole, type GolfSpec } from '../src/golf';
import { Route } from '../src/route';
import { LIE } from '../src/surfaces';
import { TREE } from '../src/trees';
import { field } from './helpers';

const SPEC: GolfSpec = {
  name: 'Route Four',
  par: 4,
  length: 400,
  bend: 40,
  width: 13,
  seed: 6,
  feel: 'hills',
  steepness: 0.75,
  bunkers: { fairway: 1, green: 1 },
  ponds: [{ at: 0.7, side: 1, size: [3, 4] }],
  trees: 60,
};
const hole = golfHole(SPEC);
const layout = layoutOf(hole.map, hole.terrain);
const route = new Route(layout);

describe('the route to the cup', () => {
  it('is nothing at the cup and grows away from it, and is about the way of play from the tee: a hole’s length', () => {
    expect(route.distance(layout.cup.x, layout.cup.y)).toBeLessThan(TILE);
    const fromTee = route.distance(layout.tee.x, layout.tee.y);
    expect(fromTee).toBeGreaterThan(400 * 0.95);
    expect(fromTee).toBeLessThan(400 * 1.15);
    // longer than the crow flies, which a dogleg is
    expect(fromTee).toBeGreaterThan(Math.hypot(layout.cup.x - layout.tee.x, layout.cup.y - layout.tee.y) + 5);
  });

  it('goes by the fairway round a bend, not across the corner: a point on the way is on the fairway', () => {
    let onWay = 0,
      total = 0;
    for (let d = 20; d < 380; d += 20) {
      const w = route.waypoint(layout.tee.x, layout.tee.y, d);
      total++;
      const lie = lieAt(layout, w.x, w.y);
      if (lie === LIE.fairway || lie === LIE.green || lie === LIE.tee || lie === LIE.cut) onWay++;
    }
    expect(onWay / total, 'most of the way is fairway').toBeGreaterThan(0.75);
  });

  it('is never over water, out of bounds, rock, or under a tree’s canopy', () => {
    let at = { x: layout.tee.x, y: layout.tee.y };
    for (let step = 0; step < 60; step++) {
      const w = route.waypoint(at.x, at.y, 8);
      const t = Math.floor((w.y - layout.originY) / TILE) * layout.cols + Math.floor((w.x - layout.originX) / TILE);
      expect(layout.water[t], 'water').toBe(0);
      expect(layout.oob[t], 'out of bounds').toBe(0);
      expect(layout.solid[t], 'rock').toBe(0);
      for (const tr of layout.trees)
        expect(Math.hypot(w.x - tr.x, w.y - tr.y), 'a canopy').toBeGreaterThan(TREE.radius * 0.8);
      at = w;
    }
  });

  it('shortens by about the distance gone, step by step along it, to the cup', () => {
    let at = { x: layout.tee.x, y: layout.tee.y };
    let was = route.distance(at.x, at.y);
    for (let step = 0; step < 200; step++) {
      const w = route.waypoint(at.x, at.y, 10);
      const now = route.distance(w.x, w.y);
      expect(now, `step ${step}`).toBeLessThan(was + 0.5);
      if (now < 1) break;
      was = now;
      at = w;
    }
    expect(was).toBeLessThan(TILE * 3);
  });

  it('is the cup itself when the cup is nearer than the distance asked', () => {
    const w = route.waypoint(layout.cup.x + 8, layout.cup.y - 4, 500);
    expect(Math.hypot(w.x - layout.cup.x, w.y - layout.cup.y)).toBeLessThan(TILE);
  });

  it('is infinite from ground it cannot come from: out of bounds and water are not on a way', () => {
    const wet = layout.water.findIndex((w) => w === 1);
    const x = layout.originX + ((wet % layout.cols) + 0.5) * TILE,
      y = layout.originY + (Math.floor(wet / layout.cols) + 0.5) * TILE;
    // a ball can be nowhere in water, and a point out of bounds, though it is a ball’s to come back from, has no way from it
    expect(Number.isFinite(route.distance(x, y))).toBe(false);
    expect(Number.isFinite(route.distance(layout.originX - 100, layout.originY - 100))).toBe(false);
  });

  it('keeps to the fairway on a straight field, a straight line from the ball to the cup', () => {
    const f = layoutOf(field('f').map);
    const r = new Route(f);
    const from = { x: f.cup.x + 30, y: f.cup.y - 90 };
    const d = r.distance(from.x, from.y);
    const crow = Math.hypot(from.x - f.cup.x, from.y - f.cup.y);
    // eight ways of stepping over tiles is within a twelfth of the straight line, over ground that is all one kind
    expect(d).toBeGreaterThan(crow * 0.98);
    expect(d).toBeLessThan(crow * 1.09);
  });

  it('goes round out of bounds across the field, and round a row of trees, which are longer ways than the line', () => {
    const base = field('f');
    // a band of out of bounds across the field, wall to wall but for a gap at the east, away from the cup in the west
    const oob = layoutOf(base.map.map((row, r) => (r >= 50 && r <= 60 ? `#${'x'.repeat(row.length - 4)}ff#` : row)));
    const straight = Math.hypot(oob.tee.x - oob.cup.x, oob.tee.y - oob.cup.y);
    // the way is over tiles, eight ways, which is a twelfth longer than the line before it goes round anything: round is a fifth
    expect(new Route(oob).distance(oob.tee.x, oob.tee.y), 'round out of bounds').toBeGreaterThan(straight * 1.15);
    // and a row of trees across it, a canopy wide each, with a gap at the east
    const trees = layoutOf(
      base.map.map((row, r) => {
        if (r !== 55) return row;
        const cells = row.split('');
        for (let c = 1; c < row.length - 4; c += 2) cells[c] = '^';
        return cells.join('');
      }),
    );
    expect(trees.trees.length).toBeGreaterThan(10);
    expect(new Route(trees).distance(trees.tee.x, trees.tee.y), 'round the trees').toBeGreaterThan(straight * 1.15);
  });

  it('goes round a lake across the field, which is a longer way than the line', () => {
    const base = field('f');
    // a lake in the middle of the field, wall to wall but for a gap at the east, away from the cup, which is in the west
    const map = base.map.map((row, r) => (r >= 50 && r <= 60 ? `#${'~'.repeat(row.length - 4)}ff#` : row));
    const f = layoutOf(map);
    const r = new Route(f);
    const from = { x: f.tee.x, y: f.tee.y };
    const straight = Math.hypot(from.x - f.cup.x, from.y - f.cup.y);
    expect(r.distance(from.x, from.y)).toBeGreaterThan(straight * 1.15);
    // and the first way point toward the cup does not point at the water
    const w = r.waypoint(from.x, from.y, 60);
    const t = Math.floor((w.y - f.originY) / TILE) * f.cols + Math.floor((w.x - f.originX) / TILE);
    expect(f.water[t]).toBe(0);
  });
});

describe('the first cut on the route', () => {
  /** A 40-tile fairway whose middle ten rows are of one ground, the rest fairway: the way from the north end to the cup at the south. */
  const wayOver = (ground: 'f' | 'c' | 'r') => {
    const base = field('f', 60, 41);
    const map = base.map.map((line, r) =>
      r >= 20 && r < 40 ? line.slice(0, 1) + ground.repeat(39) + line.slice(40) : line,
    );
    const l = layoutOf(map);
    return new Route(l).distance(l.cup.x + 6, l.cup.y - 150);
  };

  it('is dearer to play over than the fairway and cheaper than the rough, along the same distance', () => {
    const fairway = wayOver('f'),
      cut = wayOver('c'),
      rough = wayOver('r');
    expect(cut).toBeGreaterThan(fairway);
    expect(cut).toBeLessThan(rough);
  });
});
