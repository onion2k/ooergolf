/**
 * The director: what is done to the camera as a game goes on, whoever is playing. It sends the camera to the aim view of
 * the club in hand when the ball is ready, begins it on a new hole's tee, turns it to face the flag, and follows the ball,
 * all by game time. It was the page's own, a few lines in each of its callbacks, and the fuzzer wanted the same; kept here
 * the page and the fuzzer drive one implementation and the camera can be tested without either. Without it a change to how
 * the camera behaves would be made twice, and the fuzzer would hold the page to a copy.
 *
 * It also keeps the ball and the furthest a shot can reach on the screen (`aimview.ts`'s safe box): on a golf hole by the aim
 * view of the club, and on a hole of minigolf by one of the putter's reach along the aim, which is the home view exactly when
 * that fits there. It follows the ball for one stroke in five and holds still for the rest, taking the ball up only when it
 * would leave that box.
 *
 * It holds a fixed set of numbers and a string, never a list, and it never draws the game's chance.
 */
import { BALL, KIND_RADIUS, heightAt, lieAt, rollsFor } from './arena';
import { aimView, fitsHome, floorFor, reachOf, reachOnMinigolf, safeBox, screenOf } from './aimview';
import { CameraRig, LEAD, TILT, VIEW, catchUp, facing, standOf, tallOf, wrap } from './camera';
import type { Game } from './game';
import { hashed } from './random';
import type { Shot } from './shot';

/**
 * What of a drag turns the camera to face it: a drag of at least `least` of the hardest shot, since a short one is on its
 * way to being taken back and a camera swinging round to every twitch would be seen to lurch.
 */
export const AIM_TURN = { least: 0.15 };

/**
 * The dead zone of the aim: while the aim is within `half` radians of the way the camera faces, the camera stays still and
 * only the reticule moves, so a small adjustment of a shot does not swing the view. Past it the camera turns just far enough
 * to keep the aim on the zone's edge, so there is no jump as the aim crosses it.
 */
export const AIM_DEAD = { half: 0.2 } as const;

/** What a toss of the camera's is for, so two tosses of the same lie are not the one: which strokes it follows. */
export const SALT = { follow: 3 } as const;

/**
 * The share of strokes the camera follows the ball for (a fifth): the rest it holds where it stood and lets the ball
 * fly across the aim view, taking it up only if the ball would leave the screen. Which strokes is a hash of the view seed, the
 * hole and the stroke, so it is the same every run and draws none of the game's chance.
 */
export const FOLLOW = { share: 0.2 } as const;

/** Whether the camera follows the ball for each stroke as `FOLLOW` says, or for every one, or for none but those the ball would leave the screen in. */
export type FollowShots = 'drawn' | 'always' | 'never';

/**
 * How the camera takes the ball up on a stroke it is holding still for. It begins from `from` of the way out to the safe box's
 * edge (in the box's own terms, so a half is half way out to it on whichever side the ball is nearest), well before the edge,
 * and from then goes after the ball at the pace `catchUp` says, but its speed may not change by more than `accel` yards a
 * second a second. Without the band the camera sat still to the edge and then went after a ball at 200 yards a second in one
 * frame (a change of speed of 130,000 a second a second), which was seen as a lurch; a pace that merely rose with the ball's
 * distance out was tried and rose as fast as the ball crossed it, 3,000 to 5,000 a second a second, so the speed is held.
 */
export const HAND_OVER = { from: 0.6, accel: 400 } as const;

/** How many times the camera's pace is doubled, at most, to keep a ball on its way inside the safe box: more than the lag of the fastest ball needs. */
const CATCH_UP_DOUBLINGS = 8;

export class Director {
  private game: Game | null = null;
  private aspect = 1.6;
  private height = 0;
  /** The club and the lie the camera was last sent to look at a shot from, so it is sent again only when one changes. */
  private aimedFor = '';
  /**
   * Where the minigolf aim view was last worked out for: the ball's place, the way it faces and how far the putter in hand
   * rolls, so it is worked out again only when one changes (nothing is made); not a number while the ball is not ready or
   * the screen has changed. A putter equipped is a longer reach with the ball and the heading where they were.
   */
  private readonly worked = { x: Number.NaN, y: Number.NaN, t: Number.NaN, roll: Number.NaN };
  /** Whether the camera was last sent to a view stood back from home on minigolf, so that it is sent home again when the reach fits there. */
  private stood = false;
  /** What the camera's tosses are made from, with the hole and the stroke: the page's own at boot, and a test's or the fuzzer's by `setSeed`. */
  private seed = 0;
  /** Whether the stroke being played has the camera following the ball: drawn when it is struck, and latched on if the ball would leave the screen. */
  private chasing = false;
  /** Which strokes are followed: as `FOLLOW` says, or all, or none, which a test chooses. */
  private mode: FollowShots = 'drawn';
  /** The camera's turn and tilt as the latch reads them, written each frame and never made. */
  private readonly seen = { azimuth: 0, tilt: 0 };
  /** Where the ball is on the screen, as the latch reads it, written each frame and never made. */
  private readonly ndc: [number, number] = [0, 0];
  /** The target's speed as the hand-over last left it, written each frame and never made. */
  private readonly vel = [0, 0, 0];
  /** Whether the camera took the ball up this stroke from a hold, so its change of speed is held (`HAND_OVER`). */
  private handing = false;
  /** Whether the camera has been put on a hole yet: the first has nowhere to glide from. */
  private looked = false;
  /** Whether a test has put the camera somewhere and left it: on minigolf the aim view that frames the reach is not sent while it has. */
  private left = false;
  /** Whether the ball was ready at the last frame, so the moment it comes to rest is seen and the camera turned to the flag. */
  private wasReady = true;

  constructor(readonly rig: CameraRig) {}

  /** The game it directs for: the page's, or a test's own, which may be swapped for another. */
  use(game: Game) {
    this.game = game;
  }

  /**
   * The seed the camera's tosses are made from. Nothing of the game: the toss that says which side of the flag the camera looks
   * to is a hash of this, the hole and the stroke, so it draws none of the game's chance and the same lie gives the same view.
   */
  setSeed(seed: number) {
    this.seed = seed;
  }

  /**
   * A test's say that it has put the camera where it wants it (`on`) or taken it back (`off`): while it has, a hole of minigolf
   * is not sent to the view that frames the putter's reach, since that would move a camera the test parked. It is not the
   * `parked` of `frame`, which only says the ball is not followed, as the fuzzer says it for the frames it holds the camera still.
   */
  park(on: boolean) {
    this.left = on;
    // taken back, the view is worked out afresh for where the ball and the heading are
    this.worked.x = Number.NaN;
  }

  /** Which strokes the camera follows the ball for, as a test chooses: the share `FOLLOW` says, all of them, or none (but where the ball would leave the screen). */
  followShots(mode: FollowShots) {
    this.mode = mode;
  }

  /** Whether the camera is following the ball for the stroke being played: drawn as it is struck, and on from the moment the ball would have left the screen. */
  get following(): boolean {
    return this.chasing || this.handing;
  }

  /**
   * A stroke struck: whether the camera follows the ball for it, one in five by a hash of the seed, the hole and the stroke
   * (`FOLLOW`), or as `followShots` says. The rest it holds where it stood, and the ball flies across the view; see `frame`.
   */
  struck() {
    const game = this.game;
    if (!game) return;
    this.handing = false;
    this.chasing =
      this.mode === 'always'
        ? true
        : this.mode === 'never'
          ? false
          : hashed(this.seed, game.hole, game.strokes, SALT.follow) < FOLLOW.share;
  }

  /** Told the shape and the height of the screen, which the aim view depends on: the view is worked out again. */
  setScreen(aspect: number, height: number) {
    this.aspect = aspect;
    this.height = height;
    this.rig.setScreen(aspect);
    this.aimedFor = '';
    this.worked.x = Number.NaN;
  }

  /**
   * A hole begun: the camera on its tee, glided to from where it was but for the first hole, which has nowhere to glide
   * from, and a golf hole's aim view of the driver sent for. A hole of minigolf has its limits and its home view as it
   * always had.
   */
  started() {
    const glide = this.looked;
    const game = this.game;
    if (!game) return;
    const { layout, t } = game;
    const { rig } = this;
    const teeZ = heightAt(layout, layout.tee.x, layout.tee.y);
    if (glide) rig.glide(layout.tee.x, layout.tee.y, teeZ, t);
    else rig.jump(layout.tee.x, layout.tee.y, teeZ);
    rig.setGolf(layout.golf);
    this.aimedFor = '';
    this.worked.x = Number.NaN;
    this.chasing = false;
    this.handing = false;
    this.wasReady = game.ready;
    if (layout.golf) this.aimFor(!glide);
    this.looked = true;
  }

  /**
   * What the aim view was worked out from: the club, the lie and the item equipped, since the glove, the wind sock and the
   * rest change how far a shot reaches with the club and the lie as they were, and a view kept for the old reach would
   * leave the new one off the top of the screen.
   */
  private keyOf(club: string, lie: number): string {
    return `${club}|${lie}|${this.game?.item ?? ''}`;
  }

  /**
   * The camera sent to the view that shows where the club in hand comes down from the lie the ball is on, at the pace of an
   * ease, or at once for the very first view. Never worked out from a drag, which would move the ground under the finger.
   */
  private aimFor(now: boolean) {
    const game = this.game;
    if (!game?.layout.golf) return;
    const { world, ball, layout, inHand } = game;
    const lie = lieAt(layout, world.x[ball], world.y[ball]);
    this.aimedFor = this.keyOf(inHand.id, lie);
    this.rig.aimAt(aimView(reachOf(inHand, lie, game.wind.speed, game.effects), this.aspect, this.height), now);
  }

  /**
   * The camera sent to the view that shows where the putter's hardest putt stops along the way the camera faces, on a hole of
   * minigolf, when the ball is ready: the home view exactly (with the zoom as the player left it, and no nearer than shows
   * the reach) when the reach is inside the safe box from there, and otherwise the aim view of the reach, no further back than
   * `VIEW.far` (the zoom's own limit). Worked out again only when the ball or the heading has changed.
   */
  private aimOnMinigolf() {
    const game = this.game;
    if (!game) return;
    const { world, ball, layout } = game;
    const { rig, worked } = this;
    const [x, y, t] = [world.x[ball], world.y[ball], Math.PI / 2 - rig.headed];
    const roll = rollsFor(game.hardest);
    if (x === worked.x && y === worked.y && t === worked.t && roll === worked.roll) return;
    [worked.x, worked.y, worked.t, worked.roll] = [x, y, t, roll];
    const reach = reachOnMinigolf(layout, x, y, t, roll);
    if (fitsHome(reach, this.aspect, this.height)) {
      const floor = floorFor(reach, this.aspect, this.height, TILT.home, LEAD);
      if (this.stood) {
        this.stood = false;
        rig.aimAt({ distance: VIEW.home, tilt: TILT.home, lead: LEAD, floor });
      } else {
        rig.floor = floor;
        // a zoom made before there was a reach to keep is brought out to where it shows it
        if (rig.distance < floor) rig.aimAt({ distance: floor, tilt: rig.tilt, lead: rig.lead, floor });
      }
      return;
    }
    this.stood = true;
    // the camera may stand as far back as the zoom lets it on this screen, which is `VIEW.far` before a tall screen pushes it
    rig.aimAt(aimView(reach, this.aspect, this.height, { far: VIEW.far * tallOf(this.aspect) }));
  }

  /** The aim view sent again for the club in hand now, as when the player chooses another club. */
  reaim() {
    this.aimFor(false);
  }

  /**
   * Where the furthest a shot can reach is, along the way the camera faces (which is the way a drag aims, once it has turned
   * there): written into `out`, and whether there is one, which is only while the ball is ready. A golf shot's is its carry at
   * full power and the tailwind's reach; a putt's is how far the hardest putt goes before a rail stops it. The framing rule
   * holds the camera to keeping it on the screen. Its `z` is the ground under the ball, which the aim view takes the shot to
   * be level with.
   */
  reachPoint(out: { x: number; y: number; z: number }): boolean {
    const game = this.game;
    if (!game || !game.ready) return false;
    const { world, ball, layout, inHand } = game;
    const [x, y, t] = [world.x[ball], world.y[ball], Math.PI / 2 - this.rig.headed];
    const reach = layout.golf
      ? reachOf(inHand, lieAt(layout, x, y), game.wind.speed, game.effects)
      : reachOnMinigolf(layout, x, y, t, rollsFor(game.hardest));
    out.x = x + reach * Math.cos(t);
    out.y = y + reach * Math.sin(t);
    out.z = heightAt(layout, x, y);
    return true;
  }

  /**
   * One frame of the camera, after the game has stepped `dt`: the aim view sent when the ball is ready and the club or the
   * lie has changed, the rig eased, and the ball followed (up into the air on a golf hole, and quicker the faster it goes)
   * unless the camera is `parked` where a test put it. By game time, so a test stepping the game sees it follow the same way.
   */
  frame(dt: number, parked: boolean) {
    const game = this.game;
    if (!game) return;
    const { rig } = this;
    // a ball that has just come to rest has the camera turned to look at the flag, as the button does
    if (game.ready && !this.wasReady) this.faceFlag(false);
    this.wasReady = game.ready;
    if (game.layout.golf) {
      if (!game.ready) this.aimedFor = '';
      else {
        const { world, ball, layout, inHand } = game;
        if (this.aimedFor !== this.keyOf(inHand.id, lieAt(layout, world.x[ball], world.y[ball]))) this.aimFor(false);
      }
    } else if (!game.ready) this.worked.x = Number.NaN;
    // a camera a test has left where it put it is not sent to a view that frames the reach, which would zoom it out
    else if (!this.left) this.aimOnMinigolf();
    rig.settle(dt);
    const { world, ball } = game;
    if (!world.alive[ball] || parked) {
      this.vel.fill(0);
      return;
    }
    // a stroke the camera is not following: held where it stood while the ball is on its way, and taken up for the rest of the
    // stroke from the moment the ball would leave the safe box; a ball at rest is gone to as ever
    // and before that it is not moved at all while the ball is in the inner part of the box (`HAND_OVER`); from the band's edge
    // it is taken up, at a pace that rises with how far out the ball is, and its change of speed is held
    let pace = 1;
    if (!this.chasing && !game.ready) {
      const k = Math.min(1, Math.max(0, (this.excess(game) - HAND_OVER.from) / (1 - HAND_OVER.from)));
      if (k > 0) this.handing = true;
      else if (!this.handing) return;
      pace = k * k * (3 - 2 * k);
    }
    const ground = heightAt(game.layout, world.x[ball], world.y[ball]);
    // a lofted ball is followed up into the air as well as along, or it leaves the top of the screen at the top of its
    // flight; on the ground, and on every hole of minigolf, it is the ground that is looked at, as it always was
    const golf = game.layout.golf;
    const up = golf ? Math.max(0, world.z[ball] - ground - KIND_RADIUS[BALL]) : 0;
    const ease = golf ? catchUp(Math.hypot(world.vx[ball], world.vy[ball], world.vz[ball])) : undefined;
    const [x0, y0, z0] = rig.target;
    const base = ease ?? catchUp(0);
    rig.follow(world.x[ball], world.y[ball], dt, ground + up, base * pace);
    if (this.handing) this.limit(x0, y0, z0, dt);
    else this.vel.fill(0);
    // a ball on its way is never left off the safe box by the camera's lag: a ball struck toward the camera, or thrown, can be
    // further from where the camera is looking than the pace allows for, and then the camera catches up quicker (twice as quick,
    // and again, until the ball is inside), never looser than the box
    if (!game.ready) {
      let rate = base * pace;
      for (let n = 0; n < CATCH_UP_DOUBLINGS && this.leaving(game); n++) {
        rig.target[0] = x0;
        rig.target[1] = y0;
        rig.target[2] = z0;
        rate *= 2;
        rig.follow(world.x[ball], world.y[ball], dt, ground + up, rate);
        this.vel[0] = (rig.target[0] - x0) / dt;
        this.vel[1] = (rig.target[1] - y0) / dt;
        this.vel[2] = (rig.target[2] - z0) / dt;
      }
    }
  }

  /**
   * The target's change of speed this frame held to `HAND_OVER.accel`: the band's pace alone rises as fast as the ball crosses it,
   * and a ball at 200 yards a second crosses it in a tenth of a second. The target was at (`x0`, `y0`, `z0`) and has been moved
   * toward the ball; the speed it had is `vel`, and what it is made to have is written back there.
   */
  private limit(x0: number, y0: number, z0: number, dt: number) {
    const { target } = this.rig;
    const { vel } = this;
    const want = [(target[0] - x0) / dt - vel[0], (target[1] - y0) / dt - vel[1], (target[2] - z0) / dt - vel[2]];
    const most = HAND_OVER.accel * dt;
    const size = Math.hypot(want[0], want[1], want[2]);
    const share = size > most ? most / size : 1;
    for (let k = 0; k < 3; k++) vel[k] += want[k] * share;
    target[0] = x0 + vel[0] * dt;
    target[1] = y0 + vel[1] * dt;
    target[2] = z0 + vel[2] * dt;
  }

  /**
   * Whether the ball, where it is now, is off the safe box as the camera draws it as it stands: the latch of a stroke the
   * camera is not following. Worked out from the view's own figures against where the camera is looking, nothing made.
   */
  private leaving(game: Game): boolean {
    return this.excess(game) > 1;
  }

  /**
   * How far out the ball is on the safe box, as a share of the way to its edge on the side it is nearest: nought at the middle,
   * one on the edge, more beyond. Worked out from the view's own figures against where the camera is looking, nothing made.
   */
  private excess(game: Game): number {
    const { world, ball } = game;
    const { rig } = this;
    const { azimuth, tilt } = rig.view(game.t, this.seen);
    const tall = tallOf(this.aspect);
    const r = rig.golf ? Math.min(rig.distance * tall, standOf(this.aspect)) : rig.distance * tall;
    const [dx, dy] = [world.x[ball] - rig.target[0], world.y[ball] - rig.target[1]];
    const [sin, cos] = [Math.sin(azimuth), Math.cos(azimuth)];
    const [nx, ny] = screenOf(
      r,
      tilt,
      rig.lead,
      this.aspect,
      dx * sin + dy * cos,
      dx * cos - dy * sin,
      world.z[ball] - rig.target[2],
      this.ndc,
    );
    const box = safeBox(this.aspect, this.height);
    return Math.max(Math.abs(nx) / box.x, ny >= 0 ? ny / box.top : ny / box.bottom);
  }

  /**
   * The aim of a drag held now, or null when none is: the camera turned to look the way it goes, so a player sees the shot
   * from behind it, and left looking that way when the drag is taken back. Only while the ball is ready (a drag while it
   * rolls is no shot), not from overhead, and only for an aim of at least `AIM_TURN.least`; a weaker one, or none, leaves
   * the camera going where it was going. An aim inside the dead zone (`AIM_DEAD`) leaves the camera still; past it the camera
   * turns to keep the aim on the zone's edge. The drag is read through the view held when it began (`HeldView`), so the turn
   * cannot feed back into the aim.
   */
  aiming(aim: Shot | null) {
    const game = this.game;
    if (!game || !aim || !game.ready || this.rig.overhead || aim.power < AIM_TURN.least) return;
    const off = wrap(aim.angle - (Math.PI / 2 - this.rig.headed));
    if (Math.abs(off) <= AIM_DEAD.half) return;
    this.rig.turnTo(wrap(Math.PI / 2 - (aim.angle - Math.sign(off) * AIM_DEAD.half)));
  }

  /**
   * The way the camera looks when it is turned to the flag, as an azimuth, or null where there is no way (the ball at the cup):
   * the heading of the cup from the ball, so the flag is at the middle of the screen. The same for the same lie.
   */
  nearFlag(): number | null {
    const game = this.game;
    if (!game) return null;
    const { world, ball, layout } = game;
    return facing({ x: world.x[ball], y: world.y[ball] }, layout.cup);
  }

  /**
   * The camera turned to look at the cup from the ball (`nearFlag`), the short way and eased; whether it was. Refused while a
   * drag is `held`, since the aim is the ground under the finger through the camera and a camera turning under it would turn the
   * shot, from overhead, where there is no way to face the cup, and with the ball at the cup, where there is none either.
   */
  faceFlag(held: boolean): boolean {
    const game = this.game;
    if (!game || held || this.rig.overhead) return false;
    const to = this.nearFlag();
    if (to === null) return false;
    this.rig.turnTo(to);
    return true;
  }
}
