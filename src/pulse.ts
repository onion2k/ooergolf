/**
 * The aim's dots pulsing while a drag is held: each swells a little and eases
 * back, the swell running out along them from the ball, so the aim reads as
 * alive and pointing the way the ball will go. From game time, so a picture
 * taken at the same moment is the same picture. Only drawing: it changes
 * nothing about the shot the drag makes.
 */

/** How much bigger a dot swells, as a share of its size; how many swells a second; and how far behind the dot before it each dot is, in swells. */
export const PULSE = { size: 0.14, often: 1.4, behind: 0.09 } as const;

/** How big dot `k` of the aim, counted out from the ball, is drawn at game time `t`, against its size. */
export function pulse(t: number, k: number): number {
  return 1 + PULSE.size * Math.sin(2 * Math.PI * (t * PULSE.often - k * PULSE.behind));
}
