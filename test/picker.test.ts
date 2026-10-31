/**
 * The course picker without a page: a tab for golf, each biome and minigolf, the courses of each stepped through either way and wrapping, what is shown
 * of the one in view (its place in the order and the player's best round), and a course chosen by name. Pure arithmetic
 * on the summaries and the save's bests, which the hud draws and never works out again.
 */
import { describe, expect, it } from 'vitest';
import { KINDS, Picker, asKind, bestRound, kindOfCourse, ordinal, tourOfKind, type PickerCourse } from '../src/picker';

const golf = (name: string, par: number, holes: string[]): PickerCourse => ({
  name,
  golf: true,
  holes: holes.length,
  par,
  yards: 3000,
  slug: name.toLowerCase().replace(/ /g, '-'),
  strip: holes.map(() => ({ par: 4, width: 30, height: 120 })),
  holeNames: holes,
});
const mini = (name: string, holes: string[]): PickerCourse => ({ ...golf(name, 27, holes), golf: false, yards: 300 });

const COURSES: PickerCourse[] = [
  golf('The Links', 36, ['A1', 'A2', 'A3']),
  golf('The Heath', 32, ['B1', 'B2', 'B3']),
  golf('The Isles', 45, ['C1', 'C2', 'C3']),
  mini('The Meadow', ['M1', 'M2']),
  mini('The Shed', ['S1', 'S2']),
];

describe('the picker', () => {
  it('opens on the golf tab at its first course, and says its place of how many', () => {
    const p = new Picker(COURSES);
    const s = p.shown();
    expect([p.kind, s.name, s.index, s.count, s.place]).toEqual(['golf', 'The Links', 0, 3, '1st of 3']);
    expect(s.strip, 'the strip of its holes').toHaveLength(3);
  });

  it('steps either way and wraps, on each tab', () => {
    const p = new Picker(COURSES);
    p.step(1);
    expect(p.shown().name).toBe('The Heath');
    p.step(1);
    p.step(1);
    expect(p.shown().name, 'wrapped forward').toBe('The Links');
    p.step(-1);
    expect(p.shown().name, 'wrapped back').toBe('The Isles');
    p.tab('minigolf');
    expect(p.shown().name).toBe('The Meadow');
    p.step(-1);
    expect([p.shown().name, p.shown().place]).toEqual(['The Shed', '2nd of 2']);
  });

  it('keeps where each tab was when the other is shown', () => {
    const p = new Picker(COURSES);
    p.step(2);
    p.tab('minigolf');
    p.step(1);
    p.tab('golf');
    expect(p.shown().name).toBe('The Isles');
    p.tab('minigolf');
    expect(p.shown().name).toBe('The Shed');
  });

  it('shows a course by name, switching tab to it, and refuses one it has not got', () => {
    const p = new Picker(COURSES);
    p.show('The Shed');
    expect([p.kind, p.shown().name]).toEqual(['minigolf', 'The Shed']);
    expect(() => p.show('The Moon')).toThrow(/The Moon/);
  });

  it('lists the courses of a tab in order, and refuses a tab with none', () => {
    const p = new Picker(COURSES);
    expect(p.courses('minigolf').map((c) => c.name)).toEqual(['The Meadow', 'The Shed']);
    const onlyGolf = new Picker(COURSES.filter((c) => c.golf));
    expect(() => onlyGolf.tab('minigolf')).toThrow(/minigolf/);
    expect(() => new Picker([])).toThrow(/no courses/);
  });

  it('opens on the minigolf tab when there is no golf', () => {
    const p = new Picker(COURSES.filter((c) => !c.golf));
    expect(p.kind).toBe('minigolf');
  });

  it('sums a best round only when every hole has a best, and reads the bests it is given', () => {
    const bests = { A1: { strokes: 4 }, A2: { strokes: 3 }, A3: { strokes: 5 }, B1: { strokes: 3 } };
    expect(bestRound(bests, ['A1', 'A2', 'A3'])).toBe(12);
    expect(bestRound(bests, ['B1', 'B2', 'B3'])).toBeNull();
    expect(bestRound(bests, [])).toBeNull();
    const p = new Picker(COURSES, bests);
    expect(p.shown().best).toBe(12);
    p.step(1);
    expect(p.shown().best).toBeNull();
    p.setBests({ ...bests, B2: { strokes: 4 }, B3: { strokes: 4 } });
    expect(p.shown().best).toBe(11);
  });

  it('says a place as an ordinal', () => {
    expect([1, 2, 3, 4, 11, 12, 13, 21, 22, 23, 101].map(ordinal)).toEqual([
      '1st',
      '2nd',
      '3rd',
      '4th',
      '11th',
      '12th',
      '13th',
      '21st',
      '22nd',
      '23rd',
      '101st',
    ]);
  });

  describe('with a tab for each biome', () => {
    const biome = (name: string, b: 'desert' | 'moon' | 'future', holes: string[]): PickerCourse => ({
      ...golf(name, 34, holes),
      biome: b,
    });
    const ALL: PickerCourse[] = [
      mini('The Meadow', ['M1', 'M2']),
      golf('The Links', 36, ['A1', 'A2', 'A3']),
      golf('The Heath', 32, ['B1', 'B2', 'B3']),
      biome('The Saltpan', 'desert', ['D1', 'D2']),
      biome('The Mesa', 'desert', ['D3', 'D4']),
      biome('The Badlands', 'desert', ['D5', 'D6']),
      biome('Tranquility', 'moon', ['L1']),
      biome('Copernicus', 'moon', ['L2']),
      biome('Neon Park', 'future', ['F1']),
      biome('Chrome Heights', 'future', ['F2']),
      biome('The Singularity', 'future', ['F3']),
    ];

    it('has five tabs in the order golf, desert, moon, future and minigolf, read from the courses’ golf and biome', () => {
      expect(KINDS).toEqual(['golf', 'desert', 'moon', 'future', 'minigolf']);
      expect(ALL.map(kindOfCourse)).toEqual([
        'minigolf',
        'golf',
        'golf',
        'desert',
        'desert',
        'desert',
        'moon',
        'moon',
        'future',
        'future',
        'future',
      ]);
      const p = new Picker(ALL);
      expect(
        p.courses('golf').map((c) => c.name),
        'a biome’s courses are not in the golf tab',
      ).toEqual(['The Links', 'The Heath']);
      expect(p.courses('desert').map((c) => c.name)).toEqual(['The Saltpan', 'The Mesa', 'The Badlands']);
      expect(p.courses('moon')).toHaveLength(2);
      expect(p.courses('future')).toHaveLength(3);
      expect(p.courses('minigolf').map((c) => c.name)).toEqual(['The Meadow']);
    });

    it('gives each tab a place of its own: the third of three in the desert, and the first of two on the moon', () => {
      const p = new Picker(ALL);
      p.tab('desert');
      expect([p.shown().name, p.shown().place]).toEqual(['The Saltpan', '1st of 3']);
      p.step(-1);
      expect([p.shown().name, p.shown().place, p.shown().count]).toEqual(['The Badlands', '3rd of 3', 3]);
      p.tab('moon');
      expect(p.shown().place).toBe('1st of 2');
      p.tab('desert');
      expect(p.shown().name, 'the tab was left where it was').toBe('The Badlands');
    });

    it('shows a course by name on the tab of its biome, and refuses a tab with no course', () => {
      const p = new Picker(ALL);
      p.show('Chrome Heights');
      expect([p.kind, p.shown().place]).toEqual(['future', '2nd of 3']);
      p.show('The Heath');
      expect([p.kind, p.shown().place]).toEqual(['golf', '2nd of 2']);
      const noMoon = new Picker(ALL.filter((c) => c.biome !== 'moon'));
      expect(() => noMoon.tab('moon')).toThrow(/moon/);
    });

    it('opens on the first tab that has a course, and on minigolf when nothing else has', () => {
      expect(new Picker(ALL.filter((c) => c.biome === 'moon')).kind).toBe('moon');
      expect(new Picker(ALL.filter((c) => c.biome === 'future' || !c.golf)).kind).toBe('future');
      expect(new Picker(ALL).kind).toBe('golf');
    });

    it('reads a tab that is not one as the first, and refuses nothing', () => {
      for (const odd of ['senior', '', undefined, null, 7, ['moon'], 'Moon'])
        expect(asKind(odd), String(odd)).toBe('golf');
      for (const kind of KINDS) expect(asKind(kind)).toBe(kind);
    });

    it('names the tour of each tab: minigolf’s is mini, and every other tab’s is its own name', () => {
      expect(KINDS.map(tourOfKind)).toEqual(['golf', 'desert', 'moon', 'future', 'mini']);
    });
  });
});
