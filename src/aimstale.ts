/**
 * When what the aim shows has to be worked out again: the rule, apart from the page, so the page and a test read the same
 * words. A flight is a rehearsal of a hundred and more steps, so it is run only for a shot that is not the one last run, and
 * a reading of where the ball lies (the pin, the break, the reader's arrows) only for a ball that has moved. Without this
 * the rule would sit in the middle of the aim's readout, once for a golf hole and once for a roll on minigolf, and the two
 * could come to disagree about what makes a preview stale: a flight that is not redrawn after the club changes, or a
 * rehearsal run on every frame.
 *
 * It is the game's side: it imports nothing of the picture, and takes numbers, so that nothing is made in a frame.
 */

/** The shot a preview was last worked out for. `NaN` and an empty club are "none yet": nothing compares equal to them. */
export interface PreviewedShot {
  x: number;
  y: number;
  angle: number;
  power: number;
  club: string;
  shape: number;
  spin: number;
  /** A hole of minigolf's moving pushers, in quarter seconds of game time; golf has none. */
  tick: number;
}

/** Whether the flight (or a golf putt's roll) shown was worked out for something other than this ball, aim, club, shape and spin. */
export function flightStale(
  done: PreviewedShot,
  x: number,
  y: number,
  angle: number,
  power: number,
  club: string,
  shape: number,
  spin: number,
): boolean {
  return (
    done.x !== x ||
    done.y !== y ||
    done.angle !== angle ||
    done.power !== power ||
    done.club !== club ||
    done.shape !== shape ||
    done.spin !== spin
  );
}

/**
 * Whether the roll of a putt on minigolf was worked out for something other than this ball, aim, shape, spin and tick. The
 * club is the putter's always, so it is not asked.
 */
export function rollStale(
  done: PreviewedShot,
  x: number,
  y: number,
  angle: number,
  power: number,
  shape: number,
  spin: number,
  tick: number,
): boolean {
  return (
    done.x !== x ||
    done.y !== y ||
    done.angle !== angle ||
    done.power !== power ||
    done.shape !== shape ||
    done.spin !== spin ||
    done.tick !== tick
  );
}

/**
 * Whether a reading of where the ball lies has to be made again: the ball is not where it was read, or nothing was read
 * (`NaN`). The putt's words are also made again for different arrows, `was` against `now`, which they leave out.
 */
export function restedAnew(
  at: { x: number; y: number },
  x: number,
  y: number,
  was?: string | null,
  now?: string | null,
): boolean {
  return at.x !== x || at.y !== y || was !== now;
}
