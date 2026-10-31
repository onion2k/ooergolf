/**
 * The turf texture the mown ground wears: its texels are tileable, the same every time and neutral about mid-grey, so the
 * renderer's modulation changes the green's detail and not its colour; and the scene hands it to the mown kinds of ground
 * and to nothing else. Without these a seam would show at every repeat, or the green would drift darker or lighter.
 */
import { describe, expect, it } from 'vitest';
import { layoutOf } from '../src/arena';
import { COURSES } from '../src/course';
import { golfHole } from '../src/golf';
import { LINKS_SPECS } from '../src/links';
import { PALETTE } from '../src/models/palette';
import { Scene, TURF, TURF_GOLF } from '../src/scene';
import { toned } from '../src/ground';
import { THEMES } from '../src/theme';
import { TURF_SIDE, turfTexels } from '../src/turfTexture';

const SIDE = TURF_SIDE;
const at = (t: Uint8ClampedArray, x: number, y: number, c: number) => t[(y * SIDE + x) * 4 + c];

describe('turfTexels', () => {
  const mown = turfTexels(SIDE, 7, 'mown');

  it('is a square of rgba texels of the side asked', () => {
    expect(SIDE).toBe(256);
    expect(mown.length).toBe(SIDE * SIDE * 4);
  });

  it('is the same bytes for the same arguments, and other bytes for another seed', () => {
    expect(turfTexels(SIDE, 7, 'mown')).toEqual(mown);
    expect(turfTexels(SIDE, 8, 'mown')).not.toEqual(mown);
  });

  it('tiles: each edge runs on into the other as one texel runs into the next', () => {
    // the step between the last column and the first is no bigger than the steps inside the image
    let inside = 0;
    let across = 0;
    for (let y = 0; y < SIDE; y++)
      for (let c = 0; c < 4; c++) {
        across = Math.max(across, Math.abs(at(mown, SIDE - 1, y, c) - at(mown, 0, y, c)));
        for (let x = 0; x + 1 < SIDE; x++)
          inside = Math.max(inside, Math.abs(at(mown, x, y, c) - at(mown, x + 1, y, c)));
      }
    expect(across).toBeLessThanOrEqual(inside);
    inside = 0;
    across = 0;
    for (let x = 0; x < SIDE; x++)
      for (let c = 0; c < 4; c++) {
        across = Math.max(across, Math.abs(at(mown, x, SIDE - 1, c) - at(mown, x, 0, c)));
        for (let y = 0; y + 1 < SIDE; y++)
          inside = Math.max(inside, Math.abs(at(mown, x, y, c) - at(mown, x, y + 1, c)));
      }
    expect(across).toBeLessThanOrEqual(inside);
  });

  it('is mid-grey on average in colour and in height, within two levels, and has some grain in it', () => {
    for (const c of [0, 1, 2, 3]) {
      let sum = 0;
      let lo = 255;
      let hi = 0;
      for (let i = c; i < mown.length; i += 4) {
        sum += mown[i];
        lo = Math.min(lo, mown[i]);
        hi = Math.max(hi, mown[i]);
      }
      expect(Math.abs(sum / (SIDE * SIDE) - 128), `channel ${c}`).toBeLessThanOrEqual(2);
      expect(hi - lo, `channel ${c} swing`).toBeGreaterThan(10);
      expect(hi - lo, `channel ${c} swing`).toBeLessThan(120);
    }
  });
});

describe('the turf on the ground', () => {
  const texture = (g: { texture?: Float32Array }) => g.texture && Array.from(g.texture);
  // the ground's own mesh of a colour: the cup's tile is cut in the same stripe colour, and is a few dozen triangles
  const groupOf = (groups: ReturnType<Scene['static']>, colour: readonly number[]) =>
    groups.find(
      (g) =>
        g.mesh.indices.length > 500 &&
        JSON.stringify((g as { albedo?: number[] }).albedo) === JSON.stringify(colour.slice(0, 3)),
    );

  it('is on the mown ground of a hole of minigolf, at the figures of TURF', () => {
    const hole = COURSES[0].holes[0];
    const groups = new Scene().static(layoutOf(hole.map, hole.terrain), hole.name);
    for (const c of [PALETTE.grass, PALETTE.grassMown]) {
      expect(texture(groupOf(groups, c)!)).toEqual([TURF.layer, TURF.repeat, TURF.albedo, TURF.shade].map(Math.fround));
    }
    expect(TURF.layer).toBe(1);
  });

  it('has the figures chosen by looking: a layer, 1.4 units a tile, 0.3 of the colour and 0.22 of the height', () => {
    // 0.2 and 0.15, chosen from three on 4 October 2026, were raised with the checker mow on 8 October 2026
    expect(TURF).toEqual({ layer: 1, repeat: 1 / 1.4, albedo: 0.3, shade: 0.22 });
  });

  it('is on the mown grounds of a golf hole and not on its rough or its out of bounds', () => {
    const hole = golfHole(LINKS_SPECS[1]);
    const groups = new Scene().static(layoutOf(hole.map, hole.terrain), hole.name);
    // calmer than minigolf's (0.13 and 0.09), and on the mown colours as the checker's contrast leaves them on golf
    const want = [TURF_GOLF.layer, TURF_GOLF.repeat, TURF_GOLF.albedo, TURF_GOLF.shade].map(Math.fround);
    for (const c of [
      toned(PALETTE.puttingGreen, PALETTE.puttingGreenMown, true),
      toned(PALETTE.puttingGreenMown, PALETTE.puttingGreen, true),
      PALETTE.firstCut,
      PALETTE.teeBox,
    ]) {
      expect(texture(groupOf(groups, c)!), String(c)).toEqual(want);
    }
    // the sand is a plain colour, without the turf
    for (const c of [PALETTE.golfSand, PALETTE.golfSand.map((x) => x * 0.975), PALETTE.golfSandLip]) {
      const same = groups.filter(
        (x) => JSON.stringify((x as { albedo?: number[] }).albedo) === JSON.stringify(c.slice(0, 3)),
      );
      expect(same.length, String(c)).toBeGreaterThan(0);
      for (const g of same) expect(g.texture, String(c)).toBeUndefined();
    }
    for (const c of [PALETTE.playRough, PALETTE.oobGround]) {
      const same = groups.filter(
        (x) => JSON.stringify((x as { albedo?: number[] }).albedo) === JSON.stringify(c.slice(0, 3)),
      );
      expect(same.length, String(c)).toBeGreaterThan(0);
      for (const g of same) expect(g.texture, String(c)).toBeUndefined();
    }
  });
});

describe.each(['tuft', 'regolith', 'plate', 'crack'] as const)('the %s texture', (kind) => {
  const t = turfTexels(SIDE, 1, kind);

  it('is the same bytes for the same arguments, and tiles: an edge runs on into the other as a texel into the next', () => {
    expect(turfTexels(SIDE, 1, kind)).toEqual(t);
    expect(t.length).toBe(SIDE * SIDE * 4);
    let insideX = 0;
    let wrappedX = 0;
    let insideY = 0;
    let wrappedY = 0;
    for (let i = 0; i < SIDE; i++) {
      wrappedX = Math.max(wrappedX, Math.abs(at(t, SIDE - 1, i, 0) - at(t, 0, i, 0)));
      wrappedY = Math.max(wrappedY, Math.abs(at(t, i, SIDE - 1, 0) - at(t, i, 0, 0)));
      for (let k = 0; k + 1 < SIDE; k++) {
        insideX = Math.max(insideX, Math.abs(at(t, k, i, 0) - at(t, k + 1, i, 0)));
        insideY = Math.max(insideY, Math.abs(at(t, i, k, 0) - at(t, i, k + 1, 0)));
      }
    }
    expect(wrappedX, 'a seam where the texture repeats across').toBeLessThanOrEqual(insideX);
    expect(wrappedY, 'a seam where the texture repeats along').toBeLessThanOrEqual(insideY);
  });

  it('is mid-grey on average in colour and in height, within two levels, with some grain and not too much', () => {
    for (const c of [0, 1, 2, 3]) {
      let sum = 0;
      let lo = 255;
      let hi = 0;
      for (let i = c; i < t.length; i += 4) {
        sum += t[i];
        lo = Math.min(lo, t[i]);
        hi = Math.max(hi, t[i]);
      }
      expect(Math.abs(sum / (SIDE * SIDE) - 128), `channel ${c}`).toBeLessThanOrEqual(2);
      expect(hi - lo, `channel ${c} swing`).toBeGreaterThan(8);
      expect(hi - lo, `channel ${c} swing`).toBeLessThan(200);
    }
  });
});

describe('the ground of a biome', () => {
  const groups = (biome?: 'desert' | 'moon' | 'future') => {
    const spec = { ...LINKS_SPECS[1], ...(biome ? { biome } : {}), ...(biome === 'moon' ? { trees: 0 } : {}) };
    const hole = golfHole(spec);
    return new Scene().static(layoutOf(hole.map, hole.terrain, hole.way, biome), hole.name);
  };
  const withColour = (gs: ReturnType<Scene['static']>, c: readonly number[]) =>
    gs.filter((x) => JSON.stringify((x as { albedo?: number[] }).albedo) === JSON.stringify(c.slice(0, 3)));
  const layerOf = (g: { texture?: Float32Array }) => g.texture && g.texture[0];

  it('wears its dust on the rough and out of bounds where its theme has one, and earth wears none', () => {
    for (const [biome, layer] of [
      ['desert', 2],
      ['moon', 3],
      ['future', 4],
    ] as const) {
      const made = groups(biome);
      const rough = made.filter((g) => layerOf(g) === layer && g.mesh.indices.length > 500);
      expect(rough.length, `${biome}: the rough in its dust`).toBeGreaterThan(0);
      expect(THEMES[biome].layers.rough!.layer).toBe(layer);
    }
    for (const g of groups()) if (g.texture) expect(layerOf(g)).toBe(1);
  });

  it('puts the future’s plate on its mown ground as well, and leaves the sand bare', () => {
    const made = groups('future');
    const mown = withColour(made, [...THEMES.future.ground.firstCut, 0.85]);
    expect(mown.length).toBeGreaterThan(0);
    for (const g of mown) expect(layerOf(g)).toBe(4);
    for (const g of withColour(made, [...THEMES.future.ground.golfSand, 0.9])) expect(g.texture).toBeUndefined();
    // and the desert’s mown ground is the turf’s, with only its rough in tufts
    for (const g of withColour(groups('desert'), [...THEMES.desert.ground.firstCut, 0.85])) expect(layerOf(g)).toBe(1);
  });
});
