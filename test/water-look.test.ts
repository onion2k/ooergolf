/**
 * What is drawn on a hole's ponds in the rippling look: the rings that spread and fade over each, the sparkles that
 * twinkle on them, and the ring where a ball went in. Where each is, and how it is coloured, from the game's time alone,
 * headless. No hole wears the rippling look now, since every hole's water is open water, but it is kept behind
 * `OCEAN_ON` so a kind of hole can be given it back by that figure; so it is held here with minigolf's switch turned off,
 * and put back after, and `test/water-ocean.test.ts` holds open water.
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { Wind } from 'artshape-render/game/grass';
import { TILE, WATER_LEVEL, layoutOf } from '../src/arena';
import { SPARKLE } from '../src/glints';
import { OCEAN_ON } from '../src/models';
import { PALETTE as MODELS } from '../src/models/palette';
import { Scene } from '../src/scene';
import { SPLASH_RING } from '../src/sway';

beforeAll(() => {
  OCEAN_ON.minigolf = false;
});
afterAll(() => {
  OCEAN_ON.minigolf = true;
});

const WIND: Wind = { direction: [1, 0], strength: 0.5, gustSize: 8, gustSpeed: 5 };
/** Two ponds, a wide one and a small one, and the rest grass. */
const TWO = [
  '###########',
  '#....C....#',
  '#.........#',
  '#..~~~~...#',
  '#..~~~~...#',
  '#.........#',
  '#......~..#',
  '#.........#',
  '#....T....#',
  '###########',
];
const DRY = ['#####', '#.C.#', '#...#', '#.T.#', '#####'];

/** The scene of a hole, its dynamic groups built, and the entries that carry a colour to each ring. */
function built(map: string[]) {
  const l = layoutOf(map);
  const scene = new Scene();
  scene.static(l, 'water look');
  scene.dynamic(undefined, l, 'water look', WIND);
  return { l, scene };
}

/** The pond rings' entries among what moves: one to each pond, three rings each. */
const pondRings = (scene: Scene, t: number) => scene.writeMoving(t).filter((m) => m.looks && m.matrices.length > 16);

describe('the ponds of a hole, as the scene knows them', () => {
  it('are one to each sheet of water, where it is and how big, with the room a ring or a sparkle has on it', () => {
    const { l, scene } = built(TWO);
    expect(scene.ponds.length).toBe(2);
    const wide = scene.ponds.find((p) => p.w > TILE * 3)!;
    expect(wide.w).toBeCloseTo(4 * 3, 9);
    expect(wide.h).toBeCloseTo(2 * 3, 9);
    expect(wide.x).toBeCloseTo(l.originX + 5 * 3, 9);
    expect(wide.free.hx).toBeGreaterThan(0.5);
    expect(wide.free.hx).toBeLessThan(wide.w / 2);
    expect(wide.reach).toBeGreaterThan(0.3);
    expect(built(DRY).scene.ponds).toEqual([]);
  });
});

describe('the rings that spread over a pond', () => {
  it('are three to each pond, each inside its water at every moment, at every size, on the surface, not on the grass', () => {
    const { scene } = built(TWO);
    const rings = pondRings(scene, 0);
    expect(rings.length, 'a pool of rings for each pond').toBe(2);
    for (let t = 0; t < 40; t += 0.17)
      scene.writeMoving(t).forEach((m) => {
        if (!m.looks || m.matrices.length === 16) return;
        // which pond this is: the one the rings lie inside
        const first = { x: m.matrices[12], y: m.matrices[13] };
        const pond = scene.ponds.find((p) => Math.abs(first.x - p.x) <= p.w / 2 && Math.abs(first.y - p.y) <= p.h / 2)!;
        expect(pond, `a pond at ${t}`).toBeDefined();
        for (let i = 0; i < m.count; i++) {
          const o = i * 16;
          const radius = m.matrices[o],
            x = m.matrices[o + 12] - pond.x,
            y = m.matrices[o + 13] - pond.y;
          expect(m.matrices[o + 14], 'on the surface, a hair above it').toBeGreaterThan(WATER_LEVEL);
          expect(m.matrices[o + 14]).toBeLessThan(WATER_LEVEL + 0.1);
          expect(Math.abs(x) + radius, `across, at ${t}`).toBeLessThanOrEqual(pond.free.hx + 1e-6);
          expect(Math.abs(y) + radius, `along, at ${t}`).toBeLessThanOrEqual(pond.free.hy + 1e-6);
        }
      });
  });

  it('are the ripple’s colour where they are fresh and the water’s where they have faded, and glossy', () => {
    const { scene } = built(TWO);
    const rip = [...MODELS.ripple],
      deep = [...MODELS.water];
    let bright = 0,
      gone = 0;
    for (let t = 0; t < 30; t += 0.05)
      for (const m of pondRings(scene, t))
        for (let i = 0; i < m.count; i++) {
          const c = [0, 1, 2].map((k) => m.looks![i * 4 + k]);
          // always between the two, component by component
          for (let k = 0; k < 3; k++) {
            expect(c[k]).toBeGreaterThanOrEqual(Math.min(rip[k], deep[k]) - 1e-6);
            expect(c[k]).toBeLessThanOrEqual(Math.max(rip[k], deep[k]) + 1e-6);
          }
          expect(m.looks![i * 4 + 3], 'as glossy as the water').toBeLessThan(0.2);
          const nearRip = c.every((v, k) => Math.abs(v - rip[k]) < 0.02),
            nearDeep = c.every((v, k) => Math.abs(v - deep[k]) < 0.02);
          if (nearRip) bright++;
          if (nearDeep) gone++;
        }
    expect(bright, 'some are fresh').toBeGreaterThan(0);
    expect(gone, 'and some have faded to nothing').toBeGreaterThan(0);
  });

  it('keep the same at the same moment, and are not there at all on a hole with no water', () => {
    const a = built(TWO).scene,
      b = built(TWO).scene;
    expect(Array.from(pondRings(a, 5.3)[0].matrices)).toEqual(Array.from(pondRings(b, 5.3)[0].matrices));
    expect(pondRings(built(DRY).scene, 5.3)).toEqual([]);
  });
});

describe('the ring where a ball went in', () => {
  const ring = (scene: Scene, t: number) => scene.writeMoving(t).find((m) => m.looks && m.matrices.length === 16)!;

  it('is not drawn until a ball goes in, and then spreads from where it did, and is gone at its end', () => {
    const { l, scene } = built(TWO);
    const at = { x: l.originX + 4 * 3 + 1.5, y: l.originY + (l.rows - 4) * 3 + 1.5 };
    expect(ring(scene, 1).count, 'not yet').toBe(0);
    scene.splashedAt(at.x, at.y, 2);
    const early = ring(scene, 2.1);
    expect(early.count).toBe(1);
    expect(early.matrices[12]).toBeCloseTo(at.x, 6);
    expect(early.matrices[13]).toBeCloseTo(at.y, 6);
    const r1 = early.matrices[0];
    expect(ring(scene, 2.6).matrices[0], 'spreading').toBeGreaterThan(r1);
    expect(ring(scene, 2 + SPLASH_RING.lasts - 0.05).matrices[0]).toBeGreaterThan(SPLASH_RING.reach * 0.9);
    expect(ring(scene, 2 + SPLASH_RING.lasts + 0.01).count, 'gone').toBe(0);
    // and a fresh hole starts with none, as a new hole's scene does
    const next = built(TWO).scene;
    expect(ring(next, 2.1).count).toBe(0);
  });
});

describe('the sparkles on the water', () => {
  it('are none on a hole without a pond, and on one with, a few at a time, each on the water, at its surface', () => {
    expect(built(DRY).scene.sparkles(3)).toEqual([]);
    const { scene } = built(TWO);
    let most = 0,
      any = 0;
    for (let t = 0; t < 30; t += 0.05) {
      const s = scene.sparkles(t);
      expect(s.length, `at ${t}`).toBeLessThanOrEqual(SPARKLE.most);
      most = Math.max(most, s.length);
      any += s.length;
      for (const q of s) {
        expect(q.z).toBeCloseTo(WATER_LEVEL, 6);
        expect(q.brightness).toBeGreaterThan(0);
        expect(q.brightness).toBeLessThanOrEqual(1);
        const pond = scene.ponds.find(
          (p) => Math.abs(q.x - p.x) <= p.free.hx + 1e-9 && Math.abs(q.y - p.y) <= p.free.hy + 1e-9,
        );
        expect(pond, `sparkle at ${q.x},${q.y}`).toBeDefined();
      }
    }
    expect(any, 'they twinkle').toBeGreaterThan(0);
    expect(most).toBeGreaterThanOrEqual(2);
    expect(scene.sparkles(7.7)).toEqual(built(TWO).scene.sparkles(7.7));
  });

  it('are shared between the ponds, so the small one has some too', () => {
    const { scene } = built(TWO);
    const seen = new Set<number>();
    for (let t = 0; t < 60; t += 0.05)
      for (const q of scene.sparkles(t))
        seen.add(
          scene.ponds.findIndex(
            (p) => Math.abs(q.x - p.x) <= p.free.hx + 1e-9 && Math.abs(q.y - p.y) <= p.free.hy + 1e-9,
          ),
        );
    expect(seen.size).toBe(2);
  });
});
