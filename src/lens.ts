/**
 * The lens: the screen's edges a little out of focus, as a small world photographed close is (11 November 2026, the look
 * the user chose: the edges blurred and never the game area). It is a band across the top of the picture, where the far
 * scenery is, fading to nothing by the highest thing a player aims by, and a thin rim down the sides and along the foot,
 * outside the box the camera keeps the ball and the landing in. That box is nine tenths of a desk's screen each way, so the
 * lens is a soft border a twentieth of the screen deep and no more: it is what the rule leaves. Without this file the blur would be a fixed shape tuned by
 * eye, and a cup or a landing near the top of a long hole would go soft under it.
 *
 * It says where the blur is and whether it is up; the page draws it, as an element over the canvas whose backdrop is
 * blurred, so the renderer is as it was. A phone has none: its screen is all game area, and the blur is the browser's own
 * work, which the governor cannot see to step down from.
 */
import { SAFE } from './aimview';

export const LENS = {
  /** How soft the edge is, in CSS pixels, at its strongest. */
  blur: 5,
  /** The least room above the highest thing aimed by, as a share of the screen's height, before the band begins. */
  margin: 0.015,
  /** A band shorter than this share of the height is not worth drawing, and is none. */
  least: 0.03,
  /** The narrowest screen that has a lens. */
  minWidth: 900,
} as const;

/** The rim down each side and along the foot, as a share of the screen: what the safe box leaves outside it. */
export const RIM = (1 - SAFE.x) / 2;

/**
 * How far down the screen the top band reaches, as a share of its height from the top, to a hundredth: above the safe
 * box's top and above the cup and the furthest a shot reaches, whichever is highest on the screen, by the margin. Heights
 * are the device's own, one at the top of the screen and minus one at its foot; a cup or a reach that is not on the screen
 * or not known is null. Nought is no band.
 */
export function lensTop(boxTop: number, cup: number | null, reach: number | null): number {
  let highest = boxTop;
  if (cup !== null && cup < 1.2) highest = Math.max(highest, cup);
  if (reach !== null && reach < 1.2) highest = Math.max(highest, reach);
  const top = Math.floor(((1 - highest) / 2 - LENS.margin) * 100) / 100;
  return top >= LENS.least ? top : 0;
}

/**
 * How much of the blur a place on the screen is under, nought to one: `x` and `y` are shares of the screen from its top
 * left, and `top` is `lensTop`'s. The stylesheet's mask is made of the same sums (`lensMask`), and a test holds that
 * nothing in the safe box, under the band's foot, is under any.
 */
export function lensShade(x: number, y: number, top: number): number {
  const band = top > 0 ? Math.max(0, 1 - y / top) : 0;
  const foot = Math.max(0, 1 - (1 - y) / RIM);
  const side = Math.max(0, 1 - Math.min(x, 1 - x) / RIM);
  return Math.min(1, band + foot + side);
}

const pc = (share: number) => `${(share * 100).toFixed(0)}%`;

/** The mask the lens's element wears, for a band reaching `top` of the way down: the four fades, added. */
export function lensMask(top: number): string {
  const fades = [
    `linear-gradient(to top, #000, transparent ${pc(RIM)})`,
    `linear-gradient(to right, #000, transparent ${pc(RIM)})`,
    `linear-gradient(to left, #000, transparent ${pc(RIM)})`,
  ];
  if (top > 0) fades.unshift(`linear-gradient(to bottom, #000, transparent ${pc(top)})`);
  return fades.join(', ');
}

/**
 * Whether the lens is up: on the picture's top rung alone (a machine that has stepped down has given up dearer things),
 * on a screen wide enough to have edges that are not game area, and not from above, where a hole is read, nor under the
 * title, whose word stands where the band would be.
 */
export function lensShown(rung: number, overhead: boolean, width: number, titled: boolean): boolean {
  return rung === 0 && !overhead && !titled && width >= LENS.minWidth;
}
