/**
 * What the page works out and shows while a shot is aimed: on a golf hole the flight drawn and said in words, the pin and the
 * green's break read off the ball where it lies, the grass pressed flat round it, and the map redrawn with the ball, the aim
 * and what the camera shows; on a hole of minigolf whose ground leans, the roll the drag would make and its break. Without
 * this file the page would hold them in the middle of `main()`, with seven pieces of state that only they read, and a hole
 * beginning would have to forget each of them by name, which is how `puttedFor` came to be left out.
 *
 * It is the picture's (it draws on the renderer, the scene and the hud), and it takes all of those as arguments, with a
 * getter for each thing that changes under it: it imports no state and is imported by the page alone. Everything it writes
 * each frame goes into storage it made once.
 */
import type { GameRenderer } from 'artshape-render/game/renderer';
import { markScale } from './aimview';
import { END_RING, SPREAD_SHOWN, type Preview, type Previewer } from './preview';
import { heightAt, lieAt } from './arena';
import { flightStale, restedAnew, rollStale, type PreviewedShot } from './aimstale';
import { PUTTER } from './bag';
import { BIOMES } from './biome';
import { standOf, tallOf, type CameraRig } from './camera';
import type { Game } from './game';
import { breakAids, breakOf, readerArrows } from './green';
import { mapInto, type MapSize } from './holemap';
import type { Hud } from './hud';
import { landingText, pinReadout, pinText, puttText } from './readout';
import type { Scene } from './scene';
import { groundAt } from './shot';
import { flattenFor } from './turf';

/** What the aim leaves for the test API to read back of the grass pressed under the ball. */
export interface AimDrawn {
  press: { x: number; y: number; radius: number } | null;
  took: boolean;
}

/** What changes under the readout from hole to hole, which it asks for each frame and keeps no copy of. */
export interface AimSources {
  /** The rehearsal of this hole's shots, or none on a hole that needs none. */
  previewer: () => Previewer | null;
  /** The hole's map as it was painted, or none. */
  mapped: () => { size: MapSize } | null;
  /** Whether the ground of this hole of minigolf leans. */
  leans: () => boolean;
  /** The screen's shape, which how far back the camera stands depends on. */
  aspect: () => number;
}

/** The aim's readout, built once and written into each frame. */
export class AimReadout {
  /** The shot the preview was last worked out for, so it is worked out again only when the aim, the club or the ball changes. */
  private readonly previewed: PreviewedShot = {
    x: NaN,
    y: NaN,
    angle: NaN,
    power: NaN,
    club: '',
    shape: NaN,
    spin: NaN,
    tick: NaN,
  };
  private previewShown = false;
  /** The preview the scene was last handed, a flight or a putt's roll, which the test API reads back with what was drawn of it. */
  private shown: Preview | null = null;
  /** Where the ball was when the pin was last read, so it is read again only when it has moved. */
  private readonly pinned = { x: NaN, y: NaN };
  /** Where the ball was when the putt's break was last read, so a loop of a hundred and more steps is run once for a ball at rest and never in a frame. */
  private readonly putted = { x: NaN, y: NaN };
  /** Which arrows the putt's words were last worked out for, so the reader's club chosen at rest has them said again. */
  private puttedFor: 'green' | 'near' | null = null;
  /** Where the ball was when the break reader's arrows were last placed round it, so they are placed once for a ball at rest. */
  private readonly read = { x: NaN, y: NaN };
  /** The disc of grass pressed round a ball at rest in the rough, written each frame: nothing is made. */
  private readonly flatten = { x: 0, y: 0, radius: 0 };
  /** The camera's four corners on the ground, made once, and the ground a point of the map is worked out from. */
  private readonly corners: [number, number][] = [
    [0, 0],
    [0, 0],
    [0, 0],
    [0, 0],
  ];

  constructor(
    private readonly game: Game,
    private readonly renderer: GameRenderer,
    private readonly scene: Scene,
    private readonly hud: Hud,
    private readonly rig: CameraRig,
    private readonly cam: Parameters<typeof groundAt>[0],
    private readonly drawn: AimDrawn,
    private readonly wind: { x: number; y: number },
    private readonly sources: AimSources,
  ) {}

  /** The preview the scene was last handed, or none. */
  get preview(): Preview | null {
    return this.shown;
  }

  /**
   * A hole begun: nothing is previewed, read or shown of the one before. The pin is read off the ball from the first frame
   * of a golf hole, and the putt's break when the ball rests. `puttedFor` is forgotten with the rest, which the page left out.
   */
  reset() {
    this.previewed.club = '';
    this.previewShown = false;
    this.shown = null;
    this.pinned.x = NaN;
    this.putted.x = NaN;
    this.puttedFor = null;
    this.read.x = NaN;
    this.scene.setShot(null);
    this.hud.setLanding(null);
    this.hud.setPutt(null);
    this.scene.setArrows(false);
  }

  /**
   * What a golf hole shows of the shot in hand and of where the ball is: the flight drawn, and said in words, when a
   * lofted shot is being aimed, worked out again only when the aim, the club or the ball has changed; the pin read off
   * the ball when it lies at rest; and the map redrawn with the ball, the aim and what the camera shows over it.
   */
  onGolf(flying: { angle: number; power: number } | null, rolling: { angle: number; power: number } | null) {
    const { game, renderer, scene, hud, rig, drawn, previewed, pinned, putted, read, sources } = this;
    const { world, ball, layout, inHand, shape, spin } = game;
    const x = world.x[ball],
      y = world.y[ball];
    // a ball at rest in the rough is seen, and not lost among the blades: the grass is pressed flat in a disc round it, every
    // frame it lies there (the press stands again a few seconds after, so it holds for as long as the ball is there and goes
    // when it is struck)
    const flat = flattenFor(layout, x, y, game.ready, this.flatten);
    // pressed at the game's time as it is now, which the grass reads the press's age from, and not the last frame's
    renderer.time = game.t;
    drawn.took = flat ? renderer.press(flat.x, flat.y, flat.radius, this.wind.x, this.wind.y) : false;
    drawn.press = flat;
    // a lofted shot is drawn as its flight and a putt, on a hole whose greens are set, as its roll: the same marks, the one
    // worked out in the air and the other along the ground
    const aimed = flying ?? rolling;
    const previewer = sources.previewer();
    if (aimed && previewer) {
      if (flightStale(previewed, x, y, aimed.angle, aimed.power, inHand.id, shape, spin)) {
        previewed.x = x;
        previewed.y = y;
        previewed.angle = aimed.angle;
        previewed.power = aimed.power;
        previewed.club = inHand.id;
        previewed.shape = shape;
        previewed.spin = spin;
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
      const r = Math.min(rig.distance * tallOf(sources.aspect()), standOf(sources.aspect()));
      this.shown = flying ? previewer.result : previewer.rolled;
      scene.setShot(this.shown, markScale(r));
      this.previewShown = true;
    } else if (this.previewShown) {
      this.shown = null;
      scene.setShot(null);
      hud.setLanding(null);
      previewed.club = '';
      this.previewShown = false;
    }
    // the pin from where the ball lies at rest, read again only when it has moved
    if (game.ready && restedAnew(pinned, x, y)) {
      pinned.x = x;
      pinned.y = y;
      hud.setPin(pinText(pinReadout(layout, x, y)));
    }
    // the green's arrows are shown, and the putt's break said, while the ball rests on the putting green or the first cut of a
    // hole being played; the break is worked out when the ball comes to rest and never again for it
    // (the break reader shows them off the green too, round the ball, for a putter in hand)
    const lie = lieAt(layout, x, y);
    const aids = breakAids(lie, inHand.loft, game.kit.chalk, game.def.greens !== undefined);
    const rested = game.ready && game.phase === 'play';
    scene.setArrows(rested && aids.arrows === 'green');
    const nearBall = rested && aids.arrows === 'near';
    if (nearBall) {
      if (restedAnew(read, x, y)) {
        read.x = x;
        read.y = y;
        scene.setReaderArrows(readerArrows(layout, x, y));
      }
    } else if (!Number.isNaN(read.x)) {
      read.x = NaN;
      scene.setReaderArrows(null);
    }
    if (rested && aids.words) {
      if (restedAnew(putted, x, y, this.puttedFor, aids.arrows)) {
        putted.x = x;
        putted.y = y;
        this.puttedFor = aids.arrows;
        hud.setPutt(puttText(breakOf(layout, x, y, game.greens, game.ground)));
      }
    } else if (!Number.isNaN(putted.x)) {
      putted.x = NaN;
      hud.setPutt(null);
    }
    const mapped = sources.mapped();
    if (!mapped) return;
    const o = hud.overlay;
    const { size } = mapped;
    mapInto(size, x, y, o.ball);
    o.aim = false;
    o.spread = false;
    if (this.previewShown && previewer && previewer.result.n > 1 && flying) {
      const p = previewer.result;
      o.aim = true;
      mapInto(size, p.x, p.y, o.to);
      o.ring = END_RING(p.end);
      const { across, along } = p.footprint;
      if (p.end !== 'holed' && p.end !== 'water' && (across >= SPREAD_SHOWN || along >= SPREAD_SHOWN)) {
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
    const { corners } = this;
    let sky = false;
    for (let k = 0; k < 4; k++) {
      const c = groundAt(this.cam, k === 0 || k === 3 ? -1 : 1, k < 2 ? -1 : 1, z, corners[k]);
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
  onSlope(aimed: { angle: number; power: number } | null) {
    const { game, scene, hud, rig, previewed, putted, sources } = this;
    const { world, ball, layout } = game;
    const x = world.x[ball],
      y = world.y[ball];
    // what moves on a hole of minigolf is posed by game time, so the roll is worked out again a few times a second while the aim is held
    const tick = game.obstacles.pushers.length ? Math.floor(game.t * 4) : 0;
    const previewer = sources.previewer();
    if (aimed && previewer) {
      if (rollStale(previewed, x, y, aimed.angle, aimed.power, game.shape, game.spin, tick)) {
        previewed.x = x;
        previewed.y = y;
        previewed.angle = aimed.angle;
        previewed.power = aimed.power;
        previewed.club = PUTTER.id;
        previewed.shape = game.shape;
        previewed.spin = game.spin;
        previewed.tick = tick;
        previewer.roll({ x, y }, PUTTER, aimed.angle, aimed.power, game.shape, game.spin);
      }
      this.shown = previewer.rolled;
      scene.setShot(
        this.shown,
        markScale(Math.min(rig.distance * tallOf(sources.aspect()), standOf(sources.aspect()))),
      );
      this.previewShown = true;
    } else if (this.previewShown) {
      this.shown = null;
      scene.setShot(null);
      previewed.club = '';
      this.previewShown = false;
    }
    // the arrows over the floor and the break in words are for a hole whose ground leans; a level one shows only the roll
    if (!sources.leans()) return;
    const resting = game.ready && game.phase === 'play';
    scene.setArrows(resting);
    if (resting) {
      if (restedAnew(putted, x, y)) {
        putted.x = x;
        putted.y = y;
        hud.setPutt(puttText(breakOf(layout, x, y, undefined, game.ground)));
      }
    } else if (!Number.isNaN(putted.x)) {
      putted.x = NaN;
      hud.setPutt(null);
    }
  }
}
