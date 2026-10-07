/**
 * When the title screen may leave. It is shown while the game boots, fading in, and fades out once the game is ready,
 * but never before it has been seen in full: a game that is ready in a blink would otherwise cut the fade-in off and
 * leave a picture that flickered. Page time, in milliseconds, and nothing of the game's: the game is not running yet,
 * and its clock and its chance are never read here.
 */

/** How long the title takes to fade in and to fade out, in milliseconds. */
export const TITLE = { fadeIn: 600, fadeOut: 600 } as const;

/** The fades a player gets: none, at their word, when they have asked for less motion. */
export function fades(reducedMotion: boolean): { fadeIn: number; fadeOut: number } {
  return reducedMotion ? { fadeIn: 0, fadeOut: 0 } : { fadeIn: TITLE.fadeIn, fadeOut: TITLE.fadeOut };
}

/** How much longer the title stays, from the moment the game is ready, so that its fade-in, begun at `shown`, is over first. */
export function leaveDelay(shown: number, ready: number, reducedMotion: boolean): number {
  const end = shown + fades(reducedMotion).fadeIn;
  return Math.min(TITLE.fadeIn, Math.max(0, end - ready));
}
