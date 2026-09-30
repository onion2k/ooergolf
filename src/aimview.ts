/**
 * The view a golf shot is aimed from. A player who cannot see where a shot would come down cannot play it, and from the
 * home view the top of the screen is sixty yards off, where a drive goes four times that. So the view is worked out from
 * how far the club in hand goes: stood back as far as that needs, tipped lower the longer it is (a low view shows far
 * more depth for the same distance), and looking ahead of the ball by a share of how far back it stands, so the ball
 * sits low on the screen with the landing high above it.
 *
 * It is worked out from the club and the screen alone, never from a drag: the ground under a finger is worked out
 * through the camera, so a camera that moved while a drag was held would turn the aim under the hand. Pure arithmetic
 * on the camera's own geometry, tested without a page; the rig eases to what this says.
 */
import { LEAD, TILT, VIEW, tallOf } from './camera';

/**
 * How far back the camera may stand, at most, whatever the club; where on the screen the landing is wanted at the
 * highest (1 is the top edge), on a wide screen and on a tall one, where the coins and the shop across the top would
 * cover a landing that was higher; how far ahead of the ball it looks, as a share of how far back it stands; the reach
 * at which the tilt starts to lower and the reach at which it is the lowest it goes; and how the marks of the preview
 * grow with the camera's distance.
 */
export const AIM = {
  far: VIEW.golfFar,
  top: { wide: 0.85, tall: 0.72 },
  lead: 0.25,
  tiltFrom: 60,
  tiltTo: 260,
  grow: 0.6,
} as const;

/** Where on the screen the landing is wanted at the highest, for a screen of `aspect`: the wide one's at a wide screen and the tall one's at a phone held upright. */
function topFor(aspect: number): number {
  const tall = Math.max(0, Math.min(1, (1.25 - aspect) / (1.25 - 0.55)));
  return AIM.top.wide + (AIM.top.tall - AIM.top.wide) * tall;
}

export interface AimView {
  /** The rig's distance, before a tall screen pushes it further. */
  distance: number;
  tilt: number;
  lead: number;
}

/**
 * How much bigger the marks of a shot's preview are drawn, for a camera `r` back from what it looks at: one at home,
 * and more the further back, at `AIM.grow` of the way the distance has grown, so a dot a yard across is as easy to see
 * from a drive's view as from a putt's and not so big there that it hides what it marks.
 */
export function markScale(r: number): number {
  return 1 + AIM.grow * Math.max(0, r / VIEW.home - 1);
}

/** Where on the screen, from minus one at the bottom to one at the top, a point on the ground lands: `ahead` yards ahead of the ball, `up` above it. */
function screenY(r: number, tilt: number, lead: number, ahead: number, up: number): number {
  const h = Math.tan((VIEW.fov * Math.PI) / 360);
  const behind = lead - Math.sin(tilt) * r;
  const high = Math.cos(tilt) * r;
  const dy = ahead - behind,
    dz = up - high;
  const depth = dy * Math.sin(tilt) - dz * Math.cos(tilt);
  const above = dy * Math.cos(tilt) + dz * Math.sin(tilt);
  return above / (depth * h);
}

/**
 * The view that shows a landing `reach` yards from the ball on a screen of `aspect`: no nearer than home, no further
 * back than `AIM.far` however tall the screen, and the tilt within the camera's own limits. A reach too far for the
 * limit gets the limit: the best view there is.
 */
export function aimView(reach: number, aspect: number): AimView {
  const tall = tallOf(aspect);
  const need = Math.max(0, Number.isFinite(reach) ? reach : 0);
  const share = Math.max(0, Math.min(1, (need - AIM.tiltFrom) / (AIM.tiltTo - AIM.tiltFrom)));
  const tilt = TILT.home + (TILT.most - TILT.home) * share;
  const lead = (r: number) => Math.max(LEAD, AIM.lead * r);
  const top = topFor(aspect);
  const fits = (r: number) => screenY(r, tilt, lead(r), need, 0) <= top;
  let lo = VIEW.home * tall;
  let r = lo;
  if (!fits(lo)) {
    let hi = AIM.far;
    if (!fits(hi)) r = hi;
    else {
      // the nearest that fits: further back always shows more of the way ahead, so it is found by halving
      for (let k = 0; k < 40; k++) {
        const mid = (lo + hi) / 2;
        if (fits(mid)) hi = mid;
        else lo = mid;
      }
      r = hi;
    }
  }
  return { distance: r / tall, tilt, lead: lead(r) };
}
