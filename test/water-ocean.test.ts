/**
 * Open water, which every hole's ponds and streams are drawn in: the renderer's `FLOW_WATER` on the water's bed, and none
 * of the rings, the splash ring or the streaks that the rippling water wore, since the waves are the whole of it. A
 * minigolf hole's waves are finer than a golf hole's (`OCEAN.minigolfScale`), since its ponds are a few tiles across and
 * seen from close. The rippling water is kept, bit for bit, behind the one switch (`OCEAN_ON`), which is held to change
 * both beds and everything drawn over them together, so a hole can be given it back by that figure alone.
 */
import { createHash } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import { FLOW_WATER } from 'artshape-render/game/flow';
import { layoutOf } from '../src/arena';
import { Obstacles } from '../src/obstacles';
import { OCEAN, OCEAN_ON, oceanFor, oceanScaleFor, streamBed, waterBed } from '../src/models';
import { PALETTE } from '../src/models/palette';
import { PATTERN } from '../src/models/part';
import type { Model } from '../src/models/part';
import { Scene } from '../src/scene';
import { STILL } from 'artshape-render/game/grass';
import { STREAM_HOLE } from './stream-hole';

const CELLS: [number, number][] = [
  [2, 3],
  [3, 3],
  [4, 3],
  [3, 4],
];
/** A golf hole with a pond on it, and a minigolf hole with two ponds. */
const GOLF_POND = [
  '###########',
  '#rrrrrrrrr#',
  '#rggCggggr#',
  '#rrrrrrrrr#',
  '#rff~~~ffr#',
  '#rff~~~ffr#',
  '#rrrrrrrrr#',
  '#rrrtTtrrr#',
  '###########',
];
const MINI_POND = [
  '###########',
  '#....C....#',
  '#.........#',
  '#..~~~~...#',
  '#..~~~~...#',
  '#.........#',
  '#....T....#',
  '###########',
];

/** A model as a hash of everything that is drawn of it: its meshes, materials and patterns, in order. */
function hashOf(m: Model): string {
  const h = createHash('sha256');
  for (const part of [...m.parts, ...m.moving]) {
    h.update(part.name);
    h.update(Buffer.from(part.mesh.positions.buffer, part.mesh.positions.byteOffset, part.mesh.positions.byteLength));
    h.update(JSON.stringify([part.material, part.pattern ?? null]));
  }
  return h.digest('hex').slice(0, 16);
}

const surfaceOf = (m: Model) => m.parts.find((p) => p.name === 'surface')!;

function sceneOf(map: readonly string[], obstacles?: Obstacles) {
  const l = layoutOf(map);
  const scene = new Scene();
  const fixed = scene.static(l, 'ocean', obstacles);
  scene.dynamic(obstacles, l, 'ocean', STILL);
  return { l, scene, fixed };
}
/** The groups of a hole's fixed scene that are drawn in open water. */
const open = (fixed: { patterns?: Float32Array }[]) => fixed.filter((g) => g.patterns?.[0] === PATTERN.ocean);

describe('open water', () => {
  it('is the renderer’s own kind of that number', () => {
    expect(PATTERN.ocean).toBe(FLOW_WATER);
  });

  it('is on for golf and for minigolf, by one switch', () => {
    expect(oceanFor(true)).toBe(true);
    expect(oceanFor(false)).toBe(true);
    expect(OCEAN_ON).toEqual({ golf: true, minigolf: true });
  });

  it('has waves of golf’s size on golf, and finer ones on minigolf, whose ponds are small and seen from close', () => {
    expect(oceanScaleFor(true)).toBe(OCEAN.scale);
    expect(OCEAN.scale).toBe(0.3);
    expect(oceanScaleFor(false)).toBe(OCEAN.minigolfScale);
    expect(OCEAN.minigolfScale).toBe(0.6);
    expect(surfaceOf(waterBed(CELLS, 3, { look: 'ocean' })).pattern?.scale, 'a bed told nothing is golf’s').toBe(
      OCEAN.scale,
    );
    expect(surfaceOf(waterBed(CELLS, 3, { look: 'ocean', scale: 0.6 })).pattern?.scale).toBe(0.6);
    expect(surfaceOf(streamBed(CELLS, 3, { look: 'ocean', scale: 0.6 })).pattern?.scale).toBe(0.6);
  });

  it('draws a pond’s deep water in its waves and body, and leaves the foam and the shallows as they are', () => {
    const wet = waterBed(CELLS, 3, { look: 'ocean' });
    const dry = waterBed(CELLS, 3);
    const deep = surfaceOf(wet);
    expect(deep.pattern).toEqual({
      kind: PATTERN.ocean,
      scale: OCEAN.scale,
      seed: 0,
      speed: OCEAN.speed,
      glow: OCEAN.tilt,
      second: OCEAN.tint,
    });
    expect([...deep.material.slice(0, 3)]).toEqual([...OCEAN.body]);
    expect(deep.material[3], 'glossy as the water is').toBeLessThan(0.2);
    expect(wet.parts.map((p) => p.name)).toEqual(dry.parts.map((p) => p.name));
    for (const part of wet.parts) {
      if (part === deep) continue;
      expect(part, part.name).toEqual(dry.parts.find((p) => p.name === part.name));
    }
  });

  it('draws a stream bed the same way, in the same waves', () => {
    const deep = surfaceOf(streamBed(CELLS, 3, { look: 'ocean' }));
    expect(deep.pattern?.kind).toBe(PATTERN.ocean);
    expect(deep.pattern?.speed).toBe(OCEAN.speed);
    expect([...deep.material.slice(0, 3)]).toEqual([...OCEAN.body]);
  });

  it('leaves the rippling water and the marbled stream exactly as they were, which is what minigolf is drawn in', () => {
    expect(surfaceOf(waterBed(CELLS, 3)).pattern?.kind).toBe(PATTERN.ripple);
    expect(surfaceOf(waterBed(CELLS, 3)).material.slice(0, 3)).toEqual(PALETTE.water.slice(0, 3));
    expect(surfaceOf(streamBed(CELLS, 3)).pattern?.kind).toBe(PATTERN.marbling);
    // hashed from the beds as they were on main, before there was a look to choose
    expect(hashOf(waterBed(CELLS, 3))).toBe('2c888d337423dc18');
    expect(hashOf(streamBed(CELLS, 3, { seed: 5 }))).toBe('bfafe386631712ce');
  });
});

describe('a hole’s water, in the scene', () => {
  it('is open water on a golf hole, whose scene has none of the rings, the splash ring or the streaks', () => {
    const { fixed, scene } = sceneOf(GOLF_POND);
    // the pond's, and the far lake's past the hills, which is the hole's water too
    expect(open(fixed).length, 'a bed of waves').toBe(2);
    // the same hole in ripples has a pool of rings for its pond and a ring for a ball that went in, and this has neither
    const moving = scene.writeMoving(3).length;
    OCEAN_ON.golf = false;
    try {
      expect(sceneOf(GOLF_POND).scene.writeMoving(3).length - moving, 'a pool of rings and a splash ring fewer').toBe(
        2,
      );
    } finally {
      OCEAN_ON.golf = true;
    }
    scene.splashedAt(10, 10, 2);
    expect(scene.splashReach(2.3), 'no ring to read back').toBe(0);
  });

  it('is still a known pond, but has no sparkles, its waves glinting enough', () => {
    const { scene } = sceneOf(GOLF_POND);
    expect(scene.ponds.length).toBe(1);
    for (let t = 0; t < 30; t += 0.1) expect(scene.sparkles(t)).toEqual([]);
  });

  it('is open water on a minigolf hole too, in finer waves, with no rings, splash ring, sparkles or streaks', () => {
    const base = sceneOf(MINI_POND);
    expect(open(base.fixed).length, 'a bed of waves, and the far lake').toBe(2);
    expect(open(base.fixed)[0].patterns?.[1], 'in minigolf’s waves').toBeCloseTo(OCEAN.minigolfScale, 6);
    expect(
      base.scene.writeMoving(3).filter((m) => m.looks && m.matrices.length > 16),
      'no pool of rings',
    ).toEqual([]);
    base.scene.splashedAt(10, 10, 2);
    expect(base.scene.splashReach(2.3), 'no splash ring').toBe(0);
    for (let t = 0; t < 30; t += 0.1) expect(base.scene.sparkles(t)).toEqual([]);
    const l = layoutOf(STREAM_HOLE.map);
    const stream = sceneOf(STREAM_HOLE.map, new Obstacles(STREAM_HOLE.obstacles!, l));
    expect(open(stream.fixed).length, 'the streams in waves').toBeGreaterThan(0);
    // a streak is coloured by its fade, so whatever else moves on the hole, nothing tinted is a streak
    expect(
      stream.scene.writeMoving(3).filter((m) => m.looks),
      'and no streaks over them',
    ).toEqual([]);
  });

  it('changes everywhere together when the switch is turned: beds, rings, splash ring and streaks', () => {
    const l = layoutOf(STREAM_HOLE.map);
    const mk = () => new Obstacles(STREAM_HOLE.obstacles!, l);
    const asWas = {
      pond: sceneOf(MINI_POND).scene.writeMoving(3).length,
      stream: sceneOf(STREAM_HOLE.map, mk()).scene.writeMoving(3).length,
    };
    OCEAN_ON.minigolf = false;
    try {
      const pond = sceneOf(MINI_POND);
      expect(open(pond.fixed), 'the pond is rippling again').toEqual([]);
      expect(pond.scene.writeMoving(3).length, 'with its rings').toBeGreaterThan(asWas.pond);
      pond.scene.splashedAt(10, 10, 2);
      expect(pond.scene.splashReach(2.3), 'and its splash ring').toBeGreaterThan(0);
      const stream = sceneOf(STREAM_HOLE.map, mk());
      expect(open(stream.fixed), 'the stream is marbled').toEqual([]);
      expect(stream.scene.writeMoving(3).length, 'with its streaks').toBeGreaterThan(asWas.stream);
    } finally {
      OCEAN_ON.minigolf = true;
    }
    OCEAN_ON.golf = false;
    try {
      const golf = sceneOf(GOLF_POND);
      expect(open(golf.fixed), 'golf, turned off, is rippling again').toEqual([]);
      expect(golf.scene.writeMoving(3).filter((m) => m.looks && m.matrices.length > 16).length).toBe(1);
    } finally {
      OCEAN_ON.golf = true;
    }
  });
});
