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

/**
 * The eighty-one holes of the nine biome courses, each held to the hash it had when it was put in the game on 31 October 2026
 * (`COURSES`, Part 12 of the biomes plan): the map, the par, the wind, the greens, the obstacles, the terrain's bytes and the
 * biome. Written from the merged code, as of there, so their job is to hold.
 */
const BIOME_BUILT: Record<string, number> = {
  'The Saltpan/Salt Flat': 1736736313,
  'The Saltpan/White Wash': 2931321897,
  'The Saltpan/Mirage Road': 413674315,
  'The Saltpan/Dry Well': 986837256,
  'The Saltpan/Crust Walk': 1612511541,
  'The Saltpan/Glass Pan': 1847736825,
  'The Saltpan/Tumbleweed Run': 3137494475,
  'The Saltpan/Bone Flat': 3358703337,
  'The Saltpan/Evening Glare': 102416451,
  'The Mesa/Sidewinder': 4107134224,
  'The Mesa/Dry Wash': 3803963499,
  'The Mesa/Mesa Edge': 2524344732,
  'The Mesa/The Anvil': 2713586776,
  'The Mesa/Cholla Bend': 2861818181,
  'The Mesa/Butte Drop': 616502951,
  'The Mesa/Ochre Ledge': 15079895,
  'The Mesa/Red Rim': 3596026619,
  'The Mesa/Canyon Mouth': 931885323,
  'The Badlands/Rattlesnake Ridge': 3982906860,
  'The Badlands/Skull Gulch': 2540080944,
  'The Badlands/Scorpion Drop': 883937131,
  'The Badlands/Hell Hollow': 3908285612,
  'The Badlands/Gallows Wash': 2298857823,
  'The Badlands/Buzzard Roost': 3473629517,
  'The Badlands/Thirst': 3813199135,
  'The Badlands/Boneyard': 1380259162,
  'The Badlands/Last Water': 982148127,
  'Tranquility/Earthrise': 1470646376,
  'Tranquility/Small Step': 4171873799,
  'Tranquility/Mare Flat': 1217148586,
  'Tranquility/Quiet Basin': 1755186014,
  'Tranquility/Footprint': 4124790421,
  'Tranquility/Dawn Plain': 539994916,
  'Tranquility/Sea of Calm': 2982628986,
  'Tranquility/Lander\u2019s Rest': 3483780621,
  'Tranquility/Moonrise': 1337247811,
  'Copernicus/Sea of Rains': 3828507295,
  'Copernicus/Eratosthenes': 1737096028,
  'Copernicus/Apennine Climb': 3437100729,
  'Copernicus/Kepler\u2019s Rim': 2878441029,
  'Copernicus/The Central Peak': 418252702,
  'Copernicus/Ejecta': 2426867285,
  'Copernicus/Terraced Wall': 1021598784,
  'Copernicus/Crater Floor': 3965332034,
  'Copernicus/Gassendi': 1408005090,
  'The Far Side/Terminator': 3658679154,
  'The Far Side/The Rille': 3037127362,
  'The Far Side/Shackleton': 590468791,
  'The Far Side/Aitken Basin': 348020107,
  'The Far Side/Tsiolkovsky': 1262148631,
  'The Far Side/Long Shadow': 3620039411,
  'The Far Side/Moscoviense': 1363331282,
  'The Far Side/Cold Trap': 2995373521,
  'The Far Side/Last Light': 2461861908,
  'Neon Park/Neon Gate': 538018699,
  'Neon Park/Arcade Row': 3574526260,
  'Neon Park/Hologram Alley': 3801214129,
  'Neon Park/Laser Lawn': 2738564130,
  'Neon Park/Pixel Plaza': 1644593916,
  'Neon Park/Synth Drive': 2922758994,
  'Neon Park/Light Rail': 852697158,
  'Neon Park/Glow Walk': 1753936147,
  'Neon Park/Encore': 2094706231,
  'Chrome Heights/Overclock': 1451641967,
  'Chrome Heights/Heat Sink': 1385623893,
  'Chrome Heights/Server Rack': 1360620564,
  'Chrome Heights/Mainframe': 3398060500,
  'Chrome Heights/Uplink': 3142211901,
  'Chrome Heights/Cold Boot': 3148617407,
  'Chrome Heights/Silicon Spur': 146555990,
  'Chrome Heights/Datum Ridge': 2752584597,
  'Chrome Heights/Terminal': 672453169,
  'The Singularity/Redshift': 2875792359,
  'The Singularity/Dead Pixel': 507511250,
  'The Singularity/Null Pointer': 3934691922,
  'The Singularity/Warp Gate': 4285426771,
  'The Singularity/Dark Matter': 1607974589,
  'The Singularity/Zero Day': 1902025870,
  'The Singularity/Stack Overflow': 2725005258,
  'The Singularity/Last Packet': 1212684491,
  'The Singularity/Event Horizon': 3959129284,
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

  it('holds every hole of the desert, moon and future courses to the hash it had when it joined the game', () => {
    const got = Object.fromEntries(COURSES.flatMap((c) => c.holes.map((h) => [`${c.name}/${h.name}`, hashHole(h)])));
    expect(Object.keys(BIOME_BUILT)).toHaveLength(81);
    for (const key of Object.keys(BIOME_BUILT)) expect(got[key], key).toBe(BIOME_BUILT[key]);
  });
});
