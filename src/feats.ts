/**
 * The feats, what each is called, how it is earned and what it is drawn with in the trophy room. Each is a function of the save
 * alone (the lifetime figures, the records, the seasons and what is owned), so that a player who had already done a thing earns
 * it at their next hole, and no feat needs a counter of its own. A feat pays nothing. An id is `featids.ts`'s: a feat added is an
 * id there and an entry here, with its case in `test/feats.test.ts`, and nowhere else.
 */
import { COURSES } from './course';
import type { FeatId } from './featids';
import type { Save } from './progress';
import { TOURS } from './season';

export interface Feat {
  id: FeatId;
  /** What it is called, in a word or two. */
  name: string;
  /** How it is earned, in a few words that read under the name. */
  how: string;
  /** What the badge shows: a figure or a mark of a character or two. */
  icon: string;
  /** Whether the save says it is earned. */
  earned(save: Save): boolean;
}

/** The longest putt, in yards, that is a feat. */
export const DOWNTOWN = 20;
/** The things owned that make a player kitted out. */
export const KITTED_OUT = 15;

/** The daily holes finished on days in turn that make a run a feat. */
export const DAILY_RUN = 7;

/** Whether `course` is one of golf's, as the career's records know it by name: a course no longer played is not. */
const isGolf = (course: string) => COURSES.find((c) => c.name === course)?.golf === true;

/** Every feat, in the order the trophy room shows them. */
export const FEATS: readonly Feat[] = [
  { id: 'ace', name: 'Ace', how: 'a hole in one', icon: '1', earned: (s) => s.life.aces >= 1 },
  { id: 'tenAces', name: 'Ten aces', how: 'ten holes in one', icon: '10', earned: (s) => s.life.aces >= 10 },
  { id: 'winner', name: 'Winner', how: 'an event won', icon: '\u{1F3CC}', earned: (s) => s.life.wins >= 1 },
  {
    id: 'champion',
    name: 'Champion',
    how: 'a title won',
    icon: '\u{1F3C6}',
    earned: (s) => TOURS.some((t) => s.season[t].titles >= 1),
  },
  {
    id: 'kittedOut',
    name: 'Kitted out',
    how: 'fifteen things owned',
    icon: '\u{1F392}',
    earned: (s) => s.owned.length >= KITTED_OUT,
  },
  { id: 'eagle', name: 'Eagle', how: 'two under on golf', icon: '−2', earned: (s) => s.life.eagles >= 1 },
  {
    id: 'redFigures',
    name: 'Red figures',
    how: 'a golf round under par',
    icon: '−',
    // the career keeps a course's best round, so a round under par is a best under par
    earned: (s) => Object.entries(s.records).some(([course, r]) => isGolf(course) && r.strokes < r.par),
  },
  {
    id: 'grandSlam',
    name: 'Grand slam',
    how: 'a title on every tour',
    icon: String(TOURS.length),
    earned: (s) => TOURS.every((t) => s.season[t].titles >= 1),
  },
  {
    id: 'recordBook',
    name: 'Record book',
    how: 'a record on every course',
    icon: String(COURSES.length),
    earned: (s) => COURSES.every((c) => Object.hasOwn(s.records, c.name)),
  },
  {
    id: 'downtown',
    name: 'From downtown',
    how: `a putt from ${DOWNTOWN} yards`,
    icon: String(DOWNTOWN),
    earned: (s) => s.life.longestPutt >= DOWNTOWN,
  },
  {
    id: 'dailySeven',
    name: 'A week of days',
    how: 'seven daily holes running',
    icon: String(DAILY_RUN),
    earned: (s) => s.daily.streak >= DAILY_RUN,
  },
];

/** The feat of an id: every id has one, which a test holds. */
export function featOf(id: FeatId): Feat {
  const feat = FEATS.find((f) => f.id === id);
  if (!feat) throw new Error(`no feat is held for ${id}`);
  return feat;
}

/** The feats the save says are earned that it does not yet keep, in the order they are shown. */
export function newFeats(save: Save): Feat[] {
  return FEATS.filter((f) => !save.feats.includes(f.id) && f.earned(save));
}
