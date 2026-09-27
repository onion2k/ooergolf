/**
 * The daylight look: toon shading in a bright sun, the colours shown
 * straight, a pale blue sky, and the daylight environment for the sky's own
 * light. One place for it, so the game and the models' showcase are drawn
 * alike; without it, a colour tuned on one page would be wrong on the other.
 */
import type { GameRenderer } from 'artshape-render/game/renderer';
import type { Gpu } from 'artshape-render/gpu/context';
import { bakeEnvironment } from 'artshape-render/render/env';

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
  };
  // a bright day: no darkened corners, which against a pale sky read as a grey haze
  renderer.post = { ...renderer.post, vignette: 0, tone: 'clamp' };
  const env = bakeEnvironment(ctx, 'daylight', { size: 128, mips: 6 });
  renderer.setEnvironment(env.specular, env.brdf, env.mips);
}
