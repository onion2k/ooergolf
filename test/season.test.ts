/**
 * The season's arithmetic: who the rivals are, what they score, and how a field is placed, paid, pointed and promoted. It has
 * no game and no page, so it is all tested here with cards written by hand, and the draws against the real table in
 * `src/field.json`.
 */
import { describe, expect, it } from 'vitest';
import { FIELD_SEEDS, holeScores, type FieldTable } from '../src/field';
import field from '../src/field.json';
import { seeded } from '../src/random';
import { ROSTERS, type Rival } from '../src/rivals';
import {
  FIELD_SIZE,
  GRADES,
  POINTS,
  PRIZE,
  PROMOTED,
  TOURS,
  entryFee,
  fieldOf,
  meritOf,
  nextGrade,
  placeOfName,
  pointsFor,
  potOf,
  stakeOf,
  prizesFor,
  promoted,
  rivalCard,
  seasonSeed,
  standings,
  type Entry,
} from '../src/season';

const TABLE = field as FieldTable;
const COURSE = 'The Links';

/** Entries with the cards given, named a, b, c ... */
function entries(...cards: number[][]): Entry[] {
  return cards.map((card, i) => ({ name: String.fromCharCode(97 + i), card }));
}

describe('the rivals', () => {
  const SKILLS = {
    club: [2, 2, 2, 2, 3, 3, 3, 3, 4, 4, 4],
    county: [1, 1, 1, 1, 2, 2, 2, 2, 3, 3, 3],
    championship: [0, 0, 0, 0, 1, 1, 1, 1, 2, 2, 2],
  };

  it('has eleven rivals a grade with the skills the measuring gave', () => {
    for (const grade of GRADES) {
      expect(ROSTERS[grade].length).toBe(FIELD_SIZE - 1);
      expect(ROSTERS[grade].map((r) => r.skill)).toEqual(SKILLS[grade]);
    }
  });

  it('has thirty-three different names, none empty', () => {
    const names = GRADES.flatMap((g) => ROSTERS[g].map((r) => r.name));
    expect(names.length).toBe(33);
    expect(new Set(names).size).toBe(33);
    for (const n of names) expect(n.trim()).toBe(n);
    for (const n of names) expect(n.length).toBeGreaterThan(3);
  });
});

describe('grades and seeds', () => {
  it('goes up a grade, and stays at the championship', () => {
    expect(nextGrade('club')).toBe('county');
    expect(nextGrade('county')).toBe('championship');
    expect(nextGrade('championship')).toBe('championship');
  });

  it('gives a seed that differs by tour, grade and seasons begun, and is a whole number', () => {
    const seen = new Set<number>();
    for (const tour of TOURS)
      for (const grade of GRADES)
        for (let begun = 0; begun < 5; begun++) {
          const s = seasonSeed(begun, tour, grade);
          expect(Number.isInteger(s)).toBe(true);
          expect(s).toBeGreaterThanOrEqual(0);
          seen.add(s);
        }
    expect(seen.size).toBe(TOURS.length * GRADES.length * 5);
    expect(seasonSeed(2, 'golf', 'county')).toBe(seasonSeed(2, 'golf', 'county'));
  });

  it('refuses a tour or a grade it does not know, by name', () => {
    expect(() => seasonSeed(0, 'tennis' as never, 'club')).toThrow(/tennis/);
    expect(() => seasonSeed(0, 'golf', 'novice' as never)).toThrow(/novice/);
  });
});

describe("a rival's card", () => {
  const holes = 9;
  it('is the same for the same seed, event and rival, and a different seed makes a different field', () => {
    expect(rivalCard(TABLE, COURSE, holes, 2, 7, 1, 3)).toEqual(rivalCard(TABLE, COURSE, holes, 2, 7, 1, 3));
    const field = (seed: number) =>
      Array.from({ length: 11 }, (_, r) => rivalCard(TABLE, COURSE, holes, 2, seed, 0, r).join());
    expect(field(1)).not.toEqual(field(2));
    expect(rivalCard(TABLE, COURSE, holes, 2, 7, 1, 3)).not.toEqual(rivalCard(TABLE, COURSE, holes, 2, 7, 2, 3));
    expect(rivalCard(TABLE, COURSE, holes, 2, 7, 1, 3)).not.toEqual(rivalCard(TABLE, COURSE, holes, 2, 7, 1, 4));
  });

  it("has a score for every hole of the course, within the hole's limit", () => {
    const card = rivalCard(TABLE, COURSE, holes, 4, 11, 0, 0);
    expect(card.length).toBe(holes);
    card.forEach((s, h) => {
      expect(s).toBeGreaterThanOrEqual(1);
      expect(s).toBeLessThanOrEqual(holeScores(TABLE, COURSE, h, 4).length);
    });
  });

  it('draws scores that follow the histogram, and never one with a count of nought', () => {
    const N = 20000;
    for (const [hole, skill] of [
      [0, 1],
      [4, 3],
      [8, 4],
    ]) {
      const hist = holeScores(TABLE, COURSE, hole, skill);
      const drawn = new Array<number>(hist.length).fill(0);
      for (let seed = 0; seed < N; seed++) {
        const s = rivalCard(TABLE, COURSE, hole + 1, skill, seed, 0, 0)[hole];
        drawn[s - 1]++;
      }
      hist.forEach((count, i) => {
        if (count === 0) expect(drawn[i]).toBe(0);
        else expect(Math.abs(drawn[i] / N - count / FIELD_SEEDS)).toBeLessThan(0.015);
      });
    }
  });

  it('adds up, thru n, to its final total', () => {
    const card = rivalCard(TABLE, COURSE, 9, 2, 5, 3, 6);
    const [e] = standings([{ name: 'r', card }]);
    for (let n = 0; n <= 9; n++) {
      const [thru] = standings([{ name: 'r', card }], n);
      expect(thru.total).toBe(card.slice(0, n).reduce((a, b) => a + b, 0));
    }
    expect(standings([{ name: 'r', card }], 9)[0].total).toBe(e.total);
  });

  it('refuses a course or a hole the table has not got', () => {
    expect(() => rivalCard(TABLE, 'Nowhere', 9, 0, 1, 0, 0)).toThrow(/Nowhere/);
  });
});

describe('places', () => {
  it('orders by total and then name, and shares a place between tied entries', () => {
    const placed = standings(entries([5, 5], [4, 4], [4, 6], [3, 3], [9, 9]));
    expect(placed.map((p) => p.name)).toEqual(['d', 'b', 'a', 'c', 'e']);
    expect(placed.map((p) => p.place)).toEqual([1, 2, 3, 3, 5]);
    expect(placed.map((p) => p.tied)).toEqual([false, false, true, true, false]);
  });

  it('marks only those who share, and the next after a tie for 2nd is 4th', () => {
    const placed = standings(entries([3], [4], [4], [6]));
    expect(placed.map((p) => [p.place, p.tied])).toEqual([
      [1, false],
      [2, true],
      [2, true],
      [4, false],
    ]);
  });

  it('counts only the first thru holes', () => {
    const placed = standings(entries([9, 1, 1], [2, 2, 9]), 2);
    expect(placed.map((p) => [p.name, p.total])).toEqual([
      ['b', 4],
      ['a', 10],
    ]);
  });

  it('puts a name before another on a tie', () => {
    expect(standings(entries([4], [4])).map((p) => p.name)).toEqual(['a', 'b']);
  });
});

describe('prizes', () => {
  const pot = 300;
  const field12 = (cards: number[]) => standings(entries(...cards.map((c) => [c])));

  it('pays an untied field 50, 30 and 20 of the pot', () => {
    expect(prizesFor(field12([1, 2, 3, 4, 5, 6]), pot)).toEqual([150, 90, 60, 0, 0, 0]);
  });

  it('pools the shares of a tie for 1st and halves them', () => {
    expect(prizesFor(field12([1, 1, 3, 4]), pot)).toEqual([120, 120, 60, 0]);
  });

  it('pools only the shares there are for a tie across the end of the money', () => {
    // Tied for 3rd among three: 20% three ways, rounded down.
    expect(prizesFor(field12([1, 2, 3, 3, 3, 9]), pot)).toEqual([150, 90, 20, 20, 20, 0]);
    // Tied for 2nd and 3rd positions with a third sharing past the end: 30 + 20 over three.
    expect(prizesFor(field12([1, 2, 2, 2, 9]), pot)).toEqual([150, 50, 50, 50, 0]);
  });

  it('rounds down, and never pays more than the pot', () => {
    expect(prizesFor(field12([1, 2, 3, 3, 3, 9]), 100)).toEqual([50, 30, 6, 6, 6, 0]);
    const random = seeded(99);
    for (let trial = 0; trial < 500; trial++) {
      const size = 1 + Math.floor(random() * FIELD_SIZE);
      const cards = Array.from({ length: size }, () => [1 + Math.floor(random() * 4)]);
      const fee = Math.round(1 + random() * 100);
      const prizes = prizesFor(standings(entries(...cards)), potOf(fee));
      expect(prizes.length).toBe(size);
      expect(prizes.reduce((a, b) => a + b, 0)).toBeLessThanOrEqual(potOf(fee));
      for (const p of prizes) expect(Number.isInteger(p)).toBe(true);
    }
  });

  it('has a stake that scales with the purse, a pot of twelve stakes, and a fee of the stake above the club grade', () => {
    expect(PRIZE.shares.reduce((a, b) => a + b, 0)).toBeCloseTo(1, 10);
    expect(stakeOf(1)).toBe(25);
    expect(stakeOf(1.6)).toBe(40);
    expect(stakeOf(1.2)).toBe(30);
    expect(potOf(25)).toBe(25 * FIELD_SIZE);
    expect(entryFee(1.2, 'county')).toBe(30);
    expect(entryFee(1.2, 'championship')).toBe(30);
  });

  it('lets a player into the club grade for nothing, so a new player can start, and still plays for the same pot', () => {
    expect(entryFee(1, 'club')).toBe(0);
    expect(entryFee(2, 'club')).toBe(0);
  });
});

describe('points', () => {
  it('goes by place, and nothing past the field', () => {
    expect(POINTS.length).toBe(FIELD_SIZE);
    expect(pointsFor(1)).toBe(25);
    expect(pointsFor(2)).toBe(18);
    expect(pointsFor(12)).toBe(1);
    expect(pointsFor(13)).toBe(0);
  });

  it('gives tied entries each the points of their shared place', () => {
    const placed = standings(entries([3], [4], [4], [6]));
    expect(placed.map((p) => pointsFor(p.place))).toEqual([25, 18, 18, 12]);
  });
});

describe('the order of merit', () => {
  it('adds the points of a season of events, with ties sharing a place and sorted by name', () => {
    const events = [
      standings(entries([3], [4], [4], [6])), // a 25, b 18, c 18, d 12
      standings(entries([5], [3], [7], [3])), // b 25, d 25, a 15, c 12
      standings(entries([2], [2], [2], [2])), // all 25
    ];
    const merit = meritOf(events);
    expect(merit.map((m) => [m.name, m.points, m.place, m.tied])).toEqual([
      ['b', 68, 1, false],
      ['a', 65, 2, false],
      ['d', 62, 3, false],
      ['c', 55, 4, false],
    ]);
    const tied = meritOf([standings(entries([3], [4])), standings(entries([4], [3]))]);
    expect(tied.map((m) => [m.name, m.points, m.place, m.tied])).toEqual([
      ['a', 43, 1, true],
      ['b', 43, 1, true],
    ]);
  });

  it('is empty before any event, and counts an entrant who joined late for the events it played', () => {
    expect(meritOf([])).toEqual([]);
    const merit = meritOf([standings(entries([3], [4])), standings([{ name: 'a', card: [1] }])]);
    expect(merit.find((m) => m.name === 'a')?.points).toBe(50);
    expect(merit.find((m) => m.name === 'b')?.points).toBe(18);
  });
});

describe('promotion', () => {
  const merit = (points: number[]) => meritOf([standings(entries(...points.map((p) => [100 - p])))]);

  it('takes the top three', () => {
    const m = merit([5, 4, 3, 2, 1]);
    expect(PROMOTED).toBe(3);
    expect(['a', 'b', 'c', 'd', 'e'].map((n) => promoted(m, n))).toEqual([true, true, true, false, false]);
  });

  it('takes all who share 3rd', () => {
    const m = merit([5, 4, 3, 3, 3, 1]);
    expect(['a', 'b', 'c', 'd', 'e', 'f'].map((n) => promoted(m, n))).toEqual([true, true, true, true, true, false]);
  });

  it('does not take a name that is not in the order of merit', () => {
    expect(promoted(merit([5, 4, 3]), 'zed')).toBe(false);
  });
});

describe('the field of an event', () => {
  const roster: readonly Rival[] = ROSTERS.county;
  const you: Entry = { name: 'You', card: [4, 5, 3] };

  it("is the player and the grade's roster, twelve in all, each with a card of the holes", () => {
    const entrants = fieldOf(TABLE, COURSE, 9, roster, 21, 2, you);
    expect(entrants.length).toBe(FIELD_SIZE);
    expect(entrants[0]).toBe(you);
    expect(entrants.slice(1).map((e) => e.name)).toEqual(roster.map((r) => r.name));
    for (const e of entrants.slice(1)) expect(e.card.length).toBe(9);
  });

  it("is the same every time, and a rival's card is the one rivalCard gives", () => {
    const a = fieldOf(TABLE, COURSE, 9, roster, 21, 2, you);
    expect(fieldOf(TABLE, COURSE, 9, roster, 21, 2, you)).toEqual(a);
    expect(a[3].card).toEqual(rivalCard(TABLE, COURSE, 9, roster[2].skill, 21, 2, 2));
  });

  it("finds a name's place", () => {
    const placed = standings(fieldOf(TABLE, COURSE, 9, roster, 21, 2, { name: 'You', card: Array(9).fill(1) }));
    expect(placeOfName(placed, 'You')).toBe(1);
    expect(() => placeOfName(placed, 'Nobody')).toThrow(/Nobody/);
  });
});
