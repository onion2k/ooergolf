/**
 * The twinkle on what is gold: the cup's rim and the knob on the pin. Now
 * and then one place flares, brief and bright and star-shaped, as a polished
 * thing does when the sun catches it. Which place and when come from game
 * time alone, so a picture is the same every time it is taken, and the page
 * only draws what this says.
 */

/** How long a glint lasts, and how long between one and the next, in seconds. */
export const GLINT = { flare: 0.35, every: 2.2 } as const;

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
