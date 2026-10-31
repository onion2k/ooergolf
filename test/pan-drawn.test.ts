/**
 * The desert's pan as it is drawn: a ground of its own, in its own mesh and its own colour and crack, laid where the game plays a
 * pan and nowhere else (what is drawn is what is played), edged by a soft lip that follows the same curve, and nothing of it on a
 * hole with no pan, so earth is drawn as it always was.
 */
import { describe, expect, it } from 'vitest';
import type { Mesh } from 'artshape-render/mesh/types';
import { TILE, layoutOf, lieAt, type Layout } from '../src/arena';
import { groundOf, panLipOf } from '../src/ground';
import { golfHole } from '../src/golf';
import { LINKS_SPECS } from '../src/links';
import { Scene } from '../src/scene';
import { LIE } from '../src/surfaces';
import { THEMES, themeOf } from '../src/theme';
import { zonesOf } from '../src/zones';
import { TURF_KINDS } from '../src/turfTexture';
import { golfGame } from './helpers';

const hole = (biome?: 'desert') => {
  const def = golfHole({ ...LINKS_SPECS[1], name: `Pan ${biome ?? 'earth'}`, ...(biome ? { biome } : {}) });
  return { def, layout: layoutOf(def.map, def.terrain, def.way, def.biome) };
};

const triangles = (m: Mesh) => m.indices.length / 3;

/** Whether (x, y) is inside the triangle `t` of `m`, seen from above. */
function inside(m: Mesh, t: number, x: number, y: number): boolean {
  const p = m.positions;
  const [a, b, c] = [m.indices[t * 3] * 3, m.indices[t * 3 + 1] * 3, m.indices[t * 3 + 2] * 3];
  const d1 = (p[b] - p[a]) * (y - p[a + 1]) - (p[b + 1] - p[a + 1]) * (x - p[a]);
  const d2 = (p[c] - p[b]) * (y - p[b + 1]) - (p[c + 1] - p[b + 1]) * (x - p[b]);
  const d3 = (p[a] - p[c]) * (y - p[c + 1]) - (p[a + 1] - p[c + 1]) * (x - p[c]);
  return (d1 >= -1e-6 && d2 >= -1e-6 && d3 >= -1e-6) || (d1 <= 1e-6 && d2 <= 1e-6 && d3 <= 1e-6);
}

describe('the desert’s pan, drawn', () => {
  const { layout } = hole('desert');

  it('is a mesh of its own on a hole with a pan, and none on a hole with none', () => {
    expect(triangles(groundOf(layout).golf!.pan), 'a desert hole').toBeGreaterThan(200);
    const earth = hole().layout;
    expect(triangles(groundOf(earth).golf!.pan), 'earth').toBe(0);
    expect(panLipOf(earth).indices.length, 'no lip on earth').toBe(0);
  });

  it('is laid where the game plays a pan, and no other: the middle of every triangle is a pan to `lieAt`', () => {
    const m = groundOf(layout).golf!.pan;
    const p = m.positions;
    let wrong = 0;
    for (let t = 0; t < triangles(m); t++) {
      const [a, b, c] = [m.indices[t * 3] * 3, m.indices[t * 3 + 1] * 3, m.indices[t * 3 + 2] * 3];
      const x = (p[a] + p[b] + p[c]) / 3,
        y = (p[a + 1] + p[b + 1] + p[c + 1]) / 3;
      if (lieAt(layout, x, y) !== LIE.pan) wrong++;
    }
    expect(wrong, 'triangles of the pan laid on ground that is not one').toBe(0);
  });

  it('covers every point the game plays as a pan, and the rough and the fairway do not', () => {
    const m = groundOf(layout).golf!.pan;
    const g = groundOf(layout).golf!;
    const zones = zonesOf(layout);
    let seen = 0,
      bare = 0;
    for (let i = 0; i < 4000 && seen < 150; i++) {
      // a scatter over the hole by a fixed stride, so it is the same every run
      const x = layout.originX + ((i * 0.6180339887) % 1) * layout.cols * TILE,
        y = layout.originY + ((i * 0.7548776662) % 1) * layout.rows * TILE;
      if (zones.at(x, y) !== 'pan') continue;
      seen++;
      let under = false;
      for (let t = 0; t < triangles(m) && !under; t++) under = inside(m, t, x, y);
      if (!under) bare++;
      for (const other of [g.rough, g.cut])
        for (let t = 0; t < triangles(other); t++)
          expect(inside(other, t, x, y), 'a pan has nothing else under it').toBe(false);
    }
    expect(seen, 'found pan to look at').toBeGreaterThan(40);
    expect(bare).toBe(0);
  });

  it('has a soft lip that follows the pan’s curve: a ribbon a little wider than a yard along it, a little above the ground, and none away from a pan', () => {
    const lip = panLipOf(layout);
    expect(triangles(lip)).toBeGreaterThan(100);
    const zones = zonesOf(layout);
    for (let i = 0; i < lip.positions.length; i += 3) {
      const x = lip.positions[i],
        y = lip.positions[i + 1];
      // every corner of the ribbon is within a yard of the curve the pan is played by
      let near = Infinity;
      const seg = zones.curves[5];
      for (let s = 0; s < seg.length; s += 4) {
        const [ax, ay, bx, by] = [seg[s], seg[s + 1], seg[s + 2], seg[s + 3]];
        const l2 = (bx - ax) ** 2 + (by - ay) ** 2 || 1;
        const u = Math.max(0, Math.min(1, ((x - ax) * (bx - ax) + (y - ay) * (by - ay)) / l2));
        near = Math.min(near, Math.hypot(x - (ax + (bx - ax) * u), y - (ay + (by - ay) * u)));
      }
      expect(near).toBeLessThan(1);
    }
    for (let i = 0; i < lip.normals.length; i += 3) expect(lip.normals[i + 2], 'faces up').toBeGreaterThan(0.3);
  });
});

describe('the pan’s paint', () => {
  it('is the theme’s: a pale clay and a lip, a crack texture of its own on a desert, and none (the turf’s) on earth', () => {
    const d = THEMES.desert;
    expect(TURF_KINDS[d.layers.pan!.layer - 1]).toBe('crack');
    expect(THEMES.earth.layers.pan).toBeNull();
    const light = (c: readonly number[]) => 0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2];
    // a pale clay, paler than the straw of the fairway beside it and than the red rough about it, and its lip between it and the rough
    expect(light(d.ground.pan)).toBeGreaterThan(light(d.ground.grassMown));
    expect(light(d.ground.pan)).toBeGreaterThan(light(d.ground.playRough) * 2);
    expect(light(d.ground.panLip)).toBeLessThan(light(d.ground.pan));
    expect(light(d.ground.panLip)).toBeGreaterThan(light(d.ground.playRough));
  });

  it('is drawn by the scene, with the crack on its group, the lip beside it, and the same hole drawn on earth with neither', () => {
    const scene = (biome?: 'desert') => {
      const { def, layout } = hole(biome);
      return new Scene().static(layout, def.name);
    };
    const cracked = (groups: ReturnType<typeof scene>) => groups.filter((g) => g.texture && g.mesh.indices.length > 0);
    const d = scene('desert'),
      e = scene();
    const pan = THEMES.desert.ground.pan;
    // a group painted in the pan's own colour, wearing a texture of its own
    const panGroups = d.filter(
      (g) => g.albedo && Math.abs(g.albedo[0] - pan[0]) < 1e-3 && Math.abs(g.albedo[1] - pan[1]) < 1e-3,
    );
    expect(panGroups.length).toBeGreaterThanOrEqual(1);
    expect(panGroups.some((g) => g.texture !== undefined)).toBe(true);
    expect(cracked(d).length).toBeGreaterThan(cracked(e).length - 1);
    // earth has no group in the pan's colour at all
    expect(
      e.filter((g) => g.albedo && Math.abs(g.albedo[0] - pan[0]) < 1e-3 && Math.abs(g.albedo[1] - pan[1]) < 1e-3),
    ).toHaveLength(0);
  });

  it('is on the hole’s own map in the theme’s clay, and not a tan of the map’s own', async () => {
    const { coloursOf } = await import('../src/holemap');
    expect(coloursOf(THEMES.desert).pan).not.toEqual([201, 170, 118]);
    expect(themeOf(golfGame(golfHole({ ...LINKS_SPECS[1], biome: 'desert' })).game.layout)).toBe(THEMES.desert);
  });
});

void (undefined as unknown as Layout);
