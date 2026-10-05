/**
 * The Fells, the second course of golf proper and the first of the hard ones: nine holes of steep ground, five of them doglegs,
 * four with a lake and three with a gap through a wood to cut the corner by. What is held here is every count the course was
 * asked for, exactly, since a seed chosen by playing and a spec tuned by it are the places a count slips: a lake that was
 * not placed, a lane left off a bend that a later change made too shallow, a hole whose hills are tamer than the table
 * says. The figures a hole is held to (a share of its fairway a ball runs down, its height, its greens) are the table's own
 * and are asserted on the holes as they are made, not on the specs, and so is the time the course takes to make.
 */
import { describe, expect, it } from 'vitest';
import { TILE, layoutOf, lieAt, type Layout } from '../src/arena';
import { COURSES, CUP } from '../src/course';
import { FELLS_SPECS, FELLS_SUMMARY, fells } from '../src/fells';
import { WOOD, golfHole, laneOf } from '../src/golf';
import { LINKS_SPECS } from '../src/links';
import { Route } from '../src/route';
import { terrainRefusal } from '../src/physics';
import { runningShare } from '../src/slopes';
import { GREENS, LIE } from '../src/surfaces';
import { DT, golfGame } from './helpers';

/** What The Fells ask of a hole's ground: the share of its fairway a ball runs down, and how high it stands, in yards. */
const SHARE = { least: 0.12, most: 0.4, course: 0.2 };
const RELIEF = { least: 15, most: 40 };
/** A lake is at least this many tiles of water, which is a pond of six tiles' radius and a little over. */
const LAKE = 120;
/** A bend of this many degrees makes a dogleg, as the plan counts them. */
const DOGLEG = 25;
/** The names of The Isles' holes, a later part's, which no hole here may share. */
const ISLES = [
  'Landfall',
  'The Island Green',
  'Long Water',
  'The Archipelago',
  'Causeway',
  'The Long Swim',
  'Two Lakes',
  'The Peninsula',
  'Home Waters',
];

const t0 = performance.now();
const holes = FELLS_SPECS.map((s) => golfHole(s));
const MADE_MS = performance.now() - t0;
const layouts: Layout[] = holes.map((h) => layoutOf(h.map, h.terrain));

/** Tiles of open water on a hole: the lake's own, not the rock round it. */
const water = (l: Layout) => {
  let n = 0;
  for (let t = 0; t < l.cols * l.rows; t++) if (l.water[t] && !l.solid[t]) n++;
  return n;
};

describe('The Fells', () => {
  it('is nine holes, each a par three to a par five, that add to thirty-seven', () => {
    expect(FELLS_SPECS.length).toBe(9);
    expect(fells().length).toBe(9);
    expect(FELLS_SPECS.map((s) => s.par)).toEqual([4, 4, 3, 5, 3, 4, 5, 4, 5]);
    expect(fells().map((h) => h.par)).toEqual(FELLS_SPECS.map((s) => s.par));
    for (const s of FELLS_SPECS) {
      expect(s.par, s.name).toBeGreaterThanOrEqual(3);
      expect(s.par, s.name).toBeLessThanOrEqual(5);
    }
    expect(FELLS_SPECS.reduce((a, s) => a + s.par, 0)).toBe(37);
    expect(FELLS_SUMMARY).toEqual({ holes: 9, par: 37 });
  });

  it('is made when first asked for and is the same nine holes after', () => {
    expect(fells()).toBe(fells());
  });

  it('has exactly five doglegs, of a bend of twenty-five degrees or more, and four holes straight', () => {
    const bent = FELLS_SPECS.filter((s) => Math.abs(s.bend) >= DOGLEG).map((s) => s.name);
    expect(bent).toEqual(['The Pinewood', 'Scree Corner', 'Beck Bend', 'The Shortcut', 'The Fell Race']);
    // the others are straight, so that a hole is a dogleg or it is not and none is between
    for (const s of FELLS_SPECS.filter((s) => !bent.includes(s.name))) expect(s.bend, s.name).toBe(0);
    // and a dogleg both ways: the corner turns left on two and right on three
    expect(FELLS_SPECS.filter((s) => s.bend > 0).length).toBe(3);
    expect(FELLS_SPECS.filter((s) => s.bend < 0).length).toBe(2);
  });

  it('has a lake on exactly four holes, each of at least a hundred and twenty tiles of water, and no water on the other five', () => {
    const wet = holes.map((h, i) => [h.name, water(layouts[i])] as const);
    expect(wet.filter(([, w]) => w > 0).map(([n]) => n)).toEqual(['Tarn', 'Scree Corner', 'Beck Bend', 'Waterfall']);
    for (const [name, w] of wet) {
      if (w > 0) expect(w, name).toBeGreaterThanOrEqual(LAKE);
      else expect(w, name).toBe(0);
    }
  });

  it('has a gap through a wood on exactly three holes, every one on a dogleg of thirty-five degrees or more', () => {
    const lanes = holes.map((h, i) => [FELLS_SPECS[i], laneOf(h)] as const);
    expect(lanes.filter(([, l]) => l).map(([s]) => s.name)).toEqual(['The Pinewood', 'Scree Corner', 'The Shortcut']);
    for (const [spec, lane] of lanes) {
      expect(!!spec.gap, spec.name).toBe(!!lane);
      if (lane) expect(Math.abs(spec.bend), spec.name).toBeGreaterThanOrEqual(WOOD.bend);
    }
  });

  it('has a lane worth taking: shorter than the way round the corner, and ending on the second leg well on toward the cup', () => {
    for (const [i, h] of holes.entries()) {
      const lane = laneOf(h);
      if (!lane) continue;
      const spec = FELLS_SPECS[i];
      const l = layouts[i];
      const route = new Route(l);
      const straight = Math.hypot(lane.to.x - lane.from.x, lane.to.y - lane.from.y);
      // the corner is straight up from the tee by the first leg, which the generator lays the hole out by
      const corner = { x: l.tee.x, y: l.tee.y + (spec.corner ?? 0.55) * spec.length };
      // a corner's geometry limits the shortcut: the lane runs through the rough on the inside of the bend, and the further
      // it cuts in the nearer it comes to the rock, so what it saves is a few yards of route and a long way of progress
      expect(
        route.distance(l.tee.x, l.tee.y) - (straight + route.distance(lane.to.x, lane.to.y)),
        spec.name,
      ).toBeGreaterThan(3);
      expect(route.distance(corner.x, corner.y) - route.distance(lane.to.x, lane.to.y), spec.name).toBeGreaterThan(30);
      // a driver reaches it: the lane is no longer than a drive and its roll
      expect(straight, spec.name).toBeLessThan(280);
    }
  });

  it('lets a driver struck true through each lane meet no canopy and come down well down it, which a swing six degrees off does not', () => {
    for (const [i, h] of holes.entries()) {
      const lane = laneOf(h);
      if (!lane) continue;
      const name = FELLS_SPECS[i].name;
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
      // it flies the length of a drive and comes down about the end of the lane (a drive downhill runs past it), not at the tee
      expect(Math.hypot(through.at!.x - lane.from.x, through.at!.y - lane.from.y), `${name}: carry`).toBeGreaterThan(
        200,
      );
      expect(Math.hypot(through.at!.x - lane.to.x, through.at!.y - lane.to.y), `${name}: near the target`).toBeLessThan(
        70,
      );
      for (const side of [-1, 1])
        expect(drive(aim + (side * 6 * Math.PI) / 180).knocks, `${name}: ${side * 6} degrees`).toBeGreaterThan(0);
    }
  });

  it('has hills a ball runs down: twelve to forty per cent of every hole’s fairway, and a fifth or more of the course’s', () => {
    let fairway = 0,
      running = 0;
    for (const [i, l] of layouts.entries()) {
      const share = runningShare(l, holes[i].greens);
      expect(share, holes[i].name).toBeGreaterThanOrEqual(SHARE.least);
      expect(share, holes[i].name).toBeLessThanOrEqual(SHARE.most);
      let n = 0;
      for (let t = 0; t < l.cols * l.rows; t++) if (!l.solid[t] && !l.oob[t] && l.lie[t] === LIE.fairway) n++;
      fairway += n;
      running += share * n;
    }
    expect(running / fairway, 'the share of the course’s fairway that runs').toBeGreaterThanOrEqual(SHARE.course);
  });

  it('stands high: fifteen to forty yards of relief on every hole, far above The Links’ four to nine', () => {
    for (const [i, l] of layouts.entries()) {
      const relief = Math.max(...l.terrain);
      expect(relief, holes[i].name).toBeGreaterThanOrEqual(RELIEF.least);
      expect(relief, holes[i].name).toBeLessThanOrEqual(RELIEF.most);
    }
    expect(Math.min(...layouts.map((l) => Math.max(...l.terrain)))).toBeGreaterThan(9.3);
  });

  it('has ground the physics accepts, a way to the cup on every hole and a cup on a green', () => {
    for (const [i, l] of layouts.entries()) {
      expect(terrainRefusal(l, CUP), holes[i].name).toBeNull();
      expect(lieAt(l, l.cup.x, l.cup.y), holes[i].name).toBe(LIE.green);
      expect(lieAt(l, l.tee.x, l.tee.y), holes[i].name).toBe(LIE.tee);
    }
  });

  it('has greens faster and more turned than The Links’: each between the fast and the normal, the last the fastest and the most contoured', () => {
    for (const s of FELLS_SPECS) {
      expect(s.greens, s.name).toBeGreaterThanOrEqual(GREENS.fast);
      expect(s.greens, s.name).toBeLessThanOrEqual(13.5);
      expect(s.contour, s.name).toBeGreaterThanOrEqual(0.5);
      expect(s.contour, s.name).toBeLessThanOrEqual(1);
    }
    const links = LINKS_SPECS.map((s) => s.greens!);
    const mean = (xs: number[]) => xs.reduce((a, b) => a + b, 0) / xs.length;
    expect(mean(FELLS_SPECS.map((s) => s.greens!))).toBeLessThan(mean(links));
    expect(mean(FELLS_SPECS.map((s) => s.contour!))).toBeGreaterThan(mean(LINKS_SPECS.map((s) => s.contour!)));
    const last = FELLS_SPECS[8];
    expect(last.greens).toBe(Math.min(...FELLS_SPECS.map((s) => s.greens!)));
    expect(last.contour).toBe(Math.max(...FELLS_SPECS.map((s) => s.contour!)));
    expect(holes.map((h) => h.greens)).toEqual(FELLS_SPECS.map((s) => s.greens));
  });

  it('is the lengths the pars call for: a par three of 150 to 220 yards, a four of 380 to 480 and a five of 520 to 600', () => {
    const band = { 3: [150, 220], 4: [380, 480], 5: [520, 600] } as const;
    for (const s of FELLS_SPECS) {
      const [least, most] = band[s.par as 3 | 4 | 5];
      expect(s.length, s.name).toBeGreaterThanOrEqual(least);
      expect(s.length, s.name).toBeLessThanOrEqual(most);
    }
    expect(FELLS_SPECS.map((s) => s.length)).toEqual([400, 420, 215, 540, 210, 440, 540, 460, 580]);
  });

  it('has a wind on every hole within what the autopilot was measured to, and a name of its own, unique across every course', () => {
    for (const s of FELLS_SPECS) {
      expect(s.wind, s.name).toBeGreaterThan(0);
      expect(s.wind, s.name).toBeLessThanOrEqual(15);
    }
    const mine = FELLS_SPECS.map((s) => s.name);
    expect(new Set(mine).size).toBe(9);
    const others = COURSES.filter((c) => c.name !== 'The Fells').flatMap((c) => c.holes.map((h) => h.name));
    for (const name of mine) expect(others, name).not.toContain(name);
    for (const name of ISLES) expect(mine, name).not.toContain(name);
    for (const s of LINKS_SPECS) expect(mine, s.name).not.toContain(s.name);
  });

  it('is made in under two seconds, all nine holes, in node: no hole of it a long wait for the page', () => {
    expect(MADE_MS).toBeLessThan(2000);
    for (const l of layouts) expect(l.cols * l.rows).toBeLessThan(40000);
    // the tile is three yards, the figure the table's yards are made into tiles by
    expect(TILE).toBe(3);
  });
});
