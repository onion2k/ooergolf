/**
 * What the daily hole says on the start screen, on its result card, on the menu over it and in what is shared: worked out from the
 * save's slot and the day, so a word that reads wrong is a test that fails and not a picture someone has to notice.
 */
import { describe, expect, it } from 'vitest';
import { dailySpec, shareText, shiftDay } from '../src/daily';
import { dailyFacts, dayLong, hasShare, stripView, cardView } from '../src/dailywords';
import { menuWords } from '../src/menu';

const DAY = '2026-11-11';
const NONE = { day: '', strokes: 0, par: 0, streak: 0 };
const FACTS = { biome: 'desert', par: 4, yards: 412, wind: 11 } as const;

describe('a day in words', () => {
  it('names the weekday and the month in full', () => {
    expect(dayLong('2026-11-11')).toBe('Wednesday 11 November');
    expect(dayLong('2027-01-01')).toBe('Friday 1 January');
    expect(dayLong('1970-01-01')).toBe('Thursday 1 January');
    expect(dayLong('2024-02-29')).toBe('Thursday 29 February');
  });

  it('says what the hole of the day is from its spec, without making the hole', () => {
    const spec = dailySpec(DAY);
    expect(dailyFacts(DAY)).toEqual({
      biome: spec.biome,
      par: spec.par,
      yards: Math.round(spec.length),
      wind: spec.biome === 'moon' ? null : spec.wind,
    });
    const moon = Array.from({ length: 4 }, (_, k) => shiftDay(DAY, k)).find((d) => dailySpec(d).biome === 'moon')!;
    expect(dailyFacts(moon).wind, 'the Moon has no air').toBeNull();
  });
});

describe('the strip on the start screen', () => {
  it('invites a go before the day is taken, saying what the hole is and that one go counts', () => {
    const v = stripView(NONE, DAY, FACTS);
    expect(v).toMatchObject({
      state: 'open',
      title: 'Today’s hole · Wednesday 11 November',
      meta: 'Desert · par 4 · 412 yards · wind 11 mph · one go counts',
      play: true,
      share: false,
      again: false,
    });
  });

  it('splits what a phone has no room for, the date, from the lead, in every state', () => {
    const open = stripView(NONE, DAY, FACTS);
    expect([open.lead, open.date]).toEqual(['Today’s hole', 'Wednesday 11 November']);
    expect(`${open.lead} · ${open.date}`).toBe(open.title);
    const done = stripView({ day: DAY, strokes: 3, par: 4, streak: 4 }, DAY, FACTS);
    expect([done.lead, done.date]).toEqual([done.title, '']);
    const dnf = stripView({ day: DAY, strokes: 0, par: 4, streak: 1 }, DAY, FACTS);
    expect([dnf.lead, dnf.date]).toEqual([dnf.title, '']);
  });

  it('is the same for a slot of another day, whichever way it lies, and says still air where there is none', () => {
    expect(stripView({ day: shiftDay(DAY, -1), strokes: 3, par: 4, streak: 5 }, DAY, FACTS).state).toBe('open');
    expect(stripView({ day: shiftDay(DAY, 1), strokes: 3, par: 4, streak: 5 }, DAY, FACTS).state).toBe('open');
    expect(stripView(NONE, DAY, { ...FACTS, biome: 'moon', wind: null }).meta).toContain('still air');
    expect(stripView(NONE, DAY, { ...FACTS, biome: 'earth', wind: 0 }).meta).toContain('no wind');
    expect(stripView(NONE, DAY, { ...FACTS, biome: 'earth' }).meta.startsWith('Proper golf')).toBe(true);
  });

  it('shows the score of the day once it is finished, with the run, Share, and another go for nothing', () => {
    const v = stripView({ day: DAY, strokes: 3, par: 4, streak: 4 }, DAY, FACTS);
    expect(v).toMatchObject({
      state: 'done',
      title: 'Today: Birdie · 3',
      meta: '4 days running',
      play: false,
      share: true,
      again: true,
    });
  });

  it('says a first day as one day running, an ace as a hole in one and a pick-up as the strokes it was', () => {
    expect(stripView({ day: DAY, strokes: 4, par: 4, streak: 1 }, DAY, FACTS)).toMatchObject({
      title: 'Today: Par · 4',
      meta: '1 day running',
    });
    expect(stripView({ day: DAY, strokes: 1, par: 4, streak: 2 }, DAY, FACTS).title).toBe('Today: Hole in one · 1');
    expect(stripView({ day: DAY, strokes: 9, par: 4, streak: 1 }, DAY, FACTS).title).toBe('Today: 5 over par · 9');
  });

  it('reads did not finish where a stroke was taken and the day was not scored, with no Share', () => {
    const v = stripView({ day: DAY, strokes: 0, par: 4, streak: 3 }, DAY, FACTS);
    expect(v).toMatchObject({
      state: 'unfinished',
      title: 'Today: did not finish',
      play: false,
      share: false,
      again: true,
    });
    expect(v.meta).toContain('One go counts');
  });
});

describe('the card when the hole is done', () => {
  const first = { pays: true, pickedUp: false, coins: 10 };

  it('says the first go’s score, what it paid and the run, and the words that Share sends', () => {
    const slot = { day: DAY, strokes: 3, par: 4, streak: 4 };
    const v = cardView(DAY, 3, 4, first, slot);
    expect(v).toMatchObject({
      head: 'Today’s hole · 11 November',
      score: 'Birdie!',
      kind: 'under',
      line: '3 on a par 4 · 10 coins · 4 days running',
      note: null,
      share: shareText(DAY, 4, 3),
    });
  });

  it('leaves out what is not there: no coins for a hole picked up, no run for a first day', () => {
    expect(
      cardView(DAY, 9, 4, { pays: true, pickedUp: true, coins: 0 }, { day: DAY, strokes: 9, par: 4, streak: 1 }),
    ).toMatchObject({
      score: 'Picked up',
      kind: 'picked',
      line: '9 on a par 4',
    });
    expect(
      cardView(DAY, 4, 4, { pays: true, pickedUp: false, coins: 5 }, { day: DAY, strokes: 4, par: 4, streak: 1 }).line,
    ).toBe('4 on a par 4 · 5 coins');
  });

  it('says a later go counts for nothing, and shares the first go, which is the one that counts', () => {
    const slot = { day: DAY, strokes: 3, par: 4, streak: 4 };
    const v = cardView(DAY, 2, 4, { pays: false, pickedUp: false, coins: 0 }, slot);
    expect(v.score).toBe('Eagle!');
    expect(v.line).toBe('2 on a par 4 · counts for nothing');
    expect(v.note).toBe('Your first go, Birdie (3), is the one that counts.');
    expect(v.share).toBe(shareText(DAY, 4, 3));
  });

  it('shares nothing where the first go was not finished', () => {
    const v = cardView(
      DAY,
      2,
      4,
      { pays: false, pickedUp: false, coins: 0 },
      { day: DAY, strokes: 0, par: 4, streak: 0 },
    );
    expect(v.share).toBeNull();
    expect(v.note).toBe('Your first go was not finished, and that is the one that counts.');
  });
});

describe('the words that are shared', () => {
  it('hold the day, the par, the strokes and the game’s address, and nothing of the player', () => {
    const said = shareText(DAY, 4, 3);
    expect(said).toContain('11 Nov 2026');
    expect(said).toContain('Par 4');
    expect(said).toContain('3 strokes');
    expect(said).toContain('https://golf.ooer.com/');
    expect(said.split('\n')).toHaveLength(3);
  });

  it('are there for a day finished and not for one that is not', () => {
    expect(hasShare({ day: DAY, strokes: 3, par: 4, streak: 1 }, DAY)).toBe(true);
    expect(hasShare({ day: DAY, strokes: 0, par: 4, streak: 0 }, DAY)).toBe(false);
    expect(hasShare({ day: shiftDay(DAY, -1), strokes: 3, par: 4, streak: 1 }, DAY)).toBe(false);
  });
});

describe('the menu over the daily hole', () => {
  const facts = {
    hole: 1,
    name: 'Daily 2026-11-11',
    par: 4,
    strokes: 2,
    limit: 9,
    course: 'Today’s hole',
    grade: null,
  };

  it('says the day and that the first go is the one that counts, and has no Restart there', () => {
    const w = menuWords({ ...facts, restartable: false, daily: { day: DAY, pays: true } });
    expect(w.subtitle).toBe('Today’s hole · 11 Nov 2026 · 2 strokes · par 4');
    expect(w.restart).toBe(false);
    expect(w.giveUpSure).toBe('Give up? It scores 9 for the day');
    expect(w.note).toBe('The first go is the one that counts');
  });

  it('says a later go pays nothing, offers Restart, and gives up for nothing', () => {
    const w = menuWords({ ...facts, restartable: true, daily: { day: DAY, pays: false } });
    expect(w.restart).toBe(true);
    expect(w.giveUpSure).toBe('Give up? It scores 9');
    expect(w.note).toBe('A later go: nothing is paid');
  });

  it('is as it was for a hole that is no daily', () => {
    const w = menuWords({ ...facts, restartable: true, daily: null });
    expect(w.subtitle).toBe('Hole 1 · Daily 2026-11-11 · 2 strokes · par 4');
    expect(w.note).toBeNull();
  });
});
