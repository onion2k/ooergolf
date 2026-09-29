/**
 * The page: the game drawn, and what the player does to it. Everything that
 * happens on the course happens in `game.ts`; this turns its events into
 * words on the screen, turns a drag into a shot through `shot.ts`, and draws
 * the frame, on the game path of artshape-render. There is no game logic
 * here.
 */
import { createContext } from 'artshape-render/gpu/context';
import { LightPool } from 'artshape-render/game/lights';
import { GameRenderer, antialiasFor } from 'artshape-render/game/renderer';
import { BALL, HARDEST_SHOT, KIND_RADIUS, heightAt, onSand, rollsFor } from './arena';
import { CameraRig } from './camera';
import { CLUBS } from './clubs';
import { createApi } from './debug';
import { frameCost } from './frame-cost';
import { COURSES, CUP } from './course';
import { Game, type GameEvents } from './game';
import { Hud } from './hud';
import { daylight } from './look';
import { Progress } from './progress';
import { seeded } from './random';
import { roll } from './roll';
import { GRASS, fieldOf, windOf } from './turf';
import { Scene, boxOf } from './scene';
import { clearings } from './scenery';
import { cupBurst, splash, strikePuff } from './bursts';
import { Gesture } from './gesture';
import { SPARKLE, flash, glint } from './glints';
import { Squash, squashInto, squashOf } from './squash';
import { waggle } from './sway';
import { EFFECT_STRIDE } from 'artshape-render/game/renderer';
import { Governor, RUNGS } from './quality';
import { groundAt } from './shot';
import { between } from './frames';

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
  await daylight(renderer, ctx);
  // the particles' gravity, in world units a second squared: a real 9.8 m/s² here pulls confetti back into the cup
  // before it is out of it, so a lighter one, as Miner has, and the bursts' own gravity scales it
  renderer.gravity = 30;
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
  /** The course being played, and whether the start screen is up to choose one: it is, as the page opens. */
  let courseName = COURSES[0].name;
  let choosing = true;
  const summaries = COURSES.map((c) => ({
    name: c.name,
    holes: c.holes.length,
    par: c.holes.reduce((a, h) => a + h.par, 0),
  }));
  const hud = new Hud(
    {
      again: () => game?.newRound(),
      buy: (id) => game?.buy(id),
      equip: (id) => game?.equip(id),
      choose(name) {
        const course = COURSES.find((c) => c.name === name);
        if (!game || !course) return;
        // the course whose first hole is already set up behind the screen, untouched, is played as it stands; any
        // other, or one begun, starts a round afresh
        const fresh =
          game.course === course.holes &&
          game.phase === 'play' &&
          game.hole === 0 &&
          game.strokes === 0 &&
          !game.card.length;
        if (!fresh) game.playCourse(course.holes);
        courseName = name;
        choosing = false;
        hud.hideStart();
        showPurse();
      },
      courses() {
        choosing = true;
        hud.showStart(summaries);
      },
    },
    CLUBS,
  );
  const showPurse = () => game && hud.setPurse(game.progress.save);
  const scene = new Scene();
  const rig = new CameraRig();
  /** The ball squashed by its last knock, until it springs back. */
  const squash = new Squash();
  /**
   * What the last frame drew of what answers, read back from what was placed,
   * for the test API: the ball's squash, the nearest aim dot's swell, and how
   * many glints of the gold were lit, and how many sparkles of the water, and
   * what the last stroke threw up.
   */
  const drawn = { squash: 0, pulse: 0, glints: 0, sparkles: 0, puff: null as 'sand' | 'grass' | null };
  /** Whether the camera has been put on a hole yet: the first has nowhere to glide from. */
  let looked = false;
  /** The grass of the hole being grown, which the first frame waits for so it is never drawn bare. */
  let grown: Promise<void> = Promise.resolve();
  /** What the player sees of each event, beside the note of it. */
  const shown: GameEvents = {
    // a hole begun: drawn afresh, the sun's shadow fitted to it, and the camera on its tee
    started(index, par) {
      if (!game) return;
      const { layout } = game;
      const { name } = game.course[index];
      // the hole's own wind, which the grass bends in and the flag and the trees follow
      const wind = windOf(name);
      renderer.setStatic(scene.static(layout, name, game.obstacles));
      renderer.setDynamic(scene.dynamic(game.obstacles, layout, name, wind));
      // the hole's rough, round the painted green
      grown = renderer.setGrass(fieldOf(layout, name, clearings(layout, name)), GRASS);
      renderer.wind = wind;
      renderer.setSunShadow(boxOf(layout));
      // the camera glides to the tee from wherever it was looking, but for the first hole, with nowhere it was; and the
      // ball on the tee is round
      const teeZ = heightAt(layout, layout.tee.x, layout.tee.y);
      if (looked) rig.glide(layout.tee.x, layout.tee.y, teeZ, game.t);
      else rig.jump(layout.tee.x, layout.tee.y, teeZ);
      looked = true;
      squash.clear();
      hud.started({ index, count: game.course.length, name: game.course[index].name, par });
    },
    struck(power, x, y) {
      hud.setStrokes(game?.strokes ?? 0);
      // sand from a ball that lay in a bunker, and grass from any other
      const ground = game && onSand(game.layout, x, y) ? 'sand' : 'grass';
      drawn.puff = ground;
      for (const e of strikePuff(x, y, power, ground)) renderer.emit(e);
    },
    // knocked off the rail, a post or the ground it dropped onto: squashed along it, and sprung back
    knocked(hard, _x, _y, dx, dy, dz) {
      if (game) squash.knock(game.t, hard, dx, dy, dz);
    },
    // into the water: a splash where it went in, and a word, and the stroke it cost; the ball put back is round
    splash(x, y) {
      hud.setStrokes(game?.strokes ?? 0);
      hud.splash();
      squash.clear();
      // a splash up, and a ring spreading over the water from where it went in
      if (game) scene.splashedAt(x, y, game.t);
      for (const e of splash(x, y)) renderer.emit(e);
    },
    // in the cup: confetti out of it, the flag waggling and its gold flashing, from the moment it dropped
    holed(strokes, par) {
      hud.done(strokes, par, false);
      if (!game) return;
      scene.holedAt = game.t;
      for (const e of cupBurst(game.layout.cup.x, game.layout.cup.y, strokes === 1)) renderer.emit(e);
    },
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
    // onto the ground at the height of the ground under the ball, where the drag is made
    ground(x, y) {
      const r = canvas.getBoundingClientRect();
      const g = heightAt(played.layout, played.world.x[played.ball], played.world.y[played.ball]);
      return groundAt(cam, ((x - r.left) / r.width) * 2 - 1, 1 - ((y - r.top) / r.height) * 2, g);
    },
  });
  const act = (g: ReturnType<Gesture['up']>) => {
    // nothing is struck through the start screen
    if (choosing) return;
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
    // squashed by its last knock, until it springs back
    const n = squash.along;
    squashInto(scene.ball, 0, squash.amount(played.t), n[0], n[1], n[2], KIND_RADIUS[BALL]);
    // a ball gone into the cup is not drawn
    renderer.move(0, scene.ball, world.alive[ball] ? 1 : 0);
    drawn.squash = world.alive[ball] ? squashOf(scene.ball, 0, n[0], n[1], n[2]) : 0;
    // the aim shows only while a shot can be taken
    // a finer club's aim reaches further, as far again as its hardest shot rolls
    const reach = rollsFor(played.hardest) / rollsFor(HARDEST_SHOT);
    const dots = played.ready ? scene.writeAim(world.x[ball], world.y[ball], gesture.aim, reach, played.t) : 0;
    renderer.move(1, scene.aim, dots);
    // the nearest dot's size, as it was placed: nought for none
    drawn.pulse = dots ? scene.aim[0] - 1 : 0;
    if (dots) renderer.tint(1, scene.aimLooks);
    scene.writeMoving(played.t).forEach((m, k) => {
      renderer.move(2 + k, m.matrices, m.count);
      // what is coloured by game time, as the rings on the water fade, has its colours written again each frame
      if (m.looks) renderer.tint(2 + k, m.looks);
    });
    // the grass's wind and its track keep game time, as everything else that moves does
    renderer.time = played.t;
    shine();
  }

  /** The gold that glints: round the cup's rim, and the knob on the pin. */
  const glinting = (): [number, number, number][] => {
    const { cup } = played.layout;
    const rim = CUP.radius + 0.15;
    // on the ground the cup is cut in, however high that stands, and all round its rim where it slopes
    const on = (x: number, y: number) => heightAt(played.layout, x, y);
    return [
      ...[0.3, 1.9, 3.4, 4.9].map((a): [number, number, number] => {
        const x = cup.x + Math.cos(a) * rim,
          y = cup.y + Math.sin(a) * rim;
        return [x, y, on(x, y) + 0.1];
      }),
      [cup.x, cup.y, on(cup.x, cup.y) + 8.75],
    ];
  };
  /** Room for a glint at every place the gold is, which a flash lights all at once, and the sparkles of the water after them. */
  const glintQuad = new Float32Array(EFFECT_STRIDE * EFFECT_CAPACITY);
  /** Where the water's sparkles are this frame, four numbers each: written into, never made. */
  const sparkQuads = new Float32Array(SPARKLE.most * 4);
  /** How a glow looks: its half size on the screen, how bright at most, its colour, and how hard its edge falls off. */
  interface Glow {
    size: number;
    power: number;
    colour: [number, number, number];
    falloff: number;
  }
  /** The gold's: big, warm and star-shaped. The sun on the water is small, cool and sharp, and there are several at once. */
  const GOLD: Glow = { size: 0.07, power: 3.5, colour: [1, 0.93, 0.7], falloff: 2.2 };
  const SUN: Glow = { size: 0.028, power: 3.2, colour: [0.85, 0.96, 1], falloff: 3 };
  /** A glow, `brightness` from 0 to 1, at quad `k`, where (x, y, z) is on the screen. */
  function glow(k: number, x: number, y: number, z: number, brightness: number, look: Glow = GOLD) {
    const m = cam.viewProjection;
    const w = m[3] * x + m[7] * y + m[11] * z + m[15];
    const o = k * EFFECT_STRIDE;
    glintQuad[o] = (m[0] * x + m[4] * y + m[8] * z + m[12]) / w;
    glintQuad[o + 1] = (m[1] * x + m[5] * y + m[9] * z + m[13]) / w;
    glintQuad[o + 2] = look.size * brightness;
    glintQuad[o + 3] = look.power * brightness;
    glintQuad[o + 4] = look.colour[0];
    glintQuad[o + 5] = look.colour[1];
    glintQuad[o + 6] = look.colour[2];
    glintQuad[o + 7] = look.falloff;
  }
  /** The gold's glow this frame into the first quads: how many. The glint of the moment; or all of them, as a ball drops. */
  function gold(): number {
    const places = glinting();
    const lit = flash(played.t - scene.holedAt);
    if (lit > 0) {
      const count = Math.min(places.length, EFFECT_CAPACITY);
      for (let k = 0; k < count; k++) glow(k, places[k][0], places[k][1], places[k][2], lit);
      return count;
    }
    const g = glint(played.t, places.length);
    if (g.brightness <= 0) return 0;
    const [x, y, z] = places[g.at];
    glow(0, x, y, z, g.brightness);
    return 1;
  }
  /** The glows of the frame: the gold's, and after them, in what room is left, the sparkles of sun on the water. */
  function shine() {
    let used = (drawn.glints = gold());
    const sparks = scene.sparkleInto(played.t, sparkQuads);
    let lit = 0;
    for (; lit < sparks && used < EFFECT_CAPACITY; lit++)
      glow(used++, sparkQuads[lit * 4], sparkQuads[lit * 4 + 1], sparkQuads[lit * 4 + 2], sparkQuads[lit * 4 + 3], SUN);
    drawn.sparkles = lit;
    renderer.setEffects(glintQuad, used);
  }

  /** What a frame of the scene as it stands costs, drawn to a texture of our own rather than the canvas, so no wait to be shown is counted. */
  async function measureFrame(warmup?: number): Promise<number> {
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
      warmup,
    );
    target.destroy();
    return cost;
  }

  await renderer.ready;
  await grown;
  boot.classList.add('gone');
  // the start screen over the first hole of the first course, until a course is chosen
  hud.showStart(summaries);
  stats.hidden = false;

  // ---- each frame ----

  let frames = 0;
  let smoothed = 0;
  function simulate(dt: number) {
    frames++;
    played.step(dt);
    const { world, ball } = played;
    if (!world.alive[ball]) return;
    // the ball seen to roll, as far as it went this frame
    roll(scene.ballTurn, world.vx[ball], world.vy[ball], KIND_RADIUS[BALL], dt);
    // the camera keeps game time, so a test stepping the game sees it follow the same way every run
    if (!parked) rig.follow(world.x[ball], world.y[ball], dt, heightAt(played.layout, world.x[ball], world.y[ball]));
  }
  /** The frame drawn, and when it was begun, for the governor to measure the drawing against. */
  function draw(dt: number): number {
    rig.place(cam, played.t);
    cam.update();
    upload();
    const t = performance.now();
    renderer.frame(ctx.context.getCurrentTexture().createView(), 'redraw', dt);
    smoothed += (performance.now() - t - smoothed) * 0.05;
    if (frames % 30 === 0) stats.textContent = `${smoothed.toFixed(1)} ms`;
    return t;
  }

  /**
   * How long a frame took to draw and have the GPU finish, in milliseconds, as last measured: from the moment its
   * drawing began to the moment the queue reported it done. The governor tells a slow machine from a slow screen by
   * it. Measured on one frame in `PROBE`, one at a time, so it costs a promise every few frames and never a stall.
   */
  let worked = 0;
  let probing = false;
  const PROBE = 4;
  function probe(began: number) {
    if (probing || frames % PROBE !== 0) return;
    probing = true;
    void ctx.device.queue.onSubmittedWorkDone().then(() => {
      worked = performance.now() - began;
      probing = false;
    });
  }
  /** A frame `gap` after the last that took `work` to draw, given to the governor; the picture stepped down if it says so. */
  function judge(gap: number, work: number): number {
    if (governor.frame(gap, work)) renderer.economy = governor.economy;
    return governor.rung;
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
      rig.jump(x, y, heightAt(played.layout, x, y));
      if (distance !== undefined) rig.zoom(distance - rig.distance);
    },
    follow() {
      parked = false;
    },
    project(x, y, z) {
      rig.place(cam, played.t);
      cam.update();
      const m = cam.viewProjection;
      const w = m[3] * x + m[7] * y + m[11] * z + m[15];
      const nx = (m[0] * x + m[4] * y + m[8] * z + m[12]) / w,
        ny = (m[1] * x + m[5] * y + m[9] * z + m[13]) / w;
      const r = canvas.getBoundingClientRect();
      return { x: r.left + ((nx + 1) / 2) * r.width, y: r.top + ((1 - ny) / 2) * r.height };
    },
    aiming: () => (played.ready && gesture.aim ? { ...gesture.aim } : null),
    view: () => ({
      distance: rig.distance,
      rung: governor.rung,
      held: governor.held,
      antialias: antialiasFor(renderer.look, renderer.economy),
      swaying: renderer.economy.wind !== false,
    }),
    measureFrame,
    judge,
    motions: () => ({
      squash: drawn.squash,
      waggle: waggle(played.t - scene.holedAt),
      flash: flash(played.t - scene.holedAt),
      glints: drawn.glints,
      glide: rig.gliding(played.t),
      pulse: drawn.pulse,
      sparkles: drawn.sparkles,
      // read back from the quads the frame wrote, which come after the gold's
      sparklesAt: Array.from({ length: drawn.sparkles }, (_, k) => {
        const o = (drawn.glints + k) * EFFECT_STRIDE;
        const r = canvas.getBoundingClientRect();
        return { x: r.left + ((glintQuad[o] + 1) / 2) * r.width, y: r.top + ((1 - glintQuad[o + 1]) / 2) * r.height };
      }),
      splash: scene.splashReach(played.t),
      puff: drawn.puff,
    }),
    course: () => courseName,
    choosing: () => choosing,
    chooseCourse: (name) => {
      const card = Array.from(document.querySelectorAll<HTMLButtonElement>('#start .course')).find((b) =>
        b.textContent.startsWith(name),
      );
      if (!card) throw new Error(`no course called ${name} on the start screen`);
      card.click();
    },
    async grass() {
      await grown;
      const drawn = await renderer.grassDrawn();
      const { direction, strength } = renderer.wind;
      return { ...drawn, wind: { direction: [direction[0], direction[1]], strength } };
    },
    async bladesAround(x, y, radius) {
      await grown;
      const { near, far } = await renderer.grassBlades();
      let n = 0;
      for (const b of [...near, ...far]) if (Math.hypot(b.x - x, b.y - y) <= radius) n++;
      return n;
    },
    events: eventLog,
  });

  let last = performance.now();
  const frame = (now: number) => {
    requestAnimationFrame(frame);
    // never back, however early the browser stamps the first frame, and never a leap after the page was away
    const { gap, dt } = between(now, last);
    last = now;
    if (paused) {
      draw(0);
      return;
    }
    // a slow machine steps the picture down: judged on the time between frames, which is what a player sees, and on how
    // much of it the drawing takes, so a screen that is only slow to deliver frames does not lose the grass
    judge(gap, worked);
    simulate(dt);
    probe(draw(dt));
  };
  ready = true;
  bootMs = performance.now();
  requestAnimationFrame(frame);
}
