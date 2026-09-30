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
import { SUN } from './sun';

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
export const HAZE = { halfWay: 3000, colour: [0.2, 0.3, 0.42] as [number, number, number] } as const;

/**
 * The clean toy of `LOOK.md`: edges drawn at four samples a pixel, the toon
 * bands eased over a narrow width so a band's edge on a curve is a clean line,
 * the shade a cool blue-violet of a colour rather than a grey of it, a warm
 * rim where a thing turns from the camera, the sky's light from above with a
 * warm bounce off the grass from below, and the form light, which keeps some
 * of the sun's fall-off in the top band. Without that last, every slope a
 * ball can roll on takes more of this high sun than the top band's edge, and
 * a hill was drawn exactly as bright as the flat: at 2.5 the Volcano's flank
 * facing the sun reads 1.46 times as bright as the one turned from it, where
 * it read 1.00, and the steepest slopes reach the band beneath. The toy
 * finish (a highlight on what is smooth, the sky in a clear coat, one smooth
 * ramp of light, shade in a crease toward the shade colour) is not asked for
 * here: the renderer gives it to every toon look.
 */
export const TOY = {
  antialias: 'msaa',
  bandSoftness: 0.06,
  shadeColour: [0.36, 0.38, 0.78] as [number, number, number],
  rim: 0.35,
  rimColour: [1, 0.95, 0.85] as [number, number, number],
  rimWidth: 0.18,
  skyLight: [0.5, 0.6, 0.75] as [number, number, number],
  groundLight: [0.38, 0.34, 0.22] as [number, number, number],
  form: 2.5,
} as const;

/**
 * Put the daylight look on `renderer`: a cartoon in daylight, as bearing's
 * sweet world is, in the clean toy's light. Resolves once the pipelines the
 * look asks for are compiled, which the first frame waits for.
 */
export async function daylight(renderer: GameRenderer, ctx: Gpu): Promise<void> {
  renderer.look = {
    ...renderer.look,
    sunDir: SUN,
    // toon light is at a colour's full strength, so the sun is bright and the colours are shown straight
    sunColour: [2.55, 2.42, 2.22],
    exposure: 1,
    ambient: 1,
    background: [0.45, 0.72, 0.98],
    shading: 'toon',
    occlusion: OCCLUSION.strength,
    occlusionRadius: OCCLUSION.radius,
    occlusionDirect: OCCLUSION.direct,
    ...TOY,
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
  renderer.post = { ...renderer.post, vignette: 0, grain: 0, tone: 'clamp' };
  const env = bakeEnvironment(ctx, 'daylight', { size: 128, mips: 6 });
  renderer.setEnvironment(env.specular, env.brdf, env.mips);
  await renderer.prepare();
}
