/**
 * The fixed `sin`, `cos`, `atan2` and `hypot` are fdlibm's and V8's to the bit, on whatever engine runs this. The fingerprints
 * below were made by Node 18 and Node 20's own `Math` (which are fdlibm, and V8's `hypot`) over these very arguments, on 17
 * October 2026, and never by the code they check; Node 23 on an Apple machine gives other fingerprints for all but `hypot`,
 * which is why the generator does not use `Math`. A port that slipped a bit anywhere would give another fingerprint, and the
 * golf holes would move with it.
 */
import { describe, expect, it } from 'vitest';
import { atan2, cos, cosSin, hypot, sin } from '../src/fixedmath';

const FDLIBM = { sin: 1151880033, cos: 752495854, atan2: 3267290458, hypot: 930251077, hypot3: 3736587492 };

describe('the fixed maths', () => {
  it('is fdlibm to the bit on two hundred thousand arguments', () => {
    const f64 = new Float64Array(1),
      u32 = new Uint32Array(f64.buffer);
    let s = 7;
    const r = () => (s = (Math.imul(s, 1103515245) + 12345) >>> 0) / 4294967296;
    const fold = { sin: 2166136261, cos: 2166136261, atan2: 2166136261, hypot: 2166136261, hypot3: 2166136261 };
    const add = (k: keyof typeof fold, v: number) => {
      f64[0] = v;
      for (const w of [u32[0], u32[1]]) fold[k] = Math.imul(fold[k] ^ w, 16777619) >>> 0;
    };
    for (let i = 0; i < 200000; i++) {
      const scale = [1, 7, 50, 1000][i & 3];
      const a = (r() - 0.5) * 2 * scale,
        b = (r() - 0.5) * 2 * scale;
      add('sin', sin(a));
      add('cos', cos(a));
      add('atan2', atan2(a, b));
      add('hypot', hypot(a, b));
      add('hypot3', hypot(a, b, a * b));
    }
    expect(fold).toEqual(FDLIBM);
  });

  it('gives the exact answers and the edges as Math does', () => {
    for (const v of [0, -0, 1e-30, -1e-30]) {
      expect(Object.is(sin(v), v)).toBe(true);
      expect(cos(v)).toBe(1);
    }
    for (const v of [Infinity, -Infinity, NaN]) {
      expect(sin(v)).toBeNaN();
      expect(cos(v)).toBeNaN();
    }
    expect(atan2(0, -1)).toBe(Math.PI);
    expect(atan2(-0, -1)).toBe(-Math.PI);
    expect(Object.is(atan2(-0, 1), -0)).toBe(true);
    expect(atan2(1, 0)).toBe(Math.PI / 2);
    expect(atan2(1, 1)).toBe(Math.PI / 4);
    expect(atan2(Infinity, -Infinity)).toBe((3 * Math.PI) / 4);
    expect(atan2(NaN, 1)).toBeNaN();
    expect(hypot(3, 4)).toBe(5);
    expect(hypot(0, -0)).toBe(0);
    expect(hypot(NaN, Infinity)).toBe(Infinity);
    expect(hypot(NaN, 1)).toBeNaN();
    expect(hypot(2, 3, 6)).toBe(7);
  });

  it('is within two bits of Math on angles near every half turn, where the reduction works hardest', () => {
    const ulp = (v: number) => Math.max(Number.EPSILON * Math.abs(v), Number.MIN_VALUE);
    for (let n = -64; n <= 64; n++)
      for (let d = -3; d <= 3; d++) {
        const x = ((n * Math.PI) / 2) * (1 + d * Number.EPSILON);
        expect(Math.abs(sin(x) - Math.sin(x))).toBeLessThanOrEqual(2 * ulp(Math.sin(x)));
        expect(Math.abs(cos(x) - Math.cos(x))).toBeLessThanOrEqual(2 * ulp(Math.cos(x)));
      }
  });

  it('gives from cosSin exactly what cos and sin give, from one reduction', () => {
    const out = new Float64Array(2);
    for (let i = -20000; i <= 20000; i++) {
      const x = i / 997;
      cosSin(x, out);
      expect(Object.is(out[0], cos(x)) && Object.is(out[1], sin(x)), String(x)).toBe(true);
    }
    for (const x of [-0, Infinity, NaN]) {
      cosSin(x, out);
      expect([out[0], out[1]]).toEqual([cos(x), sin(x)]);
    }
  });

  it('refuses an angle past what it reduces, by name', () => {
    expect(() => sin(2 ** 21)).toThrow(/past the angles fixedmath reduces/);
    expect(() => cos(-(2 ** 21))).toThrow(/past the angles fixedmath reduces/);
    expect(Math.abs(sin(2 ** 19) - Math.sin(2 ** 19))).toBeLessThan(1e-15);
  });
});
