/**
 * The route: how far a ball is from the cup by the way it would have to be played, round the water, the out of bounds
 * and the trees that are between, and where along that way to aim. What the planner knows of a hole's shape: on a
 * dogleg the cup is not where the ball should be aimed, and a lay-up is a place on the way, not a place on the line.
 */
import { describe, expect, it } from 'vitest';
import { TILE, layoutOf, lieAt } from '../src/arena';
import { golfHole, type GolfSpec } from '../src/golf';
import { Route } from '../src/route';
import { links } from '../src/links';
import { LIE } from '../src/surfaces';
import { TREE } from '../src/trees';
import { golfLayUps } from '../src/autopilot';
import { field, golfGame } from './helpers';

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

/** FNV-1a over a stream of 32-bit words, which is what a snapshot of a flood is held to. */
function fnv(words: Iterable<number>): string {
  let h = 0x811c9dc5;
  for (const w of words) {
    for (let s = 0; s < 32; s += 8) h = Math.imul(h ^ ((w >>> s) & 255), 0x01000193);
  }
  return (h >>> 0).toString(16);
}

/** A hole's route as it is held: the distance at every tile's middle, and waypoints from a spread of tiles at three lengths. */
function snapshot(l: ReturnType<typeof layoutOf>): { distance: string; waypoints: string } {
  const r = new Route(l);
  const f32 = new Float32Array(1),
    u32 = new Uint32Array(f32.buffer);
  const bits = (v: number) => ((f32[0] = v), u32[0]);
  const mid = (tx: number, ty: number) => [l.originX + (tx + 0.5) * TILE, l.originY + (ty + 0.5) * TILE] as const;
  const distances: number[] = [];
  for (let ty = 0; ty < l.rows; ty++)
    for (let tx = 0; tx < l.cols; tx++) distances.push(bits(r.distance(...mid(tx, ty))));
  const points: number[] = [];
  for (let ty = 0; ty < l.rows; ty += 7)
    for (let tx = 0; tx < l.cols; tx += 5)
      for (const along of [9, 40, 130]) {
        const w = r.waypoint(...mid(tx, ty), along);
        points.push(bits(w.x), bits(w.y));
      }
  return { distance: fnv(distances), waypoints: fnv(points) };
}

/**
 * What the flood was before it could cross water, held on the nine holes of The Links, which have none of their land cut
 * off: a route that flies over water must leave every one of them to the bit.
 */
const LINKS_ROUTES: Record<string, { distance: string; waypoints: string }> = {
  'The Opener': { distance: '19bfae55', waypoints: 'a9368855' },
  'Water Carry': { distance: 'fc4fd9e1', waypoints: 'c6f7ddfa' },
  'Long Bend': { distance: '3dc3d5ad', waypoints: 'c442768f' },
  'Tight Left': { distance: '9d3ad082', waypoints: '563bb38' },
  'Island Green': { distance: '31d9ac5d', waypoints: '8250f67e' },
  'Rushing Brook': { distance: '799d7bad', waypoints: 'a327c847' },
  'The Big Dogleg': { distance: '4f317d9f', waypoints: 'b6708fd0' },
  'The Straight Mile': { distance: '439f1d30', waypoints: '5d2677f6' },
  'Home Stretch': { distance: 'e04b8e5d', waypoints: '465c3501' },
};

describe('the route on a hole whose land is all joined', () => {
  for (const h of links()) {
    it(`is what it was on ${h.name}`, () => {
      const got = snapshot(layoutOf(h.map, h.terrain));
      expect(got).toEqual(LINKS_ROUTES[h.name]);
    });
  }
});

describe('a route that flies over water', () => {
  /** A field with its water drawn in: rows from `from` to `to` of the map are a lake wall to wall but for `gap` columns at the east, and `island` is rows and columns of land in it. */
  const lake = (
    rows: number,
    from: number,
    to: number,
    opts: { gap?: number; island?: [number, number, number, number] } = {},
  ) => {
    const base = field('f', rows, 41);
    const [r0, r1, c0, c1] = opts.island ?? [-1, -1, -1, -1];
    const map = base.map.map((row, r) => {
      if (r < from || r > to) return row;
      const cells = row.split('');
      for (let c = 1; c < row.length - 1 - (opts.gap ?? 0); c++) cells[c] = '~';
      if (r >= r0 && r <= r1) for (let c = c0; c <= c1; c++) cells[c] = 'f';
      return cells.join('');
    });
    return { base, map, layout: layoutOf(map) };
  };
  const at = (l: ReturnType<typeof layoutOf>, x: number, y: number) =>
    Math.floor((y - l.originY) / TILE) * l.cols + Math.floor((x - l.originX) / TILE);
  /** The middle of the tile of map column `c` and row `r` (the map is drawn from the north). */
  const middle = (l: ReturnType<typeof layoutOf>, c: number, r: number) => ({
    x: l.originX + (c + 0.5) * TILE,
    y: l.originY + (l.rows - 1 - r + 0.5) * TILE,
  });

  it('gives the island and the far shore a finite distance, less than a way round, and water none', () => {
    // a lake right across the field with an island in it: the shore at the tee is cut off from the cup
    const { layout: l } = lake(60, 20, 40, { island: [28, 32, 2, 38] });
    const r = new Route(l);
    const tee = r.distance(l.tee.x, l.tee.y);
    const crow = Math.hypot(l.tee.x - l.cup.x, l.tee.y - l.cup.y);
    expect(Number.isFinite(tee)).toBe(true);
    // flown over, at the fairway's cost: the eight ways of stepping, and no more
    expect(tee).toBeLessThan(crow * 1.09);
    expect(tee).toBeGreaterThan(crow * 0.98);
    const island = middle(l, 11, 30);
    expect(l.water[at(l, island.x, island.y)]).toBe(0);
    expect(Number.isFinite(r.distance(island.x, island.y))).toBe(true);
    expect(r.distance(island.x, island.y)).toBeLessThan(tee);
    // the far shore, which was joined to the cup before, is no further from it for the water
    const shore = middle(l, 20, 15);
    expect(Number.isFinite(r.distance(shore.x, shore.y))).toBe(true);
    // and not a point of water has a distance, for a ball is never on it
    let wet = 0;
    for (let t = 0; t < l.cols * l.rows; t++) {
      if (!l.water[t]) continue;
      wet++;
      const w = { x: l.originX + ((t % l.cols) + 0.5) * TILE, y: l.originY + (Math.floor(t / l.cols) + 0.5) * TILE };
      expect(r.distance(w.x, w.y), `water at ${t}`).toBe(Infinity);
    }
    expect(wet).toBeGreaterThan(300);
  });

  it('flies over water that has a way round when some land is cut off, shorter than the way round', () => {
    // a gap of water-free land at the east, and an island in the lake: the island is cut off, so the route may fly
    const round = lake(60, 20, 40, { gap: 3 }).layout;
    const flown = lake(60, 20, 40, { gap: 3, island: [28, 32, 2, 30] }).layout;
    const byLand = new Route(round).distance(round.tee.x, round.tee.y);
    const byAir = new Route(flown).distance(flown.tee.x, flown.tee.y);
    // all joined: the way is round the lake, and flooded as it was
    expect(byLand).toBeGreaterThan(Math.hypot(round.tee.x - round.cup.x, round.tee.y - round.cup.y) * 1.15);
    expect(byAir).toBeLessThan(byLand * 0.9);
  });

  it('is exactly what it was where the only land cut off is a lone tile', () => {
    const { map } = lake(60, 20, 40, { gap: 3 });
    // one tile of rough on a pond's edge, with nothing joining it: not an island to fly to
    const dotted = map.map((row, r) => (r === 30 ? row.slice(0, 10) + 'f' + row.slice(11) : row));
    const was = new Route(layoutOf(map));
    const now = new Route(layoutOf(dotted));
    expect(now.distance(layoutOf(dotted).tee.x, layoutOf(dotted).tee.y)).toBe(
      was.distance(layoutOf(map).tee.x, layoutOf(map).tee.y),
    );
  });

  it('never has a way point on water, from the tee or from the island, at any length', () => {
    const { layout: l } = lake(60, 20, 40, { island: [28, 32, 2, 38] });
    const r = new Route(l);
    const starts = [{ x: l.tee.x, y: l.tee.y }, middle(l, 11, 30), middle(l, 3, 45), middle(l, 30, 50)];
    for (const from of starts)
      for (let along = 1; along < 200; along += 3) {
        const w = r.waypoint(from.x, from.y, along);
        expect(l.water[at(l, w.x, w.y)], `from ${from.x},${from.y} along ${along}`).toBe(0);
      }
  });

  it('stops on the island where the reach ends over the lake, and on the far shore when the island is behind', () => {
    const { layout: l } = lake(60, 20, 40, { island: [28, 32, 2, 38] });
    const r = new Route(l);
    // from the near shore the lake is 11 tiles across (33 yd) and the island 4 tiles in: a reach to its middle stops there
    const from = middle(l, 15, 42);
    const w = r.waypoint(from.x, from.y, 3 * 14);
    const island = middle(l, 11, 30);
    expect(w.y).toBeGreaterThan(middle(l, 20, 33).y - 1);
    expect(w.y).toBeLessThan(middle(l, 20, 27).y + 1);
    // a reach that ends in the lake past the island goes on to the far shore, since the island is no way on
    const far = r.waypoint(island.x, island.y, 3 * 10);
    expect(l.water[at(l, far.x, far.y)]).toBe(0);
    expect(far.y).toBeGreaterThan(middle(l, 20, 20).y);
  });

  it('has a lay-up that is aimed at an island, where the club cannot reach the far shore', () => {
    // a lake 120 tiles across (360 yards), far more than the driver flies, with an island of eleven tiles deep (a strip with water at its ends) in the middle
    const { map, layout: l } = lake(200, 30, 150, { island: [85, 95, 2, 38] });
    const { game } = golfGame({ ...field('f', 200, 41), map });
    const route = new Route(l);
    const ball = middle(l, 20, 160);
    const ups = golfLayUps(game, route, ball.x, ball.y);
    expect(ups.length).toBeGreaterThan(0);
    for (const up of ups) {
      const t = at(l, up.target.x, up.target.y);
      expect(l.water[t], 'a lay-up in the lake').toBe(0);
    }
    const island = (x: number, y: number) =>
      x > l.originX && x < l.originX + 40 * TILE && y > middle(l, 0, 96).y && y < middle(l, 0, 84).y;
    expect(
      ups.some((u) => island(u.target.x, u.target.y)),
      'one on the island',
    ).toBe(true);
  });

  it('is no way across a lake with no island too wide to fly, a ball on land there still has a shot to take', () => {
    // the same lake without its island and with no gap: the flood still crosses, a waypoint is still land, never the lake
    const { layout: l } = lake(200, 30, 150);
    const r = new Route(l);
    const ball = middle(l, 20, 160);
    expect(Number.isFinite(r.distance(ball.x, ball.y))).toBe(true);
    for (let along = 5; along < 400; along += 17) {
      const w = r.waypoint(ball.x, ball.y, along);
      expect(l.water[at(l, w.x, w.y)], `along ${along}`).toBe(0);
    }
  });
});
