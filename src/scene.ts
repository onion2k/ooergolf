/**
 * A hole as it is drawn: the grass mown in stripes, the rail round it, the
 * cup with its pin and flag, and the rough beyond, which do not move and are
 * drawn again for each hole; and the ball and the aim, which do.
 * The groups are fixed once, and each frame only where everything is written
 * into them. It is handed what it draws from, and never the renderer.
 *
 * The look is a cartoon's, for toon shading: every colour flat and bright,
 * given by placement and never by texture, and the words all in the page.
 */
import type { GameGroup } from 'artshape-render/game/renderer';
import { MATERIAL_STRIDE } from 'artshape-render/game/renderer';
import { BALL, KIND_RADIUS, TILE, type Layout } from './arena';
import { CUP } from './course';
import { place } from './matrix';
import { ball, box, disc, square } from './meshes';
import type { World } from './physics';
import type { Shot } from './shot';

/** How tall the rail stands: a little over the ball, so it reads as the thing the ball banks off. */
const RAIL_HEIGHT = 1.6;
/** How many rows of tiles each mown stripe of the grass is. */
const STRIPE_ROWS = 2;
/** The pin in the cup: how tall, how thick, and the flag at its top. */
const PIN = { height: 9, width: 0.25, flag: [2.6, 1.6] as const };
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
  cup: [0.02, 0.03, 0.02, 1],
  pin: [0.92, 0.92, 0.88, 0.3],
  flag: [0.85, 0.08, 0.1, 0.6],
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

  /** What does not move on this hole. */
  static(layout: Layout): GameGroup[] {
    const { cols, rows, originX, originY, solid, rail: isRail, cup } = layout;
    const grassTiles: number[] = [],
      railTiles: number[] = [];
    for (let t = 0; t < cols * rows; t++) {
      if (!solid[t]) grassTiles.push(t);
      else if (isRail[t]) railTiles.push(t);
    }
    const middle = (t: number): [number, number] => [
      originX + ((t % cols) + 0.5) * TILE,
      originY + (Math.floor(t / cols) + 0.5) * TILE,
    ];
    const grass = new Float32Array(grassTiles.length * 16),
      grassLooks = new Float32Array(grassTiles.length * MATERIAL_STRIDE);
    grassTiles.forEach((t, k) => {
      const [x, y] = middle(t);
      place(grass, k, x, y, 0, 0, TILE, TILE, 1);
      const stripe = Math.floor(Math.floor(t / cols) / STRIPE_ROWS) % 2;
      grassLooks.set(stripe ? PALETTE.grassMown : PALETTE.grass, k * MATERIAL_STRIDE);
    });
    const rails = new Float32Array(railTiles.length * 16);
    railTiles.forEach((t, k) => {
      const [x, y] = middle(t);
      place(rails, k, x, y, 0);
    });
    // the rough beyond the rail, just under the course, so the course is somewhere and not floating in the sky
    const rough = new Float32Array(16);
    place(rough, 0, 0, 0, -0.05, 0, 600, 600, 1);
    // the cup, a hair over the grass so it is drawn on it, and the pin standing in it with its flag
    const hole = new Float32Array(16),
      pin = new Float32Array(16),
      flag = new Float32Array(16);
    place(hole, 0, cup.x, cup.y, 0.02);
    place(pin, 0, cup.x, cup.y, 0);
    place(flag, 0, cup.x + PIN.flag[0] / 2, cup.y, PIN.height - PIN.flag[1] / 2);
    const look = (c: readonly number[]) => ({
      albedo: [c[0], c[1], c[2]] as [number, number, number],
      roughness: c[3],
    });
    return [
      { mesh: square(), matrices: grass, materials: grassLooks },
      { mesh: box(TILE, TILE, RAIL_HEIGHT), matrices: rails, ...look(PALETTE.rail) },
      { mesh: square(), matrices: rough, ...look(PALETTE.rough) },
      { mesh: disc(CUP.radius, 20), matrices: hole, ...look(PALETTE.cup) },
      { mesh: box(PIN.width, PIN.width, PIN.height), matrices: pin, ...look(PALETTE.pin) },
      { mesh: box(PIN.flag[0], 0.12, PIN.flag[1], true), matrices: flag, ...look(PALETTE.flag) },
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

/** A hole's footprint, for the sun's shadow to be fitted to. */
export function boxOf(layout: Layout) {
  const { originX, originY, cols, rows } = layout;
  return {
    min: [originX, originY, -1] as [number, number, number],
    max: [originX + cols * TILE, originY + rows * TILE, PIN.height + 1] as [number, number, number],
  };
}
