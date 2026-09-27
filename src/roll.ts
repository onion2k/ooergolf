/**
 * The ball seen to roll. The physics turns a ball resting on the floor back
 * toward flat, as a coin settles, so its turn is no good for drawing a ball
 * that rolls; the page keeps the ball's turn itself, and this says how: a
 * ball going along the ground turns about the line across its travel, as far
 * as it went over its radius. It is only drawing, and changes nothing that is
 * played.
 */

/** The turn `q`, a quaternion (x, y, z, w), taken on by rolling at (vx, vy) for `dt` on a ball of radius `r`. */
export function roll(q: Float32Array, vx: number, vy: number, r: number, dt: number) {
  const speed = Math.hypot(vx, vy);
  if (speed < 1e-6) return;
  // about the line across the travel, by the distance gone over the radius
  const half = (speed * dt) / r / 2;
  const s = Math.sin(half) / speed;
  const ax = -vy * s,
    ay = vx * s,
    aw = Math.cos(half);
  const [x, y, z, w] = q;
  // the new turn is the rolling after the old: a times q
  q[0] = aw * x + ax * w + ay * z;
  q[1] = aw * y + ay * w - ax * z;
  q[2] = aw * z + ax * y - ay * x;
  q[3] = aw * w - ax * x - ay * y;
  const l = Math.hypot(q[0], q[1], q[2], q[3]) || 1;
  for (let k = 0; k < 4; k++) q[k] /= l;
}

/** Placement `i` of `out`: turned by `q`, and put at (x, y, z). Column-major, as the renderer reads it. */
export function placeRolling(out: Float32Array, i: number, q: Float32Array, x: number, y: number, z: number) {
  const [qx, qy, qz, qw] = q;
  const o = i * 16;
  out[o] = 1 - 2 * (qy * qy + qz * qz);
  out[o + 1] = 2 * (qx * qy + qz * qw);
  out[o + 2] = 2 * (qx * qz - qy * qw);
  out[o + 3] = 0;
  out[o + 4] = 2 * (qx * qy - qz * qw);
  out[o + 5] = 1 - 2 * (qx * qx + qz * qz);
  out[o + 6] = 2 * (qy * qz + qx * qw);
  out[o + 7] = 0;
  out[o + 8] = 2 * (qx * qz + qy * qw);
  out[o + 9] = 2 * (qy * qz - qx * qw);
  out[o + 10] = 1 - 2 * (qx * qx + qy * qy);
  out[o + 11] = 0;
  out[o + 12] = x;
  out[o + 13] = y;
  out[o + 14] = z;
  out[o + 15] = 1;
}
