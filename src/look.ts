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
import type { Theme } from './theme';
import { TURF_KINDS, TURF_SIDE, turfTexels } from './turfTexture';

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
 * tree's tip and the tallest of the woods past it, 38 since the second title pass sized the woods' broadleaves up to
 * 40 tall: a top outside the box casts no shadow, 24 before), the side of the square of ground its map covers on a hole of golf
 * (`reach`, about what a driver's aim view sees from the camera on) and how much of the square's edge its shadows fade out
 * over (`fade`), and how soft their edge is, in texels of its map (`softness`). A golf hole is long, so its map is fitted
 * to the view and its shadows are as sharp at the far end as at the tee and fall on the woods past it; a minigolf hole
 * is small, and its map is the whole box, as it always was. Chosen so every thing casts and every surface catches,
 * water too, at one softness (8 October 2026).
 */
export const SHADOW = { margin: 4, top: 38, reach: 420, fade: 0.15, softness: 1.5 } as const;

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
 * it read 1.00, and the steepest slopes reach the band beneath. It is 5 since the second title pass lowered the sun,
 * which made a hill's flanks more alike by the light's own fall-off, and the title's hills have dark flanks. The toy
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
  form: 5,
  // every shadow at one softness, the title picture's soft edge, and open water darkened in one as the ground beside it is
  shadowSoftness: SHADOW.softness,
  waterShadow: true,
} as const;

/**
 * The post chain: a bright day, so no darkened corners, which against a pale sky read as a grey haze; no film grain; the
 * colours shown straight with a shoulder, so a lit plastic keeps its hue and its roundness where the clamp held a channel
 * flat at one; and a dither of a step of the screen's eight bits, the renderer's own since v0.45.0. Without the dither a
 * long fairway in a gentle light, whose light changes by less than a step over a hundred pixels, was drawn as flat bands a
 * step or two apart across its stripes, which a player saw on a phone on The Straight Mile (16 October 2026). It is the same
 * at a pixel every frame, so a picture is the same every run and a still frame does not shimmer.
 */
export const POST = { vignette: 0, grain: 0, tone: 'soft', dither: 1 } as const;

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
 * Gives the renderer the textures the ground is laid on, made here from arithmetic and handed over as layers, in the order of
 * `TURF_KINDS` (the mown turf's is the first and the others are the biomes' and the pan's): premultiplied alpha and colour
 * conversion are off, since the colour is a modulation about mid-grey and the alpha a height, both data. All are made once, at
 * boot, and a hole chooses its layer by number (`Theme.layers`); they are 5 of the renderer's 8.
 */
async function turfed(renderer: GameRenderer): Promise<void> {
  const layers: ImageBitmap[] = [];
  for (const kind of TURF_KINDS) {
    const texels = turfTexels(TURF_SIDE, TURF_SEED, kind);
    const image = new ImageData(new Uint8ClampedArray(texels), TURF_SIDE, TURF_SIDE);
    layers.push(await createImageBitmap(image, { premultiplyAlpha: 'none', colorSpaceConversion: 'none' }));
  }
  renderer.setGroundTexture(layers);
}

/**
 * The environments baked, one for each preset a theme asks for and kept: a hole of another biome swaps to the one baked, and
 * baking is done once (at most four presets are ever made). Not kept for ever: the presets are four.
 */
const BAKED = new Map<string, ReturnType<typeof bakeEnvironment>>();

/**
 * What a theme sets on the renderer's look and fog: every field of the sun, the sky, the shade, the rim and the haze, so none is
 * left from the theme before. Worked out apart from the renderer, so a test holds earth's what `daylight` always made and that
 * putting one theme on after another leaves nothing of it behind.
 */
export function lookFor(theme: Theme) {
  const { look } = theme;
  return {
    look: {
      sunDir: look.sunDir as [number, number, number],
      // toon light is at a colour's full strength, so the sun is bright and the colours are shown straight
      sunColour: look.sunColour as [number, number, number],
      exposure: 1,
      ambient: look.ambient,
      background: look.background as [number, number, number],
      sky: look.sky as GameRenderer['look']['sky'],
      shading: 'toon' as const,
      occlusion: OCCLUSION.strength,
      occlusionRadius: OCCLUSION.radius,
      occlusionDirect: OCCLUSION.direct,
      ...TOY,
      shadeColour: look.shadeColour as [number, number, number],
      rim: look.rim,
      rimColour: look.rimColour as [number, number, number],
      skyLight: look.skyLight as [number, number, number],
      groundLight: look.groundLight as [number, number, number],
    },
    fog: {
      ...noFog(MM_PER_UNIT),
      density: look.fog.density,
      base: -10,
      height: HAZE.height,
      colour: look.fog.colour as [number, number, number],
      ambient: 0.4,
      anisotropy: 0,
      reach: HAZE.reach,
      steps: 16,
      cones: 0,
    },
  };
}

/** The renderer's look, fog and environment as `theme` has them, and nothing of any other theme's left on it: every field is written. Returns the environment's preset. */
export function applyLook(renderer: GameRenderer, ctx: Gpu, theme: Theme): string {
  const { look, fog } = lookFor(theme);
  renderer.look = { ...renderer.look, ...look };
  renderer.fog = fog;
  const preset = theme.look.env;
  let env = BAKED.get(preset);
  if (!env) BAKED.set(preset, (env = bakeEnvironment(ctx, preset, { size: 128, mips: 6 })));
  renderer.setEnvironment(env.specular, env.brdf, env.mips);
  return preset;
}

/**
 * Put the look of `theme` (earth's, at boot and for the models' showcase) on `renderer`: a cartoon in daylight, as bearing's
 * sweet world is, in the clean toy's light. Resolves once the pipelines the look asks for are compiled, which the first frame
 * waits for. The theme is handed in and not read here, so the look imports no theme, and the theme the look.
 */
export async function daylight(renderer: GameRenderer, ctx: Gpu, theme: Theme): Promise<void> {
  applyLook(renderer, ctx, theme);
  renderer.post = { ...renderer.post, ...POST };
  await turfed(renderer);
  flowing(renderer);
  await renderer.prepare();
}
