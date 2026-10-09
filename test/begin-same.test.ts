/**
 * A golf hole's begin was made faster without changing a vertex of what it draws or a number of what it plays by: the
 * zones' grids and curves, the ground's twelve meshes, the pond's bands and ring and the plane under the hole, for every
 * golf hole of every course, each held to a hash of its bytes written from the code before the speed-up. Without this a
 * rewrite of the passes that wrote a vertex a bit differently would redraw a hole and only the pictures, much later, would say.
 * (`RECORD=1 npx vitest run test/begin-same.test.ts` prints the table again, for a change that is meant to move a hole.)
 */
import { describe, expect, it } from 'vitest';
import type { Mesh } from 'artshape-render/mesh/types';
import { layoutOf, type Layout } from '../src/arena';
import { groundOf } from '../src/ground';
import { planeOf } from '../src/hills';
import { links } from '../src/links';
import { fells } from '../src/fells';
import { isles } from '../src/isles';
import { pondOf } from '../src/waterdraw';
import { zonesOf } from '../src/zones';

const COURSES_OF_GOLF = [
  ['The Links', links()],
  ['The Fells', fells()],
  ['The Isles', isles()],
] as const;

/** FNV-1a over the bytes of typed arrays, in order. */
function fnv(h: number, a: ArrayBufferView): number {
  const b = new Uint8Array(a.buffer, a.byteOffset, a.byteLength);
  for (let i = 0; i < b.length; i++) h = Math.imul(h ^ b[i], 0x01000193);
  return h;
}
const mesh = (h: number, m: Mesh) => {
  h = fnv(h, m.positions);
  h = fnv(h, m.normals);
  h = fnv(h, m.uvs);
  return fnv(h, m.indices);
};
const seed = 0x811c9dc5;

/** A ground that is nothing like the hills', so the plane is held on its own. */
const ROLLING = (x: number, y: number) => 6 * Math.sin(x / 37) * Math.cos(y / 29) + 3;

function hashes(layout: Layout) {
  const z = zonesOf(layout);
  let hz = seed;
  for (const d of z.d) if (d) hz = fnv(hz, d);
  for (const c of z.curves) hz = fnv(hz, c);
  const g = groundOf(layout);
  let hg = mesh(seed, g.green);
  hg = mesh(hg, g.mown);
  hg = mesh(hg, g.banks);
  for (const m of Object.values(g.golf!)) hg = mesh(hg, m);
  const pond = pondOf(layout);
  let hp = seed;
  for (const p of pond.parts) hp = mesh(hp, p.mesh);
  for (const s of pond.spots)
    hp = fnv(hp, Float64Array.of(s.x, s.y, s.z, s.r, s.height, s.top, s.bank, s.kind, s.yaw, s.narrow));
  const hl = mesh(seed, planeOf(layout, ROLLING, 900));
  return { zones: hz, ground: hg, pond: hp, plane: hl };
}

/** Written from the code as it stood before the speed-up (the worktree of 9 October 2026, Parts 1 to 7 uncommitted); The Links and The Isles written again the same day for the rolling land (the long swell, the banks and the stripes' line of play: with `rolling: false` on their specs the old table returns to the digit, and The Fells did not move). */
const WAS: Record<string, { zones: number; ground: number; pond: number; plane: number }> = {
  'The Links/The Opener': { zones: -1275038992, ground: 2081108835, pond: 2166136261, plane: 1554546831 },
  'The Links/Water Carry': { zones: 2115519521, ground: 1263377783, pond: 748924230, plane: 421761148 },
  'The Links/Long Bend': { zones: -1823028550, ground: 1426316832, pond: 442144055, plane: 358350617 },
  'The Links/Tight Left': { zones: 1094507272, ground: -472535547, pond: 2166136261, plane: -1248518376 },
  'The Links/Island Green': { zones: -1860700679, ground: -1071395282, pond: 1857421023, plane: -387704165 },
  'The Links/Rushing Brook': { zones: -1935572655, ground: 319123341, pond: 263028321, plane: -539190375 },
  'The Links/The Big Dogleg': { zones: 1040033818, ground: 1793541713, pond: 1600460057, plane: 420336189 },
  'The Links/The Straight Mile': { zones: 919935320, ground: -490644745, pond: 2166136261, plane: -1957928105 },
  'The Links/Home Stretch': { zones: -1620813585, ground: 1466161062, pond: -1127794020, plane: -22628760 },
  'The Fells/Fell Foot': { zones: 1745626410, ground: -662892834, pond: 2166136261, plane: -35605023 },
  'The Fells/The Pinewood': { zones: -464646215, ground: -2019113310, pond: 2166136261, plane: 2098726268 },
  'The Fells/Tarn': { zones: -92415937, ground: -1469043490, pond: 1856265057, plane: 1564581720 },
  'The Fells/Scree Corner': { zones: -605353476, ground: -644338342, pond: 1144610619, plane: -1777945113 },
  'The Fells/The Plunge': { zones: -371924034, ground: -142067240, pond: 2166136261, plane: -113067549 },
  'The Fells/Beck Bend': { zones: -89165441, ground: 1401658205, pond: 26183953, plane: -1014499854 },
  'The Fells/The Shortcut': { zones: 2143796104, ground: 1728565972, pond: 2166136261, plane: 512881580 },
  'The Fells/Waterfall': { zones: -1575254133, ground: -1122113222, pond: -1847671060, plane: 674232028 },
  'The Fells/The Fell Race': { zones: 714417175, ground: 171195044, pond: 2166136261, plane: 1021980914 },
  'The Isles/Landfall': { zones: 1157449798, ground: 661855327, pond: 1444130475, plane: -1886767588 },
  'The Isles/The Green Isle': { zones: -2089770936, ground: -1970462592, pond: -1635567752, plane: -539689133 },
  'The Isles/Long Water': { zones: 443750067, ground: -1402015757, pond: 255269492, plane: -960148970 },
  'The Isles/The Archipelago': { zones: -1227622475, ground: -1764358799, pond: -1369804907, plane: 945041124 },
  'The Isles/Causeway': { zones: -1606408912, ground: -784491559, pond: -1297808402, plane: -2023713878 },
  'The Isles/The Long Swim': { zones: -1685188984, ground: -1413313846, pond: -903263224, plane: -1381362368 },
  'The Isles/Two Lakes': { zones: 579101098, ground: -378917038, pond: -1432988693, plane: -2095606795 },
  'The Isles/The Peninsula': { zones: 2067909156, ground: 975056269, pond: 2035453438, plane: -1727244620 },
  'The Isles/Home Waters': { zones: -108314611, ground: -1697296870, pond: -128799534, plane: -274874910 },
};

describe('a golf hole begun fast is the hole that was begun slowly', () => {
  for (const [course, holes] of COURSES_OF_GOLF)
    for (const h of holes)
      it(`${course}: ${h.name}`, () => {
        const got = hashes(layoutOf(h.map, h.terrain));
        const key = `${course}/${h.name}`;
        if (process.env.RECORD) console.log(`  '${key}': ${JSON.stringify(got)},`);
        else expect(got, key).toEqual(WAS[key]);
      });
});
