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
import { BALL, KIND_RADIUS, tileAt, type Ground } from './arena';
import type { BagClub } from './bag';
import { LEAD, TILT, VIEW, phoneOf, standOf, tallOf } from './camera';
import { carryFrom } from './flight';
import { NO_EFFECTS, type Effects } from './items';
import { windReach } from './shaping';
import type { Lie } from './surfaces';

/** How much further than its formula a club goes on the level, four in a hundred and a half: the landing the aim view is to show. */
export const LANDS_PAST = 1.045;

/**
 * How far from the ball the aim view must show a shot of `club` at full power from `lie`: its carry a little over, and as
 * much further as a tailwind of `wind` miles an hour carries a lofted club, so the ring of a downwind shot is on the
 * screen too. The one place it is worked out, for the page and the fuzzer alike.
 */
export function reachOf(club: BagClub, lie: Lie, wind: number, effects: Effects = NO_EFFECTS): number {
  return (
    carryFrom(club, 1, lie, effects) * LANDS_PAST + (club.loft > 0 ? windReach(club, 1, wind, undefined, effects) : 0)
  );
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

/**
 * The part of the screen the ball and the furthest place a shot reaches are kept inside, in the device's own coordinates
 * from minus one to one: `x` either side of the middle, `top` the highest and `bottom` the lowest. The top is where the
 * landing is wanted at the highest (the words across a phone's top are under it), and the bottom keeps the ball off the
 * edge. The aim view is worked from it and the framing rule holds the camera to it.
 *
 * The bag across a phone's foot is not in it: the aim view puts the ball as low as it was and no lower than the bag where
 * it can, and on a short phone a driver's view leaves it a little behind the bag's top, which is how the view has always
 * been. The ball is on the screen there, and the rule is of that and not of what the bag covers.
 */
export interface SafeBox {
  x: number;
  top: number;
  bottom: number;
}

/** How far across the screen, and how near its foot, the framed things may go: nine tenths of the way across and of the way down. */
export const SAFE = { x: 0.9, bottom: -0.9 } as const;

/**
 * The safe box for a screen of `aspect` and, on a phone upright whose height is known, `height` pixels: the top the aim view
 * has always aimed the landing at (under the words across a phone's top), and the edge's margin at the bottom.
 */
export function safeBox(aspect: number, height = 0): SafeBox {
  const phone = height > 0 ? phoneOf(aspect) : 0;
  const base = topFor(aspect);
  const chips = 1 - (2 * CHROME.top) / Math.max(height, 1);
  return { x: SAFE.x, top: phone > 0 ? base + (chips - base) * phone : base, bottom: SAFE.bottom };
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
 * Where on the screen, each way from minus one to one, a point lands for a camera `r` back at `tilt` looking `lead` ahead of the
 * ball, on a screen of `aspect`: `ahead` yards ahead of the ball the way it faces, `across` to the right of that line and `up` above
 * the ball's ground. What `aimView` is worked from, with the across, which is what a camera turned off the line to a place needs.
 * Written into `out` when one is given, so a frame's worth of them makes nothing.
 */
export function screenOf(
  r: number,
  tilt: number,
  lead: number,
  aspect: number,
  ahead: number,
  across: number,
  up: number,
  out: [number, number] = [0, 0],
): [number, number] {
  const h = Math.tan((VIEW.fov * Math.PI) / 360);
  const dy = ahead - (lead - Math.sin(tilt) * r),
    dz = up - Math.cos(tilt) * r;
  const depth = dy * Math.sin(tilt) - dz * Math.cos(tilt);
  const above = dy * Math.cos(tilt) + dz * Math.sin(tilt);
  out[0] = across / (depth * h * Math.max(aspect, 0.1));
  out[1] = above / (depth * h);
  return out;
}

/**
 * The view that shows a landing `reach` yards from the ball on a screen of `aspect`: no nearer than home, no further
 * back than `AIM.far` however tall the screen, and the tilt within the camera's own limits. A reach too far for the
 * limit gets the limit: the best view there is.
 */
export function aimView(reach: number, aspect: number, height = 0, options: { far?: number } = {}): AimView {
  const tall = tallOf(aspect);
  const need = Math.max(0, Number.isFinite(reach) ? reach : 0);
  const share = Math.max(0, Math.min(1, (need - AIM.tiltFrom) / (AIM.tiltTo - AIM.tiltFrom)));
  const tilt = TILT.home + (TILT.most - TILT.home) * share;
  const lead = (r: number) => Math.max(LEAD, AIM.lead * r);
  // a phone upright with its height known: the far edge of the ring is wanted below the words across the top, the
  // camera may stand further back than a desk's allows, and the ball may sit lower, down to just over the bag
  const phone = height > 0 ? phoneOf(aspect) : 0;
  const lo = VIEW.home * tall;
  const cap = options.far === undefined ? AIM.far : Math.max(lo, options.far);
  const far = options.far === undefined ? standOf(aspect) : cap;
  const { top } = safeBox(aspect, height);
  // the ring's far edge, in yards past the landing, at a camera `r` back
  const edge = (r: number) => (phone > 0 ? AIM.ring * markScale(r) * phone : 0);
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
    return { distance: nearest(upright, cap) / tall, tilt, lead: lead(nearest(upright, cap)) };
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

/**
 * Whether a shot reaching `reach` yards is inside the safe box from the home view, at the home tilt and the lead it always had:
 * what decides whether a hole of minigolf is left exactly as it was.
 */
export function fitsHome(reach: number, aspect: number, height = 0): boolean {
  const need = Math.max(0, Number.isFinite(reach) ? reach : 0);
  return screenY(VIEW.home * tallOf(aspect), TILT.home, LEAD, need, 0) <= safeBox(aspect, height).top;
}

/**
 * The nearest the camera may stand, as the rig's distance, with the tilt and the lead it has, for a shot reaching `reach` yards
 * to be inside the safe box: no nearer than `VIEW.near` and no further than home, which a view that fits there is held to.
 */
export function floorFor(reach: number, aspect: number, height: number, tilt: number, lead: number): number {
  const need = Math.max(0, Number.isFinite(reach) ? reach : 0);
  const tall = tallOf(aspect);
  const { top } = safeBox(aspect, height);
  const fits = (distance: number) => screenY(distance * tall, tilt, lead, need, 0) <= top;
  if (fits(VIEW.near)) return VIEW.near;
  if (!fits(VIEW.home)) return VIEW.home;
  let a = VIEW.near,
    b = VIEW.home;
  for (let k = 0; k < 40; k++) {
    const mid = (a + b) / 2;
    if (fits(mid)) b = mid;
    else a = mid;
  }
  return b;
}

/**
 * How far a putt struck at the hardest the putter strikes goes along `angle` from (x, y) on a hole of minigolf: the whole of
 * `roll` (what such a putt rolls on the level, `rollsFor`) unless a rail or the edge of the course stops it first, where it
 * is as far as the ball's middle gets to the wall. Worked out by marching along the line a quarter of a yard at a time, nothing
 * made, so it may be asked for every frame of a drag. Nought for a place that is off the hole and for an angle that is not
 * one; never more than `roll`.
 */
export function reachOnMinigolf(ground: Ground, x: number, y: number, angle: number, roll: number): number {
  if (!(roll > 0) || !Number.isFinite(x) || !Number.isFinite(y)) return 0;
  const start = tileAt(ground, x, y);
  if (start < 0 || ground.solid[start] === 1) return 0;
  const a = Number.isFinite(angle) ? angle : 0;
  const [dx, dy] = [Math.cos(a), Math.sin(a)];
  const step = 0.25;
  for (let d = step; d <= roll; d += step) {
    const t = tileAt(ground, x + dx * d, y + dy * d);
    if (t < 0 || ground.solid[t] === 1) return Math.max(0, d - step - KIND_RADIUS[BALL]);
  }
  return roll;
}
