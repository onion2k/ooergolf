/**
 * Column-major 4×4 placements, as WebGPU reads them: element (row r, column
 * c) lives at c * 4 + r, so the translation is the last four floats.
 */

/** A turn about Z, a scale each way, and somewhere to put it. */
export function place(
  out: Float32Array,
  i: number,
  x: number,
  y: number,
  z: number,
  yaw = 0,
  sx = 1,
  sy = sx,
  sz = sx,
) {
  const o = i * 16;
  const c = Math.cos(yaw),
    s = Math.sin(yaw);
  out[o] = c * sx;
  out[o + 1] = s * sx;
  out[o + 2] = 0;
  out[o + 3] = 0;
  out[o + 4] = -s * sy;
  out[o + 5] = c * sy;
  out[o + 6] = 0;
  out[o + 7] = 0;
  out[o + 8] = 0;
  out[o + 9] = 0;
  out[o + 10] = sz;
  out[o + 11] = 0;
  out[o + 12] = x;
  out[o + 13] = y;
  out[o + 14] = z;
  out[o + 15] = 1;
}

/**
 * A mark laid flat on ground that slopes by (`slopeX`, `slopeY`), rise over run along each axis: its first two axes in
 * the ground and its third across it, turned `yaw` about the ground's upright and scaled `sx` and `sy`, and put at
 * (x, y, z) and then lifted `lift` along the upright. A flat ring put level over a hill has its uphill side in the turf,
 * and is seen as a crescent, or not at all.
 */
export function placeOnSlope(
  out: Float32Array,
  i: number,
  x: number,
  y: number,
  z: number,
  slopeX: number,
  slopeY: number,
  yaw = 0,
  sx = 1,
  sy = sx,
  lift = 0,
) {
  const o = i * 16;
  const lean = Math.hypot(slopeX, slopeY, 1);
  // the ground's upright, and the first axis along it toward +x (which is across the upright, since its run is the slope's)
  const nx = -slopeX / lean,
    ny = -slopeY / lean,
    nz = 1 / lean;
  const tl = Math.hypot(1, slopeX);
  const tx = 1 / tl,
    ty = 0,
    tz = slopeX / tl;
  // and the second, the upright crossed with the first
  const bx = ny * tz - nz * ty,
    by = nz * tx - nx * tz,
    bz = nx * ty - ny * tx;
  const c = Math.cos(yaw),
    s = Math.sin(yaw);
  out[o] = (c * tx + s * bx) * sx;
  out[o + 1] = (c * ty + s * by) * sx;
  out[o + 2] = (c * tz + s * bz) * sx;
  out[o + 3] = 0;
  out[o + 4] = (-s * tx + c * bx) * sy;
  out[o + 5] = (-s * ty + c * by) * sy;
  out[o + 6] = (-s * tz + c * bz) * sy;
  out[o + 7] = 0;
  out[o + 8] = nx;
  out[o + 9] = ny;
  out[o + 10] = nz;
  out[o + 11] = 0;
  out[o + 12] = x + nx * lift;
  out[o + 13] = y + ny * lift;
  out[o + 14] = z + nz * lift;
  out[o + 15] = 1;
}
