/**
 * A tree, as the game has it: a trunk, which is a post the physics already has, and a canopy, which is a cone standing
 * on the trunk's top that the physics has no shape for, so the game tests the ball's path against it a step at a time.
 * A ball that meets the cone's side is turned away from it and loses most of its speed; one that rises into its
 * underside is knocked down; one over the tip or under the base is not touched by it, and meets the trunk, or nothing.
 * So a tree is passed by going over it with a high club, under it with a low one, or round it, and a drive, which
 * flies at a dozen units, goes into the canopy of a tree twenty tall and is stopped.
 *
 * Pure arithmetic, tried without a game: where a step first meets the cone, which way its face looks there, and what a
 * ball keeps when it is turned. The ball is a sphere, so its middle meets the cone at a ball's radius out from it: the cone is
 * made that much bigger, and its rim and its tip are left sharp, which is a whisker out at either. Handed the numbers
 * of one tree and a ball, never a game.
 */

/** A tree's figures, in units, which are yards: the sizes of a tree a golf ball is played round, and what its canopy does to a ball. */
export const TREE = {
  /** The trunk's radius: a post, met by the physics, which stands up to the canopy's base. */
  trunk: 0.9,
  /** How high the canopy's base is, and its tip, above the ground at the trunk. */
  base: 5,
  apex: 20,
  /** How wide the canopy is at its base. */
  radius: 5.5,
  /** How much a ball keeps of its speed into the trunk, going back off it: dead, as timber is. */
  restitution: 0.3,
  /**
   * What a ball meeting the canopy's side keeps of its speed into the face (`bounce`) and of its speed along it
   * (`keep`): branches take nearly all of it, and the ball drops.
   */
  glance: { bounce: 0.2, keep: 0.35 },
  /** The same for a ball rising into the underside, which is knocked down and nearly dead. */
  under: { bounce: 0.1, keep: 0.3 },
} as const;

type V3 = [number, number, number];

/** A canopy: where its trunk stands, how high its base and its tip are, and how wide it is at the base. */
export interface Cone {
  x: number;
  y: number;
  base: number;
  apex: number;
  radius: number;
}

/** The canopy of the tree standing at (x, y) on ground `ground` high. */
export function treeCone(x: number, y: number, ground: number): Cone {
  return { x, y, base: ground + TREE.base, apex: ground + TREE.apex, radius: TREE.radius };
}

/** Where a step first met the canopy: how far along it, of the step, and the way the face looks there, a unit vector. */
export interface Hit {
  t: number;
  nx: number;
  ny: number;
  nz: number;
}

/**
 * The cone a ball's middle must stay out of: the canopy made a ball's radius `r` bigger all round. Its side is the
 * canopy's moved out by `r` along its normal, so it is as wide at the base as the canopy is and a little over, and its
 * tip stands higher; below the base it is a cylinder of that width down to a ball's radius under the base, which is the
 * underside.
 */
function inflated(c: Cone, r: number) {
  const h = c.apex - c.base;
  const slant = Math.hypot(h, c.radius);
  const k = c.radius / h;
  return { h, slant, k, tip: c.apex + (r * slant) / c.radius, low: c.base - r };
}

/** The distances from a point to the faces of the inflated cone, where it is inside it, and null where it is not. */
function inside(c: Cone, p: V3, r: number): { side: number; under: number; rho: number } | null {
  const { h, slant, k, tip, low } = inflated(c, r);
  const rho = Math.hypot(p[0] - c.x, p[1] - c.y);
  if (p[2] < low || p[2] > tip) return null;
  const wide = k * (tip - Math.max(p[2], c.base));
  if (rho >= wide) return null;
  // how far out of each face it would have to go: through the side along its normal, or down through the underside
  return { side: ((wide - rho) * h) / slant, under: p[2] - low, rho };
}

/**
 * How far into the canopy a ball's middle is, at `p`, the ball being `r` in radius: nought where it is outside, and
 * where it is on the surface, over nought inside, by the shortest way out.
 */
export function insideCanopy(c: Cone, p: V3, r: number): number {
  const d = inside(c, p, r);
  return d ? Math.min(d.side, d.under) : 0;
}

/** The face a point on or in the cone is at, by the nearer of the side and the underside: which way it looks. */
function face(c: Cone, p: V3, r: number): { n: V3; depth: number } {
  const { h, slant } = inflated(c, r);
  const d = inside(c, p, r);
  const rho = Math.hypot(p[0] - c.x, p[1] - c.y);
  const side = d ? d.side : Math.abs(inflatedWide(c, p[2], r) - rho) * (h / slant);
  const under = d ? d.under : Math.abs(p[2] - (c.base - r));
  if (under <= side) return { n: [0, 0, -1], depth: under };
  const ux = rho > 1e-9 ? (p[0] - c.x) / rho : 1,
    uy = rho > 1e-9 ? (p[1] - c.y) / rho : 0;
  return { n: [(h * ux) / slant, (h * uy) / slant, c.radius / slant], depth: side };
}

/** How wide the inflated cone is at a height: the width of its cylinder below the base. */
function inflatedWide(c: Cone, z: number, r: number): number {
  const { k, tip } = inflated(c, r);
  return k * (tip - Math.max(z, c.base));
}

/** How far apart the points a step is looked at are, in units: closer than a ball is wide, so a step cannot pass through unseen. */
const LOOK = 0.2;

/**
 * Where the ball's middle, going from `p0` to `p1` in a step, first meets the canopy, the ball being `r` in radius; or
 * null for a step that does not. A ball that begins inside it is met at once if it is going into the face it is nearest,
 * and not if it is going out. The step is looked at every `LOOK` and the first place it is inside is found to a
 * millionth by halving, so the hit is on the surface, and the way it looks is the face's there.
 */
export function hitCanopy(c: Cone, p0: V3, p1: V3, r: number): Hit | null {
  const d: V3 = [p1[0] - p0[0], p1[1] - p0[1], p1[2] - p0[2]];
  if (insideCanopy(c, p0, r) > 0) {
    const { n } = face(c, p0, r);
    return d[0] * n[0] + d[1] * n[1] + d[2] * n[2] < 0 ? { t: 0, nx: n[0], ny: n[1], nz: n[2] } : null;
  }
  const length = Math.hypot(...d);
  const looks = Math.max(1, Math.ceil(length / LOOK));
  const at = (t: number): V3 => [p0[0] + d[0] * t, p0[1] + d[1] * t, p0[2] + d[2] * t];
  let out = 0;
  for (let k = 1; k <= looks; k++) {
    const t = k / looks;
    if (insideCanopy(c, at(t), r) <= 0) {
      out = t;
      continue;
    }
    // between `out`, outside it, and `t`, inside it: the surface, by halving
    let lo = out,
      hi = t;
    for (let i = 0; i < 40; i++) {
      const mid = (lo + hi) / 2;
      if (insideCanopy(c, at(mid), r) > 0) hi = mid;
      else lo = mid;
    }
    const { n } = face(c, at(hi), r);
    return { t: hi, nx: n[0], ny: n[1], nz: n[2] };
  }
  return null;
}

/**
 * The velocity `v` of a ball turned by a face looking along the unit `n`: what it had along the face kept, a share of
 * it (`keep`), and what it had into the face given back, a share of it (`bounce`), out. A ball going away from the face
 * is not turned. It is never faster for it, since both shares are under one.
 */
export function deflect(v: V3, n: V3, { bounce, keep }: { bounce: number; keep: number }): V3 {
  const into = v[0] * n[0] + v[1] * n[1] + v[2] * n[2];
  if (into >= 0) return [v[0], v[1], v[2]];
  return [
    keep * (v[0] - into * n[0]) - bounce * into * n[0],
    keep * (v[1] - into * n[1]) - bounce * into * n[1],
    keep * (v[2] - into * n[2]) - bounce * into * n[2],
  ];
}

/**
 * The velocity of a ball turned by the face `hit` met: what the underside does (knocks it down, nearly dead) where it is
 * the underside, which looks straight down, and what the side does anywhere else.
 */
export function turned(v: V3, hit: Hit): V3 {
  return deflect(v, [hit.nx, hit.ny, hit.nz], hit.nz === -1 ? TREE.under : TREE.glance);
}
