/**
 * A wood with a gap: a dogleg's corner is planted so that a drive cutting it is stopped by the trees, with one lane from
 * the tee to a landing on the second leg's fairway cleared. What is held here is the lane itself (a driver struck true
 * along it flies clean and comes down on the shelf made for it; struck a few degrees to either side it meets the wood),
 * that no other line over the wood is open, that no trunk stands closer to the lane than its width asks, that the way
 * round the wood is still joined and still the route, and that the spec is refused by name where a lane cannot be cut.
 * Without these a wood could be planted across the lane, or leave a line through that was not the lane, and a hole with
 * a gap would be only a hole with trees.
 */
import { describe, expect, it } from 'vitest';
import { TILE, heightAt, layoutOf, lieAt } from '../src/arena';
import { golfHole, laneOf, WOOD, type GolfSpec } from '../src/golf';
import { Route } from '../src/route';
import { seeded } from '../src/random';
import { LIE } from '../src/surfaces';
import { TREE } from '../src/trees';
import { DT, golfGame } from './helpers';

/** The Pinewood of the plan: a dogleg right of 50 degrees, the corner half way along 420 yards, a lane landing 255 yards out. */
const SPEC: GolfSpec = {
  name: 'The Pinewood',
  par: 4,
  length: 420,
  bend: 50,
  corner: 0.5,
  width: 12,
  seed: 7,
  feel: 'hills',
  steepness: 0.6,
  bunkers: { fairway: 1, green: 2 },
  ponds: [],
  trees: 40,
  wind: 0,
  contour: 0.6,
  greens: 13,
  heighten: 1.5,
  gap: { to: 255 },
};
const hole = golfHole(SPEC);
const lane = laneOf(hole)!;
const layout = layoutOf(hole.map, hole.terrain);
const AIM = Math.atan2(lane.to.y - lane.from.y, lane.to.x - lane.from.x);
const LENGTH = Math.hypot(lane.to.x - lane.from.x, lane.to.y - lane.from.y);
const DEG = Math.PI / 180;

/** What a driver struck at `angle` does: knocks before it first came down, where that was, and whether it was lost. */
function drive(angle: number, random: () => number = () => 0.5, power = 1) {
  const { game, calls } = golfGame(hole, random);
  game.pick('driver');
  game.shoot(angle, power);
  for (let f = 0; f < 60 * 20; f++) {
    game.step(DT);
    if (f > 1 && game.ready) break;
  }
  const first = calls.findIndex(([name, args]) => name === 'landed' && args[3] === true);
  const before = first < 0 ? calls : calls.slice(0, first);
  const at = first < 0 ? null : { x: calls[first][1][0] as number, y: calls[first][1][1] as number };
  return {
    knocks: before.filter(([name]) => name === 'knocked').length,
    at,
    lost: calls.some(([n]) => n === 'outOfBounds'),
  };
}

/** How far (x, y) is from the lane's segment, in yards, and which side of it, positive to its left. */
function fromLane(x: number, y: number): { d: number; side: number; u: number } {
  const lx = lane.to.x - lane.from.x,
    ly = lane.to.y - lane.from.y;
  const u = ((x - lane.from.x) * lx + (y - lane.from.y) * ly) / (lx * lx + ly * ly);
  const k = Math.max(0, Math.min(1, u));
  const cross = lx * (y - lane.from.y) - ly * (x - lane.from.x);
  return { d: Math.hypot(x - lane.from.x - lx * k, y - lane.from.y - ly * k), side: Math.sign(cross), u: u * LENGTH };
}

describe('a gap in a spec', () => {
  it('is refused by name on a bend under thirty-five degrees, a width out of its range and a target not on the second leg', () => {
    expect(() => golfHole({ ...SPEC, bend: 30 })).toThrow(/gap.*35/);
    expect(() => golfHole({ ...SPEC, bend: 0 })).toThrow(/gap.*35/);
    expect(() => golfHole({ ...SPEC, gap: { to: 255, width: 2 } })).toThrow(/gap.*yards clear/);
    expect(() => golfHole({ ...SPEC, gap: { to: 255, width: 40 } })).toThrow(/gap.*yards clear/);
    // 150 yards straight is short of the corner at 210; 410 is past the cup's end of the second leg
    expect(() => golfHole({ ...SPEC, gap: { to: 150 } })).toThrow(/gap's target/);
    expect(() => golfHole({ ...SPEC, gap: { to: 410 } })).toThrow(/gap's target/);
  });

  it('is nothing to a hole without one: no lane, and the hole is what it was', () => {
    const plain = golfHole({ ...SPEC, gap: undefined });
    expect(laneOf(plain)).toBeUndefined();
    expect(golfHole({ ...SPEC, gap: undefined }).map).toEqual(plain.map);
  });

  it('works on a bend to the left too, the wood on the inside of that corner', () => {
    const left = golfHole({ ...SPEC, name: 'Left Hand', bend: -50, gap: { to: 255 } });
    const l = laneOf(left)!;
    const lay = layoutOf(left.map, left.terrain);
    expect(l.to.x).toBeLessThan(l.from.x);
    expect(lay.trees.length).toBeGreaterThan(
      golfHole({ ...SPEC, name: 'Left Hand', bend: -50, gap: undefined })
        .map.join('')
        .split('^').length - 1,
    );
  });
});

describe('the lane', () => {
  it('runs from the tee to the target on the second leg, the length the spec says, and is kept by the hole, not in it', () => {
    expect(lane.from.x).toBeCloseTo(layout.tee.x, 6);
    expect(lane.from.y).toBeCloseTo(layout.tee.y, 6);
    // 255 yards straight, to a tile
    expect(Math.abs(LENGTH - 255)).toBeLessThan(TILE * 1.5);
    expect(lane.width).toBe(8);
    expect(Object.keys(hole).sort()).toEqual(Object.keys(golfHole({ ...SPEC, gap: undefined })).sort());
  });

  it('ends on the second leg: past the corner, which is straight up from the tee, on its fairway', () => {
    const corner = { x: layout.tee.x, y: layout.tee.y + 210 };
    const bend = (SPEC.bend * Math.PI) / 180;
    const rx = lane.to.x - corner.x,
      ry = lane.to.y - corner.y;
    const along = rx * Math.sin(bend) + ry * Math.cos(bend);
    const across = Math.abs(rx * Math.cos(bend) - ry * Math.sin(bend));
    expect(along, 'on the second leg').toBeGreaterThan(30);
    expect(across, 'on its fairway').toBeLessThan(6 * TILE);
    expect([LIE.fairway, LIE.cut]).toContain(lieAt(layout, lane.to.x, lane.to.y));
  });

  it('lands on a shelf: the ground there is level, a disc of four tiles', () => {
    const heights: number[] = [];
    for (let dx = -TILE * 3; dx <= TILE * 3; dx += TILE)
      for (let dy = -TILE * 3; dy <= TILE * 3; dy += TILE)
        if (Math.hypot(dx, dy) <= TILE * 3) heights.push(heightAt(layout, lane.to.x + dx, lane.to.y + dy));
    expect(Math.max(...heights) - Math.min(...heights)).toBeLessThan(0.01);
  });

  it('has no trunk within half its width and a canopy’s base of its line, and the wood is a wood, not a handful of trees', () => {
    const near = layout.trees.map((t) => fromLane(t.x, t.y)).filter((p) => p.u > -TILE && p.u < LENGTH + 20);
    expect(Math.min(...near.map((p) => p.d))).toBeGreaterThanOrEqual(lane.keep - 1e-6);
    expect(lane.keep).toBe(lane.width / 2 + WOOD.base);
    // the wood is the trees there are beyond the forty scattered
    expect(
      layout.trees.length -
        golfHole({ ...SPEC, gap: undefined })
          .map.join('')
          .split('^').length +
        1,
    ).toBeGreaterThan(30);
  });

  it('is as wide as it was asked: the nearest trunks either side leave the width clear between the canopies’ bases, and little more', () => {
    const per = layout.trees.map((t) => fromLane(t.x, t.y)).filter((p) => p.u > 0 && p.u < LENGTH);
    const left = Math.min(...per.filter((p) => p.side > 0).map((p) => p.d));
    const right = Math.min(...per.filter((p) => p.side < 0).map((p) => p.d));
    // the trunks are 21 yards apart, so 10 clear of the canopies' 5.5 and 7.9 clear of a ball's middle at the base
    const clear = left + right - 2 * TREE.radius;
    expect(clear).toBeGreaterThanOrEqual(lane.width);
    expect(clear).toBeLessThan(lane.width + 2 * TILE);
  });

  it('keeps every trunk of the wood off the fairway by a tile and a half, in the rough', () => {
    const fairway = (x: number, y: number) => {
      for (let dx = -2; dx <= 2; dx++)
        for (let dy = -2; dy <= 2; dy++)
          if (Math.hypot(dx, dy) <= 1.5 && lieAt(layout, x + dx * TILE, y + dy * TILE) === LIE.fairway) return true;
      return false;
    };
    for (const t of layout.trees) {
      expect([LIE.rough, LIE.cut]).toContain(lieAt(layout, t.x, t.y));
      expect(fairway(t.x, t.y), `the tree at ${t.x}, ${t.y}`).toBe(false);
    }
  });

  it('is clear to a driver: struck true along it, a drive meets no canopy and comes down on the shelf on the second leg', () => {
    const r = drive(AIM);
    expect(r.knocks).toBe(0);
    expect(r.lost).toBe(false);
    expect(r.at).not.toBeNull();
    expect(Math.hypot(r.at!.x - lane.to.x, r.at!.y - lane.to.y), 'on the shelf').toBeLessThan(TILE * 4);
    expect([LIE.fairway, LIE.cut]).toContain(lieAt(layout, r.at!.x, r.at!.y));
  });

  it('is a gap and not a hole in the wood: the same drive six degrees to either side meets it', () => {
    for (const side of [-1, 1]) {
      const r = drive(AIM + side * 6 * DEG);
      expect(r.knocks, `${side * 6} degrees`).toBeGreaterThan(0);
    }
  });

  it('is the only way across the corner: every line the other side of it from the tee into the wood meets a canopy', () => {
    // to the right of the lane, which is the side of the corner, from two degrees (the lane's own width) to the rough's far edge
    const open: number[] = [];
    for (let d = 2; d <= 30; d += 0.5)
      if (drive(AIM - d * DEG).knocks === 0 && !drive(AIM - d * DEG).lost) open.push(d);
    expect(open, 'degrees to the right with nothing in the way').toEqual([]);
  });

  it('is not a way round to the left either, near it: a line within six degrees of it on that side meets the wood', () => {
    const open: number[] = [];
    for (let d = 2; d <= 6; d += 0.5) if (drive(AIM + d * DEG).knocks === 0 && !drive(AIM + d * DEG).lost) open.push(d);
    expect(open, 'degrees to the left with nothing in the way').toEqual([]);
  });
});

describe('the way round', () => {
  it('is still joined: the generator’s own check, a route three tiles wide from the tee to the cup, held by the hole being made', () => {
    // golfHole refuses a wood that leaves none (`joined`), and the route from the tee to the cup is there and about the hole’s length
    const route = new Route(layout);
    const d = route.distance(layout.tee.x, layout.tee.y);
    expect(d).toBeGreaterThan(380);
    expect(d).toBeLessThan(450);
  });

  it('goes through the lane for a ball that is on it: every point of the lane has a route on, none under a canopy, shorter the further along', () => {
    const route = new Route(layout);
    let last = route.distance(layout.tee.x, layout.tee.y);
    for (const u of [60, 120, 180, 240]) {
      const x = lane.from.x + ((lane.to.x - lane.from.x) * u) / LENGTH,
        y = lane.from.y + ((lane.to.y - lane.from.y) * u) / LENGTH;
      const d = route.distance(x, y);
      expect(Number.isFinite(d), `${u} yards along`).toBe(true);
      expect(d).toBeLessThan(last);
      last = d;
    }
  });

  it('is shorter across the corner than round it, by what the corner’s geometry allows: the lane then the route from its end', () => {
    const route = new Route(layout);
    const round = route.distance(layout.tee.x, layout.tee.y);
    const across = LENGTH + route.distance(lane.to.x, lane.to.y);
    // the legs are 210 and 210 at fifty degrees: 255 straight to a point 63 along the second saves 18 yards of the 273, and no
    // lane can save forty on this corner (the whole of the second leg at its far end saves 39)
    expect(round - across).toBeGreaterThan(5);
    expect(round - across).toBeLessThan(25);
  });

  it('is the same for every seed’s hole: a wood is planted in no way chance chooses, so the scattered trees are the hole’s own', () => {
    const a = golfHole(SPEC);
    expect(a.map).toEqual(hole.map);
    expect(Array.from(a.terrain as Float32Array)).toEqual(Array.from(hole.terrain as Float32Array));
  });
});

describe('what the lane is to a swing', () => {
  it('is threaded by about one full drive in two with the swing’s own scatter (an estimate: 0.45 to 0.52 over 200 swings of three seeds)', () => {
    const random = seeded(11);
    let clean = 0;
    const swings = 120;
    for (let n = 0; n < swings; n++) {
      const r = drive(AIM, random);
      if (r.knocks === 0 && !r.lost) clean++;
    }
    expect(clean / swings).toBeGreaterThan(0.3);
    expect(clean / swings).toBeLessThan(0.7);
  });

  it('keeps a canopy’s own figures to what the plan was written from: a base 5.5 wide and a trunk 0.9', () => {
    expect(TREE.radius).toBe(5.5);
    expect(TREE.trunk).toBe(0.9);
  });
});
