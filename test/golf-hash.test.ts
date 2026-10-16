/**
 * Every hole of every course, held to a hash written before the second golf course's options existed: the map, the par, the
 * wind, the greens' speed, the obstacles and the terrain's bytes. A new option on a golf spec has a default that is the old
 * behaviour, and without this a generator that read it a little differently would redraw The Links and only the pace
 * gate, much later, would say so.
 */
import { describe, expect, it } from 'vitest';
import { COURSES } from '../src/course';
import { golfHole } from '../src/golf';
import { LINKS_SPECS } from '../src/links';
import { hashHole } from './helpers';

/**
 * Written from the code at d3e50ec, before any of the second golf course's options existed. The nine Links hashes were written
 * again on 9 October 2026 for the rolling land (`GolfSpec.rolling`: the long swell and the banks): with `rolling: false` on their
 * specs in a scratch edit (reverted) the nine below return to the digit; the Fells and minigolf did not move.
 */
// Five Links holes (Water Carry, Long Bend, Tight Left, Island Green, Rushing Brook) were written again on 14 October 2026 when
// the generator began to fell a tree whose crown a ball at rest on the bank beside it would be inside (`felled` in
// `golf.ts`): each lost a tree or two on a bank's steep face, nothing else moved, and with the felling skipped in a scratch
// edit the old hashes return. The nine were written again on 16 October 2026 when the banks came to be smoothed along their run
// (`BANKS.smooth`), with the 36 of `BUILT` that roll: with `smooth: 0` in a scratch edit the old hashes return.
const WAS: Record<string, number> = {
  'The Meadow/Straight': 802064974,
  'The Meadow/Dog-leg': 3943613642,
  'The Meadow/The Bunker': 3459357632,
  'The Meadow/Pond': 4098584596,
  'The Meadow/Barriers': 3658113230,
  'The Meadow/Bumpers': 1860985376,
  'The Meadow/Up and Over': 3808912347,
  'The Meadow/Windmill': 2176577670,
  'The Meadow/The Mill Race': 559976855,
  'The Pinball Shed/Corner Pocket': 3473042101,
  'The Pinball Shed/Half-pipe': 3241489972,
  'The Pinball Shed/The Kicker': 4223459076,
  'The Pinball Shed/Three Cushion': 816518757,
  'The Pinball Shed/Dodgems': 2988316759,
  'The Pinball Shed/Flipper Alley': 2467036676,
  'The Pinball Shed/The Bowl Pit': 967955089,
  'The Pinball Shed/Shooting Gallery': 3269190224,
  'The Pinball Shed/Multiball': 3179678959,
  'The Waterworks/The Causeway': 1713942109,
  'The Waterworks/The Stepping Stones': 2328194496,
  'The Waterworks/Traffic': 3338434700,
  'The Waterworks/The Spillway': 2868306189,
  'The Waterworks/Ferris': 140209976,
  'The Waterworks/The Weir': 2586536600,
  'The Waterworks/The Rapids': 2853659080,
  'The Waterworks/The Big Wheel': 1117635865,
  'The Waterworks/The Flood': 1734075079,
  'The Links/The Opener': 2123903303,
  'The Links/Water Carry': 55828573,
  'The Links/Long Bend': 3217394849,
  'The Links/Tight Left': 2556856154,
  'The Links/Island Green': 3053101462,
  'The Links/Rushing Brook': 3353415599,
  'The Links/The Big Dogleg': 1878667673,
  'The Links/The Straight Mile': 2768382049,
  'The Links/Home Stretch': 288842493,
};

/**
 * The Fells and The Isles, as they were when they were built (5 October 2026): the same hash, so a generator change that redraws them is seen.
 * The Isles' nine were written again on 9 October 2026 for the rolling land: with `rolling: false` on their specs (a scratch edit,
 * reverted) the old nine return to the digit, and The Fells, which do not roll, did not move.
 */
// 29 of the 45 were written again on 14 October 2026 for the felling (see `WAS`): a tree or two gone from a bank on each.
const BUILT: Record<string, number> = {
  'The Fells/Fell Foot': 1440210233,
  'The Fells/The Pinewood': 4183814432,
  'The Fells/Tarn': 3340795866,
  'The Fells/Scree Corner': 1322076311,
  'The Fells/The Plunge': 2137109730,
  'The Fells/Beck Bend': 2973865398,
  'The Fells/The Shortcut': 3553717704,
  'The Fells/Waterfall': 3583191086,
  'The Fells/The Fell Race': 938263015,
  'The Isles/Landfall': 2413584939,
  'The Isles/The Green Isle': 3824284330,
  'The Isles/Long Water': 3543799077,
  'The Isles/The Archipelago': 3780261601,
  'The Isles/Causeway': 205274040,
  'The Isles/The Long Swim': 3486013065,
  'The Isles/Two Lakes': 3644600209,
  'The Isles/The Peninsula': 3067892733,
  'The Isles/Home Waters': 228289309,
  'The Heath/Gorse Gate': 808899397,
  'The Heath/Bracken Bend': 2602382566,
  'The Heath/Furze Hollow': 3693645319,
  'The Heath/The Warren': 2945229979,
  'The Heath/Heather Run': 2486963493,
  'The Heath/Beacon Top': 4076628300,
  'The Heath/Nightjar Turn': 4249712752,
  'The Heath/Adder Dip': 3641341891,
  'The Heath/Common Ground': 2338508940,
  'The Woods/Acorn Rise': 2355215305,
  'The Woods/Pine Ride': 13345370,
  'The Woods/The Beech Hanger': 2190849859,
  'The Woods/Oak Avenue': 2945824312,
  'The Woods/The Glade': 2314709461,
  'The Woods/Bluebell Walk': 3379569784,
  'The Woods/Rookery Walk': 364461665,
  'The Woods/The Coppice': 3044805767,
  'The Woods/Lantern Clearing': 1565096147,
  'The Old Course/The Burn': 573702303,
  'The Old Course/Cartgate': 215062921,
  'The Old Course/High Rigg': 2852862580,
  'The Old Course/The Road Hole': 1035678993,
  'The Old Course/Hell Bunker': 249986406,
  'The Old Course/The Long Way': 3431010151,
  'The Old Course/Dyke End': 1716689964,
  'The Old Course/The Spectacles': 3539609250,
  'The Old Course/The Auld Home': 923996084,
};

describe('the holes as they were', () => {
  it('makes each Links hole from its spec as it was, to the byte', () => {
    // made afresh here and not through `links()`, so a cached hole cannot stand in for what the generator now makes
    expect(LINKS_SPECS).toHaveLength(9);
    for (const s of LINKS_SPECS) expect(hashHole(golfHole(s)), s.name).toBe(WAS[`The Links/${s.name}`]);
  });

  it('holds every hole of every course to its hash', () => {
    // each hole that was there, by name; a course added later is not held here, so adding one moves nothing above
    const got = Object.fromEntries(COURSES.flatMap((c) => c.holes.map((h) => [`${c.name}/${h.name}`, hashHole(h)])));
    // 45 until The Fair went on 8 October 2026: nine holes cut, and the eighteen kept held to the very hashes they had
    expect(Object.keys(WAS)).toHaveLength(36);
    for (const key of Object.keys(WAS)) expect(got[key], key).toBe(WAS[key]);
  });

  it('holds every hole of The Fells, The Isles, The Heath, The Woods and The Old Course to the hash it was built with', () => {
    const got = Object.fromEntries(COURSES.flatMap((c) => c.holes.map((h) => [`${c.name}/${h.name}`, hashHole(h)])));
    // eighteen, and twenty-seven more on 14 October 2026 for The Heath, The Woods and The Old Course, written as they landed
    expect(Object.keys(BUILT)).toHaveLength(45);
    for (const key of Object.keys(BUILT)) expect(got[key], key).toBe(BUILT[key]);
  });
});
