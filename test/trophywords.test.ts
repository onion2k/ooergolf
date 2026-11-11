/**
 * What the trophy room says: the five tours with their cups and grade, the eight figures, the feats there are and which are
 * earned, and a record for every course, all worked out here from the save and never in the page.
 */
import { describe, expect, it } from 'vitest';
import { COURSES } from '../src/course';
import { FEATS } from '../src/feats';
import { Progress, memoryStore, type Save } from '../src/progress';
import { TOURS } from '../src/season';
import { featWords, trophyView, yardsText } from '../src/trophywords';

const saved = (change: (s: Save) => void = () => undefined): Save => {
  const save = new Progress(memoryStore(null)).save;
  change(save);
  return save;
};
const view = (change?: (s: Save) => void) => trophyView(saved(change), COURSES);

describe('the tours', () => {
  it('are the five, in the order the game has them, each with its grade and no cup before a title', () => {
    const { tours } = view();
    expect(tours.map((t) => t.tour)).toEqual([...TOURS]);
    expect(tours.map((t) => t.name)).toEqual(['Golf', 'Mini', 'Desert', 'Moon', 'Future']);
    for (const t of tours) {
      expect(t.grade).toBe('Club');
      expect(t.cups).toBe('');
      expect(t.titles).toBe(0);
      expect(t.won).toBe(false);
    }
  });

  it('show a cup for each title won, up to three, and the number after that, and the grade as it stands', () => {
    const { tours } = view((s) => {
      s.season.golf.titles = 2;
      s.season.golf.grade = 'championship';
      s.season.mini.titles = 1;
      s.season.desert.titles = 3;
      s.season.moon.titles = 4;
      s.season.moon.grade = 'county';
    });
    expect(tours[0]).toMatchObject({ cups: '\u{1F3C6}\u{1F3C6}', grade: 'Championship', short: 'Champ.', won: true });
    expect(tours[1].cups).toBe('\u{1F3C6}');
    expect(tours[2].cups).toBe('\u{1F3C6}\u{1F3C6}\u{1F3C6}');
    expect(tours[3]).toMatchObject({ cups: '\u{1F3C6} ×4', grade: 'County', short: 'County' });
    expect(tours[0].label).toBe('Golf: 2 titles, championship grade');
    expect(tours[1].label).toBe('Mini: 1 title, club grade');
    expect(tours[4].label).toBe('Future: no title, club grade');
  });
});

describe('the figures', () => {
  it('are the eight of the mock, in its order, with the distances in yards and a dash for none', () => {
    const { figures } = view();
    expect(figures.map((f) => f.label)).toEqual([
      'rounds',
      'events won',
      'holes',
      'holes in one',
      'eagles',
      'birdies',
      'longest putt',
      'longest drive',
    ]);
    expect(figures.map((f) => f.value)).toEqual(['0', '0', '0', '0', '0', '0', '–', '–']);
  });

  it('say what the save counts', () => {
    const { figures } = view((s) => {
      Object.assign(s.life, {
        rounds: 41,
        wins: 9,
        holes: 372,
        aces: 23,
        eagles: 4,
        birdies: 96,
        longestPutt: 31,
        longestDrive: 268,
      });
    });
    expect(figures.map((f) => f.value)).toEqual(['41', '9', '372', '23', '4', '96', '31 yd', '268 yd']);
  });

  it('writes a distance in whole yards', () => {
    expect(yardsText(0)).toBe('–');
    expect(yardsText(1)).toBe('1 yd');
    expect(yardsText(268)).toBe('268 yd');
  });
});

describe('the feats', () => {
  it('are every feat there is, in order, with how each is earned, and none drawn that is not', () => {
    const { feats, featsHead } = view();
    expect(feats.map((f) => f.id)).toEqual(FEATS.map((f) => f.id));
    expect(feats.every((f) => !f.earned && f.how !== '')).toBe(true);
    expect(featsHead).toBe(`Feats · 0 of ${FEATS.length}`);
  });

  it('count the earned ones the save keeps, and no others', () => {
    const { feats, featsHead } = view((s) => {
      s.feats = ['ace', 'winner'];
      s.life.aces = 12;
    });
    expect(feats.filter((f) => f.earned).map((f) => f.id)).toEqual(['ace', 'winner']);
    expect(featsHead).toBe(`Feats · 2 of ${FEATS.length}`);
  });

  it('are said on the callout with the feat’s name', () => {
    expect(featWords(['Ace'])).toBe('Feat earned: Ace');
    expect(featWords(['Ace', 'Winner'])).toBe('Feats earned: Ace, Winner');
  });
});

describe('the records', () => {
  it('are a row for every course, in the order the courses are in, with the round and its par or a dash', () => {
    const { records } = view((s) => {
      s.records[COURSES[1].name] = {
        strokes: 19,
        par: 26,
        kit: { club: '', ball: '', accessory: '' },
        when: '2026-10-15',
      };
      s.records[COURSES[4].name] = { strokes: 36, par: 36, kit: { club: '', ball: '', accessory: '' }, when: '' };
    });
    expect(records.map((r) => r.course)).toEqual(COURSES.map((c) => c.name));
    expect(records[0]).toMatchObject({ held: false, text: '–' });
    expect(records[1]).toMatchObject({ held: true, text: '19 (−7)' });
    expect(records[4]).toMatchObject({ held: true, text: '36 (E)' });
  });
});
