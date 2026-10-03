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
 * among them, and the club in hand is one of them. On a golf hole the club in
 * hand is one of the bag's, and the ball is never going faster in all, in the
 * air as on the ground, than the club that struck it could send it, and a
 * fall from the highest ground could make it (and what the wind adds, for as long as a ball flies), never at rest out
 * of bounds, and never inside a tree's trunk or canopy. The shape and the spin chosen for the next shot are numbers
 * from minus one to one, and the wind is a speed from nought to the most a hole has along a unit direction, and calm on
 * every hole that is not golf. And a knock told is of
 * the ball, where it is, as hard as a knock is, along a direction: a rule of
 * what is told rather than of what is, so `knockProblems` is asked of each
 * knock as it is told, and `landingProblems` of each landing. And of the golf's greens: a hole's speed of green is a
 * number from the fastest to the slowest and only on golf; every tile of putting green leans no more than a green may
 * (`GREEN`, and a tenth over for the smoothing the physics rolls a ball on); the first cut is only on ground a ball is
 * played from, never sand, water, out of bounds, rock or the rail; a ball at rest on a golf hole is on a slope its
 * lie holds a ball on; the break a putt is shown is a number across no further than the cup is; and the arrows laid over
 * a green are numbers, each on a tile of putting green, and no more than its tiles.
 *
 * Checked by the fuzzer after everything it does, by the test API on asking,
 * and by the unit tests. Each broken rule is a line saying what and where.
 */
import {
  BUMPER,
  KINDS,
  KIND_NAME,
  KNOCK,
  PHYSICS,
  fromPosts,
  fromTrees,
  TILE,
  heightAt,
  highestTerrain,
  slopeAt,
  slopeInto,
  lieAt,
  restingAbove,
  tileAt,
  type Layout,
} from './arena';
import { TILT, VIEW, type CameraRig } from './camera';
import type { Plan } from './autopilot';
import { BAG, carrying, type BagClub } from './bag';
import { CLUBS } from './clubs';
import { LIMIT_OVER_PAR, fastest, type Game } from './game';
import type { Preview } from './preview';
import { GREEN, breakOf, greenArrows, leansOnMinigolf, type Arrow, type Break } from './green';
import { GREENS, LANDING, LIE, SURFACES } from './surfaces';
import { WIND, windPush, windReach } from './shaping';
import { TREE, insideCanopy } from './trees';

/** How many broken rules of one sort are reported before the rest are only counted. */
const EACH = 3;

/**
 * How long, in seconds, a ball may be pushed by the wind before the rules give up on it: more than the longest flight
 * of any club by a good way, so the allowance for the wind is generous and never the thing that is wrong.
 */
const WIND_FLIGHT = 8;

/** How long, in seconds, the camera may take to turn to face a place: a half turn is a second and a quarter, and this is a good way over. */
export const TURN_TIME = 2;

/**
 * The rules a camera must always keep, however a player has turned, tilted and zoomed it: its turn and its tilt are
 * numbers, it has turned no more than a turn either way and is tilted within `TILT`, it is no nearer or further than the
 * zoom allows (which is further on a golf hole), and it looks ahead of the ball by a number of yards. And a camera turning
 * to face a place (`turning`) is not left at it: given `turningFor`, the seconds it has been, it is done within
 * `TURN_TIME`, since the ease snaps home and a half turn takes a second and a quarter. The turn it is at is held to the
 * same rules as any, which is all that can be said of the way it is going: the rig keeps that to itself.
 */
export function viewProblems(rig: CameraRig, turningFor = 0): string[] {
  const out: string[] = [];
  if (rig.turning && turningFor > TURN_TIME)
    out.push(`the camera is still turning to face a place after ${turningFor.toFixed(2)} seconds, past ${TURN_TIME}`);
  if (!Number.isFinite(rig.azimuth)) out.push(`the turn is not a number: ${rig.azimuth}`);
  else if (Math.abs(rig.azimuth) > Math.PI + 1e-9) out.push(`the turn is more than a turn: ${rig.azimuth}`);
  if (!Number.isFinite(rig.tilt)) out.push(`the tilt is not a number: ${rig.tilt}`);
  else if (rig.tilt < TILT.least - 1e-9 || rig.tilt > TILT.most + 1e-9)
    out.push(`the tilt is out of its limits, ${TILT.least} to ${TILT.most}: ${rig.tilt}`);
  if (!(rig.distance >= VIEW.near - 1e-9 && rig.distance <= rig.far + 1e-9))
    out.push(`the distance is out of the zoom, ${VIEW.near} to ${rig.far}: ${rig.distance}`);
  if (!(rig.lead >= 0 && Number.isFinite(rig.lead)))
    out.push(`the lead is not a number of yards, nought or more: ${rig.lead}`);
  return out;
}

/** What a green may lean, as `GREEN` says, and a tenth over: the physics rolls a ball on the ground smoothed between the tiles, and the figure is the contour's own, read the same way. */
export const GREEN_RULES = { steepest: GREEN.steepest * 1.1 } as const;

/** How much steeper than its lie holds a ball on a slope may be for a ball at rest on it, before the rule calls it a ball that should have rolled: a quarter, and a hair for the very flat. */
const HOLDS = { share: 1.25, hair: 0.01 } as const;

/** The middle of a tile, as the rules say where one is. */
const place = (layout: Layout, t: number) =>
  `${(layout.originX + ((t % layout.cols) + 0.5) * TILE).toFixed(1)},${(layout.originY + (Math.floor(t / layout.cols) + 0.5) * TILE).toFixed(1)}`;

/**
 * What is wrong with a hole's ground, which does not change while the hole is played: no tile of putting green leans more
 * than `GREEN_RULES` allows (unless `slope` is false: only a hole that says how fast its greens run is made with a green
 * of that kind, and a test's own hill with a cup on it is not), and the first cut, which a ball is played from, is on no
 * sand, water, out of bounds, rock or rail (and there is none on a hole of minigolf).
 */
export function groundProblems(layout: Layout, { slope: leans = true }: { slope?: boolean } = {}): string[] {
  const out: string[] = [];
  const tiles = layout.cols * layout.rows;
  for (let t = 0; t < tiles; t++) {
    if (layout.lie[t] === LIE.cut) {
      const on = !layout.golf
        ? 'a hole of minigolf'
        : layout.sand[t]
          ? 'sand'
          : layout.water[t]
            ? 'water'
            : layout.oob[t]
              ? 'out of bounds'
              : layout.rail[t]
                ? 'the rail'
                : layout.solid[t]
                  ? 'rock'
                  : '';
      if (on) out.push(`first cut on ${on} at ${place(layout, t)}`);
    }
  }
  if (!layout.golf || !leans) return out;
  const slope: [number, number] = [0, 0];
  for (let t = 0; t < tiles; t++) {
    if (layout.solid[t]) continue;
    const x = layout.originX + ((t % layout.cols) + 0.5) * TILE,
      y = layout.originY + (Math.floor(t / layout.cols) + 0.5) * TILE;
    if (lieAt(layout, x, y) !== LIE.green) continue;
    slopeInto(layout, x, y, slope);
    const lean = Math.hypot(slope[0], slope[1]);
    if (!(lean <= GREEN_RULES.steepest))
      out.push(
        `the putting green slopes ${lean.toFixed(4)} at ${x.toFixed(1)},${y.toFixed(1)}, over the ${GREEN_RULES.steepest.toFixed(4)} a green may`,
      );
  }
  return out;
}

/**
 * What is wrong with the arrows laid over a green (the hole's own, as `greenArrows` says them, unless given): each is
 * numbers, stands on a tile of putting green (on a hole of minigolf, a tile of its floor: not rail and not water), and there
 * are no more of them than the green has tiles.
 */
export function arrowProblems(layout: Layout, arrows: readonly Arrow[] = greenArrows(layout)): string[] {
  const out: string[] = [];
  let tiles = 0;
  const onGreen = (t: number, x: number, y: number) =>
    !layout.solid[t] && (layout.golf ? lieAt(layout, x, y) === LIE.green : !layout.water[t]);
  for (let t = 0; t < layout.cols * layout.rows; t++)
    if (
      onGreen(
        t,
        layout.originX + ((t % layout.cols) + 0.5) * TILE,
        layout.originY + (Math.floor(t / layout.cols) + 0.5) * TILE,
      )
    )
      tiles++;
  for (const a of arrows) {
    if (![a.x, a.y, a.slopeX, a.slopeY].every(Number.isFinite)) {
      out.push(`an arrow at ${a.x},${a.y} is not a number`);
      continue;
    }
    const t = tileAt(layout, a.x, a.y);
    if (t < 0 || !onGreen(t, a.x, a.y))
      out.push(
        `an arrow at ${a.x.toFixed(1)},${a.y.toFixed(1)} is not on the ${layout.golf ? 'putting green' : 'floor'}`,
      );
  }
  if (arrows.length > tiles) out.push(`${arrows.length} arrows, more arrows than the green has tiles, ${tiles}`);
  return out;
}

/** The farthest a putt on the minigolf green is held to the break's rule, in units: what the starting putter rolls on the level. Past it a hill can ask for an aim that is no putt's (the model gives up at a right angle). */
const PUTTABLE = 50;

/**
 * What is wrong with the break a player is shown for the putt from where the ball lies (or the one given): it is numbers,
 * and it asks for an aim off the cup by no more than the cup is from the ball, which is no putt's break at all.
 */
export function breakProblems(game: Game, given?: Break): string[] {
  const out: string[] = [];
  const { world, ball, layout } = game;
  if (!world.alive[ball]) return out;
  const x = world.x[ball],
    y = world.y[ball];
  const b = given ?? breakOf(layout, x, y, game.def.greens);
  if (!Number.isFinite(b.across)) out.push(`the break's across is ${b.across}`);
  if (!Number.isFinite(b.rise)) out.push(`the break's rise is ${b.rise}`);
  const far = Math.hypot(layout.cup.x - x, layout.cup.y - y);
  // a putt of minigolf past what a putter rolls is not one anyone makes, and what it breaks by on a hill is not held to the
  // cup's distance
  if (Number.isFinite(b.across) && Math.abs(b.across) > far + 1e-6 && (layout.golf || far <= PUTTABLE))
    out.push(`the break is ${b.across.toFixed(2)} across, further than the cup is, ${far.toFixed(2)}`);
  return out;
}

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

  // what a player chooses for the next shot, and what the hole's wind is: numbers, in their limits, and calm off the golf
  for (const [what, v] of [
    ['shape', game.shape],
    ['spin', game.spin],
  ] as const)
    if (!(Number.isFinite(v) && v >= -1 && v <= 1)) out.push(`the ${what} is ${v}, not a number from -1 to 1`);
  const wind = game.wind;
  if (!(Number.isFinite(wind.speed) && wind.speed >= 0 && wind.speed <= WIND.most))
    out.push(`the wind is ${wind.speed} miles an hour, not from nought to ${WIND.most}`);
  if (!(Math.abs(Math.hypot(wind.x, wind.y) - 1) < 1e-6))
    out.push(`the wind blows along ${wind.x},${wind.y}, no direction`);
  if (!layout.golf && wind.speed !== 0) out.push(`the wind is ${wind.speed} on a hole of minigolf, where it is calm`);

  // the speed of the greens is the hole's own, from the fastest to the slowest, and only golf has one
  const greens = game.def.greens;
  if (greens !== undefined) {
    if (!layout.golf) out.push(`the greens run at ${greens} on a hole of minigolf, which has none`);
    else if (!(Number.isFinite(greens) && greens >= GREENS.fast && greens <= GREENS.slow))
      out.push(`the greens run at ${greens}, not a number from ${GREENS.fast} to ${GREENS.slow}`);
  }
  if (layout.golf) {
    report('the ground', [...groundProblems(layout, { slope: greens !== undefined }), ...arrowProblems(layout)]);
    report('the break', breakProblems(game));
  } else {
    report('the ground', groundProblems(layout));
    // a hole of minigolf whose ground leans shows the arrows and the break golf's green does, and is held to the same
    if (leansOnMinigolf(layout)) {
      report('the ground', arrowProblems(layout));
      report('the break', breakProblems(game));
    }
  }

  const { ball, strokes, phase, hole, course, card } = game;
  if (!Number.isInteger(hole) || hole < 0 || hole >= course.length) out.push(`the hole is ${hole}`);
  if (phase === 'play' && !world.alive[ball]) out.push('the ball is gone, with the hole still in play');
  if (world.alive[ball]) {
    // along the ground: a fall into the cup, into water or off raised grass gains speed downward, and only downward
    const speed = Math.hypot(world.vx[ball], world.vy[ball]);
    // the wind pushes a ball in the air for as long as it flies, steady, and adds that to what the club and a fall give it
    const blown = windPush(wind.speed) * WIND_FLIGHT;
    // a hair over, for the float arithmetic of a shot at full power; nothing that moves goes as fast as that
    // a post throws a ball faster than it came, up to the course's ceiling, of the club that struck it and not one put in
    // hand since; and a ball rolled down a slope is faster by what the drop gives it
    if (speed > fastest(game, world.x[ball], world.y[ball]) * 1.001 + blown)
      out.push(`the ball is going ${speed.toFixed(2)} along the ground, faster than a post and a slope may make it`);
    // inside a tree: a trunk is a post, met by the physics, and a canopy is met by the game; the ball is in neither
    if (layout.trees.length) {
      const trunk = -fromTrees(layout, world.x[ball], world.y[ball]) + world.r[ball];
      if (trunk > 0.1 && world.z[ball] < heightAt(layout, world.x[ball], world.y[ball]) + TREE.base)
        out.push(`the ball is inside a tree's trunk, ${trunk.toFixed(2)} into it`);
      for (const c of game.cones) {
        const depth = insideCanopy(c, [world.x[ball], world.y[ball], world.z[ball]], world.r[ball]);
        if (depth > 0.05) out.push(`the ball is inside a tree's canopy, ${depth.toFixed(2)} into it`);
      }
    }
    // a lofted ball's speed in all: no club sends it faster than it has, and a fall only adds what the height gives
    if (layout.golf) {
      const all = Math.hypot(world.vx[ball], world.vy[ball], world.vz[ball]);
      if (all > fastest(game, world.x[ball], world.y[ball]) * 1.001 + blown)
        out.push(`the ball is going ${all.toFixed(2)} in all, faster than any club could send it, and a fall make it`);
    }
    // into a post by more than the physics lets a ball sink into anything, below the post's top
    const into = -fromPosts(layout, world.x[ball], world.y[ball]) + world.r[ball];
    const postTop = heightAt(layout, world.x[ball], world.y[ball]) + BUMPER.height;
    if (into > 0.1 && world.z[ball] < postTop) out.push(`the ball is inside a post, ${into.toFixed(2)} into it`);
    // a ball played never lies out of bounds: it is lost the moment it is on the ground there
    if (layout.golf && world.asleep[ball]) {
      const t = tileAt(layout, world.x[ball], world.y[ball]);
      if (t >= 0 && layout.oob[t]) out.push(`the ball is at rest out of bounds: ${at(ball)}`);
    }
    // at rest on ground its lie holds it on: a ball that stopped on a slope steeper than the roll can hold would have rolled
    if (layout.golf && world.asleep[ball]) {
      const slope = Math.hypot(...slopeAt(layout, world.x[ball], world.y[ball]));
      const holds = Math.tan(Math.asin(Math.min(1, game.rollAt(world.x[ball], world.y[ball]) / PHYSICS.gravity)));
      if (!(slope <= holds * HOLDS.share + HOLDS.hair))
        out.push(
          `at rest on a slope of ${slope.toFixed(3)}, which the ${SURFACES[lieAt(layout, world.x[ball], world.y[ball])].name} holds no ball on past ${holds.toFixed(3)}: ${at(ball)}`,
        );
    }
    // at rest with nothing under it: asleep where a bounce left it, which a player could never strike from
    if (world.asleep[ball]) {
      const r = world.r[ball];
      const bottom = world.z[ball] - r;
      // on a slope its middle stands further above the ground than its radius
      const x = world.x[ball],
        y = world.y[ball];
      const onFloor = Math.abs(world.z[ball] - heightAt(layout, x, y) - restingAbove(layout, x, y, r)) < 0.05;
      const onPost = Math.abs(bottom - postTop) < 0.05 && fromPosts(layout, world.x[ball], world.y[ball]) < 0;
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
  if (layout.golf && !BAG.includes(game.inHand))
    out.push(`the club in hand on a golf hole, ${game.inHand.id}, is not in the bag`);
  out.push(...bumperProblems(game));
  return out;
}

/**
 * What is wrong with a landing told, checked as it is told: a landing is of the ball on the course, where it is, and
 * as hard as a landing is. The page marks where the ball first came down, so one of no ball, of nowhere or of a
 * speed that is not one would be drawn as nonsense.
 */
export function landingProblems(game: Game, speed: number, x: number, y: number): string[] {
  const out: string[] = [];
  const { world, ball } = game;
  if (!world.alive[ball]) out.push('a landing told of no ball');
  else if (!(Math.abs(world.x[ball] - x) < 1e-9 && Math.abs(world.y[ball] - y) < 1e-9))
    out.push(`a landing told at ${x},${y}, not where the ball is`);
  if (!(speed >= LANDING.least) || !Number.isFinite(speed)) out.push(`a landing at ${speed}, softer than a landing is`);
  return out;
}

/**
 * What is wrong with a knock told, checked as it is told: a knock is of the
 * ball on the course, where it is, at least as hard as `KNOCK` says a knock
 * is, and along a direction. The page squashes the ball it draws by it, so a
 * knock of no ball, of nothing, or along no line would be drawn as nonsense.
 */
export function knockProblems(
  game: Game,
  hard: number,
  x: number,
  y: number,
  dx: number,
  dy: number,
  dz: number,
): string[] {
  const out: string[] = [];
  const { world, ball } = game;
  if (!world.alive[ball]) out.push('a knock told of no ball');
  else if (!(Math.abs(world.x[ball] - x) < 1e-9 && Math.abs(world.y[ball] - y) < 1e-9))
    out.push(`a knock told at ${x},${y}, not where the ball is`);
  if (!(hard >= KNOCK.least) || !Number.isFinite(hard)) out.push(`a knock of ${hard}, softer than a knock is`);
  if (!(Math.abs(Math.hypot(dx, dy, dz) - 1) < 1e-6)) out.push(`a knock along ${dx},${dy},${dz}, along no direction`);
  return out;
}

/**
 * What is wrong with a plan the autopilot made, checked as it is made: it is a shot, which is an aim that is a number
 * and a power over nought and no more than all; on a golf hole the club it names is one of the bag's, and on any other
 * it names none; and what it expects, if it says, is a place. A plan that is not one is struck as no shot at all, and
 * a round played by it would be a round of refused strokes that the gate counts as nothing.
 */
export function planProblems(game: Game, plan: Plan): string[] {
  const out: string[] = [];
  if (!Number.isFinite(plan.angle)) out.push(`the plan's aim is ${plan.angle}`);
  if (!(plan.power > 0 && plan.power <= 1))
    out.push(`the plan's power is ${plan.power}, not over nought and no more than all`);
  const golf = game.layout.golf;
  if (golf && !BAG.some((c) => c.id === plan.club))
    out.push(`the plan's club on a golf hole is ${plan.club}, which is not in the bag`);
  if (!golf && plan.club !== undefined) out.push(`the plan names a club, ${plan.club}, on a hole of minigolf`);
  if (plan.expect && !(Number.isFinite(plan.expect.x) && Number.isFinite(plan.expect.y)))
    out.push(`the plan expects the ball at ${plan.expect.x},${plan.expect.y}`);
  return out;
}

/**
 * What is wrong with a preview, the flight a drag would make worked out before the shot is taken: it is a flight that
 * begins at the ball and is numbers all through, its lengths grow and its last is the path's own, it ends at the place
 * it says it came down, it goes no further than a club can send a ball (from the level, and with a fall from the highest
 * ground besides, and what the wind at its strongest and a shape can add), it has a heading that is a number, and its
 * spread is a spread (across and along nought or more, and never longer than half the flight).
 * A club with no loft has no preview, and nothing to be wrong.
 */
export function previewProblems(game: Game, from: { x: number; y: number }, club: BagClub, p: Preview): string[] {
  const out: string[] = [];
  if (club.loft <= 0 || p.n === 0) return out;
  if (p.n < 2) out.push(`the flight has ${p.n} point`);
  let along = 0;
  for (let k = 0; k < p.n; k++) {
    for (let c = 0; c < 3; c++)
      if (!Number.isFinite(p.points[k * 3 + c])) {
        out.push(`a point of the flight is not a number: ${k}`);
        return out;
      }
    if (k) {
      if (p.length[k] < p.length[k - 1] - 1e-4) out.push(`the flight's length goes backwards at ${k}`);
      along += Math.hypot(...[0, 1, 2].map((c) => p.points[k * 3 + c] - p.points[(k - 1) * 3 + c]));
    }
  }
  if (Math.abs(p.length[p.n - 1] - along) > 0.01 * (1 + along))
    out.push(`the flight's length is ${p.length[p.n - 1]}, not ${along}`);
  if (Math.hypot(p.points[0] - from.x, p.points[1] - from.y) > 0.6)
    out.push(`the flight does not begin at the ball: ${p.points[0]},${p.points[1]} from ${from.x},${from.y}`);
  const last = (p.n - 1) * 3;
  if (Math.hypot(p.points[last] - p.x, p.points[last + 1] - p.y) > 0.6)
    out.push(
      `the flight ends at ${p.points[last]},${p.points[last + 1]}, not where it says it came down, ${p.x},${p.y}`,
    );
  if (!Number.isFinite(p.heading)) out.push(`the flight's heading is ${p.heading}`);
  if (!['landed', 'holed', 'water', 'out'].includes(p.end)) out.push(`the flight ended as ${p.end}`);
  // no further than the club can send a ball: its own carry at its hardest (a little over, since a ball comes down below
  // where it left), and what a fall from the highest ground adds to it, and a little for the ball's own size
  const fall = highestTerrain(game.layout) + 5;
  // and the most a tailwind of the strongest hole carries it further
  const blown = windReach(club, 1, WIND.most) * 1.1 + 5;
  const most =
    carrying(club.hardest, club.loft) * 1.06 + club.hardest * Math.sqrt((2 * fall) / PHYSICS.gravity) + 10 + blown;
  if (!(p.carry >= 0 && p.carry <= most))
    out.push(`the flight carries ${p.carry}, which the ${club.id} cannot (at most ${most.toFixed(0)})`);
  const { across, along: length } = p.footprint;
  if (!(across >= 0 && length >= 0 && length <= p.carry / 2 + 1e-6 && across <= p.carry))
    out.push(`the spread is ${across} across and ${length} along, for a carry of ${p.carry}`);
  return out;
}

/**
 * A moving bumper is a barrier that throws, and what it throws is held to the same ceiling as a post's (the ball's speed
 * rule above, which needs nothing of it): here, that what it was given to throw with is a number the game could have meant,
 * from nought to twice a post's, and that the box the physics shoves with keeps what its definition said.
 */
export function bumperProblems(game: Game): string[] {
  const out: string[] = [];
  const { obstacles } = game;
  obstacles.barriers.forEach((b, k) => {
    const throws = obstacles.pushers[k].restitution ?? Number.NaN;
    const said = b.def.bounce;
    if (said !== undefined && throws !== said)
      out.push(`the barrier at column ${b.def.at[0]} was given a bounce of ${said} and throws with ${throws}`);
    if (said !== undefined && !(throws >= 0 && throws <= BUMPER.restitution * 2))
      out.push(`the barrier at column ${b.def.at[0]} throws with ${throws}, which no bumper may`);
  });
  return out;
}
