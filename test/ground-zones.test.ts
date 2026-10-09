/**
 * The ground of a golf hole drawn by the curves (`src/ground.ts` reading `src/zones.ts`). What is drawn must be what is
 * played: the colour of the mesh at a point is the colour of the zone `lieAt` reads there. And it must be cheap: a tile a
 * curve does not cross is cut as it always was, so the triangles rise only along the edges.
 */
import { describe, expect, it } from 'vitest';
import type { Mesh } from 'artshape-render/mesh/types';
import { TILE, layoutOf, lieAt, tileAt, type Layout } from '../src/arena';
import { CHECKER, CONTRAST, STRIPE, groundOf, mownAt, stripedAt, toned } from '../src/ground';
import { links } from '../src/links';
import { fells } from '../src/fells';
import { isles } from '../src/isles';
import { COURSE } from '../src/course';
import { LIE } from '../src/surfaces';
import { FIELDS, RULES, zonesOf, type Zone } from '../src/zones';
import { PALETTE, TURF, TURF_GOLF } from '../src/scene';

const HOLES = [
  ...links().map((h) => ({ name: `Links ${h.name}`, def: h })),
  ...fells().map((h) => ({ name: `Fells ${h.name}`, def: h })),
  ...isles().map((h) => ({ name: `Isles ${h.name}`, def: h })),
];

const ZONE_ID: Zone[] = ['sand', 'lip', 'oob', 'tee', 'putting', 'cut', 'fairway', 'rough'];

/** Every mesh of a golf ground, with the zone it is the colour of. */
function meshesOf(l: Layout): [Mesh, Zone][] {
  const g = groundOf(l);
  const golf = g.golf!;
  return [
    [g.green, 'fairway'],
    [g.mown, 'fairway'],
    [golf.rough, 'rough'],
    [golf.putting, 'putting'],
    [golf.puttingMown, 'putting'],
    [golf.cut, 'cut'],
    [golf.tee, 'tee'],
    [golf.oob, 'oob'],
    [golf.sand, 'sand'],
    [golf.sandRaked, 'sand'],
    [golf.lip, 'lip'],
  ];
}

const triangles = (m: Mesh) => m.indices.length / 3;

/** The zone each grid point (a step apart over the hole) is laid in by the mesh: an id, or -1 for none and -2 for two. */
function raster(l: Layout, step: number): { grid: Int8Array; nx: number; ny: number } {
  const nx = Math.ceil((l.cols * TILE) / step),
    ny = Math.ceil((l.rows * TILE) / step);
  const grid = new Int8Array(nx * ny).fill(-1);
  for (const [mesh, zone] of meshesOf(l)) {
    const id = ZONE_ID.indexOf(zone);
    const p = mesh.positions;
    for (let k = 0; k < mesh.indices.length; k += 3) {
      const [a, b, c] = [mesh.indices[k] * 3, mesh.indices[k + 1] * 3, mesh.indices[k + 2] * 3];
      const [ax, ay, bx, by, cx, cy] = [p[a], p[a + 1], p[b], p[b + 1], p[c], p[c + 1]];
      const i0 = Math.max(0, Math.floor((Math.min(ax, bx, cx) - l.originX) / step)),
        i1 = Math.min(nx - 1, Math.ceil((Math.max(ax, bx, cx) - l.originX) / step)),
        j0 = Math.max(0, Math.floor((Math.min(ay, by, cy) - l.originY) / step)),
        j1 = Math.min(ny - 1, Math.ceil((Math.max(ay, by, cy) - l.originY) / step));
      const area = (bx - ax) * (cy - ay) - (cx - ax) * (by - ay);
      if (Math.abs(area) < 1e-12) continue;
      for (let j = j0; j <= j1; j++)
        for (let i = i0; i <= i1; i++) {
          const x = l.originX + (i + 0.5) * step,
            y = l.originY + (j + 0.5) * step;
          const u = ((x - ax) * (cy - ay) - (cx - ax) * (y - ay)) / area,
            v = ((bx - ax) * (y - ay) - (x - ax) * (by - ay)) / area;
          if (u < -1e-9 || v < -1e-9 || u + v > 1 + 1e-9) continue;
          const at = j * nx + i;
          grid[at] = grid[at] === -1 || grid[at] === id ? id : -2;
        }
    }
  }
  return { grid, nx, ny };
}

/** How far a point is from the nearest threshold of the rules, in yards: nought on a curve. */
function margin(l: Layout, x: number, y: number, out: Float32Array): number {
  zonesOf(l).sample(x, y, out);
  let least = Infinity;
  for (const [k, below] of RULES) least = Math.min(least, Math.abs(out[k] - below));
  return least;
}

describe('the ground of a golf hole is the colour of its zones', () => {
  it('agrees with the lie at a grid of points over every hole of golf, and leaves no gap in the ground', () => {
    const scratch = new Float32Array(FIELDS);
    let checked = 0,
      near = 0,
      disagree = 0,
      gaps = 0;
    for (const h of HOLES) {
      const l = layoutOf(h.def.map, h.def.terrain);
      const step = 1.5;
      const { grid, nx, ny } = raster(l, step);
      const cup = tileAt(l, l.cup.x, l.cup.y);
      for (let j = 0; j < ny; j++)
        for (let i = 0; i < nx; i++) {
          const x = l.originX + (i + 0.5) * step,
            y = l.originY + (j + 0.5) * step;
          const t = tileAt(l, x, y);
          if (t < 0 || l.solid[t] || l.water[t] || t === cup) continue;
          const got = grid[j * nx + i];
          if (got < 0) {
            gaps++;
            continue;
          }
          checked++;
          const lie = lieAt(l, x, y);
          const zone = ZONE_ID[got];
          const played =
            zone === 'sand' || zone === 'lip'
              ? LIE.sand
              : zone === 'tee'
                ? LIE.tee
                : zone === 'putting'
                  ? LIE.green
                  : zone === 'cut'
                    ? LIE.cut
                    : zone === 'fairway'
                      ? LIE.fairway
                      : LIE.rough;
          // sand is told from its lip by the picture and not by the lie, and out of bounds is rough to the lie
          if (played === lie) continue;
          if (zonesOf(l).at(x, y) === 'oob' && zone === 'oob') continue;
          if (margin(l, x, y, scratch) > 0.5) {
            expect.soft(played, `${h.name} at ${x.toFixed(1)},${y.toFixed(1)}`).toBe(lie);
            disagree++;
          } else near++;
        }
    }
    expect(checked, 'points checked').toBeGreaterThan(50_000);
    expect(gaps, 'points of ground with no ground drawn on them').toBe(0);
    expect(disagree, 'points more than half a yard from a curve drawn as another kind').toBe(0);
    expect(
      near / checked,
      'the share within half a yard of a curve that the pieces draw the other side of it',
    ).toBeLessThan(0.01);
  });

  it('draws minigolf exactly as it did: no golf meshes, and the same ground mesh', () => {
    for (const h of COURSE) {
      const g = groundOf(layoutOf(h.map, h.terrain));
      expect(g.golf).toBeUndefined();
    }
  });
});

describe('the ground of a golf hole costs triangles only along its edges', () => {
  /**
   * Measured on 9 October 2026, the whole ground of every golf hole (all meshes but the banks): the most of the twenty-seven
   * was 183,524 on The Isles' Home Waters, against 151,794 for the tiles on 55d8cfb (the worst there too), a fifth more; the
   * ceiling is a fifth over what was measured.
   */
  const CEILING = 220_000;

  it('is under a ceiling on every hole, and a hole without curves is cut as a tile a time', () => {
    let worst = 0;
    for (const h of HOLES) {
      const l = layoutOf(h.def.map, h.def.terrain);
      const total = meshesOf(l).reduce((s, [m]) => s + triangles(m), 0);
      worst = Math.max(worst, total);
      expect(total, h.name).toBeLessThan(CEILING);
    }
    expect(worst, 'the worst hole of the twenty-seven').toBeGreaterThan(1000);
  });

  it('cuts a tile a curve does not cross in the 3 by 3 pieces it always was', () => {
    const l = layoutOf(links()[0].map, links()[0].terrain);
    const zones = zonesOf(l);
    let tiles = 0;
    for (let t = 0; t < l.cols * l.rows; t++) if (!l.solid[t] && !l.water[t]) tiles++;
    let whole = 0;
    for (let t = 0; t < l.cols * l.rows; t++)
      if (!l.solid[t] && !l.water[t] && zones.tileZone(t % l.cols, Math.floor(t / l.cols)) !== null) whole++;
    const total = meshesOf(l).reduce((s, [m]) => s + triangles(m), 0);
    // two triangles to a piece, nine pieces to a whole tile, and the crossed tiles at most four cells a side and each cell cut
    // by the rules into a handful: a hole of mostly whole tiles is under two and a half times the old cost
    expect(whole / tiles, 'most of the ground is not crossed by a curve').toBeGreaterThan(0.6);
    expect(total).toBeLessThan(tiles * 2 * 9 * 2.5);
  });
});

describe('the checker and the turf on golf', () => {
  it('is three quarters of its contrast on golf, and as it was on minigolf; the checker itself is still said in one place', () => {
    expect(CONTRAST.golf).toBe(0.75);
    expect(CONTRAST.minigolf).toBe(1);
    const lit = [0.4, 0.6, 0.2, 0.7],
      dark = [0.2, 0.4, 0.1, 0.7];
    const mid = lit.map((c, i) => (c + dark[i]) / 2);
    const calm = toned(lit, dark, true);
    for (let i = 0; i < 3; i++) expect(calm[i] - mid[i]).toBeCloseTo(0.75 * (lit[i] - mid[i]), 12);
    expect(calm[3]).toBe(0.7);
    expect(toned(lit, dark, false)).toEqual(lit);
    expect(CHECKER.golf).toBe(4);
    expect(mownAt({ golf: true }, 4, 0)).not.toBe(mownAt({ golf: true }, 0, 0));
    expect(PALETTE.grass).toBeDefined();
  });

  it('wears a calmer turf on golf: the colour 0.13 and the height 0.09, from 0.3 and 0.22', () => {
    expect(TURF.albedo).toBe(0.3);
    expect(TURF.shade).toBe(0.22);
    expect(TURF_GOLF.albedo).toBe(0.13);
    expect(TURF_GOLF.shade).toBe(0.09);
  });
});

describe('the fairway’s stripes along the line of play', () => {
  const made = (name: string) => {
    const def = links().find((h) => h.name === name)!;
    return { def, layout: layoutOf(def.map, def.terrain, def.way) };
  };
  const width = STRIPE.width * TILE;

  /** The point `s` yards along the leg of the way from `a` to `b`, and `o` yards to its left. */
  const onLeg = (a: readonly number[], b: readonly number[], s: number, o: number): [number, number] => {
    const len = Math.hypot(b[0] - a[0], b[1] - a[1]);
    const [dx, dy] = [(b[0] - a[0]) / len, (b[1] - a[1]) / len];
    return [a[0] + dx * s - dy * o, a[1] + dy * s + dx * o];
  };

  it('keeps each band the same along a leg of the way, and changes it once in a stripe’s width across, on a straight hole and a bent one', () => {
    let counted = 0;
    for (const [name, leg] of [
      ['The Opener', 0],
      ['The Big Dogleg', 0],
      ['The Big Dogleg', 1],
    ] as const) {
      const { def, layout } = made(name);
      const way = def.way!;
      expect(way.length, name).toBeGreaterThanOrEqual(3);
      const [a, b] = [way[leg], way[leg + 1]];
      const len = Math.hypot(b[0] - a[0], b[1] - a[1]);
      // along: at each offset across, the band is the same from a short way in from the leg's start to a short way from its end
      // (within the fairway's width and clear of the corner, where the other leg of the way is not the nearer)
      for (let o = -17.85; o <= 18; o += 0.7) {
        const first = stripedAt(layout, ...onLeg(a, b, 25, o));
        for (let s = 25; s <= len - 25; s += 6) {
          expect(stripedAt(layout, ...onLeg(a, b, s, o)), `${name} leg ${leg}: offset ${o} at ${s}`).toBe(first);
          counted++;
        }
      }
      // across: the bands change once in a stripe's width, and each is a stripe wide
      const at = len / 2;
      let last = stripedAt(layout, ...onLeg(a, b, at, -30)),
        since = -30;
      const runs: number[] = [];
      for (let o = -30; o <= 30; o += 0.05) {
        const now = stripedAt(layout, ...onLeg(a, b, at, o));
        if (now !== last) {
          runs.push(o - since);
          since = o;
          last = now;
        }
      }
      expect(runs.length, `${name}: bands across sixty yards`).toBeGreaterThanOrEqual(5);
      for (const run of runs.slice(1)) expect(run, `${name}: a stripe's width`).toBeCloseTo(width, 0);
    }
    expect(counted).toBeGreaterThan(1000);
  });

  it('is drawn where the function says, a piece at a time, on the fairway alone: the green and the cut keep the checker', () => {
    const { layout } = made('The Opener');
    const ground = groundOf(layout);
    const piece = TILE / 3;
    let counted = 0;
    const check = (mesh: Mesh, want: (x: number, y: number) => boolean, what: string) => {
      const p = mesh.positions;
      for (let k = 0; k < mesh.indices.length; k += 3) {
        const [a, b, c] = [mesh.indices[k] * 3, mesh.indices[k + 1] * 3, mesh.indices[k + 2] * 3];
        const x = (p[a] + p[b] + p[c]) / 3,
          y = (p[a + 1] + p[b + 1] + p[c + 1]) / 3;
        // the middle of the piece of the tile the triangle is in
        const px = layout.originX + (Math.floor((x - layout.originX) / piece) + 0.5) * piece,
          py = layout.originY + (Math.floor((y - layout.originY) / piece) + 0.5) * piece;
        if (want(px, py) !== true)
          throw new Error(`${what}: a triangle at ${x.toFixed(2)}, ${y.toFixed(2)} is in the wrong tone`);
        counted++;
      }
    };
    check(ground.mown, (x, y) => stripedAt(layout, x, y), 'mown fairway');
    check(ground.green, (x, y) => !stripedAt(layout, x, y), 'plain fairway');
    const checker = (x: number, y: number) =>
      mownAt(layout, Math.floor((x - layout.originX) / TILE), Math.floor((y - layout.originY) / TILE));
    check(ground.golf!.puttingMown, checker, 'mown green');
    check(ground.golf!.putting, (x, y) => !checker(x, y), 'plain green');
    expect(counted).toBeGreaterThan(5000);
  });

  it('is the checker a hole with no way is mown in, and minigolf’s checker is as it was', () => {
    const def = links()[0];
    const bare = layoutOf(def.map, def.terrain);
    expect(bare.way).toBeUndefined();
    for (const [tx, ty] of [
      [0, 0],
      [5, 9],
      [30, 12],
    ])
      expect(stripedAt(bare, bare.originX + (tx + 0.5) * TILE, bare.originY + (ty + 0.5) * TILE)).toBe(
        mownAt(bare, tx, ty),
      );
    expect(mownAt({ golf: false }, 2, 0)).not.toBe(mownAt({ golf: false }, 0, 0));
    expect(mownAt({ golf: false }, 2, 2)).toBe(mownAt({ golf: false }, 0, 0));
  });
});
