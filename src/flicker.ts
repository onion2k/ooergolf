/**
 * The flicker of the Future's holograms: which of a few levels of glow each tree is at, at any game time, a function of the hole's
 * name, the tree and the time alone (never the game's chance, never the wall clock), so a picture of the hole is the same every run
 * and a paused game holds every tree still. A tree is lit most of the time and dips now and then for a moment, dimmer or nearly out;
 * a tree a ball has gone through flares (`FLARE`) for a moment and then goes back to its flicker. Integers in and out and nothing made,
 * since the page asks of every tree every frame.
 */

/** The levels of glow, brightest first: flared, lit, dimmed, nearly out. */
export const LEVELS = { flare: 0, lit: 1, dim: 2, out: 3 } as const;

/** How the flicker goes: how many steps a second it changes at, and what share of the trees' steps are dimmed and nearly out. */
export const FLICKER = { rate: 7, dim: 0.07, out: 0.02 } as const;

/** How long a tree flares after a ball goes through it, in seconds. */
export const FLARE = { lasts: 0.6 } as const;

/** A hash of three integers, from nought to one: no array, no state. */
function hash(a: number, b: number, c: number): number {
  let h = Math.imul(a | 0, 0x27d4eb2d) ^ Math.imul(b | 0, 0x165667b1) ^ Math.imul(c | 0, 0x9e3779b1);
  h = Math.imul(h ^ (h >>> 15), 0x85ebca6b);
  h = Math.imul(h ^ (h >>> 13), 0xc2b2ae35);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
}

/** A seed from a name: FNV-1a, so the same name always flickers alike. */
export function seedOf(name: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < name.length; i++) h = Math.imul(h ^ name.charCodeAt(i), 0x01000193);
  return h >>> 0;
}

/**
 * The level of tree `k` of the hole whose name hashes to `seed` at game time `t`, `flared` seconds after a ball went through it
 * (a negative number, or any number past `FLARE.lasts`, for a tree no ball has gone through): `LEVELS.flare` while it flares,
 * and its flicker's level after.
 */
export function levelAt(seed: number, k: number, t: number, flared: number): number {
  if (flared >= 0 && flared < FLARE.lasts) return LEVELS.flare;
  // each tree steps on its own beat, so they do not dip together
  const step = Math.floor(t * FLICKER.rate + hash(seed, k, 7) * 8);
  const u = hash(seed, k, step);
  return u < FLICKER.out ? LEVELS.out : u < FLICKER.out + FLICKER.dim ? LEVELS.dim : LEVELS.lit;
}
