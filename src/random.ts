/**
 * Chance, from one place. The game is handed a source of it and never
 * reaches for Math.random itself, which is what lets the same seed give the
 * same game twice: the fuzzer's replays, the determinism check and every
 * baseline gate rest on that.
 */
export type Random = () => number;

/** A number in [0, 1) from a seed: a small linear congruential generator, the same everywhere. */
export function seeded(seed: number): Random {
  let s = (seed * 2654435761 + 1) >>> 0;
  return () => {
    s = (s * 1664525 + 1013904223) >>> 0;
    return s / 4294967296;
  };
}

/**
 * A number in [0, 1) from a list of whole numbers, and nothing else: the same keys give the same number every time and no
 * state is kept, so a thing that wants a coin that is the same each time it asks, and that must not spend the game's chance, can
 * be given one (the camera's choice of which side of the flag to look to, say). The keys are mixed in order, a word at a time,
 * with the finalizer of a 32-bit murmur hash; a key that is not a whole number is cut to one.
 */
export function hashed(...keys: number[]): number {
  let h = 0x9e3779b9;
  for (const key of keys) {
    let k = Math.imul(Math.floor(Number.isFinite(key) ? key : 0) | 0, 0xcc9e2d51);
    k = (k << 15) | (k >>> 17);
    k = Math.imul(k, 0x1b873593);
    h ^= k;
    h = (h << 13) | (h >>> 19);
    h = Math.imul(h, 5) + 0xe6546b64;
  }
  h ^= keys.length;
  h ^= h >>> 16;
  h = Math.imul(h, 0x85ebca6b);
  h ^= h >>> 13;
  h = Math.imul(h, 0xc2b2ae35);
  h ^= h >>> 16;
  return (h >>> 0) / 4294967296;
}
