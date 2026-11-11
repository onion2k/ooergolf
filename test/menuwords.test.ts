/** What the hole's menu says and which of its buttons are there, worked out from numbers, as the mock chose them. */
import { describe, expect, it } from 'vitest';
import { menuWords, type MenuFacts } from '../src/menu';

const free: MenuFacts = {
  hole: 3,
  name: 'Furze Hollow',
  par: 3,
  strokes: 2,
  limit: 8,
  course: 'The Links',
  grade: null,
  restartable: true,
  daily: null,
};

describe('the words of the hole’s menu', () => {
  it('says where the player is: the hole, its name, the strokes and the par', () => {
    expect(menuWords(free).subtitle).toBe('Hole 3 · Furze Hollow · 2 strokes · par 3');
    expect(menuWords({ ...free, strokes: 1 }).subtitle).toBe('Hole 3 · Furze Hollow · 1 stroke · par 3');
    expect(menuWords({ ...free, strokes: 0 }).subtitle).toBe('Hole 3 · Furze Hollow · 0 strokes · par 3');
  });

  it('says the tour, the course and the hole in an event, which has no restart, and that Courses keeps the round', () => {
    const w = menuWords({ ...free, grade: 'county', restartable: false });
    expect(w.subtitle).toBe('County tour · The Links · hole 3 · 2 strokes');
    expect(w.restart).toBe(false);
    expect(w.note).toBe('Courses keeps this round to go on with');
    expect(menuWords({ ...free, grade: 'club', restartable: false }).subtitle).toContain('Club tour');
    expect(menuWords({ ...free, grade: 'championship', restartable: false }).subtitle).toContain('Championship tour');
  });

  it('has a restart and no note outside an event', () => {
    const w = menuWords(free);
    expect(w.restart).toBe(true);
    expect(w.note).toBeNull();
  });

  it('asks again before giving up, and says what the hole will score', () => {
    const w = menuWords(free);
    expect(w.giveUp).toBe('Give up the hole');
    expect(w.giveUpSure).toBe('Give up? It scores 8');
    expect(menuWords({ ...free, par: 5, limit: 10 }).giveUpSure).toBe('Give up? It scores 10');
  });
});
