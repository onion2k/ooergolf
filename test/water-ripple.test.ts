/**
 * The water moves, on the renderer's own ripple pattern, from the game's own clock. What the game says of it is small
 * and is held here: the part says its pattern kind and speed, `group` writes it as the renderer reads it and the old
 * kinds as they always were, the ponds' surface ripples and nothing round it does, and a stream's surface keeps the
 * marbling the streaks already move along it, since a pattern travels along the mesh's own east and a stream may run
 * any way. Without this a picture of the water could quietly go back to the still speckle.
 */
import { describe, expect, it } from 'vitest';
import { PATTERN_STRIDE } from 'artshape-render/game/renderer';
import { FLOW_RIPPLE, isFlowKind, packFlow } from 'artshape-render/game/flow';
import { PATTERN, group, type Part } from '../src/models/part';
import { PALETTE } from '../src/models/palette';
import { RIPPLE, streamBed, water, waterBed } from '../src/models/obstacles';
import { bumper } from '../src/models';

const tile = 3;
const cells: [number, number][] = [
  [0, 0],
  [1, 0],
];
const named = (parts: Part[], name: string) => parts.find((p) => p.name === name)!;

describe('the pattern kinds', () => {
  it('has the renderer’s ripple, by its number', () => {
    expect(PATTERN.ripple).toBe(FLOW_RIPPLE);
    expect(isFlowKind(PATTERN.ripple)).toBe(true);
    for (const kind of [PATTERN.swirl, PATTERN.bands, PATTERN.marbling, PATTERN.speckle])
      expect(isFlowKind(kind)).toBe(false);
  });
});

describe('group writes a placement’s pattern as the renderer reads it', () => {
  const mesh = bumper(1).parts[0].mesh;
  const part = (pattern: Part['pattern']): Part => ({ name: 'p', mesh, material: [0.1, 0.2, 0.3, 0.4], pattern });
  const second = [0.25, 0.5, 0.75] as const;

  it('writes a flow kind as packFlow does: kind, scale, speed, glow, the second colour', () => {
    const p = part({ kind: PATTERN.ripple, scale: 0.5, seed: 0, speed: 1.5, glow: 0.2, second });
    const g = group(p, new Float32Array(3 * 16));
    const want = new Float32Array(3 * PATTERN_STRIDE);
    for (let k = 0; k < 3; k++)
      packFlow(want, k * PATTERN_STRIDE, { kind: FLOW_RIPPLE, scale: 0.5, speed: 1.5, glow: 0.2, second: [...second] });
    expect(Array.from(g.patterns!)).toEqual(Array.from(want));
  });

  it('gives a flow kind with no glow a glow of nought, and the same speed to every placement', () => {
    const g = group(part({ kind: PATTERN.ripple, scale: 1, seed: 0.9, speed: 2, second }), new Float32Array(2 * 16));
    for (let k = 0; k < 2; k++) {
      expect(g.patterns![k * PATTERN_STRIDE + 2]).toBe(2);
      expect(g.patterns![k * PATTERN_STRIDE + 3]).toBe(0);
    }
  });

  it('writes an old kind exactly as it always did, bit for bit', () => {
    for (const kind of [PATTERN.swirl, PATTERN.bands, PATTERN.marbling, PATTERN.speckle]) {
      const seed = 0.37;
      const g = group(part({ kind, scale: 1.1, seed, second }), new Float32Array(4 * 16));
      const want = new Float32Array(4 * PATTERN_STRIDE);
      for (let k = 0; k < 4; k++) want.set([kind, 1.1, (seed + k * 0.618034) % 1, 0, ...second, 0], k * PATTERN_STRIDE);
      expect(Array.from(g.patterns!), `kind ${kind}`).toEqual(Array.from(want));
    }
  });
});

describe('the water ripples, and what is round it does not', () => {
  it('has a surface that is the ripple, in the crests’ colour, with a speed and no glow of its own', () => {
    for (const [what, model] of [
      ['a bed', waterBed(cells, tile)],
      ['the showcase pond', water(tile, tile)],
    ] as const) {
      const p = named(model.parts, 'surface').pattern!;
      expect(p.kind, what).toBe(PATTERN.ripple);
      expect(p.scale, what).toBe(RIPPLE.scale);
      expect(p.speed, what).toBe(RIPPLE.speed);
      expect(p.speed!, what).toBeGreaterThan(0);
      expect(p.glow ?? 0, what).toBe(0);
      expect(Array.from(p.second), what).toEqual(Array.from(PALETTE.waterVein));
    }
  });

  it('leaves the foam, the shallows and the mid water as they were: no pattern', () => {
    for (const model of [waterBed(cells, tile), water(tile, tile)])
      for (const name of ['foam', 'shallows', 'mid']) expect(named(model.parts, name).pattern, name).toBeUndefined();
  });

  it('draws a pond’s surface through the flowing build: its group is a flow kind', () => {
    const surface = named(waterBed(cells, tile).parts, 'surface');
    const g = group(surface, new Float32Array(16));
    expect(isFlowKind(g.patterns![0])).toBe(true);
    expect(g.patterns![2]).toBe(RIPPLE.speed);
  });

  it('keeps a stream’s surface marbled: it runs any way, and a pattern travels east', () => {
    expect(named(streamBed(cells, tile).parts, 'surface').pattern!.kind).toBe(PATTERN.marbling);
  });

  it('has a scale and a speed that suit a tile of three units: cells a tile wide at most, a walking pace', () => {
    expect(RIPPLE.scale * tile).toBeGreaterThanOrEqual(1);
    expect(RIPPLE.scale * tile).toBeLessThanOrEqual(3);
    expect(RIPPLE.speed).toBeGreaterThanOrEqual(0.5);
    expect(RIPPLE.speed).toBeLessThanOrEqual(2);
  });
});
