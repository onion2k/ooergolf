/**
 * The page: the game drawn, and what the player does to it. Everything that
 * happens on the course happens in `game.ts`; this turns its events into
 * words on the screen, turns a drag into a shot through `shot.ts`, and draws
 * the frame, on the game path of artshape-render. There is no game logic
 * here.
 */
import { createContext } from 'artshape-render/gpu/context';
import { LightPool } from 'artshape-render/game/lights';
import { GameRenderer } from 'artshape-render/game/renderer';
import { HARDEST_SHOT } from './arena';
import { CameraRig } from './camera';
import { CLUBS } from './clubs';
import { createApi } from './debug';
import { frameCost } from './frame-cost';
import { Game, type GameEvents } from './game';
import { Hud } from './hud';
import { daylight } from './look';
import { Progress } from './progress';
import { seeded } from './random';
import { Scene, boxOf } from './scene';
import { Gesture } from './gesture';
import { Governor, RUNGS } from './quality';
import { groundAt } from './shot';

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
const stats = document.getElementById('stats')!;
const help = document.getElementById('help')!;

main().catch((err: unknown) => {
  bootMsg.textContent = err instanceof Error ? err.message : String(err);
  console.error(err);
});

async function main() {
  // ---- the renderer ----

  const ctx = await createContext(canvas);
  bootMsg.textContent = 'compiling shaders…';
  const renderer = new GameRenderer(ctx, LIGHT_CAPACITY, EFFECT_CAPACITY, PARTICLE_CAPACITY, MM_PER_UNIT);
  // the daylight look, the same one the models' showcase is drawn in
  daylight(renderer, ctx);
  renderer.camera.near = 2;
  renderer.camera.far = 800;

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
  // the game tells of its first hole as it is built, before it is here to be read: that one is shown once it is
  let game: Game | undefined = undefined;
  const hud = new Hud(
    {
      again: () => game?.newRound(),
      buy: (id) => game?.buy(id),
      equip: (id) => game?.equip(id),
    },
    CLUBS,
  );
  const showPurse = () => game && hud.setPurse(game.progress.save);
  const scene = new Scene();
  const rig = new CameraRig();
  /** What the player sees of each event, beside the note of it. */
  const shown: GameEvents = {
    // a hole begun: drawn afresh, the sun's shadow fitted to it, and the camera on its tee
    started(index, par) {
      if (!game) return;
      const { layout } = game;
      renderer.setStatic(scene.static(layout, game.course[index].name));
      renderer.setSunShadow(boxOf(layout));
      rig.jump(layout.tee.x, layout.tee.y);
      hud.started({ index, count: game.course.length, name: game.course[index].name, par });
    },
    struck: () => hud.setStrokes(game?.strokes ?? 0),
    holed: (strokes, par) => hud.done(strokes, par, false),
    pickedUp: (strokes, par) => hud.done(strokes, par, true),
    finished: () => game && hud.finished(game.course, game.card),
    paid: showPurse,
    bought: showPurse,
    equipped: showPurse,
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
  const played = new Game(progress, events, seed !== null ? { random: seeded(+seed) } : {});
  game = played;
  shown.started!(played.hole, played.def.par);
  showPurse();

  // ---- the scene and the camera ----

  // ?rung=N puts the picture on a rung of the quality ladder and holds it there; without it, the governor chooses
  const asked = query.get('rung');
  const governor = new Governor(asked !== null ? Math.max(0, Math.min(RUNGS.length - 1, +asked || 0)) : undefined);
  renderer.economy = governor.economy;

  renderer.setDynamic(scene.dynamic());
  renderer.setLights(new LightPool(LIGHT_CAPACITY));
  const cam = renderer.camera;
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

  // ---- the pointers: one pulled back and let go is a shot, two are a pinch ----

  const gesture = new Gesture({
    shortSide() {
      const r = canvas.getBoundingClientRect();
      return Math.max(1, Math.min(r.width, r.height));
    },
    ground(x, y) {
      const r = canvas.getBoundingClientRect();
      return groundAt(cam, ((x - r.left) / r.width) * 2 - 1, 1 - ((y - r.top) / r.height) * 2, 0);
    },
  });
  const act = (g: ReturnType<Gesture['up']>) => {
    if (g.kind === 'shoot') played.shoot(g.shot.angle, g.shot.power);
    else if (g.kind === 'zoom') rig.zoom(g.by);
  };
  canvas.addEventListener('pointerdown', (e) => {
    // the mouse's other buttons are not a shot
    if (e.pointerType === 'mouse' && e.button !== 0) return;
    canvas.setPointerCapture(e.pointerId);
    act(gesture.down(e.pointerId, e.clientX, e.clientY));
  });
  canvas.addEventListener('pointermove', (e) => act(gesture.move(e.pointerId, e.clientX, e.clientY)));
  canvas.addEventListener('pointerup', (e) => act(gesture.up(e.pointerId, e.clientX, e.clientY)));
  canvas.addEventListener('pointercancel', (e) => gesture.cancel(e.pointerId));
  canvas.addEventListener(
    'wheel',
    (e) => {
      e.preventDefault();
      rig.zoom(e.deltaY * WHEEL);
    },
    { passive: false },
  );

  function upload() {
    const { world, ball } = played;
    scene.writeBall(world, ball);
    // a ball gone into the cup is not drawn
    renderer.move(0, scene.ball, world.alive[ball] ? 1 : 0);
    // the aim shows only while a shot can be taken
    // a finer club's aim reaches further, as it strikes harder
    const reach = played.hardest / HARDEST_SHOT;
    const dots = played.ready ? scene.writeAim(world.x[ball], world.y[ball], gesture.aim, reach) : 0;
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
  hud.show();
  stats.hidden = false;
  help.hidden = false;

  // ---- each frame ----

  let frames = 0;
  let smoothed = 0;
  function simulate(dt: number) {
    frames++;
    played.step(dt);
    // the camera keeps game time, so a test stepping the game sees it follow the same way every run
    const { world, ball } = played;
    if (!parked && world.alive[ball]) rig.follow(world.x[ball], world.y[ball], dt);
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
    game: played,
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
    aiming: () => (played.ready && gesture.aim ? { ...gesture.aim } : null),
    view: () => ({ distance: rig.distance, rung: governor.rung, held: governor.held }),
    measureFrame,
    events: eventLog,
  });

  let last = performance.now();
  const frame = (now: number) => {
    requestAnimationFrame(frame);
    const gap = now - last;
    const dt = Math.min(gap / 1000, 1 / 20);
    last = now;
    if (paused) {
      draw(0);
      return;
    }
    // a slow machine steps the picture down: judged on the time between frames, which is what a player sees
    if (governor.frame(gap)) renderer.economy = governor.economy;
    simulate(dt);
    draw(dt);
  };
  ready = true;
  bootMs = performance.now();
  requestAnimationFrame(frame);
}
