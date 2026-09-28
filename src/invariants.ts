/**
 * What must always be true of the game, however it has been played: the
 * rules that, broken, are a bug whatever the feature was.
 *
 * Every body is of a kind the game knows, is a number, and is out of the
 * rock; and the world's count of them is right. The ball is there while a
 * hole is played, the only body on the course, never inside a post, and
 * never faster than the course may throw it: a post throws a ball faster
 * than it came, up to half as fast again as the hardest shot of the club
 * that struck it, and nothing else gives it speed of its own. A ball at
 * rest lies on something: the floor under it, or the top of a box or a
 * post, never in the air at the top of a bounce. The strokes are a count no
 * more than the hole's limit. The card has a score for every hole finished
 * and no other, each between one stroke and the limit. The coins and gems are
 * counts, the clubs owned are clubs the shop sells, the starting putter
 * among them, and the club in hand is one of them.
 *
 * Checked by the fuzzer after everything it does, by the test API on asking,
 * and by the unit tests. Each broken rule is a line saying what and where.
 */
import { BUMPER, FASTEST, KINDS, KIND_NAME, fromPosts, tileAt } from './arena';
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
    else if (!world.carried[i]) {
      // water is not rock: a ball is over it as it falls in
      const t = tileAt(layout, world.x[i], world.y[i]);
      if (t < 0 || layout.solid[t]) buried.push(at(i));
    }
  }
  report('not a number', notNumbers);
  report('in the rock', buried);
  if (live !== world.live) out.push(`the world counts ${world.live} live, and has ${live}`);
  if (!Number.isFinite(game.t) || game.t < 0) out.push(`the time is ${game.t}`);

  const { ball, strokes, phase, hole, course, card } = game;
  if (!Number.isInteger(hole) || hole < 0 || hole >= course.length) out.push(`the hole is ${hole}`);
  if (phase === 'play' && !world.alive[ball]) out.push('the ball is gone, with the hole still in play');
  if (world.alive[ball]) {
    // along the ground: a fall into the cup, into water or off raised grass gains speed downward, and only downward
    const speed = Math.hypot(world.vx[ball], world.vy[ball]);
    // a hair over, for the float arithmetic of a shot at full power; nothing that moves goes as fast as that
    // a post throws a ball faster than it came, up to the course's ceiling; of the club that struck it, and not one put
    // in hand since, which strikes no ball already rolling
    if (speed > Math.max(game.hardest, game.struckWith) * FASTEST * 1.001)
      out.push(`the ball is going ${speed.toFixed(2)} along the ground, faster than a post may throw it`);
    // into a post by more than the physics lets a ball sink into anything, below the post's top
    const into = -fromPosts(layout, world.x[ball], world.y[ball]) + world.r[ball];
    if (into > 0.1 && world.z[ball] < BUMPER.height) out.push(`the ball is inside a post, ${into.toFixed(2)} into it`);
    // at rest with nothing under it: asleep where a bounce left it, which a player could never strike from
    if (world.asleep[ball]) {
      const r = world.r[ball];
      const bottom = world.z[ball] - r;
      const onFloor = Math.abs(bottom - world.floorAt(world.x[ball], world.y[ball])) < 0.05;
      const onPost = Math.abs(bottom - BUMPER.height) < 0.05 && fromPosts(layout, world.x[ball], world.y[ball]) < 0;
      const onBox = game.obstacles.pushers.some(
        (p) =>
          Math.abs(bottom - (p.z + p.hz)) < 0.05 &&
          Math.abs(world.x[ball] - p.x) < p.hx &&
          Math.abs(world.y[ball] - p.y) < p.hy,
      );
      if (!onFloor && !onBox && !onPost) out.push(`at rest in the air: ${at(ball)}`);
    }
    // inside a barrier's or a gate's box by more than the physics lets a ball sink into one
    for (const p of game.obstacles.pushers) {
      const inside =
        Math.abs(world.x[ball] - p.x) < p.hx - 0.3 &&
        Math.abs(world.y[ball] - p.y) < p.hy - 0.3 &&
        Math.abs(world.z[ball] - p.z) < p.hz - 0.3;
      if (inside) out.push(`the ball is inside a moving box at ${p.x.toFixed(1)},${p.y.toFixed(1)}`);
    }
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
