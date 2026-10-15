/**
 * The field table is the courses as they are: every hole of every course is in `src/field.json` in order, under its name and
 * the hash it has now, with a histogram of scores for each of the five rival skills that adds up to the rounds played. A course
 * changed without `npm run field` being run fails here, saying so. Makes every course, so it is the slow kind of test.
 */
import { readFileSync, statSync } from 'node:fs';
import { gzipSync } from 'node:zlib';
import { describe, expect, it } from 'vitest';
import { COURSES } from '../src/course';
import { FIELD_SEEDS, RIVAL_SKILLS, holeScores, type FieldTable } from '../src/field';
import { LIMIT_OVER_PAR } from '../src/game';
import { hashHole } from '../src/holehash';
import field from '../src/field.json';
import { fieldRound } from '../scripts/field-round';

const TABLE = field as FieldTable;
const AGAIN = 'run `npm run field` to make the table again';

/** The ceilings on the table's size, with room: measured as SIZE_NOTE says. */
const MOST_BYTES = 30_000;
const MOST_GZIPPED = 8_000;
const SIZE_NOTE = '14,421 bytes and 3,904 gzipped on 15 October 2026';

const mean = (h: readonly number[]) => h.reduce((a, n, k) => a + n * (k + 1), 0) / h.reduce((a, n) => a + n, 0);

describe('the field table', () => {
  it('has every course, and every hole of it in order under its name and hash', () => {
    expect(Object.keys(TABLE), AGAIN).toEqual(COURSES.map((c) => c.name));
    for (const course of COURSES) {
      const holes = TABLE[course.name];
      expect(holes.length, `${course.name}: ${AGAIN}`).toBe(course.holes.length);
      course.holes.forEach((def, k) => {
        const h = holes[k];
        expect(h.name, `${course.name} hole ${k + 1}: ${AGAIN}`).toBe(def.name);
        expect(h.par, `${def.name}'s par: ${AGAIN}`).toBe(def.par);
        expect(h.limit, `${def.name}'s limit: ${AGAIN}`).toBe(def.par + LIMIT_OVER_PAR);
        expect(h.hash, `${def.name} has changed: ${AGAIN}`).toBe(hashHole(def));
      });
    }
  });

  it('has a histogram of FIELD_SEEDS rounds for each skill of each hole, the length of the limit, with nothing below a score of one', () => {
    let checked = 0;
    for (const [name, holes] of Object.entries(TABLE))
      holes.forEach((h, k) => {
        expect(h.scores.length, `${name} hole ${k + 1}`).toBe(RIVAL_SKILLS.length);
        RIVAL_SKILLS.forEach((_, s) => {
          const hist = holeScores(TABLE, name, k, s);
          expect(hist.length, `${h.name} S${s}`).toBe(h.limit);
          expect(
            hist.every((n) => Number.isInteger(n) && n >= 0),
            `${h.name} S${s}`,
          ).toBe(true);
          expect(
            hist.reduce((a, n) => a + n, 0),
            `${h.name} S${s}`,
          ).toBe(FIELD_SEEDS);
          checked++;
        });
      });
    expect(checked).toBe(COURSES.reduce((a, c) => a + c.holes.length, 0) * RIVAL_SKILLS.length);
  });

  it('refuses a course, a hole or a skill it does not have, by name', () => {
    expect(() => holeScores(TABLE, 'Nowhere', 0, 0)).toThrow(/Nowhere/);
    expect(() => holeScores(TABLE, COURSES[0].name, 99, 0)).toThrow(/hole 99/);
    expect(() => holeScores(TABLE, COURSES[0].name, 0, 9)).toThrow(/skill 9/);
  });

  it('has the worse skills scoring more: every course strictly from S0 to S4 round by round, and each hole by no less than the noise of 32 rounds', () => {
    // A hole's mean over 32 rounds wobbles by about half a stroke on a long hole (the standard error of a difference of two
    // means there is 0.6: The Long Swim's S1 plays 0.56 under S0 in the table), and neighbouring skills overlap, so a single
    // hole is held to S4 scoring more than S0 (the least gap in the table is 0.16) and no step falling by more than WOBBLE,
    // which still catches a skill that is wired the wrong way round; a course, nine holes of it, is held strictly at every step.
    const WOBBLE = 0.75;
    for (const [name, holes] of Object.entries(TABLE)) {
      const total = RIVAL_SKILLS.map((_, s) => holes.reduce((a, _h, k) => a + mean(holeScores(TABLE, name, k, s)), 0));
      for (let s = 1; s < total.length; s++)
        expect(total[s], `${name} S${s} against S${s - 1}`).toBeGreaterThan(total[s - 1]);
      holes.forEach((h, k) => {
        const m = RIVAL_SKILLS.map((_, s) => mean(holeScores(TABLE, name, k, s)));
        expect(m[4] - m[0], `${h.name}: S4 against S0`).toBeGreaterThan(0);
        for (let s = 1; s < m.length; s++)
          expect(m[s] - m[s - 1], `${h.name}: S${s} against S${s - 1}`).toBeGreaterThan(-WOBBLE);
      });
    }
  });

  it(`is small: under ${MOST_BYTES} bytes and ${MOST_GZIPPED} gzipped (${SIZE_NOTE})`, () => {
    const bytes = statSync('src/field.json').size;
    const gzipped = gzipSync(readFileSync('src/field.json')).length;
    expect(bytes).toBeLessThan(MOST_BYTES);
    expect(gzipped).toBeLessThan(MOST_GZIPPED);
  });

  it('was made by the autopilot and the skills as they are now: The Meadow played again counts to the table exactly', () => {
    // The hashes hold the holes; this holds what plays them. The Meadow is the cheapest course to play (about two seconds
    // for every skill and seed), and a change to the autopilot or to RIVAL_SKILLS that moves no score on it would leave the
    // other courses' rivals stale unseen, which is said here and is why the script is run after any such change.
    const course = COURSES.find((c) => c.name === 'The Meadow')!;
    RIVAL_SKILLS.forEach((skill, s) => {
      const counts = course.holes.map((def) => new Array<number>(def.par + LIMIT_OVER_PAR).fill(0));
      for (let seed = 1; seed <= FIELD_SEEDS; seed++) {
        const card = fieldRound(course.holes, skill, seed);
        expect(card, `The Meadow S${s} seed ${seed} did not finish`).not.toBeNull();
        card!.forEach((score, k) => counts[k][score - 1]++);
      }
      counts.forEach((hist, k) =>
        expect(hist, `${course.holes[k].name} S${s}: ${AGAIN}`).toEqual(holeScores(TABLE, course.name, k, s)),
      );
    });
  });
});
