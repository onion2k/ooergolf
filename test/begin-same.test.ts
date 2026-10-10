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
import { steadyBytes } from './steady';

const COURSES_OF_GOLF = [
  ['The Links', links()],
  ['The Fells', fells()],
  ['The Isles', isles()],
] as const;

/** FNV-1a over the bytes of typed arrays, in order, their floats steadied so a last bit a machine's maths differs in is not counted. */
function fnv(h: number, a: ArrayBufferView): number {
  const b = steadyBytes(a);
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

/** Written from the code as it stood before the speed-up (the worktree of 9 October 2026, Parts 1 to 7 uncommitted); The Links and The Isles written again the same day for the rolling land (the long swell, the banks and the stripes' line of play: with `rolling: false` on their specs the old table returns to the digit, and The Fells did not move). Written again on 10 October 2026, from d918912 unchanged, when the hash came to be taken over steadied bytes (`steady.ts`): the raw table, written on a Mac, failed on Linux at the commit that wrote it, by a last bit of `Math.sin` and `Math.cos` in the ponds' stones. */
const WAS: Record<string, { zones: number; ground: number; pond: number; plane: number }> = {
  'The Links/The Opener': { zones: 532400465, ground: -2124716803, pond: 2166136261, plane: -1184616436 },
  'The Links/Water Carry': { zones: 1599921080, ground: -1254372291, pond: -1410841499, plane: -1498233596 },
  'The Links/Long Bend': { zones: -350346140, ground: 1137794514, pond: -883866614, plane: -891431054 },
  'The Links/Tight Left': { zones: -1502147820, ground: -1019428746, pond: 2166136261, plane: -2008702047 },
  'The Links/Island Green': { zones: -1672775420, ground: -822661721, pond: -1311425282, plane: 248728460 },
  'The Links/Rushing Brook': { zones: 359910198, ground: -167682635, pond: 218190592, plane: -1162495207 },
  'The Links/The Big Dogleg': { zones: -1043695577, ground: -351275258, pond: 616018788, plane: -870205446 },
  'The Links/The Straight Mile': { zones: -213257477, ground: 121699244, pond: 2166136261, plane: -1857583695 },
  'The Links/Home Stretch': { zones: 1083885848, ground: -1052449117, pond: 1563688945, plane: -176446348 },
  'The Fells/Fell Foot': { zones: 1480466899, ground: 1304541617, pond: 2166136261, plane: -1360529071 },
  'The Fells/The Pinewood': { zones: 974942607, ground: 1029400610, pond: 2166136261, plane: 1614233051 },
  'The Fells/Tarn': { zones: -2065640833, ground: -2079860890, pond: 841880513, plane: 100645866 },
  'The Fells/Scree Corner': { zones: -28465132, ground: 25366071, pond: 842842282, plane: 1506422078 },
  'The Fells/The Plunge': { zones: -1250916919, ground: -2146874653, pond: 2166136261, plane: -1664853441 },
  'The Fells/Beck Bend': { zones: -1341669813, ground: 1534362042, pond: -1284908415, plane: -789344490 },
  'The Fells/The Shortcut': { zones: -1848651149, ground: 740980685, pond: 2166136261, plane: -1354977662 },
  'The Fells/Waterfall': { zones: -1811107892, ground: 1931964797, pond: -587823009, plane: -356939230 },
  'The Fells/The Fell Race': { zones: -1519862255, ground: 924001333, pond: 2166136261, plane: -1243971386 },
  'The Isles/Landfall': { zones: 83627797, ground: -1828632816, pond: -734627103, plane: -236869605 },
  'The Isles/The Green Isle': { zones: 637597124, ground: 1600846422, pond: 1000655019, plane: 893125238 },
  'The Isles/Long Water': { zones: -1188609448, ground: -1695318254, pond: 991146374, plane: -135154991 },
  'The Isles/The Archipelago': { zones: -112344199, ground: -1357362357, pond: 359096187, plane: -1859739630 },
  'The Isles/Causeway': { zones: -908769797, ground: 1301927815, pond: 2058122253, plane: -987125109 },
  'The Isles/The Long Swim': { zones: 250840703, ground: 767464235, pond: -1935905046, plane: -1237168465 },
  'The Isles/Two Lakes': { zones: 1505111524, ground: 1194495715, pond: 231979409, plane: 631507220 },
  'The Isles/The Peninsula': { zones: -1336512339, ground: -1525371633, pond: 303438478, plane: 657259202 },
  'The Isles/Home Waters': { zones: -1893711787, ground: 1409520148, pond: -1885683386, plane: -53209982 },
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
