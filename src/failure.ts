/**
 * What the page says when it cannot go on: why something was thrown, and which hole could not be drawn. Words and nothing
 * else, so they are tested without a page; the page puts them on its boot screen. Without them a hole the scene refused
 * would be told as the refusal's own words alone, a collar's width or a field's size with no hole's name to say where, and
 * a value thrown that is not an error would be a blank, or a word that was not meant for a player.
 */

/** What is said when something was thrown with nothing to say for it. */
const NO_REASON = 'no reason was given';

/**
 * Why something was thrown, in words: an error's message, or its name where it has none; what a thing that is not an error
 * says, an object by its message and a string or a number as it stands; and `NO_REASON` where there is nothing to say,
 * which is every other object, since its default words are `[object Object]`. Never thrown itself, whatever it is handed,
 * since it is what the page runs as it fails.
 */
export function reasonOf(err: unknown): string {
  try {
    if (err instanceof Error) return err.message || err.name;
    if (typeof err === 'object' && err !== null && 'message' in err && typeof err.message === 'string')
      return err.message || NO_REASON;
    if (typeof err === 'string' || typeof err === 'number' || typeof err === 'boolean' || typeof err === 'bigint')
      return String(err) || NO_REASON;
  } catch {
    // an object that throws when it is read has no reason to give either
  }
  return NO_REASON;
}

/**
 * What the page says when hole `index`, counted from nought, called `name`, cannot be drawn: which hole, why, and what a
 * player can do, a line each.
 */
export function holeFailureText(index: number, name: string, err: unknown): string {
  return [`Hole ${index + 1}, ${name}, could not be drawn.`, reasonOf(err), 'Reload the page to start again.'].join(
    '\n',
  );
}
