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
 * The canopy as a solid, in its own profile: how far a point stands from it (`d`, under nought inside, by the nearest
 * face), which way the solid's surface looks there (`out`: outward along the ground, `up`: outward upward, a unit vector
 * in the profile) and how far out from the trunk the point is (`rho`). The solid is the cone's side from the rim (the
 * base's edge) to the tip, and the flat base under it. Outside, the nearest point of the solid is on the side, on the
 * base, or the rim itself, so a ball's radius round the solid is a cone with a rounded rim and a flat underside no wider
 * than the base: it was a cone with a sharp rim and a cylinder under it, which held a ball at rest on a hillside 6.5 yards
 * from a trunk and 3.8 above its foot to be inside the crown by a tenth, where the ball's own sphere clears the rim by a
 * hair (found by the fuzzer on The Old Course, 14 October 2026).
 */
function profile(c: Cone, p: V3): { d: number; out: number; up: number; rho: number } {
  const h = c.apex - c.base,
    slant = Math.hypot(h, c.radius);
  const rho = Math.hypot(p[0] - c.x, p[1] - c.y),
    z = p[2];
  // the side's outward normal, and how far the point is past the side's line (over nought outside it)
  const sideOut = h / slant,
    sideUp = c.radius / slant;
  const pastSide = (rho - c.radius) * sideOut + (z - c.base) * sideUp;
  const belowBase = c.base - z;
  if (pastSide <= 0 && belowBase <= 0) {
    // inside the solid: out by the nearer face
    if (-pastSide <= -belowBase) return { d: pastSide, out: sideOut, up: sideUp, rho };
    return { d: belowBase, out: 0, up: -1, rho };
  }
  // outside: the nearest point is on the side's segment, the base's, or the rim where both end
  const alongSide = (rho - c.radius) * -sideUp + (z - c.base) * sideOut;
  if (pastSide > 0 && alongSide >= 0 && alongSide <= slant) return { d: pastSide, out: sideOut, up: sideUp, rho };
  if (belowBase > 0 && rho <= c.radius) return { d: belowBase, out: 0, up: -1, rho };
  // the rim (or the tip, past the side's far end): the way out is from that point to this
  const at: [number, number] = alongSide > slant ? [0, c.apex] : [c.radius, c.base];
  const dr = rho - at[0],
    dz = z - at[1],
    d = Math.hypot(dr, dz);
  return d > 1e-9 ? { d, out: dr / d, up: dz / d, rho } : { d: 0, out: sideOut, up: sideUp, rho };
}

/**
 * How far into the canopy a ball's middle is, at `p`, the ball being `r` in radius: nought where it is outside, and
 * where it is on the surface, over nought inside, by the shortest way out.
 */
export function insideCanopy(c: Cone, p: V3, r: number): number {
  return Math.max(0, r - profile(c, p).d);
}

/** The face a point on or in the cone is at, by the nearest of the side, the underside and the rim: which way it looks. */
function face(c: Cone, p: V3, r: number): { n: V3; depth: number } {
  const { d, out, up, rho } = profile(c, p);
  const ux = rho > 1e-9 ? (p[0] - c.x) / rho : 1,
    uy = rho > 1e-9 ? (p[1] - c.y) / rho : 0;
  return { n: [out * ux, out * uy, up], depth: r - d };
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
