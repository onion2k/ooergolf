/**
 * What a shop item's swatch is painted with, as a CSS background: a plain colour for a club or an accessory, and for a
 * ball its look in miniature (its colour, the pattern in its second colour, and a white highlight on a glossy finish), so
 * a player picks a ball by what it will look like on the course. Without one place that says it, the shop would carry a
 * second idea of each pattern beside the renderer's. Pure, and no page: the hud only sets the string.
 */
import type { Item } from './items';

type Colour = readonly [number, number, number];

/** A colour from nought to one a channel (a channel may run a little over one, for a bright finish) as CSS. */
export const cssOf = ([r, g, b]: Colour): string =>
  `rgb(${[r, g, b].map((c) => Math.round(Math.max(0, Math.min(1, c)) * 255)).join(' ')})`;

/** The white highlight of a finish: none for a matte ball, a soft one for the toy's, a hard bright one for a glossy ball. */
const GLOSS = {
  matte: '',
  toy: 'radial-gradient(circle at 32% 28%, rgb(255 255 255 / 0.5), transparent 30%)',
  glossy: 'radial-gradient(circle at 32% 28%, rgb(255 255 255 / 0.95), rgb(255 255 255 / 0.2) 18%, transparent 34%)',
} as const;

/** The layers of a ball's pattern in `second` over its `colour`, topmost first. */
function pattern(look: NonNullable<Item['look']>): string[] {
  const second = cssOf(look.second);
  switch (look.pattern) {
    case 'bands':
      return [`linear-gradient(transparent 38%, ${second} 38% 62%, transparent 62%)`];
    case 'twoBands':
      return [
        `linear-gradient(transparent 20%, ${second} 20% 33%, transparent 33% 67%, ${second} 67% 80%, transparent 80%)`,
      ];
    case 'swirl':
      return [
        `conic-gradient(from 20deg, transparent, ${second} 18%, transparent 36%, ${second} 68%, transparent 86%)`,
      ];
    case 'marbling':
      return [
        `radial-gradient(circle at 28% 62%, ${second}, transparent 52%)`,
        `radial-gradient(circle at 74% 30%, ${second}, transparent 46%)`,
      ];
    case 'speckle':
      return [
        `radial-gradient(circle at 30% 30%, ${second} 7%, transparent 9%)`,
        `radial-gradient(circle at 68% 24%, ${second} 7%, transparent 9%)`,
        `radial-gradient(circle at 52% 55%, ${second} 7%, transparent 9%)`,
        `radial-gradient(circle at 24% 72%, ${second} 7%, transparent 9%)`,
        `radial-gradient(circle at 76% 70%, ${second} 7%, transparent 9%)`,
      ];
    case 'plain':
      return [];
  }
}

/** The CSS background for `item`'s swatch. */
export function swatchOf(item: Item): string {
  const { look } = item;
  if (!look) return cssOf(item.colour);
  const layers = [GLOSS[look.finish], ...pattern(look)].filter(Boolean);
  return [...layers, cssOf(look.colour)].join(', ');
}
