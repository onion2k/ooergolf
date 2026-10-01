/**
 * What the tests of the wind, the shape and the spin share: a hole whose wind blows toward the way a test says (a hole's
 * wind is its name's, so one is found by searching names), and a field with its cup in the middle of its width, clear of the
 * rail, where a shot at the cup may be blown to either side. Not a test itself.
 */
import type { HoleDef } from '../src/course';
import { windDirection } from '../src/shaping';
import { field } from './helpers';

/** North, along the field, which is the way the tee faces. */
export const NORTH = Math.PI / 2;

const found = new Map<number, string>();

/** The name of a hole whose wind blows toward `want` radians (from +x toward +y), to within a few hundredths of one. */
export function blowing(want: number): string {
  const key = Math.round(want * 1000);
  const known = found.get(key);
  if (known) return known;
  for (let i = 0; i < 20000; i++) {
    const name = `Windy field ${i}`;
    const [x, y] = windDirection(name);
    const off = Math.atan2(Math.sin(Math.atan2(y, x) - want), Math.cos(Math.atan2(y, x) - want));
    if (Math.abs(off) < 0.03) {
      found.set(key, name);
      return name;
    }
  }
  throw new Error(`no name has a wind toward ${want}`);
}

/** `hole`, with a wind of `mph` miles an hour blowing toward `toward` radians. */
export function windy(hole: HoleDef, toward: number, mph: number): HoleDef {
  return { ...hole, name: blowing(toward), wind: mph };
}

/** A field of `surface` with its cup `row` rows from the south end and in the middle of its width, where the ball may be blown either way. */
export function openField(surface: 'f' | 'r' | 'g' | 's' = 'f', rows = 200, cols = 81, cupRow = 180): HoleDef {
  const base = field(surface, rows, cols);
  const map = base.map.map((row) => row.replace('C', surface));
  const r = rows - 1 - cupRow;
  const c = Math.floor(cols / 2);
  map[r] = `${map[r].slice(0, c)}C${map[r].slice(c + 1)}`;
  return { ...base, map };
}
