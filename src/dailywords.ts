/**
 * What the daily hole says to the player, worked out from the save's slot and the day and drawn by the hud as it is handed it: the
 * strip on the start screen (an invitation before the day is taken, the score after it, or did not finish), the card when the hole
 * is done, and what is known of the hole of a day without making it (its spec says its biome, par, length and wind). A word that
 * reads wrong is a test that fails here, and not a picture someone has to notice. The hud draws no word of its own.
 */
import { BIOMES, type BiomeName } from './biome';
import { dailySpec, shareText } from './daily';
import { dayNumber } from './days';
import type { DailySlot } from './progress';
import { scoreKind, scoreName, type ScoreKind } from './score';

const WEEKDAYS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'] as const;
const MONTHS = [
  'January',
  'February',
  'March',
  'April',
  'May',
  'June',
  'July',
  'August',
  'September',
  'October',
  'November',
  'December',
] as const;

/** The biomes as a player reads them: earth's is proper golf. */
const BIOME_NAMES: Record<BiomeName, string> = {
  earth: 'Proper golf',
  desert: 'Desert',
  moon: 'Moon',
  future: 'Future',
};

/** A day as the strip says it: `Wednesday 11 November`. 1 January 1970 was a Thursday. */
export function dayLong(day: string): string {
  const [, m, d] = day.split('-').map(Number);
  return `${WEEKDAYS[(((dayNumber(day) + 4) % 7) + 7) % 7]} ${d} ${MONTHS[m - 1]}`;
}

/** A day as the card's heading says it: `11 November`. */
const dayShort = (day: string) => {
  const [, m, d] = day.split('-').map(Number);
  return `${d} ${MONTHS[m - 1]}`;
};

/** What is known of the hole of a day before it is made. */
export interface DailyFacts {
  biome: BiomeName;
  par: number;
  yards: number;
  /** Miles an hour, or null where the biome has no air to blow in. */
  wind: number | null;
}

/** The hole of `day` as its spec says it: cheap, and the same hole `dailyHole` makes, so the strip can say it before the hole is built. */
export function dailyFacts(day: string): DailyFacts {
  const spec = dailySpec(day);
  const biome = spec.biome ?? 'earth';
  return {
    biome,
    par: spec.par,
    yards: Math.round(spec.length),
    wind: BIOMES[biome].calm ? null : (spec.wind ?? 0),
  };
}

/** What the strip is: open for a go, the day's score, or a day not finished. */
export type StripState = 'open' | 'done' | 'unfinished';

export interface StripView {
  state: StripState;
  title: string;
  meta: string;
  /** Which buttons are there: Play today's hole, Share, and a go again for nothing. */
  play: boolean;
  share: boolean;
  again: boolean;
}

/** How a score reads on the strip: the name without its cheer. */
const plain = (strokes: number, par: number) => scoreName(strokes, par).replace(/!$/, '');

const days = (n: number) => `${n} ${n === 1 ? 'day' : 'days'} running`;

/** The strip for `day`, from the slot as the save keeps it and what is known of the day's hole. */
export function stripView(slot: Readonly<DailySlot>, day: string, facts: DailyFacts): StripView {
  if (slot.day !== day) {
    const wind = facts.wind === null ? 'still air' : facts.wind === 0 ? 'no wind' : `wind ${facts.wind} mph`;
    return {
      state: 'open',
      title: `Today’s hole · ${dayLong(day)}`,
      meta: `${BIOME_NAMES[facts.biome]} · par ${facts.par} · ${facts.yards} yards · ${wind} · one go counts`,
      play: true,
      share: false,
      again: false,
    };
  }
  if (slot.strokes === 0)
    return {
      state: 'unfinished',
      title: 'Today: did not finish',
      meta: 'One go counts, and it was taken',
      play: false,
      share: false,
      again: true,
    };
  return {
    state: 'done',
    title: `Today: ${plain(slot.strokes, slot.par)} · ${slot.strokes}`,
    meta: days(slot.streak),
    play: false,
    share: true,
    again: true,
  };
}

/** Whether there is a result to share for `day`: the slot is of that day and its go was finished. */
export function hasShare(slot: Readonly<DailySlot>, day: string): boolean {
  return slot.day === day && slot.strokes > 0;
}

/** What a go at the daily hole was: whether it was the one that counts, whether it was picked up, and the coins it paid. */
export interface GoResult {
  pays: boolean;
  pickedUp: boolean;
  coins: number;
}

export interface CardView {
  head: string;
  score: string;
  kind: ScoreKind;
  line: string;
  /** Under the shared words: that a later go counts for nothing, and what does count; none for a first go. */
  note: string | null;
  /** The words Share sends, which are the first go's; none where there is no first go to share. */
  share: string | null;
}

/** The card for a go at the daily hole of `day` done in `strokes` on a par of `par`, over the slot as it now stands. */
export function cardView(day: string, strokes: number, par: number, go: GoResult, slot: Readonly<DailySlot>): CardView {
  const parts = [`${strokes} on a par ${par}`];
  let note: string | null = null;
  if (go.pays) {
    if (go.coins > 0) parts.push(`${go.coins} coins`);
    if (slot.streak >= 2) parts.push(days(slot.streak));
  } else {
    parts.push('counts for nothing');
    note =
      slot.day === day && slot.strokes > 0
        ? `Your first go, ${plain(slot.strokes, slot.par)} (${slot.strokes}), is the one that counts.`
        : 'Your first go was not finished, and that is the one that counts.';
  }
  return {
    head: `Today’s hole · ${dayShort(day)}`,
    score: scoreName(strokes, par, go.pickedUp),
    kind: scoreKind(strokes, par, go.pickedUp),
    line: parts.join(' · '),
    note,
    share: hasShare(slot, day) ? shareText(day, slot.par, slot.strokes) : null,
  };
}
