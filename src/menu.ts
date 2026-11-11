/**
 * The hole's menu: when it may be opened, apart from the page, so the same rule says it to the page and to a test. It opens
 * over a hole in play and over nothing else: between holes the card is up, and under the start screen or the title there is
 * no hole to leave. Without it the page would have to read the game and the screens each time it was asked, and an Escape
 * could stop the time of a screen that has none. And what it says: its words and which buttons it has, worked out from
 * numbers, so a word that reads wrong is a test that fails and not a picture someone has to notice.
 */
import { gradeName } from './eventwords';
import type { Grade } from './season';

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

/** What the menu is to say of the hole in play, as the page knows it. */
export interface MenuFacts {
  /** The hole's number from one, and its name and par. */
  hole: number;
  name: string;
  par: number;
  /** The strokes taken, and what the hole scores if it is given up. */
  strokes: number;
  limit: number;
  /** The course in play. */
  course: string;
  /** The grade of the tour whose event is in play, or null where no event is. */
  grade: Grade | null;
  /** Whether the game would begin the hole again: not in an event. */
  restartable: boolean;
}

/** The menu's words and which of its buttons are there. */
export interface MenuWords {
  subtitle: string;
  /** Whether Restart hole is there. */
  restart: boolean;
  giveUp: string;
  /** What Give up says once pressed, which a second press confirms. */
  giveUpSure: string;
  /** The small print under the buttons, or none. */
  note: string | null;
}

/** The menu's words for the hole in play. */
export function menuWords(f: MenuFacts): MenuWords {
  const strokes = `${f.strokes} ${f.strokes === 1 ? 'stroke' : 'strokes'}`;
  return {
    subtitle:
      f.grade === null
        ? `Hole ${f.hole} · ${f.name} · ${strokes} · par ${f.par}`
        : `${gradeName(f.grade)} tour · ${f.course} · hole ${f.hole} · ${strokes}`,
    restart: f.restartable,
    giveUp: 'Give up the hole',
    giveUpSure: `Give up? It scores ${f.limit}`,
    note: f.grade === null ? null : 'Courses keeps this round to go on with',
  };
}
