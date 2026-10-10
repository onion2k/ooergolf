/**
 * The bytes of an array as a hash may hold them on any machine. `Math.sin`, `Math.cos` and the rest are not exact in
 * IEEE 754, and V8 computes them in C that its compiler may build differently for each chip (an Apple Mac's fuses a
 * multiply and an add where an x86 does not), so the same code gives a last bit that differs between a Mac and Linux:
 * the hashes of `begin-same` and `tint-colours`, written on a Mac, failed on Linux at the very commit that wrote them.
 * So a float is hashed as a float32 rounded to its top twelve bits of mantissa (about four significant figures: a vertex
 * a hundred yards out to a quarter of an inch), which a last bit's difference almost never crosses and any real change to
 * a mesh does, and one within 2^-16 of nought as nought, since a normal's component that is nought on one machine is a
 * hundred-thousand-billionth either side of it on another, which no rounding by its own size can join. Integers are
 * kept exact. Held, when it was written, against every one of `Math`'s functions nudged a last bit up or down on one in
 * four, eight or sixty-four of their inputs: no hash of either test moved, where the raw bytes moved fourteen.
 */
const word = new Uint32Array(1);
const single = new Float32Array(word.buffer);
const NEAR_NOUGHT = 2 ** -16;

/** One float as the word a hash holds: a float32, rounded to the nearest of every 2048 of its values, and nought near it. */
function steady(v: number): number {
  single[0] = Math.abs(v) < NEAR_NOUGHT ? 0 : v;
  return (word[0] + 0x400) & ~0x7ff;
}

/** The bytes to hash of an array: its floats steadied, anything else as it is. */
export function steadyBytes(a: ArrayBufferView): Uint8Array {
  if (a instanceof Float32Array || a instanceof Float64Array) {
    const out = new Uint32Array(a.length);
    for (let i = 0; i < a.length; i++) out[i] = steady(a[i]);
    return new Uint8Array(out.buffer);
  }
  return new Uint8Array(a.buffer, a.byteOffset, a.byteLength);
}
