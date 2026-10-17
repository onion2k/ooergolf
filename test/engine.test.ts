/**
 * A golf hole is the same hole on every JavaScript engine. The language does not promise the last bit of `Math.sin`, `Math.exp`
 * and the rest, and engines differ there: Node 20 and Node 23 disagree on about one call in a hundred, and so do the browsers.
 * The generator spends those functions on its noise and its shapes, so without this a hole could be made differently from one
 * machine to the next, and the hashes `golf-hash` and the field table hold it to would be true on one and false on another
 * (The Old Course's Cartgate was, on 17 October 2026: its lake bed carried a rounding of a millionth of a millionth of a yard,
 * which a float32 keeps next to nought, and which came out differently on the two). Here another engine is stood in for by
 * nudging the last bit of every such function's answer, and every hole must come out to the bit.
 */
import { afterEach, describe, expect, it } from 'vitest';
import { golfHole, type GolfSpec } from '../src/golf';
import { hashHole } from '../src/holehash';
import { FELLS_SPECS } from '../src/fells';
import { HEATH_SPECS } from '../src/heath';
import { ISLES_SPECS } from '../src/isles';
import { LINKS_SPECS } from '../src/links';
import { OLD_SPECS } from '../src/old';
import { WOODS_SPECS } from '../src/woods';

// the functions whose answers the language leaves to the engine; `sqrt` is not one, since IEEE rounds it exactly
const LOOSE = [
  'sin',
  'cos',
  'tan',
  'asin',
  'acos',
  'atan',
  'atan2',
  'exp',
  'expm1',
  'log',
  'log1p',
  'log2',
  'log10',
  'pow',
  'hypot',
  'cbrt',
  'sinh',
  'cosh',
  'tanh',
] as const;

const original = Object.fromEntries(LOOSE.map((f) => [f, Math[f].bind(Math)])) as Record<
  (typeof LOOSE)[number],
  (...a: number[]) => number
>;

const bits = new Float64Array(1),
  word = new BigInt64Array(bits.buffer);

/** The double one step from `v`, up or down: what another engine's last bit may be. An exact answer is left alone, as engines agree on those. */
function nudged(v: number, up: boolean): number {
  if (!Number.isFinite(v) || Number.isInteger(v)) return v;
  bits[0] = v;
  word[0] += v > 0 === up ? 1n : -1n;
  return bits[0];
}

/** Every loose function answers a step off its own, up or down by its arguments' bits, so it is a fixed engine and not noise. */
function otherEngine() {
  for (const f of LOOSE)
    (Math as unknown as Record<string, unknown>)[f] = (...a: number[]) => {
      bits[0] = a[0] + 2 * (a[1] ?? 0);
      return nudged(original[f](...a), (word[0] & 1n) === 1n);
    };
}

afterEach(() => Object.assign(Math, original));

const COURSES: [string, readonly GolfSpec[]][] = [
  ['The Links', LINKS_SPECS],
  ['The Heath', HEATH_SPECS],
  ['The Fells', FELLS_SPECS],
  ['The Woods', WOODS_SPECS],
  ['The Isles', ISLES_SPECS],
  ['The Old Course', OLD_SPECS],
];

describe('a golf hole on another engine', () => {
  it('nudges what it says it nudges', () => {
    otherEngine();
    let moved = 0;
    for (let i = 1; i < 200; i++) if (Math.sin(i / 7) !== original.sin(i / 7)) moved++;
    expect(moved).toBeGreaterThan(150);
    expect(Math.pow(2, 10)).toBe(1024);
  });

  for (const [course, specs] of COURSES)
    it(`makes every hole of ${course} to the bit`, () => {
      const here = specs.map((s) => hashHole(golfHole(s)));
      otherEngine();
      const there = specs.map((s) => hashHole(golfHole(s)));
      expect(Object.fromEntries(specs.map((s, i) => [s.name, there[i]]))).toEqual(
        Object.fromEntries(specs.map((s, i) => [s.name, here[i]])),
      );
    });
});
