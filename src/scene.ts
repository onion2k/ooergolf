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
import { MATERIAL_STRIDE, PATTERN_STRIDE } from 'artshape-render/game/renderer';
import { BALL, KIND_RADIUS, TILE, tileAt, type Layout } from './arena';
import { CUP } from './course';
import { place } from './matrix';
import { ball, box, plane, square } from './meshes';
import {
  FLAG_COLOURS,
  FLOWER_COLOURS,
  barrier,
  bunting,
  collar,
  conveyor,
  cup,
  flag,
  flowers,
  group,
  hedge,
  placeBlades,
  rock,
  teeMarkers,
  tree,
  tuft,
  water,
  windmill,
  type Model,
} from './models';
import { BARRIER, WINDMILL, type Obstacles } from './obstacles';
import type { World } from './physics';
import { placeRolling } from './roll';
import { dress, scatter, tufts, type Piece, type SceneryKind } from './scenery';
import { TRAIL, type Trail } from './trail';
import { flagTurn, lean, ripple } from './sway';
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
  /** The darker grass speckled through the rough. */
  roughSpeckle: [0.05, 0.225, 0.06],
  /** The tufts of the rough, from the darker of them to the lighter. */
  tuftDark: [0.07, 0.3, 0.07, 0.85],
  tuftLight: [0.16, 0.46, 0.1, 0.85],
  rail: [0.58, 0.3, 0.13, 0.55],
  /** The sides of grass raised on a step: the earth under the turf. */
  bank: [0.2, 0.3, 0.08, 0.9],
  ball: [0.98, 0.98, 0.96, 0.25],
  /** The band round the ball's middle, so it is seen to roll. */
  ballBand: [0.9, 0.16, 0.12],
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
/** The kinds of scenery that lean in the breeze. */
const TREES = new Set<SceneryKind>(['round tree', 'pine']);
/** The flowers of a bed at the foot of the rail: fuller than a clump in the rough. */
const BED_MODELS = FLOWER_COLOURS.slice(0, 3).map((c, k) => flowers(c, { seed: k + 11, count: 9 }));
/**
 * The grain of the green: a fine speckle of darker turf through each tile, a
 * third of a unit across, so the green is grass and not paint. A tile's
 * pattern is drawn in its own units, which are a tile across, so the scale is
 * a tile's worth of grain; the darker turf is the tile's stripe, darkened.
 */
const GRAIN = { scale: 1.6, dark: 0.86 };
/** A tuft, built once and placed thousands of times. */
const TUFT = tuft();
/** How far above the grass the track lies: over it, never in it. */
const TRACK_LIFT = 0.012;
/** The rough, as one great square at its full size, so its speckle is drawn in world units. */
const ROUGH_SIZE = 600;
const FLOWER_MODELS = FLOWER_COLOURS.slice(0, 3).map((c, k) => flowers(c, { seed: k + 1 }));

/** Which way the flag flies when the breeze is still: across the course, never at the camera. */
const FLAG_YAW = Math.PI / 6;

/**
 * Placement `i` of `out`: turned `yaw` about Z and scaled by `scale`, then
 * leaned `lx` across X and `ly` along Y about its foot, and put at (x, y, z).
 * For a tree in the breeze.
 */
function placeLeaning(
  out: Float32Array,
  i: number,
  x: number,
  y: number,
  z: number,
  yaw: number,
  scale: number,
  lx: number,
  ly: number,
) {
  const cy = Math.cos(yaw) * scale,
    sy = Math.sin(yaw) * scale;
  // a small lean: the up axis tipped by (lx, ly), and the others kept square to it near enough
  const o = i * 16;
  out.set([cy, sy, -lx * scale, 0, -sy, cy, -ly * scale, 0, lx * scale, ly * scale, scale, 0, x, y, z, 1], o);
}

/** Every part of a model as a group, all placed by the same matrices. */
function groups(model: Model, matrices: Float32Array): GameGroup[] {
  return model.parts.map((part) => group(part, matrices));
}

export class Scene {
  /** The moving placements, one pool a group: the ball, then the aim's dots and their colours. */
  readonly ball = new Float32Array(16);
  readonly aim = new Float32Array(AIM_DOTS * 16);
  readonly aimLooks = new Float32Array(AIM_DOTS * MATERIAL_STRIDE);
  /** The ball's track: its strips, and their colours, which are written again each frame as they fade. */
  readonly track = new Float32Array(TRAIL.capacity * 16);
  readonly trackLooks = new Float32Array(TRAIL.capacity * MATERIAL_STRIDE);
  /** The hole the track is laid on, for the colour of the turf under each strip. */
  private layout: Layout | null = null;
  /** The ball's turn as it rolls, kept here since the physics does not keep one for drawing a rolling ball. */
  readonly ballTurn = new Float32Array([0, 0, 0, 1]);
  /** The pools of what moves on the hole, each a group after the ball and the aim, written each frame at a time. */
  private moving: { matrices: Float32Array; count: number; write: (out: Float32Array, t: number) => void }[] = [];

  /** What does not move on this hole, which is called `name`, with what stands still of what moves on it. */
  static(layout: Layout, name = '', obstacles?: Obstacles): GameGroup[] {
    const { cols, rows, originX, originY, solid, rail: isRail, water: isWater, floor, cup: at, tee } = layout;
    const cupTile = tileAt(layout, at.x, at.y);
    // the rail either side of a windmill's door is under its tower, and is not drawn through it
    const underTower = new Set<number>();
    for (const w of obstacles?.windmills ?? [])
      for (const side of [-1, 1]) underTower.add(tileAt(layout, w.x + side * TILE, w.y));
    const grassTiles: number[] = [],
      railTiles: number[] = [],
      raised: number[] = [];
    for (let t = 0; t < cols * rows; t++) {
      if (!solid[t] && !isWater[t] && t !== cupTile) grassTiles.push(t);
      else if (isRail[t] && !underTower.has(t)) railTiles.push(t);
      if (!solid[t] && !isWater[t] && floor[t] > 0) raised.push(t);
    }
    const middle = (t: number): [number, number] => [
      originX + ((t % cols) + 0.5) * TILE,
      originY + (Math.floor(t / cols) + 0.5) * TILE,
    ];
    const stripe = (t: number) =>
      Math.floor(Math.floor(t / cols) / STRIPE_ROWS) % 2 ? PALETTE.grassMown : PALETTE.grass;
    const grass = new Float32Array(grassTiles.length * 16),
      grassLooks = new Float32Array(grassTiles.length * MATERIAL_STRIDE),
      grain = new Float32Array(grassTiles.length * PATTERN_STRIDE);
    grassTiles.forEach((t, k) => {
      const [x, y] = middle(t);
      place(grass, k, x, y, floor[t], 0, TILE, TILE, 1);
      const [r, g, b] = stripe(t);
      grassLooks.set(stripe(t), k * MATERIAL_STRIDE);
      // each tile's grain from its own seed, so no two tiles are alike
      grain.set(
        [4, GRAIN.scale, (t * 0.618034) % 1, 0, r * GRAIN.dark, g * GRAIN.dark, b * GRAIN.dark, 0],
        k * PATTERN_STRIDE,
      );
    });
    this.layout = layout;
    // the tufts of the rough, each a shade of its own between the darker and the lighter
    const grown = tufts(layout, name);
    const tuftAt = new Float32Array(grown.length * 16),
      tuftLooks = new Float32Array(grown.length * MATERIAL_STRIDE);
    const [dr, dg, db, tuftRough] = PALETTE.tuftDark,
      [lr, lg, lb] = PALETTE.tuftLight;
    grown.forEach((p, k) => {
      place(tuftAt, k, p.x, p.y, -ROUGH_DEPTH, p.yaw, p.scale);
      tuftLooks.set(
        [dr + (lr - dr) * p.shade, dg + (lg - dg) * p.shade, db + (lb - db) * p.shade, tuftRough],
        k * MATERIAL_STRIDE,
      );
    });
    // the earth under grass raised on steps, up to just under its turf
    const banks = new Float32Array(raised.length * 16);
    raised.forEach((t, k) => {
      const [x, y] = middle(t);
      place(banks, k, x, y, 0, 0, 1, 1, floor[t] - 0.01);
    });
    // the rail from the rough up past the grass beside it, however high that stands: the green's timber sides,
    // and the edge the ball banks off
    const rails = new Float32Array(railTiles.length * 16);
    railTiles.forEach((t, k) => {
      const [x, y] = middle(t);
      let top = 0;
      const tx = t % cols,
        ty = Math.floor(t / cols);
      for (let oy = -1; oy <= 1; oy++)
        for (let ox = -1; ox <= 1; ox++) {
          const nx = tx + ox,
            ny = ty + oy;
          if (nx < 0 || ny < 0 || nx >= cols || ny >= rows) continue;
          const u = ny * cols + nx;
          if (!solid[u] && !isWater[u]) top = Math.max(top, floor[u]);
        }
      place(rails, k, x, y, -ROUGH_DEPTH, 0, 1, 1, top + RAIL_HEIGHT + ROUGH_DEPTH);
    });
    const rough = new Float32Array(16);
    place(rough, 0, 0, 0, -ROUGH_DEPTH);
    // patches of darker grass through the rough, a couple of units across, so it is a field and not a colour
    const speckle = new Float32Array(PATTERN_STRIDE);
    speckle.set([4, 0.055, 0.3, 0, ...PALETTE.roughSpeckle, 0]);

    // the cup's tile is grass with the cup's hole in it, in its stripe's colour
    const atCup = new Float32Array(16);
    place(atCup, 0, at.x, at.y, 0);
    const [collarPart] = collar(TILE, CUP.radius).parts;
    const flagAt = new Float32Array(16);
    place(flagAt, 0, at.x, at.y, 0, FLAG_YAW);
    const teeAt = new Float32Array(16);
    place(teeAt, 0, tee.x, tee.y, 0);

    const look = (c: readonly number[]) => ({
      albedo: [c[0], c[1], c[2]] as [number, number, number],
      roughness: c[3],
    });
    const out: GameGroup[] = [
      { mesh: square(), matrices: grass, materials: grassLooks, patterns: grain },
      { mesh: TUFT.parts[0].mesh, matrices: tuftAt, materials: tuftLooks },
      { ...group({ ...collarPart, material: stripe(cupTile) }, atCup) },
      { mesh: box(TILE, TILE, 1), matrices: rails, ...look(PALETTE.rail) },
      { mesh: plane(ROUGH_SIZE), matrices: rough, ...look(PALETTE.rough), patterns: speckle },
      ...groups(cup(CUP.radius), atCup),
      // the pin and its knob stand still; the flag's cloth swings in the breeze, and is among what moves
      ...groups({ parts: flag(FLAG_COLOURS.red).parts.filter((p) => p.name !== 'flag') } as Model, flagAt),
      ...groups(teeMarkers(TEE_SPACING), teeAt),
      ...this.scenery(scatter(layout, name)),
      ...this.dressing(layout, name),
      ...this.ponds(layout),
    ];
    if (raised.length) out.push({ mesh: box(TILE, TILE, 1), matrices: banks, ...look(PALETTE.bank) });
    for (const w of obstacles?.windmills ?? []) {
      const at = new Float32Array(16);
      place(at, 0, w.x, w.y, 0);
      out.push(...groups(windmill(WINDMILL), at));
    }
    for (const c of obstacles?.conveyors ?? []) {
      const at = new Float32Array(16);
      // the model carries toward +Y: turned to carry the way the belt does
      place(at, 0, c.x, c.y, 0, c.angle - Math.PI / 2);
      out.push(...groups(conveyor(TILE, c.length), at));
    }
    return out;
  }

  /**
   * The water on a hole, as ponds: each the largest rectangle of water tiles
   * to be had from the first not yet in one, so a pond is one sheet with its
   * shallows round its own edge, and not a grid of puddles.
   */
  private ponds(layout: Layout): GameGroup[] {
    return this.eachPond(layout).flatMap(({ model, at }) => groups(model, at));
  }

  /** Each pond's ripples, swelling and settling, among what moves. */
  private ripples(
    layout: Layout,
    pool: (model: { parts: Model['parts'] }, write: (out: Float32Array, t: number) => void) => void,
  ) {
    this.eachPond(layout).forEach(({ model, x, y }, k) =>
      pool({ parts: model.moving }, (m, t) => {
        const s = ripple(t, k);
        place(m, 0, x, y, 0, 0, s, s, 1);
      }),
    );
  }

  /** The ponds of a hole: each the largest rectangle of water tiles from the first not yet in one. */
  private eachPond(layout: Layout): { model: Model; at: Float32Array; x: number; y: number }[] {
    const { cols, rows, originX, originY, water: isWater } = layout;
    const used = new Uint8Array(cols * rows);
    const out: { model: Model; at: Float32Array; x: number; y: number }[] = [];
    for (let t = 0; t < cols * rows; t++) {
      if (!isWater[t] || used[t]) continue;
      const tx = t % cols,
        ty = Math.floor(t / cols);
      let w = 1;
      while (tx + w < cols && isWater[t + w] && !used[t + w]) w++;
      let h = 1;
      for (; ty + h < rows; h++) {
        let full = true;
        for (let k = 0; k < w; k++) if (!isWater[t + h * cols + k] || used[t + h * cols + k]) full = false;
        if (!full) break;
      }
      for (let j = 0; j < h; j++) for (let k = 0; k < w; k++) used[t + j * cols + k] = 1;
      const at = new Float32Array(16);
      const x = originX + (tx + w / 2) * TILE,
        y = originY + (ty + h / 2) * TILE;
      place(at, 0, x, y, 0);
      out.push({ model: water(w * TILE, h * TILE, { seed: t + 1 }), at, x, y });
    }
    return out;
  }

  /** A hole's dressing: its bunting on its posts, the beds at the foot of its rail, and its rocks in clusters. */
  private dressing(layout: Layout, name: string): GameGroup[] {
    const d = dress(layout, name);
    const out: GameGroup[] = [];
    for (const b of d.bunting) {
      const at = new Float32Array(16);
      place(at, 0, b.x, b.y, -ROUGH_DEPTH, b.yaw);
      out.push(...groups(bunting(b.length, { height: b.height, seed: Math.round(b.length) }), at));
    }
    BED_MODELS.forEach((model, k) => {
      const beds = d.beds.filter((b) => b.variant === k);
      if (!beds.length) return;
      const at = new Float32Array(beds.length * 16);
      beds.forEach((b, i) => place(at, i, b.x, b.y, -ROUGH_DEPTH, b.yaw, 1.3));
      out.push(...groups(model, at));
    });
    if (d.rocks.length) {
      const at = new Float32Array(d.rocks.length * 16);
      d.rocks.forEach((r, i) => place(at, i, r.x, r.y, -ROUGH_DEPTH, r.yaw, r.scale));
      out.push(...groups(SCENERY_MODELS.rock, at));
    }
    return out;
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
    // the trees lean in the breeze, and are among what moves
    for (const [kind, model] of Object.entries(SCENERY_MODELS))
      if (!TREES.has(kind as SceneryKind))
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

  /**
   * What moves: the ball and the aim, and then each part of what moves on
   * this hole: a barrier's, a windmill's blades, a conveyor's chevrons. Made
   * again for each hole; the ball is group 0 and the aim group 1.
   */
  dynamic(obstacles?: Obstacles, layout?: Layout, name = ''): GameGroup[] {
    const [br, bg, bb, brough] = PALETTE.ball;
    // one band round the middle: the bands pattern is a wave along the mesh's own Z, a quarter turn on so it peaks at
    // nought, and at this scale positive only within a third of the radius of the middle
    const band = new Float32Array(PATTERN_STRIDE);
    band.set([2, 0.64, 0.25, 0, ...PALETTE.ballBand, 0]);
    const out: GameGroup[] = [
      {
        mesh: ball(KIND_RADIUS[BALL], 8, 14),
        matrices: this.ball,
        albedo: [br, bg, bb],
        roughness: brough,
        patterns: band,
      },
      { mesh: ball(AIM_RADIUS, 4, 8), matrices: this.aim, count: 0, materials: this.aimLooks },
      { mesh: square(), matrices: this.track, count: 0, materials: this.trackLooks },
    ];
    this.moving = [];
    const pool = (model: { parts: Model['parts'] }, write: (out: Float32Array, t: number) => void, count = 1) => {
      const matrices = new Float32Array(16 * count);
      for (const part of model.parts) {
        this.moving.push({ matrices, count, write });
        out.push(group(part, matrices, count));
      }
    };
    if (layout) {
      const { cup } = layout;
      const cloth = flag(FLAG_COLOURS.red).parts.filter((p) => p.name === 'flag');
      pool({ parts: cloth }, (m, t) => place(m, 0, cup.x, cup.y, 0, FLAG_YAW + flagTurn(t)));
      const pieces = scatter(layout, name);
      for (const kind of TREES) {
        const trees = pieces.filter((p) => p.kind === kind);
        if (!trees.length) continue;
        pool(
          SCENERY_MODELS[kind as Exclude<SceneryKind, 'flowers'>],
          (m, t) =>
            trees.forEach((p, k) => {
              const [lx, ly] = lean(t, k + p.x);
              placeLeaning(m, k, p.x, p.y, -ROUGH_DEPTH, p.yaw, p.scale, lx, ly);
            }),
          trees.length,
        );
      }
      this.ripples(layout, pool);
    }
    obstacles?.barriers.forEach((b, k) => {
      const pusher = obstacles.pushers[k];
      pool(barrier(b.hx, BARRIER.hy, BARRIER.hz), (m) => place(m, 0, pusher.x, pusher.y, BARRIER.hz));
    });
    for (const w of obstacles?.windmills ?? []) {
      const blades = windmill(WINDMILL);
      pool({ parts: blades.moving }, (m) => placeBlades(m, 0, w.x, w.y, 0, w.turn, blades.hub));
    }
    for (const c of obstacles?.conveyors ?? []) {
      const belt = conveyor(TILE, c.length);
      const yaw = c.angle - Math.PI / 2;
      pool({ parts: belt.moving }, (m) => {
        // the chevrons run along the belt, a spacing at a time, so they seem to go on for ever
        const along = c.travel % belt.spacing;
        place(m, 0, c.x + Math.cos(c.angle) * along, c.y + Math.sin(c.angle) * along, 0, yaw);
      });
    }
    return out;
  }

  /** What moves on the hole where it is at game time `t`, into its pools, in the order of the groups after the aim. */
  writeMoving(t: number): { matrices: Float32Array; count: number }[] {
    for (const m of this.moving) m.write(m.matrices, t);
    return this.moving;
  }

  /**
   * The ball's track at game time `t`: each strip where it lies, the width of
   * the ball's footprint, and coloured between pressed-grass dark and the
   * turf's own colour under it by how far it has faded. How many there are.
   */
  writeTrack(trail: Trail, t: number): number {
    const l = this.layout;
    if (!l) return 0;
    for (let i = 0; i < trail.count; i++) {
      place(
        this.track,
        i,
        trail.x[i],
        trail.y[i],
        trail.z[i] + TRACK_LIFT,
        trail.yaw[i],
        trail.length[i],
        TRAIL.width,
        1,
      );
      const tile = tileAt(l, trail.x[i], trail.y[i]);
      const turf = Math.floor(Math.floor(tile / l.cols) / STRIPE_ROWS) % 2 ? PALETTE.grassMown : PALETTE.grass;
      // from pressed dark back to the turf as it fades
      const k = 1 - (1 - TRAIL.dark) * trail.shade(i, t);
      this.trackLooks.set([turf[0] * k, turf[1] * k, turf[2] * k, turf[3]], i * MATERIAL_STRIDE);
    }
    return trail.count;
  }

  /** The ball where it is this frame, turned as it has rolled. */
  writeBall(world: World, slot: number) {
    placeRolling(this.ball, 0, this.ballTurn, world.x[slot], world.y[slot], world.z[slot]);
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
