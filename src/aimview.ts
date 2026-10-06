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
import type { BagClub } from './bag';
import { LEAD, TILT, VIEW, phoneOf, standOf, tallOf } from './camera';
import { carryFrom } from './flight';
import { windReach } from './shaping';
import type { Lie } from './surfaces';

/** How much further than its formula a club goes on the level, four in a hundred and a half: the landing the aim view is to show. */
export const LANDS_PAST = 1.045;

/**
 * How far from the ball the aim view must show a shot of `club` at full power from `lie`: its carry a little over, and as
 * much further as a tailwind of `wind` miles an hour carries a lofted club, so the ring of a downwind shot is on the
 * screen too. The one place it is worked out, for the page and the fuzzer alike.
 */
export function reachOf(club: BagClub, lie: Lie, wind: number): number {
  return carryFrom(club, 1, lie) * LANDS_PAST + (club.loft > 0 ? windReach(club, 1, wind) : 0);
}

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
  /** How big the landing ring is drawn on the ground at home, in yards of radius (`MARK.radius` times `ARC.ring`, held equal by a test), which grows with `markScale`. */
  ring: 3.51,
} as const;

/**
 * What a phone held upright covers of the page, in pixels: the top, where the strokes panel, the coins and shop and the
 * Overhead and flag switch end (about 150) and a margin under them; and the bottom, where the bag's top is (about 166
 * up from the foot) and a margin over it. On such a screen the landing ring and its spread are wanted below the first, and
 * the ball above the second, since the camera cannot stand back far enough to put the landing at the top of a page whose top
 * is words.
 */
export const CHROME = { top: 162, bottom: 190 } as const;

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
export function aimView(reach: number, aspect: number, height = 0): AimView {
  const tall = tallOf(aspect);
  const need = Math.max(0, Number.isFinite(reach) ? reach : 0);
  const share = Math.max(0, Math.min(1, (need - AIM.tiltFrom) / (AIM.tiltTo - AIM.tiltFrom)));
  const tilt = TILT.home + (TILT.most - TILT.home) * share;
  const lead = (r: number) => Math.max(LEAD, AIM.lead * r);
  // a phone upright with its height known: the far edge of the ring is wanted below the words across the top, the
  // camera may stand further back than a desk's allows, and the ball may sit lower, down to just over the bag
  const phone = height > 0 ? phoneOf(aspect) : 0;
  const far = standOf(aspect);
  const chips = 1 - (2 * CHROME.top) / Math.max(height, 1);
  const top = phone > 0 ? topFor(aspect) + (chips - topFor(aspect)) * phone : topFor(aspect);
  // the ring's far edge, in yards past the landing, at a camera `r` back
  const edge = (r: number) => (phone > 0 ? AIM.ring * markScale(r) * phone : 0);
  const lo = VIEW.home * tall;
  // the nearest of `r` between home and `limit` for which `fitsAt` holds: further back always shows more of the way ahead, so it is found by halving
  const nearest = (fitsAt: (r: number) => boolean, limit: number) => {
    if (fitsAt(lo)) return lo;
    if (!fitsAt(limit)) return limit;
    let a = lo,
      b = limit;
    for (let k = 0; k < 40; k++) {
      const mid = (a + b) / 2;
      if (fitsAt(mid)) b = mid;
      else a = mid;
    }
    return b;
  };
  const upright = (r: number) => screenY(r, tilt, lead(r), need + edge(r), 0) <= top;
  if (phone === 0 || upright(lo))
    return { distance: nearest(upright, AIM.far) / tall, tilt, lead: lead(nearest(upright, AIM.far)) };
  // the view as it is does not show the ring clear of the words: the ball is put lower, by looking further ahead of it,
  // to as low as the bag leaves it, and the camera stands back as far as is needed from there
  const low = -1 + (2 * CHROME.bottom) / Math.max(height, 1);
  const leadFor = (r: number) => {
    const old = screenY(r, tilt, lead(r), 0, 0);
    const want = Math.min(old, old + (low - old) * phone);
    let a = lead(r),
      b = 2 * r;
    if (screenY(r, tilt, a, 0, 0) <= want) return a;
    for (let k = 0; k < 40; k++) {
      const mid = (a + b) / 2;
      if (screenY(r, tilt, mid, 0, 0) > want) a = mid;
      else b = mid;
    }
    return b;
  };
  const lowered = (r: number) => screenY(r, tilt, leadFor(r), need + edge(r), 0) <= top;
  const r = nearest(lowered, far);
  return { distance: r / tall, tilt, lead: leadFor(r) };
}
