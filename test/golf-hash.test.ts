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

/** Written from the code at d3e50ec, before any of the second golf course's options existed. */
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
  'The Pinball Shed/The Funnel': 2705024979,
  'The Pinball Shed/Plinko': 652522941,
  'The Pinball Shed/Half-pipe': 3241489972,
  'The Pinball Shed/Three Cushion': 816518757,
  'The Pinball Shed/The Kicker': 4223459076,
  'The Pinball Shed/Flipper Alley': 2467036676,
  'The Pinball Shed/The Bowl Pit': 967955089,
  'The Pinball Shed/Multiball': 3179678959,
  'The Fair/Turnstile': 761470657,
  'The Fair/Traffic': 3338434700,
  'The Fair/The Lift': 503578616,
  'The Fair/Whack-a-mole': 620338661,
  'The Fair/Dodgems': 2988316759,
  'The Fair/Carousel': 4026004711,
  'The Fair/Ferris': 140209976,
  'The Fair/Shooting Gallery': 3269190224,
  'The Fair/The Big Wheel': 1117635865,
  'The Waterworks/The Causeway': 1713942109,
  'The Waterworks/The Stepping Stones': 2328194496,
  'The Waterworks/The Lock': 2528163538,
  'The Waterworks/The Island Green': 1825248455,
  'The Waterworks/The Spillway': 2868306189,
  'The Waterworks/Mill Pond': 1858412701,
  'The Waterworks/The Weir': 2586536600,
  'The Waterworks/The Rapids': 2853659080,
  'The Waterworks/The Flood': 1734075079,
  'The Links/The Opener': 1078683452,
  'The Links/Water Carry': 676883533,
  'The Links/Long Bend': 3576940142,
  'The Links/Tight Left': 4293291655,
  'The Links/Island Green': 2591990442,
  'The Links/Rushing Brook': 137527356,
  'The Links/The Big Dogleg': 1507392371,
  'The Links/The Straight Mile': 2776316639,
  'The Links/Home Stretch': 236793054,
};

/** The Fells and The Isles, as they were when they were built (5 October 2026): the same hash, so a generator change that redraws them is seen. */
const BUILT: Record<string, number> = {
  'The Fells/Fell Foot': 1440210233,
  'The Fells/The Pinewood': 4183814432,
  'The Fells/Tarn': 3440185478,
  'The Fells/Scree Corner': 1322076311,
  'The Fells/The Plunge': 2137109730,
  'The Fells/Beck Bend': 2973865398,
  'The Fells/The Shortcut': 875279416,
  'The Fells/Waterfall': 3583191086,
  'The Fells/The Fell Race': 938263015,
  'The Isles/Landfall': 737574761,
  'The Isles/The Green Isle': 3259333563,
  'The Isles/Long Water': 4185261796,
  'The Isles/The Archipelago': 1240752909,
  'The Isles/Causeway': 1373283062,
  'The Isles/The Long Swim': 1456314309,
  'The Isles/Two Lakes': 4243180024,
  'The Isles/The Peninsula': 169994907,
  'The Isles/Home Waters': 397515127,
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
    expect(Object.keys(WAS)).toHaveLength(45);
    for (const key of Object.keys(WAS)) expect(got[key], key).toBe(WAS[key]);
  });

  it('holds every hole of The Fells and The Isles to the hash it was built with', () => {
    const got = Object.fromEntries(COURSES.flatMap((c) => c.holes.map((h) => [`${c.name}/${h.name}`, hashHole(h)])));
    expect(Object.keys(BUILT)).toHaveLength(18);
    for (const key of Object.keys(BUILT)) expect(got[key], key).toBe(BUILT[key]);
  });
});
