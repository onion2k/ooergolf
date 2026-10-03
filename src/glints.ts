/**
 * The twinkle on what is gold: the cup's rim and the knob on the pin. Now
 * and then one place flares, brief and bright and star-shaped, as a polished
 * thing does when the sun catches it; and as a ball drops into the cup,
 * all of it flashes at once. Which place and when come from game time alone,
 * so a picture is the same every time it is taken, and the page only draws
 * what this says.
 */

/** How long a glint lasts, and how long between one and the next, in seconds. */
export const GLINT = { flare: 0.35, every: 2.2 } as const;

/** How long all the gold flashes when a ball drops, in seconds. */
export const FLASH = { lasts: 0.5 } as const;

/**
 * How brightly all the gold flashes, from 0 to 1, `since` seconds after a
 * ball dropped into the cup: at its brightest at once, fading, and gone at
 * `lasts`, exactly, as before the ball dropped.
 */
export function flash(since: number): number {
  if (!(since >= 0) || since >= FLASH.lasts) return 0;
  return (1 - since / FLASH.lasts) ** 2;
}

/** Which of `places` places glints at time `t`, and how brightly, from 0 to 1. */
export function glint(t: number, places: number): { at: number; brightness: number } {
  if (places < 1) return { at: 0, brightness: 0 };
  const n = Math.floor(t / GLINT.every);
  // a hash of which beat it is, so the places come round in no order
  const h = Math.imul(n ^ 0x9e3779b9, 0x85ebca6b) >>> 0;
  const into = t - n * GLINT.every;
  if (into >= GLINT.flare) return { at: h % places, brightness: 0 };
  return { at: h % places, brightness: Math.sin((into / GLINT.flare) * Math.PI) };
}

/**
 * The sparkles of sun on the water: small and many where a glint is one and rare. Each is lit for `lit` of its
 * `period`, rising and falling, at a place of its own each time round and out of step with the rest, and there are
 * at most `most` on a hole, shared among its ponds, which leaves the gold its own room in the effects.
 */
export const SPARKLE = { period: 1.4, lit: 0.4, most: 6 } as const;

/** A hash of three integers, from nought to one. */
function unit(a: number, b: number, c: number): number {
  let h = Math.imul(a | 0, 0x27d4eb2d) ^ Math.imul(b | 0, 0x165667b1) ^ Math.imul(c | 0, 0x9e3779b1);
  h = Math.imul(h ^ (h >>> 15), 0x85ebca6b);
  h = Math.imul(h ^ (h >>> 13), 0xc2b2ae35);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
}

/**
 * Sparkle `i` of a pond called `seed` at time `t`: where it is, as a share of the room on the water from minus one to
 * one across and along, and how bright, from nought to one. Nought for most of its period.
 */
export function sparkle(
  t: number,
  seed: number,
  i: number,
  out: { u: number; v: number; brightness: number } = { u: 0, v: 0, brightness: 0 },
): { u: number; v: number; brightness: number } {
  const x = t / SPARKLE.period + i * 0.37;
  const cycle = Math.floor(x),
    into = (x - cycle) / SPARKLE.lit;
  out.u = unit(seed, i, cycle) * 2 - 1;
  out.v = unit(seed + 104729, i, cycle) * 2 - 1;
  out.brightness = into < 1 ? Math.sin(into * Math.PI) : 0;
  return out;
}

/** How many sparkles each of `ponds` ponds has, sharing `SPARKLE.most` out as fairly as it can; none for no ponds. */
export function sparkles(ponds: number): number[] {
  if (ponds < 1) return [];
  const base = Math.floor(SPARKLE.most / ponds),
    extra = SPARKLE.most % ponds;
  return Array.from({ length: ponds }, (_, k) => base + (k < extra ? 1 : 0));
}

/**
 * How long a kicker's flash lasts when a ball hits it, in seconds: quicker than the cup's, since a kicker is hit again
 * and again, and the next must be seen to be a new one.
 */
export const KICK_FLASH = { lasts: 0.3 } as const;

/**
 * How brightly a kicker flashes, from 0 to 1, `since` seconds after a ball hit it: the cup's flash curve, run over the
 * kicker's own shorter time, so one fade is said once and a hit and a hole are lit alike. Nought before it is hit.
 */
export function kickFlash(since: number): number {
  if (!(since >= 0) || since >= KICK_FLASH.lasts) return 0;
  return flash((since * FLASH.lasts) / KICK_FLASH.lasts);
}
