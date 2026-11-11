/**
 * The hole's menu: when it may be opened, apart from the page, so the same rule says it to the page and to a test. It opens
 * over a hole in play and over nothing else: between holes the card is up, and under the start screen or the title there is
 * no hole to leave. Without it the page would have to read the game and the screens each time it was asked, and an Escape
 * could stop the time of a screen that has none.
 */
export interface MenuState {
  /** The hole's phase: `play`, `done` or `over`. */
  phase: string;
  /** Whether the start screen is up over the course. */
  choosing: boolean;
  /** Whether the title scene is up. */
  titled: boolean;
}

/** Whether the menu may be opened. */
export function menuMayOpen(s: MenuState): boolean {
  return s.phase === 'play' && !s.choosing && !s.titled;
}
