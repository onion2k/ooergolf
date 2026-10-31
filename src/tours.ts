/**
 * The tours as content: the golf tour's six events are the courses of golf of the earth in the order the start screen shows
 * them (easiest first), the mini tour's three are the courses of minigolf, each biome's tour has its three courses, easiest
 * first, and the rivals' scores and names are the table `npm run field` made and the rosters in `rivals.ts`. `main.ts`, the fuzzer and the tests ask for `seasonContext()` and
 * hand it to the game, which knows nothing of which courses there are. Kept apart from `tournament.ts` so the season's rules
 * import no content, and a test may hand the game a small season of its own.
 */
import { COURSES, type Course } from './course';
import field from './field.json';
import { ROSTERS } from './rivals';
import type { EventCourse, SeasonContext } from './tournament';

/** A course as an event is played on it. Its holes are made when asked for and not here, since a golf course takes a second or so to make. */
function eventOf(course: Course): EventCourse {
  return {
    name: course.name,
    purse: course.purse,
    get holes() {
      return course.holes;
    },
  };
}

/** The season's courses, rivals and scores. A new object each time, made from nothing the caller can change. */
export function seasonContext(): SeasonContext {
  return {
    table: field,
    rosters: ROSTERS,
    tours: {
      golf: COURSES.filter((c) => c.golf === true && c.biome === undefined).map(eventOf),
      mini: COURSES.filter((c) => c.golf !== true).map(eventOf),
      desert: COURSES.filter((c) => c.biome === 'desert').map(eventOf),
      moon: COURSES.filter((c) => c.biome === 'moon').map(eventOf),
      future: COURSES.filter((c) => c.biome === 'future').map(eventOf),
    },
  };
}
