/**
 * When the Retake button is on the course: the rule, apart from the page, so the same words say it to the hud and to a
 * test. The button is only worth showing while pressing it does something, which is what `Game.mulligan` checks: the
 * item held, a stroke taken this hole, the round's one retake still unused, and the hole still in play. Without it the page
 * would have to read the game for each, and could show a button that does nothing.
 */
export interface RetakeState {
  /** Whether the Mulligan item is the one equipped. */
  held: boolean;
  /** The strokes taken on this hole. */
  strokes: number;
  /** Whether the round's retake has been taken. */
  used: boolean;
  /** The hole's phase: `play`, `done` or `over`. */
  phase: string;
  /** Whether the start screen is up over the course. */
  choosing: boolean;
}

/** Whether the Retake button is shown. */
export function retakeShown(s: RetakeState): boolean {
  return s.held && s.strokes >= 1 && !s.used && s.phase === 'play' && !s.choosing;
}
