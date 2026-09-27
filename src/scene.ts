/**
 * A hole as it is drawn: the grass mown in stripes, the rail round it, the
 * cup with its lining, rim and flag, the tee's markers, the rough below and
 * the scenery on it, which do not move and are drawn again for each hole;
 * and the ball and the aim, which do. The groups are fixed once, and each
 * frame only where everything is written into them. It is handed what it
 * draws from, and never the renderer.
 *
 * The course stands on the rough as a raised green: the rough lies below
 * the bottom of the cup, so a cup is a hole and not a disc painted on the
 * grass, and the rail comes down to meet it as the green's timber sides.
 *
 * The look is a cartoon's, for toon shading: every colour flat and bright,
 * given by placement and never by texture, and the words all in the page.
 * The models are `models.ts`'s.
 */
import type { GameGroup } from 'artshape-render/game/renderer';
import { MATERIAL_STRIDE } from 'artshape-render/game/renderer';
import { BALL, KIND_RADIUS, TILE, tileAt, type Layout } from './arena';
import { CUP } from './course';
import { place } from './matrix';
import { ball, box, square } from './meshes';
import {
  FLAG_COLOURS,
  FLOWER_COLOURS,
  collar,
  cup,
  flag,
  flowers,
  group,
  hedge,
  rock,
  teeMarkers,
  tree,
  type Model,
} from './models';
import type { World } from './physics';
import { scatter, type Piece, type SceneryKind } from './scenery';
import type { Shot } from './shot';

/** How tall the rail stands above the grass: a little over the ball, so it reads as the thing the ball banks off. */
const RAIL_HEIGHT = 1.6;
/** How far below the grass the rough lies: below the bottom of the cup, so the cup is seen into. */
export const ROUGH_DEPTH = 3;
/** How many rows of tiles each mown stripe of the grass is. */
const STRIPE_ROWS = 2;
/** How far apart the tee's markers stand. */
const TEE_SPACING = 5;
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

/** The scenery's models, one of each kind, built once: the flowers in each of their colours. */
const SCENERY_MODELS: Record<Exclude<SceneryKind, 'flowers'>, Model> = {
  'round tree': tree('round'),
  pine: tree('pine', { height: 8 }),
  hedge: hedge(4, 1.6, 1.8),
  rock: rock(1.4),
};
const FLOWER_MODELS = FLOWER_COLOURS.slice(0, 3).map((c, k) => flowers(c, { seed: k + 1 }));

/** Every part of a model as a group, all placed by the same matrices. */
function groups(model: Model, matrices: Float32Array): GameGroup[] {
  return model.parts.map((part) => group(part, matrices));
}

export class Scene {
  /** The moving placements, one pool a group: the ball, then the aim's dots and their colours. */
  readonly ball = new Float32Array(16);
  readonly aim = new Float32Array(AIM_DOTS * 16);
  readonly aimLooks = new Float32Array(AIM_DOTS * MATERIAL_STRIDE);

  /** What does not move on this hole, which is called `name`. */
  static(layout: Layout, name = ''): GameGroup[] {
    const { cols, rows, originX, originY, solid, rail: isRail, cup: at, tee } = layout;
    const cupTile = tileAt(layout, at.x, at.y);
    const grassTiles: number[] = [],
      railTiles: number[] = [];
    for (let t = 0; t < cols * rows; t++) {
      if (!solid[t] && t !== cupTile) grassTiles.push(t);
      else if (isRail[t]) railTiles.push(t);
    }
    const middle = (t: number): [number, number] => [
      originX + ((t % cols) + 0.5) * TILE,
      originY + (Math.floor(t / cols) + 0.5) * TILE,
    ];
    const stripe = (t: number) =>
      Math.floor(Math.floor(t / cols) / STRIPE_ROWS) % 2 ? PALETTE.grassMown : PALETTE.grass;
    const grass = new Float32Array(grassTiles.length * 16),
      grassLooks = new Float32Array(grassTiles.length * MATERIAL_STRIDE);
    grassTiles.forEach((t, k) => {
      const [x, y] = middle(t);
      place(grass, k, x, y, 0, 0, TILE, TILE, 1);
      grassLooks.set(stripe(t), k * MATERIAL_STRIDE);
    });
    // the rail from the rough up past the grass: the green's timber sides, and the edge the ball banks off
    const rails = new Float32Array(railTiles.length * 16);
    railTiles.forEach((t, k) => {
      const [x, y] = middle(t);
      place(rails, k, x, y, -ROUGH_DEPTH);
    });
    const rough = new Float32Array(16);
    place(rough, 0, 0, 0, -ROUGH_DEPTH, 0, 600, 600, 1);

    // the cup's tile is grass with the cup's hole in it, in its stripe's colour
    const atCup = new Float32Array(16);
    place(atCup, 0, at.x, at.y, 0);
    const [collarPart] = collar(TILE, CUP.radius).parts;
    const flagAt = new Float32Array(16);
    // the flag flies across the course, never at the camera
    place(flagAt, 0, at.x, at.y, 0, Math.PI / 6);
    const teeAt = new Float32Array(16);
    place(teeAt, 0, tee.x, tee.y, 0);

    const look = (c: readonly number[]) => ({
      albedo: [c[0], c[1], c[2]] as [number, number, number],
      roughness: c[3],
    });
    return [
      { mesh: square(), matrices: grass, materials: grassLooks },
      { ...group({ ...collarPart, material: stripe(cupTile) }, atCup) },
      { mesh: box(TILE, TILE, RAIL_HEIGHT + ROUGH_DEPTH), matrices: rails, ...look(PALETTE.rail) },
      { mesh: square(), matrices: rough, ...look(PALETTE.rough) },
      ...groups(cup(CUP.radius), atCup),
      ...groups(flag(FLAG_COLOURS.red), flagAt),
      ...groups(teeMarkers(TEE_SPACING), teeAt),
      ...this.scenery(scatter(layout, name)),
    ];
  }

  /** The scenery on the rough, a group for each part of each kind's model, placed as the scatter says. */
  private scenery(pieces: Piece[]): GameGroup[] {
    const out: GameGroup[] = [];
    const draw = (model: Model, of: Piece[]) => {
      if (!of.length) return;
      const at = new Float32Array(of.length * 16);
      of.forEach((p, k) => place(at, k, p.x, p.y, -ROUGH_DEPTH, p.yaw, p.scale));
      out.push(...groups(model, at));
    };
    for (const [kind, model] of Object.entries(SCENERY_MODELS))
      draw(
        model,
        pieces.filter((p) => p.kind === kind),
      );
    FLOWER_MODELS.forEach((model, k) =>
      draw(
        model,
        pieces.filter((p) => p.kind === 'flowers' && p.variant === k),
      ),
    );
    return out;
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
   * The aim's dots from the ball along the shot, as far as its power reaches
   * (and further by `scale` for a club that strikes harder), coloured from
   * soft to hard: how many are placed, none for no shot.
   */
  writeAim(x: number, y: number, shot: Shot | null, scale = 1): number {
    if (!shot) return 0;
    const reach = AIM_REACH * scale * shot.power;
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

/** A hole's footprint and what stands round it, for the sun's shadow to be fitted to. */
export function boxOf(layout: Layout) {
  const { originX, originY, cols, rows } = layout;
  const reach = 16;
  return {
    min: [originX - reach, originY - reach, -ROUGH_DEPTH - 1] as [number, number, number],
    max: [originX + cols * TILE + reach, originY + rows * TILE + reach, 12] as [number, number, number],
  };
}
