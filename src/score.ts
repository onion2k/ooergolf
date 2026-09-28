/**
 * What a score on a hole is called, as a golfer would say it: a hole in one,
 * an eagle, a birdie, par, a bogey and so on, or picked up at the limit. The
 * page shows it when a hole is done, and the card sums the round against par.
 */

/** The name for `strokes` on a hole of `par`, or for a hole picked up at the limit. */
export function scoreName(strokes: number, par: number, pickedUp = false): string {
  if (pickedUp) return 'Picked up';
  if (strokes === 1) return 'Hole in one!';
  const over = strokes - par;
  if (over <= -3) return 'Albatross!';
  if (over === -2) return 'Eagle!';
  if (over === -1) return 'Birdie!';
  if (over === 0) return 'Par';
  if (over === 1) return 'Bogey';
  if (over === 2) return 'Double bogey';
  if (over === 3) return 'Triple bogey';
  return `${over} over par`;
}

/**
 * What kind of score it is, which the page colours its name by and marks on
 * the card, as a golfer's card circles a birdie and boxes a bogey: a hole in
 * one before anything, under par, par, over it, or picked up at the limit.
 */
export type ScoreKind = 'ace' | 'under' | 'par' | 'over' | 'picked';
export const SCORE_KINDS: readonly ScoreKind[] = ['ace', 'under', 'par', 'over', 'picked'];

/** The kind of `strokes` on a hole of `par`, or of a hole picked up at the limit. */
export function scoreKind(strokes: number, par: number, pickedUp = false): ScoreKind {
  if (pickedUp) return 'picked';
  if (strokes === 1) return 'ace';
  return strokes < par ? 'under' : strokes === par ? 'par' : 'over';
}

/** A round's strokes against its par, as a card says it: "E" for level, "+3", "−2". */
export function againstPar(strokes: number, par: number): string {
  const d = strokes - par;
  return d === 0 ? 'E' : d > 0 ? `+${d}` : `−${-d}`;
}
