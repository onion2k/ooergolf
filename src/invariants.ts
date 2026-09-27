/**
 * What must always be true of the game, however it has been played: the
 * rules that, broken, are a bug whatever the feature was.
 *
 * Every body is of a kind the game knows, is a number, and is out of the
 * rock; and the world's count of them is right. The ball is there while a
 * hole is played, the only body on the course, and never faster than the
 * hardest shot: nothing on the course yet gives it speed of its own, and
 * when a bumper does, this rule says by how much. The strokes are a count no
 * more than the hole's limit. The card has a score for every hole finished
 * and no other, each between one stroke and the limit. The coins and gems are
 * counts, the clubs owned are clubs the shop sells, the starting putter
 * among them, and the club in hand is one of them.
 *
 * Checked by the fuzzer after everything it does, by the test API on asking,
 * and by the unit tests. Each broken rule is a line saying what and where.
 */
import { KINDS, KIND_NAME, onFloor } from './arena';
import { CLUBS } from './clubs';
import { LIMIT_OVER_PAR, type Game } from './game';

/** How many broken rules of one sort are reported before the rest are only counted. */
const EACH = 3;

export function checkInvariants(game: Game): string[] {
  const out: string[] = [];
  const { world, layout } = game;
  const report = (sort: string, found: string[]) => {
    if (!found.length) return;
    out.push(...found.slice(0, EACH).map((f) => `${sort}: ${f}`));
    if (found.length > EACH) out.push(`${sort}: and ${found.length - EACH} more`);
  };
  const at = (i: number) =>
    `${KIND_NAME[world.kind[i]] ?? `kind ${world.kind[i]}`} ${i} at ${world.x[i].toFixed(1)},${world.y[i].toFixed(1)},${world.z[i].toFixed(1)}`;

  const notNumbers: string[] = [],
    buried: string[] = [];
  let live = 0;
  for (let i = 0; i < world.count; i++) {
    if (!world.alive[i]) continue;
    live++;
    if (world.kind[i] >= KINDS) {
      notNumbers.push(`slot ${i} is of no kind (${world.kind[i]})`);
      continue;
    }
    const values = [world.x[i], world.y[i], world.z[i], world.vx[i], world.vy[i], world.vz[i]];
    if (!values.every(Number.isFinite)) notNumbers.push(at(i));
    else if (!world.carried[i] && !onFloor(layout, world.x[i], world.y[i])) buried.push(at(i));
  }
  report('not a number', notNumbers);
  report('in the rock', buried);
  if (live !== world.live) out.push(`the world counts ${world.live} live, and has ${live}`);
  if (!Number.isFinite(game.t) || game.t < 0) out.push(`the time is ${game.t}`);

  const { ball, strokes, phase, hole, course, card } = game;
  if (!Number.isInteger(hole) || hole < 0 || hole >= course.length) out.push(`the hole is ${hole}`);
  if (phase === 'play' && !world.alive[ball]) out.push('the ball is gone, with the hole still in play');
  if (world.alive[ball]) {
    const speed = Math.hypot(world.vx[ball], world.vy[ball], world.vz[ball]);
    // a hair over, for the float arithmetic of a shot at full power; a ball dropping into the cup gains speed falling
    const most = game.hardest * 1.001 + Math.max(0, -world.z[ball]) * 20;
    if (speed > most) out.push(`the ball is going ${speed.toFixed(2)}, faster than the hardest shot`);
  }
  if (live > 1) out.push(`${live} bodies on the course, and only the ball should be`);
  if (!Number.isInteger(strokes) || strokes < 0) out.push(`the strokes are ${strokes}`);
  else if (hole < course.length && strokes > course[hole].par + LIMIT_OVER_PAR)
    out.push(`${strokes} strokes on hole ${hole + 1}, over its limit`);

  const finished = phase === 'play' ? hole : hole + 1;
  if (card.length !== finished) out.push(`the card has ${card.length} scores, with ${finished} holes finished`);
  card.forEach((score, h) => {
    const limit = (course[h]?.par ?? 0) + LIMIT_OVER_PAR;
    if (!Number.isInteger(score) || score < 1 || score > limit)
      out.push(`hole ${h + 1} is scored ${score}, not between 1 and ${limit}`);
  });
  if (phase === 'over' && hole !== course.length - 1) out.push(`the round is over on hole ${hole + 1}`);

  const save = game.progress.save;
  for (const key of ['coins', 'gems'] as const)
    if (!Number.isInteger(save[key]) || save[key] < 0) out.push(`the ${key} are ${save[key]}`);
  const sold = new Set(CLUBS.map((c) => c.id));
  for (const id of save.owned) if (!sold.has(id)) out.push(`a club no one sells is owned: ${id}`);
  if (!save.owned.includes(CLUBS[0].id)) out.push('the starting putter is not owned');
  if (!save.owned.includes(save.club)) out.push(`the club in hand, ${save.club}, is not owned`);
  return out;
}
