/**
 * What the trophy room says, worked out from the save and drawn by the hud as it is handed it: a cup for each title of each tour,
 * the eight figures of a career, the feats there are and which are earned, and the best round on every course. A word that reads
 * wrong is a test that fails here, and not a picture someone has to notice. The hud draws no figure of its own.
 */
import { FEATS } from './feats';
import type { FeatId } from './featids';
import type { Save } from './progress';
import { againstPar } from './score';
import { gradeName } from './eventwords';
import { TOURS, type Tour } from './season';

/** The tour as a player reads it, in a word. */
const TOUR_NAMES: Record<Tour, string> = {
  golf: 'Golf',
  mini: 'Mini',
  desert: 'Desert',
  moon: 'Moon',
  future: 'Future',
};

/** The cup a title is, as a character. */
const CUP = '\u{1F3C6}';

export interface TourView {
  tour: Tour;
  name: string;
  /** The grade the tour is at, in full and as short as a phone's width allows. */
  grade: string;
  short: string;
  titles: number;
  /** A cup for each title up to three, then a cup and the number; nothing before a first. */
  cups: string;
  /** Whether a title is won on this tour. */
  won: boolean;
  /** What a reader who does not see the cups is told. */
  label: string;
}

export interface FeatView {
  id: FeatId;
  name: string;
  how: string;
  icon: string;
  earned: boolean;
}

export interface RecordView {
  course: string;
  held: boolean;
  /** The round and how it stood against par, "33 (+3)", or a dash for a course with no record. */
  text: string;
}

export interface TrophyView {
  tours: TourView[];
  figures: { label: string; value: string }[];
  featsHead: string;
  feats: FeatView[];
  records: RecordView[];
}

/** A distance in whole yards, "31 yd", or a dash where there is none yet. */
export function yardsText(yards: number): string {
  return yards >= 1 ? `${Math.floor(yards)} yd` : '–';
}

/** What the callout over a hole adds to its score for the feats earned by it: "Feat earned: Ace", or "Feats earned: Ace, Winner". */
export function featWords(names: readonly string[]): string {
  return `${names.length === 1 ? 'Feat' : 'Feats'} earned: ${names.join(', ')}`;
}

/** The trophy room for `save`: a row of records for each of `courses`, in the order given. */
export function trophyView(save: Save, courses: readonly { name: string }[]): TrophyView {
  const { life } = save;
  const feats = FEATS.map((f) => ({
    id: f.id,
    name: f.name,
    how: f.how,
    icon: f.icon,
    earned: save.feats.includes(f.id),
  }));
  return {
    tours: TOURS.map((tour) => {
      const { titles, grade } = save.season[tour];
      const name = TOUR_NAMES[tour];
      const said = titles === 0 ? 'no title' : titles === 1 ? '1 title' : `${titles} titles`;
      return {
        tour,
        name,
        grade: gradeName(grade),
        short: grade === 'championship' ? 'Champ.' : gradeName(grade),
        titles,
        cups: titles === 0 ? '' : titles <= 3 ? CUP.repeat(titles) : `${CUP} ×${titles}`,
        won: titles > 0,
        label: `${name}: ${said}, ${grade} grade`,
      };
    }),
    figures: [
      { label: 'rounds', value: String(life.rounds) },
      { label: 'events won', value: String(life.wins) },
      { label: 'holes', value: String(life.holes) },
      { label: 'holes in one', value: String(life.aces) },
      { label: 'eagles', value: String(life.eagles) },
      { label: 'birdies', value: String(life.birdies) },
      { label: 'longest putt', value: yardsText(life.longestPutt) },
      { label: 'longest drive', value: yardsText(life.longestDrive) },
    ],
    featsHead: `Feats · ${feats.filter((f) => f.earned).length} of ${feats.length}`,
    feats,
    records: courses.map(({ name }) => {
      const r = Object.hasOwn(save.records, name) ? save.records[name] : undefined;
      return r
        ? { course: name, held: true, text: `${r.strokes} (${againstPar(r.strokes, r.par)})` }
        : { course: name, held: false, text: '–' };
    }),
  };
}
