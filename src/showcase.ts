/**
 * The models' showcase, a dev page (`/showcase.html`): every model drawn on
 * a patch of the game's own grass inside its rail, in rows, each labelled on
 * the page, in the game's daylight look. It is where the models are looked
 * at and tuned, and what `smoke/models.spec.ts` pictures; without it, a
 * model would first be seen when a hole was built round it.
 *
 * `?model=name` parks the camera on one exhibit or one row (`?model=balls` adds a lineup of today's ball and the shop's
 * fifteen, side by side, and `?model=title` the title's lettering, standing up and seen from the front), `?seed=N` dresses
 * the decoration differently, and `?paused=1` stops the blades and the belt
 * until a test steps them. `window.showcase` is its test API.
 */
import { LightPool } from 'artshape-render/game/lights';
import { GameRenderer, type GameGroup } from 'artshape-render/game/renderer';
import { createContext } from 'artshape-render/gpu/context';
import { KICKER, layoutOf } from './arena';
import { frameCost } from './frame-cost';
import { railsOf } from './ground';
import { TREE } from './trees';
import { daylight } from './look';
import { place } from './matrix';
import { square } from './meshes';
import {
  FLAG_COLOURS,
  FLOWER_COLOURS,
  PALETTE,
  barrier,
  bounds,
  bumper,
  bunker,
  breakArrow,
  bunting,
  collar,
  conveyor,
  cup,
  fence,
  flag,
  flowers,
  golfBall,
  BALL_LOOK,
  group,
  golfTree,
  boulder,
  broadleaf,
  bush,
  cloud,
  conifer,
  fern,
  kicker,
  placeBlades,
  stake,
  teeMarkers,
  water,
  windmill,
  type Conveyor,
  type Model,
  type Part,
  type V3,
  type Windmill,
} from './models';
import { flipper } from './models';
import { TONE_SUN, sceneryRule, toned } from './models/tone';
import { ITEMS } from './items';
import { titleModel } from './models/lettering';
import titleTrace from './titletrace.json';

/** A scenery model as the game draws it at a yaw of nought: its faces split into the baked tones, as `models/tone.ts` has them. */
const lit = (model: Model): Model => toned(model, TONE_SUN, sceneryRule(model));

declare global {
  interface Window {
    showcase?: ShowcaseApi;
  }
}

export interface ShowcaseApi {
  /** Booted, drawn once, and its frame loop running. */
  ready: boolean;
  /** Everything the camera can be parked on: `all`, each row and each exhibit, by name. */
  views: string[];
  /** Park the camera on a view, framed to fit the screen. */
  look(view: string): void;
  pause(): void;
  resume(): void;
  /** Run the blades and the belt on `frames` sixtieths of a second, and draw. */
  step(frames: number): void;
  /** How many triangles the showcase draws. */
  triangles: number;
  /** What a frame of the showcase as it stands costs to draw, as the game's `measureFrame`. */
  measureFrame(): Promise<number>;
}

const MM_PER_UNIT = 100;
const TILE = 3;
/** The patch of grass inside the rail: 24 tiles across by 18 deep, striped every three tiles so a cup's collar sits in one stripe. */
const PATCH = { minX: -36, maxX: 36, minY: -27, maxY: 27 };
const STRIPE = 9;
const RAIL_HEIGHT = 1.6;
/** How the camera looks down, from level: the game's three-quarters for the whole set, lower to see one thing. */
const POLAR = { all: 0.78, row: 0.9, one: 1.02 };
const FOV = 40;
/** The title is seen from nearly level, as it is on its own screen, and not from above as the rest are. */
const TITLE_POLAR = 1.5;
/** How big the title is stood, as a multiple of its own units (a picture pixel is a hundredth), and how high its middle is off the grass. */
const TITLE = { scale: 2.4, lift: 12 };

type Row = 'course' | 'obstacles' | 'decoration';
interface Item {
  model: Model;
  x: number;
  y: number;
  z?: number;
  yaw?: number;
  /** How big, as a multiple of the model's own size. */
  scale?: number;
  /** A collar's grass is tinted to the stripe it lies in. */
  grass?: boolean;
}
interface Exhibit {
  name: string;
  label: string;
  row: Row;
  items: Item[];
}

const canvas = document.getElementById('view') as HTMLCanvasElement;
const labels = document.getElementById('labels')!;
const boot = document.getElementById('boot')!;
const bootMsg = document.getElementById('bootMsg')!;

main().catch((err: unknown) => {
  bootMsg.textContent = err instanceof Error ? err.message : String(err);
  console.error(err);
});

/**
 * The rail exhibit, as a hole's map: a run with a corner at one end, a T in
 * its middle and a stem down from each, and grass inside the corner, since a
 * map must have a tee and a cup; only the rail is drawn.
 */
const RAIL_PIECE = ['       ', ' ##### ', ' #.#.  ', ' #T#C  ', '       '];

/** Rail drawn from a map, as the game draws a hole's, standing on the showcase's grass: its cap and its timber. */
function railPiece(map: readonly string[], depth = 0): Model {
  const rails = railsOf(layoutOf(map), RAIL_HEIGHT, depth);
  return {
    name: 'rail',
    parts: [
      { name: 'sides', mesh: rails.sides, material: [...PALETTE.rail, 0.6] },
      { name: 'cap', mesh: rails.cap, material: [...PALETTE.railCap, 0.45] },
    ],
    moving: [],
  };
}

/** The stripe's colour at `y`, as the game mows its grass. */
const stripeAt = (y: number) => (Math.floor((y - PATCH.minY) / STRIPE) % 2 ? PALETTE.grassMown : PALETTE.grass);

/** Every exhibit, where it stands: the course's things at the front, the obstacles in the middle, the decoration behind. */
function exhibits(seed: number): Exhibit[] {
  return [
    {
      name: 'cup',
      label: 'cup r 1.6, blue flag',
      row: 'course',
      items: [
        { model: collar(6, 1.6), x: 24, y: -21, grass: true },
        { model: cup(1.6), x: 24, y: -21 },
        { model: flag(FLAG_COLOURS.blue), x: 24, y: -21, yaw: 0.4 },
      ],
    },
    {
      name: 'big-cup',
      label: 'cup r 3, red flag',
      row: 'course',
      items: [
        { model: collar(9, 3), x: 13.5, y: -22.5, grass: true },
        { model: cup(3), x: 13.5, y: -22.5 },
        { model: flag(FLAG_COLOURS.red), x: 13.5, y: -22.5, yaw: 0.4 },
      ],
    },
    {
      name: 'break-arrow',
      label: 'green arrows',
      row: 'course',
      items: [
        { model: breakArrow(), x: -26, y: -17.5, z: 0.05, yaw: 0.5, scale: 0.9 },
        { model: breakArrow(), x: -26, y: -21, z: 0.05, yaw: 0, scale: 1.5 },
        { model: breakArrow(), x: -26, y: -24.5, z: 0.05, yaw: -0.5, scale: 2.2 },
      ],
    },
    { name: 'tee', label: 'tee markers', row: 'course', items: [{ model: teeMarkers(4), x: -14, y: -21 }] },
    // a piece of rail turning a corner, meeting itself in a T and ending three times, for its cap and its rounds
    { name: 'rail', label: 'rail', row: 'course', items: [{ model: railPiece(RAIL_PIECE), x: 0, y: -21 }] },
    {
      name: 'bumper',
      label: 'bumpers r 1.2, 2',
      row: 'obstacles',
      items: [
        { model: bumper(1.2), x: -23, y: -5 },
        { model: bumper(2, { colour: PALETTE.plastic.blue }), x: -18, y: -6 },
      ],
    },
    {
      name: 'kicker',
      label: 'kicker',
      row: 'obstacles',
      items: [{ model: kicker(KICKER.radius, { height: KICKER.height }), x: -23, y: 1.5 }],
    },
    {
      name: 'barrier',
      label: 'sliding barrier',
      row: 'obstacles',
      items: [{ model: barrier(3, 0.6, 0.8), x: -6, y: -6, z: 0.8 }],
    },
    { name: 'windmill', label: 'windmill', row: 'obstacles', items: [{ model: windmill(), x: -14, y: 3 }] },
    { name: 'water', label: 'water', row: 'obstacles', items: [{ model: water(6, 9, { seed }), x: -3, y: 1.5 }] },
    { name: 'bunker', label: 'bunker', row: 'obstacles', items: [{ model: bunker(9, 6, { seed }), x: 7.5, y: 3 }] },
    { name: 'conveyor', label: 'conveyor', row: 'obstacles', items: [{ model: conveyor(6, 9), x: 19.5, y: 1.5 }] },
    {
      name: 'flipper',
      label: 'flipper',
      row: 'obstacles',
      items: [{ model: flipper(6, 0.6, 0.8), x: 4, y: -9, z: 0.8, yaw: 0.35 }],
    },
    {
      name: 'broadleaf',
      label: 'broadleaf',
      row: 'decoration',
      items: [{ model: lit(broadleaf({ height: 7, seed })), x: -18, y: 22.5 }],
    },
    {
      name: 'conifer',
      label: 'conifer',
      row: 'decoration',
      items: [{ model: lit(conifer({ height: 10, seed })), x: -10.5, y: 23 }],
    },
    { name: 'bunting', label: 'bunting', row: 'decoration', items: [{ model: bunting(12, { seed }), x: 4, y: 23 }] },
    { name: 'fence', label: 'fence', row: 'decoration', items: [{ model: fence(6), x: 17.5, y: 22.5 }] },
    {
      name: 'bush',
      label: 'bush and fern',
      row: 'decoration',
      items: [
        { model: lit(bush(1.8, { seed })), x: -17, y: 14 },
        { model: lit(fern(2.2, { seed })), x: -13.5, y: 14.5 },
      ],
    },
    {
      name: 'flowers',
      label: 'flowers',
      row: 'decoration',
      items: FLOWER_COLOURS.map((c, k) => ({
        model: flowers(c, { seed: seed + k }),
        x: -9 + k * 2.3,
        y: 14 + (k % 2) * 1.8,
      })),
    },
    {
      name: 'boulder',
      label: 'boulders',
      row: 'decoration',
      items: [
        { model: lit(boulder(1.5, { seed, colour: PALETTE.rockWarm })), x: 5, y: 14.5 },
        { model: lit(boulder(0.8, { seed: seed + 1, colour: PALETTE.rockWarm })), x: 7.4, y: 13.6 },
      ],
    },
    {
      name: 'cloud',
      label: 'cloud',
      row: 'decoration',
      items: [{ model: cloud({ seed }), x: 27, y: 30, z: 7, scale: 4 }],
    },
    {
      name: 'golf-tree',
      label: 'golf tree',
      row: 'decoration',
      items: [{ model: lit(golfTree(TREE, { seed })), x: 27, y: 19 }],
    },
    {
      name: 'stakes',
      label: 'out of bounds stakes',
      row: 'decoration',
      items: [0, 1, 2].map((k) => ({ model: stake(), x: 12 + k * 2.4, y: 14.5 })),
    },
  ];
}

/**
 * The ball lineup of `?model=balls`: today's ball and then the fifteen in the shop, in its order, side by side across the
 * front of the patch, each its own exhibit so it is labelled with its name. Only when asked for, so the showcase's other
 * views and the pictures held of them are as they were.
 */
function ballExhibits(): Exhibit[] {
  const looks = [
    { id: 'today', name: "today's ball", look: BALL_LOOK },
    ...ITEMS.filter((i) => i.aisle === 'ball' && i.look).map((i) => ({ id: i.id, name: i.name, look: i.look! })),
  ];
  const apart = 4.2;
  return looks.map(({ id, name, look }, k) => ({
    name: `ball-${id}`,
    label: name,
    row: 'course',
    items: [{ model: golfBall(1, { look }), x: (k - (looks.length - 1) / 2) * apart, y: -12, z: 1 }],
  }));
}

/**
 * The title's lettering as `?model=title` shows it: the model's own frame has x across, y up and z toward the viewer, as a
 * screen has it, so it is stood up in the showcase's (z up, the viewer to the south) by turning it a quarter about x, and made `TITLE.scale`
 * times as big (in its own mesh and not as the item's scale, which the exhibit's box does not read).
 * Only when asked for, so the showcase's other views and the pictures held of them are as they were.
 */
function titleExhibit(): Exhibit {
  const model = titleModel(titleTrace);
  const stand = (part: Part): Part => {
    const turn = (a: Float32Array, k: number) => {
      const out = new Float32Array(a.length);
      for (let i = 0; i < a.length; i += 3) [out[i], out[i + 1], out[i + 2]] = [a[i] * k, -a[i + 2] * k, a[i + 1] * k];
      return out;
    };
    return {
      ...part,
      mesh: { ...part.mesh, positions: turn(part.mesh.positions, TITLE.scale), normals: turn(part.mesh.normals, 1) },
    };
  };
  return {
    name: 'title',
    label: 'title',
    row: 'decoration',
    items: [{ model: { ...model, parts: model.parts.map(stand) }, x: 0, y: 0, z: TITLE.lift }],
  };
}

/** The box round an exhibit's items, placed, with room for the blades and the belt's chevrons to move in. */
function exhibitBox(e: Exhibit): { min: V3; max: V3 } {
  const min: V3 = [Infinity, Infinity, Infinity],
    max: V3 = [-Infinity, -Infinity, -Infinity];
  for (const it of e.items) {
    const b = bounds([...it.model.parts, ...it.model.moving]);
    if (it.model.name === 'windmill') {
      // the blades are drawn about their hub, so their own box is not in the tower's frame: they sweep a disc round the hub
      const w = it.model as Windmill;
      const tower = bounds(w.parts);
      const [hx, hy, hz] = w.hub;
      const [L, t] = [w.bladeLength, w.bladeThickness];
      b.min = [Math.min(tower.min[0], hx - L), Math.min(tower.min[1], hy - t / 2), Math.min(tower.min[2], hz - L)];
      b.max = [Math.max(tower.max[0], hx + L), Math.max(tower.max[1], hy + t / 2), Math.max(tower.max[2], hz + L)];
    }
    for (let a = 0; a < 3; a++) {
      const at = a === 0 ? it.x : a === 1 ? it.y : (it.z ?? 0);
      min[a] = Math.min(min[a], b.min[a] + at);
      max[a] = Math.max(max[a], b.max[a] + at);
    }
  }
  return { min, max };
}

async function main() {
  const query = new URLSearchParams(location.search);
  const seed = query.has('seed') ? Number(query.get('seed')) : 1;

  const ctx = await createContext(canvas);
  bootMsg.textContent = 'compiling shaders…';
  const renderer = new GameRenderer(ctx, 16, 16, 64, MM_PER_UNIT);
  await daylight(renderer, ctx);
  const cam = renderer.camera;
  cam.near = 1;
  cam.far = 1200;
  cam.fov = FOV;

  // ---- what stands still: the grass, the rail, the rough, and every exhibit ----

  const shown = exhibits(seed);
  if (query.get('model') === 'balls') shown.push(...ballExhibits());
  if (query.get('model') === 'title') shown.push(titleExhibit());
  /** Where the grass is left out: under the water and the bunker, which lie at or below it, and the cups' collars. */
  const cut: [number, number, number, number][] = [];
  for (const e of shown)
    for (const it of e.items)
      if (it.grass || it.model.name === 'water' || it.model.name === 'bunker') {
        const b = bounds(it.model.parts);
        cut.push([b.min[0] + it.x, b.max[0] + it.x, b.min[1] + it.y, b.max[1] + it.y]);
      }
  const isCut = (x: number, y: number) => cut.some(([x0, x1, y0, y1]) => x > x0 && x < x1 && y > y0 && y < y1);
  const tiles: [number, number][] = [];
  for (let x = PATCH.minX; x < PATCH.maxX; x += TILE)
    for (let y = PATCH.minY; y < PATCH.maxY; y += TILE)
      if (!isCut(x + TILE / 2, y + TILE / 2)) tiles.push([x + TILE / 2, y + TILE / 2]);
  const grass = new Float32Array(tiles.length * 16),
    grassLooks = new Float32Array(tiles.length * 4);
  tiles.forEach(([x, y], k) => {
    place(grass, k, x, y, 0, 0, TILE, TILE, 1);
    grassLooks.set([...stripeAt(y), 0.85], k * 4);
  });
  // the rail a tile outside the patch all round, as a hole's is drawn: a map of the patch, rail round its edge
  const [across, along] = [(PATCH.maxX - PATCH.minX) / TILE + 2, (PATCH.maxY - PATCH.minY) / TILE + 2];
  const patchMap = Array.from({ length: along }, (_, r) =>
    Array.from({ length: across }, (_, c) =>
      r === 0 || c === 0 || r === along - 1 || c === across - 1
        ? '#'
        : r === 1 && c === 1
          ? 'T'
          : r === 1 && c === 2
            ? 'C'
            : '.',
    ).join(''),
  );
  const railAt = new Float32Array(16);
  place(railAt, 0, (PATCH.minX + PATCH.maxX) / 2, (PATCH.minY + PATCH.maxY) / 2, 0);
  // the rough round the patch and not under it, so it does not hide the inside of a cup
  const rough = new Float32Array(4 * 16);
  const [rx0, rx1, ry0, ry1] = [PATCH.minX - TILE, PATCH.maxX + TILE, PATCH.minY - TILE, PATCH.maxY + TILE];
  const far = 400;
  place(rough, 0, 0, ry1 + far / 2, -0.05, 0, 2 * far, far, 1);
  place(rough, 1, 0, ry0 - far / 2, -0.05, 0, 2 * far, far, 1);
  place(rough, 2, rx0 - far / 2, 0, -0.05, 0, far, ry1 - ry0, 1);
  place(rough, 3, rx1 + far / 2, 0, -0.05, 0, far, ry1 - ry0, 1);

  const still: GameGroup[] = [
    { mesh: square(), matrices: grass, materials: grassLooks },
    ...railPiece(patchMap, 0.05).parts.map((part) => group(part, railAt)),
    { mesh: square(), matrices: rough, albedo: [...PALETTE.rough], roughness: 0.95 },
  ];
  // two balls, for the size of things: one on the tee, one rolling up to the windmill's door
  const balls = new Float32Array(2 * 16);
  place(balls, 0, -14, -21, 1);
  place(balls, 1, -14, -3, 1);
  const [theBall] = golfBall(1, { colour: [0.98, 0.98, 0.96], band: [0.9, 0.16, 0.12] }).parts;
  still.push(group(theBall, balls));

  // ---- what moves: the windmill's blades and the belt's chevrons ----

  const moving: GameGroup[] = [];
  const turners: { mill: Windmill; x: number; y: number; yaw: number; matrices: Float32Array; group: number }[] = [];
  const belts: { belt: Conveyor; x: number; y: number; z: number; matrices: Float32Array; group: number }[] = [];
  for (const e of shown)
    for (const it of e.items) {
      const m = it.model;
      const at = new Float32Array(16);
      place(at, 0, it.x, it.y, it.z ?? 0, it.yaw ?? 0, it.scale ?? 1);
      for (const part of m.parts) {
        const g = group(part, at);
        if (it.grass) g.albedo = [...stripeAt(it.y)];
        still.push(g);
      }
      for (const part of m.moving) {
        if (m.name === 'windmill') {
          const matrices = new Float32Array(16);
          turners.push({ mill: m as Windmill, x: it.x, y: it.y, yaw: it.yaw ?? 0, matrices, group: moving.length });
          moving.push(group(part, matrices));
        } else if (m.name === 'conveyor') {
          const matrices = new Float32Array(16);
          belts.push({ belt: m as Conveyor, x: it.x, y: it.y, z: it.z ?? 0, matrices, group: moving.length });
          moving.push(group(part, matrices));
        } else still.push(group(part, at));
      }
    }
  const drawn = [...still, ...moving].reduce(
    (n, g) => n + (g.mesh.indices.length / 3) * (g.count ?? g.matrices.length / 16),
    0,
  );
  renderer.setStatic(still);
  renderer.setDynamic(moving);
  renderer.setLights(new LightPool(16));
  // the title is lit by its colours, and a bloom thrown from the faces, which are brighter than the sun's white, would lighten the outline beside them
  if (query.get('model') === 'title') renderer.post.bloom = 0;
  renderer.setSunShadow({
    min: [PATCH.minX - TILE, PATCH.minY - TILE, -1],
    max: [PATCH.maxX + TILE, PATCH.maxY + TILE, 14],
  });

  // ---- time: the blades turn and the belt runs, on a clock a test can stop and step ----

  let t = 0;
  let paused = query.has('paused');
  function run() {
    for (const w of turners) {
      placeBlades(w.matrices, 0, w.x, w.y, w.yaw, Math.PI / 4 + t * 0.9, w.mill.hub);
      renderer.move(w.group, w.matrices, 1);
    }
    for (const c of belts) {
      // half a spacing on at the start, so a belt at rest has its chevrons in the middle of it
      place(c.matrices, 0, c.x, c.y + ((t * 1.5 + c.belt.spacing / 2) % c.belt.spacing), c.z);
      renderer.move(c.group, c.matrices, 1);
    }
  }

  // ---- the camera, framed on a view, and the labels over what it sees ----

  const views = new Map<string, { min: V3; max: V3; polar: number }>();
  const boxes = shown.map((e) => ({ e, box: exhibitBox(e) }));
  const union = (list: { min: V3; max: V3 }[]) => ({
    min: [0, 1, 2].map((a) => Math.min(...list.map((b) => b.min[a]))) as V3,
    max: [0, 1, 2].map((a) => Math.max(...list.map((b) => b.max[a]))) as V3,
  });
  views.set('all', {
    min: [PATCH.minX - TILE, PATCH.minY - TILE, 0],
    max: [PATCH.maxX + TILE, PATCH.maxY + TILE, 8],
    polar: POLAR.all,
  });
  for (const row of ['course', 'obstacles', 'decoration'] as Row[])
    views.set(row, { ...union(boxes.filter((b) => b.e.row === row).map((b) => b.box)), polar: POLAR.row });
  for (const { e, box: b } of boxes) views.set(e.name, { ...b, polar: e.name === 'title' ? TITLE_POLAR : POLAR.one });
  // the lineup of balls, when it is asked for, as one view
  const lined = boxes.filter((b) => b.e.name.startsWith('ball-'));
  if (lined.length) views.set('balls', { ...union(lined.map((b) => b.box)), polar: POLAR.one });

  const tags = boxes.map(({ e, box: b }) => {
    const el = document.createElement('div');
    el.className = 'label';
    el.textContent = e.label;
    labels.append(el);
    return { el, box: b, name: e.name };
  });

  let width = 1,
    height = 1,
    view = query.get('model') ?? 'all';
  if (!views.has(view)) view = 'all';

  /** Where a point in the world is on the page, or null behind the camera. */
  const project = ([x, y, z]: V3): [number, number] | null => {
    const m = cam.viewProjection;
    const w = m[3] * x + m[7] * y + m[11] * z + m[15];
    if (w <= 0) return null;
    return [(m[0] * x + m[4] * y + m[8] * z + m[12]) / w, (m[1] * x + m[5] * y + m[9] * z + m[13]) / w];
  };

  /** The camera from the south or the west, looking down at the view's polar angle, as near as it can be with the whole box on the screen. */
  function frame() {
    const v = views.get(view)!;
    const c: V3 = [0, 1, 2].map((a) => (v.min[a] + v.max[a]) / 2) as V3;
    c[2] = v.min[2] + (v.max[2] - v.min[2]) * (view === 'title' ? 0.5 : 0.3);
    cam.aspect = width / height;
    cam.target = c;
    // from the south on a wide screen; on a tall one from the west, so the rows run up the screen as a phone's hole does
    const [ax, ay] = cam.aspect < 1 ? [-1, 0] : [0, -1];
    const fits = (d: number) => {
      const across = Math.sin(v.polar) * d;
      cam.position = [c[0] + ax * across, c[1] + ay * across, c[2] + Math.cos(v.polar) * d];
      cam.update();
      for (let k = 0; k < 8; k++) {
        const p = project([k & 1 ? v.max[0] : v.min[0], k & 2 ? v.max[1] : v.min[1], k & 4 ? v.max[2] : v.min[2]]);
        if (!p || Math.abs(p[0]) > 0.94 || Math.abs(p[1]) > 0.88) return false;
      }
      return true;
    };
    let near = 2,
      far = 600;
    for (let k = 0; k < 40; k++) {
      const mid = (near + far) / 2;
      if (fits(mid)) far = mid;
      else near = mid;
    }
    fits(far);
    for (const { el, box: b, name } of tags) {
      // under the edge nearest the camera, on the grass, where nothing of another exhibit stands in front of it
      const [cx, cy] = [(b.min[0] + b.max[0]) / 2, (b.min[1] + b.max[1]) / 2];
      const p = project(ax ? [b.min[0] - 0.6, cy, 0] : [cx, b.min[1] - 0.6, 0]);
      // the title is seen on its own: the labels of what stands on the grass behind it would sit over its letters
      const on = p && Math.abs(p[0]) < 1 && Math.abs(p[1]) < 1 && (view !== 'title' || name === 'title');
      el.hidden = !on;
      if (p && on) {
        el.style.left = `${((p[0] + 1) / 2) * canvas.clientWidth}px`;
        el.style.top = `${((1 - p[1]) / 2) * canvas.clientHeight}px`;
      }
    }
  }

  const resize = () => {
    const dpr = Math.min(devicePixelRatio || 1, 1.5);
    width = Math.max(1, Math.floor(canvas.clientWidth * dpr));
    height = Math.max(1, Math.floor(canvas.clientHeight * dpr));
    canvas.width = width;
    canvas.height = height;
    renderer.resize(width, height);
    frame();
  };
  addEventListener('resize', resize);
  resize();

  /** A frame drawn, `dt` seconds on from the last: none while paused, since the renderer keeps time of its own too. */
  function draw(dt = 0) {
    run();
    renderer.frame(ctx.context.getCurrentTexture().createView(), 'redraw', dt);
  }

  async function measureFrame(): Promise<number> {
    const target = ctx.device.createTexture({
      label: 'measuring target',
      size: [width, height],
      format: ctx.format,
      usage: GPUTextureUsage.RENDER_ATTACHMENT,
    });
    const into = target.createView();
    const cost = await frameCost(
      () => {
        run();
        return renderer.frame(into, 'redraw', 1 / 60);
      },
      () => ctx.device.queue.onSubmittedWorkDone(),
    );
    target.destroy();
    return cost;
  }

  await renderer.ready;
  draw();
  boot.classList.add('gone');

  const api: ShowcaseApi = {
    ready: false,
    views: [...views.keys()],
    look(name) {
      if (!views.has(name)) throw new Error(`no view called ${name}: there are ${[...views.keys()].join(', ')}`);
      view = name;
      frame();
      draw();
    },
    pause() {
      paused = true;
    },
    resume() {
      paused = false;
    },
    step(frames) {
      t += frames / 60;
      draw(frames / 60);
    },
    triangles: drawn,
    measureFrame,
  };
  window.showcase = api;

  let last = performance.now();
  const tick = (now: number) => {
    requestAnimationFrame(tick);
    const dt = paused ? 0 : Math.min((now - last) / 1000, 1 / 20);
    t += dt;
    last = now;
    draw(dt);
  };
  requestAnimationFrame(tick);
  api.ready = true;
}
