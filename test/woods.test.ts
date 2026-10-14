/**
 * The Woods, the fourth course of golf proper: nine holes with a wood along the whole of each, five doglegs with a lane cut
 * through the corner's trees, four straight holes that are corridors, three ponds and one lake with an island, and light
 * winds, since a wood shelters. What is held here is every count the course was asked for, exactly, on the holes as they are
 * made, since a seed chosen by playing is where a count slips: a wood that did not grow, a lane left off a bend, a pond that
 * was refused for a seed and put on another hole, a name that draws a wind too still to move the grass. Without these a
 * hole could lose its wood to a respec and still be a pleasant hole, and nothing would say that the course had stopped
 * being the one that was asked for. The pace the course is held to is not here: it is the pace gate's, from its baseline.
 */
import { MAX_BEND, bend } from 'artshape-render/game/grass';
import { describe, expect, it } from 'vitest';
import { TILE, layoutOf, lieAt, type Layout } from '../src/arena';
import { Autopilot } from '../src/autopilot';
import { COURSES, CUP } from '../src/course';
import { Game, LIMIT_OVER_PAR } from '../src/game';
import { WOOD, WOODS, golfHole, laneOf } from '../src/golf';
import { checkInvariants } from '../src/invariants';
import { BUDGET } from '../src/models';
import { terrainRefusal } from '../src/physics';
import { Progress, memoryStore } from '../src/progress';
import { seeded } from '../src/random';
import { Route } from '../src/route';
import { GREENS, LIE } from '../src/surfaces';
import { KINDS, ROUGH, windOf } from '../src/turf';
import { TREE } from '../src/trees';
import { WOODS_SPECS, WOODS_SUMMARY, woods } from '../src/woods';
import { DT, golfGame } from './helpers';

/** A lake is at least this many tiles of water; a pond is well under it. */
const LAKE = 120;
/** The names of The Links', The Fells' and The Isles' holes at the time of writing, which no hole here may share. */
const OTHERS = [
  'The Opener',
  'Water Carry',
  'Long Bend',
  'Tight Left',
  'Island Green',
  'Fell Foot',
  'The Pinewood',
  'Tarn',
  'Scree Corner',
  'The Plunge',
  'Beck Bend',
  'The Shortcut',
  'Waterfall',
  'The Fell Race',
  'Landfall',
  'The Green Isle',
  'Long Water',
  'The Archipelago',
  'Causeway',
  'The Long Swim',
  'Two Lakes',
  'The Peninsula',
  'Home Waters',
];
/** Words that two other courses, named at the same time as this one, use for their themes. */
const THEIRS = /\b(heath|gorse|heather|old|course)\b/i;

const t0 = performance.now();
const holes = WOODS_SPECS.map((s) => golfHole(s));
const MADE_MS = performance.now() - t0;
const layouts: Layout[] = holes.map((h) => layoutOf(h.map, h.terrain));
const names = WOODS_SPECS.map((s) => s.name);
const straight = WOODS_SPECS.filter((s) => s.bend === 0);
const bent = WOODS_SPECS.filter((s) => s.bend !== 0);

/** Tiles of open water on a hole: the water's own, not the rock round it. */
const water = (l: Layout) => {
  let n = 0;
  for (let t = 0; t < l.cols * l.rows; t++) if (l.water[t] && !l.solid[t]) n++;
  return n;
};

/** The tile centre of column `c`, row `r` of a hole's map in the layout's units (the map is drawn from the far end). */
const centre = (l: Layout, rows: number, c: number, r: number) => ({
  x: l.originX + (c + 0.5) * TILE,
  y: l.originY + (rows - 1 - r + 0.5) * TILE,
});

/** Whether any tile within `reach` tiles of (c, r) on the map is one of `kinds`. */
function near(map: readonly string[], c: number, r: number, reach: number, kinds: string): boolean {
  const n = Math.ceil(reach);
  for (let dr = -n; dr <= n; dr++)
    for (let dc = -n; dc <= n; dc++)
      if (dc * dc + dr * dr < reach * reach + 0.01 && kinds.includes(map[r + dr]?.[c + dc] ?? ' ')) return true;
  return false;
}

/**
 * How walled a hole is: of the tiles of rough that are three tiles or more from any ground a ball is played from, nine or more
 * from the cup, six or more from the tee and two or more from sand, water or the stakes (the places the planting keeps clear of),
 * the share that have a trunk within two tiles and a half. The generator plants a trunk for every nine tiles of the band, so a
 * tile is never further than about two tiles from one; what is further is a lane, or ground cut off by the pond.
 */
function walled(map: readonly string[]) {
  let tiles = 0,
    close = 0,
    trunks = 0;
  let cup = [0, 0],
    tee = [0, 0];
  map.forEach((row, r) => {
    for (let c = 0; c < row.length; c++) {
      if (row[c] === 'C') cup = [c, r];
      if (row[c] === 'T') tee = [c, r];
      if (row[c] === '^') trunks++;
    }
  });
  map.forEach((row, r) => {
    for (let c = 0; c < row.length; c++) {
      if (row[c] !== 'r') continue;
      if (near(map, c, r, 3, 'fcgtTC')) continue;
      if (Math.hypot(c - cup[0], r - cup[1]) < 9 || Math.hypot(c - tee[0], r - tee[1]) < 6) continue;
      if (near(map, c, r, 2, 'xs~')) continue;
      tiles++;
      if (near(map, c, r, 2.5, '^')) close++;
    }
  });
  return { tiles, close, share: close / tiles, trunks };
}

describe('The Woods', () => {
  it('is nine holes, a par three, four or five each, that add to thirty-five: 3, 4, 5, 4, 3, 4, 5, 4, 3', () => {
    expect(WOODS_SPECS.length).toBe(9);
    expect(woods().length).toBe(9);
    expect(WOODS_SPECS.map((s) => s.par)).toEqual([3, 4, 5, 4, 3, 4, 5, 4, 3]);
    expect(woods().map((h) => h.par)).toEqual(WOODS_SPECS.map((s) => s.par));
    expect(WOODS_SPECS.reduce((a, s) => a + s.par, 0)).toBe(35);
    expect(WOODS_SUMMARY).toEqual({ holes: 9, par: 35 });
  });

  it('is made when first asked for and is the same nine holes after', () => {
    expect(woods()).toBe(woods());
  });

  it('is the lengths the pars call for: a three of 160 to 220 yards, a four of 360 to 440 and a five of 500 to 580', () => {
    const band = { 3: [160, 220], 4: [360, 440], 5: [500, 580] } as const;
    for (const s of WOODS_SPECS) {
      const [least, most] = band[s.par as 3 | 4 | 5];
      expect(s.length, s.name).toBeGreaterThanOrEqual(least);
      expect(s.length, s.name).toBeLessThanOrEqual(most);
    }
  });

  it('has a fairway of ten to thirteen tiles on every hole', () => {
    for (const s of WOODS_SPECS) {
      expect(s.width, s.name).toBeGreaterThanOrEqual(10);
      expect(s.width, s.name).toBeLessThanOrEqual(13);
    }
  });

  it('has a wood on every hole, asked for and grown: a trunk for every nine tiles of the rough, on both sides, all the way', () => {
    for (const s of WOODS_SPECS) {
      expect(s.woods, s.name).toBe(true);
      // the wood is the trees: nothing is scattered besides it
      expect(s.trees, s.name).toBe(0);
    }
    for (const [i, h] of holes.entries()) {
      const w = walled(h.map);
      // 117 to 356 tiles a hole were measured, and the share with a trunk within two tiles and a half 0.88 to 1.00; the
      // lanes on the doglegs and the pond on the straight holes are what take it from one
      expect(w.tiles, h.name).toBeGreaterThan(100);
      expect(w.share, `${h.name}: ${w.close} of ${w.tiles} tiles of rough`).toBeGreaterThanOrEqual(0.85);
      expect(w.trunks, h.name).toBe(layouts[i].trees.length);
      expect(w.trunks, h.name).toBeGreaterThanOrEqual(45);
      // and trunks on both sides of the first leg, which runs straight up from the tee
      const spec = WOODS_SPECS[i];
      const l = layouts[i];
      const leg = l.trees.filter((t) => t.y > l.tee.y + 20 && t.y < l.tee.y + 0.45 * spec.length);
      expect(leg.filter((t) => t.x < l.tee.x - 8).length, `${h.name}: trunks left of the first leg`).toBeGreaterThan(5);
      expect(leg.filter((t) => t.x > l.tee.x + 8).length, `${h.name}: trunks right of the first leg`).toBeGreaterThan(
        5,
      );
    }
  });

  it('keeps the wood off what a ball is played from: no fairway, tee or green tile lies under a canopy, and the cut keeps a tile', () => {
    for (const [i, h] of holes.entries()) {
      const l = layouts[i];
      const rows = h.map.length;
      let fairway = Infinity,
        cut = Infinity,
        green = Infinity;
      h.map.forEach((row, r) => {
        for (let c = 0; c < row.length; c++) {
          const ch = row[c];
          if (!'fcgtTC'.includes(ch)) continue;
          const p = centre(l, rows, c, r);
          let d = Infinity;
          for (const t of l.trees) d = Math.min(d, Math.hypot(p.x - t.x, p.y - t.y));
          if (ch === 'f') fairway = Math.min(fairway, d);
          else if (ch === 'c') cut = Math.min(cut, d);
          else green = Math.min(green, d);
        }
      });
      // the margin of two tiles the option leaves open: six yards from the fairway's tile to the trunk, past a canopy's radius
      expect(fairway, `${h.name}: fairway`).toBeGreaterThan(TREE.radius);
      expect(fairway, `${h.name}: fairway`).toBeGreaterThanOrEqual(WOODS.from * TILE - 1e-6);
      expect(cut, `${h.name}: cut`).toBeGreaterThanOrEqual((WOODS.from - 1) * TILE - 1e-6);
      expect(green, `${h.name}: green, tee and cup`).toBeGreaterThanOrEqual(3 * TILE);
    }
  });

  it('has a route from the tee to the cup that runs on the fairway, the cut and the green, and under no canopy', () => {
    for (const [i, h] of holes.entries()) {
      const l = layouts[i];
      const route = new Route(l);
      const rows = h.map.length;
      expect(Number.isFinite(route.distance(l.tee.x, l.tee.y)), h.name).toBe(true);
      let at = { x: l.tee.x, y: l.tee.y };
      let steps = 0,
        off = 0;
      for (; steps < 400; steps++) {
        if (Math.hypot(at.x - l.cup.x, at.y - l.cup.y) < 6) break;
        at = route.waypoint(at.x, at.y, 6);
        const tx = Math.floor((at.x - l.originX) / TILE),
          ty = Math.floor((at.y - l.originY) / TILE);
        const ch = h.map[rows - 1 - ty][tx];
        // the lane is rough, cleared of trunks, and on a dogleg the route may cut through it; on a straight hole it never leaves the ground
        if (!WOODS_SPECS[i].gap) expect('fcgtTC'.includes(ch), `${h.name}: waypoint ${steps} on '${ch}'`).toBe(true);
        else off += 'fcgtTC'.includes(ch) ? 0 : 1;
        for (const t of l.trees)
          expect(Math.hypot(at.x - t.x, at.y - t.y), `${h.name}: waypoint ${steps} under a canopy`).toBeGreaterThan(
            TREE.radius,
          );
      }
      expect(steps, `${h.name}: reaches the cup`).toBeLessThan(400);
      // and a lane is a short cut across a corner, not the way the route goes: most of it is the fairway's
      expect(off / steps, `${h.name}: share of the route off the ground a ball is played from`).toBeLessThan(0.4);
    }
  });

  it('has exactly five doglegs, of 35 to 55 degrees, turning both ways, and four straight holes', () => {
    expect(bent.map((s) => s.name)).toEqual([
      'Pine Ride',
      'The Beech Hanger',
      'Bluebell Walk',
      'Rookery Walk',
      'The Coppice',
    ]);
    for (const s of bent) {
      expect(Math.abs(s.bend), s.name).toBeGreaterThanOrEqual(35);
      expect(Math.abs(s.bend), s.name).toBeLessThanOrEqual(55);
    }
    expect(bent.filter((s) => s.bend > 0).length).toBeGreaterThan(0);
    expect(bent.filter((s) => s.bend < 0).length).toBeGreaterThan(0);
    expect(straight.map((s) => s.name)).toEqual(['Acorn Rise', 'Oak Avenue', 'The Glade', 'Lantern Clearing']);
    expect(straight.length + bent.length).toBe(9);
  });

  it('has a lane through the wood on exactly the five doglegs, each on a bend the gap allows', () => {
    const lanes = holes.map((h, i) => [WOODS_SPECS[i], laneOf(h)] as const);
    expect(lanes.filter(([, l]) => l).map(([s]) => s.name)).toEqual(bent.map((s) => s.name));
    expect(lanes.filter(([, l]) => l).length).toBe(5);
    for (const [spec, lane] of lanes) {
      expect(!!spec.gap, spec.name).toBe(!!lane);
      if (lane) expect(Math.abs(spec.bend), spec.name).toBeGreaterThanOrEqual(WOOD.bend);
    }
  });

  it('lets a driver struck true through each lane meet no canopy and come down well down it, which a swing six degrees off does not', () => {
    for (const [i, h] of holes.entries()) {
      const lane = laneOf(h);
      if (!lane) continue;
      const name = WOODS_SPECS[i].name;
      const aim = Math.atan2(lane.to.y - lane.from.y, lane.to.x - lane.from.x);
      const drive = (angle: number) => {
        const { game, calls } = golfGame(h);
        game.pick('driver');
        game.shoot(angle, 1);
        for (let f = 0; f < 60 * 20; f++) {
          game.step(DT);
          if (f > 1 && game.ready) break;
        }
        const first = calls.findIndex(([n, a]) => n === 'landed' && a[3] === true);
        const before = first < 0 ? calls : calls.slice(0, first);
        const at = first < 0 ? null : { x: calls[first][1][0] as number, y: calls[first][1][1] as number };
        return {
          knocks: before.filter(([n]) => n === 'knocked').length,
          lost: calls.some(([n]) => n === 'outOfBounds' || n === 'splash'),
          at,
        };
      };
      const through = drive(aim);
      expect(through.knocks, `${name}: through the lane`).toBe(0);
      expect(through.lost, `${name}: lost`).toBe(false);
      expect(through.at, `${name}: comes down`).not.toBeNull();
      expect(Math.hypot(through.at!.x - lane.from.x, through.at!.y - lane.from.y), `${name}: carry`).toBeGreaterThan(
        180,
      );
      expect(Math.hypot(through.at!.x - lane.to.x, through.at!.y - lane.to.y), `${name}: near the target`).toBeLessThan(
        70,
      );
      // the wood stands on the inside of the corner, so it is a swing turned toward the inside that meets it; one turned to the
      // outside flies over the fairway and the rough beyond, which is open, and is not asked to meet anything
      const inside = -Math.sign(WOODS_SPECS[i].bend);
      expect(drive(aim + (inside * 6 * Math.PI) / 180).knocks, `${name}: 6 degrees to the inside`).toBeGreaterThan(0);
    }
  });

  it('stops a drive struck into the wood beside a straight hole’s corridor, and lets one struck down it fly clean', () => {
    for (const s of straight) {
      const i = WOODS_SPECS.indexOf(s);
      const h = holes[i];
      const l = layouts[i];
      const way = Math.atan2(l.cup.y - l.tee.y, l.cup.x - l.tee.x);
      const drive = (angle: number) => {
        const { game, calls } = golfGame(h);
        game.pick('driver');
        game.shoot(angle, 1);
        for (let f = 0; f < 60 * 20; f++) {
          game.step(DT);
          if (f > 1 && game.ready) break;
        }
        const first = calls.findIndex(([n, a]) => n === 'landed' && a[3] === true);
        const before = first < 0 ? calls : calls.slice(0, first);
        // a knock counts only where a canopy is: the stakes' wall beyond the wood knocks a ball too, and is not the wood
        return before.filter(
          ([n, a]) =>
            n === 'knocked' &&
            l.trees.some((t) => Math.hypot((a[1] as number) - t.x, (a[2] as number) - t.y) <= TREE.radius + 1),
        ).length;
      };
      expect(drive(way), `${s.name}: down the corridor`).toBe(0);
      for (const side of [-1, 1])
        expect(
          drive(way + (side * 20 * Math.PI) / 180),
          `${s.name}: 20 degrees ${side < 0 ? 'right' : 'left'}`,
        ).toBeGreaterThan(0);
    }
  });

  it('has a pond on exactly three holes and a lake with an island on the last, and no water on the other five', () => {
    const wet = holes.map((h, i) => [h.name, water(layouts[i])] as const);
    expect(wet.filter(([, w]) => w > 0).map(([n]) => n)).toEqual([
      'Acorn Rise',
      'Oak Avenue',
      'The Glade',
      'Lantern Clearing',
    ]);
    for (const [name, w] of wet.slice(0, 8)) {
      if (w > 0) expect(w, `${name}: a pond`).toBeLessThan(LAKE);
    }
    expect(wet[8][1], 'the lake').toBeGreaterThanOrEqual(LAKE);
    expect(WOODS_SPECS.filter((s) => s.ponds.length > 0).length).toBe(3);
    expect(WOODS_SPECS.filter((s) => s.lakes?.length).map((s) => s.name)).toEqual(['Lantern Clearing']);
    expect(WOODS_SPECS[8].lakes!.length).toBe(1);
    expect(WOODS_SPECS[8].lakes![0].islands.length).toBeGreaterThan(0);
    expect(WOODS_SPECS[8].ponds.length).toBe(0);
  });

  it('has three to six bunkers on every hole', () => {
    for (const s of WOODS_SPECS) {
      const n = s.bunkers.fairway + s.bunkers.green + (s.bunkers.island ?? 0);
      expect(n, s.name).toBeGreaterThanOrEqual(3);
      expect(n, s.name).toBeLessThanOrEqual(6);
    }
  });

  it('has light winds of four to eight miles an hour, since a wood shelters', () => {
    for (const s of WOODS_SPECS) {
      expect(s.wind, s.name).toBeGreaterThanOrEqual(4);
      expect(s.wind, s.name).toBeLessThanOrEqual(8);
    }
    expect(holes.map((h) => h.wind)).toEqual(WOODS_SPECS.map((s) => s.wind));
  });

  it('has greens of 12.5 to 15 and a contour of 0.5 to 0.9, and hills of the Links’ steepness lifted at most a fifth', () => {
    for (const s of WOODS_SPECS) {
      expect(s.greens, s.name).toBeGreaterThanOrEqual(12.5);
      expect(s.greens, s.name).toBeLessThanOrEqual(15);
      expect(s.contour, s.name).toBeGreaterThanOrEqual(0.5);
      expect(s.contour, s.name).toBeLessThanOrEqual(0.9);
      expect(s.feel, s.name).toBe('hills');
      expect(s.steepness, s.name).toBe(0.75);
      expect(s.heighten, s.name).toBeGreaterThanOrEqual(1);
      expect(s.heighten, s.name).toBeLessThanOrEqual(1.2);
      expect(s.rolling, s.name).toBe(true);
      expect(s.greens!, s.name).toBeGreaterThanOrEqual(GREENS.fast);
    }
    expect(holes.map((h) => h.greens)).toEqual(WOODS_SPECS.map((s) => s.greens));
  });

  it('has ground the physics accepts, a way to the cup on every hole, a cup on a green and a tee on a tee', () => {
    for (const [i, l] of layouts.entries()) {
      expect(l.golf, holes[i].name).toBe(true);
      expect(terrainRefusal(l, CUP), holes[i].name).toBeNull();
      expect(lieAt(l, l.cup.x, l.cup.y), holes[i].name).toBe(LIE.green);
      expect(lieAt(l, l.tee.x, l.tee.y), holes[i].name).toBe(LIE.tee);
      expect(Number.isFinite(new Route(l).distance(l.tee.x, l.tee.y)), holes[i].name).toBe(true);
    }
  });

  it('draws its trees inside the budget a wooded hole is given', () => {
    for (const [i, l] of layouts.entries())
      expect(l.trees.length * BUDGET.golfTree, holes[i].name).toBeLessThanOrEqual(BUDGET['wooded hole']);
  });

  it('has a name of its own on every hole: unique across every course, none of the themes of the other new courses, and each draws a wind that moves the grass', () => {
    expect(new Set(names).size).toBe(9);
    const others = COURSES.filter((c) => c.name !== 'The Woods').flatMap((c) => c.holes.map((h) => h.name));
    for (const name of names) {
      expect(others, name).not.toContain(name);
      expect(OTHERS, name).not.toContain(name);
      expect(THEIRS.test(name), name).toBe(false);
    }
    // the grass rule of test/turf.test.ts, held for these names as it is for every hole of every course
    const give = KINDS[ROUGH].give ?? 1;
    for (const name of names) {
      const w = windOf(name);
      expect(w.strength, name).toBeGreaterThanOrEqual(0.7);
      expect(w.strength, name).toBeLessThanOrEqual(1);
      let across = 0;
      for (let t = 0; t < 20; t += 1.7) {
        let lo = Infinity,
          hi = -Infinity;
        for (let x = 0; x < 16; x += 0.5)
          for (let y = 0; y < 16; y += 0.5) {
            const b = bend(give, w, x, y, t, 0);
            lo = Math.min(lo, b);
            hi = Math.max(hi, b);
          }
        across = Math.max(across, hi - lo);
      }
      expect(across, `${name}: ripples across the ground, in radians`).toBeGreaterThanOrEqual(0.4);
      let lo = Infinity,
        hi = -Infinity;
      for (let t = 0; t < 6; t += 0.05) {
        const b = bend(give, w, 5, 5, t, 0.3);
        lo = Math.min(lo, b);
        hi = Math.max(hi, b);
      }
      expect(hi - lo, `${name}: sway at a place, in radians`).toBeGreaterThanOrEqual(0.3);
      expect(hi, `${name}: never bent past the most`).toBeLessThan(MAX_BEND);
    }
  });

  it('is made in under three seconds, all nine holes, in node', () => {
    expect(MADE_MS).toBeLessThan(3000);
    for (const l of layouts) expect(l.cols * l.rows).toBeLessThan(40000);
  });

  it('is played round by the autopilot, with a player’s slips: every hole finished inside its limit, breaking no rule', () => {
    for (let seed = 1; seed <= 2; seed++) {
      const game = new Game(new Progress(memoryStore()), {}, { random: seeded(seed), course: holes });
      const pilot = new Autopilot(game, { skill: { aim: 0.05, power: 0.1 }, random: seeded(seed * 31 + 7) });
      for (let f = 0; f < 60 * 60 * 30 && game.phase !== 'over'; f++) {
        pilot.step(DT);
        if (f % 211 === 0) expect(checkInvariants(game), `seed ${seed}, frame ${f}`).toEqual([]);
      }
      expect(game.phase, `seed ${seed}`).toBe('over');
      game.card.forEach((score, h) =>
        expect(score, `seed ${seed}: ${holes[h].name}`).toBeLessThanOrEqual(holes[h].par + LIMIT_OVER_PAR),
      );
      expect(game.card.length).toBe(9);
    }
  }, 120000);
});
