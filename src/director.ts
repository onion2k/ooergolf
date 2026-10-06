/**
 * The director: what is done to the camera as a game goes on, whoever is playing. It sends the camera to the aim view of
 * the club in hand when the ball is ready, begins it on a new hole's tee, turns it to face the flag, and follows the ball,
 * all by game time. It was the page's own, a few lines in each of its callbacks, and the fuzzer wanted the same; kept here
 * the page and the fuzzer drive one implementation and the camera can be tested without either. Without it a change to how
 * the camera behaves would be made twice, and the fuzzer would hold the page to a copy.
 *
 * It also keeps the ball and the furthest a shot can reach on the screen (`aimview.ts`'s safe box): on a golf hole by the aim
 * view of the club, and on a hole of minigolf by one of the putter's reach along the aim, which is the home view exactly when
 * that fits there.
 *
 * It holds a fixed set of numbers and a string, never a list, and it never draws the game's chance.
 */
import { BALL, KIND_RADIUS, heightAt, lieAt, rollsFor } from './arena';
import { aimView, fitsHome, floorFor, reachOf, reachOnMinigolf } from './aimview';
import { CameraRig, LEAD, TILT, VIEW, catchUp, facing, tallOf, wrap } from './camera';
import type { Game } from './game';
import type { Shot } from './shot';

/**
 * What of a drag turns the camera to face it: a drag of at least `least` of the hardest shot, since a short one is on its
 * way to being taken back and a camera swinging round to every twitch would be seen to lurch.
 */
export const AIM_TURN = { least: 0.15 };

export class Director {
  private game: Game | null = null;
  private aspect = 1.6;
  private height = 0;
  /** The club and the lie the camera was last sent to look at a shot from, so it is sent again only when one changes. */
  private aimedFor = '';
  /**
   * Where the minigolf aim view was last worked out for: the ball's place and the way it faces, so it is worked out again
   * only when one changes (nothing is made); not a number while the ball is not ready or the screen has changed.
   */
  private readonly worked = { x: Number.NaN, y: Number.NaN, t: Number.NaN };
  /** Whether the camera was last sent to a view stood back from home on minigolf, so that it is sent home again when the reach fits there. */
  private stood = false;
  /** Whether the camera has been put on a hole yet: the first has nowhere to glide from. */
  private looked = false;

  constructor(readonly rig: CameraRig) {}

  /** The game it directs for: the page's, or a test's own, which may be swapped for another. */
  use(game: Game) {
    this.game = game;
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
    if (layout.golf) this.aimFor(!glide);
    this.looked = true;
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
    this.aimedFor = `${inHand.id}|${lie}`;
    this.rig.aimAt(aimView(reachOf(inHand, lie, game.wind.speed), this.aspect, this.height), now);
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
    if (x === worked.x && y === worked.y && t === worked.t) return;
    [worked.x, worked.y, worked.t] = [x, y, t];
    const reach = reachOnMinigolf(layout, x, y, t, rollsFor(game.hardest));
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
      ? reachOf(inHand, lieAt(layout, x, y), game.wind.speed)
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
    if (game.layout.golf) {
      if (!game.ready) this.aimedFor = '';
      else {
        const { world, ball, layout, inHand } = game;
        if (this.aimedFor !== `${inHand.id}|${lieAt(layout, world.x[ball], world.y[ball])}`) this.aimFor(false);
      }
    } else if (!game.ready) this.worked.x = Number.NaN;
    else this.aimOnMinigolf();
    rig.settle(dt);
    const { world, ball } = game;
    if (!world.alive[ball] || parked) return;
    const ground = heightAt(game.layout, world.x[ball], world.y[ball]);
    // a lofted ball is followed up into the air as well as along, or it leaves the top of the screen at the top of its
    // flight; on the ground, and on every hole of minigolf, it is the ground that is looked at, as it always was
    const golf = game.layout.golf;
    const up = golf ? Math.max(0, world.z[ball] - ground - KIND_RADIUS[BALL]) : 0;
    const ease = golf ? catchUp(Math.hypot(world.vx[ball], world.vy[ball], world.vz[ball])) : undefined;
    rig.follow(world.x[ball], world.y[ball], dt, ground + up, ease);
  }

  /**
   * The aim of a drag held now, or null when none is: the camera turned to look the way it goes, so a player sees the shot
   * from behind it, and left looking that way when the drag is taken back. Only while the ball is ready (a drag while it
   * rolls is no shot), not from overhead, and only for an aim of at least `AIM_TURN.least`; a weaker one, or none, leaves
   * the camera going where it was going. The heading is the aim's alone and does not depend on where the camera is, and
   * the drag is read through the view held when it began (`HeldView`), so the turn cannot feed back into the aim.
   */
  aiming(aim: Shot | null) {
    const game = this.game;
    if (!game || !aim || !game.ready || this.rig.overhead || aim.power < AIM_TURN.least) return;
    this.rig.turnTo(wrap(Math.PI / 2 - aim.angle));
  }

  /**
   * The camera turned to face the cup from the ball, the short way and eased; whether it was. Refused while a drag is
   * `held`, since the aim is the ground under the finger through the camera and a camera turning under it would turn the
   * shot, and with the ball at the cup, where there is no way to face.
   */
  faceFlag(held: boolean): boolean {
    const game = this.game;
    // from above there is no way to face the cup, and the button is put away there
    if (!game || held || this.rig.overhead) return false;
    const to = facing({ x: game.world.x[game.ball], y: game.world.y[game.ball] }, game.layout.cup);
    if (to === null) return false;
    this.rig.turnTo(to);
    return true;
  }
}
