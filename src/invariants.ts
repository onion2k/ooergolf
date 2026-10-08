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
import type { Camera } from 'artshape-render/gpu/camera';
import type { SafeBox } from './aimview';
import { KICKER, WATER_LEVEL, fromKickers } from './arena';
import {
  BUMPER,
  KINDS,
  KIND_NAME,
  HARDEST_SHOT,
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
import { FLY_IN, TILT, VIEW, type CameraRig } from './camera';
import type { Plan } from './autopilot';
import { BAG, bagClub, carrying, type BagClub } from './bag';
import { CUP } from './course';
import { ITEM_FIGURES, itemById } from './items';
import { LIMIT_OVER_PAR, fastest, type Game } from './game';
import type { Preview } from './preview';
import { GREEN, READER, breakOf, greenArrows, leansOnMinigolf, readerArrows, type Arrow, type Break } from './green';
import { GREENS, LANDING, LIE, SURFACES } from './surfaces';
import { BARRIER, WINDMILL, flipperYaw, type Obstacles } from './obstacles';
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
  // the overhead view: blended between nought and one, and, once fitted to a hole, standing in the range it zooms in and
  // looking at a place on the hole
  if (!(rig.blend >= 0 && rig.blend <= 1)) out.push(`the overhead blend is not between nought and one: ${rig.blend}`);
  const over = rig.overheadLimits;
  if (over) {
    const { x, y, distance } = rig.top;
    if (!(distance >= over.least - 1e-9 && distance <= over.most + 1e-9))
      out.push(`the overhead distance is out of its range, ${over.least} to ${over.most}: ${distance}`);
    const b = over.bounds;
    if (!(x >= b.minX - 1e-9 && x <= b.maxX + 1e-9 && y >= b.minY - 1e-9 && y <= b.maxY + 1e-9))
      out.push(`the overhead view looks at ${x},${y}, which is off the hole`);
  }
  return out;
}

/**
 * The fly-in's rules (`FLY_IN`), at game time `t` for a hole begun at `began`: the view, eased as it is drawn, tilted no
 * lower than the fly-in's own tilt and no higher than the play view's least; and no fly-in still under way past its hold,
 * its time and a cut short at the last moment of it. Its own rule, since it goes lower than `viewProblems` lets the play
 * view go, which `rig.tilt` (the play view's) still holds.
 */
export function flyInProblems(rig: CameraRig, t: number, began: number): string[] {
  const out: string[] = [];
  const { tilt } = rig.view(t);
  if (!(tilt <= FLY_IN.tilt + 1e-6 && tilt >= TILT.least - 1e-6))
    out.push(`the view is tilted to ${tilt}, past the fly-in's ${FLY_IN.tilt} or the least ${TILT.least}`);
  if (rig.flying(t) && t - began > FLY_IN.hold + FLY_IN.time + FLY_IN.cut + 1e-6)
    out.push(`the fly-in is still under way ${(t - began).toFixed(2)} seconds after the hole began`);
  return out;
}

/** How much of the screen, in the device's coordinates from minus one to one, the framing rule allows past the safe box: a hundredth either side of the edge it is held to. */
export const FRAMING = { tolerance: 0.02 } as const;

/** Where a point is drawn by the camera as last placed, in the device's coordinates, from minus one to one each way. */
function drawnAt(camera: Camera, x: number, y: number, z: number): [number, number] {
  const m = camera.viewProjection;
  const w = m[3] * x + m[7] * y + m[11] * z + m[15];
  return [(m[0] * x + m[4] * y + m[8] * z + m[12]) / w, (m[1] * x + m[5] * y + m[9] * z + m[13]) / w];
}

/**
 * The framing rule: the ball, and the furthest place a shot can reach where there is one (`reach`, or null when only the ball
 * is to be on the screen, as while it flies), are inside the safe box as the camera `camera`, placed by the rig, draws them,
 * to `FRAMING.tolerance`. It is held only when the view has settled: nothing is said while the rig is easing to an aim
 * view, turning, or blended toward the view from above, since the rule is of where it comes to and not of the way there. The
 * ball alone (`reach` null) is held to the box while the camera eases and turns too, since a ball in flight must always be
 * seen; only the view from above, where the box is not the camera's concern, excuses it.
 * Whether the camera is gliding to a new tee, or parked by a test, is the caller's to say, as the rig does not know the time.
 * A reach past the top of the box is let go when the camera already stands as far back as it may (`atLimit`): a club that
 * goes further than the furthest view shows is the limit's, and the view is the best there is.
 */
export function framingProblems(
  rig: CameraRig,
  camera: Camera,
  ball: { x: number; y: number; z: number },
  reach: { x: number; y: number; z: number } | null,
  box: SafeBox,
): string[] {
  // the ball alone (`reach` null: it is in flight, or the shot's reach is not to be shown) is held to the box whatever the camera
  // is doing but blending to the view from above; the ball with its reach only once the view has settled
  if (rig.blend > 0 || (reach && (rig.aiming || rig.turning))) return [];
  const out: string[] = [];
  const check = (what: string, p: { x: number; y: number; z: number }) => {
    const [nx, ny] = drawnAt(camera, p.x, p.y, p.z);
    if (!Number.isFinite(nx) || !Number.isFinite(ny)) {
      out.push(`the ${what} is not a number on the screen: ${nx},${ny}`);
      return;
    }
    const slack = FRAMING.tolerance;
    const at = `${nx.toFixed(3)},${ny.toFixed(3)}`;
    if (Math.abs(nx) > box.x + slack) out.push(`the ${what} is off the side of the safe box, at ${at}, past ${box.x}`);
    if (ny > box.top + slack && !(what === 'reach' && rig.atLimit))
      out.push(`the ${what} is past the top of the safe box, at ${at}, over ${box.top.toFixed(3)}`);
    if (ny < box.bottom - slack)
      out.push(`the ${what} is past the bottom of the safe box, at ${at}, under ${box.bottom.toFixed(3)}`);
  };
  check('ball', ball);
  if (reach) check('reach', reach);
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
export function arrowProblems(
  layout: Layout,
  arrows: readonly Arrow[] = greenArrows(layout),
  { anywhere = false }: { anywhere?: boolean } = {},
): string[] {
  const out: string[] = [];
  let tiles = 0;
  // the break reader's arrows stand on any ground a ball is played from, not the green's alone, and are no more than its bound
  const onGreen = (t: number, x: number, y: number) =>
    anywhere
      ? !layout.solid[t] && !layout.water[t] && !layout.oob[t]
      : !layout.solid[t] && (layout.golf ? lieAt(layout, x, y) === LIE.green : !layout.water[t]);
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
  if (anywhere && arrows.length > READER.most)
    out.push(`${arrows.length} reader arrows, over the ${READER.most} it may have`);
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
  const b = given ?? breakOf(layout, x, y, game.greens);
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
    // the break reader's arrows round the ball are held to the ground a ball is played from, and to their bound
    if (game.effects.has('reader') && world.alive[game.ball])
      report(
        'the ground',
        arrowProblems(layout, readerArrows(layout, world.x[game.ball], world.y[game.ball]), { anywhere: true }),
      );
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
    // and into a stone at the water's edge the same, below its top, while any of the ball is above the water's surface: one
    // wholly under it is sinking out of the world and out of sight, between the bank and the stone, which the physics does
    // not part as it falls
    for (const st of layout.stones) {
      const sunk = st.r + world.r[ball] - Math.hypot(world.x[ball] - st.x, world.y[ball] - st.y);
      if (sunk > 0.1 && world.z[ball] < st.top && world.z[ball] + world.r[ball] > WATER_LEVEL)
        out.push(
          `the ball is inside a stone, ${sunk.toFixed(2)} into it: ${at(ball)} going ${[world.vx[ball], world.vy[ball], world.vz[ball]].map((v) => v.toFixed(2)).join(',')}, the stone at ${st.x.toFixed(2)},${st.y.toFixed(2)} r ${st.r.toFixed(2)} top ${st.top.toFixed(2)}`,
        );
    }
    out.push(...kickerProblems(game));
    // a ball played never lies out of bounds: it is lost the moment it is on the ground there
    if (layout.golf && world.asleep[ball]) {
      const t = tileAt(layout, world.x[ball], world.y[ball]);
      if (t >= 0 && layout.oob[t]) out.push(`the ball is at rest out of bounds: ${at(ball)}`);
    }
    // a ball is lost the step it meets water, so none lies at rest on a tile of it: an island's shore is where a ball could
    if (layout.golf && world.asleep[ball]) {
      const t = tileAt(layout, world.x[ball], world.y[ball]);
      if (t >= 0 && layout.water[t] && !layout.solid[t]) out.push(`the ball is at rest on water: ${at(ball)}`);
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
      const onPost =
        (Math.abs(bottom - postTop) < 0.05 && fromPosts(layout, world.x[ball], world.y[ball]) < 0) ||
        (Math.abs(bottom - (heightAt(layout, x, y) + KICKER.height)) < 0.05 && fromKickers(layout, x, y) < 0);
      const onStone = layout.stones.some(
        (st) => Math.abs(bottom - st.top) < 0.05 && Math.hypot(x - st.x, y - st.y) < st.r,
      );
      const onBox = game.obstacles.pushers.some((p) => {
        // in the box's own frame: a flipper's is turned, a barrier's is not
        const [lx, ly] = inBox(p, world.x[ball], world.y[ball]);
        return Math.abs(bottom - (p.z + p.hz)) < 0.05 && Math.abs(lx) < p.hx && Math.abs(ly) < p.hy;
      });
      if (!onFloor && !onBox && !onPost && !onStone) out.push(`at rest in the air: ${at(ball)}`);
    }
    // inside a barrier's or a gate's box by more than the physics lets a ball sink into one
    for (const p of game.obstacles.pushers) {
      const [lx, ly] = inBox(p, world.x[ball], world.y[ball]);
      const inside =
        Math.abs(lx) < p.hx - 0.3 && Math.abs(ly) < p.hy - 0.3 && Math.abs(world.z[ball] - p.z) < p.hz - 0.3;
      if (inside) out.push(`the ball is inside a moving box at ${p.x.toFixed(1)},${p.y.toFixed(1)}`);
    }
  }
  report('stream', streamProblems(game));
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
  for (const id of save.owned) if (!itemById(id)) out.push(`an item no one sells is owned: ${id}`);
  if (new Set(save.owned).size !== save.owned.length) out.push('an item is owned twice');
  if (save.item !== '' && !save.owned.includes(save.item)) out.push(`the item equipped, ${save.item}, is not owned`);
  // the bag's own club, or its copy as the power glove has it
  if (layout.golf && !BAG.some((c) => game.club(c) === game.inHand))
    out.push(`the club in hand on a golf hole, ${game.inHand.id}, is not in the bag`);
  report('an item', itemProblems(game));
  out.push(...bumperProblems(game));
  out.push(...boxProblems(game));
  report('a flipper', flipperProblems(game.obstacles));
  return out;
}

/**
 * What is wrong with what the item equipped has done to the game, which is fixed as a hole begins or read as the ball is
 * struck: at most one item is on (the save holds the one id, so it is a string and nothing else), the club in hand is the bag's
 * as the power glove has it (8% harder with it, as it was without), and on minigolf the hardest shot is the course's as
 * the glove has it, so the speed ceilings that follow the hardest follow the item too; the cup is the course's or the
 * magnet's, and the rail's bounce is the course's or the rubber ball's; and the waders and the retake are each used or
 * not, and no more than once, which a flag can only be.
 */
export function itemProblems(game: Game): string[] {
  const out: string[] = [];
  const save = game.progress.save;
  if (typeof save.item !== 'string') out.push(`the item equipped is ${JSON.stringify(save.item)}, not one id`);
  const glove = game.effects.has('glove') ? ITEM_FIGURES.glove.hardest : 1;
  const close = (a: number, b: number) => Math.abs(a - b) <= 1e-9 * Math.max(1, Math.abs(b));
  if (game.layout.golf) {
    const own = bagClub(game.inHand.id).hardest * glove;
    if (!close(game.inHand.hardest, own))
      out.push(
        `the ${game.inHand.id} in hand strikes at most ${game.inHand.hardest}, where the bag's with ${glove === 1 ? 'no glove' : 'the glove'} is ${own}`,
      );
  }
  if (!close(game.hardest, game.layout.golf ? game.inHand.hardest : HARDEST_SHOT * glove))
    out.push(`the hardest shot is ${game.hardest}, which the item held (${save.item || 'none'}) does not make it`);
  if (game.cup.radius !== CUP.radius && game.cup.radius !== ITEM_FIGURES.magnet.radius)
    out.push(`the cup is ${game.cup.radius} across, neither the course's ${CUP.radius} nor the magnet's`);
  if (game.bounceScale !== 1 && game.bounceScale !== ITEM_FIGURES.rubber.bounce)
    out.push(`the rail and the posts return ${game.bounceScale} times what they did, which only the rubber ball does`);
  // read as what they may come to be and not as what they are typed, since a count that crept past one would be a number
  for (const [what, used] of [
    ['waders', game.wadersUsed],
    ['retake', game.mulliganUsed],
  ] as [string, unknown][])
    if (typeof used !== 'boolean') out.push(`the ${what} are used ${String(used)} times, not nought or one`);
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
  // (the club as the game strikes it: a power glove makes it harder, and the club handed in may be the bag's own)
  const held = game.club(bagClub(club.id));
  const blown = windReach(held, 1, WIND.most) * 1.1 + 5;
  const most =
    carrying(held.hardest, held.loft) * 1.06 + held.hardest * Math.sqrt((2 * fall) / PHYSICS.gravity) + 10 + blown;
  if (!(p.carry >= 0 && p.carry <= most))
    out.push(`the flight carries ${p.carry}, which the ${club.id} cannot (at most ${most.toFixed(0)})`);
  const { across, along: length } = p.footprint;
  if (!(across >= 0 && length >= 0 && length <= p.carry / 2 + 1e-6 && across <= p.carry))
    out.push(`the spread is ${across} across and ${length} along, for a carry of ${p.carry}`);
  out.push(...restProblems(game, p));
  return out;
}

/**
 * What is wrong with the ghost shot's rest, the flight carried on past the first landing to where the ball comes to rest:
 * nothing when there is none shown; otherwise it is numbers, begins where the flight came down, ends where it says it rests,
 * its lengths grow, it stays on the hole, and it is no more points than its pool holds.
 */
export function restProblems(game: Game, p: Preview): string[] {
  const out: string[] = [];
  const r = p.rest;
  if (!r.shown) return out;
  if (r.n > r.points.length / 3) out.push(`the rest has ${r.n} points, more than its buffer holds`);
  if (![r.x, r.y, r.carry].every(Number.isFinite)) out.push(`the rest is at ${r.x},${r.y}, not a place`);
  if (r.n === 0) return out;
  for (let k = 0; k < r.n; k++) {
    for (let c = 0; c < 3; c++)
      if (!Number.isFinite(r.points[k * 3 + c])) {
        out.push(`a point of the rest is not a number: ${k}`);
        return out;
      }
    if (k && r.length[k] < r.length[k - 1] - 1e-4) out.push(`the rest's length goes backwards at ${k}`);
  }
  if (Math.hypot(r.points[0] - p.x, r.points[1] - p.y) > 0.6)
    out.push(`the rest does not begin where the flight came down: ${r.points[0]},${r.points[1]} from ${p.x},${p.y}`);
  const last = (r.n - 1) * 3;
  if (Math.hypot(r.points[last] - r.x, r.points[last + 1] - r.y) > 0.6)
    out.push(`the rest ends at ${r.points[last]},${r.points[last + 1]}, not where it says it rests, ${r.x},${r.y}`);
  if (tileAt(game.layout, r.x, r.y) < 0) out.push(`the rest is off the hole, at ${r.x},${r.y}`);
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
  obstacles.barriers.forEach((b) => {
    const throws = b.pusher.restitution ?? Number.NaN;
    const said = b.def.bounce;
    if (said !== undefined && throws !== said)
      out.push(`the barrier at column ${b.def.at[0]} was given a bounce of ${said} and throws with ${throws}`);
    if (said !== undefined && !(throws >= 0 && throws <= BUMPER.restitution * 2))
      out.push(`the barrier at column ${b.def.at[0]} throws with ${throws}, which no bumper may`);
  });
  return out;
}

/**
 * What is wrong with the ball against a kicker: it is never inside one (by more than the physics lets a ball sink into
 * anything), and a ball at a kicker's side is never going faster than the course may throw it. A kicker throws harder
 * than a post, so it is the likeliest thing on a hole to break the ceiling, and the ceiling is held where it is
 * met and not only in the general rule. Nothing to be wrong on a hole with none.
 */
export function kickerProblems(game: Game): string[] {
  const out: string[] = [];
  const { world, ball, layout } = game;
  if (!layout.kickers.length || !world.alive[ball]) return out;
  const x = world.x[ball],
    y = world.y[ball];
  const side = fromKickers(layout, x, y);
  const into = -side + world.r[ball];
  if (into > 0.1 && world.z[ball] < heightAt(layout, x, y) + KICKER.height)
    out.push(`the ball is inside a kicker, ${into.toFixed(2)} into it`);
  const speed = Math.hypot(world.vx[ball], world.vy[ball]);
  if (side < world.r[ball] + 0.5 && speed > fastest(game, x, y) * 1.001)
    out.push(`the ball is going ${speed.toFixed(2)} at a kicker, faster than the course may throw it`);
  return out;
}

/** A point in a moving box's own frame: along it and across it from its middle, as the box is turned (a barrier is not, and a flipper is). */
function inBox(p: { x: number; y: number; yaw: number }, x: number, y: number): [number, number] {
  const c = Math.cos(p.yaw),
    s = Math.sin(p.yaw);
  return [c * (x - p.x) + s * (y - p.y), -s * (x - p.x) + c * (y - p.y)];
}

/**
 * What is wrong with a flipper's pose: it comes from game time alone, so the box the physics holds is what a flipper made
 * new would be at the same time (the arm turned as the clock says, whatever it was doing before), its root is where
 * it was put and has not moved, its length is its own, and it turns only about the root, so its box has no speed but
 * the turn. Checked against the pose worked out afresh, never against the code that moved it.
 */
export function flipperProblems(obstacles: Obstacles): string[] {
  const out: string[] = [];
  for (const f of obstacles.flippers) {
    const { pusher: p, def } = f;
    const what = `the flipper at column ${def.at[0]}, row ${def.at[1]}`;
    const yaw = flipperYaw(def, obstacles.time);
    if (!(Math.abs(p.yaw - yaw) < 1e-9))
      out.push(`${what} points ${p.yaw}, and its time of ${obstacles.time} says ${yaw}`);
    const rootX = p.x - Math.cos(p.yaw) * p.hx,
      rootY = p.y - Math.sin(p.yaw) * p.hx;
    if (!(Math.hypot(rootX - f.x, rootY - f.y) < 1e-6 && p.px === f.x && p.py === f.y))
      out.push(`${what} has come off its root: its arm starts ${rootX},${rootY}, and its root is ${f.x},${f.y}`);
    if (!(Math.abs(p.hx * 2 - f.length) < 1e-9)) out.push(`${what} is ${p.hx * 2} long, and was made ${f.length}`);
    if (p.vx !== 0 || p.vy !== 0)
      out.push(`${what} is going ${p.vx},${p.vy} but for its turn, and its root stands still`);
    if (!Number.isFinite(p.spin)) out.push(`${what} is turning at ${p.spin}`);
  }
  return out;
}

/**
 * What is wrong with the streams of a hole: a stream is a belt drawn as water, so every tile it lies on is a belt's, and
 * is not water, rock or out of bounds, where the ball would be lost or never could be. The ball on a stream is carried.
 */
export function streamProblems(game: Game): string[] {
  const out: string[] = [];
  const { layout, obstacles } = game;
  for (const t of obstacles.streamed) {
    const where = `tile ${t % layout.cols},${Math.floor(t / layout.cols)}`;
    if (!obstacles.belted.has(t)) out.push(`a stream on ${where}, which is no belt's`);
    if (layout.water[t]) out.push(`a stream on ${where}, which is water: the ball would be lost on a belt`);
    if (layout.solid[t]) out.push(`a stream on ${where}, which is rock or rail`);
    if (layout.oob[t]) out.push(`a stream on ${where}, which is out of bounds`);
  }
  return out;
}

/**
 * What is wrong with a ball told lost (`what`, in the water or out of bounds) at (x, y): on a stream it is never lost,
 * since a stream is a belt and carries a ball. Checked as the loss is told.
 */
export function lostOnStreamProblems(game: Game, what: string, x: number, y: number): string[] {
  return game.obstacles.streamed.has(tileAt(game.layout, x, y))
    ? [`the ball was lost (${what}) on a stream at ${x},${y}`]
    : [];
}

/**
 * What is wrong with the boxes the physics shoves with: each barrier's box is on its own slide (within its travel of its
 * middle, at its own row and on the ground), and each windmill's gate is at its own door, parked far above or in the door
 * and no wider than a blade. The boxes are listed in the order the things were given, whatever their kinds, so a reader
 * that takes a barrier's box to be the box of its own number moves a windmill's gate when one is listed first: each
 * thing keeps its own, and this is the rule that it is the right one.
 */
export function boxProblems(game: Game): string[] {
  const out: string[] = [];
  const { obstacles } = game;
  for (const b of obstacles.barriers) {
    const p = b.pusher;
    const what = `the barrier at column ${b.def.at[0]}, row ${b.def.at[1]}`;
    if (!obstacles.pushers.includes(p)) out.push(`${what} has a box the physics does not have`);
    if (!(Math.abs(p.x - b.x) <= b.def.travel + 1e-9))
      out.push(`${what} has its box ${(p.x - b.x).toFixed(2)} from its middle, past its travel of ${b.def.travel}`);
    if (p.y !== b.y || p.z !== BARRIER.hz) out.push(`${what} has its box at ${p.y},${p.z}, off its row or the ground`);
  }
  for (const w of obstacles.windmills) {
    const p = w.pusher;
    const what = `the windmill at column ${w.def.at[0]}, row ${w.def.at[1]}`;
    if (!obstacles.pushers.includes(p)) out.push(`${what} has a gate the physics does not have`);
    if (!(Math.abs(p.x - w.x) <= WINDMILL.gap / 2 + WINDMILL.bladeLength + 1e-9))
      out.push(`${what} has its gate ${(p.x - w.x).toFixed(2)} from its door`);
    if (p.y !== w.y + WINDMILL.hub[1]) out.push(`${what} has its gate at row ${p.y}, not its blades' plane`);
  }
  return out;
}
