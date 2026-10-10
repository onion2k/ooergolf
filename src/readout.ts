/**
 * What a golfer is told of the pin from where the ball lies: how far it is along the ground and how much higher or
 * lower than the ball it stands, in yards (a unit is a yard); where a shot would come down, with its shape and spin; and
 * the wind, as words and as the way its arrow turns on a screen the camera has turned. Arithmetic on a layout, so it is
 * tested without a page; the page shows the words and never works the numbers out.
 */
import { heightAt, type Layout } from './arena';
import { speedName, type Break } from './green';
import { SURFACES, type Lie } from './surfaces';

export interface Pin {
  /** How far to the cup across the ground, in yards. */
  yards: number;
  /** How much higher the cup stands than the ball: under nought for a cup that is lower. */
  rise: number;
}

/** The pin as it is from (x, y), a ball lying on the ground there. */
export function pinReadout(layout: Layout, x: number, y: number): Pin {
  const { cup } = layout;
  return {
    yards: Math.hypot(cup.x - x, cup.y - y),
    rise: heightAt(layout, cup.x, cup.y) - heightAt(layout, x, y),
  };
}

/** The least rise or fall, in yards, that is worth an arrow: under it the shot is level for a golfer's purpose. */
const LEVEL = 0.5;

/** The pin as words: whole yards, and an arrow up or down with the rise or fall in whole yards when there is one. */
export function pinText(pin: Pin): string {
  const yards = `${Math.round(pin.yards)} yd`;
  if (pin.rise >= LEVEL) return `${yards} ▲ ${Math.round(pin.rise)}`;
  if (pin.rise <= -LEVEL) return `${yards} ▼ ${Math.round(-pin.rise)}`;
  return yards;
}

/**
 * What a shot is struck to do, as the preview works it out: how far it carries, what it comes to, what ground, and whether
 * a tree is met; and the shape and the spin chosen for it (nought, or none given, is straight and flat).
 */
export interface Landing {
  carry: number;
  end: 'landed' | 'holed' | 'water' | 'out';
  lie: Lie;
  hit: boolean;
  shape?: number;
  spin?: number;
  /** For the ghost shot: how far from the ball, in yards, it comes to rest after it lands; none where the item is not held or the ball does not land. */
  rest?: number;
}

/** The words for a shot's shape and spin, as a golfer says them: a draw or a fade, backspin or topspin, and nothing for straight and flat. */
export function shapingWords(shape = 0, spin = 0): string[] {
  const words: string[] = [];
  if (shape < 0) words.push('draw');
  else if (shape > 0) words.push('fade');
  if (spin < 0) words.push('back');
  else if (spin > 0) words.push('top');
  return words;
}

/**
 * Where a shot would come down, in words: its shape and spin first when it has any, then the tree in the way if there is
 * one, then how far and what it comes down on, which is the news where it is the water or out of bounds; or that it
 * drops in the cup.
 */
export function landingText(l: Landing): string {
  const shaped = shapingWords(l.shape, l.spin).map((w) => `${w} \u00b7 `);
  if (l.end === 'holed') return `${shaped.join('')}drops in the cup`;
  const yards = `lands ${Math.round(l.carry)} yd`;
  const where =
    l.end === 'water' ? 'in the water' : l.end === 'out' ? 'out of bounds' : (SURFACES[l.lie]?.name ?? 'ground');
  const rests = l.rest !== undefined && l.end === 'landed' ? ` \u00b7 rests ${Math.round(l.rest)} yd` : '';
  return `${shaped.join('')}${l.hit ? 'hits a tree \u00b7 ' : ''}${yards} \u00b7 ${where}${rests}`;
}

/** What the wind is called on the page: whole miles an hour, or calm, so a player always knows. */
export function windText(speed: number): string {
  const mph = Math.round(speed);
  return mph >= 1 ? `${mph} mph` : 'calm';
}

/**
 * How far a wind arrow, drawn pointing up, is turned clockwise on the screen, in degrees from minus one hundred and
 * eighty to one hundred and eighty, for a wind blowing toward the unit vector (`x`, `y`) on the ground, seen by a
 * camera turned `azimuth` radians: it faces (sin a, cos a), which is up the screen, and its right is (cos a, -sin a).
 */
export function windArrow(x: number, y: number, azimuth: number): number {
  const sx = x * Math.cos(azimuth) - y * Math.sin(azimuth),
    sy = x * Math.sin(azimuth) + y * Math.cos(azimuth);
  return (Math.atan2(sx, sy) * 180) / Math.PI;
}

/** The least break or climb, in yards, a putt's words say anything of: under it the putt is straight, or level, for a golfer's purpose. */
const NOTICE = 0.1;

/**
 * A putt's break as words, from where the ball lies to the cup: how far to aim off the cup and to which side, and how much
 * it climbs or falls, each to a tenth of a yard and each only when it is that much; "straight" when neither is. The
 * numbers are `breakOf`'s, which the page works out when the ball comes to rest and never in a frame.
 */
export function puttText(b: Break): string {
  const parts: string[] = [];
  if (Number.isFinite(b.across) && Math.abs(b.across) >= NOTICE)
    parts.push(`aim ${Math.abs(b.across).toFixed(1)} yd ${b.across > 0 ? 'right' : 'left'}`);
  if (Number.isFinite(b.rise) && Math.abs(b.rise) >= NOTICE)
    parts.push(`${b.rise > 0 ? 'uphill' : 'downhill'} ${Math.abs(b.rise).toFixed(1)} yd`);
  return `Putt: ${parts.length ? parts.join(', ') : 'straight'}`;
}

/** How fast a hole's greens run, as a word, from its own speed; none for a hole that has not set one, so it reads as it always did. */
export function greensText(greens: number | undefined): string | null {
  if (greens === undefined) return null;
  const name = speedName(greens);
  return `${name === 'medium' ? 'Medium' : name === 'fast' ? 'Fast' : 'Slow'} greens`;
}

/**
 * How a drag that is held was begun: by a finger, which takes it back with a second one, or by a mouse or a pen, which has no
 * second pointer and takes it back by letting go where it pressed (a drag shorter than `DRAG.dead` of the screen is no shot).
 */
export type Held = 'touch' | 'pointer' | null;

/**
 * How long a drag has been held, in seconds of game time, before the help tells how to take it back: a player who has held it for
 * a moment is deciding, and is the one who wonders how to cancel, and a shot struck at once is not nagged. Longer than a flick of a
 * shot and well under the time it takes to line one up.
 */
export const HELD_HINT = { after: 0.6 } as const;

/** How a drag held since game time `since` was begun, as far as the help tells of it at game time `now`: none until it has been held `HELD_HINT.after`. */
export function heldHint(how: Exclude<Held, null>, since: number, now: number): Held {
  return now - since >= HELD_HINT.after ? how : null;
}

/**
 * What the help beside the course says. While no drag is held it says what one does, which is look round the hole from overhead,
 * swing on a golf hole and putt on minigolf; while one is held in the normal view it says how to take it back, which a player was
 * not told and did not find (10 October 2026: "it's not clear that a two finger tap cancels the current aim"). From overhead a drag is
 * a pan and holds no shot, so there is nothing to take back and it says what it always did.
 */
export function helpText(state: { overhead: boolean; swing: boolean; held: Held }): string {
  if (state.overhead) return 'drag to look round the hole';
  if (state.held === 'touch') return 'tap a second finger to cancel';
  if (state.held === 'pointer') return 'let go where you pressed to cancel';
  return state.swing ? 'drag back and let go to swing' : 'drag back and let go to putt';
}
