/**
 * The Heath: short and tight: par threes and short fours through woods, a lane on every dogleg, small quick greens and a fresh wind. Nine holes made by `golfHole` from a spec each, as The Links are, and never drawn by hand; the specs are
 * the course's part of the plan (`~/.claude/plans/fizzy-wandering-whisper.md`), and until it lands this is the course's
 * place and shape with no holes in it, so the seed search and the start screen's summary can be built against it.
 *
 * Made when first asked for and not as the page loads, as The Links are.
 */
import type { HoleDef } from './course';
import { golfHole, type GolfSpec } from './golf';

export const HEATH_SPECS: readonly GolfSpec[] = [];

let made: readonly HoleDef[] | undefined;

/** The holes of The Heath, made the first time they are asked for and no oftener. */
export function heath(): readonly HoleDef[] {
  return (made ??= HEATH_SPECS.map((spec) => golfHole(spec)));
}

/** What the start screen says of the course, known without making it: how many holes and what par they add to. */
export const HEATH_SUMMARY = { holes: HEATH_SPECS.length, par: HEATH_SPECS.reduce((a, s) => a + s.par, 0) };
