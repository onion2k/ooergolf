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
import {
  BALL,
  HARDEST_SHOT,
  KICKER,
  KIND_RADIUS,
  KNOCK,
  heightAt,
  kickerAt,
  lieAt,
  onSand,
  rollsFor,
  strikeSpeed,
} from './arena';
import { bendRate } from './shaping';
import { BAG, PUTTER, carryOf } from './bag';
import { markScale, safeBox } from './aimview';
import { framingProblems } from './invariants';
import { CLIP, CameraRig, LEAD, TILT, overheadFit, standOf, tallOf } from './camera';
import { Director } from './director';
import { ITEMS, itemById } from './items';
import { createApi } from './debug';
import { holeFailureText, reasonOf } from './failure';
import { frameCost } from './frame-cost';
import { COURSES, type Course } from './course';
import { dayOf, recordText, type RoundOf } from './career';
import { seasonContext } from './tours';
import { closedIfFull, eventField, eventsIn, nextEvent, seasonMerit, type SeasonContext } from './tournament';
import { PRIZE, PROMOTED, TOURS, YOU, standings, type Tour } from './season';
import type { TourSeason } from './career';
import type { Board, EventCard, Results } from './hud';
import type { Placement } from './game';
import { Picker, type PickerCourse } from './picker';
import type { CoursePreview } from './previews';
import previewData from './previews.json';
import { Game, type GameEvents } from './game';
import { Hud } from './hud';
import { InstallOffer, registerWorker, shouldRegister, type WorkerState } from './install';
import { uiScale } from './uiscale';
import { mapInto, mapSize, paintMap, type MapSize } from './holemap';
import { Previewer, type Preview } from './preview';
import { breakAids, breakOf, leansOnMinigolf, readerArrows } from './green';
import { greensText, heldHint, landingText, pinReadout, pinText, puttText, windArrow } from './readout';
import { applyLook, daylight } from './look';
import { THEMES, themeOf } from './theme';
import { Progress } from './progress';
import { seeded } from './random';
import { GameSound, LazySound, strikeOf } from './sound';
import { titlePage } from './titlepage';
import { BootProgress, type BootStep } from './bootsteps';
import {
  TitleScene,
  boxOf as titleBoxOf,
  cardsMax,
  cardsTop,
  fitTitle,
  newFrame,
  piecesBounds,
  placeCamera,
  poseMatrix,
  titleFrame,
  wordOf,
  type Frame,
  type Pose,
  type TitleFit,
  type Word,
} from './titlescene';
import { titleLetters, type TitlePiece } from './models/lettering';
import titleTrace from './titletrace.json';
import { golfHole } from './golf';
import { LINKS_SPECS } from './links';
import { group } from './models/part';
import type { GameGroup } from 'artshape-render/game/renderer';
import { roll } from './roll';
import { bladeless, fieldOf, flattenFor, grassOptionsOf, windOf } from './turf';
import { AIM_REACH, Scene, boxOf, sunFitOf } from './scene';
import { BIOMES, surfacesOf, type BiomeName } from './biome';
import { STILL } from 'artshape-render/game/grass';
import { carryFrom } from './flight';
import { CADDIE, CaddieTalk } from './caddie';
import { clearings } from './scenery';
import { FIREWORK_STEPS, cupBurst, fireworkAt, fireworkEmits, splash, strikePuff } from './bursts';
import { Input } from './input';
import { SPARKLE, flash, glint, kickFlash } from './glints';
import { Squash, squashInto, squashOf } from './squash';
import { waggle } from './sway';
import { EFFECT_STRIDE } from 'artshape-render/game/renderer';
import { Governor, RUNGS, economyFor } from './quality';
import { PALETTE } from './models/palette';
import { retakeShown } from './retake';
import { SPRITE_FLOATS, TRAIL, Trail, trailDrawn, trailInto } from './trail';
import { HeldView, groundAt } from './shot';
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
// the boot panel is plain sky while the game boots and fades away to the title scene; a test's page asks for none with `?title=0`
const titleOff = new URLSearchParams(location.search).get('title') === '0';
const reducedMotion = matchMedia('(prefers-reduced-motion: reduce)').matches;
const title = titlePage(boot, titleOff, reducedMotion, document.getElementById('bootBar'));
/** How far the boot has got, by its named steps, which the progress bar on the sky shows if the title is late. */
const booting = new BootProgress();
let bootOpen = true;
const booted = (step: BootStep) => {
  if (!bootOpen) return;
  performance.mark(`boot-${step}`);
  title.progress(booting.finish(step));
};
// the scripts are in: this module is running
booted('scripts');
/**
 * When the title's letters were first drawn and when the course first was, in the page's time (milliseconds from the page's
 * start, as `performance.now` has it), for the test API and the boot timeline; also set as user-timing marks of the same names.
 * The letters come first: the sky and the lettering alone as soon as the pipelines are compiled, the course when it is built.
 */
const marks = { letters: null as number | null, course: null as number | null };
const mark = (name: 'letters' | 'course') => {
  if (marks[name] !== null) return;
  marks[name] = performance.now();
  performance.mark(`title-${name}`);
};
/** A turn of the event loop, so the compile's promises and the frames waiting are run between the steps of a long build. */
const idle = () => new Promise<void>((done) => setTimeout(done, 0));
/** Where a boot step has got to, for the one generator that makes a hole: see `starting`. */
type Checkpoint = 'letters' | 'scene' | 'built';
const stats = document.getElementById('stats')!;

/**
 * The title scene as it is drawn: the lettering's pieces and the groups the renderer draws them with (a matrix a piece, shared
 * by its parts), the title's own clock, and the fit for the screen it is on. Made when the title hole is begun and let go of
 * when a course is chosen, so nothing of it is kept for a game's life.
 */
interface TitleDraw {
  scene: TitleScene;
  pieces: readonly TitlePiece[];
  word: Word;
  fit: TitleFit;
  groups: GameGroup[];
  /** The piece each group is a part of, and each piece's matrix. */
  owners: number[];
  mats: Float32Array[];
  frame: Frame;
  pose: Pose;
  /** Where its first group is among the renderer's moving groups. */
  base: number;
  /** Where the corners are on the screen, for the test API to read: written into, never made in a frame. */
  box: number[];
}

/**
 * How many title scenes the page has made and not yet seen collected, which the test API reports: a title is made when the
 * title hole is begun and must be let go of when a course is chosen, and a test that chooses and goes back reads that none
 * is left, which no other thing the page does shows (its meshes are off the JS heap).
 */
let titlesAlive = 0;
const titlesGone = new FinalizationRegistry<number>(() => {
  titlesAlive--;
});

/** The title hole: The Links' Water Carry, made alone, since the whole course is a good part of a second to make. */
const titleHole = () => golfHole(LINKS_SPECS[1]);

/** The lettering built and handed to the renderer as groups, to stand where `fit` puts it. */
function titleDraw(standing: boolean, reduced: boolean, aspect: number): TitleDraw {
  const letters = titleLetters(titleTrace);
  const mats = letters.pieces.map(() => new Float32Array(16));
  const groups: GameGroup[] = [];
  const owners: number[] = [];
  letters.pieces.forEach((piece, i) =>
    // a band of a face that no triangle falls in is no group: the GPU warns of a draw of nothing, every frame
    piece.parts
      .filter((part) => part.mesh.indices.length > 0)
      .forEach((part) => {
        groups.push(group(part, mats[i], 1));
        owners.push(i);
      }),
  );
  const word = wordOf(letters.pieces);
  const made: TitleDraw = {
    scene: new TitleScene(letters.pieces, reduced, standing),
    pieces: letters.pieces,
    word,
    fit: fitTitle(aspect, cardsTop(innerWidth, innerHeight), word),
    groups,
    owners,
    mats,
    frame: newFrame(),
    pose: { shown: true, lift: 0, sx: 1, sy: 1 },
    base: 0,
    box: [0, 0, 0, 0],
  };
  titlesAlive++;
  titlesGone.register(made, 0);
  return made;
}

main().catch((err: unknown) => {
  showError(reasonOf(err));
  // eslint-disable-next-line no-console -- the screen says the boot failed; the console keeps the stack for a report
  console.error(err);
});

/**
 * The boot screen put up with `words` on it, for a page that could not start or, once it had, could not go on: one screen
 * for both, so a player is told in one place, and it stands over every panel (`#boot` in `index.html`). Said aloud as it
 * appears, which a screen that stopped without a sound would not be: the role first, so it is a live region when the words
 * are written into it.
 */
function showError(words: string) {
  bootMsg.setAttribute('role', 'alert');
  bootMsg.textContent = words;
  // a title still on its way out must not hide what the panel has come back to say
  title.hold();
  boot.classList.remove('gone');
}

/** The canvas's size in device pixels, at most one and a half to the point: what the renderer draws at. */
function canvasSize(): { width: number; height: number } {
  const dpr = Math.min(devicePixelRatio || 1, 1.5);
  return {
    width: Math.max(1, Math.floor(canvas.clientWidth * dpr)),
    height: Math.max(1, Math.floor(canvas.clientHeight * dpr)),
  };
}

async function main() {
  // ---- the renderer ----

  const ctx = await createContext(canvas);
  const renderer = new GameRenderer(ctx, LIGHT_CAPACITY, EFFECT_CAPACITY, PARTICLE_CAPACITY, MM_PER_UNIT);
  // the daylight look, the same one the models' showcase is drawn in. Its pipelines compile on the GPU's side while the page
  // makes the hole, the letters and the scene, so it is started now and waited for where a frame needs it (`looked`); its
  // failure is the boot's, and is said there
  const looked = daylight(renderer, ctx, THEMES.earth);
  looked.catch(() => undefined);
  let pipelined = false;
  void looked.then(
    () => {
      pipelined = true;
      booted('compile');
    },
    () => undefined,
  );
  // the particles' gravity, in world units a second squared: a real 9.8 m/s² here pulls confetti back into the cup
  // before it is out of it, so a lighter one, as Miner has, and the bursts' own gravity scales it
  renderer.gravity = 30;
  renderer.camera.near = 2;
  renderer.camera.far = CLIP.far;
  renderer.setLights(new LightPool(LIGHT_CAPACITY));
  // a page that leaves the title out is booted as it always was, the look in before anything is made
  if (titleOff) await looked;

  // ---- the game, and what it says has happened ----

  const query = new URLSearchParams(location.search);
  // ?rung=N puts the picture on a rung of the quality ladder and holds it there; without it, the governor chooses
  const asked = query.get('rung');
  const governor = new Governor(asked !== null ? Math.max(0, Math.min(RUNGS.length - 1, +asked || 0)) : undefined);
  /** Which economy the renderer is on, so it is set again when the title goes and not every frame. */
  let economyOf: 'title' | 'play' | null = null;
  const startsPaused = query.has('paused');
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

  // ---- the sound ----

  // The context is made on the first key or click and not here: it costs a tenth of a second or so, is silent until a
  // gesture anyway, and is made on the page because which one the browser has is the page's to say. Until then the sound
  // is a silence that keeps the save's setting. Its chance is its own, one past the game's under ?seed=N (the determinism
  // check hashes the game, and a sound that drew from the game's source would move the game), and the browser's otherwise.
  const soundSeed = query.get('seed');
  let audioContext: AudioContext | null = null;
  const sound = new LazySound({
    volume: progress.save.volume,
    muted: progress.save.muted,
    make: (setting) =>
      new GameSound({
        context: (audioContext = new AudioContext()),
        random: seeded(soundSeed !== null ? +soundSeed + 1 : crypto.getRandomValues(new Uint32Array(1))[0]),
        now: () => performance.now(),
        ...setting,
      }),
  });
  const wake = () => sound.wake();
  // a page out of sight has no frames, and the notes already handed over would play on by the audio clock: the context
  // waits with it
  document.addEventListener('visibilitychange', () => {
    if (audioContext) (document.hidden ? audioContext.suspend() : audioContext.resume()).catch(() => undefined);
  });
  // A browser lets the context start only within what it counts as a gesture, and not every input is one: a touchscreen's
  // or a pen's pointerdown is not, nor some keys. The first press makes the context, and every press tries to start it until
  // it runs (a refusal is the browser's to make, and not an error); on 18 October 2026 only the first tried, and a sound
  // made by one that did not count stayed silent until the tab was left and come back to.
  const unlock = (e: Event) => {
    // a click the page makes itself (a button pressed by the test API) is no gesture, and wakes nothing
    if (!e.isTrusted) return;
    sound.wake();
    if (audioContext?.state === 'suspended' && !document.hidden) audioContext.resume().catch(() => undefined);
  };
  for (const type of ['pointerdown', 'pointerup', 'click', 'touchend', 'keydown'] as const)
    addEventListener(type, unlock, { capture: true });
  /** The sound turned off or on, by the button, the M key or the test API: heard, shown and kept. */
  function setMuted(on: boolean) {
    sound.mute(on);
    progress.setMuted(on);
    hud.setSound(on, sound.volume);
  }
  /** The volume set, by the start screen's slider or the test API: heard, shown and kept. */
  function setVolume(volume: number) {
    sound.volume = volume;
    progress.setVolume(volume);
    hud.setSound(sound.muted, volume);
  }
  // M, as the button does; not while a key is held down, nor while typing in a box
  addEventListener('keydown', (e) => {
    if (e.repeat || e.key.toLowerCase() !== 'm' || e.metaKey || e.ctrlKey || e.altKey) return;
    if (e.target instanceof HTMLInputElement && e.target.type !== 'range') return;
    setMuted(!sound.muted);
  });

  // the game tells of its first hole as it is built, before it is here to be read: that one is shown once it is
  let game: Game | undefined = undefined;
  /** The course being played, and whether the start screen is up to choose one: it is, as the page opens. */
  let courseName = COURSES[0].name;
  let choosing = true;
  /**
   * The title scene while it is up: the title hole is the game's hole and its lettering is drawn over it. Null once a course
   * is chosen, which lets go of every group of it, and on a page that leaves the title out. `wantTitle` says the next hole begun
   * is the title's (the first, and the one the card's Courses button brings back), and `standNext` that its letters stand already.
   */
  let titled: TitleDraw | null = null;
  let wantTitle = !titleOff;
  let standNext = false;
  /** The boot's lettering while it is drawn alone over the sky, before the course is in: let go once the hole is handed over. */
  let early: TitleDraw | null = null;
  /** The title scene as it stands, read through a function since it is made and let go inside the events the game tells. */
  const titleNow = (): TitleDraw | null => titled;
  /** The title scene's end: the letters let go, the page's own economy and its words back, and the next hole begun a course's. */
  const endTitle = () => {
    wantTitle = false;
    titled = null;
    document.documentElement.removeAttribute('data-title');
  };
  // what the start screen says of each course, known without making a course that is made when it is chosen: its summary,
  // and from the generated previews its picture, its length and its holes' names (a course without one is a build that forgot
  // `npm run previews`, and is refused here by name rather than shown with nothing)
  const previews = previewData as Partial<Record<string, CoursePreview>>;
  const pickable: PickerCourse[] = COURSES.map((c) => {
    const p = previews[c.name];
    if (!p) throw new Error(`no preview for ${c.name}: run npm run previews`);
    return {
      name: c.name,
      golf: !!c.golf,
      holes: c.summary.holes,
      par: c.summary.par,
      yards: p.yards,
      slug: p.slug,
      strip: p.holes.map(({ par, width, height }) => ({ par, width, height })),
      holeNames: p.holes.map((h) => h.name),
    };
  });
  const picker = new Picker(pickable, progress.save.best);
  /** The start screen up with the picker, the save's bests and the career as they now are, held back while the title's letters drop. */
  const openStart = (wait: boolean) => {
    picker.setBests((game ?? { progress }).progress.save.best);
    hud.showStart(picker, wait, careerWords());
    hud.setEvents(eventCards());
  };
  /** A course as the career knows a round of it: its name and its purse. */
  const roundOf = (c: Course): RoundOf => ({ name: c.name, purse: c.purse });
  /** The season's courses, rivals and their scores: one for the page, handed to the game and read here for the screens. */
  const season: SeasonContext = seasonContext();
  /** A course's par, from the field table, so a golf course need not be made to say it. */
  const parOf = (course: string, holes = Infinity) =>
    season.table[course].slice(0, holes).reduce((a, h) => a + h.par, 0);
  /** The first `n` of a table's rows, and the player's after them if theirs is not among them. */
  const topAndYou = <T extends { name: string }>(rows: readonly T[], n: number): T[] => {
    const top = rows.slice(0, n);
    const you = rows.find((r) => r.name === YOU);
    return you && !top.includes(you) ? [...top, you] : top;
  };
  /** The player's place in an order of merit, or nought where they have none yet. */
  const meritPlace = (tour: Tour, tourSeason: TourSeason) =>
    seasonMerit(season, tour, tourSeason).find((m) => m.name === YOU)?.place ?? 0;
  /** Each tour's next event, as its tab on the start screen shows it in the career; none in free play. */
  const eventCards = (): Partial<Record<Tour, EventCard>> | null => {
    const save = progress.save;
    if (save.mode !== 'career') return null;
    const cards: Partial<Record<Tour, EventCard>> = {};
    for (const tour of TOURS) {
      const tourSeason = closedIfFull(season, tour, save.season[tour]);
      const next = nextEvent(season, tour, tourSeason);
      cards[tour] = {
        tour,
        grade: tourSeason.grade,
        event: next.index + 1,
        events: eventsIn(season, tour),
        course: next.course.name,
        par: parOf(next.course.name),
        fee: next.fee,
        pot: next.pot,
        paid: PRIZE.shares.length,
        coins: save.coins,
        merit: topAndYou(seasonMerit(season, tour, tourSeason), 4).map((m) => ({
          place: m.place,
          tied: m.tied,
          name: m.name,
          points: m.points,
          you: m.name === YOU,
        })),
        promoted: PROMOTED,
        kept: save.round?.tour === tour ? save.round.hole + 1 : null,
      };
    }
    return cards;
  };
  /** The career's words and each tour's event drawn on the start screen, from the save as it stands. */
  const drawCareer = () => {
    hud.setCareer(careerWords());
    hud.setEvents(eventCards());
  };
  /**
   * The season of the event in play, as it stood when its holes began: the order of merit and the field are worked out from
   * it while the event is played and at its end, after the game has moved the season on.
   */
  let eventSeason: TourSeason | null = null;
  /** Where the last event finished was placed, kept from its `placed` until the card is drawn. */
  let lastPlaced: { result: Placement; tour: Tour; index: number; card: number[]; before: TourSeason } | null = null;
  /** How the field stands in the event in play, thru the holes finished: none away from an event. */
  const boardNow = (): Board | null => {
    if (!game?.event || !eventSeason) return null;
    const { tour, index } = game.event;
    const thru = game.card.length;
    const placed = standings(eventField(season, tour, eventSeason, index, game.card), thru);
    const par = parOf(season.tours[tour][index].name, thru);
    const you = placed.find((p) => p.name === YOU)!;
    const cut = placed[Math.min(PRIZE.shares.length, placed.length) - 1];
    return {
      thru,
      rows: topAndYou(placed, 3).map((p) => ({
        place: p.place,
        tied: p.tied,
        name: p.name,
        toPar: p.total - par,
        you: p.name === YOU,
      })),
      cut: cut.total - par,
      behind: placed.filter((p) => p.total > you.total).length,
    };
  };
  /** What an event came to, for the card at its end: the field, the place and the season, from where it was placed. */
  const resultsOf = (course: string): Results | null => {
    if (!lastPlaced) return null;
    const { result, tour, index, card, before } = lastPlaced;
    const placed = eventField(season, tour, before, index, card);
    return {
      course,
      place: result.place,
      tied: result.tied,
      prize: result.prize,
      rows: topAndYou(placed, 4).map((p) => ({
        place: p.place,
        tied: p.tied,
        name: p.name,
        total: p.total,
        you: p.name === YOU,
      })),
      meritFrom: meritPlace(tour, before),
      meritTo: meritPlace(tour, { ...before, played: [...before.played, card] }),
      seasonOver: result.seasonOver,
      promotedTo: result.promotedTo,
      title: result.title,
    };
  };
  /** What the start screen says of the career, from the save as it stands. */
  const careerWords = () => {
    const save = progress.save;
    return {
      mode: save.mode,
      records: Object.fromEntries(Object.entries(save.records).map(([name, r]) => [name, recordText(r)])),
      round: save.round ? { course: save.round.course, hole: save.round.hole + 1 } : null,
    };
  };
  /** What the round's last hole paid as its prize, told before the card is shown, and let go as a round begins. */
  let prized: { coins: number; record: boolean } | null = null;
  /** The start screen put away for a course now in play: the course's words up, and its purse. */
  const playing = (name: string) => {
    courseName = name;
    choosing = false;
    hud.hideStart();
    // the frame's cost is a corner of the course, and not of the start screen
    stats.hidden = false;
    showPurse();
  };
  const hud = new Hud(
    {
      again: () => game?.newRound(),
      buy: (id) => game?.buy(id),
      equip: (id) => game?.equip(id),
      unequip: (aisle) => game?.unequip(aisle),
      choose(name) {
        const course = COURSES.find((c) => c.name === name);
        if (!game || !course) return;
        // the course whose first hole is already set up behind the screen, untouched, is played as it stands; any
        // other, or one begun, starts a round afresh
        // (a title hole is never one: its course is its own)
        const fresh =
          game.course === course.holes &&
          game.phase === 'play' &&
          game.hole === 0 &&
          game.strokes === 0 &&
          !game.card.length;
        // the title is let go before the hole is begun, so that the new hole is built with none of it
        endTitle();
        // a course's card begins a round of it afresh, which gives up a career round kept: Continue goes on with one
        if (!fresh) game.playCourse(course.holes, roundOf(course));
        else game.adopt(roundOf(course));
        playing(name);
      },
      // the card of the career round kept: the round gone on with from its next hole, or the screen's words put right where it cannot be
      resume() {
        const kept = progress.save.round;
        const course = kept && COURSES.find((c) => c.name === kept.course);
        if (!game || !course) return;
        endTitle();
        if (game.resume(course.holes, roundOf(course))) playing(course.name);
        else drawCareer();
      },
      // Career or Free play, chosen on the start screen: the words over the cards say what it means
      mode(mode) {
        game?.setMode(mode);
        drawCareer();
      },
      // Enter on a tour's event card: its fee paid and its first tee, or the screen drawn again where it was refused
      enter(tour) {
        if (!game) return;
        endTitle();
        if (game.enter(tour)) playing(game.of!.name);
        else drawCareer();
      },
      // Practise on a tour's event card: the event's course played for nothing, the season left as it was
      practise(tour) {
        if (!game) return;
        const next = nextEvent(season, tour, closedIfFull(season, tour, progress.save.season[tour]));
        endTitle();
        game.practise(next.course.holes, { name: next.course.name, purse: next.course.purse });
        playing(next.course.name);
      },
      // Next event, on the card at an event's end: the start screen, where the season's next event waits
      next() {
        this.courses();
      },
      courses() {
        choosing = true;
        stats.hidden = true;
        setOverhead(false);
        // the title scene again behind the cards, its letters already standing
        if (!titleOff) {
          wantTitle = true;
          standNext = true;
          game?.playCourse([titleHole()]);
        }
        const standing = titleNow();
        openStart(standing !== null && !standing.scene.landed);
      },
      // the overhead button: the view from above on or off, and so what a drag on the course is
      overhead(on) {
        setOverhead(on);
      },
      // the flag: the camera turned to face the cup
      flag() {
        faceFlag();
      },
      // the speaker: the sound off or on
      mute(on) {
        setMuted(on);
      },
      // the start screen's slider: the volume
      volume(v) {
        setVolume(v);
      },
      // the Retake button: the kit's free retake, which the game says whether it took (and tells of, through `mulliganed`)
      retake() {
        game?.mulligan();
      },
      // a club of the bag chosen on a golf hole
      club(id) {
        if (game?.pick(id)) {
          hud.setClub(id);
          director.reaim();
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
      // the caddie's buttons: its tip put in hand (and the bag and the buttons say so), put away, or asked for
      caddie(action) {
        if (!game) return;
        if (action === 'ask') talk.ask();
        else if (action === 'close') talk.close();
        else if (talk.take(game)) {
          hud.setClub(game.inHand.id);
          hud.setShaping(game.shape, game.spin);
          director.reaim();
        }
        hud.setTip(talk.said.text, talk.said.button);
      },
      // the Install button: the browser's offer taken (the button is only shown while there is one)
      install() {
        offer.prompt();
      },
    },
    ITEMS,
  );
  // the browser's offer to install the page as an app, kept until the player presses Install on the start screen
  const offer = new InstallOffer(window, (on) => hud.showInstall(on));
  /** Where the service worker's registration has got to; a dev page and a test's page register none. */
  let worker: WorkerState = 'none';
  /** Whether the waders took the loss being told of, which the word for it says: set just before it, and read by it. */
  let wadedNow = false;
  const showPurse = () => game && hud.setPurse(game.progress.save);
  /**
   * What the boot screen says once a hole could not be drawn, and nothing before: the page is stopped while it says
   * anything. The game has begun a hole that no one can see, so nothing is played or drawn over it, and the page does not
   * go on to the next frame; a reload is the way out, as it is of any failure of the boot.
   */
  let failure: string | null = null;
  const stopped = () => failure !== null;
  /** The page stopped on the boot screen, which says which hole could not be drawn and why, and the error told to the console too. */
  const stop = (index: number, name: string, err: unknown) => {
    failure = holeFailureText(index, name, err);
    showError(failure);
    // eslint-disable-next-line no-console -- the screen says the hole could not be drawn; the console keeps the stack
    console.error(failure, err);
  };
  const scene = new Scene();
  const rig = new CameraRig();
  /**
   * What is done to the camera as the game goes on: the aim view, the tee, the flag and the follow; and the fly-in to each
   * hole, which a test's page leaves out with `?flyin=0` so its pictures are of the view a shot is played from.
   */
  const director = new Director(rig, { flyIn: new URLSearchParams(location.search).get('flyin') !== '0' });
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
    kicks: 0,
    // the glow ball's sprites the last frame drew, and the particles the last holing threw up from the cup
    trail: 0,
    confetti: 0,
    puff: null as 'sand' | 'grass' | null,
    // and the colour of it, which is the biome's: the test API reads it back
    dust: null as number[] | null,
    // the grass pressed flat this frame round a ball lying in the rough, as it was asked of the renderer
    press: null as { x: number; y: number; radius: number } | null,
    // whether the renderer took it: it does not where the field has no trample, or off it
    took: false,
  };
  /** The glow ball's trail: a ring made once and the sprites it is written into each frame, used only with the item held. */
  const trail = new Trail();
  const trailSprites = new Float32Array(TRAIL.most * SPRITE_FLOATS);
  /** When each kicker of this hole was last hit, in game time: a kicker a hole, made as the hole begins, so never more than it has. */
  let kickedAt: number[] = [];
  /** The disc of grass pressed round a ball at rest in the rough, written each frame: nothing is made. */
  const flatten = { x: 0, y: 0, radius: 0 };
  /** The grass of the hole being grown, which the first frame waits for so it is never drawn bare. */
  let grown: Promise<void> = Promise.resolve();
  /** Which biome's look the renderer has on it: earth's from the boot. */
  let lookedAs: BiomeName = 'earth';
  /** The environment baked for it, and whether the hole grows blades. */
  let lookedEnv = 'daylight';
  let blades = true;
  /** The screen's shape, which how far back the camera stands depends on: kept from the camera's own, which is made after the first hole. */
  let aspect = 1.6;
  /** The previews of this golf hole's shots, worked out in a rehearsal of it: none on a hole of minigolf. */
  let previewer: Previewer | null = null;
  /** The caddie: when it speaks and what it says, with a caddie of each golf hole made as the hole is, and none on minigolf. */
  const talk = new CaddieTalk();
  /** Whether the hole being played is a hole of minigolf whose ground leans, which shows its break as golf's green does: the arrows, the putt's roll and the break in words. */
  let leans = false;
  /** Whether the putt on this hole of minigolf is shown as the roll it makes, to where it rests: the ground leans, or the rangefinder is worn. */
  let rolls = false;
  /** The fireworks over the cup: when the hole was holed, in game time, and the next step to go off (all of them, once they are over). */
  const fireworks = { at: 0, step: FIREWORK_STEPS };
  /** The shot the preview was last worked out for, so it is worked out again only when the aim, the club or the ball changes; and whether one is shown. */
  const previewed = { x: NaN, y: NaN, angle: NaN, power: NaN, club: '', shape: NaN, spin: NaN, tick: NaN };
  let previewShown = false;
  /** The wind of the hole being played, read once as it begins: which way it blows across the ground and how hard in miles an hour. */
  const windNow = { x: 0, y: 0, speed: 0 };
  /** The camera's turn as the wind's arrow is worked out from it, written into each frame and never made. */
  const turnNow = { azimuth: 0, tilt: 0 };
  /** Where the furthest a shot can reach is, written for the test API's reading of the framing and never made. */
  const reaching = { x: 0, y: 0, z: 0 };
  /** The hole's map as it was painted, and whether it was for a phone's box: painted again if the screen changes to the other. */
  let mapped: { size: MapSize; small: string } | null = null;
  /** Where the ball was when the pin was last read, so it is read again only when it has moved. */
  const pinned = { x: NaN, y: NaN };
  /** The preview the scene was last handed, a flight or a putt's roll, which the test API reads back with what was drawn of it. */
  let shownPreview: Preview | null = null;
  /** Where the ball was when the putt's break was last read, so a loop of a hundred and more steps is run once for a ball at rest and never in a frame. */
  const putted = { x: NaN, y: NaN };
  /** Which arrows the putt's words were last worked out for, so the reader's club chosen at rest has them said again. */
  let puttedFor: 'green' | 'near' | null = null;
  /** Where the ball was when the break reader's arrows were last placed round it, so they are placed once for a ball at rest. */
  const read = { x: NaN, y: NaN };
  /** The camera's four corners on the ground, made once, and the ground a point of the map is worked out from. */
  const corners: [number, number][] = [
    [0, 0],
    [0, 0],
    [0, 0],
    [0, 0],
  ];
  /**
   * The box the map is painted to, by the screen it is on: a phone on its side, which has no height to spare (the same
   * five hundred pixels the stylesheet's compact rules begin at), a phone upright, or a desk. Its key says which, so the
   * map is painted again when the screen turns from one to another.
   */
  const mapBoxOf = () =>
    innerHeight <= 500
      ? { key: 'short', width: 56, height: 116 }
      : innerWidth <= 600
        ? { key: 'phone', width: 64, height: 150 }
        : { key: 'desk', width: 100, height: 230 };
  /** The hole's map painted for the screen it is on, made and not yet shown: none for a hole that is not golf. */
  const mapOfHole = () => {
    if (!game?.layout.golf) return null;
    const small = mapBoxOf();
    const size = mapSize(game.layout, small.width, small.height);
    const pixels = new Uint8ClampedArray(size.width * size.height * 4);
    paintMap(game.layout, size, pixels, game.obstacles.streamed);
    return { size, small: small.key, pixels };
  };
  /** A map made by `mapOfHole` handed to the hud, or the hud's put away for none. */
  const showHoleMap = (map: ReturnType<typeof mapOfHole>) => {
    if (!map || !game) {
      mapped = null;
      hud.setMap(null);
      return;
    }
    mapped = { size: map.size, small: map.small };
    mapInto(map.size, game.layout.cup.x, game.layout.cup.y, hud.overlay.cup);
    hud.setMap({ width: map.size.width, height: map.size.height, pixels: map.pixels });
  };
  /** The hole's map painted for the screen it is on, or put away for a hole that is not golf. */
  const paintHoleMap = () => showHoleMap(mapOfHole());
  /** What a new hole puts back: a drag a shot again, and the switch showing it. Set once the input exists, which is after the first hole. */
  let backToAim: (() => void) | null = null;
  /**
   * A hole begun, a step at a time: it stops at each checkpoint it has reached so that the boot can let the event loop run (the
   * pipelines' compile, a frame of the letters) before the next long step, and does the rest in one go for any other hole.
   * The title's lettering is made first, since it is the first thing to be seen; the hole is handed to the renderer only after
   * the last checkpoint, 'built', which the boot waits for the pipelines at.
   */
  function* starting(index: number, par: number): Generator<Checkpoint, void, void> {
    if (!game) return;
    const held = game;
    const { layout } = game;
    const { name } = game.course[index];
    try {
      // ---- built ----
      // the title's lettering, in groups after the hole's own, when this is the hole the title is drawn over
      const lettered = wantTitle ? titleDraw(standNext, reducedMotion, aspect) : null;
      // the boot's own letters are drawn alone before the hole is handed over; a title brought back by the card is not
      if (bootOpen) early = lettered;
      booted('letters');
      yield 'letters';
      // the hole's own wind, which the grass bends in and the flag and the trees follow
      // (a biome with no air, the Moon's, has none: the flag and the trees hang, the clouds do not drift, and nothing is blown)
      const calm = BIOMES[layout.biome].calm;
      const wind = calm ? STILL : windOf(name);
      const fixed = scene.static(layout, name, game.obstacles, game.cup.radius);
      // the kit's accessories that show more are drawn on the holes begun with them (the pennant is still the flag in rainbow stripes until it is drawn fresh), which is where their previews are made too
      const moving = scene.dynamic(game.obstacles, layout, name, wind, {
        ghost: game.kit.rest,
        reader: game.kit.chalk,
        pennant: game.kit.pennant,
        chalk: game.kit.chalk,
        ball: itemById(game.slots.ball)?.look,
      });
      booted('scene');
      yield 'scene';
      if (lettered) {
        lettered.base = moving.length;
        moving.push(...lettered.groups);
      }
      // the hole's rough, round the painted green: a hole too big for a field of grass is refused here, by its size
      // (a biome with bare ground grows no blades, and makes no field of them)
      const field = bladeless(layout) ? null : fieldOf(layout, name, clearings(layout, name));
      const grass = grassOptionsOf(layout);
      // the preview of this hole's shots is worked out in a rehearsal of it, made once here and let go with the hole
      const slopes = leansOnMinigolf(layout);
      // a hole of minigolf is rehearsed when its ground leans, and when the rangefinder is worn, whose ring is where the roll rests
      const rehearsal = layout.golf || slopes || game.kit.rest ? new Previewer(game) : null;
      const map = mapOfHole();
      yield 'built';

      // ---- shown ----
      kickedAt = layout.kickers.map(() => -Infinity);
      // the hole's wind, for the line under the pin and for how far the camera must stand back for a tailwind
      const blowing = game.wind;
      windNow.x = blowing.x;
      windNow.y = blowing.y;
      windNow.speed = layout.golf ? blowing.speed : 0;
      titled = lettered;
      standNext = false;
      if (lettered) document.documentElement.setAttribute('data-title', '');
      renderer.setStatic(fixed);
      renderer.setDynamic(moving);
      // the look of the hole's biome goes on with the hole, and not before it: a hole after another biome's is lit as its own is,
      // earth's after the Moon's among them, and the title (an earth hole) takes the sky back
      if (layout.biome !== lookedAs) {
        lookedEnv = applyLook(renderer, ctx, themeOf(layout));
        lookedAs = layout.biome;
      }
      blades = field !== null;
      grown = renderer.setGrass(field, grass);
      // nothing is pressed on a new hole: the grass stands as it was grown
      renderer.clearPresses();
      renderer.wind = wind;
      renderer.setSunShadow(boxOf(layout), sunFitOf(layout));
      // the camera glides to the tee from wherever it was looking, but for the first hole, with nowhere it was; and the
      // ball on the tee is round
      // (a golf hole lets the camera stand back as far as a drive needs, and begins looking at the tee shot from there;
      // a hole of minigolf has its limits and its home view as it always had)
      director.started();
      leans = slopes;
      rolls = slopes || (!layout.golf && game.kit.rest);
      previewer = rehearsal;
      talk.hole(layout.golf ? game : null);
      hud.setTip(null);
      // the fireworks of the hole before are over with it
      fireworks.step = FIREWORK_STEPS;
      previewed.club = '';
      previewShown = false;
      shownPreview = null;
      scene.setShot(null);
      hud.setLanding(null);
      showHoleMap(map);
      // the pin is read off the ball from the first frame of a golf hole, and is not there on a hole of minigolf
      pinned.x = NaN;
      if (!layout.golf) hud.setPin(null);
      // the wind is told on a golf hole, as a number or as calm, and is not there on a hole of minigolf
      hud.setWind(layout.golf && !calm ? windNow.speed : null);
      // the greens' speed is told on a hole that has set one (The Links), and the putt's break when the ball rests on its green
      hud.setGreens(layout.golf ? greensText(game.def.greens) : null);
      hud.setPutt(null);
      putted.x = NaN;
      read.x = NaN;
      scene.setArrows(false);
      hud.setShaping(game.shape, game.spin);
      // a hole is begun aiming, and the view eases home to the tee's over the glide
      backToAim?.();
      squash.clear();
      trail.clear();
      hud.started({ index, count: game.course.length, name, par });
      // the bag on a golf hole, with the driver in hand, and none on a hole of minigolf
      hud.setBag(
        layout.golf
          ? BAG.map((c) => ({
              id: c.id,
              name: c.name,
              label: c.label,
              carry: carryOf(held.club(c), 1),
              loft: c.loft,
            }))
          : null,
        game.inHand.id,
      );
    } catch (err) {
      stop(index, name, err);
    }
  }

  /** What the player sees of each event, beside the note of it. */
  const shown: GameEvents = {
    // a hole begun: drawn afresh, the sun's shadow fitted to it, and the camera on its tee. Everything that can be refused is
    // built first and none of it is handed to the renderer or the hud until all of it is, so a hole that cannot be drawn
    // leaves them as the last hole had them and not half of one hole and half of another. And the page stops there, on the
    // boot screen, which says which hole and why: the game has begun a hole that no one can see, and is not played over
    started(index, par) {
      // a hole begun in play is made in one go; only the boot's first, under the title, is made a step at a time
      const steps = starting(index, par);
      while (!steps.next().done);
      // an event's season is unchanged until its last hole, so it is kept as each hole begins, which a reload's hole does too
      eventSeason = game?.event ? structuredClone(progress.save.season[game.event.tour]) : null;
      hud.setBoard(boardNow());
    },
    struck(power, x, y) {
      // one stroke in five has the camera follow the ball, and the rest hold the view where it stood
      director.struck();
      hud.setStrokes(game?.strokes ?? 0);
      // a stroke that took the caddie's tip for it is counted, so it goes quiet on that kind once it has been taken enough
      if (game) {
        const took = talk.struck(game.inHand.id, game.struckShape, game.struckSpin);
        if (took) progress.tookTip(took, CADDIE.taken);
        hud.setTip(null);
      }
      // the game puts the shape and the spin back to straight and flat as a shot is struck, and the buttons say so
      if (game) hud.setShaping(game.shape, game.spin);
      // sand from a ball that lay in a bunker, and grass from any other
      const ground = game && onSand(game.layout, x, y) ? 'sand' : 'grass';
      drawn.puff = ground;
      // the club meeting the ball: struck as the club in hand strikes, the sand thrown with it from a bunker
      if (game) {
        const kind = strikeOf(game.inHand);
        sound.struck(kind, power, ground === 'sand');
        log(`sound struck ${kind} ${power.toFixed(2)}${ground === 'sand' ? ' sand' : ''}`);
      }
      const puffs = game ? themeOf(game.layout).puff : undefined;
      for (const e of strikePuff(x, y, power, ground, puffs)) renderer.emit(e);
      if (puffs) drawn.dust = [...puffs[ground]];
    },
    // a lofted ball come down: the first landing is marked, and throws up the ground it came down on
    landed(x, y, speed, first) {
      if (!game || !first) return;
      scene.landedAt(x, y, game.t);
      const ground = onSand(game.layout, x, y) ? 'sand' : 'grass';
      // the thud of it, and its hops on turf; plugged in sand
      const fall = Math.min(1, speed / 60);
      sound.landed(fall, ground === 'sand');
      log(`sound landed ${fall.toFixed(2)}${ground === 'sand' ? ' sand' : ''}`);
      const puffs = themeOf(game.layout).puff;
      for (const e of strikePuff(x, y, Math.min(1, speed / 60), ground, puffs)) renderer.emit(e);
      drawn.dust = [...puffs[ground]];
    },
    // knocked off the rail, a post or the ground it dropped onto: squashed along it, and sprung back
    knocked(hard, x, y, dx, dy, dz) {
      if (!game) return;
      squash.knock(game.t, hard, dx, dy, dz);
      // a kicker that was hit lights up, and a hit on it again lights it anew
      const k = kickerAt(game.layout, x, y, KIND_RADIUS[BALL] + 0.25);
      if (k >= 0) kickedAt[k] = game.t;
      // a wooden knock as hard as the hit, and the kicker's spring with it
      sound.knocked(hard, KNOCK.least, k >= 0);
      log(`sound knocked ${hard.toFixed(1)}${k >= 0 ? ' kicker' : ''}`);
    },
    // the waders took the loss that is about to be told of: the next word for it says it cost nothing
    waded() {
      wadedNow = true;
    },
    // the mulligan: the stroke undone, and the ball back where it was struck from, which is round again
    mulliganed() {
      hud.setStrokes(game?.strokes ?? 0);
      hud.mulligan();
      squash.clear();
      trail.clear();
    },
    // the penny used up: the purse and the shop show it gone
    spent: showPurse,
    // into the water: a splash where it went in, and a word, and the stroke it cost; the ball put back is round
    splash(x, y) {
      hud.setStrokes(game?.strokes ?? 0);
      hud.splash(wadedNow, game ? BIOMES[game.layout.biome].words.lake : undefined);
      wadedNow = false;
      squash.clear();
      trail.clear();
      // a splash up, and a ring spreading over the water from where it went in
      if (game) scene.splashedAt(x, y, game.t);
      sound.splashed();
      log('sound splash');
      for (const e of splash(x, y)) renderer.emit(e);
    },
    // out of bounds: a word for it, and the stroke it cost; the ball put back is round
    outOfBounds() {
      hud.setStrokes(game?.strokes ?? 0);
      hud.outOfBounds(wadedNow);
      sound.lost(false);
      log('sound lost');
      wadedNow = false;
      squash.clear();
      trail.clear();
    },
    // in the cup: confetti out of it, the flag waggling and its gold flashing, from the moment it dropped
    holed(strokes, par) {
      hud.done(strokes, par, false);
      // the ball rattling in the cup, and a run up the marimba as good as the score
      sound.holed(strokes, par);
      log(`sound holed ${strokes} ${par}`);
      hud.setBoard(boardNow());
      if (!game) return;
      scene.holedAt = game.t;
      // the confetti cup throws more, for longer, in the rainbow's colours
      drawn.confetti = 0;
      for (const e of cupBurst(
        game.layout.cup.x,
        game.layout.cup.y,
        strokes === 1,
        game.kit.streamers ? 'streamers' : 'plain',
      )) {
        renderer.emit(e);
        drawn.confetti += e.count;
      }
      // a birdie or better sends the fireworks up over the cup, a shell at a time, from game time
      if (game.kit.fireworks && strokes < par) {
        fireworks.at = game.t;
        fireworks.step = 0;
      }
    },
    pickedUp: (strokes, par) => {
      hud.done(strokes, par, true);
      sound.lost(true);
      log('sound picked up');
      hud.setBoard(boardNow());
    },
    finished: () => {
      if (!game) return;
      const best = progress.save.best;
      hud.finished(
        game.course,
        game.card,
        {
          bests: game.course.map((h) => (Object.hasOwn(best, h.name) ? best[h.name].strokes : null)),
          prize: prized ? prized.coins : null,
          record: prized?.record ?? false,
          free: progress.save.mode === 'free' && game.of !== null,
        },
        resultsOf(game.of?.name ?? courseName),
      );
      prized = null;
      lastPlaced = null;
    },
    placed: (result) => {
      if (!game?.event || !eventSeason) return;
      lastPlaced = {
        result,
        tour: game.event.tour,
        index: game.event.index,
        card: [...game.card],
        before: eventSeason,
      };
    },
    roundPaid: (coins, record) => {
      prized = { coins, record };
      showPurse();
    },
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
  // ---- the first frame: the letters on the sky, before the course is in ----

  /** Whether the letters are being drawn alone, a frame at a time, while the hole is made. */
  let earlyOn = false;
  let earlyDrawn = false;
  /** Kept when the first frame of the letters has been drawn: the hole is not handed over before it, so the letters are seen first. */
  let lettered: Promise<void> = Promise.resolve();
  let letteredAt: () => void = () => undefined;
  let earlyAspect = 0;
  let earlyLast = 0;
  /**
   * A frame of the sky and the title's letters alone, the first thing the player sees: drawn as soon as the pipelines are
   * compiled, wherever the hole has got to, so a slow machine sees the title while it makes the course. It is the title's own
   * clock that starts here (the drop begins at the first of these), and a paused page does not step it. The hole is not
   * handed to the renderer yet, so the letters are its only groups, from the first.
   */
  function lettersFrame(t: TitleDraw, dt: number) {
    const lens = renderer.camera;
    const size = canvasSize();
    // the canvas's own pixels are set before the renderer is, as `resize` does, or a frame is drawn into the 300 by 150 it began with
    if (canvas.width !== size.width || canvas.height !== size.height) {
      canvas.width = size.width;
      canvas.height = size.height;
    }
    renderer.resize(size.width, size.height);
    if (earlyAspect !== lens.aspect) {
      earlyAspect = lens.aspect;
      t.fit = fitTitle(lens.aspect, cardsTop(innerWidth, innerHeight), t.word);
    }
    if (!earlyDrawn) {
      renderer.economy = economyFor(RUNGS[Math.max(1, governor.rung)]);
      renderer.setDynamic(t.groups);
    }
    if (!startsPaused) t.scene.advance(dt);
    const { layout, world, ball } = played;
    placeCamera(lens, layout.tee, layout.cup, world.z[ball], t.fit);
    lens.update();
    writeTitle(t, 0);
    renderer.frame(ctx.context.getCurrentTexture().createView(), 'redraw', dt);
    if (!earlyDrawn) {
      earlyDrawn = true;
      mark('letters');
      letteredAt();
      // the panel fades away to the sky and the letters, and the course comes in behind them as it is built
      title.leave();
    }
  }
  function earlyTick(now: number) {
    if (!earlyOn) return;
    requestAnimationFrame(earlyTick);
    const t = early;
    if (!t || !pipelined) return;
    const { dt } = between(now, earlyLast || now);
    earlyLast = now;
    lettersFrame(t, dt);
  }
  /**
   * The first hole begun under the title, a step at a time: the letters are made first, and while the rest is made the event
   * loop is let run between the steps, so the compile's promises are kept and a frame of the letters is drawn as soon as the
   * pipelines are in. The hole is handed to the renderer once it is all built and the pipelines are.
   */
  async function beginUnderTitle(index: number, par: number) {
    const steps = starting(index, par);
    lettered = new Promise<void>((done) => (letteredAt = done));
    earlyOn = true;
    requestAnimationFrame(earlyTick);
    try {
      for (let step = steps.next(); !step.done; step = steps.next()) {
        // a test may hold the course back (a promise it left on the page as `courseGate`) to look at the letters on the sky alone
        if (step.value === 'built') await (window as { courseGate?: Promise<void> }).courseGate;
        if (step.value === 'letters') {
          // the letters are built: nothing else is made until the pipelines are in and the letters are on the sky, so the
          // compile has the page to itself and the first thing the player sees comes as soon as it can
          await looked;
          await lettered;
        } else if (step.value === 'scene') {
          // the scene was the long step: a turn of the loop for the letters' frames to run
          await idle();
        }
      }
    } finally {
      earlyOn = false;
      early = null;
    }
  }

  // ?seed=N makes chance the same from before the game is built, for a test that wants the same course every run; a
  // player's game is seeded from the browser's own randomness, so the game has one source of chance however it is begun
  const seed = query.get('seed');
  const played = new Game(progress, events, {
    random: seeded(seed !== null ? +seed : crypto.getRandomValues(new Uint32Array(1))[0]),
    // the day a course record is made, in the player's own time
    today: () => dayOf(new Date()),
    // the courses, rivals and scores an event is made of, so the game can be entered in one: the page's buttons for it come later
    season,
    // the title is drawn over a hole of its own, which nothing is played on
    ...(wantTitle ? { course: [titleHole()] } : {}),
  });
  game = played;
  director.use(played);
  // the camera's own tosses (which side of the flag it looks to): the same seed as the game's when a test gives one, so a
  // view is the same every run, and otherwise one number from the browser's, which is no chance of the game's
  director.setSeed(seed !== null ? +seed : crypto.getRandomValues(new Uint32Array(1))[0]);
  // the screen is not measured until after the first hole, which is begun looking from a desk's shape
  director.setScreen(aspect, innerHeight);
  booted('hole');
  // the start screen is up, held back, before the first hole is: the boot panel is let go as soon as the letters are drawn,
  // while the hole is still being built behind them, and a hole begun with no start screen up puts its bag and its map on
  // the screen, which were seen over the sky until the end of the boot put the start screen up and hid them
  if (wantTitle) openStart(true);
  if (wantTitle) await beginUnderTitle(played.hole, played.def.par);
  else shown.started!(played.hole, played.def.par);
  // a first hole that cannot be drawn is the boot's failure: the screen says so, and there is no game to start
  if (stopped()) return;
  showPurse();
  hud.setSound(progress.save.muted, progress.save.volume);

  // ---- the scene and the camera ----

  /**
   * The picture's economy: the governor's rung, and while the title is up no lower than the second, whose grass is thinned,
   * since the title is seen from far and high and its frame must be well inside the budget with the lettering on it.
   */
  function applyEconomy() {
    economyOf = titled ? 'title' : 'play';
    renderer.economy = titled ? economyFor(RUNGS[Math.max(1, governor.rung)]) : governor.economy;
  }
  applyEconomy();

  const cam = renderer.camera;
  /** Whether the test API has parked the camera where it wants it, and it is not to follow the ball. */
  let parked = false;

  let width = 1,
    height = 1;
  const resize = () => {
    ({ width, height } = canvasSize());
    canvas.width = width;
    canvas.height = height;
    cam.aspect = aspect = width / height;
    // the cards stand under the word at most this tall, which the stylesheet reads and the word is fitted clear of
    document.documentElement.style.setProperty('--cards-max', `${cardsMax(innerWidth, innerHeight)}px`);
    if (titled) titled.fit = fitTitle(aspect, cardsTop(innerWidth, innerHeight), titled.word);
    // the words over the course are laid out for a screen of a size and shrunk to a smaller one
    document.documentElement.style.setProperty('--ui', String(uiScale(innerWidth, innerHeight)));
    // a screen of another shape stands the camera at another distance: the view is worked out again
    director.setScreen(aspect, innerHeight);
    if (mapped && mapped.small !== mapBoxOf().key) paintHoleMap();
    renderer.resize(width, height);
  };
  addEventListener('resize', resize);
  resize();

  // ---- the pointers: one pulled back and let go is a shot, two are a pinch ----

  /** The view as it was when the drag now under way began, which the aim is read through (see `HeldView`). */
  const held = new HeldView();
  const input = new Input({
    shortSide() {
      const r = canvas.getBoundingClientRect();
      return Math.max(1, Math.min(r.width, r.height));
    },
    // onto the ground at the height of the ground under the ball, where the drag is made
    ground(x, y) {
      const r = canvas.getBoundingClientRect();
      const g = heightAt(played.layout, played.world.x[played.ball], played.world.y[played.ball]);
      return held.ground(((x - r.left) / r.width) * 2 - 1, 1 - ((y - r.top) / r.height) * 2, g);
    },
    // the camera as the frame drew it, held still for the drag
    hold: () => held.hold(cam),
    shoot: (angle, power) => played.shoot(angle, power),
    touch: () => played.touch,
    zoom: (by) => rig.zoom(by),
    // the view from above dragged: the ground goes with the finger, over the height of the canvas
    pan: (dx, dy) => rig.pan(dx, dy, canvas.getBoundingClientRect().height),
    // nothing is struck through the start screen
    blocked: () => choosing,
  });
  /**
   * The view from above switched on or off, as the button does: on, fitted to the whole of the hole and a drag a pan that
   * never strikes; off, the view as it was. Whether it is on. Not under the start screen, where there is no hole to look
   * down on, and the rig refuses one that is not fitted to a hole.
   */
  function setOverhead(on: boolean): boolean {
    if (on && choosing) return rig.overhead;
    const bounds = played.layout.bounds;
    const wanted = rig.setOverhead(
      on,
      on ? { bounds, distance: overheadFit(bounds, rig.azimuth, aspect) } : undefined,
      played.t,
    );
    input.setMode(wanted ? 'overhead' : 'aim');
    hud.setOverhead(wanted);
    return wanted;
  }
  backToAim = () => {
    setOverhead(false);
  };
  /**
   * The camera turned to face the cup from the ball, the short way and eased, in either mode and on any hole; whether it
   * was. Not under the start screen, and not while a drag is held, since the aim is the ground under the finger through the
   * camera and a camera turning under it would turn the shot; and not when the ball is at the cup, where there is no way to face.
   */
  const faceFlag = (): boolean => !choosing && director.faceFlag(input.aim !== null);
  /** How the drag now held was begun: a finger takes it back with a second one, and a mouse or a pen by letting go where it pressed. */
  let pressedBy: 'touch' | 'pointer' = 'pointer';
  /** Whether a drag was held at the last frame, and the game time it began at, which the help waits `HELD_HINT.after` of to tell how to take it back. */
  let wasGripping = false,
    grippedAt = 0;
  canvas.addEventListener('pointerdown', (e) => {
    // the mouse's other buttons are not a shot
    if (e.pointerType === 'mouse' && e.button !== 0) return;
    // the first pointer of a drag is the one that says how it is taken back; a second finger is the taking back
    if (input.idle) pressedBy = e.pointerType === 'touch' ? 'touch' : 'pointer';
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
            p.n
              ? landingText(
                  {
                    carry: p.carry,
                    end: p.end,
                    lie: p.lie,
                    hit: p.hit !== null,
                    shape,
                    spin,
                    ...(p.rest.shown && p.rest.settled ? { rest: p.rest.carry } : {}),
                  },
                  BIOMES[layout.biome].words.lake,
                )
              : null,
          );
        } else previewer.roll({ x, y }, inHand, aimed.angle, aimed.power);
      }
      const r = Math.min(rig.distance * tallOf(aspect), standOf(aspect));
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
    // (the break reader shows them off the green too, round the ball, for a putter in hand)
    const lie = lieAt(layout, x, y);
    const aids = breakAids(lie, inHand.loft, played.kit.chalk, played.def.greens !== undefined);
    const rested = played.ready && played.phase === 'play';
    scene.setArrows(rested && aids.arrows === 'green');
    const nearBall = rested && aids.arrows === 'near';
    if (nearBall) {
      if (read.x !== x || read.y !== y) {
        read.x = x;
        read.y = y;
        scene.setReaderArrows(readerArrows(layout, x, y));
      }
    } else if (!Number.isNaN(read.x)) {
      read.x = NaN;
      scene.setReaderArrows(null);
    }
    if (rested && aids.words) {
      if (putted.x !== x || putted.y !== y || puttedFor !== aids.arrows) {
        putted.x = x;
        putted.y = y;
        puttedFor = aids.arrows;
        hud.setPutt(puttText(breakOf(layout, x, y, played.greens, played.ground)));
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
    // what moves on a hole of minigolf is posed by game time, so the roll is worked out again a few times a second while the aim is held
    const tick = played.obstacles.pushers.length ? Math.floor(played.t * 4) : 0;
    if (aimed && previewer) {
      if (
        previewed.x !== x ||
        previewed.y !== y ||
        previewed.angle !== aimed.angle ||
        previewed.power !== aimed.power ||
        previewed.shape !== played.shape ||
        previewed.spin !== played.spin ||
        previewed.tick !== tick
      ) {
        Object.assign(previewed, {
          x,
          y,
          angle: aimed.angle,
          power: aimed.power,
          club: PUTTER.id,
          shape: played.shape,
          spin: played.spin,
          tick,
        });
        previewer.roll({ x, y }, PUTTER, aimed.angle, aimed.power, played.shape, played.spin);
      }
      shownPreview = previewer.rolled;
      scene.setShot(shownPreview, markScale(Math.min(rig.distance * tallOf(aspect), standOf(aspect))));
      previewShown = true;
    } else if (previewShown) {
      shownPreview = null;
      scene.setShot(null);
      previewed.club = '';
      previewShown = false;
    }
    // the arrows over the floor and the break in words are for a hole whose ground leans; a level one shows only the roll
    if (!leans) return;
    const resting = played.ready && played.phase === 'play';
    scene.setArrows(resting);
    if (resting) {
      if (putted.x !== x || putted.y !== y) {
        putted.x = x;
        putted.y = y;
        hud.setPutt(puttText(breakOf(layout, x, y, undefined, played.ground)));
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
    // the title shows no ball on the tee: a matrix of no size, since a group drawn none at all is a warning from the GPU every frame
    if (titled) {
      scene.ball.fill(0);
      scene.ball[15] = 1;
    }
    // a ball gone into the cup is not drawn
    renderer.move(0, scene.ball, world.alive[ball] ? 1 : 0);
    drawn.squash = world.alive[ball] ? squashOf(scene.ball, 0, n[0], n[1], n[2]) : 0;
    // while a drag has been held a moment on a ball that can be struck, the help says how to take it back (a second finger, or letting go
    // where it began); a shot struck at once is not told
    const gripping = input.holding && played.ready && played.phase === 'play' && !choosing;
    if (gripping && !wasGripping) grippedAt = played.t;
    wasGripping = gripping;
    hud.setAiming(gripping ? heldHint(pressedBy, grippedAt, played.t) : null);
    // the aim shows only while a shot can be taken
    // a finer club's aim reaches further, as far again as its hardest shot rolls; and a golf club's as far as it carries
    const golf = played.layout.golf;
    // a lofted shot is aimed by its flight, worked out in a rehearsal and drawn as an arc to the ring it comes down in;
    // a putt, on a golf hole or a hole of minigolf, is aimed by its dots as it always was
    const flying = golf && previewer !== null && played.ready && played.inHand.loft > 0 ? input.aim : null;
    const reach = golf
      ? carryFrom(
          played.inHand,
          1,
          lieAt(played.layout, world.x[ball], world.y[ball]),
          played.kit,
          played.opening ? played.kit.firstStroke.power : 1,
          surfacesOf(played.layout),
        ) / AIM_REACH
      : rollsFor(played.hardest, played.putRoll) / rollsFor(HARDEST_SHOT);
    // and a putt on a hole whose greens are set is drawn as its roll as well, so the break is seen as a curve across the green
    const rolling =
      golf && previewer !== null && played.ready && played.inHand.loft === 0 && played.def.greens !== undefined
        ? input.aim
        : null;
    // a putt that curves on minigolf has its dots laid along the curve, struck at the speed the drag would give it
    const bend = golf ? 0 : bendRate(played.shape, played.kit);
    const dots =
      played.ready && !flying
        ? scene.writeAim(
            world.x[ball],
            world.y[ball],
            input.aim,
            reach,
            played.t,
            bend,
            bend !== 0 && input.aim ? strikeSpeed(input.aim.power, played.hardest) : 0,
            played.putRoll,
          )
        : 0;
    if (rolls) aimOnSlope(played.ready ? input.aim : null);
    if (golf) {
      // the club the game holds, shown in the bag whoever chose it (the game puts the putter in hand on the green by
      // itself), before the aim's words name it
      hud.setClub(played.inHand.id);
      aimOnGolf(flying, rolling);
      // the shape and the spin the game holds, shown on their buttons whoever chose them; and the wind's arrow turned by
      // the camera as it is this frame, which includes the glide to a new tee
      hud.setShaping(played.shape, played.spin);
      if (windNow.speed >= 0.5) hud.setWindArrow(windArrow(windNow.x, windNow.y, rig.view(played.t, turnNow).azimuth));
    } else {
      // the shape and the spin of a putt, for a kit that gives them: buttons on a hole of minigolf only then
      hud.setPuttShaping(played.kit.bend > 0, played.kit.puttSpin > 0);
      hud.setShaping(played.shape, played.spin);
      // the chalk's line past the first bank, for the aim held (the scene draws it only on a hole begun with the chalk)
      scene.setBankAim(world.x[ball], world.y[ball], played.ready ? input.aim : null, reach);
    }
    renderer.move(1, scene.aim, dots);
    // the nearest dot's size, as it was placed: nought for none
    drawn.pulse = dots ? scene.aim[0] - 1 : 0;
    if (dots) renderer.tint(1, scene.aimLooks);
    // the clouds are drawn to a view that sees the sky, the fly-in's and the title's, and put away from every other: they drift over
    // the hole at the height a shot is aimed from, and one drawn there covered the shot
    scene.setSky(titled !== null || rig.seesSky(played.t));
    scene.writeMoving(played.t).forEach((m, k) => {
      renderer.move(2 + k, m.matrices, m.count);
      // what is coloured by game time, as the rings on the water fade, has its colours written again each frame
      if (m.looks) renderer.tint(2 + k, m.looks);
    });
    // the grass's wind and its track keep game time, as everything else that moves does
    renderer.time = played.t;
    shine();
    glowTrail();
    flyFireworks();
    if (titled) writeTitle(titled);
  }

  /**
   * Where the camera stands for the title: behind the tee and looking up the hole, as the fit says for this screen. The page
   * has put the rig's view there already; this takes it over, since the title is a picture of a hole and not a view of play.
   */
  function titleCamera(t: TitleDraw) {
    const { layout, world, ball } = played;
    placeCamera(cam, layout.tee, layout.cup, world.z[ball], t.fit);
  }
  /** The title's pieces posed by its own clock and placed in the word's plane for this frame's camera, none of them drawn that is not there yet. */
  function writeTitle(t: TitleDraw, base = t.base) {
    titleFrame(renderer.camera, t.fit, t.word, t.frame);
    t.pieces.forEach((piece, i) => {
      t.scene.pose(piece, t.pose);
      poseMatrix(t.mats[i], t.frame, piece.pivot, t.pose);
    });
    t.groups.forEach((_, j) => renderer.move(base + j, t.mats[t.owners[j]], 1));
  }

  /** The fireworks that are due by game time, thrown over the cup: none when none is under way. */
  function flyFireworks() {
    if (fireworks.step >= FIREWORK_STEPS) return;
    const { cup } = played.layout;
    const z = heightAt(played.layout, cup.x, cup.y);
    while (fireworks.step < FIREWORK_STEPS && played.t - fireworks.at >= fireworkAt(fireworks.step)) {
      for (const e of fireworkEmits(cup.x, cup.y, z, fireworks.step)) renderer.emit(e);
      fireworks.step++;
    }
  }

  /**
   * The glow ball's trail: the ball's place stamped into the ring as it moves and the ring written out as sprites, each
   * frame, with the item held and the picture on a rung that draws particles (the renderer gives sprites up with them, and
   * the lowest rungs have no room for the glow). Without the item nothing is written, and what was drawn is put away once.
   */
  function glowTrail() {
    const { world, ball } = played;
    if (!trailDrawn(played.kit.trail, RUNGS[governor.rung])) {
      trail.clear();
      if (drawn.trail) renderer.setSprites(trailSprites, (drawn.trail = 0));
      return;
    }
    // only a ball that is going leaves a place: one at rest on the tee would glow there for as long as time stood still
    if (world.alive[ball] && Math.hypot(world.vx[ball], world.vy[ball], world.vz[ball]) > TRAIL.moving)
      trail.record(played.t, world.x[ball], world.y[ball], world.z[ball]);
    drawn.trail = trailInto(trailSprites, trail, played.t, KIND_RADIUS[BALL], PALETTE.trail);
    renderer.setSprites(trailSprites, drawn.trail);
  }

  /** The gold that glints: round the cup's rim, and the knob on the pin. */
  const glinting = (): [number, number, number][] => {
    const { cup } = played.layout;
    const rim = played.cup.radius + 0.15;
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
  /** The kicker's flash: warm, a little smaller than the gold's, and round. */
  const KICK: Glow = { size: 0.05, power: 3, colour: [1, 0.78, 0.45], falloff: 2.6 };
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
    // the title is no hole to play: the gold's twinkle and the cup's flash are not there, so no white spot shows in it
    if (titled) {
      drawn.glints = drawn.sparkles = drawn.kicks = 0;
      renderer.setEffects(glintQuad, 0);
      return;
    }
    let used = (drawn.glints = gold());
    const sparks = scene.sparkleInto(played.t, sparkQuads);
    let lit = 0;
    for (; lit < sparks && used < EFFECT_CAPACITY; lit++)
      glow(used++, sparkQuads[lit * 4], sparkQuads[lit * 4 + 1], sparkQuads[lit * 4 + 2], sparkQuads[lit * 4 + 3], SUN);
    drawn.sparkles = lit;
    // the kickers a ball has just hit, after all the rest, in what room is left
    drawn.kicks = 0;
    played.layout.kickers.forEach((k, i) => {
      const lit = kickFlash(played.t - (kickedAt[i] ?? -Infinity));
      if (lit <= 0 || used >= EFFECT_CAPACITY) return;
      glow(used++, k.x, k.y, heightAt(played.layout, k.x, k.y) + KICKER.height + 0.2, lit, KICK);
      drawn.kicks++;
    });
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
  booted('grass');
  bootOpen = false;
  performance.mark('boot-ready');
  // a page that has no letters to draw first (the title left out) lets the panel go here, as it always did
  title.leave();
  // the start screen over the title scene, or over the first hole of the first course on a page that has none, until a course
  // is chosen: held back until the letters have landed
  const standing = titleNow();
  openStart(standing !== null && !standing.scene.landed);
  stats.hidden = choosing;

  // ---- each frame ----

  let frames = 0;
  let smoothed = 0;
  function simulate(dt: number) {
    if (stopped()) return;
    frames++;
    // the title's own clock, which the cards come up at the end of
    if (titled) {
      titled.scene.advance(dt);
      if (titled.scene.landed) hud.releaseStart();
    }
    played.step(dt);
    // after the game, so that a game that is not stepping has no music: the music under a menu, and a sound loaded a step
    // until all are
    const menus = hud.inMenus;
    sound.setMusic(menus);
    // a sound that is dear to load waits for a still screen: a menu up, or the ball at rest
    sound.step(dt, menus || played.ready);
    // the step may have begun a hole that could not be drawn: the rest of the frame is of a hole no one sees
    if (stopped()) return;
    // the camera: the aim view for the next shot, eased, and the ball followed, by game time so a test stepping the game
    // sees it follow the same way every run
    // turned to look the way a drag held now aims, and left looking there when it is taken back; the ball must be ready, and
    // the start screen has no shot
    director.aiming(choosing ? null : input.aim);
    director.frame(dt, parked);
    // the caddie looks at a ball come to rest a preview a frame, and says its tip when the look is done; nothing under the
    // start screen or the title, and nothing over a drag held, when the shot is the thing to see
    talk.frame(played, progress.save.caddie, choosing || titled !== null);
    hud.setTip(talk.said.text, talk.said.button);
    hud.setTipHeld(input.holding);
    const { world, ball } = played;
    if (!world.alive[ball]) return;
    // the ball seen to roll, as far as it went this frame
    roll(scene.ballTurn, world.vx[ball], world.vy[ball], KIND_RADIUS[BALL], dt);
  }
  /**
   * The framing as the camera is placed now, for the test API: where the ball and the furthest reach are on the screen
   * (from minus one to one each way), the safe box, whether the view has settled so that the rule is asked of it, and what is
   * wrong with it if it has. Not asked while the camera is parked by a test, gliding to a tee, easing, turning or overhead.
   */
  function framing() {
    const { world, ball } = played;
    rig.place(cam, played.t);
    cam.update();
    const box = safeBox(aspect, innerHeight);
    const at = (x: number, y: number, z: number): [number, number] => {
      const m = cam.viewProjection;
      const w = m[3] * x + m[7] * y + m[11] * z + m[15];
      return [(m[0] * x + m[4] * y + m[8] * z + m[12]) / w, (m[1] * x + m[5] * y + m[9] * z + m[13]) / w];
    };
    const there = { x: world.x[ball], y: world.y[ball], z: world.z[ball] };
    const reach = director.reachPoint(reaching) ? reaching : null;
    const settled = !parked && !choosing && !rig.easing(played.t) && !rig.aiming && !rig.turning && rig.blend === 0;
    return {
      ball: at(there.x, there.y, there.z),
      reach: reach ? at(reach.x, reach.y, reach.z) : null,
      box,
      settled,
      problems: settled ? framingProblems(rig, cam, there, reach, box) : [],
    };
  }
  /** The frame drawn, and when it was begun, for the governor to measure the drawing against. */
  function draw(dt: number): number {
    // nothing is drawn once the page is stopped on the boot screen: the scene is left as the build that failed left it
    if (stopped()) return performance.now();
    // the far plane is further while the view from above is up, so the whole of a big hole is inside it, and as far as the
    // horizon while a hole is flown in to, so the world past it is drawn
    cam.far = titled ? CLIP.far : rig.farPlaneAt(played.t);
    if (economyOf !== (titled ? 'title' : 'play')) applyEconomy();
    // the Retake button is up while pressing it would do something: the page tells the hud, which does not read the game
    hud.setRetake(
      retakeShown({
        held: played.kit.retake,
        strokes: played.strokes,
        used: played.mulliganUsed,
        phase: played.phase,
        choosing,
        event: played.event !== null,
      }),
    );
    rig.place(cam, played.t);
    if (titled) titleCamera(titled);
    cam.update();
    upload();
    const t = performance.now();
    renderer.frame(ctx.context.getCurrentTexture().createView(), 'redraw', dt);
    mark('course');
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
    if (governor.frame(gap, work)) applyEconomy();
    return governor.rung;
  }

  // ---- the test API, and the frame loop ----

  // ?paused=1 starts the game stopped where it was built, so a test sees the
  // same course every run: no frame of its own has run, and every one after is
  // the test's, of a length it chose
  let paused = startsPaused;
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
    setViewSeed: (n) => director.setSeed(n),
    followShots: (mode) => director.followShots(mode),
    look(x, y, distance) {
      parked = true;
      director.park(true);
      rig.jump(x, y, heightAt(played.layout, x, y));
      // the camera is parked where the test wants it, at the home view as it always was (the aim view of a golf hole is
      // a player's and not a test's), looking at the point and not a lead beyond it: the ease to an aim view is over
      rig.aimAt({ distance: rig.distance, tilt: rig.golf ? TILT.home : rig.tilt, lead: LEAD, floor: 0 }, true);
      rig.zoom(distance !== undefined ? distance - rig.distance : 0);
    },
    follow() {
      parked = false;
      director.park(false);
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
      framing: framing(),
      distance: rig.distance,
      lead: rig.lead,
      aiming: rig.aiming,
      turning: rig.turning,
      heading: rig.headed,
      flag: director.nearFlag(),
      line: director.nearLine(),
      following: director.following,
      rung: governor.rung,
      held: governor.held,
      antialias: antialiasFor(renderer.look, renderer.economy),
      swaying: renderer.economy.wind !== false,
      mode: input.mode,
      blend: rig.blend,
      farPlane: cam.far,
      flying: rig.flying(played.t),
      ...rig.view(played.t),
      putt: hud.puttDrawn().putt,
      greens: hud.puttDrawn().greens,
    }),
    orbit: (turn, tilt) => rig.orbit(turn, tilt),
    overhead: (on) => setOverhead(on ?? !rig.overhead),
    faceFlag,
    caddie: () => ({
      said: hud.tipShown(),
      offered: talk.offered
        ? { kind: talk.offered.kind, club: talk.offered.club, shape: talk.offered.shape, spin: talk.offered.spin }
        : null,
      looking: talk.looking,
      taken: { ...progress.save.caddie },
    }),
    caddiePress: (action) => hud.pressCaddie(action),
    shopTab: (aisle) => hud.pressTab(aisle),
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
      // only while one is lit, so a hole with none, and every moment none is hit, reads as it always did
      ...(drawn.kicks ? { kicks: drawn.kicks } : {}),
      trail: drawn.trail,
      confetti: drawn.confetti,
      strips: scene.flagStrips(),
      retake: hud.retakeDrawn(),
      sky: scene.skyDrawn(),
      help: hud.helpDrawn(),
    }),
    course: () => courseName,
    choosing: () => choosing,
    app: () => ({ worker, offered: offer.offered, standalone: matchMedia('(display-mode: standalone)').matches }),
    install: () => offer.prompt(),
    title() {
      const t = titled;
      const at = { lettersAt: marks.letters, courseAt: marks.course };
      if (!t) return { up: false, t: 0, landed: false, cards: false, fit: null, alive: titlesAlive, pieces: [], ...at };
      // the camera and the word's plane as they stand now, so a box is of the frame that would be drawn
      titleCamera(t);
      cam.update();
      titleFrame(cam, t.fit, t.word, t.frame);
      const r = canvas.getBoundingClientRect();
      return {
        up: true,
        ...at,
        alive: titlesAlive,
        t: t.scene.t,
        landed: t.scene.landed,
        cards: !document.getElementById('start')!.hidden,
        fit: { share: t.fit.share, centre: [...t.fit.centre] as [number, number] },
        pieces: t.pieces.map((piece) => {
          const pose = t.scene.pose(piece, { shown: true, lift: 0, sx: 1, sy: 1 });
          let box: [number, number, number, number] | null = null;
          if (pose.shown) {
            titleBoxOf(t.box, cam.viewProjection, t.frame, piece.pivot, piecesBounds(piece), pose);
            // from -1 to 1 with y up to the page's own pixels
            box = [
              r.left + ((t.box[0] + 1) / 2) * r.width,
              r.top + ((1 - t.box[3]) / 2) * r.height,
              r.left + ((t.box[2] + 1) / 2) * r.width,
              r.top + ((1 - t.box[1]) / 2) * r.height,
            ];
          }
          return {
            name: piece.name,
            kind: piece.kind,
            owner: piece.owner,
            step: piece.step,
            shown: pose.shown,
            lift: pose.lift,
            sx: pose.sx,
            sy: pose.sy,
            box,
          };
        }),
      };
    },
    playMode: (mode) => {
      const button = document.getElementById('playMode') as HTMLButtonElement;
      if (button.dataset.mode !== mode) button.click();
    },
    continueRound: () => {
      // the picker opens on the course of the round kept, whose Play is Continue; nothing to press without one
      const play = document.getElementById('playCourse') as HTMLButtonElement;
      if (play.textContent !== 'Continue') return false;
      play.click();
      return true;
    },
    // a tour's event card's buttons, pressed as a player does: its tab, then the button, if it is there to be pressed
    enter: (tour) => {
      document.getElementById(tour === 'golf' ? 'tab-golf' : 'tab-minigolf')!.click();
      const button = document.getElementById('enterEvent') as HTMLButtonElement;
      if (button.hidden || button.disabled) return false;
      button.click();
      return true;
    },
    practise: (tour) => {
      document.getElementById(tour === 'golf' ? 'tab-golf' : 'tab-minigolf')!.click();
      const button = document.getElementById('practise') as HTMLButtonElement;
      if (button.hidden) return false;
      button.click();
      return true;
    },
    board: () => hud.boardShown(),
    tournamentHud: (view) => {
      if (view.events !== undefined) hud.setEvents(view.events);
      if (view.board !== undefined) hud.setBoard(view.board);
      if (view.results !== undefined)
        hud.finished(
          game.course,
          game.course.map((h) => h.par),
          { bests: [], prize: view.results?.prize ?? null, record: false, free: false },
          view.results,
        );
    },
    chooseCourse: (name) => {
      // as a player does: the course's tab pressed, the next arrow pressed until the course is in view, and Play pressed. In
      // the career the tabs show the season's events, which no arrow steps from; a test that wants a course of its own has the
      // events put away first, a shortcut no player has, and its round pays its holes and keeps nothing (`enter` is the event's way)
      const course = pickable.find((c) => c.name === name);
      if (!course) throw new Error(`no course called ${name} on the start screen`);
      hud.setEvents(null);
      (document.getElementById(course.golf ? 'tab-golf' : 'tab-minigolf') as HTMLButtonElement).click();
      const next = document.getElementById('courseNext') as HTMLButtonElement;
      const shown = () => document.getElementById('courseName')!.textContent;
      for (let k = 0; k < COURSES.length && shown() !== name; k++) next.click();
      if (shown() !== name) throw new Error(`the picker could not reach ${name}`);
      (document.getElementById('playCourse') as HTMLButtonElement).click();
    },
    async grass() {
      await grown;
      const drawn = await renderer.grassDrawn();
      const { direction, strength } = renderer.wind;
      return { ...drawn, wind: { direction: [direction[0], direction[1]], strength } };
    },
    dust: () => drawn.dust,
    theme() {
      const { sky, background, sunDir } = renderer.look;
      return {
        name: lookedAs,
        sky: { zenith: [...(sky?.zenith ?? [])], horizon: [...(sky?.horizon ?? [])], height: sky?.height ?? 0 },
        background: [...background],
        sunDir: [...sunDir],
        fog: [...renderer.fog.colour],
        environment: lookedEnv,
        grass: blades,
      };
    },
    async bladesAround(x, y, radius) {
      await grown;
      const { near, far } = await renderer.grassBlades();
      let n = 0;
      for (const b of [...near, ...far]) if (Math.hypot(b.x - x, b.y - y) <= radius) n++;
      return n;
    },
    sound: () => ({ ...sound.state, shown: hud.soundShown(), context: audioContext?.state ?? 'none' }),
    mute: setMuted,
    volume: setVolume,
    wake,
    events: eventLog,
  });

  let last = performance.now();
  const frame = (now: number) => {
    // a page stopped on the boot screen is not asked for another frame, and the loop ends
    if (stopped()) return;
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
    if (stopped()) return;
    probe(draw(dt));
  };
  ready = true;
  bootMs = performance.now();
  requestAnimationFrame(frame);
  // the service worker, after the game is ready and never before: a boot is the first frame's business, and the worker's
  // caching of the build is for the next boot, not this one
  if (shouldRegister({ prod: import.meta.env.PROD, search: location.search, supported: 'serviceWorker' in navigator }))
    registerWorker(navigator.serviceWorker, (state) => {
      worker = state;
    });
}
