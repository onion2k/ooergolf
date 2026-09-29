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
import { STILL, type Wind } from 'artshape-render/game/grass';
import type { GameGroup } from 'artshape-render/game/renderer';
import { MATERIAL_STRIDE, PATTERN_STRIDE } from 'artshape-render/game/renderer';
import { BALL, BUMPER, KIND_RADIUS, TILE, WATER_LEVEL, heightAt, tileAt, type Layout } from './arena';
import { CUP } from './course';
import { place } from './matrix';
import { ball, plane } from './meshes';
import {
  FLAG_COLOURS,
  FLOWER_COLOURS,
  barrier,
  bumper,
  bunting,
  collar,
  conveyor,
  cup,
  flag,
  flowers,
  golfBall,
  group,
  hedge,
  placeBlades,
  rock,
  ROUGH,
  sandBed,
  teeMarkers,
  tree,
  water,
  windmill,
  type Model,
  type Pond,
} from './models';
import { BARRIER, WINDMILL, type Obstacles } from './obstacles';
import type { World } from './physics';
import { placeRolling } from './roll';
import { ROCK_SIZE, dress, scatter, type Piece, type SceneryKind } from './scenery';
import { GROUND, cupGround, groundOf, railsOf } from './ground';
import { RIPPLES, SPLASH_RING, flagTurn, lean, ringPlace, ripples, splashRing, waggle } from './sway';
import { SPARKLE, sparkle, sparkles as sparkleShares } from './glints';
import { pulse } from './pulse';
import type { Shot } from './shot';
import { PALETTE as COLOURS } from './models/palette';

/** How tall the rail stands above the grass: a little over the ball, so it reads as the thing the ball banks off. */
const RAIL_HEIGHT = 1.6;
/** How far below the grass the rough lies: below the bottom of the cup, so the cup is seen into. */
export const ROUGH_DEPTH = 3;
/** How many rows of tiles each mown stripe of the grass is. */
const STRIPE_ROWS = 2;
/** How far apart the tee's markers stand. */
const TEE_SPACING = 5;
/**
 * The green's grain: a fine speckle of darker turf, drawn in world units by
 * the renderer's pattern, so it is the same size everywhere on every hole.
 * Close enough to the green that, where it is finer than a pixel at the far
 * end of the zoom and blends, the green is the same green.
 */
const GRAIN = { scale: 1.4, darker: 0.94 } as const;
function grain(c: readonly number[], seed: number): Float32Array {
  const p = new Float32Array(PATTERN_STRIDE);
  p.set([4, GRAIN.scale, seed, 0, c[0] * GRAIN.darker, c[1] * GRAIN.darker, c[2] * GRAIN.darker, 0]);
  return p;
}
/**
 * The colours, and how rough each is. Deeper than they look written down:
 * toon light is at a colour's full strength, and washed a pale green out to
 * mint and a white rail out to a glare, as bearing found with its sweets.
 */
export const PALETTE = {
  /** The green, painted in its two stripes, and the rough and the rail: the models' palette's, which the showcase shares. */
  grass: [...COLOURS.grass, 0.85],
  grassMown: [...COLOURS.grassMown, 0.85],
  rough: [...COLOURS.rough, 0.95],
  /** The rail's timber sides, and the cap painted along its top, rounded over its edges. */
  rail: [...COLOURS.rail, 0.6],
  railCap: [...COLOURS.railCap, 0.45],
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
  rock: rock(ROCK_SIZE),
};
/** A post, built once, to the physics' figures for one. */
const POST = bumper(BUMPER.radius, { height: BUMPER.height });
/** The kinds of scenery that lean in the breeze. */
const TREES = new Set<SceneryKind>(['round tree', 'pine']);
/** The flowers of a bed at the foot of the rail: fuller than a clump in the rough, and few enough to read as flowers. */
const BED_MODELS = FLOWER_COLOURS.slice(0, 3).map((c, k) => flowers(c, { seed: k + 11, count: 5 }));
/** The rough, as one great square out past the fog. */
const ROUGH_SIZE = 600;
const FLOWER_MODELS = FLOWER_COLOURS.slice(0, 3).map((c, k) => flowers(c, { seed: k + 1 }));

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

/**
 * The tiles `of` marks on a hole, as rectangles: each the largest to be had
 * from the first tile not yet in one, so a pond is one sheet with its
 * shallows round its own edge and not a grid of puddles. Each is its middle
 * and its size in world units, and the first tile it was grown from.
 */
function rectangles(layout: Layout, of: Uint8Array): { x: number; y: number; w: number; h: number; first: number }[] {
  const { cols, rows, originX, originY } = layout;
  const used = new Uint8Array(cols * rows);
  const out: { x: number; y: number; w: number; h: number; first: number }[] = [];
  for (let t = 0; t < cols * rows; t++) {
    if (!of[t] || used[t]) continue;
    const tx = t % cols,
      ty = Math.floor(t / cols);
    let w = 1;
    while (tx + w < cols && of[t + w] && !used[t + w]) w++;
    let h = 1;
    for (; ty + h < rows; h++) {
      let full = true;
      for (let k = 0; k < w; k++) if (!of[t + h * cols + k] || used[t + h * cols + k]) full = false;
      if (!full) break;
    }
    for (let j = 0; j < h; j++) for (let k = 0; k < w; k++) used[t + j * cols + k] = 1;
    out.push({
      x: originX + (tx + w / 2) * TILE,
      y: originY + (ty + h / 2) * TILE,
      w: w * TILE,
      h: h * TILE,
      first: t,
    });
  }
  return out;
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
  /** The ball's turn as it rolls, kept here since the physics does not keep one for drawing a rolling ball. */
  readonly ballTurn = new Float32Array([0, 0, 0, 1]);
  /** The pools of what moves on the hole, each a group after the ball and the aim, written each frame at a time. */
  private moving: {
    matrices: Float32Array;
    count: number;
    /** A colour and a roughness for each of its placements, when they are coloured by game time; see `tint`. */
    looks?: Float32Array;
    write: (out: Float32Array, t: number) => void;
  }[] = [];
  /**
   * The ponds of the hole as last built, each where it is and how big, and the room on its water for a ring or a
   * sparkle: what the rings and the sparkles are placed on.
   */
  ponds: { x: number; y: number; w: number; h: number; free: Pond['free']; reach: number; seed: number }[] = [];
  /** Where and when a ball last went into the water on this hole: the ring that spreads from it. */
  private splashed: { x: number; y: number; at: number } | null = null;
  /** How many sparkles each pond has, worked out once for a hole; and what each frame writes into and reads, made once. */
  private shares: number[] = [];
  private readonly scratch = {
    ripple: { u: 0, v: 0, grow: 0, fade: 0 },
    place: { x: 0, y: 0, radius: 0 },
    ring: { grow: 0, fade: 0 },
    spark: { u: 0, v: 0, brightness: 0 },
  };

  /** The hole being drawn, for the height of the ground under what moves on it. */
  private layout: Layout | null = null;
  /** When the ball dropped into this hole's cup, in game time, which the flag waggles from: none until it has. */
  holedAt = -Infinity;

  /** What does not move on this hole, which is called `name`, with what stands still of what moves on it. */
  static(layout: Layout, name = '', obstacles?: Obstacles): GameGroup[] {
    this.layout = layout;
    const { cols, cup: at, tee } = layout;
    const cupTile = tileAt(layout, at.x, at.y);
    // the rail either side of a windmill's door is under its tower, and is not drawn through it
    const underTower = new Set<number>();
    for (const w of obstacles?.windmills ?? [])
      for (const side of [-1, 1]) underTower.add(tileAt(layout, w.x + side * TILE, w.y));
    const stripe = (t: number) =>
      Math.floor(Math.floor(t / cols) / STRIPE_ROWS) % 2 ? PALETTE.grassMown : PALETTE.grass;
    // the grass as one mesh over the hole, following its slopes, and the earth down its steps
    const ground = groundOf(layout);
    const still = new Float32Array(16);
    place(still, 0, 0, 0, 0);
    // the rail from the rough up past the grass beside it, however high that stands and however it slopes: the green's
    // timber sides, and the edge the ball banks off, with its rounded cap along its top
    const rails = railsOf(layout, RAIL_HEIGHT, ROUGH_DEPTH, underTower);
    const rough = new Float32Array(16);
    place(rough, 0, 0, 0, -ROUGH_DEPTH);

    // the cup's tile is grass with the cup's hole in it, in its stripe's colour, placed at the ground's height at the
    // cup's middle and cut to meet the ground's own corners; the tee's markers on the ground beside the tee
    // round a cup on a slope, the collar and the rim lie on the ground, which is measured from the cup's middle
    const { z: cupZ, ...round } = cupGround(layout);
    const atCup = new Float32Array(16);
    place(atCup, 0, at.x, at.y, cupZ);
    const [collarPart] = collar(TILE, CUP.radius, { ...round, pieces: GROUND.pieces }).parts;
    const flagAt = new Float32Array(16);
    place(flagAt, 0, at.x, at.y, cupZ);
    const teeAt = new Float32Array(16);
    place(teeAt, 0, tee.x, tee.y, heightAt(layout, tee.x, tee.y));

    const look = (c: readonly number[]) => ({
      albedo: [c[0], c[1], c[2]] as [number, number, number],
      roughness: c[3],
    });
    const out: GameGroup[] = [
      { mesh: ground.green, matrices: still, ...look(PALETTE.grass), patterns: grain(PALETTE.grass, 0.2) },
      { mesh: ground.mown, matrices: still, ...look(PALETTE.grassMown), patterns: grain(PALETTE.grassMown, 0.7) },
      { ...group({ ...collarPart, material: stripe(cupTile) }, atCup) },
      { mesh: rails.sides, matrices: still, ...look(PALETTE.rail) },
      { mesh: rails.cap, matrices: still, ...look(PALETTE.railCap) },
      { mesh: plane(ROUGH_SIZE), matrices: rough, ...look(PALETTE.rough) },
      ...groups(cup(CUP.radius, round), atCup),
      // the pin and its knob stand still; the flag's cloth swings in the breeze, and is among what moves
      ...groups({ parts: flag(FLAG_COLOURS.red).parts.filter((p) => p.name !== 'flag') } as Model, flagAt),
      ...groups(teeMarkers(TEE_SPACING), teeAt),
      ...this.scenery(scatter(layout, name)),
      ...this.dressing(layout, name),
      ...this.pondSheets(layout),
      ...this.bunkers(layout),
      ...this.posts(layout),
    ];
    if (ground.banks.indices.length) out.push({ mesh: ground.banks, matrices: still, ...look(PALETTE.bank) });
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
  private pondSheets(layout: Layout): GameGroup[] {
    return this.eachPond(layout).flatMap(({ model, at }) => groups(model, at));
  }

  /** The sand on a hole, as one bed over all its tiles, with the lip only where it meets the grass. */
  private bunkers(layout: Layout): GameGroup[] {
    const cells: [number, number][] = [];
    for (let t = 0; t < layout.cols * layout.rows; t++)
      if (layout.sand[t]) cells.push([t % layout.cols, Math.floor(t / layout.cols)]);
    if (!cells.length) return [];
    const at = new Float32Array(16);
    place(at, 0, layout.originX, layout.originY, 0);
    // on a hole that slopes, laid on the ground and cut finer to follow it; flat, a piece a tile, as it always was
    const slopes = layout.terrain.some((h) => h !== 0);
    const height = (x: number, y: number) => heightAt(layout, layout.originX + x, layout.originY + y);
    return groups(sandBed(cells, TILE, slopes ? { height, pieces: 3 } : {}), at);
  }

  /** The posts on a hole, all of one model, each where the physics has its post. */
  private posts(layout: Layout): GameGroup[] {
    if (!layout.bumpers.length) return [];
    const at = new Float32Array(layout.bumpers.length * 16);
    layout.bumpers.forEach((p, k) => place(at, k, p.x, p.y, heightAt(layout, p.x, p.y)));
    return groups(POST, at);
  }

  /**
   * The rings that spread over each pond, three at once, each born small and bright at a place of its own and fading
   * to the water's colour as it widens; and one ring for the hole, where a ball went into the water. Each is the
   * pond's one ring mesh, placed and coloured from game time alone, and among what moves.
   */
  private rings(layout: Layout, out: GameGroup[]) {
    const ponds = this.eachPond(layout);
    this.ponds = ponds.map(({ model, x, y, w, h, seed }) => ({
      x,
      y,
      w,
      h,
      free: model.free,
      reach: model.reach,
      seed,
    }));
    this.shares = sparkleShares(this.ponds.length);
    if (!ponds.length) return;
    const mesh = ponds[0].model.moving[0].mesh;
    const [dr, dg, db] = COLOURS.water,
      [pr, pg, pb] = COLOURS.ripple;
    /** A ring's colour, `fade` of the way from the water's to the ripple's, written as placement `i` of `looks`. */
    const tint = (looks: Float32Array, i: number, fade: number) =>
      looks.set(
        [dr + (pr - dr) * fade, dg + (pg - dg) * fade, db + (pb - db) * fade, ROUGH.water],
        i * MATERIAL_STRIDE,
      );
    for (const { model, x, y, seed } of ponds) {
      const count = RIPPLES.each;
      const matrices = new Float32Array(16 * count),
        looks = new Float32Array(MATERIAL_STRIDE * count);
      this.moving.push({
        matrices,
        count,
        looks,
        write: (m, t) => {
          for (let i = 0; i < count; i++) {
            const r = ripples(t, seed, i, this.scratch.ripple);
            const p = ringPlace(model.free, model.reach, r, this.scratch.place);
            // a hair above the water, so it does not fight it
            place(m, i, x + p.x, y + p.y, WATER_LEVEL + 0.02, 0, p.radius, p.radius, 1);
            tint(looks, i, r.fade);
          }
        },
      });
      out.push({ mesh, matrices, count, materials: looks });
    }
    const matrices = new Float32Array(16),
      looks = new Float32Array(MATERIAL_STRIDE);
    const entry = {
      matrices,
      count: 0,
      looks,
      write: (m: Float32Array, t: number) => {
        const s = this.splashed;
        const r = splashRing(s ? t - s.at : -1, this.scratch.ring);
        entry.count = s && r.fade > 0 ? 1 : 0;
        if (!s || !entry.count) return;
        const radius = r.grow * SPLASH_RING.reach;
        place(m, 0, s.x, s.y, WATER_LEVEL + 0.03, 0, radius, radius, 1);
        tint(looks, 0, r.fade);
      },
    };
    this.moving.push(entry);
    tint(looks, 0, 0);
    out.push({ mesh, matrices, count: 0, materials: looks });
  }

  /** The ponds of a hole: each the largest rectangle of water tiles from the first not yet in one. */
  private eachPond(
    layout: Layout,
  ): { model: Pond; at: Float32Array; x: number; y: number; w: number; h: number; seed: number }[] {
    return rectangles(layout, layout.water).map(({ x, y, w, h, first }) => {
      const at = new Float32Array(16);
      place(at, 0, x, y, 0);
      return { model: water(w, h, { seed: first + 1 }), at, x, y, w, h, seed: first + 1 };
    });
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
  dynamic(obstacles?: Obstacles, layout?: Layout, name = '', wind: Wind = STILL): GameGroup[] {
    // the ball, round and smooth, with one band round its middle so its roll is seen
    const [br, bg, bb, brough] = PALETTE.ball;
    const [theBall] = golfBall(KIND_RADIUS[BALL], { colour: [br, bg, bb], band: PALETTE.ballBand }).parts;
    const out: GameGroup[] = [
      group({ ...theBall, material: [br, bg, bb, brough] }, this.ball),
      { mesh: ball(AIM_RADIUS, 4, 8), matrices: this.aim, count: 0, materials: this.aimLooks },
    ];
    this.moving = [];
    this.holedAt = -Infinity;
    this.splashed = null;
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
      // the flag flies downwind, and the trees lean with it, in the same gusts the grass bends in; and it waggles as the
      // ball drops
      const cupZ = heightAt(layout, cup.x, cup.y);
      pool({ parts: cloth }, (m, t) =>
        place(m, 0, cup.x, cup.y, cupZ, flagTurn(t, cup.x, cup.y, wind) + waggle(t - this.holedAt)),
      );
      const pieces = scatter(layout, name);
      for (const kind of TREES) {
        const trees = pieces.filter((p) => p.kind === kind);
        if (!trees.length) continue;
        pool(
          SCENERY_MODELS[kind as Exclude<SceneryKind, 'flowers'>],
          (m, t) =>
            trees.forEach((p, k) => {
              const [lx, ly] = lean(t, p.x, p.y, wind);
              placeLeaning(m, k, p.x, p.y, -ROUGH_DEPTH, p.yaw, p.scale, lx, ly);
            }),
          trees.length,
        );
      }
      this.rings(layout, out);
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
  writeMoving(t: number): { matrices: Float32Array; count: number; looks?: Float32Array }[] {
    for (const m of this.moving) m.write(m.matrices, t);
    return this.moving;
  }

  /** A ball went into the water at (x, y) at game time `t`: a ring spreads from there until it fades. */
  splashedAt(x: number, y: number, t: number) {
    this.splashed = { x, y, at: t };
  }

  /** How wide the ring where a ball went in is at game time `t`, in world units: nought when there is none. */
  splashReach(t: number): number {
    return this.splashed ? splashRing(t - this.splashed.at, this.scratch.ring).grow * SPLASH_RING.reach : 0;
  }

  /**
   * The sparkles of sun lit on the water at game time `t`, written four numbers each into `out`, which has room for
   * `SPARKLE.most`: where it is, on its pond's surface, and how bright. Only those lit; none on a hole without water,
   * and never more than `SPARKLE.most`, shared among its ponds. How many. Nothing is made.
   */
  sparkleInto(t: number, out: Float32Array): number {
    let n = 0;
    for (let k = 0; k < this.ponds.length; k++) {
      const p = this.ponds[k];
      for (let i = 0; i < this.shares[k]; i++) {
        const s = sparkle(t, p.seed, i, this.scratch.spark);
        if (s.brightness <= 0) continue;
        out.set([p.x + s.u * p.free.hx, p.y + s.v * p.free.hy, WATER_LEVEL, s.brightness], n * 4);
        n++;
      }
    }
    return n;
  }

  /** The same, as a list: for a test. */
  sparkles(t: number): { x: number; y: number; z: number; brightness: number }[] {
    const buffer = new Float32Array(SPARKLE.most * 4);
    const n = this.sparkleInto(t, buffer);
    return Array.from({ length: n }, (_, k) => ({
      x: buffer[k * 4],
      y: buffer[k * 4 + 1],
      z: buffer[k * 4 + 2],
      brightness: buffer[k * 4 + 3],
    }));
  }

  /** The ball where it is this frame, turned as it has rolled. */
  writeBall(world: World, slot: number) {
    placeRolling(this.ball, 0, this.ballTurn, world.x[slot], world.y[slot], world.z[slot]);
  }

  /**
   * The aim's dots from the ball along the shot, as far as its power reaches
   * (and further by `scale` for a club that strikes harder), coloured from
   * soft to hard, and pulsing at game time `now`: how many are placed, none
   * for no shot.
   */
  writeAim(x: number, y: number, shot: Shot | null, scale = 1, now = 0): number {
    if (!shot) return 0;
    const reach = AIM_REACH * scale * shot.power;
    const n = Math.max(2, Math.round(AIM_DOTS * shot.power));
    const c = Math.cos(shot.angle),
      s = Math.sin(shot.angle);
    const [sr, sg, sb] = PALETTE.aimSoft,
      [hr, hg, hb] = PALETTE.aimHard;
    for (let k = 0; k < n; k++) {
      const along = KIND_RADIUS[BALL] + 0.6 + (reach * (k + 1)) / n;
      const ax = x + c * along,
        ay = y + s * along;
      // on the ground under each dot, raised or sloped, not at nought under it, and sitting on it as it swells
      const size = pulse(now, k);
      place(this.aim, k, ax, ay, (this.layout ? heightAt(this.layout, ax, ay) : 0) + AIM_RADIUS * size + 0.05, 0, size);
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
