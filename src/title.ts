/**
 * How the title screen leaves. The boot panel is plain sky, the title's own blue, from the first paint, and once the title's
 * letters are drawn it fades away to the title scene behind it (a hole of The Links with "Of Course!" dropping in over it).
 * Page time and nothing of the game's: the game is not running yet, and its clock and its chance are never read here.
 */

/** How long the panel takes to fade away, in milliseconds. */
export const TITLE = { fadeOut: 300 } as const;

/** The fade a player gets: none, at their word, when they have asked for less motion, and none for a page that skips the title. */
export function fades(reducedMotion: boolean): { fadeOut: number } {
  return reducedMotion ? { fadeOut: 0 } : { fadeOut: TITLE.fadeOut };
}
