/**
 * The words a tournament is told in: a place, a score against par, the sticker on the card at the end, and the lines that
 * say where a season stands. Worked out here and only drawn by the hud, so they are held without a page.
 */
import { describe, expect, it } from 'vitest';
import {
  cutLine,
  eventHeader,
  gradeName,
  meritMove,
  ordinal,
  placeText,
  promotionLine,
  seasonLine,
  stickerText,
  toParText,
} from '../src/eventwords';

describe("a tournament's words", () => {
  it('says a place as golf does: an ordinal, and T before a shared one', () => {
    expect([1, 2, 3, 4, 11, 12, 13, 21, 22, 23, 101, 111].map(ordinal)).toEqual([
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
      '111th',
    ]);
    expect(placeText(3, false)).toBe('3');
    expect(placeText(3, true)).toBe('T3');
  });

  it('says a score against par with a true minus sign, and level par as E', () => {
    expect(toParText(-2)).toBe('−2');
    expect(toParText(0)).toBe('E');
    expect(toParText(1)).toBe('+1');
  });

  it("puts the place and the prize on the card's sticker, and no coins where none were won", () => {
    expect(stickerText(2, false, 90)).toBe('2nd · 90 coins');
    expect(stickerText(3, true, 45)).toBe('T3 · 45 coins');
    expect(stickerText(1, false, 1)).toBe('1st · 1 coin');
    expect(stickerText(8, false, 0)).toBe('8th');
  });

  it('heads an event by its grade, its place in the season and how many there are', () => {
    expect(gradeName('club')).toBe('Club');
    expect(gradeName('championship')).toBe('Championship');
    expect(eventHeader('club', 3, 6)).toBe('Club tour · Event 3 of 6');
    expect(eventHeader('county', 1, 3)).toBe('County tour · Event 1 of 3');
  });

  it('says what the season is played for: going up a grade, or the title at the top', () => {
    expect(promotionLine('club', 3)).toBe('Top 3 go up to the County tour');
    expect(promotionLine('county', 3)).toBe('Top 3 go up to the Championship tour');
    expect(promotionLine('championship', 3)).toBe('Top 3 are champions');
  });

  it("says where the leaderboard's cut is and how many are behind you", () => {
    expect(cutLine(1, 8)).toBe('cut +1 · 8 behind you');
    expect(cutLine(0, 1)).toBe('cut E · 1 behind you');
    expect(cutLine(-3, 0)).toBe('cut −3 · none behind you');
  });

  it('says the order of merit moved, or held', () => {
    expect(meritMove(3, 2)).toBe('Order of merit: 3rd → 2nd');
    expect(meritMove(5, 5)).toBe('Order of merit: 5th, as before');
    expect(meritMove(0, 4), 'the first event of a season, before which there was no order').toBe('Order of merit: 4th');
  });

  it("says a season's end: up a grade, the title, or another go at the same grade", () => {
    expect(seasonLine(false, null, false)).toBe('');
    expect(seasonLine(true, 'county', false)).toBe('Season over: up to the County tour');
    expect(seasonLine(true, null, true)).toBe('Season over: champions of the Championship');
    expect(seasonLine(true, null, false)).toBe('Season over: another season at this grade');
  });
});
