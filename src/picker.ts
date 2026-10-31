/**
 * The course picker on the start screen: a tab for proper golf, one for each biome and one for minigolf, and one course of the tab in view at a time,
 * stepped through with the arrows and wrapping, with its place in the order of difficulty (the courses stand easiest first,
 * which is all a player reads of the pace figure) and the player's best round, which is the save's bests by hole name added
 * up when every hole of the course has one. All of it is arithmetic on the summaries, with no page: the hud draws what
 * `shown` says and the test API chooses by name, so the two cannot disagree about which course Play begins.
 */

import type { Tour } from './season';

/**
 * The tabs, in the order they stand: proper golf of the earth, the three biomes, then minigolf. A tab is a name that the
 * start screen's button id (`tab-<kind>`) and the tour of the same events (`tourOfKind`) are made from.
 */
export type Kind = 'golf' | 'desert' | 'moon' | 'future' | 'minigolf';
export const KINDS: readonly Kind[] = ['golf', 'desert', 'moon', 'future', 'minigolf'];

/** The tab a course stands on: minigolf's, or its biome's, or proper golf of the earth. */
export function kindOfCourse(c: { golf: boolean; biome?: string }): Kind {
  if (!c.golf) return 'minigolf';
  return KINDS.find((k) => k === c.biome && k !== 'golf' && k !== 'minigolf') ?? 'golf';
}

/** A tab from whatever was kept or given as one: a name that is not a tab is the first, and nothing is refused. */
export function asKind(value: unknown): Kind {
  return KINDS.find((k) => k === value) ?? KINDS[0];
}

/** The tour whose events a tab shows: minigolf's is the mini tour and every other tab's is its own name. */
export function tourOfKind(kind: Kind): Tour {
  return kind === 'minigolf' ? 'mini' : kind;
}

/** What the picker knows of a course, all of it known without making the course. */
export interface PickerCourse {
  name: string;
  golf: boolean;
  /** The biome of a course of one (`Course.biome`), none for the earth's. */
  biome?: string;
  holes: number;
  par: number;
  /** The course's length in yards, from the generated previews. */
  yards: number;
  /** The folder of its holes' pictures, and each hole's par and picture size, in order: the card's strip. */
  slug: string;
  strip: readonly { par: number; width: number; height: number }[];
  /** The holes' names, which the save keeps a best score by. */
  holeNames: readonly string[];
}

/** The course in view and what the panel says of it. */
export interface Shown extends PickerCourse {
  /** Its place among the tab's courses, from nought, and how many there are. */
  index: number;
  count: number;
  /** Its place in words: "3rd of 6". */
  place: string;
  /** The player's best round on it, or null until every hole has been played. */
  best: number | null;
}

/** A count as an ordinal: 1st, 2nd, 3rd, 4th, 11th, 21st. */
export function ordinal(n: number): string {
  const tens = n % 100;
  if (tens >= 11 && tens <= 13) return `${n}th`;
  const ones = n % 10;
  return `${n}${ones === 1 ? 'st' : ones === 2 ? 'nd' : ones === 3 ? 'rd' : 'th'}`;
}

/** The player's best round on a course: its holes' bests added, or null while any hole has none. */
export function bestRound(
  bests: Readonly<Partial<Record<string, { strokes: number }>>>,
  holes: readonly string[],
): number | null {
  if (!holes.length) return null;
  let sum = 0;
  for (const name of holes) {
    const b = bests[name];
    if (!b) return null;
    sum += b.strokes;
  }
  return sum;
}

export class Picker {
  /** The tab in view. */
  kind: Kind;
  /** Where each tab was left, so going back to a tab shows the course it showed. */
  private readonly at: Record<Kind, number> = { golf: 0, desert: 0, moon: 0, future: 0, minigolf: 0 };
  private bests: Readonly<Partial<Record<string, { strokes: number }>>>;

  constructor(
    private readonly all: readonly PickerCourse[],
    bests: Readonly<Partial<Record<string, { strokes: number }>>> = {},
  ) {
    if (!all.length) throw new Error('a picker needs courses, and was given no courses');
    this.bests = bests;
    this.kind = KINDS.find((k) => all.some((c) => kindOfCourse(c) === k)) ?? 'minigolf';
  }

  /** The courses of a tab, in the order they stand. */
  courses(kind: Kind): PickerCourse[] {
    return this.all.filter((c) => kindOfCourse(c) === kind);
  }

  /** The tab shown; refused by name for a tab with no course on it. */
  tab(kind: Kind): void {
    if (!this.courses(kind).length) throw new Error(`there is no ${kind} course to show`);
    this.kind = kind;
  }

  /** The next course of the tab (`by` 1) or the one before (-1), wrapping round. */
  step(by: number): void {
    const n = this.courses(this.kind).length;
    this.at[this.kind] = (((this.at[this.kind] + by) % n) + n) % n;
  }

  /** Whether the picker has a course called `name`. */
  has(name: string): boolean {
    return this.all.some((c) => c.name === name);
  }

  /** The course called `name` shown, on its own tab; refused by name for one the picker has not got. */
  show(name: string): void {
    const course = this.all.find((c) => c.name === name);
    if (!course) throw new Error(`no course called ${name}`);
    const kind = kindOfCourse(course);
    this.kind = kind;
    this.at[kind] = this.courses(kind).indexOf(course);
  }

  /** The save's bests as they now are, so a round just played shows in the best. */
  setBests(bests: Readonly<Partial<Record<string, { strokes: number }>>>): void {
    this.bests = bests;
  }

  shown(): Shown {
    const list = this.courses(this.kind);
    const index = this.at[this.kind];
    const course = list[index];
    return {
      ...course,
      index,
      count: list.length,
      place: `${ordinal(index + 1)} of ${list.length}`,
      best: bestRound(this.bests, course.holeNames),
    };
  }
}
