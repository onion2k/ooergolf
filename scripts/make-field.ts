/**
 * The field table made again: for every course, every rival skill and seeds 1 to `FIELD_SEEDS`, a round is played by the
 * autopilot exactly as the pace gate plays one (`paceRun`), and each hole's score is counted into a histogram. The result is
 * written to `src/field.json`, which the tournaments draw their rivals' scores from. Run by hand, `npm run field`, whenever a
 * course changes (about twenty minutes): `test/field.test.ts` fails until it is. The output is committed and never edited.
 * A round that does not finish in its game minutes stops the script, since a table made from a stuck round would be wrong.
 */
import { writeFileSync } from 'node:fs';
import { COURSES } from '../src/course';
import { FIELD_SEEDS, RIVAL_SKILLS, type FieldHole, type FieldTable } from '../src/field';
import { LIMIT_OVER_PAR } from '../src/game';
import { hashHole } from '../src/holehash';
import { CAP_MINUTES, fieldRound } from './field-round';

const table: Record<string, FieldHole[]> = {};
const began = performance.now();
for (const course of COURSES) {
  const start = performance.now();
  const holes: FieldHole[] = course.holes.map((def) => ({
    name: def.name,
    par: def.par,
    limit: def.par + LIMIT_OVER_PAR,
    hash: hashHole(def),
    scores: RIVAL_SKILLS.map(() => new Array<number>(def.par + LIMIT_OVER_PAR).fill(0)),
  }));
  RIVAL_SKILLS.forEach((skill, s) => {
    for (let seed = 1; seed <= FIELD_SEEDS; seed++) {
      const card = fieldRound(course.holes, skill, seed);
      if (card === null)
        throw new Error(
          `${course.name}, skill S${s}, seed ${seed}: the round did not finish in ${CAP_MINUTES} game minutes`,
        );
      if (card.length !== holes.length)
        throw new Error(`${course.name}, skill S${s}, seed ${seed}: ${card.length} scores for ${holes.length} holes`);
      card.forEach((score, k) => {
        if (!(score >= 1 && score <= holes[k].limit))
          throw new Error(
            `${course.name}, skill S${s}, seed ${seed}, hole ${k + 1}: a score of ${score} is outside 1 to ${holes[k].limit}`,
          );
        holes[k].scores[s][score - 1]++;
      });
    }
    console.log(`  ${course.name} S${s} done, ${((performance.now() - start) / 1000).toFixed(0)} s so far`);
  });
  table[course.name] = holes;
  console.log(`${course.name}: ${holes.length} holes in ${((performance.now() - start) / 1000).toFixed(1)} s`);
}
// One hole to a line, so a changed hole is one changed line in a diff and the file stays small.
const lines = Object.entries(table satisfies FieldTable).map(
  ([name, holes]) => `${JSON.stringify(name)}: [\n${holes.map((h) => '  ' + JSON.stringify(h)).join(',\n')}\n]`,
);
writeFileSync('src/field.json', `{\n${lines.join(',\n')}\n}\n`);
console.log(`${COURSES.length} courses in ${((performance.now() - began) / 60000).toFixed(1)} min`);
