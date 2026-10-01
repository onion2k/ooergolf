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
import { BALL, HARDEST_SHOT, KIND_RADIUS, heightAt, lieAt, onSand, rollsFor } from './arena';
import { BAG, PUTTER, carryOf } from './bag';
import { aimView, markScale } from './aimview';
import { CameraRig, LEAD, TILT, VIEW, catchUp, facing, tallOf } from './camera';
import { CLUBS } from './clubs';
import { createApi } from './debug';
import { frameCost } from './frame-cost';
import { COURSES, CUP } from './course';
import { Game, type GameEvents } from './game';
import { Hud } from './hud';
import { mapInto, mapSize, paintMap, type MapSize } from './holemap';
import { Previewer, type Preview } from './preview';
import { breakOf, leansOnMinigolf } from './green';
import { greensText, landingText, pinReadout, pinText, puttText, windArrow } from './readout';
import { LIE } from './surfaces';
import { windReach } from './shaping';
import { daylight } from './look';
import { Progress } from './progress';
import { seeded } from './random';
import { roll } from './roll';
import { fieldOf, flattenFor, grassOptionsOf, windOf } from './turf';
import { AIM_REACH, Scene, boxOf } from './scene';
import { carryFrom } from './flight';
import { clearings } from './scenery';
import { cupBurst, splash, strikePuff } from './bursts';
import { Input } from './input';
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
/** How much further than its formula a club comes down on the level, measured: a driver 249 against 240. */
const LANDS_PAST = 1.045;

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
  // what the start screen says of each course, which is known without making a course that is made when it is chosen
  const summaries = COURSES.map((c) => ({ name: c.name, ...c.summary, golf: c.golf }));
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
      // the switch: what a drag on the course is from now on
      mode(mode) {
        input.setMode(mode);
        hud.setMode(mode);
      },
      // the flag: the camera turned to face the cup
      flag() {
        faceFlag();
      },
      // a club of the bag chosen on a golf hole
      club(id) {
        if (game?.pick(id)) {
          hud.setClub(id);
          aimFor(false);
        }
      },
      // the shape and the spin chosen for the next lofted shot: the game takes it, and the buttons show what it took
      shape(value) {
        game?.setShape(value);
        if (game) hud.setShaping(game.shape, game.spin);
      },
      spin(value) {
        game?.setSpin(value);
        if (game) hud.setShaping(game.shape, game.spin);
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
  const drawn = {
    squash: 0,
    pulse: 0,
    glints: 0,
    sparkles: 0,
    puff: null as 'sand' | 'grass' | null,
    // the grass pressed flat this frame round a ball lying in the rough, as it was asked of the renderer
    press: null as { x: number; y: number; radius: number } | null,
    // whether the renderer took it: it does not where the field has no trample, or off it
    took: false,
  };
  /** The disc of grass pressed round a ball at rest in the rough, written each frame: nothing is made. */
  const flatten = { x: 0, y: 0, radius: 0 };
  /** Whether the camera has been put on a hole yet: the first has nowhere to glide from. */
  let looked = false;
  /** The grass of the hole being grown, which the first frame waits for so it is never drawn bare. */
  let grown: Promise<void> = Promise.resolve();
  /** The screen's shape, which how far back the camera stands depends on: kept from the camera's own, which is made after the first hole. */
  let aspect = 1.6;
  /** The club and the lie the camera was last sent to look at a shot from, so it is sent again only when one changes. */
  let aimedFor = '';
  /** The previews of this golf hole's shots, worked out in a rehearsal of it: none on a hole of minigolf. */
  let previewer: Previewer | null = null;
  /** Whether the hole being played is a hole of minigolf whose ground leans, which shows its break as golf's green does: the arrows, the putt's roll and the break in words. */
  let leans = false;
  /** The shot the preview was last worked out for, so it is worked out again only when the aim, the club or the ball changes; and whether one is shown. */
  const previewed = { x: NaN, y: NaN, angle: NaN, power: NaN, club: '', shape: NaN, spin: NaN };
  let previewShown = false;
  /** The wind of the hole being played, read once as it begins: which way it blows across the ground and how hard in miles an hour. */
  const windNow = { x: 0, y: 0, speed: 0 };
  /** The camera's turn as the wind's arrow is worked out from it, written into each frame and never made. */
  const turnNow = { azimuth: 0, tilt: 0 };
  /** The hole's map as it was painted, and whether it was for a phone's box: painted again if the screen changes to the other. */
  let mapped: { size: MapSize; small: boolean } | null = null;
  /** Where the ball was when the pin was last read, so it is read again only when it has moved. */
  const pinned = { x: NaN, y: NaN };
  /** The preview the scene was last handed, a flight or a putt's roll, which the test API reads back with what was drawn of it. */
  let shownPreview: Preview | null = null;
  /** Where the ball was when the putt's break was last read, so a loop of a hundred and more steps is run once for a ball at rest and never in a frame. */
  const putted = { x: NaN, y: NaN };
  /** The camera's four corners on the ground, made once, and the ground a point of the map is worked out from. */
  const corners: [number, number][] = [
    [0, 0],
    [0, 0],
    [0, 0],
    [0, 0],
  ];
  /**
   * The camera sent to the view that shows where the club in hand comes down from the lie the ball is on, at the pace
   * of an ease, or at once for the very first view. A drive is about a quarter of a hole, and from the home view the top of the
   * screen is sixty yards off: the landing is what a shot is aimed by. Never worked out from a drag, which would move the
   * ground under the finger.
   */
  const aimFor = (now: boolean) => {
    if (!game?.layout.golf) return;
    const { world, ball, layout, inHand } = game;
    const lie = lieAt(layout, world.x[ball], world.y[ball]);
    // a club goes a little further than its formula, four in a hundred on the level: the landing it is to show
    // and as much further as a tailwind of the hole carries it, so the ring of a downwind shot is on the screen too
    const reach = carryFrom(inHand, 1, lie) * LANDS_PAST + (inHand.loft > 0 ? windReach(inHand, 1, windNow.speed) : 0);
    aimedFor = `${inHand.id}|${lie}`;
    rig.aimAt(aimView(reach, aspect), now);
  };
  /** The hole's map painted for the screen it is on, or put away for a hole that is not golf. */
  const paintHoleMap = () => {
    if (!game?.layout.golf) {
      mapped = null;
      hud.setMap(null);
      return;
    }
    const small = innerWidth <= 600;
    const size = mapSize(game.layout, small ? 64 : 100, small ? 150 : 230);
    const pixels = new Uint8ClampedArray(size.width * size.height * 4);
    paintMap(game.layout, size, pixels);
    mapped = { size, small };
    mapInto(size, game.layout.cup.x, game.layout.cup.y, hud.overlay.cup);
    hud.setMap({ width: size.width, height: size.height, pixels });
  };
  /** What a new hole puts back: a drag a shot again, and the switch showing it. Set once the input exists, which is after the first hole. */
  let backToAim: (() => void) | null = null;
  /** What the player sees of each event, beside the note of it. */
  const shown: GameEvents = {
    // a hole begun: drawn afresh, the sun's shadow fitted to it, and the camera on its tee
    started(index, par) {
      if (!game) return;
      const { layout } = game;
      const { name } = game.course[index];
      // the hole's wind, for the line under the pin and for how far the camera must stand back for a tailwind
      const blowing = game.wind;
      windNow.x = blowing.x;
      windNow.y = blowing.y;
      windNow.speed = layout.golf ? blowing.speed : 0;
      // the hole's own wind, which the grass bends in and the flag and the trees follow
      const wind = windOf(name);
      renderer.setStatic(scene.static(layout, name, game.obstacles));
      renderer.setDynamic(scene.dynamic(game.obstacles, layout, name, wind));
      // the hole's rough, round the painted green
      grown = renderer.setGrass(fieldOf(layout, name, clearings(layout, name)), grassOptionsOf(layout));
      // nothing is pressed on a new hole: the grass stands as it was grown
      renderer.clearPresses();
      renderer.wind = wind;
      renderer.setSunShadow(boxOf(layout));
      // the camera glides to the tee from wherever it was looking, but for the first hole, with nowhere it was; and the
      // ball on the tee is round
      const teeZ = heightAt(layout, layout.tee.x, layout.tee.y);
      if (looked) rig.glide(layout.tee.x, layout.tee.y, teeZ, game.t);
      else rig.jump(layout.tee.x, layout.tee.y, teeZ);
      // a golf hole lets the camera stand back as far as a drive needs, and begins looking at the tee shot from there;
      // a hole of minigolf has its limits and its home view as it always had
      rig.setGolf(layout.golf);
      aimedFor = '';
      if (layout.golf) aimFor(!looked);
      looked = true;
      // the preview of this hole's shots is worked out in a rehearsal of it, made once here and let go with the hole
      leans = leansOnMinigolf(layout);
      previewer = layout.golf || leans ? new Previewer(game) : null;
      previewed.club = '';
      previewShown = false;
      shownPreview = null;
      scene.setShot(null);
      hud.setLanding(null);
      paintHoleMap();
      // the pin is read off the ball from the first frame of a golf hole, and is not there on a hole of minigolf
      pinned.x = NaN;
      if (!layout.golf) hud.setPin(null);
      // the wind is told on a golf hole, as a number or as calm, and is not there on a hole of minigolf
      hud.setWind(layout.golf ? windNow.speed : null);
      // the greens' speed is told on a hole that has set one (The Links), and the putt's break when the ball rests on its green
      hud.setGreens(layout.golf ? greensText(game.def.greens) : null);
      hud.setPutt(null);
      putted.x = NaN;
      scene.setArrows(false);
      hud.setShaping(game.shape, game.spin);
      // a hole is begun aiming, and the view eases home to the tee's over the glide
      backToAim?.();
      squash.clear();
      hud.started({ index, count: game.course.length, name: game.course[index].name, par });
      // the bag on a golf hole, with the driver in hand, and none on a hole of minigolf
      hud.setBag(
        layout.golf
          ? BAG.map((c) => ({ id: c.id, name: c.name, label: c.label, carry: carryOf(c, 1), loft: c.loft }))
          : null,
        game.inHand.id,
      );
    },
    struck(power, x, y) {
      hud.setStrokes(game?.strokes ?? 0);
      // the game puts the shape and the spin back to straight and flat as a shot is struck, and the buttons say so
      if (game) hud.setShaping(game.shape, game.spin);
      // sand from a ball that lay in a bunker, and grass from any other
      const ground = game && onSand(game.layout, x, y) ? 'sand' : 'grass';
      drawn.puff = ground;
      for (const e of strikePuff(x, y, power, ground)) renderer.emit(e);
    },
    // a lofted ball come down: the first landing is marked, and throws up the ground it came down on
    landed(x, y, speed, first) {
      if (!game || !first) return;
      scene.landedAt(x, y, game.t);
      const ground = onSand(game.layout, x, y) ? 'sand' : 'grass';
      for (const e of strikePuff(x, y, Math.min(1, speed / 60), ground)) renderer.emit(e);
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
    // out of bounds: a word for it, and the stroke it cost; the ball put back is round
    outOfBounds() {
      hud.setStrokes(game?.strokes ?? 0);
      hud.outOfBounds();
      squash.clear();
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
    cam.aspect = aspect = width / height;
    // a screen of another shape stands the camera at another distance: the view is worked out again
    aimedFor = '';
    if (mapped && mapped.small !== innerWidth <= 600) paintHoleMap();
    renderer.resize(width, height);
  };
  addEventListener('resize', resize);
  resize();

  // ---- the pointers: one pulled back and let go is a shot, two are a pinch ----

  const input = new Input({
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
    shoot: (angle, power) => played.shoot(angle, power),
    zoom: (by) => rig.zoom(by),
    orbit: (turn, tilt) => rig.orbit(turn, tilt),
    // nothing is struck through the start screen
    blocked: () => choosing,
  });
  backToAim = () => {
    input.setMode('aim');
    hud.setMode('aim');
  };
  /**
   * The camera turned to face the cup from the ball, the short way and eased, in either mode and on any hole; whether it
   * was. Not under the start screen, and not while a drag is held, since the aim is the ground under the finger through the
   * camera and a camera turning under it would turn the shot; and not when the ball is at the cup, where there is no way to face.
   */
  const faceFlag = (): boolean => {
    if (choosing || input.aim) return false;
    const to = facing({ x: played.world.x[played.ball], y: played.world.y[played.ball] }, played.layout.cup);
    if (to === null) return false;
    rig.turnTo(to);
    return true;
  };
  canvas.addEventListener('pointerdown', (e) => {
    // the mouse's other buttons are not a shot
    if (e.pointerType === 'mouse' && e.button !== 0) return;
    canvas.setPointerCapture(e.pointerId);
    input.down(e.pointerId, e.clientX, e.clientY);
  });
  canvas.addEventListener('pointermove', (e) => input.move(e.pointerId, e.clientX, e.clientY));
  canvas.addEventListener('pointerup', (e) => input.up(e.pointerId, e.clientX, e.clientY));
  canvas.addEventListener('pointercancel', (e) => input.cancel(e.pointerId));
  canvas.addEventListener(
    'wheel',
    (e) => {
      e.preventDefault();
      rig.zoom(e.deltaY * WHEEL);
    },
    { passive: false },
  );

  /**
   * What a golf hole shows of the shot in hand and of where the ball is: the flight drawn, and said in words, when a
   * lofted shot is being aimed, worked out again only when the aim, the club or the ball has changed; the pin read off
   * the ball when it lies at rest; and the map redrawn with the ball, the aim and what the camera shows over it.
   */
  function aimOnGolf(
    flying: { angle: number; power: number } | null,
    rolling: { angle: number; power: number } | null,
  ) {
    const { world, ball, layout, inHand, shape, spin } = played;
    const x = world.x[ball],
      y = world.y[ball];
    // a ball at rest in the rough is seen, and not lost among the blades: the grass is pressed flat in a disc round it, every
    // frame it lies there (the press stands again a few seconds after, so it holds for as long as the ball is there and goes
    // when it is struck)
    const flat = flattenFor(layout, x, y, played.ready, flatten);
    // pressed at the game's time as it is now, which the grass reads the press's age from, and not the last frame's
    renderer.time = played.t;
    drawn.took = flat ? renderer.press(flat.x, flat.y, flat.radius, windNow.x, windNow.y) : false;
    drawn.press = flat;
    // a lofted shot is drawn as its flight and a putt, on a hole whose greens are set, as its roll: the same marks, the one
    // worked out in the air and the other along the ground
    const aimed = flying ?? rolling;
    if (aimed && previewer) {
      if (
        previewed.x !== x ||
        previewed.y !== y ||
        previewed.angle !== aimed.angle ||
        previewed.power !== aimed.power ||
        previewed.club !== inHand.id ||
        previewed.shape !== shape ||
        previewed.spin !== spin
      ) {
        Object.assign(previewed, { x, y, angle: aimed.angle, power: aimed.power, club: inHand.id, shape, spin });
        if (flying) {
          const p = previewer.run({ x, y }, inHand, flying.angle, flying.power, shape, spin);
          hud.setLanding(
            p.n ? landingText({ carry: p.carry, end: p.end, lie: p.lie, hit: p.hit !== null, shape, spin }) : null,
          );
        } else previewer.roll({ x, y }, inHand, aimed.angle, aimed.power);
      }
      const r = Math.min(rig.distance * tallOf(aspect), VIEW.golfFar);
      shownPreview = flying ? previewer.result : previewer.rolled;
      scene.setShot(shownPreview, markScale(r));
      previewShown = true;
    } else if (previewShown) {
      shownPreview = null;
      scene.setShot(null);
      hud.setLanding(null);
      previewed.club = '';
      previewShown = false;
    }
    // the pin from where the ball lies at rest, read again only when it has moved
    if (played.ready && (pinned.x !== x || pinned.y !== y)) {
      pinned.x = x;
      pinned.y = y;
      hud.setPin(pinText(pinReadout(layout, x, y)));
    }
    // the green's arrows are shown, and the putt's break said, while the ball rests on the putting green or the first cut of a
    // hole being played; the break is worked out when the ball comes to rest and never again for it
    const lie = lieAt(layout, x, y);
    const resting = played.ready && played.phase === 'play' && (lie === LIE.green || lie === LIE.cut);
    scene.setArrows(resting);
    if (resting && played.def.greens !== undefined) {
      if (putted.x !== x || putted.y !== y) {
        putted.x = x;
        putted.y = y;
        hud.setPutt(puttText(breakOf(layout, x, y, played.def.greens)));
      }
    } else if (!Number.isNaN(putted.x)) {
      putted.x = NaN;
      hud.setPutt(null);
    }
    if (!mapped) return;
    const o = hud.overlay;
    const { size } = mapped;
    mapInto(size, x, y, o.ball);
    o.aim = false;
    o.spread = false;
    if (previewShown && previewer && previewer.result.n > 1 && flying) {
      const p = previewer.result;
      o.aim = true;
      mapInto(size, p.x, p.y, o.to);
      o.ring = p.end === 'water' ? 1 : p.end === 'out' ? 2 : p.end === 'holed' ? 3 : 0;
      const { across, along } = p.footprint;
      if (p.end !== 'holed' && p.end !== 'water' && (across >= 0.4 || along >= 0.4)) {
        o.spread = true;
        // laid along the way the ball went, which a shape and the wind turn from the way it was aimed
        mapInto(size, p.x - Math.cos(p.heading) * along, p.y - Math.sin(p.heading) * along, o.ellipse);
        o.ellipse[2] = along * size.scale;
        o.ellipse[3] = across * size.scale;
        // the map has north up, which turns the heading the other way
        o.ellipse[4] = -p.heading;
      }
    }
    // what the camera shows, from the four corners of the screen on the ground at the ball's height; none if any is sky
    const z = heightAt(layout, x, y);
    let sky = false;
    for (let k = 0; k < 4; k++) {
      const c = groundAt(cam, k === 0 || k === 3 ? -1 : 1, k < 2 ? -1 : 1, z, corners[k]);
      if (!c) {
        sky = true;
        break;
      }
      mapInto(size, c[0], c[1], corners[k]);
      o.corners[k * 2] = corners[k][0];
      o.corners[k * 2 + 1] = corners[k][1];
    }
    o.view = !sky;
    hud.drawMap();
  }

  /**
   * What a hole of minigolf whose ground leans shows of the putt: the roll the drag would make, drawn along the ground as
   * golf's putt is, worked out again only when the aim or the ball changes; and, while the ball rests, the arrows over the
   * floor and the break in words, worked out once for the ball where it lies. Nothing of the golf the rest of the page shows.
   */
  function aimOnSlope(aimed: { angle: number; power: number } | null) {
    const { world, ball, layout } = played;
    const x = world.x[ball],
      y = world.y[ball];
    if (aimed && previewer) {
      if (
        previewed.x !== x ||
        previewed.y !== y ||
        previewed.angle !== aimed.angle ||
        previewed.power !== aimed.power
      ) {
        Object.assign(previewed, { x, y, angle: aimed.angle, power: aimed.power, club: PUTTER.id });
        previewer.roll({ x, y }, PUTTER, aimed.angle, aimed.power);
      }
      shownPreview = previewer.rolled;
      scene.setShot(shownPreview, markScale(Math.min(rig.distance * tallOf(aspect), VIEW.golfFar)));
      previewShown = true;
    } else if (previewShown) {
      shownPreview = null;
      scene.setShot(null);
      previewed.club = '';
      previewShown = false;
    }
    const resting = played.ready && played.phase === 'play';
    scene.setArrows(resting);
    if (resting) {
      if (putted.x !== x || putted.y !== y) {
        putted.x = x;
        putted.y = y;
        hud.setPutt(puttText(breakOf(layout, x, y)));
      }
    } else if (!Number.isNaN(putted.x)) {
      putted.x = NaN;
      hud.setPutt(null);
    }
  }

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
    // a finer club's aim reaches further, as far again as its hardest shot rolls; and a golf club's as far as it carries
    const golf = played.layout.golf;
    // a lofted shot is aimed by its flight, worked out in a rehearsal and drawn as an arc to the ring it comes down in;
    // a putt, on a golf hole or a hole of minigolf, is aimed by its dots as it always was
    const flying = golf && previewer !== null && played.ready && played.inHand.loft > 0 ? input.aim : null;
    const reach = golf
      ? carryFrom(played.inHand, 1, lieAt(played.layout, world.x[ball], world.y[ball])) / AIM_REACH
      : rollsFor(played.hardest) / rollsFor(HARDEST_SHOT);
    // and a putt on a hole whose greens are set is drawn as its roll as well, so the break is seen as a curve across the green
    const rolling =
      golf && previewer !== null && played.ready && played.inHand.loft === 0 && played.def.greens !== undefined
        ? input.aim
        : null;
    const dots = played.ready && !flying ? scene.writeAim(world.x[ball], world.y[ball], input.aim, reach, played.t) : 0;
    if (leans) aimOnSlope(played.ready ? input.aim : null);
    if (golf) {
      aimOnGolf(flying, rolling);
      // the shape and the spin the game holds, shown on their buttons whoever chose them; and the wind's arrow turned by
      // the camera as it is this frame, which includes the glide to a new tee
      hud.setShaping(played.shape, played.spin);
      if (windNow.speed >= 0.5) hud.setWindArrow(windArrow(windNow.x, windNow.y, rig.view(played.t, turnNow).azimuth));
    }
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
    // the camera sent to see the next shot's landing from: when the ball is ready, and the club or the lie has changed
    if (played.layout.golf) {
      if (!played.ready) aimedFor = '';
      else if (
        aimedFor !==
        `${played.inHand.id}|${lieAt(played.layout, played.world.x[played.ball], played.world.y[played.ball])}`
      )
        aimFor(false);
    }
    rig.settle(dt);
    const { world, ball } = played;
    if (!world.alive[ball]) return;
    // the ball seen to roll, as far as it went this frame
    roll(scene.ballTurn, world.vx[ball], world.vy[ball], KIND_RADIUS[BALL], dt);
    // the camera keeps game time, so a test stepping the game sees it follow the same way every run
    if (!parked) {
      const ground = heightAt(played.layout, world.x[ball], world.y[ball]);
      // a lofted ball is followed up into the air as well as along, or it leaves the top of the screen at the top of its
      // flight; on the ground, and on every hole of minigolf, it is the ground that is looked at, as it always was
      const golf = played.layout.golf;
      const up = golf ? Math.max(0, world.z[ball] - ground - KIND_RADIUS[BALL]) : 0;
      // and quicker the faster it goes, or a drive outruns it
      const ease = golf ? catchUp(Math.hypot(world.vx[ball], world.vy[ball], world.vz[ball])) : undefined;
      rig.follow(world.x[ball], world.y[ball], dt, ground + up, ease);
    }
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
      // the camera is parked where the test wants it, at the home view as it always was (the aim view of a golf hole is
      // a player's and not a test's), looking at the point and not a lead beyond it: the ease to an aim view is over
      rig.aimAt({ distance: rig.distance, tilt: rig.golf ? TILT.home : rig.tilt, lead: LEAD }, true);
      rig.zoom(distance !== undefined ? distance - rig.distance : 0);
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
    aiming: () => (played.ready && input.aim ? { ...input.aim } : null),
    map: () => {
      if (!mapped) return null;
      const o = hud.overlay;
      return {
        width: mapped.size.width,
        height: mapped.size.height,
        ball: [o.ball[0], o.ball[1]],
        cup: [o.cup[0], o.cup[1]],
        aim: o.aim ? [o.to[0], o.to[1]] : null,
      };
    },
    view: () => ({
      distance: rig.distance,
      lead: rig.lead,
      aiming: rig.aiming,
      turning: rig.turning,
      rung: governor.rung,
      held: governor.held,
      antialias: antialiasFor(renderer.look, renderer.economy),
      swaying: renderer.economy.wind !== false,
      mode: input.mode,
      ...rig.view(played.t),
      putt: hud.puttDrawn().putt,
      greens: hud.puttDrawn().greens,
    }),
    orbit: (turn, tilt) => rig.orbit(turn, tilt),
    faceFlag,
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
      landing: scene.landingMark(),
      // the grass pressed flat round the ball this frame: where and how wide, or none
      press: drawn.press ? { ...drawn.press, took: drawn.took } : null,
      // the preview of the shot in hand as the last frame placed it, and what it comes to
      shot: (() => {
        const m = scene.shotMarks();
        if (!m.ring || !shownPreview) return null;
        const p = shownPreview;
        return { ...m, end: p.end, carry: p.carry, lie: p.lie, heading: p.heading };
      })(),
      // the wind's arrow as it was last turned, and the words beside it; and the shape and spin buttons as they are drawn
      wind: hud.windDrawn(),
      controls: hud.controls(),
      arrows: scene.arrowsDrawn(),
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
