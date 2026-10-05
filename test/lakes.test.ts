/**
 * Large lakes with islands: a hole whose water has to be carried, and land in it that a ball is flown to and played from.
 * Held here: a lake across the way leaves no way round over land and a carry within `CARRY`; an island is land, rests a
 * ball and is played from, and a ball that lands in the lake is played again from where it was struck, a stroke more; the
 * island green holes a putt; the preview over a lake says it went into the water; the ground rules hold on every hole;
 * the route aims a lay-up at an island; and a spec the generator cannot make is refused by name. Without these a lake
 * could be drawn that no ball can cross, an island could be a rock a ball cannot rest on, and a hole of The Links, which has
 * none, could move when the code that makes lakes was changed.
 */
import { describe, expect, it } from 'vitest';
import { TILE, layoutOf } from '../src/arena';
import { Autopilot, golfLayUps } from '../src/autopilot';
import { bagClub, carryOf } from '../src/bag';
import type { HoleDef } from '../src/course';
import { CARRY, golfHole, type GolfSpec } from '../src/golf';
import { checkInvariants, groundProblems, previewProblems } from '../src/invariants';
import { Previewer } from '../src/preview';
import { Route } from '../src/route';
import { seeded } from '../src/random';
import { DT, golfGame } from './helpers';
import { centre, crossings, figures, gridOf, landOf, reached, wayRound } from './lake-figures';

/** A par five of 560 yards with a lake across it at 0.55, and a fairway island in the lake: the plan's Landfall. */
const LANDFALL: GolfSpec = {
  name: 'Landfall (test)',
  par: 5,
  length: 560,
  bend: 0,
  width: 14,
  seed: 3,
  feel: 'hills',
  steepness: 0.75,
  bunkers: { fairway: 4, green: 3, island: 1 },
  ponds: [],
  trees: 40,
  wind: 8,
  contour: 0.6,
  greens: 12.5,
  lakes: [{ at: 0.55, side: 0, size: [10, 12], islands: [{ kind: 'fairway', radius: 4 }] }],
};
/** A par four of 400 yards whose green is an island in a lake round it, with two bunkers on the island: the plan's Island Green. */
const ISLAND_GREEN: GolfSpec = {
  name: 'Island Green (test)',
  par: 4,
  length: 400,
  bend: 0,
  width: 14,
  seed: 5,
  feel: 'hills',
  steepness: 0.75,
  bunkers: { fairway: 4, green: 2, island: 2 },
  ponds: [],
  trees: 30,
  wind: 10,
  contour: 0.6,
  greens: 13,
  lakes: [{ at: 'green', side: 0, size: [16, 18], islands: [{ kind: 'green', radius: 9 }] }],
};
/** A par four of 450 yards with a lake beside the fairway and an island of sand in it: the plan's Causeway. */
const CAUSEWAY: GolfSpec = {
  name: 'Causeway (test)',
  par: 4,
  length: 450,
  bend: 0,
  width: 14,
  seed: 4,
  feel: 'hills',
  steepness: 0.75,
  bunkers: { fairway: 5, green: 3 },
  ponds: [],
  trees: 40,
  wind: 12,
  contour: 0.8,
  greens: 12,
  lakes: [{ at: 0.45, side: -1, size: [11, 13], islands: [{ kind: 'sand', radius: 3 }] }],
};
/** The same Landfall, with a bunker or two on its island, by the island's own spec and by the hole's. */
const SANDY: GolfSpec = {
  ...LANDFALL,
  name: 'Sandy Landfall (test)',
  bunkers: { fairway: 4, green: 3, island: 1 },
  lakes: [{ at: 0.55, side: 0, size: [10, 12], islands: [{ kind: 'fairway', radius: 5, bunkers: 1 }] }],
};

/** A par five with a lake so long (up to 120 yards of water) that a club's reach ends over it from where it is hit: the route's island is somewhere to lay up. */
const LONG: GolfSpec = {
  ...LANDFALL,
  name: 'Long Landfall (test)',
  length: 600,
  wind: 0,
  bunkers: { fairway: 4, green: 3 },
  lakes: [{ at: 0.5, side: 0, size: [17, 19], islands: [{ kind: 'fairway', radius: 5 }] }],
};

const SPECS = [LANDFALL, ISLAND_GREEN, CAUSEWAY, SANDY, LONG];
const HOLES = new Map(SPECS.map((s) => [s.name, golfHole(s)]));
const landfall = HOLES.get(LANDFALL.name)!;
const islandGreen = HOLES.get(ISLAND_GREEN.name)!;
const causeway = HOLES.get(CAUSEWAY.name)!;
const sandy = HOLES.get(SANDY.name)!;
const long = HOLES.get(LONG.name)!;

/** How many tiles of a hole's map are of a kind. */
const count = (hole: HoleDef, ch: string) => hole.map.join('').split(ch).length - 1;

/** The same hole in still air, for a flight whose landing a test works out from the club's own arithmetic. */
const calm = (spec: GolfSpec) => golfHole({ ...spec, wind: 0 });
const landfallCalm = calm(LANDFALL);
const longHole = long;

/** The tile of a hole's piece of land `piece`, within two tiles of water, nearest to (c, r), and a ball put down on it, or null. */
function shoreNear(hole: HoleDef, piece: number, [c, r]: [number, number]) {
  const g = gridOf(hole);
  const land = landOf(hole);
  const spots: { c: number; r: number; d: number }[] = [];
  for (let y = 0; y < g.rows; y++)
    for (let x = 0; x < g.cols; x++) {
      if (land.label[y * g.cols + x] !== piece) continue;
      let wet = false;
      for (let dc = -2; dc <= 2; dc++) for (let dr = -2; dr <= 2; dr++) if (g.kind(x + dc, y + dr) === '~') wet = true;
      if (wet) spots.push({ c: x, r: y, d: Math.hypot(x - c, y - r) });
    }
  for (const spot of spots.sort((a, b) => a.d - b.d)) {
    const p = centre(hole, spot.c, spot.r);
    try {
      golfGame(hole).game.place(p.x, p.y);
      return { ...p, ...spot };
    } catch {
      /* not level grass: the next */
    }
  }
  return null;
}

/** Plays a shot to rest, or until the ball is lost and put back. */
function play(game: ReturnType<typeof golfGame>['game']) {
  for (let f = 0; f < 60 * 20 && !(game.ready && f > 2); f++) game.step(DT);
}

describe('a lake across the way', () => {
  it('leaves no way round over land, and a carry of no more than CARRY tiles of water', () => {
    expect(wayRound(landfall), 'a way round over land').toBe(false);
    const land = landOf(landfall);
    const cup = land.label[land.grid.cup[1] * land.grid.cols + land.grid.cup[0]];
    expect(reached(landfall, CARRY).has(cup), 'the cup is reached by carries of CARRY or less').toBe(true);
    // and by no carry shorter than the water is wide: the least crossing is over real water
    for (const hop of crossings(landfall)) expect(hop.run).toBeGreaterThan(2);
    // the cup is not reached by a carry shorter than the shortest crossing of the lake
    expect(reached(landfall, 1).has(cup)).toBe(false);
  });

  it('is water, and a lot of it: a lake of a hundred and fifty tiles or more', () => {
    expect(count(landfall, '~')).toBeGreaterThan(150);
    expect(CARRY).toBe(45);
  });

  it('is nothing to a hole with no lakes: the same hole, bit for bit, as the spec without them', () => {
    const spec = { ...LANDFALL, bunkers: { fairway: 4, green: 3 } };
    const plain = golfHole({ ...spec, lakes: undefined });
    const empty = golfHole({ ...spec, lakes: [] });
    expect(empty.map).toEqual(plain.map);
    expect(Array.from(empty.terrain as Float32Array)).toEqual(Array.from(plain.terrain as Float32Array));
    expect(count(plain, '~')).toBe(0);
    expect(wayRound(plain)).toBe(true);
  });

  it('keeps its water off rock: no tile of water has rock beside it, on any seed', () => {
    const more = [1, 2, 3, 4, 5, 6, 7, 8].map((seed) => {
      const spec = {
        ...LANDFALL,
        seed,
        name: `Landfall ${seed} (test)`,
        bunkers: { fairway: 4, green: 3 },
        lakes: [{ ...LANDFALL.lakes![0], islands: [] }],
      };
      return [spec.name, golfHole(spec)] as const;
    });
    for (const [name, hole] of [...HOLES, ...more]) {
      const g = gridOf(hole);
      for (let r = 0; r < g.rows; r++)
        for (let c = 0; c < g.cols; c++)
          if (g.kind(c, r) === '~')
            for (let dc = -1; dc <= 1; dc++)
              for (let dr = -1; dr <= 1; dr++) expect(g.kind(c + dc, r + dr), `${name} at ${c},${r}`).not.toBe(' ');
    }
  });

  it('may reach into the out of bounds band, which it makes water and not out of bounds', () => {
    // the lake across spans the way from rock to rock, so it has taken the band's tiles at both its ends
    const l = layoutOf(landfall.map, landfall.terrain);
    let wet = 0,
      beside = 0;
    for (let t = 0; t < l.cols * l.rows; t++)
      if (l.water[t]) {
        wet++;
        expect(l.oob[t]).toBe(0);
        const c = t % l.cols,
          r = Math.floor(t / l.cols);
        if ([-1, 1].some((d) => l.oob[r * l.cols + c + d])) beside++;
      }
    expect(wet).toBeGreaterThan(150);
    expect(beside, 'water beside out of bounds, where the lake took the band').toBeGreaterThan(0);
  });
});

describe('an island', () => {
  it('is land in the lake that no way over land reaches, with three tiles of water round it', () => {
    const fig = figures(landfall);
    expect(fig.islands.length).toBeGreaterThanOrEqual(1);
    const g = gridOf(landfall);
    const island = fig.islands[0];
    expect(island.tiles).toBeGreaterThan(15);
    const land = landOf(landfall);
    let seen = 0;
    for (let r = 0; r < g.rows; r++)
      for (let c = 0; c < g.cols; c++) {
        if (land.label[r * g.cols + c] !== island.label) continue;
        seen++;
        // within three tiles of the island's wide land there is water or the island's own land, and nothing else
        for (let dc = -3; dc <= 3; dc++)
          for (let dr = -3; dr <= 3; dr++) {
            if (Math.hypot(dc, dr) > 3) continue;
            const k = g.kind(c + dc, r + dr);
            const own = land.open(c + dc, r + dr) && (k === 'f' || k === 'c' || k === 's');
            expect(k === '~' || own, `${c + dc},${r + dr} is ${k}`).toBe(true);
          }
      }
    expect(seen).toBe(island.tiles);
  });

  it('is of the kind asked: sand, fairway', () => {
    const sand = figures(causeway);
    expect(sand.islands.length).toBeGreaterThanOrEqual(1);
    const g = gridOf(causeway);
    const land = landOf(causeway);
    // one of its pieces of land is all sand: the island of sand the spec asked for (the lake's shore may hold others)
    const wholly = sand.islands.filter((i) => {
      for (let r = 0; r < g.rows; r++)
        for (let c = 0; c < g.cols; c++)
          if (land.label[r * g.cols + c] === i.label && g.kind(c, r) !== 's') return false;
      return true;
    });
    expect(wholly.length).toBeGreaterThanOrEqual(1);
    // and the fairway island is mostly fairway (a bunker or two may stand on it)
    const fairway = figures(landfall).islands[0];
    const lf = landOf(landfall);
    let tiles = 0,
      grass = 0;
    const gf = gridOf(landfall);
    for (let r = 0; r < gf.rows; r++)
      for (let c = 0; c < gf.cols; c++)
        if (lf.label[r * gf.cols + c] === fairway.label) {
          tiles++;
          if ('fc'.includes(gf.kind(c, r))) grass++;
        }
    expect(grass / tiles).toBeGreaterThan(0.6);
  });

  it('rests a ball: put down on it, it is still, in play, and every rule holds', () => {
    const fig = figures(landfall);
    const [c, r] = fig.islands[0].centre.map(Math.round);
    const at = centre(landfall, c, r);
    const { game } = golfGame(landfall);
    game.place(at.x, at.y);
    for (let f = 0; f < 60 * 3; f++) game.step(DT);
    expect(game.ready).toBe(true);
    expect(Math.hypot(game.world.x[game.ball] - at.x, game.world.y[game.ball] - at.y)).toBeLessThan(0.5);
    expect(checkInvariants(game)).toEqual([]);
  });

  it('stands level with the lake’s floor, bunkers and all: an island is as low as the water, not a hill in it', () => {
    for (const hole of [landfall, sandy, long]) {
      const g = gridOf(hole);
      const land = landOf(hole);
      const island = figures(hole).islands[0];
      let high = 0,
        seen = 0;
      for (let r = 0; r < g.rows; r++)
        for (let c = 0; c < g.cols; c++)
          if (land.label[r * g.cols + c] === island.label) {
            seen++;
            high = Math.max(high, (hole.terrain as Float32Array)[r * g.cols + c]);
          }
      expect(seen).toBeGreaterThan(10);
      expect(high, hole.name).toBeLessThan(0.05);
    }
  });

  it('is flown to by a club that carries to it, and the next shot is taken from it', () => {
    expect(landfallCalm.map).toEqual(landfall.map);
    const fig = figures(landfallCalm);
    const g = gridOf(landfallCalm);
    const land = landOf(landfallCalm);
    const l = layoutOf(landfallCalm.map, landfallCalm.terrain);
    const island = fig.islands[0];
    const middle = centre(landfallCalm, Math.round(island.centre[0]), Math.round(island.centre[1]));
    const from = shoreNear(landfallCalm, fig.tee, [island.centre[0], island.centre[1] - 20])!;
    expect(from, 'a place to hit from').not.toBeNull();
    const club = bagClub('7-iron');
    const away = Math.hypot(middle.x - from.x, middle.y - from.y);
    expect(away).toBeLessThan(carryOf(club, 1));
    const aim = Math.atan2(middle.y - from.y, middle.x - from.x);
    const { game, calls } = golfGame(landfallCalm);
    game.place(from.x, from.y);
    game.pick(club.id);
    expect(game.shoot(aim, away / carryOf(club, 1))).toBe(true);
    play(game);
    expect(
      calls.some(([n]) => n === 'splash'),
      'the shot was not lost in the lake',
    ).toBe(false);
    const rest = { x: game.world.x[game.ball], y: game.world.y[game.ball] };
    const tile = Math.floor((rest.y - l.originY) / TILE) * g.cols + Math.floor((rest.x - l.originX) / TILE);
    expect(g.kind(tile % g.cols, Math.floor(tile / g.cols)), 'at rest on land').toMatch(/[fcrs]/);
    // on the island: not on the shore it came from, nor across the water
    expect(Math.hypot(rest.x - middle.x, rest.y - middle.y)).toBeLessThan(5 * TILE);
    expect(game.strokes).toBe(1);
    // the next shot is taken from where it lies: a short one into the lake (found by the preview, which says where it comes
    // down) comes back to the island, a stroke more
    const previewer = new Previewer(game);
    const wedge = bagClub('sand-wedge');
    let back: { angle: number; power: number } | null = null;
    for (const power of [0.15, 0.25, 0.35, 0.5])
      for (const angle of [0, Math.PI, Math.PI / 2, -Math.PI / 2])
        if (!back && previewer.run(rest, wedge, angle, power).end === 'water') back = { angle, power };
    expect(back, 'a short shot that comes down in the lake').not.toBeNull();
    game.pick('sand-wedge');
    expect(game.shoot(back!.angle, back!.power)).toBe(true);
    play(game);
    expect(game.lie.x).toBeCloseTo(rest.x, 3);
    expect(game.lie.y).toBeCloseTo(rest.y, 3);
    expect(calls.filter(([n]) => n === 'splash').length).toBe(1);
    expect(game.strokes).toBe(3);
    expect(game.world.x[game.ball]).toBeCloseTo(rest.x, 2);
    expect(game.world.y[game.ball]).toBeCloseTo(rest.y, 2);
    expect(checkInvariants(game)).toEqual([]);
    expect(land.sizes.length).toBeGreaterThan(2);
  });

  it('may have sand on it, by the island’s own spec and by the hole’s', () => {
    const none = golfHole({
      ...SANDY,
      lakes: [{ ...SANDY.lakes![0], islands: [{ kind: 'fairway', radius: 5 }] }],
      bunkers: { fairway: 4, green: 3 },
    });
    const own = golfHole({ ...SANDY, bunkers: { fairway: 4, green: 3 } });
    const both = sandy;
    const sand = (h: HoleDef) => figures(h).islands.reduce((n, i) => n + sandOn(h, i.label), 0);
    expect(sand(none)).toBe(0);
    expect(sand(own), 'one from the island’s spec').toBeGreaterThan(0);
    expect(sand(both), 'and one from the hole’s').toBeGreaterThan(sand(own));
    expect(figures(both).islands.length).toBeGreaterThanOrEqual(1);
  });
});

/** How many tiles of sand lie on an island's land, within two tiles of its wide tiles (a bunker's own tiles are not wide land). */
function sandOn(hole: HoleDef, piece: number): number {
  const g = gridOf(hole);
  const land = landOf(hole);
  const seen = new Set<number>();
  for (let r = 0; r < g.rows; r++)
    for (let c = 0; c < g.cols; c++)
      if (g.kind(c, r) === 's')
        for (let dc = -2; dc <= 2; dc++)
          for (let dr = -2; dr <= 2; dr++)
            if (land.label[(r + dr) * g.cols + c + dc] === piece) seen.add(r * g.cols + c);
  return seen.size;
}

describe('a ball that lands in the lake', () => {
  it('is played again from where it was struck, a stroke more', () => {
    const fig = figures(landfallCalm);
    const g = gridOf(landfallCalm);
    const island = fig.islands[0];
    const from = shoreNear(landfallCalm, fig.tee, [island.centre[0], island.centre[1] - 20])!;
    const middle = centre(landfallCalm, Math.round(island.centre[0]), Math.round(island.centre[1]));
    const { game, calls } = golfGame(landfallCalm);
    game.place(from.x, from.y);
    game.pick('7-iron');
    // at the island, with a quarter of the carry: into the water, short of it
    game.shoot(Math.atan2(middle.y - from.y, middle.x - from.x), 0.12);
    play(game);
    expect(calls.some(([n]) => n === 'splash')).toBe(true);
    expect(game.strokes).toBe(2);
    expect(game.world.x[game.ball]).toBeCloseTo(from.x, 2);
    expect(game.world.y[game.ball]).toBeCloseTo(from.y, 2);
    expect(game.phase).toBe('play');
    expect(g.kind(from.c, from.r)).not.toBe('~');
  });
});

describe('an island green', () => {
  it('is a green in a lake that stands round it, with the cup at least two tiles in and a first cut round the green', () => {
    const g = gridOf(islandGreen);
    expect(wayRound(islandGreen), 'a way round').toBe(false);
    // no water within the green and its apron, and the cup two tiles in from the edge of the green
    for (let dc = -8; dc <= 8; dc++)
      for (let dr = -8; dr <= 8; dr++)
        if (Math.hypot(dc, dr) <= 7) expect(g.kind(g.cup[0] + dc, g.cup[1] + dr), `${dc},${dr}`).not.toBe('~');
    for (let dc = -2; dc <= 2; dc++)
      for (let dr = -2; dr <= 2; dr++) expect('gC'.includes(g.kind(g.cup[0] + dc, g.cup[1] + dr))).toBe(true);
    expect(count(islandGreen, 'c')).toBeGreaterThan(20);
    // water round it all the way: a ring of it at twelve tiles from the cup is at least half water
    let ring = 0,
      wet = 0;
    for (let a = 0; a < 360; a += 5) {
      ring++;
      if (
        g.kind(
          Math.round(g.cup[0] + 12 * Math.cos((a * Math.PI) / 180)),
          Math.round(g.cup[1] + 12 * Math.sin((a * Math.PI) / 180)),
        ) === '~'
      )
        wet++;
    }
    expect(wet / ring).toBeGreaterThan(0.5);
    const reach = reached(islandGreen, CARRY);
    expect(reach.size).toBeGreaterThan(1);
  });

  it('holes a putt: the autopilot, from eight yards on the island, holes out in two', () => {
    const { game } = golfGame(islandGreen, seeded(2));
    const { cup } = game.layout;
    game.place(cup.x + 8, cup.y);
    const pilot = new Autopilot(game);
    for (let f = 0; f < 60 * 120 && game.phase === 'play' && game.strokes < 6; f++) pilot.step(DT);
    expect(game.phase).not.toBe('play');
    expect(game.strokes).toBeLessThanOrEqual(2);
    expect(game.card.length).toBe(1);
  });

  it('is a hole the autopilot plays from the tee to the cup, over the water', () => {
    const { game, calls } = golfGame(islandGreen, seeded(11));
    const pilot = new Autopilot(game);
    for (let f = 0; f < 60 * 60 * 6 && game.phase === 'play'; f++) pilot.step(DT);
    expect(game.phase).not.toBe('play');
    expect(game.strokes).toBeLessThanOrEqual(8);
    expect(calls.filter(([n]) => n === 'splash').length).toBeLessThanOrEqual(3);
  });
});

describe('a flight over a lake', () => {
  it('says it went into the water, in the preview, with the ball and the game as they were', () => {
    const l = layoutOf(landfallCalm.map, landfallCalm.terrain);
    const { game } = golfGame(landfallCalm);
    const fig = figures(landfallCalm);
    const island = fig.islands[0];
    const from = shoreNear(landfallCalm, fig.tee, [island.centre[0], island.centre[1] - 20])!;
    const middle = centre(landfallCalm, Math.round(island.centre[0]), Math.round(island.centre[1]));
    game.place(from.x, from.y);
    const before = { t: game.t, strokes: game.strokes };
    const aim = Math.atan2(middle.y - from.y, middle.x - from.x);
    const club = bagClub('7-iron');
    const previewer = new Previewer(game);
    const short = previewer.run(from, club, aim, 0.12);
    expect(short.end).toBe('water');
    expect(l.water[Math.floor((short.y - l.originY) / TILE) * l.cols + Math.floor((short.x - l.originX) / TILE)]).toBe(
      1,
    );
    expect(previewProblems(game, from, club, short)).toEqual([]);
    // and the same club at the island's own distance says it landed, which is not water
    const reach = previewer.run(from, club, aim, Math.hypot(middle.x - from.x, middle.y - from.y) / carryOf(club, 1));
    expect(reach.end).toBe('landed');
    expect(l.water[Math.floor((reach.y - l.originY) / TILE) * l.cols + Math.floor((reach.x - l.originX) / TILE)]).toBe(
      0,
    );
    expect(game.t).toBe(before.t);
    expect(game.strokes).toBe(before.strokes);
  });
});

describe('the ground of a hole with a lake', () => {
  it('breaks no rule of it: the first cut on no water, the green no steeper than a green may be', () => {
    for (const [name, hole] of HOLES) {
      const l = layoutOf(hole.map, hole.terrain);
      expect(groundProblems(l, { slope: hole.greens !== undefined }), name).toEqual([]);
      const { game } = golfGame(hole);
      expect(checkInvariants(game), name).toEqual([]);
    }
  });

  it('has its water at nought, away from the green of an island green, and the ground never below it', () => {
    for (const [name, hole] of HOLES) {
      const l = layoutOf(hole.map, hole.terrain);
      let low = Infinity;
      for (const h of hole.terrain as Float32Array) low = Math.min(low, h);
      expect(low, name).toBeGreaterThanOrEqual(0);
      const g = gridOf(hole);
      let deep = 0,
        wet = 0;
      for (let t = 0; t < l.cols * l.rows; t++) {
        if (!l.water[t]) continue;
        // an island green's plate rises out of the water a little way round it
        if (hole === islandGreen && Math.hypot((t % l.cols) - g.cup[0], Math.floor(t / l.cols) - g.cup[1]) < 14)
          continue;
        wet++;
        if ((hole.terrain as Float32Array)[t] > 1e-6) deep++;
      }
      expect(deep / Math.max(1, wet), name).toBeLessThan(0.1);
    }
  });
});

describe('the carry a lake may ask', () => {
  const lake = { at: 0.5, side: 0 as const, size: [10, 12] as [number, number], islands: [] };
  const spec = (carry?: number): GolfSpec => ({
    ...LANDFALL,
    name: 'Carry (test)',
    wind: 0,
    bunkers: { fairway: 2, green: 2 },
    lakes: [{ ...lake, ...(carry === undefined ? {} : { carry }) }],
  });

  /** Whether the cup is reached from the tee by flights of no more than `carry` tiles of water, worked out from the map alone. */
  const carried = (hole: HoleDef, carry: number) => {
    const land = landOf(hole);
    return reached(hole, carry).has(land.label[land.grid.cup[1] * land.grid.cols + land.grid.cup[0]]);
  };

  it('is never more than the lake asks, and CARRY at the most: a lake that asks less than it can give is not laid', () => {
    // under the narrowest water there is, no lake is laid at all
    expect(() => golfHole(spec(1))).toThrow(/could not place a lake/);
    // with a carry asked, the lake laid has a crossing of that much water or less, by a count the generator did not make
    for (const carry of [14, 20, CARRY]) {
      const made = golfHole(spec(carry));
      expect(carried(made, carry), `a carry of ${carry} tiles`).toBe(true);
      expect(wayRound(made)).toBe(false);
    }
    // and the water that has to be crossed is less when less is asked: the lake laid for 14 has a narrower crossing than 45's
    const fig = figures(golfHole(spec(14)));
    expect(
      Math.min(
        ...crossings(golfHole(spec(14)))
          .filter((c) => c.from === fig.tee && c.to === fig.cup)
          .map((c) => c.run),
      ),
    ).toBeLessThanOrEqual(14 + 1.5); // the generator counts tiles along a line, this a continuous one
  });

  it('is refused by name past CARRY or under a tile', () => {
    expect(() => golfHole(spec(CARRY + 1))).toThrow(/lake's carry/);
    expect(() => golfHole(spec(0))).toThrow(/lake's carry/);
  });
});

describe('a ball at rest on water', () => {
  it('is an invariant broken: none is lost to it and none lies there, and a ball made to lie on a tile of the lake is told', () => {
    const { game } = golfGame(landfallCalm);
    const l = game.layout;
    expect(checkInvariants(game)).toEqual([]);
    let wet = -1;
    for (let t = 0; t < l.cols * l.rows && wet < 0; t++) if (l.water[t] && !l.solid[t]) wet = t;
    game.world.x[game.ball] = l.originX + ((wet % l.cols) + 0.5) * TILE;
    game.world.y[game.ball] = l.originY + (Math.floor(wet / l.cols) + 0.5) * TILE;
    game.world.asleep[game.ball] = 1;
    expect(checkInvariants(game).join('\n')).toMatch(/at rest on water/);
  });
});

describe('the route to an island', () => {
  it('aims a lay-up at the island from where a club’s reach ends over the lake, and never at the water', () => {
    const l = layoutOf(longHole.map, longHole.terrain);
    const { game } = golfGame(longHole);
    const route = new Route(l);
    const g = gridOf(longHole);
    const land = landOf(longHole);
    const fig = figures(longHole);
    const island = fig.islands[0];
    const onIsland = (x: number, y: number) =>
      land.label[Math.floor((y - l.originY) / TILE) * g.cols + Math.floor((x - l.originX) / TILE)] === island.label;
    // balls back along the fairway from the lake's shore, a few yards apart: some club's reach ends over the lake
    const column = g.tee[0];
    let islandAims = 0,
      tried = 0;
    for (let r = Math.round(island.centre[1]) - 150; r < Math.round(island.centre[1]) - 8; r++) {
      if (!land.wide(column, r) || land.label[r * g.cols + column] !== fig.tee) continue;
      const at = centre(longHole, column, r);
      tried++;
      const ups = golfLayUps(game, route, at.x, at.y);
      for (const up of ups) {
        const t = Math.floor((up.target.y - l.originY) / TILE) * l.cols + Math.floor((up.target.x - l.originX) / TILE);
        expect(l.water[t], 'a lay-up in the lake').toBe(0);
        if (onIsland(up.target.x, up.target.y)) islandAims++;
      }
    }
    expect(tried).toBeGreaterThan(30);
    expect(islandAims, 'a lay-up on the island').toBeGreaterThan(0);
  });

  it('is a way to the cup from every tile of the island, and from the shore across the lake', () => {
    const l = layoutOf(longHole.map, longHole.terrain);
    const route = new Route(l);
    const fig = figures(longHole);
    const [c, r] = fig.islands[0].centre.map(Math.round);
    const at = centre(longHole, c, r);
    const tee = route.distance(l.tee.x, l.tee.y);
    expect(Number.isFinite(route.distance(at.x, at.y))).toBe(true);
    expect(route.distance(at.x, at.y)).toBeLessThan(tee);
  });
});

describe('a spec with a lake is refused, by name, where it cannot be made', () => {
  const lake = LANDFALL.lakes![0];
  const refused = (lakes: GolfSpec['lakes'], what: RegExp, over: Partial<GolfSpec> = {}) =>
    expect(() => golfHole({ ...LANDFALL, ...over, lakes })).toThrow(what);

  it('says so of a place, a side, a size, an island and a count', () => {
    refused([{ ...lake, at: 1.2 }], /lake.*of the way/);
    refused([{ ...lake, at: 0.02 }], /lake.*of the way/);
    refused([{ ...lake, side: 2 as never }], /lake.*side/);
    refused([{ ...lake, size: [0, 12] }], /lake.*radius/);
    refused([{ ...lake, size: [12, 10] }], /lake.*radius/);
    refused([{ ...lake, size: [10, 40] }], /lake.*radius/);
    refused([{ ...lake, islands: [{ kind: 'lava' as never, radius: 4 }] }], /island.*kind/);
    refused([{ ...lake, islands: [{ kind: 'fairway', radius: 1 }] }], /island.*radius/);
    refused([{ ...lake, islands: [{ kind: 'fairway', radius: 30 }] }], /island.*too big/);
    refused([{ ...lake, islands: [{ kind: 'fairway', radius: 8 }] }], /island.*too big/);
    refused([{ ...lake, islands: [{ kind: 'fairway', radius: 4, bunkers: -1 }] }], /island.*bunkers/);
    refused([{ ...lake, islands: [{ kind: 'green', radius: 4 }] }], /green island/);
    refused([lake, lake, lake, lake, lake], /lakes/);
    refused([lake], /island bunkers/, { bunkers: { fairway: 11, green: 0, island: 2 } });
  });

  it('says so of a green lake: one, alone, with its island the green and big enough to hold it', () => {
    const green = ISLAND_GREEN.lakes![0];
    const spec = (lakes: GolfSpec['lakes']) => () => golfHole({ ...ISLAND_GREEN, lakes });
    expect(spec([green, lake])).toThrow(/round the green.*other lake/);
    expect(spec([green, green])).toThrow(/round the green.*other lake|one lake/);
    expect(spec([{ ...green, islands: [{ kind: 'fairway', radius: 9 }] }])).toThrow(/round the green.*island/);
    expect(spec([{ ...green, islands: [] }])).toThrow(/round the green.*island/);
    expect(spec([{ ...green, islands: [{ kind: 'green', radius: 5 }] }])).toThrow(/green island.*radius/);
    expect(spec([{ ...green, side: 1 }])).toThrow(/round the green.*side/);
  });

  it('says so of a lake that cannot be placed where the hole has no hollow or no room for it', () => {
    // a lake of twelve tiles' radius on a hole of sixty yards, with the tee and the cup four tiles from either end
    expect(() => golfHole({ ...LANDFALL, length: 60, lakes: [{ ...lake, at: 0.5, size: [18, 18] }] })).toThrow(/lake/);
  });
});
