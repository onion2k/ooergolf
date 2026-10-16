/**
 * A season of a test's own: courses of a few short holes and a table of the rivals' scores made from them, so a whole
 * season can be played in a test, or in the fuzzer, without making the game's golf courses or playing a round of a
 * second or more. A rival of skill `s` scores one under par plus `s` on every hole (the table's histograms are all in one
 * score), so the field is the same every time and a card is easily placed against it: the player holing in one a hole beats
 * every rival, and one who picks up every hole loses to them all.
 */
import { LIMIT_OVER_PAR } from '../src/game';
import { FIELD_SEEDS, RIVAL_SKILLS, type FieldTable } from '../src/field';
import { hashHole } from '../src/holehash';
import { ROSTERS } from '../src/rivals';
import type { Tour } from '../src/season';
import type { EventCourse, SeasonContext } from '../src/tournament';

/** A table of scores for the courses: every skill's rounds on a hole all score one under par plus the skill's index (never below one, nor past the limit). */
export function tableOf(courses: readonly EventCourse[]): FieldTable {
  const table: Record<string, FieldTable[string]> = {};
  for (const course of courses)
    table[course.name] = course.holes.map((hole) => {
      const limit = hole.par + LIMIT_OVER_PAR;
      return {
        name: hole.name,
        par: hole.par,
        limit,
        hash: hashHole(hole),
        scores: RIVAL_SKILLS.map((_, skill) => {
          const histogram = new Array<number>(limit).fill(0);
          histogram[Math.min(limit, Math.max(1, hole.par - 1 + skill)) - 1] = FIELD_SEEDS;
          return histogram;
        }),
      };
    });
  return table;
}

/** The context of a season whose tours' events are the courses given, with the game's rosters and a table made for them. */
export function contextOf(tours: Record<Tour, readonly EventCourse[]>): SeasonContext {
  const seen = new Map<string, EventCourse>();
  for (const course of [...tours.golf, ...tours.mini]) seen.set(course.name, course);
  return { table: tableOf([...seen.values()]), rosters: ROSTERS, tours };
}
