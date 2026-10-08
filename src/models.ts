/**
 * The models the course is drawn with: the cup and its flag, the tee's
 * markers, the obstacles at the sizes the physics gives them, and the
 * decoration. Each is a function of the sizes that matter to play, and
 * gives back its parts, each a mesh and a material in the renderer's terms,
 * for `group` to turn into a `GameGroup` with the placements the scene
 * writes. What is cut is flat-shaded, in Miner's way, its faces sharing no
 * vertices; but the course's furniture, which is on screen every moment, is
 * turned round and shaded smooth, and what is round in the decoration is
 * moulded smooth. Every colour comes from a part's material, never a
 * texture.
 *
 * Z is up, a world unit is 10 cm, the ball's radius is 1, a tile is 3.
 */
export type { Colour, Material, Model, Part, Pattern, V3 } from './models/part';
export { PATTERN, bounds, group, triangles } from './models/part';
export { FLAG_COLOURS, FLOWER_COLOURS, PALETTE, PENNANT_COLOURS, RAINBOW, ROUGH } from './models/palette';
export { CUP, breakArrow, collar, cup, cupRing, flag, golfBall, teeMarkers, wideCollar } from './models/course';
export type { Conveyor, Footprint, Pond, Windmill } from './models/obstacles';
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
  waterBed,
  streamBed,
  windmill,
} from './models/obstacles';
export { bunting, fence, flowers, stake } from './models/decor';
export { FACETS, boulder, broadleaf, bush, cloud, conifer, farTree, fern, golfTree, stone } from './models/lowpoly';
export { kicker } from './models/kicker';
export { flipper } from './models/obstacles';
export { OCEAN, OCEAN_ON, RIPPLE, STREAM, stream, oceanFor, oceanScaleFor } from './models/obstacles';

/**
 * How many triangles each model may have at the largest the game will ask
 * for, and a whole hole with forty decorations on it; and the rail, a tile
 * of it at a time, however it turns. A model that outgrows its budget is made
 * cheaper, not given more. The furniture's were set anew when it was made
 * round: the ball fine enough that its outline is round however near it is
 * seen, since there is one of it; the cup's rim, the pin and the markers
 * turned just finely enough to be shaded round. The decoration's were set
 * anew when it was moulded smooth, as enough round its edge to read round
 * from the tee and no more: a bloom a few pixels across from the far view is
 * one lobed ball, not five. The sand is raked in stripes a tile has four of, two triangles each, and a bunker that
 * is twenty-five tiles is three hundred. The flowers carry their blooms on stems now, up out of
 * the long grass, forty triangles more on the fullest clump.
 */
export const BUDGET = {
  cup: 380,
  collar: 40,
  /** The collar of a cup wider than its tile: the tile's four corners, and a cell or two of the mouth's edge; 16 for the magnet's, and 56 at the widest a tile can be cut to. */
  'wide collar': 64,
  flag: 240,
  /** The rainbow flag: the pole and knob of the flag, and six strips of cloth of eighty triangles less their inner edges. */
  'rainbow flag': 640,
  teeMarkers: 300,
  ball: 1000,
  rail: 200,
  bumper: 160,
  barrier: 44,
  windmill: 260,
  water: 160,
  bunker: 300,
  'sand bed': 140,
  'water bed': 90,
  'stream bed': 80,
  conveyor: 120,
  golfTree: 320,
  stake: 120,
  breakArrow: 8,
  flowers: 650,
  bunting: 540,
  fence: 1000,
  hole: 20000,
  golfHole: 60000,
  kicker: 420,
  flipper: 120,
  /** The low-poly scenery, chunky as chosen: a broadleaf is four lumps of twenty-four facets on a trunk of six. */
  broadleaf: 120,
  conifer: 60,
  boulder: 40,
  bush: 80,
  fern: 40,
  cloud: 100,
  stone: 50,
  /** The world past a hole: its hills, mountains and lake, a far tree for each of its trees, and its clouds. */
  backdrop: 24000,
  farTree: 16,
} as const;
