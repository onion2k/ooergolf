/**
 * The director: what is done to the camera as a game goes on, whoever is playing. It sends the camera to the aim view of
 * the club in hand when the ball is ready, begins it on a new hole's tee, turns it to face the flag, and follows the ball,
 * all by game time. It was the page's own, a few lines in each of its callbacks, and the fuzzer wanted the same; kept here
 * the page and the fuzzer drive one implementation and the camera can be tested without either. Without it a change to how
 * the camera behaves would be made twice, and the fuzzer would hold the page to a copy.
 *
 * It holds a fixed set of numbers and a string, never a list, and it never draws the game's chance.
 */
import { BALL, KIND_RADIUS, heightAt, lieAt } from './arena';
import { aimView, reachOf } from './aimview';
import { CameraRig, catchUp, facing } from './camera';
import type { Game } from './game';

export class Director {
  private game: Game | null = null;
  private aspect = 1.6;
  private height = 0;
  /** The hole's wind in miles an hour, read as the hole begins: nothing on minigolf. */
  private wind = 0;
  /** The club and the lie the camera was last sent to look at a shot from, so it is sent again only when one changes. */
  private aimedFor = '';
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
    this.wind = layout.golf ? game.wind.speed : 0;
    const teeZ = heightAt(layout, layout.tee.x, layout.tee.y);
    if (glide) rig.glide(layout.tee.x, layout.tee.y, teeZ, t);
    else rig.jump(layout.tee.x, layout.tee.y, teeZ);
    rig.setGolf(layout.golf);
    this.aimedFor = '';
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
    this.rig.aimAt(aimView(reachOf(inHand, lie, this.wind), this.aspect, this.height), now);
  }

  /** The aim view sent again for the club in hand now, as when the player chooses another club. */
  reaim() {
    this.aimFor(false);
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
    }
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
   * The camera turned to face the cup from the ball, the short way and eased; whether it was. Refused while a drag is
   * `held`, since the aim is the ground under the finger through the camera and a camera turning under it would turn the
   * shot, and with the ball at the cup, where there is no way to face.
   */
  faceFlag(held: boolean): boolean {
    const game = this.game;
    if (!game || held) return false;
    const to = facing({ x: game.world.x[game.ball], y: game.world.y[game.ball] }, game.layout.cup);
    if (to === null) return false;
    this.rig.turnTo(to);
    return true;
  }
}
