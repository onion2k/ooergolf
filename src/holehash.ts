/**
 * A hole's hash, in one place for the tests that hold a hole to what it was and for `npm run field`, whose table is keyed by it.
 * Without it the script and the test would each say what "the same hole" means, and could drift apart.
 */
import type { HoleDef } from './course';

/**
 * A hole held to a hash: FNV-1a over everything `HoleDef` carries that a later field could change (the map, the par, the wind,
 * the greens' speed, the obstacles, and the terrain's own bytes, which are a grid of digits or the floats), so a hole that was
 * there before a new option is added can be shown to be what it was, bit for bit. Each field is written with its own tag, and
 * an absent one differently from a present zero, since "not given" is the default a new field must leave alone.
 */
export function hashHole(hole: HoleDef): number {
  let x = 2166136261;
  const byte = (b: number) => {
    x = Math.imul(x ^ (b & 0xff), 16777619) >>> 0;
  };
  const text = (s: string) => {
    for (let i = 0; i < s.length; i++) {
      byte(s.charCodeAt(i));
      byte(s.charCodeAt(i) >> 8);
    }
    byte(0);
  };
  text(hole.name);
  text(hole.map.join('\n'));
  text(JSON.stringify([hole.par, hole.wind ?? null, hole.greens ?? null, hole.obstacles ?? null]));
  const t = hole.terrain;
  if (t === undefined) text('flat');
  else if (t instanceof Float32Array) for (const b of new Uint8Array(t.buffer, t.byteOffset, t.byteLength)) byte(b);
  else text(t.join('\n'));
  return x;
}
