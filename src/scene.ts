/**
 * The course as it is drawn: the grass mown in stripes, the rail round it and
 * the rough beyond, which do not move; and the ball and the aim, which do.
 * The groups are fixed once, and each frame only where everything is written
 * into them. It is handed what it draws from, and never the renderer.
 *
 * The look is a cartoon's, for toon shading: every colour flat and bright,
 * given by placement and never by texture, and the words all in the page.
 */
import type { GameGroup } from 'artshape-render/game/renderer';
import { MATERIAL_STRIDE } from 'artshape-render/game/renderer';
import { BALL, COLS, FLOOR, KIND_RADIUS, ORIGIN_X, ORIGIN_Y, ROWS, TILE } from './arena';
import { place } from './matrix';
import { ball, box, square } from './meshes';
import type { World } from './physics';
import type { Shot } from './shot';

/** How tall the rail stands: a little over the ball, so it reads as the thing the ball banks off. */
const RAIL_HEIGHT = 1.6;
/** How wide each mown stripe of the grass is, across the course. */
const STRIPE = 6;
/**
 * The colours, and how rough each is. Deeper than they look written down:
 * toon light is at a colour's full strength, and washed a pale green out to
 * mint and a white rail out to a glare, as bearing found with its sweets.
 */
export const PALETTE = {
  grass: [0.1, 0.42, 0.08, 0.85],
  grassMown: [0.16, 0.52, 0.12, 0.85],
  rough: [0.06, 0.26, 0.07, 0.95],
  rail: [0.58, 0.3, 0.13, 0.55],
  ball: [0.98, 0.98, 0.96, 0.25],
  /** The aim's dots, from a gentle putt to the hardest shot. */
  aimSoft: [0.35, 0.95, 0.4],
  aimHard: [1.0, 0.25, 0.15],
} as const;

/** How many dots the aim has at most, and how far along the course it reaches at the hardest shot. */
export const AIM_DOTS = 14;
const AIM_REACH = 18;
const AIM_RADIUS = 0.36;

export class Scene {
  /** The moving placements, one pool a group: the ball, then the aim's dots and their colours. */
  readonly ball = new Float32Array(16);
  readonly aim = new Float32Array(AIM_DOTS * 16);
  readonly aimLooks = new Float32Array(AIM_DOTS * MATERIAL_STRIDE);

  /** What does not move. */
  static(solid: Uint8Array): GameGroup[] {
    const width = FLOOR.maxX - FLOOR.minX,
      depth = FLOOR.maxY - FLOOR.minY;
    const stripes = Math.ceil(depth / STRIPE);
    const grass = new Float32Array(stripes * 16),
      grassLooks = new Float32Array(stripes * MATERIAL_STRIDE);
    for (let k = 0; k < stripes; k++) {
      const y0 = FLOOR.minY + k * STRIPE,
        y1 = Math.min(FLOOR.maxY, y0 + STRIPE);
      place(grass, k, (FLOOR.minX + FLOOR.maxX) / 2, (y0 + y1) / 2, 0, 0, width, y1 - y0, 1);
      grassLooks.set(k % 2 ? PALETTE.grassMown : PALETTE.grass, k * MATERIAL_STRIDE);
    }
    const rail: number[] = [];
    for (let ty = 0; ty < ROWS; ty++) for (let tx = 0; tx < COLS; tx++) if (solid[ty * COLS + tx]) rail.push(tx, ty);
    const rails = new Float32Array((rail.length / 2) * 16);
    for (let k = 0; k < rail.length; k += 2)
      place(rails, k / 2, ORIGIN_X + (rail[k] + 0.5) * TILE, ORIGIN_Y + (rail[k + 1] + 0.5) * TILE, 0);
    // the rough beyond the rail, just under the course, so the course is somewhere and not floating in the sky
    const rough = new Float32Array(16);
    place(rough, 0, 0, 0, -0.05, 0, 600, 600, 1);
    const [rr, rg, rb, rrough] = PALETTE.rough;
    const [lr, lg, lb, lrough] = PALETTE.rail;
    return [
      { mesh: square(), matrices: grass, materials: grassLooks },
      { mesh: box(TILE, TILE, RAIL_HEIGHT), matrices: rails, albedo: [lr, lg, lb], roughness: lrough },
      { mesh: square(), matrices: rough, albedo: [rr, rg, rb], roughness: rrough },
    ];
  }

  /** What moves: the pools, sized once. */
  dynamic(): GameGroup[] {
    const [br, bg, bb, brough] = PALETTE.ball;
    return [
      { mesh: ball(KIND_RADIUS[BALL], 8, 14), matrices: this.ball, albedo: [br, bg, bb], roughness: brough },
      { mesh: ball(AIM_RADIUS, 4, 8), matrices: this.aim, count: 0, materials: this.aimLooks },
    ];
  }

  /** The ball where it is this frame. */
  writeBall(world: World, slot: number) {
    place(this.ball, 0, world.x[slot], world.y[slot], world.z[slot]);
  }

  /**
   * The aim's dots from the ball along the shot, as far as its power reaches,
   * coloured from soft to hard: how many are placed, none for no shot.
   */
  writeAim(x: number, y: number, shot: Shot | null): number {
    if (!shot) return 0;
    const reach = AIM_REACH * shot.power;
    const n = Math.max(2, Math.round(AIM_DOTS * shot.power));
    const c = Math.cos(shot.angle),
      s = Math.sin(shot.angle);
    const [sr, sg, sb] = PALETTE.aimSoft,
      [hr, hg, hb] = PALETTE.aimHard;
    for (let k = 0; k < n; k++) {
      const along = KIND_RADIUS[BALL] + 0.6 + (reach * (k + 1)) / n;
      place(this.aim, k, x + c * along, y + s * along, AIM_RADIUS + 0.05);
      const t = shot.power * ((k + 1) / n);
      this.aimLooks.set([sr + (hr - sr) * t, sg + (hg - sg) * t, sb + (hb - sb) * t, 0.3], k * MATERIAL_STRIDE);
    }
    return n;
  }
}

/** The course's footprint, for the sun's shadow to be fitted to. */
export const COURSE_BOX = {
  min: [ORIGIN_X, ORIGIN_Y, -1] as [number, number, number],
  max: [ORIGIN_X + COLS * TILE, ORIGIN_Y + ROWS * TILE, RAIL_HEIGHT + 2] as [number, number, number],
};
