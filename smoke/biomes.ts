/**
 * What the renderer should report of each biome's look, written out by hand: a smoke test is run by Playwright's loader, which
 * cannot read the renderer that `src/theme.ts` reaches through the models' palette, so the figures it holds the page to are
 * here, and `test/theme.test.ts` holds these equal to the themes. A sky that is wrong is a sky the page reports wrong.
 */
import type { BiomeName } from '../src/biome';

export interface Looks {
  zenith: number[];
  horizon: number[];
  background: number[];
  environment: 'daylight' | 'dusk';
  fog: number[];
  sunDir: number[];
  /** Whether the hole grows blades. */
  grass: boolean;
  /** The colour of the dust a stroke from the grass throws up. */
  dust: number[];
}

export const LOOKS: Record<BiomeName, Looks> = {
  earth: {
    zenith: [0.03, 0.33, 0.9],
    horizon: [0.36, 0.77, 0.98],
    background: [0.36, 0.77, 0.98],
    environment: 'daylight',
    fog: [0.2, 0.42, 0.85],
    sunDir: [0.5, 0.482, 0.719],
    grass: true,
    dust: [0.3, 0.75, 0.25],
  },
  desert: {
    zenith: [0.1, 0.36, 0.82],
    horizon: [0.98, 0.72, 0.5],
    background: [0.98, 0.72, 0.5],
    environment: 'daylight',
    fog: [0.85, 0.6, 0.42],
    sunDir: [0.66, 0.4, 0.63],
    grass: true,
    dust: [0.86, 0.68, 0.44],
  },
  moon: {
    zenith: [0.003, 0.003, 0.01],
    horizon: [0.008, 0.008, 0.02],
    background: [0.005, 0.005, 0.012],
    environment: 'daylight',
    fog: [0.01, 0.01, 0.02],
    sunDir: [0.6, 0.34, 0.72],
    grass: false,
    dust: [0.74, 0.74, 0.76],
  },
  future: {
    zenith: [0.06, 0.05, 0.28],
    horizon: [0.95, 0.42, 0.62],
    background: [0.95, 0.42, 0.62],
    environment: 'dusk',
    fog: [0.5, 0.25, 0.5],
    sunDir: [0.55, 0.4, 0.73],
    grass: false,
    dust: [0.3, 0.75, 0.25],
  },
};
