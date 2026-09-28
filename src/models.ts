/**
 * The models the course is drawn with: the cup and its flag, the tee's
 * markers, the obstacles at the sizes the physics gives them, and the
 * decoration. Each is a function of the sizes that matter to play, and
 * gives back its parts, each a mesh and a material in the renderer's terms,
 * for `group` to turn into a `GameGroup` with the placements the scene
 * writes. Low-poly and flat-shaded, in Miner's way, faces sharing no
 * vertices; but the course's furniture, which is on screen every moment, is
 * turned round and shaded smooth. Every colour comes from a part's material,
 * never a texture.
 *
 * Z is up, a world unit is 10 cm, the ball's radius is 1, a tile is 3.
 */
export type { Colour, Material, Model, Part, Pattern, V3 } from './models/part';
export { PATTERN, bounds, group, triangles } from './models/part';
export { FLAG_COLOURS, FLOWER_COLOURS, PALETTE, PENNANT_COLOURS, ROUGH } from './models/palette';
export { CUP, collar, cup, flag, golfBall, teeMarkers } from './models/course';
export type { Conveyor, Footprint, Windmill } from './models/obstacles';
export {
  BUNKER,
  WATER,
  WINDMILL,
  barrier,
  bumper,
  bunker,
  sandBed,
  conveyor,
  placeBlades,
  water,
  windmill,
} from './models/obstacles';
export { bunting, fence, flowers, hedge, rock, tree } from './models/decor';

/**
 * How many triangles each model may have at the largest the game will ask
 * for, and a whole hole with forty decorations on it; and the rail, a tile
 * of it at a time, however it turns. A model that outgrows its budget is made
 * cheaper, not given more. The furniture's were set anew when it was made
 * round: the ball fine enough that its outline is round however near it is
 * seen, since there is one of it; the cup's rim, the pin and the markers
 * turned just finely enough to be shaded round.
 */
export const BUDGET = {
  cup: 380,
  collar: 40,
  flag: 240,
  teeMarkers: 300,
  ball: 1000,
  rail: 200,
  bumper: 160,
  barrier: 44,
  windmill: 260,
  water: 160,
  bunker: 30,
  'sand bed': 120,
  conveyor: 120,
  tree: 200,
  hedge: 44,
  flowers: 180,
  rock: 60,
  bunting: 420,
  fence: 460,
  hole: 8000,
} as const;
