/**
 * What a golf shot has besides its aim and its power, and what the air does to it: a shape (a draw or a fade, a heading
 * that turns as the ball flies), a spin (backspin or topspin, which takes more or less of its speed off at the landing),
 * and a wind that pushes it, steady, for as long as it is in the air. Pure arithmetic and content, a leaf that the game,
 * the preview and the autopilot's rehearsal all read, so they agree to the digit and nothing is worked out twice. Without
 * it the game and the grass would each have their own idea of which way the wind blows, and a flag would fly one way
 * while the ball was pushed the other.
 *
 * The figures are measured in the game (`test/shaping.test.ts` holds each to what it is for) and not worked out: a
 * flight here is a second or two long, so what a mile an hour of wind does is a good deal more than the real thing, and
 * is meant to be: a wind is a thing to be read on a hole that is a few seconds of ball.
 */
import { PHYSICS, strikeSpeed } from './arena';
import { loftOf, type BagClub } from './bag';
import { seeded } from './random';
import { NO_KIT, type Kit } from './items';
import { LIE, surfaceFor, type Lie } from './surfaces';

/**
 * The wind: how hard it pushes a ball, in yards a second a second for each mile an hour of it, and the most any hole has
 * (a hole's wind is in miles an hour in its content, nought for calm, which is every hole of minigolf).
 * Measured: ten miles an hour carries a full driver about ten yards further with it, or ten yards off its line across it.
 */
export const WIND = { push: 1.4, most: 25 } as const;

/**
 * A shape: how fast the ball's heading turns, in radians a second, at the fullest draw or fade from a club of no loft;
 * and the loft, in degrees, at which a club puts no shape on a ball at all. A flatter face puts more side spin on, so a
 * driver curves a long way and a sand wedge hardly at all, which is also what a golfer finds.
 */
export const SHAPE = { turn: 0.19, straight: 72 } as const;

/**
 * A spin: how much more of its speed along the ground a ball keeps at the landing for the fullest topspin, and how much
 * less for the fullest backspin (which is more than all of it, so that a ball is checked and comes back a little).
 */
export const SPIN = { top: 1, back: 1.4, keepMost: 1.2 } as const;

/**
 * The shape and the spin of a putt on minigolf, for a club that gives them: a shape curves it along the ground for its first
 * `seconds` or until it first knocks, whichever comes first (so a ball could never be steered along a rail for good), and a
 * spin changes the speed it leaves its first knock with: topspin adds up to `top` of it and backspin takes up to `back`,
 * as golf's spin tells at the first landing.
 */
export const PUTT_SHAPE = { seconds: 1, top: 0.3, back: 0.4 } as const;

/** How fast a putt struck with `shape` curves along the ground, in radians a second, a fade positive as golf's is; nought for no bend in the kit. */
export function bendRate(shape: number, kit: Kit): number {
  if (!Number.isFinite(shape) || kit.bend === 0) return 0;
  return Math.max(-1, Math.min(1, shape)) * kit.bend;
}

/** How many times as fast a putt struck with `spin` leaves its first knock: one for a kit with no putt spin, or a flat putt. */
export function puttSpinFactor(spin: number, kit: Kit): number {
  if (!Number.isFinite(spin) || kit.puttSpin === 0) return 1;
  const s = Math.max(-1, Math.min(1, spin));
  return 1 + (s > 0 ? PUTT_SHAPE.top : PUTT_SHAPE.back) * s * kit.puttSpin;
}

/** A seed from a name: FNV-1a, so the same hole grows the same grass and blows the same wind, every time. */
export function nameSeed(name: string): number {
  let h = 0x811c9dc5;
  for (const c of name) h = Math.imul(h ^ c.charCodeAt(0), 0x01000193);
  return h >>> 0;
}

/**
 * Which way a hole's wind blows, as a unit vector across the ground (x, y): the first draw of the hole's own wind, which
 * is the way the grass bends and the flag flies (`windOf` in `turf.ts` reads it from here), so the ball is pushed the way
 * the page shows.
 */
export function windDirection(name: string): [number, number] {
  const a = seeded(nameSeed(`${name} wind`))() * Math.PI * 2;
  return [Math.cos(a), Math.sin(a)];
}

/** How hard the wind of `speed` miles an hour pushes a ball in the air, in yards a second a second; nought for one that is not a wind. */
export function windPush(speed: number): number {
  return Number.isFinite(speed) ? Math.max(0, Math.min(WIND.most, speed)) * WIND.push : 0;
}

/**
 * How fast a shape of `shape` (from minus one, a draw, to one, a fade) turns the heading of a ball struck with a club of
 * `loft` degrees, in radians a second. A fade is positive and turns the ball to the right of its line of flight, seen from
 * behind it, which is clockwise from above, the heading angle (from +x toward +y) growing smaller; a draw is negative and
 * turns it left. A shape beyond its limits is held to them, and one that is not a number is none.
 */
export function curveRate(shape: number, loft = 0, kit: Kit = NO_KIT): number {
  if (!Number.isFinite(shape)) return 0;
  const s = Math.max(-1, Math.min(1, shape));
  return s * SHAPE.turn * Math.max(0, 1 - Math.max(0, loft) / SHAPE.straight) * kit.curve;
}

/**
 * The share of its speed along the ground that a ball landing on a surface that keeps `keep` of it keeps, with `spin` on it
 * (from minus one, backspin, to one, topspin): the plain `keep` times more for topspin, and less for backspin, which at the
 * fullest is below nought, a ball checked so hard that it comes back along the ground.
 */
export function spunKeep(keep: number, spin: number, kit: Kit = NO_KIT, gain = 1): number {
  if (!Number.isFinite(spin)) return keep;
  const s = Math.max(-1, Math.min(1, spin));
  const kept = keep * (1 + (s > 0 ? SPIN.top : SPIN.back) * s * kit.spin * gain);
  // twice the topspin would send a ball on faster than it came down, which the plain table never does by more than a sixth
  return kit.spin !== 1 || gain !== 1 ? Math.min(kept, SPIN.keepMost) : kept;
}

/**
 * How long a ball struck with `club` at `power` from a ball that lies on `lie` is in the air, on the level, in seconds:
 * nought for a club that has no loft. The carry's own arithmetic (twice the climb over gravity), with what the lie does to
 * the speed and the loft; measured against the game, it is within a physics step of it.
 */
export function airTime(club: BagClub, power: number, lie: Lie = LIE.tee, kit: Kit = NO_KIT): number {
  if (!(club.loft > 0)) return 0;
  const surface = surfaceFor(lie, kit);
  const speed = strikeSpeed(Math.max(0, Math.min(1, power)), club.hardest) * surface.power;
  return (2 * speed * Math.sin(((loftOf(club, kit) + surface.loft) * Math.PI) / 180)) / PHYSICS.gravity;
}

/**
 * How much further a tailwind of `speed` miles an hour carries a ball struck with `club` at `power`, in yards, on the level
 * (and how far a headwind takes off it, and a crosswind turns it aside at the landing): a steady push for as long as it is in the
 * air, so half its push times the time in the air, squared.
 */
export function windReach(club: BagClub, power: number, speed: number, lie: Lie = LIE.tee, kit: Kit = NO_KIT): number {
  const t = airTime(club, power, lie, kit);
  return 0.5 * windPush(speed) * kit.wind * t * t;
}
