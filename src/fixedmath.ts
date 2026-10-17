/**
 * `sin`, `cos`, `atan2` and `hypot` worked out in plain arithmetic, so that they give the same last bit on every engine.
 *
 * The language leaves the last bit of `Math.sin` and its kind to the engine, and engines differ there: Node 23 on an Apple
 * machine disagrees with Node 20 on about one call in a hundred, and the browsers each have their own. A golf hole is made from
 * these functions (its noise, its lakes' rims, its bend), and a hole is held to a hash and keys the field table, so a hole made
 * with `Math.sin` was one hole on one machine and another on the next (The Old Course's Cartgate was, on 17 October 2026, by a
 * millionth of a millionth of a yard on its lake bed). Adding, multiplying, dividing and `Math.sqrt` are rounded exactly by IEEE
 * on every engine, and JavaScript never fuses a multiply into an add, so a function built of nothing else is the same everywhere.
 *
 * These are fdlibm's (Sun's, 1993), as V8 ports them, and `hypot` is V8's own: on the engines the hashes were written with they
 * are bit for bit `Math`'s, which `test/fixedmath.test.ts` holds on a million arguments, so no hole moved for them. `sin` and `cos`
 * reduce only arguments under 2^19 times a half turn, which is far past any angle a hole is made with, and refuse a larger by name.
 */

const word = new Float64Array(1),
  half32 = new Int32Array(word.buffer),
  // which of the two 32-bit halves is the high one, on this machine
  HI = new Uint8Array(new Uint16Array([1]).buffer)[0] === 1 ? 1 : 0,
  LO = 1 - HI;

function high(x: number): number {
  word[0] = x;
  return half32[HI];
}

function low(x: number): number {
  word[0] = x;
  return half32[LO];
}

function fromWords(hi: number, lo: number): number {
  half32[HI] = hi;
  half32[LO] = lo;
  return word[0];
}

// fdlibm's tests of a high word against a constant, as tests of |x| against the least double that high word is past, which
// are the same tests exactly and save writing every argument into a typed array to read it
const TINY = 2 ** -27, // a high word under 0x3e400000
  THREE_TENTHS = fromWords(0x3fd33333, 0), // under 0x3fd33333
  PAST_78125 = fromWords(0x3fe90001, 0), // over 0x3fe90000
  PAST_PIO4 = fromWords(0x3fe921fc, 0); // over 0x3fe921fb

const S1 = -1.66666666666666324348e-1,
  S2 = 8.33333333332248946124e-3,
  S3 = -1.98412698298579493134e-4,
  S4 = 2.75573137070700676789e-6,
  S5 = -2.50507602534068634195e-8,
  S6 = 1.58969099521155010221e-10;

/** fdlibm's `__kernel_sin`: sin of `x + y` for |x| up to a quarter of pi, where `y` is the tail `x` could not hold. */
function kernelSin(x: number, y: number, tail: boolean): number {
  if (Math.abs(x) < TINY) return x;
  const z = x * x,
    v = z * x,
    r = S2 + z * (S3 + z * (S4 + z * (S5 + z * S6)));
  return tail ? x - (z * (0.5 * y - v * r) - y - v * S1) : x + v * (S1 + z * r);
}

const C1 = 4.16666666666666019037e-2,
  C2 = -1.38888888888741095749e-3,
  C3 = 2.48015872894767294178e-5,
  C4 = -2.75573143513906633035e-7,
  C5 = 2.0875723212981748279e-9,
  C6 = -1.13596475577881948265e-11;

/** fdlibm's `__kernel_cos`: cos of `x + y` for |x| up to a quarter of pi. */
function kernelCos(x: number, y: number): number {
  const ax = Math.abs(x);
  if (ax < TINY) return 1;
  const z = x * x,
    r = z * (C1 + z * (C2 + z * (C3 + z * (C4 + z * (C5 + z * C6)))));
  if (ax < THREE_TENTHS) return 1 - (0.5 * z - (z * r - x * y));
  // a quarter of x, cut to its high word
  const qx = ax >= PAST_78125 ? 0.28125 : fromWords((high(x) & 0x7fffffff) - 0x00200000, 0);
  return 1 - qx - (0.5 * z - qx - (z * r - x * y));
}

const INV_PIO2 = 6.36619772367581382433e-1,
  PIO2_1 = 1.57079632673412561417,
  PIO2_1T = 6.07710050650619224932e-11,
  PIO2_2 = 6.0771005063039659766e-11,
  PIO2_2T = 2.02226624879595063154e-21,
  PIO2_3 = 2.0222662487111664558e-21,
  PIO2_3T = 8.47842766036889956997e-32;

// the high words of n times a half pi, for n from 1 to 32: an argument this near one needs the reduction's later rounds
const NEAR_PIO2: number[] = [];
for (let n = 1; n <= 32; n++) NEAR_PIO2.push(high((n * Math.PI) / 2));

// the reduced argument, as a head and a tail, written by `reduce`
const reduced = new Float64Array(2);

/** fdlibm's `__ieee754_rem_pio2` for the arguments it reduces in double: `x` less n half pis, into `reduced`, and n. */
function reduce(x: number): number {
  const hx = high(x),
    ix = hx & 0x7fffffff;
  if (ix < 0x4002d97c) {
    // under three quarters of pi: n is one either way
    const sign = hx > 0 ? 1 : -1;
    let z = x - sign * PIO2_1;
    if (ix !== 0x3ff921fb) {
      reduced[0] = z - sign * PIO2_1T;
      reduced[1] = z - reduced[0] - sign * PIO2_1T;
    } else {
      z -= sign * PIO2_2;
      reduced[0] = z - sign * PIO2_2T;
      reduced[1] = z - reduced[0] - sign * PIO2_2T;
    }
    return sign;
  }
  if (ix > 0x413921fb) throw new RangeError(`${x} is past the angles fixedmath reduces, 2^19 half turns`);
  let t = Math.abs(x);
  const n = (t * INV_PIO2 + 0.5) | 0,
    fn = n;
  let r = t - fn * PIO2_1,
    w = fn * PIO2_1T;
  reduced[0] = r - w;
  if (n >= 32 || ix === NEAR_PIO2[n - 1]) {
    const j = ix >> 20;
    if (j - ((high(reduced[0]) >> 20) & 0x7ff) > 16) {
      t = r;
      w = fn * PIO2_2;
      r = t - w;
      w = fn * PIO2_2T - (t - r - w);
      reduced[0] = r - w;
      if (j - ((high(reduced[0]) >> 20) & 0x7ff) > 49) {
        t = r;
        w = fn * PIO2_3;
        r = t - w;
        w = fn * PIO2_3T - (t - r - w);
        reduced[0] = r - w;
      }
    }
  }
  reduced[1] = r - reduced[0] - w;
  if (hx < 0) {
    reduced[0] = -reduced[0];
    reduced[1] = -reduced[1];
    return -n;
  }
  return n;
}

/** The sine of `x`, the same on every engine. */
export function sin(x: number): number {
  const ax = Math.abs(x);
  if (ax < PAST_PIO4) return kernelSin(x, 0, false);
  if (!(ax < Infinity)) return NaN;
  const n = reduce(x),
    a = reduced[0],
    b = reduced[1];
  switch (n & 3) {
    case 0:
      return kernelSin(a, b, true);
    case 1:
      return kernelCos(a, b);
    case 2:
      return -kernelSin(a, b, true);
    default:
      return -kernelCos(a, b);
  }
}

/** The cosine of `x`, the same on every engine. */
export function cos(x: number): number {
  const ax = Math.abs(x);
  if (ax < PAST_PIO4) return kernelCos(x, 0);
  if (!(ax < Infinity)) return NaN;
  const n = reduce(x),
    a = reduced[0],
    b = reduced[1];
  switch (n & 3) {
    case 0:
      return kernelCos(a, b);
    case 1:
      return -kernelSin(a, b, true);
    case 2:
      return -kernelCos(a, b);
    default:
      return kernelSin(a, b, true);
  }
}

/**
 * The cosine of `x` into `out[0]` and its sine into `out[1]`, each exactly what `cos` and `sin` give, from one reduction: the
 * noise asks both of every lattice point, and reducing twice was a sixth of what The Links cost to make.
 */
export function cosSin(x: number, out: Float64Array): void {
  const ax = Math.abs(x);
  if (ax < PAST_PIO4) {
    out[0] = kernelCos(x, 0);
    out[1] = kernelSin(x, 0, false);
    return;
  }
  if (!(ax < Infinity)) {
    out[0] = out[1] = NaN;
    return;
  }
  const n = reduce(x),
    a = reduced[0],
    b = reduced[1],
    c = kernelCos(a, b),
    s = kernelSin(a, b, true);
  switch (n & 3) {
    case 0:
      out[0] = c;
      out[1] = s;
      return;
    case 1:
      out[0] = -s;
      out[1] = c;
      return;
    case 2:
      out[0] = -c;
      out[1] = -s;
      return;
    default:
      out[0] = s;
      out[1] = -c;
  }
}

const ATAN_HI = [4.63647609000806093515e-1, 7.85398163397448278999e-1, 9.82793723247329054082e-1, 1.570796326794896558],
  ATAN_LO = [
    2.26987774529616870924e-17, 3.06161699786838301793e-17, 1.39033110312309984516e-17, 6.12323399573676603587e-17,
  ],
  AT = [
    3.33333333333329318027e-1, -1.99999999998764832476e-1, 1.42857142725034663711e-1, -1.1111110405462355788e-1,
    9.09088713343650656196e-2, -7.69187620504482999495e-2, 6.66107313738753120669e-2, -5.83357013379057348645e-2,
    4.97687799461593236017e-2, -3.6531572744216915527e-2, 1.62858201153657823623e-2,
  ];

/** fdlibm's `atan`, which `atan2` is built on. */
function atan(x: number): number {
  const hx = high(x),
    ix = hx & 0x7fffffff;
  if (ix >= 0x44100000) {
    if (x !== x) return x;
    return hx > 0 ? ATAN_HI[3] + ATAN_LO[3] : -ATAN_HI[3] - ATAN_LO[3];
  }
  let id = -1;
  if (ix < 0x3fdc0000) {
    if (ix < 0x3e400000) return x;
  } else {
    x = Math.abs(x);
    if (ix < 0x3ff30000) {
      if (ix < 0x3fe60000) {
        id = 0;
        x = (2 * x - 1) / (2 + x);
      } else {
        id = 1;
        x = (x - 1) / (x + 1);
      }
    } else if (ix < 0x40038000) {
      id = 2;
      x = (x - 1.5) / (1 + 1.5 * x);
    } else {
      id = 3;
      x = -1 / x;
    }
  }
  const z = x * x,
    w = z * z,
    s1 = z * (AT[0] + w * (AT[2] + w * (AT[4] + w * (AT[6] + w * (AT[8] + w * AT[10]))))),
    s2 = w * (AT[1] + w * (AT[3] + w * (AT[5] + w * (AT[7] + w * AT[9]))));
  if (id < 0) return x - x * (s1 + s2);
  const r = ATAN_HI[id] - (x * (s1 + s2) - ATAN_LO[id] - x);
  return hx < 0 ? -r : r;
}

const PI = 3.141592653589793,
  PI_LO = 1.2246467991473532e-16,
  PI_O_2 = 1.5707963267948966,
  PI_O_4 = 0.7853981633974483;

/** The angle of the point (x, y) from the x axis, from minus pi to pi, the same on every engine. */
export function atan2(y: number, x: number): number {
  if (x !== x || y !== y) return x + y;
  const hx = high(x),
    lx = low(x),
    ix = hx & 0x7fffffff,
    hy = high(y),
    ly = low(y),
    iy = hy & 0x7fffffff;
  if (((hx - 0x3ff00000) | lx) === 0) return atan(y);
  // two for x below nought, one for y
  let m = ((hy >> 31) & 1) | ((hx >> 30) & 2);
  if ((iy | ly) === 0) return m === 2 ? PI : m === 3 ? -PI : y;
  if ((ix | lx) === 0) return hy < 0 ? -PI_O_2 : PI_O_2;
  if (ix === 0x7ff00000) {
    if (iy === 0x7ff00000) return [PI_O_4, -PI_O_4, 3 * PI_O_4, -3 * PI_O_4][m];
    return [0, -0, PI, -PI][m];
  }
  if (iy === 0x7ff00000) return hy < 0 ? -PI_O_2 : PI_O_2;
  const k = (iy - ix) >> 20;
  let z: number;
  if (k > 60) {
    z = PI_O_2 + 0.5 * PI_LO;
    m &= 1;
  } else if (hx < 0 && k < -60) z = 0;
  else z = atan(Math.abs(y / x));
  switch (m) {
    case 0:
      return z;
    case 1:
      return -z;
    case 2:
      return PI - (z - PI_LO);
    default:
      return z - PI_LO - PI;
  }
}

/**
 * The length of a vector of two sides, or three, the same on every engine: V8's own sum, each side over the longest, squared,
 * with Kahan's compensation. Not a rest parameter, since a tree's canopy asks it every step in play and nothing is made a frame;
 * and a third side of nought is not the same as none, since the sum it compensates is one term longer.
 */
export function hypot(a: number, b: number, c?: number): number {
  const x = Math.abs(a),
    y = Math.abs(b),
    z = c === undefined ? 0 : Math.abs(c);
  if (x === Infinity || y === Infinity || z === Infinity) return Infinity;
  if (x !== x || y !== y || z !== z) return NaN;
  const most = Math.max(x, y, z);
  if (most === 0) return 0;
  // the first term has no compensation yet, so it is the sum exactly
  const nx = x / most,
    ny = y / most;
  const first = nx * nx,
    second = ny * ny,
    two = first + second;
  if (c === undefined) return Math.sqrt(two) * most;
  const compensation = two - first - second,
    nz = z / most;
  return Math.sqrt(two + (nz * nz - compensation)) * most;
}
