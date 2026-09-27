/**
 * The models' showcase, a dev page (`/showcase.html`): every model drawn on
 * a patch of the game's own grass inside its rail, in rows, each labelled on
 * the page, in the game's daylight look. It is where the models are looked
 * at and tuned, and what `smoke/models.spec.ts` pictures; without it, a
 * model would first be seen when a hole was built round it.
 *
 * `?model=name` parks the camera on one exhibit or one row, `?seed=N` dresses
 * the decoration differently, and `?paused=1` stops the blades and the belt
 * until a test steps them. `window.showcase` is its test API.
 */
import { LightPool } from 'artshape-render/game/lights';
import { GameRenderer, type GameGroup } from 'artshape-render/game/renderer';
import { createContext } from 'artshape-render/gpu/context';
import { frameCost } from './frame-cost';
import { daylight } from './look';
import { place } from './matrix';
import { ball, box, square } from './meshes';
import {
  FLAG_COLOURS,
  FLOWER_COLOURS,
  PALETTE,
  barrier,
  bounds,
  bumper,
  bunker,
  bunting,
  collar,
  conveyor,
  cup,
  fence,
  flag,
  flowers,
  group,
  hedge,
  placeBlades,
  rock,
  teeMarkers,
  tree,
  water,
  windmill,
  type Conveyor,
  type Model,
  type V3,
  type Windmill,
} from './models';

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

type Row = 'course' | 'obstacles' | 'decoration';
interface Item {
  model: Model;
  x: number;
  y: number;
  z?: number;
  yaw?: number;
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
    { name: 'tee', label: 'tee markers', row: 'course', items: [{ model: teeMarkers(4), x: -14, y: -21 }] },
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
      name: 'round-tree',
      label: 'round tree',
      row: 'decoration',
      items: [{ model: tree('round', { height: 7, seed }), x: -18, y: 22.5 }],
    },
    {
      name: 'pine',
      label: 'pine',
      row: 'decoration',
      items: [{ model: tree('pine', { height: 10, seed }), x: -10.5, y: 23 }],
    },
    { name: 'bunting', label: 'bunting', row: 'decoration', items: [{ model: bunting(12, { seed }), x: 4, y: 23 }] },
    { name: 'fence', label: 'fence', row: 'decoration', items: [{ model: fence(6), x: 17.5, y: 22.5 }] },
    {
      name: 'hedge',
      label: 'hedge',
      row: 'decoration',
      items: [{ model: hedge(6, 1.5, 1.8, { seed }), x: -16, y: 14 }],
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
    { name: 'rock', label: 'rock', row: 'decoration', items: [{ model: rock(1.5, { seed }), x: 6, y: 14.5 }] },
  ];
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
  daylight(renderer, ctx);
  const cam = renderer.camera;
  cam.near = 1;
  cam.far = 1200;
  cam.fov = FOV;

  // ---- what stands still: the grass, the rail, the rough, and every exhibit ----

  const shown = exhibits(seed);
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
  const rails: [number, number][] = [];
  for (let x = PATCH.minX - TILE; x < PATCH.maxX + TILE; x += TILE)
    for (let y = PATCH.minY - TILE; y < PATCH.maxY + TILE; y += TILE) {
      const inside = x >= PATCH.minX && x < PATCH.maxX && y >= PATCH.minY && y < PATCH.maxY;
      if (!inside) rails.push([x + TILE / 2, y + TILE / 2]);
      else if (!isCut(x + TILE / 2, y + TILE / 2)) tiles.push([x + TILE / 2, y + TILE / 2]);
    }
  const grass = new Float32Array(tiles.length * 16),
    grassLooks = new Float32Array(tiles.length * 4);
  tiles.forEach(([x, y], k) => {
    place(grass, k, x, y, 0, 0, TILE, TILE, 1);
    grassLooks.set([...stripeAt(y), 0.85], k * 4);
  });
  const railAt = new Float32Array(rails.length * 16);
  rails.forEach(([x, y], k) => place(railAt, k, x, y, 0));
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
    { mesh: box(TILE, TILE, RAIL_HEIGHT), matrices: railAt, albedo: [...PALETTE.rail], roughness: 0.55 },
    { mesh: square(), matrices: rough, albedo: [...PALETTE.rough], roughness: 0.95 },
  ];
  // two balls, for the size of things: one on the tee, one rolling up to the windmill's door
  const balls = new Float32Array(2 * 16);
  place(balls, 0, -14, -21, 1);
  place(balls, 1, -14, -3, 1);
  still.push({ mesh: ball(1, 8, 14), matrices: balls, albedo: [0.98, 0.98, 0.96], roughness: 0.25 });

  // ---- what moves: the windmill's blades and the belt's chevrons ----

  const moving: GameGroup[] = [];
  const turners: { mill: Windmill; x: number; y: number; yaw: number; matrices: Float32Array; group: number }[] = [];
  const belts: { belt: Conveyor; x: number; y: number; z: number; matrices: Float32Array; group: number }[] = [];
  for (const e of shown)
    for (const it of e.items) {
      const m = it.model;
      const at = new Float32Array(16);
      place(at, 0, it.x, it.y, it.z ?? 0, it.yaw ?? 0);
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
  for (const { e, box: b } of boxes) views.set(e.name, { ...b, polar: POLAR.one });

  const tags = boxes.map(({ e, box: b }) => {
    const el = document.createElement('div');
    el.className = 'label';
    el.textContent = e.label;
    labels.append(el);
    return { el, box: b };
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
    c[2] = v.min[2] + (v.max[2] - v.min[2]) * 0.3;
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
    for (const { el, box: b } of tags) {
      // under the edge nearest the camera, on the grass, where nothing of another exhibit stands in front of it
      const [cx, cy] = [(b.min[0] + b.max[0]) / 2, (b.min[1] + b.max[1]) / 2];
      const p = project(ax ? [b.min[0] - 0.6, cy, 0] : [cx, b.min[1] - 0.6, 0]);
      const on = p && Math.abs(p[0]) < 1 && Math.abs(p[1]) < 1;
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
