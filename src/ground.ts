/**
 * The ground of a hole as it is drawn: one mesh over its grass that follows
 * the ground's slopes, in the two colours of its mown stripes, and the earth
 * wherever the ground steps down to what is beside it. Each tile of grass
 * is cut into a few pieces a side, every corner at the tile's own step and
 * the terrain smoothed there, with normals from the terrain's slope, so a
 * hill shades as one surface. Where the ground is flat it is the flat tiles
 * it replaced. Built from the layout alone, headless: the scene places it.
 *
 * Without it the green was a square a tile laid flat at each tile's step,
 * which cannot follow a slope, with boxes of earth under the raised ones.
 */
import { MeshBuilder, type Mesh } from 'artshape-render/mesh/types';
import { FastMeshBuilder } from './fastmesh';
import { TILE, WATER_LEVEL, groundInto, heightAt, slopeAt, stepAt, terrainAt, tileAt, type Layout } from './arena';
import { fan, outside, overlaps, type Point, type Ring } from './clip';
import { face, tri } from './meshes';
import { FIELDS, OUT, RULES, zonesOf, type Zone } from './zones';

type V3 = [number, number, number];

/** How many pieces each tile of grass is cut into along each side: enough that a slope's curve does not show. */
export const GROUND = { pieces: 3 } as const;

/** What a polygon being cut holds of each corner: where it is, then each field of the zones there. */
const STRIDE = 2 + FIELDS;

/**
 * A convex polygon being cut, as numbers in a buffer made once: a polygon of three corners cut by the rules one after another and
 * then by the rake's stripes has at most a dozen, and nothing is made for each cut.
 */
interface Poly {
  d: Float64Array;
  n: number;
}
const poly = (): Poly => ({ d: new Float64Array(STRIDE * 24), n: 0 });

/**
 * `src` cut where its number at offset `ch` (a field's, or 1 for the corner's y) crosses `at`, the part below it into `lo` and the
 * part at or above it into `hi`, each convex and counter-clockwise as `src` is.
 */
function split(src: Poly, ch: number, at: number, lo: Poly, hi: Poly) {
  const s = src.d,
    n = src.n;
  lo.n = hi.n = 0;
  for (let i = 0; i < n; i++) {
    const a = i * STRIDE,
      b = ((i + 1) % n) * STRIDE;
    const da = s[a + ch] - at,
      db = s[b + ch] - at;
    const mine = da < 0 ? lo : hi;
    mine.d.set(s.subarray(a, a + STRIDE), mine.n++ * STRIDE);
    if (da < 0 !== db < 0) {
      const u = da / (da - db);
      const m = lo.n * STRIDE;
      const dm = lo.d;
      dm[m] = s[a] + (s[b] - s[a]) * u;
      dm[m + 1] = s[a + 1] + (s[b + 1] - s[a + 1]) * u;
      for (let j = 2; j < STRIDE; j++) dm[m + j] = s[a + j] + (s[b + j] - s[a + j]) * u;
      hi.d.set(dm.subarray(m, m + STRIDE), hi.n * STRIDE);
      lo.n++;
      hi.n++;
    }
  }
}

/** The polygons of a piece being cut, scratch: what is left to cut, the part below a rule, the part above it, and the same for the rake's stripes. */
const REST = poly(),
  REST_B = poly(),
  BELOW = poly(),
  ABOVE = poly(),
  STRIPE_REST = poly(),
  STRIPE_B = poly(),
  STRIPE_BELOW = poly();

/** How wide each raked stripe of a bunker is, in yards: across the bed by where it is in the world, so it runs on across tiles. */
const RAKE = 0.75;

/** The fields at a point, scratch for a pass over a tile. */
const FIELD_SCRATCH = new Float32Array(FIELDS);

/** The height and the facing at the corners of the pieces of a tile being laid, scratch for it: z, then the normal's three. */
const CORNER = Float64Array.from({ length: 4 * (GROUND.pieces + 1) ** 2 });

/** The terrain and its slope at a point, scratch (`groundInto`). */
const HERE = new Float64Array(3);

/** The corners of the pieces of a tile being cut, scratch: where each is, every field of the zones there, and which rules it is below. */
const CORNERS = (GROUND.pieces + 1) ** 2;
const CORNER_X = new Float64Array(CORNERS),
  CORNER_Y = new Float64Array(CORNERS),
  CORNER_V = new Float64Array(CORNERS * FIELDS),
  CORNER_MASK = new Uint16Array(CORNERS);

/** What the rules are as numbers, and the zone a set of rules a corner is below makes: the first of them, or the rough where it is below none. */
const RULE_FIELD = Int32Array.from(RULES, (r) => r[0]),
  RULE_BELOW = Float64Array.from(RULES, (r) => r[1]);
const ZONE_OF_MASK: Zone[] = Array.from({ length: 1 << RULES.length }, (_, m): Zone => {
  for (let r = 0; r < RULES.length; r++) if (m & (1 << r)) return RULES[r][2];
  return 'rough';
});

/** Which rules corner `q` of the tile being cut is below the threshold of, a bit each. */
function maskOfCorner(q: number): number {
  let m = 0;
  for (let r = 0; r < RULE_FIELD.length; r++) if (CORNER_V[q * FIELDS + RULE_FIELD[r]] < RULE_BELOW[r]) m |= 1 << r;
  return m;
}

/**
 * How much of its difference from the other stripe a mown tone keeps on a golf hole, and on minigolf: a lawn mown in a
 * checker as the title picture's is, with its two tones pulled a quarter of the way together on golf, where a fairway is
 * seen from two hundred yards back and the checker at its full strength was loud.
 */
export const CONTRAST = { golf: 0.75, minigolf: 1 } as const;

/** The colour `c` of a mown tone with its contrast set by `CONTRAST`: pulled toward the middle of it and `other`, its alpha (roughness) as it was. */
export function toned(c: readonly number[], other: readonly number[], golf: boolean): number[] {
  // minigolf's tone is not touched at all, so that its picture is the bits it was and not a rounding off
  if (!golf) return c.slice();
  const k = CONTRAST.golf;
  return [0, 1, 2].map((i) => (c[i] + other[i]) / 2 + (c[i] - (c[i] + other[i]) / 2) * k).concat([c[3]]);
}

/**
 * How many tiles a side each square of the mown checker is: four on a golf hole, where a tile is three yards and the
 * squares read from two hundred back, and two on minigolf. A lawn mown both ways, as the title picture's is (chosen from a
 * sheet on 8 October 2026; it was mown in stripes two rows wide).
 */
export const CHECKER = { golf: 4, minigolf: 2 } as const;

/** Whether the tile at column `tx` and row `ty` is in the checker's lighter, mown tone: the one place it is said. */
export function mownAt(l: { golf: boolean }, tx: number, ty: number): boolean {
  const n = l.golf ? CHECKER.golf : CHECKER.minigolf;
  return (Math.floor(tx / n) + Math.floor(ty / n)) % 2 === 1;
}

export interface Ground {
  /** The grass in its lighter stripe, and in its darker: on a golf hole, the fairway's. */
  green: Mesh;
  mown: Mesh;
  /** The earth down the side of a step or a pond, to the ground or the water's surface below it. */
  banks: Mesh;
  /**
   * What a golf hole's ground is besides its fairway, each in a mesh of its own so that each is its own colour: the
   * rough, the putting green in its two stripes, the first cut, the tee, out of bounds and the sand. Each is drawn where
   * the zone is (`zones.ts`), which is where a ball is played from it. None on a hole of minigolf, which is all one grass.
   */
  golf?: {
    rough: Mesh;
    putting: Mesh;
    puttingMown: Mesh;
    cut: Mesh;
    tee: Mesh;
    oob: Mesh;
    /** The bunker, in the two tones of its rake, and its lip: all by the zone, so a bunker is a smooth blob and not a block of tiles. */
    sand: Mesh;
    sandRaked: Mesh;
    lip: Mesh;
  };
}

/** Whether a tile is sand the ball rolls on: not rock, and not water. */
function isSand(l: Layout, t: number): boolean {
  return !l.solid[t] && !l.water[t] && l.sand[t] === 1;
}

/** The tiles of a hole that are grass: not rock, water or sand, and not the cup's, which its collar covers. */
function isGrass(l: Layout, t: number, cupTile: number): boolean {
  return !l.solid[t] && !l.water[t] && !l.sand[t] && t !== cupTile;
}

/**
 * The ground of a hole. The cup's own tile is left to its collar, and so is whatever of a wider mouth than the tile
 * reaches into the tiles beside it: given the cup's `mouth`, as a ring round its middle (see `cupRing`), each piece of
 * those tiles' grass that it reaches into is cut to it, in the colour and the texture of its own tile, so the grass stops
 * on the mouth's edge and no tile of it covers the hole. A tile that is not level grass like the cup's, a step up or sand,
 * is left whole, and the mouth stops at it.
 */
export function groundOf(l: Layout, mouth?: Ring): Ground {
  const cupTile = tileAt(l, l.cup.x, l.cup.y);
  // the mouth where it is on the hole, and how many tiles out from the cup's it can reach into
  const hole: Point[] | null = mouth ? mouth.map(([x, y]) => [l.cup.x + x, l.cup.y + y]) : null;
  const reach = mouth ? Math.ceil(Math.max(...mouth.map(([x, y]) => Math.hypot(x, y))) / TILE) : 0;
  const [cupX, cupY] = [cupTile % l.cols, Math.floor(cupTile / l.cols)];
  const green = new FastMeshBuilder(),
    mown = new FastMeshBuilder(),
    banks = new FastMeshBuilder();
  // a golf hole's other grounds, each a mesh of its own
  const rough = new FastMeshBuilder(),
    putting = new FastMeshBuilder(),
    puttingMown = new FastMeshBuilder(),
    cut = new FastMeshBuilder(),
    tee = new FastMeshBuilder(),
    oob = new FastMeshBuilder(),
    sand = new FastMeshBuilder(),
    sandRaked = new FastMeshBuilder(),
    lip = new FastMeshBuilder();
  const n = GROUND.pieces;
  const zones = l.golf ? zonesOf(l) : null;
  /** The mesh of a zone: the fairway and the putting green in the checker's tone of the tile, the sand in the rake's of the row. */
  const meshOf = (zone: Zone, odd: boolean, stripe: boolean): MeshBuilder => {
    switch (zone) {
      case 'sand':
        return stripe ? sandRaked : sand;
      case 'lip':
        return lip;
      case 'oob':
        return oob;
      case 'tee':
        return tee;
      case 'putting':
        return odd ? puttingMown : putting;
      case 'cut':
        return cut;
      case 'fairway':
        return odd ? mown : green;
      case 'rough':
        return rough;
    }
  };
  // the height of the ground of tile `t` at a point: its own step, whichever tile the point's edge also bounds
  const at = (t: number, x: number, y: number) => l.floor[t] + terrainAt(l, x, y);
  /** A piece of the grass of tile `t` the mouth leaves, laid as triangles: each corner on the ground at its own height, and facing as the slope there does. */
  const lay = (b: MeshBuilder, t: number, x0: number, y0: number, piece: Ring) => {
    const ids = piece.map(([x, y]) => {
      const [sx, sy] = slopeAt(l, x, y);
      const k = 1 / Math.hypot(sx, sy, 1);
      return b.vertex(x, y, at(t, x, y), -sx * k, -sy * k, k, (x - x0) / TILE, (y - y0) / TILE);
    });
    for (const [p, q, r] of fan(piece)) b.triangle(ids[p], ids[q], ids[r]);
  };
  /**
   * A convex polygon of a golf hole's ground of one zone laid into the mesh of it, tile `t`'s. The sand is raked in stripes
   * 0.75 across, by where they are in the world so they run on across tiles, so a polygon of it is cut along the stripes' lines.
   */
  // a corner shared by the pieces round it is one vertex of a mesh, kept by mesh for the tile being cut
  const shared = new Map<MeshBuilder, { ids: Int32Array; stamp: Int32Array }>();
  let rakeFor = -1,
    rakeX0 = 0,
    rakeY0 = 0,
    rakeCut: Point[] | null = null,
    // the piece being cut, whose corners' heights and facings a fragment of it is laid by
    pieceI = 0,
    pieceJ = 0;
  /** A fragment of the piece being cut, laid with the height and facing its four corners give it, bilinear: a fragment's corners are not worked out again from the ground. */
  const layFragment = (b: MeshBuilder, ring: Ring) => {
    const m = (GROUND.pieces + 1) ** 2,
      w = GROUND.pieces + 1;
    const xa = rakeX0 + (pieceI / GROUND.pieces) * TILE,
      ya = rakeY0 + (pieceJ / GROUND.pieces) * TILE;
    const c0 = pieceJ * w + pieceI,
      c1 = c0 + 1,
      c2 = (pieceJ + 1) * w + pieceI + 1,
      c3 = (pieceJ + 1) * w + pieceI;
    const ids = ring.map(([x, y]) => {
      const u = ((x - xa) * GROUND.pieces) / TILE,
        v = ((y - ya) * GROUND.pieces) / TILE;
      const w0 = (1 - u) * (1 - v),
        w1 = u * (1 - v),
        w2 = u * v,
        w3 = (1 - u) * v;
      let z = 0,
        nx = 0,
        ny = 0,
        nz = 0;
      z += w0 * CORNER[c0];
      nx += w0 * CORNER[m + c0];
      ny += w0 * CORNER[2 * m + c0];
      nz += w0 * CORNER[3 * m + c0];
      z += w1 * CORNER[c1];
      nx += w1 * CORNER[m + c1];
      ny += w1 * CORNER[2 * m + c1];
      nz += w1 * CORNER[3 * m + c1];
      z += w2 * CORNER[c2];
      nx += w2 * CORNER[m + c2];
      ny += w2 * CORNER[2 * m + c2];
      nz += w2 * CORNER[3 * m + c2];
      z += w3 * CORNER[c3];
      nx += w3 * CORNER[m + c3];
      ny += w3 * CORNER[2 * m + c3];
      nz += w3 * CORNER[3 * m + c3];
      const k = 1 / Math.hypot(nx, ny, nz);
      return b.vertex(x, y, z, nx * k, ny * k, nz * k, (x - rakeX0) / TILE, (y - rakeY0) / TILE);
    });
    for (const [p, q, r] of fan(ring)) b.triangle(ids[p], ids[q], ids[r]);
  };
  const ringOf = (p: Poly): Ring => {
    const r: [number, number][] = [];
    for (let i = 0; i < p.n; i++) r.push([p.d[i * STRIDE], p.d[i * STRIDE + 1]]);
    return r;
  };
  const put = (b: MeshBuilder, p: Poly) => {
    if (p.n < 3) return;
    const r = ringOf(p);
    if (rakeCut && overlaps(r, rakeCut)) for (const part of outside(r, rakeCut)) lay(b, rakeFor, rakeX0, rakeY0, part);
    else layFragment(b, r);
  };
  const raked = (zone: Zone, odd: boolean, p: Poly) => {
    if (p.n < 3) return;
    if (zone !== 'sand') return put(meshOf(zone, odd, false), p);
    let low = Infinity,
      high = -Infinity;
    for (let i = 0; i < p.n; i++) {
      const y = p.d[i * STRIDE + 1];
      if (y < low) low = y;
      if (y > high) high = y;
    }
    const lo = Math.floor((low - l.originY) / RAKE),
      hi = Math.floor((high - l.originY) / RAKE);
    let rest = STRIPE_REST,
      spare = STRIPE_B;
    rest.d.set(p.d.subarray(0, p.n * STRIDE));
    rest.n = p.n;
    for (let k = lo; k <= hi; k++) {
      split(rest, 1, l.originY + (k + 1) * RAKE, STRIPE_BELOW, spare);
      put(k % 2 ? sandRaked : sand, STRIPE_BELOW);
      [rest, spare] = [spare, rest];
      if (rest.n < 3) break;
    }
  };
  for (let t = 0; t < l.cols * l.rows; t++) {
    // the ground is laid here: on a golf hole all of it but the cup's tile, which its collar covers, and on minigolf the
    // grass and the sand, which is the bunker's own, but it has an edge by the water as the grass has, and the earth comes
    // down from it too
    const golfGround = zones !== null && !l.solid[t] && !l.water[t] && t !== cupTile;
    const grass = isGrass(l, t, cupTile);
    if (!grass && !isSand(l, t) && !golfGround) continue;
    const tx = t % l.cols,
      ty = Math.floor(t / l.cols);
    const x0 = l.originX + tx * TILE,
      y0 = l.originY + ty * TILE;
    // a tile the mouth can reach into, level grass like the cup's: each piece of it is cut where the mouth is
    const cutTo =
      hole !== null && l.floor[t] === l.floor[cupTile] && Math.abs(tx - cupX) <= reach && Math.abs(ty - cupY) <= reach
        ? hole
        : null;
    /** The convex polygon `poly` laid into `b`, with the mouth cut out of it where it reaches. */
    rakeFor = t;
    rakeX0 = x0;
    rakeY0 = y0;
    rakeCut = cutTo;
    const whole = zones !== null && golfGround ? zones.tileZone(tx, ty) : null;
    if (zones === null ? grass : whole !== null && whole !== 'sand') {
      // a tile of one kind of ground from edge to edge, cut into pieces a side as it always was
      const odd = mownAt(l, tx, ty);
      const b = whole !== null ? meshOf(whole, odd, false) : odd ? mown : green;
      const base = b.vertexCount;
      for (let j = 0; j <= n; j++)
        for (let i = 0; i <= n; i++) {
          const x = x0 + (i / n) * TILE,
            y = y0 + (j / n) * TILE;
          groundInto(l, x, y, HERE);
          const k = 1 / Math.hypot(HERE[1], HERE[2], 1);
          b.vertex(x, y, l.floor[t] + HERE[0], -HERE[1] * k, -HERE[2] * k, k, i / n, j / n);
        }
      for (let j = 0; j < n; j++)
        for (let i = 0; i < n; i++) {
          if (cutTo) {
            const [xa, xb] = [x0 + (i / n) * TILE, x0 + ((i + 1) / n) * TILE],
              [ya, yb] = [y0 + (j / n) * TILE, y0 + ((j + 1) / n) * TILE];
            const piece: Ring = [
              [xa, ya],
              [xb, ya],
              [xb, yb],
              [xa, yb],
            ];
            if (overlaps(piece, cutTo)) {
              for (const part of outside(piece, cutTo)) lay(b, t, x0, y0, part);
              continue;
            }
          }
          const a = base + j * (n + 1) + i;
          b.quad(a, a + 1, a + n + 2, a + n + 1);
        }
    } else if (zones !== null && golfGround) {
      // a tile a curve crosses, or sand: cut into the same pieces a side as a whole tile is (so its edge meets its neighbour's
      // corner to corner), each laid as a quad of its zone where it is wholly one, and where a curve passes through it cut
      // along the line, one rule at a time. The fields are read at the pieces' corners, as the lie is read from them
      const odd = mownAt(l, tx, ty);
      const m = (n + 1) * (n + 1);
      for (let j = 0; j <= n; j++)
        for (let i = 0; i <= n; i++) {
          const x = x0 + (i / n) * TILE,
            y = y0 + (j / n) * TILE;
          const q = j * (n + 1) + i;
          zones.sample(x, y, FIELD_SCRATCH);
          for (let k = 0; k < FIELDS; k++) CORNER_V[q * FIELDS + k] = FIELD_SCRATCH[k];
          CORNER_X[q] = x;
          CORNER_Y[q] = y;
          CORNER_MASK[q] = maskOfCorner(q);
          groundInto(l, x, y, HERE);
          const k = 1 / Math.hypot(HERE[1], HERE[2], 1);
          CORNER[q] = l.floor[t] + HERE[0];
          CORNER[m + q] = -HERE[1] * k;
          CORNER[2 * m + q] = -HERE[2] * k;
          CORNER[3 * m + q] = k;
        }
      // a corner shared by the pieces round it is one vertex of a mesh, made when a piece first needs it (and stamped with the
      // tile it was made for, so none is cleared between tiles)
      const vertexOf = (b: MeshBuilder, i: number, j: number): number => {
        let kept = shared.get(b);
        if (!kept)
          shared.set(b, (kept = { ids: new Int32Array((n + 1) * (n + 1)), stamp: new Int32Array((n + 1) * (n + 1)) }));
        const at0 = j * (n + 1) + i;
        if (kept.stamp[at0] !== t + 1) {
          kept.stamp[at0] = t + 1;
          kept.ids[at0] = b.vertex(
            CORNER_X[at0],
            CORNER_Y[at0],
            CORNER[at0],
            CORNER[m + at0],
            CORNER[2 * m + at0],
            CORNER[3 * m + at0],
            (CORNER_X[at0] - x0) / TILE,
            (CORNER_Y[at0] - y0) / TILE,
          );
        }
        return kept.ids[at0];
      };
      for (let j = 0; j < n; j++)
        for (let i = 0; i < n; i++) {
          pieceI = i;
          pieceJ = j;
          const q00 = j * (n + 1) + i,
            q10 = q00 + 1,
            q11 = q00 + n + 2,
            q01 = q00 + n + 1;
          // a piece of one zone at every corner can still hide a sliver of another, so it is whole only where no rule's
          // field crosses its threshold among the corners, which is where all four corners are below the same rules
          const mask = CORNER_MASK[q00];
          const zone = ZONE_OF_MASK[mask];
          if (zone !== 'sand' && mask === CORNER_MASK[q10] && mask === CORNER_MASK[q11] && mask === CORNER_MASK[q01]) {
            const b = meshOf(zone, odd, false);
            const [xa, xb] = [CORNER_X[q00], CORNER_X[q10]],
              [ya, yb] = [CORNER_Y[q00], CORNER_Y[q11]];
            const piece: Ring = [
              [xa, ya],
              [xb, ya],
              [xb, yb],
              [xa, yb],
            ];
            if (cutTo && overlaps(piece, cutTo)) for (const part of outside(piece, cutTo)) lay(b, t, x0, y0, part);
            else b.quad(vertexOf(b, i, j), vertexOf(b, i + 1, j), vertexOf(b, i + 1, j + 1), vertexOf(b, i, j + 1));
            continue;
          }
          for (const corners of [
            [q00, q10, q11],
            [q00, q11, q01],
          ]) {
            let rest = REST,
              spare = REST_B;
            rest.n = 3;
            for (let c = 0; c < 3; c++) {
              const o = c * STRIDE,
                q = corners[c];
              rest.d[o] = CORNER_X[q];
              rest.d[o + 1] = CORNER_Y[q];
              for (let k = 0; k < FIELDS; k++) rest.d[o + 2 + k] = CORNER_V[q * FIELDS + k];
            }
            for (let r = 0; r < RULES.length; r++) {
              if (rest.n < 3) break;
              // a rule no corner is below leaves it all, and one every corner is below takes it all: only a rule that
              // crosses the piece cuts it
              const ch = 2 + RULE_FIELD[r],
                below = RULE_BELOW[r];
              let lows = 0;
              for (let c = 0; c < rest.n; c++) if (rest.d[c * STRIDE + ch] < below) lows++;
              if (lows === 0) continue;
              if (lows === rest.n) {
                raked(RULES[r][2], odd, rest);
                rest.n = 0;
                break;
              }
              split(rest, ch, below, BELOW, ABOVE);
              raked(RULES[r][2], odd, BELOW);
              spare.d.set(ABOVE.d.subarray(0, ABOVE.n * STRIDE));
              spare.n = ABOVE.n;
              [rest, spare] = [spare, rest];
            }
            raked('rough', odd, rest);
          }
        }
    }
    // the earth down each side where what is beside it lies lower: another tile's lower step, or water, whose surface
    // lies `WATER_LEVEL` below the grass, so a pond has a wall; rock has its rail, which stands over the edge
    for (const [ox, oy] of [
      [1, 0],
      [-1, 0],
      [0, 1],
      [0, -1],
    ]) {
      const nx = tx + ox,
        ny = ty + oy;
      if (nx < 0 || ny < 0 || nx >= l.cols || ny >= l.rows) continue;
      const u = ny * l.cols + nx;
      if (l.solid[u]) continue;
      // beside ground as high as this the earth has nothing to show: both tops are read at the same point, so a floor no lower
      // is a top no lower, and most of a hole's tiles have no earth to lay
      if (!l.water[u] && l.floor[u] >= l.floor[t]) continue;
      // the edge, from one end to the other, wound so its face looks out toward the neighbour
      const ex = ox > 0 ? x0 + TILE : ox < 0 ? x0 : null,
        ey = oy > 0 ? y0 + TILE : oy < 0 ? y0 : null;
      for (let k = 0; k < n; k++) {
        const s0 = k / n,
          s1 = (k + 1) / n;
        // along the edge, turning so that the face's outside is toward (ox, oy)
        const p = (s: number): [number, number] =>
          ex !== null
            ? [ex, oy === 0 && ox > 0 ? y0 + s * TILE : y0 + (1 - s) * TILE]
            : [x0 + (oy > 0 ? 1 - s : s) * TILE, ey!];
        const [ax, ay] = p(s0),
          [bx, by] = p(s1);
        const below = (x: number, y: number) => (l.water[u] ? WATER_LEVEL : at(u, x, y));
        const topA = at(t, ax, ay),
          topB = at(t, bx, by),
          lowA = below(ax, ay),
          lowB = below(bx, by);
        const tallA = topA - lowA > 1e-4,
          tallB = topB - lowB > 1e-4;
        if (!tallA && !tallB) continue;
        // narrowing to nothing at one end, as a step's edge meets the water's level: a triangle, not a quad half flat
        if (!tallA) tri(banks, [ax, ay, lowA], [bx, by, lowB], [bx, by, topB]);
        else if (!tallB) tri(banks, [ax, ay, lowA], [bx, by, lowB], [ax, ay, topA]);
        else face(banks, [ax, ay, lowA], [bx, by, lowB], [bx, by, topB], [ax, ay, topA]);
      }
    }
  }
  const out: Ground = { green: green.build(), mown: mown.build(), banks: banks.build() };
  if (l.golf)
    out.golf = {
      rough: rough.build(),
      putting: putting.build(),
      puttingMown: puttingMown.build(),
      cut: cut.build(),
      tee: tee.build(),
      oob: oob.build(),
      sand: sand.build(),
      sandRaked: sandRaked.build(),
      lip: lip.build(),
    };
  return out;
}

/**
 * How the ground stands round the cup: the height of the cup's middle, and
 * on a hole that slopes, how high the ground is at a point measured from
 * there, for the collar and the rim to lie on. It is the cup's own step and
 * the slope, as the ground beside it is drawn from, and never the step of
 * the tile next door, which a point on the tile's edge would otherwise read.
 */
export function cupGround(l: Layout): { z: number; height?: (x: number, y: number) => number } {
  const { x, y } = l.cup;
  const step = stepAt(l, x, y);
  const z = step + terrainAt(l, x, y);
  if (!l.terrain.some((h) => h !== 0)) return { z };
  return { z, height: (dx, dy) => step + terrainAt(l, x + dx, y + dy) - z };
}

/**
 * The rail's figures: how far its top edges are rounded over, how far down
 * its sides the cap's paint comes, below the round, and how many pieces the
 * round is turned in. The round begins above the middle of a ball on the
 * grass, so the side the ball meets is plumb where it meets it.
 */
export const RAIL = { round: 0.5, cap: 0.72, arc: 3 } as const;

/** The rail as it is drawn: its cap, and its sides below it, each a colour. */
export interface Rails {
  /** Its top, rounded over every edge that stands in the open, and its sides down to the cap's line: painted. */
  cap: Mesh;
  /** Its sides below the cap, down into the rough: the timber. */
  sides: Mesh;
}

/** A corner of a face as it is drawn: where it is, and the surface's normal there. */
interface Corner {
  p: V3;
  n: V3;
}

/**
 * A grid of corners into a builder, each row beside the next, every cell two
 * triangles wound as their corners' normals face and sharing them, so a
 * curved piece is shaded smooth. A cell whose corners meet in a point, as at
 * a round's pole, is a triangle, or nothing.
 */
function patch(b: MeshBuilder, rows: Corner[][]) {
  const ids = rows.map((row) => row.map(({ p, n }) => b.vertex(p[0], p[1], p[2], n[0], n[1], n[2], 0, 0)));
  const one = (cells: [number, number][]) => {
    const [P, Q, R] = cells.map(([i, j]) => rows[i][j]);
    const u = [Q.p[0] - P.p[0], Q.p[1] - P.p[1], Q.p[2] - P.p[2]],
      v = [R.p[0] - P.p[0], R.p[1] - P.p[1], R.p[2] - P.p[2]];
    const g = [u[1] * v[2] - u[2] * v[1], u[2] * v[0] - u[0] * v[2], u[0] * v[1] - u[1] * v[0]];
    if (Math.hypot(g[0], g[1], g[2]) < 1e-9) return;
    const facing = [0, 1, 2].reduce((s, k) => s + g[k] * (P.n[k] + Q.n[k] + R.n[k]), 0);
    const [a, c, d] = cells.map(([i, j]) => ids[i][j]);
    if (facing > 0) b.triangle(a, c, d);
    else b.triangle(a, d, c);
  };
  for (let i = 0; i + 1 < rows.length; i++)
    for (let j = 0; j + 1 < rows[i].length; j++) {
      one([
        [i, j],
        [i, j + 1],
        [i + 1, j + 1],
      ]);
      one([
        [i, j],
        [i + 1, j + 1],
        [i + 1, j],
      ]);
    }
}

/**
 * The rail round a hole, as a rounded toy's: painted timber on each tile of
 * rail but those `left out`, from `depth` below the ground up to `height`
 * over what is beside it, drawn on its own tile and never over the grass, so
 * what is seen is the wall the ball meets. Its top is level at the highest
 * step beside it, as a timber rail stands over a raised green, and rises and
 * falls with the ground's slope, so one tile meets the next at the same
 * height. Every top edge that stands in the open is rounded over, the ball's
 * side plumb below the round; a corner that stands out is rounded too, and
 * one the grass fills stays square, as the physics' wall is there. Where a
 * higher rail meets a lower, the higher one's end closes the step.
 *
 * Each tile is drawn a quarter at a time, from each of its corners in to its
 * middle: the corner's square, rounded as its two edges and the tile across
 * the corner say, the two edges' strips beside it, and the flat between. A
 * round is cut the same way wherever it is cut, so a tile's edge meets its
 * neighbour's corner to corner and nothing opens between them.
 */
export function railsOf(l: Layout, height: number, depth: number, leftOut: ReadonlySet<number> = new Set()): Rails {
  const { round: r, cap: line, arc } = RAIL;
  const half = TILE / 2;
  const top = new MeshBuilder(),
    timber = new MeshBuilder();
  const drawn = (tx: number, ty: number) =>
    tx >= 0 &&
    ty >= 0 &&
    tx < l.cols &&
    ty < l.rows &&
    l.rail[ty * l.cols + tx] === 1 &&
    !leftOut.has(ty * l.cols + tx);
  // the highest step on the ground round each tile of rail
  const steps = new Float32Array(l.cols * l.rows);
  for (let t = 0; t < l.cols * l.rows; t++) {
    if (!l.rail[t]) continue;
    const tx = t % l.cols,
      ty = Math.floor(t / l.cols);
    for (let oy = -1; oy <= 1; oy++)
      for (let ox = -1; ox <= 1; ox++) {
        const nx = tx + ox,
          ny = ty + oy;
        if (nx < 0 || ny < 0 || nx >= l.cols || ny >= l.rows) continue;
        const u = ny * l.cols + nx;
        if (!l.solid[u] && !l.water[u]) steps[t] = Math.max(steps[t], l.floor[u]);
      }
  }
  // the round, cut in `arc` pieces: at each, how far in from the side it is, how far up from where it begins, and
  // how far its normal has turned from facing out to facing up
  const turns = Array.from({ length: arc + 1 }, (_, k) => (k / arc) * (Math.PI / 2));
  const into = turns.map((a) => r * (1 - Math.cos(a))),
    rise = turns.map((a) => r * Math.sin(a));
  for (let t = 0; t < l.cols * l.rows; t++) {
    const tx = t % l.cols,
      ty = Math.floor(t / l.cols);
    if (!drawn(tx, ty)) continue;
    const step = steps[t];
    const zTop = (x: number, y: number) => step + terrainAt(l, x, y) + height;
    // an edge is open where no rail is drawn beside it; a step where a lower one is, which this tile's end closes
    const edge = (dx: number, dy: number): 'open' | 'closed' | 'step' => {
      if (!drawn(tx + dx, ty + dy)) return 'open';
      return steps[(ty + dy) * l.cols + tx + dx] < step - 1e-6 ? 'step' : 'closed';
    };
    const cx = l.originX + (tx + 0.5) * TILE,
      cy = l.originY + (ty + 0.5) * TILE;
    for (const sx of [-1, 1])
      for (const sy of [-1, 1]) {
        // a quarter of the tile, measured in from its corner: `a` in from the edge across X, `b` from the edge along Y
        const K = [cx + sx * half, cy + sy * half];
        const eX = edge(sx, 0),
          eY = edge(0, sy),
          across = !drawn(tx + sx, ty + sy);
        const openX = eX === 'open',
          openY = eY === 'open';
        /** A corner on the top, `up` above where the round begins, its normal `n` as on level ground, leant as the slope leans it. */
        const onTop = (a: number, b: number, up: number, n: V3): Corner => {
          const x = K[0] - sx * a,
            y = K[1] - sy * b;
          const [gx, gy] = slopeAt(l, x, y);
          const m: V3 = [n[0] - gx * n[2], n[1] - gy * n[2], n[2]];
          const k = Math.hypot(m[0], m[1], m[2]);
          return { p: [x, y, zTop(x, y) - r + up], n: [m[0] / k, m[1] / k, m[2] / k] };
        };
        const flat = (a: number, b: number) => onTop(a, b, r, [0, 0, 1]);
        /** A corner on a side, facing `n`, at the foot, the cap's line, where the round begins, or on the top at `up`. */
        const onSide = (a: number, b: number, at: 'foot' | 'line' | number, n: V3): Corner => {
          const x = K[0] - sx * a,
            y = K[1] - sy * b;
          const z = at === 'foot' ? -depth : at === 'line' ? zTop(x, y) - line : zTop(x, y) - r + at;
          return { p: [x, y, z], n };
        };
        const outX = (k: number): V3 => [sx * Math.cos(turns[k]), 0, Math.sin(turns[k])],
          outY = (k: number): V3 => [0, sy * Math.cos(turns[k]), Math.sin(turns[k])];
        const ks = turns.map((_, k) => k);

        // the corner's square
        if (openX && openY)
          // standing out: a ball's eighth round the corner, its middle a round in from both edges
          patch(
            top,
            ks.map((k) =>
              ks.map((j) => {
                const c = Math.cos(turns[k]),
                  [ca, sb] = [Math.cos(turns[j]), Math.sin(turns[j])];
                return onTop(r - r * c * ca, r - r * c * sb, rise[k], [sx * c * ca, sy * c * sb, Math.sin(turns[k])]);
              }),
            ),
          );
        else if (openX)
          patch(
            top,
            ks.map((k) => [0, r].map((b) => onTop(into[k], b, rise[k], outX(k)))),
          );
        else if (openY)
          patch(
            top,
            ks.map((k) => [0, r].map((a) => onTop(a, into[k], rise[k], outY(k)))),
          );
        else if (across) {
          // the grass in the corner, with rail along both edges: the two rounds meet in a hollow down to its corner,
          // and a flat fan beyond it
          const dip = (k: number, j: number) => {
            const c = Math.cos(turns[k]),
              [ca, sb] = [Math.cos(turns[j]), Math.sin(turns[j])];
            return onTop(into[k] * ca, into[k] * sb, rise[k], [sx * c * ca, sy * c * sb, Math.sin(turns[k])]);
          };
          patch(
            top,
            ks.map((k) => ks.map((j) => dip(k, j))),
          );
          patch(top, [ks.map((j) => dip(arc, j)), ks.map(() => flat(r, r))]);
        } else
          patch(top, [
            [flat(0, 0), flat(0, r)],
            [flat(r, 0), flat(r, r)],
          ]);
        // the two edges' strips beside it, and the flat between them
        if (openX)
          patch(
            top,
            ks.map((k) => [r, half].map((b) => onTop(into[k], b, rise[k], outX(k)))),
          );
        else
          patch(
            top,
            [0, r].map((a) => [r, half].map((b) => flat(a, b))),
          );
        if (openY)
          patch(
            top,
            ks.map((k) => [r, half].map((a) => onTop(a, into[k], rise[k], outY(k)))),
          );
        else
          patch(
            top,
            [0, r].map((b) => [r, half].map((a) => flat(a, b))),
          );
        patch(
          top,
          [r, half].map((a) => [r, half].map((b) => flat(a, b))),
        );

        // the sides that stand in the open, from the rough to the cap's line in timber and on up to the round in paint
        /** A wall along the corners `along`, each an (a, b) and its height on the top, from the rough up. */
        const wall = (along: [number, number, number | null][], n: V3) => {
          patch(timber, [
            along.map(([a, b]) => onSide(a, b, 'foot', n)),
            along.map(([a, b]) => onSide(a, b, 'line', n)),
          ]);
          patch(top, [
            along.map(([a, b]) => onSide(a, b, 'line', n)),
            along.map(([a, b, up]) => onSide(a, b, up ?? 0, n)),
          ]);
        };
        if (openX)
          wall(
            (openY ? [r, half] : [0, r, half]).map((b): [number, number, null] => [0, b, null]),
            [sx, 0, 0],
          );
        if (openY)
          wall(
            (openX ? [r, half] : [0, r, half]).map((a): [number, number, null] => [a, 0, null]),
            [0, sy, 0],
          );
        // round the corner that stands out, a post's quarter
        if (openX && openY) {
          const post = (at: 'foot' | 'line' | number) =>
            ks.map((j) => {
              const [c, s] = [Math.cos(turns[j]), Math.sin(turns[j])];
              return onSide(r - r * c, r - r * s, at, [sx * c, sy * s, 0]);
            });
          patch(timber, [post('foot'), post('line')]);
          patch(top, [post('line'), post(0)]);
        }
        // where this tile stands over a lower rail beside it, its end, up to the top as the top meets that edge
        const rounded = (open: boolean) => open || across;
        if (eX === 'step')
          wall(
            [
              ...(rounded(openY)
                ? ks.map((k): [number, number, number] => [0, into[k], rise[k]])
                : [
                    [0, 0, r],
                    [0, r, r],
                  ]),
              [0, half, r],
            ] as [number, number, number][],
            [sx, 0, 0],
          );
        if (eY === 'step')
          wall(
            [
              ...(rounded(openX)
                ? ks.map((k): [number, number, number] => [into[k], 0, rise[k]])
                : [
                    [0, 0, r],
                    [r, 0, r],
                  ]),
              [half, 0, r],
            ] as [number, number, number][],
            [0, sy, 0],
          );
      }
  }
  return { cap: top.build(), sides: timber.build() };
}

/** How far apart the stakes of the out of bounds line stand along it, in yards: a stake to every second tile, as they always were. */
export const STAKE_APART = 6;

/**
 * Where the stakes that mark out of bounds stand, on a golf hole: along the curve out of bounds is drawn and played by
 * (`zonesOf`), one every `STAKE_APART` yards of it, each on the ground there. The curve is walked chain by chain, since
 * its segments come in the order the grid was read and not the order they join in. None on a hole that has no out of bounds.
 */
export function stakesOf(l: Layout): { x: number; y: number; z: number }[] {
  const out: { x: number; y: number; z: number }[] = [];
  if (!l.golf) return out;
  const seg = zonesOf(l).curves[OUT];
  const n = seg.length / 4;
  if (!n) return out;
  // a segment's ends are found by where they are: both cells that share an end work it out from the same two corners
  const key = (x: number, y: number) => (Math.round(x * 64) + 2 ** 20) * 2 ** 21 + (Math.round(y * 64) + 2 ** 20);
  const ends = new Map<number, number[]>();
  const add = (k: number, s: number) => {
    const list = ends.get(k);
    if (list) list.push(s);
    else ends.set(k, [s]);
  };
  for (let s = 0; s < n; s++) {
    add(key(seg[4 * s], seg[4 * s + 1]), s);
    add(key(seg[4 * s + 2], seg[4 * s + 3]), s);
  }
  const seen = new Uint8Array(n);
  // the chains that are open begin at an end that only one segment has; the loops that are left begin anywhere
  const order: number[] = [];
  for (let s = 0; s < n; s++) {
    if (
      ends.get(key(seg[4 * s], seg[4 * s + 1]))!.length === 1 ||
      ends.get(key(seg[4 * s + 2], seg[4 * s + 3]))!.length === 1
    )
      order.push(s);
  }
  for (let s = 0; s < n; s++) order.push(s);
  for (const first of order) {
    if (seen[first]) continue;
    // walk from the open end if this segment has one
    let s = first;
    let [px, py, qx, qy] = [seg[4 * s], seg[4 * s + 1], seg[4 * s + 2], seg[4 * s + 3]];
    if (ends.get(key(qx, qy))!.length === 1) [px, py, qx, qy] = [qx, qy, px, py];
    let carried = STAKE_APART;
    for (;;) {
      seen[s] = 1;
      const len = Math.hypot(qx - px, qy - py);
      // a stake each time the walk has gone a stake's distance, the first at the start of a chain
      let along = 0;
      while (carried + (len - along) >= STAKE_APART) {
        along += STAKE_APART - carried;
        carried = 0;
        const u = len > 0 ? along / len : 0;
        const x = px + (qx - px) * u,
          y = py + (qy - py) * u;
        out.push({ x, y, z: heightAt(l, x, y) });
      }
      carried += len - along;
      const next = ends.get(key(qx, qy))!.find((c) => !seen[c]);
      if (next === undefined) break;
      s = next;
      const [ax, ay, bx, by] = [seg[4 * s], seg[4 * s + 1], seg[4 * s + 2], seg[4 * s + 3]];
      if (key(ax, ay) === key(qx, qy)) [px, py, qx, qy] = [ax, ay, bx, by];
      else [px, py, qx, qy] = [bx, by, ax, ay];
    }
  }
  return out;
}
