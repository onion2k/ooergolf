/**
 * The daylight look: toon shading in a bright sun, the colours shown
 * straight, a pale blue sky, and the daylight environment for the sky's own
 * light. One place for it, so the game and the models' showcase are drawn
 * alike; without it, a colour tuned on one page would be wrong on the other.
 */
import { PATTERN_STRIDE, type GameRenderer } from 'artshape-render/game/renderer';
import { FLOW_RIPPLE, packFlow } from 'artshape-render/game/flow';
import type { Gpu } from 'artshape-render/gpu/context';
import { TEXTURE_STRIDE, packTexture } from 'artshape-render/game/texture';
import { noFog } from 'artshape-render/game/fog';
import { bakeEnvironment } from 'artshape-render/render/env';
import { SUN } from './sun';
import { TURF_SIDE, turfTexels } from './turfTexture';

/** The seed of the turf's texels: one, since the turf is the same on every hole and the same on every page. */
const TURF_SEED = 1;

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
export const HAZE = {
  halfWay: 3000,
  colour: [0.2, 0.42, 0.85] as [number, number, number],
  reach: 3000,
  height: 250,
} as const;

/**
 * The sky, as the title picture's: a deep blue overhead going pale toward the horizon, which only the fly-in sees (the
 * view a shot is played from looks under the horizon). The haze is the sky's blue too, and reaches as far as the
 * mountains, so the hills pale with distance into it. Chosen from a sheet on 8 October 2026.
 */
export const SKY = {
  zenith: [0.03, 0.33, 0.9] as [number, number, number],
  horizon: [0.36, 0.77, 0.98] as [number, number, number],
  height: 0.2,
} as const;

/**
 * The sun's shadow: how far past what stands round a hole its box reaches (`margin`), how high (`top`, over a golf
 * tree's tip and the tallest of the woods past it), the side of the square of ground its map covers on a hole of golf
 * (`reach`, about what a driver's aim view sees from the camera on) and how much of the square's edge its shadows fade out
 * over (`fade`), and how soft their edge is, in texels of its map (`softness`). A golf hole is long, so its map is fitted
 * to the view and its shadows are as sharp at the far end as at the tee and fall on the woods past it; a minigolf hole
 * is small, and its map is the whole box, as it always was. Chosen so every thing casts and every surface catches,
 * water too, at one softness (8 October 2026).
 */
export const SHADOW = { margin: 4, top: 24, reach: 420, fade: 0.15, softness: 1.5 } as const;

/**
 * The clean toy of `LOOK.md`: edges drawn at four samples a pixel, the toon
 * bands eased over a narrow width so a band's edge on a curve is a clean line,
 * the shade a deep sea-green of a colour rather than a grey of it, as the
 * title picture's shadows are (blue-violet until 8 October 2026), a warm
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
  shadeColour: [0.3, 0.55, 0.62] as [number, number, number],
  rim: 0.25,
  rimColour: [1, 0.95, 0.85] as [number, number, number],
  rimWidth: 0.18,
  skyLight: [0.5, 0.66, 0.9] as [number, number, number],
  groundLight: [0.42, 0.42, 0.18] as [number, number, number],
  form: 2.5,
  // every shadow at one softness, the title picture's soft edge, and open water darkened in one as the ground beside it is
  shadowSoftness: SHADOW.softness,
  waterShadow: true,
} as const;

/**
 * Has the renderer compile the build that draws a surface that flows, now, and not the first time a hole with water is
 * begun: it compiles when it is first handed a group with a flow kind and until it is in such a group is drawn as the
 * still speckle, so a picture of a water hole taken after a hole change would be of the speckle on some runs and the
 * ripple on others. A group with no placements live draws nothing, and the first hole's own groups take its place.
 */
function flowing(renderer: GameRenderer) {
  const triangle = {
    positions: new Float32Array([0, 0, 0, 1, 0, 0, 0, 1, 0]),
    normals: new Float32Array([0, 0, 1, 0, 0, 1, 0, 0, 1]),
    uvs: new Float32Array(6),
    indices: new Uint32Array([0, 1, 2]),
  };
  const patterns = new Float32Array(PATTERN_STRIDE);
  packFlow(patterns, 0, { kind: FLOW_RIPPLE, scale: 1, speed: 0, second: [1, 1, 1] });
  const matrices = new Float32Array(16);
  matrices.set([1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1]);
  // the same for the textured build, which the mown ground wears: asked for now, so the first picture of a hole is textured
  const texture = packTexture(new Float32Array(TEXTURE_STRIDE), 0, { layer: 1, repeat: 1, albedo: 0, shade: 0 });
  renderer.setDynamic([
    { mesh: triangle, matrices, count: 0, patterns },
    { mesh: triangle, matrices, count: 0, texture },
  ]);
}

/**
 * Gives the renderer the turf the mown ground is laid on, made here from arithmetic and handed over as one layer: premultiplied
 * alpha and colour conversion are off, since the colour is a modulation about mid-grey and the alpha a height, both data.
 */
async function turfed(renderer: GameRenderer): Promise<void> {
  const texels = turfTexels(TURF_SIDE, TURF_SEED, 'mown');
  const image = new ImageData(new Uint8ClampedArray(texels), TURF_SIDE, TURF_SIDE);
  const layer = await createImageBitmap(image, { premultiplyAlpha: 'none', colorSpaceConversion: 'none' });
  renderer.setGroundTexture([layer]);
}

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
    sunColour: [2.75, 2.55, 2.2],
    exposure: 1,
    ambient: 1,
    background: SKY.horizon,
    sky: { zenith: SKY.zenith, horizon: SKY.horizon, height: SKY.height },
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
    height: HAZE.height,
    colour: HAZE.colour,
    ambient: 0.4,
    anisotropy: 0,
    reach: HAZE.reach,
    steps: 16,
    cones: 0,
  };
  // a bright day: no darkened corners, which against a pale sky read as a grey haze; and the colours shown straight
  // with a shoulder, so a lit plastic keeps its hue and its roundness where the clamp held a channel flat at one
  renderer.post = { ...renderer.post, vignette: 0, grain: 0, tone: 'soft' };
  const env = bakeEnvironment(ctx, 'daylight', { size: 128, mips: 6 });
  renderer.setEnvironment(env.specular, env.brdf, env.mips);
  await turfed(renderer);
  flowing(renderer);
  await renderer.prepare();
}
