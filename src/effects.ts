/**
 * The glows and sparks of the frame: the gold that twinkles on the cup's rim and the pin's knob, the sun on the water, the
 * flash of a kicker a ball has hit, the glow ball's trail, and the fireworks over the cup. They are all written, each frame,
 * into buffers made once, and handed to the renderer. Without this file the page would hold them in the middle of `main()`,
 * and the five places the gold glints at would be made again every frame, though the cup does not move within a hole.
 *
 * It is the picture's (it imports the renderer), and it takes the game, the camera, the scene and the quality governor as
 * arguments: it imports no state and is imported by the page alone.
 */
import { EFFECT_STRIDE, type GameRenderer } from 'artshape-render/game/renderer';
import { BALL, KICKER, KIND_RADIUS, heightAt, type Layout } from './arena';
import { FIREWORK_STEPS, fireworkAt, fireworkEmits } from './bursts';
import type { Game } from './game';
import { SPARKLE, flash, glint, kickFlash } from './glints';
import { PALETTE } from './models/palette';
import { projectInto } from './shot';

import { RUNGS, type Governor } from './quality';
import type { Scene } from './scene';
import { SPRITE_FLOATS, TRAIL, Trail, trailDrawn, trailInto } from './trail';

/** Where round the cup's rim the gold glints, in radians. */
export const RIM_ANGLES = [0.3, 1.9, 3.4, 4.9] as const;
/** The places the gold has: one at each of those angles, and the knob on the pin after them. */
export const RIM_PLACES = RIM_ANGLES.length + 1;
/** How high the knob stands over the cup's ground, and how far over the ground the rim's glints hang. */
const KNOB_HEIGHT = 8.75;
const RIM_HEIGHT = 0.1;
/** How far outside the cup's own edge the glints sit. */
const RIM_OUTSIDE = 0.15;

/**
 * The gold's places for a cup of this `radius` on this layout, written into `out` as x, y, z for each: the four round the rim
 * and the knob on the pin. On the ground the cup is cut in, however high that stands, and all round its rim where it slopes.
 */
export function rimPlacesInto(layout: Layout, radius: number, out: Float64Array) {
  const { cup } = layout;
  const rim = radius + RIM_OUTSIDE;
  for (let k = 0; k < RIM_ANGLES.length; k++) {
    const x = cup.x + Math.cos(RIM_ANGLES[k]) * rim,
      y = cup.y + Math.sin(RIM_ANGLES[k]) * rim;
    out[k * 3] = x;
    out[k * 3 + 1] = y;
    out[k * 3 + 2] = heightAt(layout, x, y) + RIM_HEIGHT;
  }
  const o = RIM_ANGLES.length * 3;
  out[o] = cup.x;
  out[o + 1] = cup.y;
  out[o + 2] = heightAt(layout, cup.x, cup.y) + KNOB_HEIGHT;
}

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
/** The kicker's flash: warm, a little smaller than the gold's, and round. */
const KICK: Glow = { size: 0.05, power: 3, colour: [1, 0.78, 0.45], falloff: 2.6 };

/** What the frame drew of these, which the page's test API reads back: the page owns the object, and this writes into it. */
export interface EffectsDrawn {
  glints: number;
  sparkles: number;
  kicks: number;
  trail: number;
}

/** The effects of a frame, built once with what they read, and written into storage of their own. */
export class Effects {
  /** The fireworks over the cup: when the hole was holed, in game time, and the next step to go off (all of them, once they are over). */
  private readonly fireworks = { at: 0, step: FIREWORK_STEPS };
  /** The glow ball's trail: a ring made once and the sprites it is written into each frame, used only with the item held. */
  private readonly trail = new Trail();
  private readonly trailSprites = new Float32Array(TRAIL.most * SPRITE_FLOATS);
  /** Room for a glint at every place the gold is, which a flash lights all at once, and the sparkles of the water after them. */
  private readonly glintQuad: Float32Array<ArrayBuffer>;
  /** Where `glow` found its point on the screen, written by `projectInto` so that nothing is made each frame. */
  private readonly scratch = new Float64Array(2);
  /** Where the water's sparkles are this frame, four numbers each: written into, never made. */
  private readonly sparkQuads = new Float32Array(SPARKLE.most * 4);
  /** The gold's places on this hole, x, y and z each: worked out as the hole begins, since the cup does not move within it. */
  private readonly places = new Float64Array(RIM_PLACES * 3);
  /** When each kicker of this hole was last hit, in game time: a kicker a hole, made as the hole begins, so never more than it has. */
  private kickedAt: number[] = [];

  constructor(
    private readonly renderer: GameRenderer,
    private readonly cam: { readonly viewProjection: ArrayLike<number> },
    private readonly scene: Scene,
    private readonly game: Game,
    private readonly governor: Governor,
    private readonly drawn: EffectsDrawn,
    private readonly capacity: number,
  ) {
    this.glintQuad = new Float32Array(EFFECT_STRIDE * capacity);
  }

  /**
   * A hole begun: the gold's places worked out for it, and no kicker lit. The cup's width is the kit's as the hole began
   * (`Game.begin` reads it then and the shop cannot move it before the next), and the layout is made with the hole, so
   * neither changes until this is called again.
   */
  begun(layout: Layout, cupRadius: number) {
    rimPlacesInto(layout, cupRadius, this.places);
    this.kickedAt = layout.kickers.map(() => -Infinity);
  }

  /** The fireworks go up over the cup, a shell at a time, from game time `t`. */
  launch(t: number) {
    this.fireworks.at = t;
    this.fireworks.step = 0;
  }

  /** Whatever fireworks were going are over: a new hole has begun. */
  stopFireworks() {
    this.fireworks.step = FIREWORK_STEPS;
  }

  /** The glow ball's trail forgotten: the ball has been put somewhere else. */
  clearTrail() {
    this.trail.clear();
  }

  /** Kicker `k` was hit at game time `t`, and lights up; a hit on it again lights it anew. */
  kicked(k: number, t: number) {
    this.kickedAt[k] = t;
  }

  /** The quads the frame wrote, which the test API reads the sparkles' places back from. */
  get quads(): Float32Array<ArrayBuffer> {
    return this.glintQuad;
  }

  /** The fireworks that are due by game time, thrown over the cup: none when none is under way. */
  flyFireworks() {
    const { fireworks, game } = this;
    if (fireworks.step >= FIREWORK_STEPS) return;
    const { cup } = game.layout;
    const z = heightAt(game.layout, cup.x, cup.y);
    while (fireworks.step < FIREWORK_STEPS && game.t - fireworks.at >= fireworkAt(fireworks.step)) {
      for (const e of fireworkEmits(cup.x, cup.y, z, fireworks.step)) this.renderer.emit(e);
      fireworks.step++;
    }
  }

  /**
   * The glow ball's trail: the ball's place stamped into the ring as it moves and the ring written out as sprites, each
   * frame, with the item held and the picture on a rung that draws particles (the renderer gives sprites up with them, and
   * the lowest rungs have no room for the glow). Without the item nothing is written, and what was drawn is put away once.
   */
  glowTrail() {
    const { game, trail, trailSprites, drawn, renderer } = this;
    const { world, ball } = game;
    if (!trailDrawn(game.kit.trail, RUNGS[this.governor.rung])) {
      trail.clear();
      if (drawn.trail) renderer.setSprites(trailSprites, (drawn.trail = 0));
      return;
    }
    // only a ball that is going leaves a place: one at rest on the tee would glow there for as long as time stood still
    if (world.alive[ball] && Math.hypot(world.vx[ball], world.vy[ball], world.vz[ball]) > TRAIL.moving)
      trail.record(game.t, world.x[ball], world.y[ball], world.z[ball]);
    drawn.trail = trailInto(trailSprites, trail, game.t, KIND_RADIUS[BALL], PALETTE.trail);
    renderer.setSprites(trailSprites, drawn.trail);
  }

  /** A glow, `brightness` from 0 to 1, at quad `k`, where (x, y, z) is on the screen. */
  private glow(k: number, x: number, y: number, z: number, brightness: number, look: Glow = GOLD) {
    const quad = this.glintQuad;
    const o = k * EFFECT_STRIDE;
    projectInto(this.cam.viewProjection, x, y, z, this.scratch);
    quad[o] = this.scratch[0];
    quad[o + 1] = this.scratch[1];
    quad[o + 2] = look.size * brightness;
    quad[o + 3] = look.power * brightness;
    quad[o + 4] = look.colour[0];
    quad[o + 5] = look.colour[1];
    quad[o + 6] = look.colour[2];
    quad[o + 7] = look.falloff;
  }

  /** The gold's glow this frame into the first quads: how many. The glint of the moment; or all of them, as a ball drops. */
  private gold(): number {
    const { places, game } = this;
    const lit = flash(game.t - this.scene.holedAt);
    if (lit > 0) {
      const count = Math.min(RIM_PLACES, this.capacity);
      for (let k = 0; k < count; k++) this.glow(k, places[k * 3], places[k * 3 + 1], places[k * 3 + 2], lit);
      return count;
    }
    const g = glint(game.t, RIM_PLACES);
    if (g.brightness <= 0) return 0;
    this.glow(0, places[g.at * 3], places[g.at * 3 + 1], places[g.at * 3 + 2], g.brightness);
    return 1;
  }

  /**
   * The glows of the frame: the gold's, and after them, in what room is left, the sparkles of sun on the water, and the
   * kickers a ball has just hit. The title is no hole to play: with it up the gold's twinkle and the cup's flash are not
   * there, so no white spot shows in it.
   */
  shine(titled: boolean) {
    const { drawn, game, sparkQuads, kickedAt } = this;
    if (titled) {
      drawn.glints = drawn.sparkles = drawn.kicks = 0;
      this.renderer.setEffects(this.glintQuad, 0);
      return;
    }
    let used = (drawn.glints = this.gold());
    const sparks = this.scene.sparkleInto(game.t, sparkQuads);
    let lit = 0;
    for (; lit < sparks && used < this.capacity; lit++)
      this.glow(
        used++,
        sparkQuads[lit * 4],
        sparkQuads[lit * 4 + 1],
        sparkQuads[lit * 4 + 2],
        sparkQuads[lit * 4 + 3],
        SUN,
      );
    drawn.sparkles = lit;
    // the kickers a ball has just hit, after all the rest, in what room is left
    drawn.kicks = 0;
    const { kickers } = game.layout;
    for (let i = 0; i < kickers.length; i++) {
      const flashing = kickFlash(game.t - (kickedAt[i] ?? -Infinity));
      if (flashing <= 0 || used >= this.capacity) continue;
      const k = kickers[i];
      this.glow(used++, k.x, k.y, heightAt(game.layout, k.x, k.y) + KICKER.height + 0.2, flashing, KICK);
      drawn.kicks++;
    }
    this.renderer.setEffects(this.glintQuad, used);
  }
}
