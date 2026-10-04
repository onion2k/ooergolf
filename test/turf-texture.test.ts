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
import { Scene, TURF } from '../src/scene';
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

  it('has the figures chosen by looking at three strengths: a layer, 1.4 units a tile, a third of the colour and a third of the height', () => {
    expect(TURF).toEqual({ layer: 1, repeat: 1 / 1.4, albedo: 0.2, shade: 0.15 });
  });

  it('is on the mown grounds of a golf hole and not on its rough or its out of bounds', () => {
    const hole = golfHole(LINKS_SPECS[1]);
    const groups = new Scene().static(layoutOf(hole.map, hole.terrain), hole.name);
    const want = [TURF.layer, TURF.repeat, TURF.albedo, TURF.shade].map(Math.fround);
    for (const c of [PALETTE.puttingGreen, PALETTE.puttingGreenMown, PALETTE.firstCut, PALETTE.teeBox]) {
      expect(texture(groupOf(groups, c)!), String(c)).toEqual(want);
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
