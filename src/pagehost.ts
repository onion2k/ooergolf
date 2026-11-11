/**
 * What the test API reads back from the page: where a point is on the screen, how the view and the framing stand, the
 * motions of the frame as the last one drew them, and the title's pieces and their boxes. They are the page's own reading of
 * the renderer, the camera and the DOM, held here so that `main()` wires the game and does not also answer for how a test
 * sees it. Without this file those hundred lines sit in the middle of the function that builds the page, among the things
 * they read, and the gold's sparkles and the title's boxes are worked out in pixels in two places that must agree.
 *
 * It is the picture's (it reads the renderer and the page), and it takes everything it reads as arguments, and a getter for
 * each thing that changes under it: it imports no state and is imported by the page alone. Each answer is exactly what the
 * page gave before it was moved here: the smoke tests compile against `GameApi` and read these values.
 */
import { EFFECT_STRIDE, antialiasFor, type GameRenderer } from 'artshape-render/game/renderer';
import { safeBox } from './aimview';
import type { AimReadout } from './aimreadout';
import type { CameraRig } from './camera';
import type { Director } from './director';
import type { Effects } from './effects';
import type { Game } from './game';
import { flash } from './glints';
import type { Hud } from './hud';
import type { Input } from './input';
import { framingProblems } from './invariants';
import type { TitlePiece } from './models/lettering';
import type { Governor } from './quality';
import type { Scene } from './scene';
import { projectInto } from './shot';
import { waggle } from './sway';
import {
  boxOf as titleBoxOf,
  piecesBounds,
  titleFrame,
  type Frame,
  type TitleFit,
  type TitleScene,
  type Word,
} from './titlescene';

/** The camera the renderer draws with, which the page keeps one of for its life. */
type Cam = GameRenderer['camera'];

/** What of the title as it is drawn the test API reads: the page's `TitleDraw` is this and more. */
export interface TitleSeen {
  scene: TitleScene;
  pieces: readonly TitlePiece[];
  word: Word;
  fit: TitleFit;
  frame: Frame;
  /** Where the corners are on the screen, written into by `title()` and never made. */
  box: number[];
}

/** What the last frame drew of what answers, which `motions()` reports: the page writes it and this reads it. */
export interface HostDrawn {
  squash: number;
  pulse: number;
  glints: number;
  sparkles: number;
  kicks: number;
  trail: number;
  confetti: number;
  puff: 'sand' | 'grass' | null;
  press: { x: number; y: number; radius: number } | null;
  took: boolean;
}

/** The parts of the page the host reads, which are made once and never replaced. */
export interface HostParts {
  game: Game;
  renderer: GameRenderer;
  cam: Cam;
  canvas: HTMLCanvasElement;
  scene: Scene;
  hud: Hud;
  rig: CameraRig;
  director: Director;
  governor: Governor;
  input: Input;
  effects: Effects;
  aim: AimReadout;
  drawn: HostDrawn;
  /** Where the furthest a shot can reach is, written into for the framing and never made. */
  reaching: { x: number; y: number; z: number };
  /** Where the title's letters and the course picker were last drawn from, which the page keeps. */
  marks: { letters: number | null; course: number | null };
}

/** What changes under the host, or is the page's to do, each read when it is asked for. */
export interface HostSources {
  /** The title as drawn, or none once a course is chosen. */
  titled(): TitleSeen | null;
  /** How many title scenes the page has made and not seen collected. */
  titlesAlive(): number;
  /** The screen's shape. */
  aspect(): number;
  /** Whether the test API has parked the camera. */
  parked(): boolean;
  /** Whether the course picker is up. */
  choosing(): boolean;
  /** The camera placed for the title, as the page places it. */
  titleCamera(t: TitleSeen): void;
}

export class PageHost {
  /** Where a point was found on the screen, written by `projectInto` so that nothing is made for each. */
  private readonly scratch = new Float64Array(2);

  constructor(
    private readonly parts: HostParts,
    private readonly sources: HostSources,
  ) {}

  /** Where a point in the world is on the page, in pixels, as the camera is placed now. */
  project = (x: number, y: number, z: number): { x: number; y: number } => {
    const { rig, cam, game, canvas } = this.parts;
    rig.place(cam, game.t);
    cam.update();
    projectInto(cam.viewProjection, x, y, z, this.scratch);
    const nx = this.scratch[0],
      ny = this.scratch[1];
    const r = canvas.getBoundingClientRect();
    return { x: r.left + ((nx + 1) / 2) * r.width, y: r.top + ((1 - ny) / 2) * r.height };
  };

  /**
   * The framing as the camera is placed now: where the ball and the furthest reach are on the screen (from minus one to one
   * each way), the safe box, whether the view has settled so that the rule is asked of it, and what is wrong with it if it
   * has. Not asked while the camera is parked by a test, gliding to a tee, easing, turning or overhead.
   */
  private framing() {
    const { game, rig, cam, director, reaching } = this.parts;
    const { world, ball } = game;
    rig.place(cam, game.t);
    cam.update();
    const box = safeBox(this.sources.aspect(), innerHeight);
    const at = (x: number, y: number, z: number): [number, number] => {
      const found: [number, number] = [0, 0];
      projectInto(cam.viewProjection, x, y, z, found);
      return found;
    };
    const there = { x: world.x[ball], y: world.y[ball], z: world.z[ball] };
    const reach = director.reachPoint(reaching) ? reaching : null;
    const settled =
      !this.sources.parked() &&
      !this.sources.choosing() &&
      !rig.easing(game.t) &&
      !rig.aiming &&
      !rig.turning &&
      rig.blend === 0;
    return {
      ball: at(there.x, there.y, there.z),
      reach: reach ? at(reach.x, reach.y, reach.z) : null,
      box,
      settled,
      problems: settled ? framingProblems(rig, cam, there, reach, box) : [],
    };
  }

  /** How the view stands: the framing, the rig's distance and turn, the quality rung and the putt shown. */
  view = () => {
    const { game, rig, director, governor, renderer, input, cam, hud } = this.parts;
    return {
      framing: this.framing(),
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
      flying: rig.flying(game.t),
      circling: rig.circling(game.t),
      ...rig.view(game.t),
      putt: hud.puttDrawn().putt,
      greens: hud.puttDrawn().greens,
    };
  };

  /** What the last frame drew of what moves: the ball's squash, the gold and the water's glints, the preview, the arrows. */
  motions = () => {
    const { game, scene, rig, drawn, canvas, effects, aim, hud } = this.parts;
    return {
      squash: drawn.squash,
      waggle: waggle(game.t - scene.holedAt),
      flash: flash(game.t - scene.holedAt),
      glints: drawn.glints,
      glide: rig.gliding(game.t),
      pulse: drawn.pulse,
      sparkles: drawn.sparkles,
      // read back from the quads the frame wrote, which come after the gold's
      sparklesAt: Array.from({ length: drawn.sparkles }, (_, k) => {
        const o = (drawn.glints + k) * EFFECT_STRIDE;
        const r = canvas.getBoundingClientRect();
        return {
          x: r.left + ((effects.quads[o] + 1) / 2) * r.width,
          y: r.top + ((1 - effects.quads[o + 1]) / 2) * r.height,
        };
      }),
      splash: scene.splashReach(game.t),
      puff: drawn.puff,
      landing: scene.landingMark(),
      // the grass pressed flat round the ball this frame: where and how wide, or none
      press: drawn.press ? { ...drawn.press, took: drawn.took } : null,
      // the preview of the shot in hand as the last frame placed it, and what it comes to
      shot: (() => {
        const m = scene.shotMarks();
        if (!m.ring || !aim.preview) return null;
        const p = aim.preview;
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
    };
  };

  /** The title: whether it is up, its clock, and where each piece of the lettering is on the page. */
  title = () => {
    const { cam, canvas, marks } = this.parts;
    const t = this.sources.titled();
    const alive = this.sources.titlesAlive();
    const at = { lettersAt: marks.letters, courseAt: marks.course };
    if (!t) return { up: false, t: 0, landed: false, cards: false, fit: null, alive, pieces: [], ...at };
    // the camera and the word's plane as they stand now, so a box is of the frame that would be drawn
    this.sources.titleCamera(t);
    cam.update();
    titleFrame(cam, t.fit, t.word, t.frame);
    const r = canvas.getBoundingClientRect();
    return {
      up: true,
      ...at,
      alive,
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
  };
}
