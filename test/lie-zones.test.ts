/**
 * What is drawn is what is played (Part 2 of the second title-look plan): on a golf hole the lie at a point is read from the
 * curves the ground is drawn by (`zonesOf`), not from the tile. Without these tests the ground could be drawn round and
 * played square, a ball in a bunker's curve struck as from the fairway, and a stake stand where no ball is lost.
 */
import { describe, expect, it } from 'vitest';
import { layoutOf, lieAt, TILE, tileAt, tileLieAt, type Layout } from '../src/arena';
import { links } from '../src/links';
import { fells } from '../src/fells';
import { isles } from '../src/isles';
import { COURSE } from '../src/course';
import { LIE, type Lie } from '../src/surfaces';
import { zonesOf, type Zone } from '../src/zones';
import { stakesOf } from '../src/ground';
import { golfGame } from './helpers';
import { DT } from './helpers';

const HOLES = [
  ...links().map((h) => ({ name: `Links ${h.name}`, def: h })),
  ...fells().map((h) => ({ name: `Fells ${h.name}`, def: h })),
  ...isles().map((h) => ({ name: `Isles ${h.name}`, def: h })),
];

/** The lie each zone is: a bunker's lip is sand, out of bounds is rough ground to roll on (`isOut` tells it lost). */
const LIE_OF: Record<Zone, Lie> = {
  sand: LIE.sand,
  lip: LIE.sand,
  oob: LIE.rough,
  tee: LIE.tee,
  putting: LIE.green,
  cut: LIE.cut,
  fairway: LIE.fairway,
  rough: LIE.rough,
};

const STEP = 4;

/** Points on a grid over a hole's ground, with the tiles that are water or rock left out. */
function* grid(l: Layout, step = STEP): Generator<[number, number]> {
  for (let y = l.originY + step / 2; y < l.originY + l.rows * TILE; y += step)
    for (let x = l.originX + step / 2; x < l.originX + l.cols * TILE; x += step) {
      const t = tileAt(l, x, y);
      if (t < 0 || l.solid[t] || l.water[t]) continue;
      yield [x, y];
    }
}

describe('the lie on a golf hole is the zone', () => {
  it('equals the zone at points on a grid over every golf hole, and differs from the tile somewhere', () => {
    let checked = 0,
      differs = 0;
    for (const h of HOLES) {
      const l = layoutOf(h.def.map, h.def.terrain);
      const zones = zonesOf(l);
      for (const [x, y] of grid(l)) {
        const want = LIE_OF[zones.at(x, y)];
        expect(lieAt(l, x, y), `${h.name} at ${x.toFixed(1)},${y.toFixed(1)}`).toBe(want);
        checked++;
        const t = tileAt(l, x, y);
        if (want !== (l.sand[t] ? LIE.sand : l.lie[t])) differs++;
      }
    }
    // a check that reached nothing passes in silence
    expect(checked).toBeGreaterThan(20000);
    expect(differs).toBeGreaterThan(500);
  });

  it('is the tile on a hole of minigolf, exactly', () => {
    for (const h of COURSE) {
      const l = layoutOf(h.map, h.terrain);
      for (const [x, y] of grid(l, 1.5)) {
        const t = tileAt(l, x, y);
        expect(lieAt(l, x, y)).toBe(l.sand[t] ? LIE.sand : l.lie[t]);
      }
    }
  });
});

/**
 * The speed a 7-iron struck full from (x, y) leaves with, on the hole's game, the chance in the middle so a strike is the
 * strike true: what a lie takes off a club (its `power`) is all that can tell two such places apart.
 */
function launchFrom(hole: (typeof HOLES)[number]['def'], club: string, at: { x: number; y: number }): number | null {
  const { game } = golfGame(hole);
  game.pick(club);
  try {
    game.place(at.x, at.y);
  } catch {
    return null;
  }
  game.shoot(Math.PI / 2, 1);
  return Math.hypot(game.world.vx[game.ball], game.world.vy[game.ball], game.world.vz[game.ball]);
}

/** The first hole, and the first points on it, where the zone is `want` over a tile whose own lie `tile` says, that a ball can be put on. */
function overTile(want: Lie, tile: (l: Layout, t: number) => boolean) {
  for (const h of HOLES) {
    const l = layoutOf(h.def.map, h.def.terrain);
    for (const [x, y] of grid(l, 0.5)) {
      const t = tileAt(l, x, y);
      if (lieAt(l, x, y) === want && tile(l, t) && launchFrom(h.def, '7-iron', { x, y }) !== null)
        return { hole: h.def, layout: l, at: { x, y } };
    }
  }
  return null;
}

describe('a ball just inside a curve is played as that kind', () => {
  it('is struck from sand where the zone is sand over a tile of grass, as from a bunker, and not as from grass', () => {
    const found = overTile(LIE.sand, (l, t) => !l.sand[t] && (l.lie[t] === LIE.fairway || l.lie[t] === LIE.rough));
    expect(found, 'a bunker whose curve passes over a tile of grass').not.toBeNull();
    const { hole, layout: l, at } = found!;
    const fromZone = launchFrom(hole, '7-iron', at)!;
    // the middle of a tile of the bed
    let bed: { x: number; y: number } | null = null;
    for (let t = 0; t < l.cols * l.rows && !bed; t++) {
      const x = l.originX + ((t % l.cols) + 0.5) * TILE,
        y = l.originY + (Math.floor(t / l.cols) + 0.5) * TILE;
      if (
        l.sand[t] &&
        lieAt(l, x, y) === LIE.sand &&
        !l.water[t] &&
        !l.solid[t] &&
        launchFrom(hole, '7-iron', { x, y }) !== null
      )
        bed = { x, y };
    }
    expect(launchFrom(hole, '7-iron', bed!)).toBeCloseTo(fromZone, 6);
    const flat = overTile(LIE.fairway, (lay, t) => lay.lie[t] === LIE.fairway && !lay.sand[t])!;
    // a fairway's strike is the harder: a bunker takes power off a club
    expect(launchFrom(flat.hole, '7-iron', flat.at)!).toBeGreaterThan(fromZone * 1.0001);
  });

  it('rolls by the tile, as the physics does: a point of green over a tile of first cut is a green to strike from and a cut to roll on', () => {
    const found = overTile(LIE.green, (l, t) => l.lie[t] === LIE.cut);
    expect(found, 'a green whose curve passes over the cut').not.toBeNull();
    const { game } = golfGame(found!.hole);
    const { x, y } = found!.at;
    // the roll is the tile's (`makeWorld` gives the physics its tile's surface), so what a putt is predicted to do is what it does
    expect(tileLieAt(found!.layout, x, y)).toBe(LIE.cut);
    expect(lieAt(found!.layout, x, y)).toBe(LIE.green);
    expect(game.rollAt(x, y)).not.toBe(game.rollAt(found!.layout.cup.x + 1, found!.layout.cup.y));
  });
});

describe('out of bounds is the zone', () => {
  it('refuses a ball put down in the curve and accepts one on a tile of it that the curve leaves in play', () => {
    const hole = HOLES.find((h) => h.name.includes('Links'))!.def;
    const l = layoutOf(hole.map, hole.terrain);
    const zones = zonesOf(l);
    let inside: { x: number; y: number } | null = null,
      outside: { x: number; y: number } | null = null;
    for (const [x, y] of grid(l, 0.5)) {
      const t = tileAt(l, x, y);
      if (!inside && zones.at(x, y) === 'oob' && !l.oob[t] && !l.sand[t]) inside = { x, y };
      if (!outside && zones.at(x, y) !== 'oob' && l.oob[t]) outside = { x, y };
      if (inside && outside) break;
    }
    expect(inside, 'an out of bounds curve over a tile in play').not.toBeNull();
    expect(outside, 'a tile of out of bounds that the curve leaves in play').not.toBeNull();
    const { game } = golfGame(hole);
    expect(() => game.place(inside!.x, inside!.y)).toThrow(/out of bounds/);
    expect(() => game.place(outside!.x, outside!.y)).not.toThrow(/out of bounds/);
  });

  it('puts the stakes along the curve, each on its edge', () => {
    for (const h of HOLES.filter((_, i) => i % 3 === 0)) {
      const l = layoutOf(h.def.map, h.def.terrain);
      const zones = zonesOf(l);
      const stakes = stakesOf(l);
      if (!zones.curves[4].length) {
        expect(stakes).toEqual([]);
        continue;
      }
      expect(stakes.length, h.name).toBeGreaterThan(0);
      const c = zones.curves[4];
      for (const s of stakes) {
        let near = Infinity;
        for (let i = 0; i + 3 < c.length; i += 4) {
          const vx = c[i + 2] - c[i],
            vy = c[i + 3] - c[i + 1];
          const l2 = vx * vx + vy * vy;
          const u = l2 > 0 ? Math.min(1, Math.max(0, ((s.x - c[i]) * vx + (s.y - c[i + 1]) * vy) / l2)) : 0;
          near = Math.min(near, Math.hypot(c[i] + u * vx - s.x, c[i + 1] + u * vy - s.y));
        }
        expect(near, `${h.name} stake at ${s.x.toFixed(1)},${s.y.toFixed(1)}`).toBeLessThan(0.5);
      }
    }
  });
});
void DT;
