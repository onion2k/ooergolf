/**
 * How much the words over the course are scaled down on a screen smaller than the ones they are laid out for. A phone
 * with its display size or its font turned up has a CSS viewport of 280 or 300 pixels where the panels were drawn for 360,
 * and without this the bag's eight clubs are wider than the screen and the strokes panel runs under the coins. The panels
 * are laid out as for a screen of the size they were made for, and shrunk to fit the one there is: the device is already
 * zoomed up, so what a thumb meets is about the size it was meant to be.
 */

/** The screen the panels are laid out for, upright and on its side, in CSS pixels. */
export const DESIGN = {
  upright: { width: 360, height: 600 },
  sideways: { width: 640, height: 360 },
} as const;

/**
 * The scale, from nought to one, for a screen `width` by `height`: one on any screen the panels fit unscaled, so a desk
 * and every phone the layout was made for are exactly as they were, and less on one too narrow or too short for them.
 */
export function uiScale(width: number, height: number): number {
  if (!(width > 0) || !(height > 0)) return 1;
  const d = height > width ? DESIGN.upright : DESIGN.sideways;
  return Math.min(1, width / d.width, height / d.height);
}
