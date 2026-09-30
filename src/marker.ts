/**
 * The mark where a lofted ball first came down, so a player sees how far a club took it and can judge the next: a
 * ring that opens at the spot, holds while it is looked at, and closes away. Its size is worked out from the time
 * since the ball landed alone, so a picture taken at the same moment is the same picture, and nothing that is played
 * depends on it.
 */

/** How long the mark lasts, in seconds; how long it takes to open and to close; and the ring's outer radius in units. */
export const MARK = { lasts: 6, opens: 0.25, closes: 1.5, radius: 2.6 } as const;

/**
 * How open the mark is, `since` seconds after the ball landed: from a little to all of it in `opens`, all of it while
 * it holds, and back to nothing over the last `closes`. Nought before the landing, and from `lasts` on.
 */
export function markSize(since: number): number {
  if (!(since >= 0) || since >= MARK.lasts) return 0;
  if (since < MARK.opens) {
    const life = since / MARK.opens;
    // eased out, from a fifth of it, so it is seen to open and is never a dot
    return 0.2 + 0.8 * (1 - (1 - life) ** 2);
  }
  const left = MARK.lasts - since;
  return left >= MARK.closes ? 1 : left / MARK.closes;
}
