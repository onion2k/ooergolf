/**
 * The page: the game drawn, and what the player does to it. Everything that
 * happens on the course happens in `game.ts`; this turns its events into
 * words on the screen, turns a drag into a shot through `shot.ts`, and draws
 * the frame, on the game path of artshape-render. There is no game logic
 * here.
 */
import { createContext } from 'artshape-render/gpu/context';
import { bakeEnvironment } from 'artshape-render/render/env';
import { LightPool } from 'artshape-render/game/lights';
import { GameRenderer } from 'artshape-render/game/renderer';
import { CameraRig } from './camera';
import { createApi } from './debug';
import { frameCost } from './frame-cost';
import { Game, type GameEvents } from './game';
import { Progress } from './progress';
import { seeded } from './random';
import { COURSE_BOX, Scene } from './scene';
import { groundAt, shotFromDrag, type Shot } from './shot';

/** How many millimetres a world unit is: the renderer fixes a few real sizes by it. */
const MM_PER_UNIT = 100;
const LIGHT_CAPACITY = 16,
  EFFECT_CAPACITY = 16,
  PARTICLE_CAPACITY = 1024;
/** How many of the game's events the test API keeps, before the oldest go. */
const EVENTS_KEPT = 500;
/** How far a turn of the wheel moves the camera, in world units a pixel of scroll. */
const WHEEL = 0.05;

const canvas = document.getElementById('view') as HTMLCanvasElement;
const boot = document.getElementById('boot')!;
const bootMsg = document.getElementById('bootMsg')!;
const strokesPanel = document.getElementById('strokes')!;
const strokesText = strokesPanel.querySelector('b')!;
const stats = document.getElementById('stats')!;
const help = document.getElementById('help')!;

main().catch((err: unknown) => {
  bootMsg.textContent = err instanceof Error ? err.message : String(err);
  console.error(err);
});

async function main() {
  // ---- the renderer: a cartoon in daylight, as bearing's sweet world is ----

  const ctx = await createContext(canvas);
  bootMsg.textContent = 'compiling shaders…';
  const renderer = new GameRenderer(ctx, LIGHT_CAPACITY, EFFECT_CAPACITY, PARTICLE_CAPACITY, MM_PER_UNIT);
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
  renderer.camera.near = 2;
  renderer.camera.far = 800;
  renderer.setSunShadow(COURSE_BOX);

  // ---- the game, and what it says has happened ----

  const query = new URLSearchParams(location.search);
  const progress = new Progress();
  /** What has happened, a line each, for the test API. */
  const eventLog: string[] = [];
  const log = (line: string) => {
    eventLog.push(line);
    if (eventLog.length > EVENTS_KEPT) eventLog.splice(0, eventLog.length - EVENTS_KEPT);
  };
  /** Every event the game tells of, noted by its name and its numbers, so a new one reaches the test API without being wired here. */
  const note = (name: string, args: unknown[]) =>
    log(
      `${name} ${args
        .filter((a) => typeof a === 'number')
        .map((a) => a.toFixed(1))
        .join(',')}`.trim(),
    );
  const showStrokes = () => {
    strokesText.textContent = String(game.strokes);
  };
  /** What the player sees of each event, beside the note of it. */
  const shown: GameEvents = {
    struck: showStrokes,
  };
  const events: GameEvents = new Proxy(shown, {
    get:
      (target, name: string) =>
      (...args: unknown[]) => {
        note(name, args);
        (target[name as keyof GameEvents] as ((...a: unknown[]) => void) | undefined)?.(...args);
      },
  });
  // ?seed=N makes chance the same from before the game is built, for a test that wants the same course every run
  const seed = query.get('seed');
  const game = new Game(progress, events, seed !== null ? { random: seeded(+seed) } : {});
  const { world } = game;

  // ---- the scene and the camera ----

  const scene = new Scene();
  renderer.setStatic(scene.static(world.solid));
  renderer.setDynamic(scene.dynamic());
  renderer.setLights(new LightPool(LIGHT_CAPACITY));

  const cam = renderer.camera;
  const rig = new CameraRig();
  rig.jump(world.x[game.ball], world.y[game.ball]);
  /** Whether the test API has parked the camera where it wants it, and it is not to follow the ball. */
  let parked = false;

  let width = 1,
    height = 1;
  const resize = () => {
    const dpr = Math.min(devicePixelRatio || 1, 1.5);
    width = Math.max(1, Math.floor(canvas.clientWidth * dpr));
    height = Math.max(1, Math.floor(canvas.clientHeight * dpr));
    canvas.width = width;
    canvas.height = height;
    cam.aspect = width / height;
    renderer.resize(width, height);
  };
  addEventListener('resize', resize);
  resize();

  // ---- the shot: a drag anywhere, pulled back and let go ----

  /** The drag under way: where it began, on the screen and the ground, and the shot it makes now. */
  let drag: { id: number; px: [number, number]; ground: [number, number] | null; shot: Shot | null } | null = null;
  /** The point on the ground under a pointer, from where it is on the canvas. */
  const groundUnder = (e: PointerEvent) => {
    const r = canvas.getBoundingClientRect();
    return groundAt(cam, ((e.clientX - r.left) / r.width) * 2 - 1, 1 - ((e.clientY - r.top) / r.height) * 2, 0);
  };
  const shortSide = () => {
    const r = canvas.getBoundingClientRect();
    return Math.max(1, Math.min(r.width, r.height));
  };
  canvas.addEventListener('pointerdown', (e) => {
    if (drag || !e.isPrimary || e.button !== 0) return;
    canvas.setPointerCapture(e.pointerId);
    drag = { id: e.pointerId, px: [e.clientX, e.clientY], ground: groundUnder(e), shot: null };
  });
  canvas.addEventListener('pointermove', (e) => {
    if (!drag || e.pointerId !== drag.id) return;
    drag.shot = shotFromDrag(drag.px, [e.clientX, e.clientY], drag.ground, groundUnder(e), shortSide());
  });
  canvas.addEventListener('pointerup', (e) => {
    if (!drag || e.pointerId !== drag.id) return;
    const shot = shotFromDrag(drag.px, [e.clientX, e.clientY], drag.ground, groundUnder(e), shortSide());
    drag = null;
    if (shot) game.shoot(shot.angle, shot.power);
  });
  canvas.addEventListener('pointercancel', (e) => {
    if (drag && e.pointerId === drag.id) drag = null;
  });
  canvas.addEventListener(
    'wheel',
    (e) => {
      e.preventDefault();
      rig.zoom(e.deltaY * WHEEL);
    },
    { passive: false },
  );

  function upload() {
    scene.writeBall(world, game.ball);
    renderer.move(0, scene.ball, 1);
    // the aim shows only while a shot can be taken
    const dots = game.ready ? scene.writeAim(world.x[game.ball], world.y[game.ball], drag?.shot ?? null) : 0;
    renderer.move(1, scene.aim, dots);
    if (dots) renderer.tint(1, scene.aimLooks);
  }

  /** What a frame of the scene as it stands costs, drawn to a texture of our own rather than the canvas, so no wait to be shown is counted. */
  async function measureFrame(): Promise<number> {
    const target = ctx.device.createTexture({
      label: 'measuring target',
      size: [width, height],
      format: ctx.format,
      usage: GPUTextureUsage.RENDER_ATTACHMENT,
    });
    const view = target.createView();
    const cost = await frameCost(
      () => {
        upload();
        return renderer.frame(view, 'redraw', 1 / 60);
      },
      () => ctx.device.queue.onSubmittedWorkDone(),
    );
    target.destroy();
    return cost;
  }

  await renderer.ready;
  boot.classList.add('gone');
  strokesPanel.hidden = false;
  stats.hidden = false;
  help.hidden = false;
  showStrokes();

  // ---- each frame ----

  let frames = 0;
  let smoothed = 0;
  function simulate(dt: number) {
    frames++;
    game.step(dt);
    // the camera keeps game time, so a test stepping the game sees it follow the same way every run
    if (!parked) rig.follow(world.x[game.ball], world.y[game.ball], dt);
  }
  function draw(dt: number) {
    rig.place(cam);
    cam.update();
    upload();
    const t = performance.now();
    renderer.frame(ctx.context.getCurrentTexture().createView(), 'redraw', dt);
    smoothed += (performance.now() - t - smoothed) * 0.05;
    if (frames % 30 === 0) stats.textContent = `${smoothed.toFixed(1)} ms`;
  }

  // ---- the test API, and the frame loop ----

  // ?paused=1 starts the game stopped where it was built, so a test sees the
  // same course every run: no frame of its own has run, and every one after is
  // the test's, of a length it chose
  let paused = query.has('paused');
  let ready = false;
  let bootMs = 0;
  window.game = createApi({
    game,
    ready: () => ready,
    bootMs: () => bootMs,
    paused: () => paused,
    setPaused: (p) => {
      paused = p;
    },
    simulate,
    draw,
    frame: () => frames,
    look(x, y, distance) {
      parked = true;
      rig.jump(x, y);
      if (distance !== undefined) rig.zoom(distance - rig.distance);
    },
    follow() {
      parked = false;
    },
    project(x, y, z) {
      rig.place(cam);
      cam.update();
      const m = cam.viewProjection;
      const w = m[3] * x + m[7] * y + m[11] * z + m[15];
      const nx = (m[0] * x + m[4] * y + m[8] * z + m[12]) / w,
        ny = (m[1] * x + m[5] * y + m[9] * z + m[13]) / w;
      const r = canvas.getBoundingClientRect();
      return { x: r.left + ((nx + 1) / 2) * r.width, y: r.top + ((1 - ny) / 2) * r.height };
    },
    aiming: () => (game.ready && drag?.shot ? { ...drag.shot } : null),
    measureFrame,
    events: eventLog,
  });

  let last = performance.now();
  const frame = (now: number) => {
    requestAnimationFrame(frame);
    const dt = Math.min((now - last) / 1000, 1 / 20);
    last = now;
    if (paused) {
      draw(0);
      return;
    }
    simulate(dt);
    draw(dt);
  };
  ready = true;
  bootMs = performance.now();
  requestAnimationFrame(frame);
}
