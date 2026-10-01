/**
 * How far a golf ball goes on after it lands, and what it takes to putt: the figures the game was retuned to when the
 * player asked for a little less control, a ball that bounces and rolls a bit further so the aim has to allow for it.
 * Held here are the run-out by club on the fairway, the green and the cut, the height of a hop, how many landings a shot
 * is told of and how long it takes to rest, that a landing never gains speed along the ground even with a full topspin,
 * what a putt reaches at the normal greens, and that what must not move did not: minigolf's own ball, the rough and the
 * sand, the roll the hills of a hole are held by, and the maps of the holes. Without them a retune that loosened the
 * ball could slide into a game where a drive with topspin gains speed at each landing and runs for ever.
 */
import { describe, expect, it } from 'vitest';
import { ROLL, SAND, TILE } from '../src/arena';
import { runOn } from '../src/autopilot';
import { BAG } from '../src/bag';
import { speedName } from '../src/green';
import { links } from '../src/links';
import { RANGE } from '../src/range';
import { GREENS, LIE, SURFACES } from '../src/surfaces';
import { DT, field, golfGame } from './helpers';

const NORTH = Math.PI / 2;
type Ground = 'f' | 'g' | 'c' | 'r' | 's';

/** A field of one ground, the cut being the fairway's field with its tiles drawn as first cut. */
function ground(surface: Ground) {
  if (surface !== 'c') return field(surface);
  const base = field('f');
  return { ...base, map: base.map.map((row) => row.replace(/f/g, 'c')) };
}

interface Run {
  carry: number;
  rest: number;
  /** The highest the ball got above where it lay in its first hop after the first landing, in yards. */
  hop: number;
  landings: number;
  seconds: number;
  ready: boolean;
  /** The most the speed along the ground went up at a landing, in units a second (nought or less when it never did). */
  gain: number;
}

/** A club struck north from the surface itself, two tiles up from the tee, until it is at rest. */
function run(surface: Ground, club: string, power = 1, spin = 0): Run {
  const { game, calls } = golfGame(ground(surface));
  game.place(game.layout.tee.x, game.layout.tee.y + 2 * TILE);
  const { world, ball } = game;
  game.pick(club);
  game.setSpin(spin);
  const y0 = world.y[ball],
    z0 = world.z[ball];
  expect(game.shoot(NORTH, power)).toBe(true);
  let landed = 0,
    carry = 0,
    hop = 0,
    gain = -Infinity,
    seconds = 0;
  let phase: 'before' | 'rising' | 'done' = 'before';
  for (let f = 0; f < 40 / DT && !(f > 1 && game.ready); f++) {
    const before = Math.hypot(world.vx[ball], world.vy[ball]);
    game.step(DT);
    seconds = (f + 1) * DT;
    const told = calls.filter((c) => c[0] === 'landed').length;
    if (told > landed) {
      if (landed === 0) {
        carry = world.y[ball] - y0;
        phase = 'rising';
      }
      landed = told;
      gain = Math.max(gain, Math.hypot(world.vx[ball], world.vy[ball]) - before);
    }
    const h = world.z[ball] - z0;
    if (phase === 'rising') {
      if (h > 0.02) hop = Math.max(hop, h);
      if (hop > 0.02 && h <= 0.01) phase = 'done';
    }
  }
  return { carry, rest: world.y[ball] - y0, hop, landings: landed, seconds, ready: game.ready, gain };
}

const LOFTED = BAG.filter((c) => c.loft > 0);
const share = (r: Run) => (r.rest - r.carry) / r.carry;

describe('how far a lofted ball runs on', () => {
  it('runs a driver on a fifth to a quarter of its carry on the fairway, so a full drive goes about 290', () => {
    const r = run('f', 'driver');
    expect(share(r)).toBeGreaterThanOrEqual(0.2);
    expect(share(r)).toBeLessThanOrEqual(0.25);
    expect(r.rest).toBeGreaterThanOrEqual(285);
    expect(r.rest).toBeLessThanOrEqual(295);
  });

  it('runs a 7-iron on eight to eleven hundredths of its carry on the fairway, and its first hop is four to five yards high', () => {
    const r = run('f', '7-iron');
    expect(share(r)).toBeGreaterThanOrEqual(0.08);
    expect(share(r)).toBeLessThanOrEqual(0.11);
    expect(r.hop).toBeGreaterThanOrEqual(4);
    expect(r.hop).toBeLessThanOrEqual(5);
  });

  it('runs a sand wedge on three to four hundredths of its carry on the green', () => {
    const r = run('g', 'sand-wedge');
    expect(share(r)).toBeGreaterThanOrEqual(0.03);
    expect(share(r)).toBeLessThanOrEqual(0.04);
  });

  it('still falls from the driver to the wedge, and never changes where the first landing is', () => {
    const shares = LOFTED.map((c) => share(run('f', c.id)));
    for (let i = 1; i < shares.length; i++) expect(shares[i], LOFTED[i].id).toBeLessThanOrEqual(shares[i - 1] + 0.005);
    // the preview's ring is the first landing, which no keep, bounce or roll moves: the carries the game had before the retune
    const was: Record<string, number> = { driver: 239.0, '7-iron': 142.8, 'sand-wedge': 77.3 };
    for (const [id, carry] of Object.entries(was)) expect(run('f', id).carry, id).toBeCloseTo(carry, 0);
  });

  it('is told of no more than five landings and is at rest within four and a half seconds, any club at full power on the fairway, green or cut', () => {
    for (const surface of ['f', 'g', 'c'] as const)
      for (const club of LOFTED) {
        const r = run(surface, club.id);
        expect(r.ready, `${club.id} on ${surface}`).toBe(true);
        expect(r.landings, `${club.id} on ${surface}: landings`).toBeLessThanOrEqual(5);
        expect(r.seconds, `${club.id} on ${surface}: seconds`).toBeLessThanOrEqual(4.5);
      }
  });

  it('never gains speed along the ground at a landing, with a full topspin or none, any club on any ground at any power', () => {
    let landings = 0;
    for (const surface of ['f', 'g', 'c', 'r', 's'] as const)
      for (const club of LOFTED)
        for (const spin of [0, 1])
          for (const power of [0.3, 0.6, 1]) {
            const r = run(surface, club.id, power, spin);
            if (r.landings) landings++;
            expect(r.gain, `${club.id} on ${surface}, spin ${spin}, power ${power}`).toBeLessThanOrEqual(0);
          }
    expect(landings, 'a good many landings were measured').toBeGreaterThan(200);
  });

  it('is held to that by the table too: a landing with a full topspin keeps under all of a flat landing’s speed on the ground a ball is played from', () => {
    for (const lie of [LIE.tee, LIE.fairway, LIE.green, LIE.cut]) expect(SURFACES[lie].keep * 2).toBeLessThan(1.2);
  });
});

describe('what the autopilot expects of a landing', () => {
  it('guesses each club’s run-out on the fairway to within a point of what the game does, so the planner starts from the right place', () => {
    for (const club of LOFTED) expect(Math.abs(runOn(club) - share(run('f', club.id))), club.id).toBeLessThan(0.01);
    expect(runOn(BAG.find((c) => c.id === 'putter')!)).toBe(0);
  });
});

describe('what a putt reaches', () => {
  it('goes the speed squared over twice the roll at the normal greens, which is 14 percent further than at a roll of 16', () => {
    expect(GREENS.normal).toBe(14);
    const r = run('g', 'putter');
    const hardest = BAG.find((c) => c.id === 'putter')!.hardest;
    expect(r.rest).toBeGreaterThan(((hardest * hardest) / (2 * 16)) * 1.13);
    expect(r.rest).toBeLessThan(((hardest * hardest) / (2 * 16)) * 1.16);
  });
});

describe('what the retune did not touch', () => {
  it('keeps the minigolf green, the rough and the sand as they were, and the tee and fairway roll, which hold the hills', () => {
    expect(SURFACES[LIE.none]).toMatchObject({ roll: 16, keep: 0.45, bounce: 0.3 });
    expect(ROLL.roll).toBe(16);
    expect(SURFACES[LIE.rough]).toMatchObject({ roll: 60, keep: 0.12, bounce: 0.08 });
    expect(SURFACES[LIE.sand]).toMatchObject({ roll: 60, keep: 0.03, bounce: 0.03 });
    expect(SAND.roll).toBe(60);
    expect(SURFACES[LIE.tee].roll).toBe(20);
    expect(SURFACES[LIE.fairway].roll).toBe(20);
  });

  it('plays the surfaces a ball is played from with the keep and bounce the retune chose', () => {
    for (const lie of [LIE.tee, LIE.fairway]) {
      expect(SURFACES[lie].keep).toBeGreaterThanOrEqual(0.37 * 1.2);
      expect(SURFACES[lie].keep).toBeLessThanOrEqual(0.48);
      expect(SURFACES[lie].bounce).toBeGreaterThanOrEqual(0.3 * 1.4);
      expect(SURFACES[lie].bounce).toBeLessThanOrEqual(0.45);
    }
    expect(SURFACES[LIE.green].keep).toBeGreaterThanOrEqual(0.45 * 1.2);
    expect(SURFACES[LIE.green].keep).toBeLessThanOrEqual(0.58);
    expect(SURFACES[LIE.green].bounce).toBeGreaterThanOrEqual(0.3 * 1.4);
    expect(SURFACES[LIE.green].bounce).toBeLessThanOrEqual(0.45);
    expect(SURFACES[LIE.cut].keep).toBeGreaterThanOrEqual(0.28 * 1.2);
    expect(SURFACES[LIE.cut].keep).toBeLessThanOrEqual(0.36);
    expect(SURFACES[LIE.cut].bounce).toBeGreaterThanOrEqual(0.2 * 1.4);
    expect(SURFACES[LIE.cut].bounce).toBeLessThanOrEqual(0.3);
  });

  it('runs the greens at 11, 14 and 19.5, and the table’s own green at the normal', () => {
    expect(GREENS).toEqual({ fast: 11, normal: 14, slow: 19.5 });
    expect(SURFACES[LIE.green].roll).toBe(GREENS.normal);
    expect(SURFACES[LIE.cut].roll).toBe(23);
  });

  it('keeps each hole of The Links its word for its greens, and its map as it was', () => {
    const was: Record<string, string> = {
      'The Opener': 'medium',
      'Water Carry': 'medium',
      'Long Bend': 'medium',
      'Tight Left': 'medium',
      'Island Green': 'medium',
      'Rushing Brook': 'medium',
      'The Big Dogleg': 'medium',
      'The Straight Mile': 'fast',
      'Home Stretch': 'fast',
    };
    for (const h of links()) expect(speedName(h.greens!), h.name).toBe(was[h.name]);
  });

  it('keeps the maps of The Links and The Range exactly as they were', () => {
    const hash = (s: string) => {
      let x = 2166136261;
      for (let i = 0; i < s.length; i++) x = Math.imul(x ^ s.charCodeAt(i), 16777619) >>> 0;
      return x;
    };
    // seven of The Links' maps were written again with stage 9 of the courses plan (the corners, the ponds across the line,
    // two lengths): The Big Dogleg's and Home Stretch's are as they were, and so are The Range's
    const WAS: Record<string, number> = {
      'The Opener': 129467283,
      'Water Carry': 1080251253,
      'Long Bend': 2579849166,
      'Tight Left': 1665164726,
      'Island Green': 3979605520,
      'Rushing Brook': 1055624489,
      'The Big Dogleg': 3635079015,
      'The Straight Mile': 2049515231,
      'Home Stretch': 3791081546,
      'Pitch and Putt': 2341210762,
      'Iron Alley': 1911647415,
      'The Long Way': 3269530478,
      // the six appended to The Range at stage 8, held so a hazard that moves is a change that was meant
      'Sand Trap': 3230414894,
      'Narrow Straits': 2394408145,
      'Over the Pond': 2029183406,
      Gusty: 1252087741,
      'The Corner': 560475841,
      'The Long Road': 2869480547,
    };
    for (const h of [...links(), ...RANGE])
      expect(hash(h.map.join('\n') + JSON.stringify([h.par, null])), h.name).toBe(WAS[h.name]);
  });
});
