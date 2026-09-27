/**
 * The daylight look: toon shading in a bright sun, the colours shown
 * straight, a pale blue sky, and the daylight environment for the sky's own
 * light. One place for it, so the game and the models' showcase are drawn
 * alike; without it, a colour tuned on one page would be wrong on the other.
 */
import type { GameRenderer } from 'artshape-render/game/renderer';
import type { Gpu } from 'artshape-render/gpu/context';
import { noFog } from 'artshape-render/game/fog';
import { bakeEnvironment } from 'artshape-render/render/env';

/** How many millimetres a world unit is: the fog's lengths are the world's own, and its density per one of them. */
const MM_PER_UNIT = 100;

/**
 * The shade where things meet: the renderer's screen-space occlusion, dark
 * in a corner, under the rail's lip and at the foot of a tree, soft across a
 * gap the size of the ball. Toon light is flat, and without it a thing
 * standing on the grass seems pasted on it.
 */
export const OCCLUSION = { strength: 2, radius: 2.5, direct: 0.3 } as const;

/**
 * A thin haze, the sky's own blue, even at every height: the far rough goes
 * pale, and the course stands out against it. Half of what is behind it is
 * lost over this many world units.
 */
export const HAZE = { halfWay: 900, colour: [0.2, 0.3, 0.42] as [number, number, number] } as const;

/** Put the daylight look on `renderer`: a cartoon in daylight, as bearing's sweet world is. */
export function daylight(renderer: GameRenderer, ctx: Gpu) {
  renderer.look = {
    ...renderer.look,
    sunDir: [0.35, -0.3, 0.89],
    // toon light is at a colour's full strength, so the sun is bright and the colours are shown straight
    sunColour: [2.5, 2.45, 2.35],
    exposure: 1,
    ambient: 1,
    background: [0.45, 0.72, 0.98],
    shading: 'toon',
    occlusion: OCCLUSION.strength,
    occlusionRadius: OCCLUSION.radius,
    occlusionDirect: OCCLUSION.direct,
  };
  renderer.fog = {
    ...noFog(MM_PER_UNIT),
    density: Math.LN2 / HAZE.halfWay,
    base: -10,
    height: 1000,
    colour: HAZE.colour,
    ambient: 0.4,
    anisotropy: 0,
    reach: 600,
    steps: 16,
    cones: 0,
  };
  // a bright day: no darkened corners, which against a pale sky read as a grey haze
  renderer.post = { ...renderer.post, vignette: 0, tone: 'clamp' };
  const env = bakeEnvironment(ctx, 'daylight', { size: 128, mips: 6 });
  renderer.setEnvironment(env.specular, env.brdf, env.mips);
}
