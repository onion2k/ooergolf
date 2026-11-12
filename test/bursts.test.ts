/** The bursts of particles for what happens: a puff of grass at a stroke, confetti and sparkles at the cup, and a splash. */
import { describe, expect, it } from 'vitest';
import { WATER_LEVEL } from '../src/arena';
import {
  CUP_MORE,
  cupBurst,
  cupScore,
  divot,
  DIVOT,
  farScale,
  knockSparks,
  LAND_RING,
  landRing,
  PUFF,
  SPARKS,
  splash,
  strikePuff,
  takesDivot,
} from '../src/bursts';
import { THEMES } from '../src/theme';

describe('the bursts', () => {
  it('puff grass from under the ball when it is struck, more of it for a harder shot', () => {
    const soft = strikePuff(3, 4, 0.1),
      hard = strikePuff(3, 4, 1);
    expect(soft.length).toBeGreaterThan(0);
    const count = (es: typeof soft) => es.reduce((a, e) => a + e.count, 0);
    expect(count(hard)).toBeGreaterThan(count(soft));
    for (const e of hard) {
      expect(e.position.slice(0, 2)).toEqual([3, 4]);
      expect(e.colour[1], 'grass is green').toBeGreaterThan(e.colour[0]);
    }
  });

  it('puffs sand from under a ball struck out of sand, as much of it, in the colour of sand and not of grass', () => {
    const grass = strikePuff(3, 4, 0.6),
      sand = strikePuff(3, 4, 0.6, 'sand');
    expect(sand.reduce((a, e) => a + e.count, 0)).toBe(grass.reduce((a, e) => a + e.count, 0));
    for (const e of sand) {
      expect(e.position.slice(0, 2)).toEqual([3, 4]);
      // sand: red over green over blue, warm and light; not grass, which is green over red
      expect(e.colour[0], 'warm').toBeGreaterThan(e.colour[1]);
      expect(e.colour[1]).toBeGreaterThan(e.colour[2]);
      expect(e.colour[0], 'light').toBeGreaterThan(0.8);
    }
    expect(strikePuff(3, 4, 0.6, 'grass')).toEqual(grass);
  });

  it('throws confetti of many colours up out of the cup, and sparkles with it, more for a hole in one', () => {
    const par = cupBurst(1, 2, false),
      ace = cupBurst(1, 2, true);
    const colours = new Set(par.map((e) => e.colour.join()));
    expect(colours.size, 'confetti of many colours').toBeGreaterThanOrEqual(4);
    for (const e of par) {
      expect(e.velocity[2], 'up out of the cup').toBeGreaterThan(0);
      expect(e.gravity ?? 1, 'and falls back').toBeGreaterThan(0);
    }
    expect(ace.reduce((a, e) => a + e.count, 0)).toBeGreaterThan(par.reduce((a, e) => a + e.count, 0));
    expect(
      par.some((e) => e.alpha === 0),
      'sparkles glow, drawn additively',
    ).toBe(true);
  });

  it('is exactly what it was without a style: a call that gives none and one that gives the plain style are the same', () => {
    for (const ace of [false, true]) {
      expect(cupBurst(1, 2, ace, 'plain')).toEqual(cupBurst(1, 2, ace));
      expect(cupBurst(1, 2, ace, undefined)).toEqual(cupBurst(1, 2, ace));
    }
    // held to a literal, so the default never moves by a figure drawn elsewhere
    const par = cupBurst(1, 2, false);
    expect(par.length).toBe(6);
    expect(par.map((e) => [e.count, e.life, e.spread])).toEqual([
      [14, 1.8, 5],
      [14, 1.8, 5],
      [14, 1.8, 5],
      [14, 1.8, 5],
      [14, 1.8, 5],
      [14, 0.7, 5],
    ]);
  });

  it('throws more confetti, for longer, wider and in the colours of the rainbow, when the cup is the confetti cup', () => {
    for (const ace of [false, true]) {
      const plain = cupBurst(1, 2, ace),
        big = cupBurst(1, 2, ace, 'confetti');
      const count = (es: typeof plain) => es.reduce((a, e) => a + e.count, 0);
      expect(count(big)).toBeGreaterThanOrEqual(count(plain) * 2.4);
      const bits = big.filter((e) => e.alpha !== 0),
        was = plain.filter((e) => e.alpha !== 0);
      expect(Math.max(...bits.map((e) => e.life))).toBeGreaterThanOrEqual(2.6);
      expect(Math.max(...bits.map((e) => e.life))).toBeGreaterThan(Math.max(...was.map((e) => e.life)));
      expect(Math.min(...bits.map((e) => e.spread))).toBeGreaterThan(Math.max(...was.map((e) => e.spread)));
      expect(new Set(bits.map((e) => e.colour.join())).size, 'six colours of the rainbow').toBe(6);
      for (const e of big) {
        expect(e.position.slice(0, 2)).toEqual([1, 2]);
        expect(e.velocity[2]).toBeGreaterThan(0);
      }
    }
  });

  it("keeps even the biggest burst inside the renderer's ring of 1024 particles, with room for a stroke's puff and a splash", () => {
    const total = (es: { count: number }[]) => es.reduce((a, e) => a + e.count, 0);
    const ace = total(cupBurst(0, 0, true, 'confetti'));
    expect(ace).toBeLessThanOrEqual(1024 - total(strikePuff(0, 0, 1)) - total(splash(0, 0)));
  });

  it('splashes up where the ball went in, in the colour of water', () => {
    const [s] = splash(5, 6);
    // from the water's own surface, which lies below the grass, and falls back onto it
    expect(s.position).toEqual([5, 6, WATER_LEVEL]);
    expect(s.floor).toBeLessThan(WATER_LEVEL);
    expect(s.colour[2]).toBeGreaterThan(s.colour[0]);
  });
});

describe('the cup’s burst, as good as the score', () => {
  const pieces = (emits: ReturnType<typeof cupBurst>) => emits.reduce((n, e) => n + e.count, 0);

  it('names a score from the strokes and the par: a hole in one is an ace whatever the par', () => {
    expect(cupScore(1, 2)).toBe('ace');
    expect(cupScore(1, 5)).toBe('ace');
    expect(cupScore(2, 4)).toBe('eagle');
    expect(cupScore(2, 5)).toBe('eagle');
    expect(cupScore(3, 4)).toBe('birdie');
    expect(cupScore(4, 4)).toBe('par');
    expect(cupScore(5, 4)).toBe('over');
    expect(cupScore(9, 4)).toBe('over');
  });

  it('throws more for each step from over par to a hole in one, in every style', () => {
    for (const style of ['plain', 'confetti', 'streamers'] as const) {
      const counts = (['over', 'par', 'birdie', 'eagle', 'ace'] as const).map((s) => pieces(cupBurst(0, 0, s, style)));
      for (let k = 1; k < counts.length; k++) expect(counts[k], `${style}, step ${k}`).toBeGreaterThan(counts[k - 1]);
    }
    expect(CUP_MORE.par).toBe(1);
    expect(CUP_MORE.ace).toBe(2.5);
  });

  it('is to the piece what it was for par and for a hole in one, said the old way or the new', () => {
    expect(cupBurst(3, 4, 'par')).toEqual(cupBurst(3, 4, false));
    expect(cupBurst(3, 4, 'ace')).toEqual(cupBurst(3, 4, true));
    // six emits, five colours and the sparkles, of fourteen pieces each at par: what the course always threw
    const par = cupBurst(3, 4, 'par');
    expect(par).toHaveLength(6);
    for (const e of par) expect(e.count).toBe(14);
    for (const e of cupBurst(3, 4, 'ace')) expect(e.count).toBe(35);
  });

  it('has gold among an eagle’s, and in no other score’s', () => {
    const isGold = (e: { colour: readonly number[] }) => e.colour[0] > 1 && e.colour[2] < 0.5;
    expect(cupBurst(0, 0, 'eagle').filter(isGold)).toHaveLength(1);
    for (const s of ['over', 'par', 'birdie', 'ace'] as const)
      expect(cupBurst(0, 0, s).filter(isGold), s).toHaveLength(0);
  });

  it('keeps an eagle’s in the party cup under a hole in one’s, the biggest there is', () => {
    expect(pieces(cupBurst(0, 0, 'eagle', 'streamers'))).toBeLessThan(pieces(cupBurst(0, 0, 'ace', 'streamers')));
  });
});

describe('the ring a landing throws', () => {
  const pieces = (emits: ReturnType<typeof landRing>) => emits.reduce((n, e) => n + e.count, 0);

  it('is none for a ball that did not fall, and more of it and faster the harder it comes down', () => {
    expect(landRing(0, 0, 0)).toEqual([]);
    expect(landRing(0, 0, -1)).toEqual([]);
    const soft = landRing(0, 0, 0.2),
      hard = landRing(0, 0, 1);
    expect(pieces(hard)).toBeGreaterThan(pieces(soft));
    const speed = (e: { velocity: readonly number[] }) => Math.hypot(e.velocity[0], e.velocity[1]);
    expect(speed(hard[0])).toBeGreaterThan(speed(soft[0]));
    // and never more than its ways times its most, however hard
    expect(pieces(landRing(0, 0, 50))).toBe(LAND_RING.ways * LAND_RING.most);
  });

  it('goes outward along the ground from where the ball came down, every way round', () => {
    const ring = landRing(10, -4, 0.8);
    expect(ring).toHaveLength(LAND_RING.ways);
    let sx = 0,
      sy = 0;
    for (const e of ring) {
      const out = [e.position[0] - 10, e.position[1] + 4];
      // thrown the way it stands from the middle, and faster along the ground than up
      expect(out[0] * e.velocity[0] + out[1] * e.velocity[1]).toBeGreaterThan(0);
      expect(Math.hypot(e.velocity[0], e.velocity[1])).toBeGreaterThan(e.velocity[2] * 2);
      expect(e.floor).toBe(0);
      sx += e.velocity[0];
      sy += e.velocity[1];
    }
    expect(Math.hypot(sx, sy)).toBeLessThan(1e-9);
  });

  it('is the colour of what the ball came down on: sand in a bunker, and a biome’s own dust', () => {
    expect(landRing(0, 0, 1, 'sand')[0].colour).toEqual([...PUFF.sand]);
    expect(landRing(0, 0, 1)[0].colour).toEqual([...PUFF.grass]);
    const moon = THEMES.moon.puff;
    const ring = landRing(0, 0, 1, 'grass', moon);
    expect(ring[0].colour).toEqual([moon.grass[0], moon.grass[1], moon.grass[2]]);
    // and it hangs as the Moon's puff does
    expect(ring[0].gravity).toBe(moon.gravity ?? 1);
  });

  it('fits the renderer’s ring with a hole in one’s burst from the party cup and a stroke’s puff', () => {
    const most =
      cupBurst(0, 0, 'ace', 'streamers').reduce((n, e) => n + e.count, 0) +
      pieces(landRing(0, 0, 1)) +
      strikePuff(0, 0, 1).reduce((n, e) => n + e.count, 0) * 2;
    expect(most).toBeLessThan(1024);
  });
});

describe('the sparks of a hard knock', () => {
  it('are none for a soft knock, and more the harder to a most', () => {
    expect(knockSparks(0, 0, 1, SPARKS.from - 0.1, 1, 0, 0)).toEqual([]);
    const least = knockSparks(0, 0, 1, SPARKS.from, 1, 0, 0)[0],
      full = knockSparks(0, 0, 1, SPARKS.full, 1, 0, 0)[0];
    expect(least.count).toBe(SPARKS.least);
    expect(full.count).toBe(SPARKS.most);
    expect(knockSparks(0, 0, 1, 500, 1, 0, 0)[0].count).toBe(SPARKS.most);
  });

  it('are thrown the way the knock sent the ball, bright, and gone in a blink', () => {
    const [e] = knockSparks(2, 3, 1, 30, 0.6, -0.8, 0);
    expect(e.velocity[0] * 0.6 + e.velocity[1] * -0.8).toBeGreaterThan(0);
    expect(e.velocity[0] * -0.8 - e.velocity[1] * 0.6).toBeCloseTo(0, 9);
    expect(e.alpha, 'drawn as pieces: light added to a lawn in daylight is not seen').toBe(1);
    expect(e.life).toBeLessThan(0.5);
    expect(e.position.slice(0, 2)).toEqual([2, 3]);
  });

  it('are not thrown by the ground a ball drops onto, whose knock points up', () => {
    expect(knockSparks(0, 0, 1, 40, 0, 0, 1)).toEqual([]);
    expect(knockSparks(0, 0, 1, 40, 0.3, 0, -0.95)).toEqual([]);
    expect(knockSparks(0, 0, 1, 40, 0.9, 0, 0.4)).toHaveLength(1);
  });

  it('are not thrown by a ball rattling down the cup, however hard it knocks on its wall', () => {
    expect(knockSparks(0, 0, 1, 40, 1, 0, 0, 1, true)).toEqual([]);
    expect(knockSparks(0, 0, 1, 40, 1, 0, 0, 1, false)).toHaveLength(1);
  });
});

describe('a divot', () => {
  it('is taken by an iron or a wedge off the grass, and by nothing else', () => {
    expect(takesDivot('iron', 'grass', false, true)).toBe(true);
    expect(takesDivot('wedge', 'grass', false, true)).toBe(true);
    expect(takesDivot('wood', 'grass', false, true), 'a wood sweeps').toBe(false);
    expect(takesDivot('putter', 'grass', false, true)).toBe(false);
    expect(takesDivot('iron', 'sand', false, true), 'sand is thrown already').toBe(false);
    expect(takesDivot('iron', 'grass', true, true), 'teed up').toBe(false);
    expect(takesDivot('wedge', 'grass', false, false), 'no grass on the Moon').toBe(false);
  });

  it('is thrown forward of the ball the way the shot goes, low, more of it for a harder shot, and dark', () => {
    const soft = divot(5, 5, 0, 1, 0.1)[0],
      hard = divot(5, 5, 0, 1, 1)[0];
    expect(soft.count).toBeGreaterThanOrEqual(DIVOT.least);
    expect(hard.count).toBe(DIVOT.most);
    expect(hard.count).toBeGreaterThan(soft.count);
    for (const e of [soft, hard]) {
      expect(e.position[1], 'ahead of the ball').toBeGreaterThan(5);
      expect(e.velocity[1]).toBeGreaterThan(0);
      expect(e.velocity[0]).toBe(0);
      expect(e.velocity[1]).toBeGreaterThan(e.velocity[2]);
      expect(e.colour[0], 'earth and not grass: more red than green').toBeGreaterThan(e.colour[1]);
    }
  });
});

describe('what is thrown for a camera standing far back', () => {
  it('is as many pieces, each bigger and thrown further by the scale, and exactly as it was at a scale of one', () => {
    expect(landRing(1, 2, 0.7, 'grass', PUFF, 1)).toEqual(landRing(1, 2, 0.7));
    expect(divot(1, 2, 0, 1, 0.7, PUFF, 1)).toEqual(divot(1, 2, 0, 1, 0.7));
    expect(knockSparks(1, 2, 1, 30, 1, 0, 0, 1)).toEqual(knockSparks(1, 2, 1, 30, 1, 0, 0));
    const pairs = [
      [landRing(0, 0, 0.7)[0], landRing(0, 0, 0.7, 'grass', PUFF, 3)[0]],
      [divot(0, 0, 0, 1, 0.7)[0], divot(0, 0, 0, 1, 0.7, PUFF, 3)[0]],
      [knockSparks(0, 0, 1, 30, 1, 0, 0)[0], knockSparks(0, 0, 1, 30, 1, 0, 0, 3)[0]],
    ];
    for (const [near, far] of pairs) {
      expect(far.count).toBe(near.count);
      expect(far.size).toBeCloseTo(near.size * 3, 9);
      expect(Math.hypot(...far.velocity)).toBeCloseTo(Math.hypot(...near.velocity) * 3, 9);
    }
  });
});

describe('a burst on a hill', () => {
  it('is thrown from the ground where it is and dies on it, and is what it was on the flat', () => {
    expect(strikePuff(1, 2, 0.5, 'grass', PUFF, 0)).toEqual(strikePuff(1, 2, 0.5));
    expect(landRing(1, 2, 0.5, 'grass', PUFF, 1, 0)).toEqual(landRing(1, 2, 0.5));
    const high = 7;
    for (const e of [...strikePuff(0, 0, 0.5, 'grass', PUFF, high), ...landRing(0, 0, 0.5, 'grass', PUFF, 1, high)]) {
      expect(e.position[2]).toBeCloseTo(high + 0.1, 9);
      expect(e.floor).toBe(high);
    }
    const [clod] = divot(0, 0, 0, 1, 0.5, PUFF, 1, high);
    expect(clod.position[2]).toBeCloseTo(high + 0.1, 9);
    expect(clod.floor, 'a little under, for ground that falls away ahead').toBeLessThan(high);
    expect(clod.floor).toBeGreaterThan(high - 2);
  });
});

describe('how far back the camera stands', () => {
  it('scales a burst by how many times further than home it is, and never under one', () => {
    expect(farScale(60, 60)).toBe(1);
    expect(farScale(30, 60)).toBe(1);
    expect(farScale(240, 60)).toBe(4);
  });
});

describe('what a stroke throws up in a biome', () => {
  it('is earth’s own grass and sand where nothing is said, and the very figures of `PUFF` on earth’s theme', () => {
    expect(THEMES.earth.puff).toBe(PUFF);
    expect(strikePuff(3, 4, 0.6, 'grass', THEMES.earth.puff)).toEqual(strikePuff(3, 4, 0.6));
    expect(strikePuff(3, 4, 0.6, 'sand', THEMES.earth.puff)).toEqual(strikePuff(3, 4, 0.6, 'sand'));
  });

  it('is the dust of the desert in its theme’s colours, as much of it as earth’s grass, and not green', () => {
    const dust = strikePuff(3, 4, 0.6, 'grass', THEMES.desert.puff),
      green = strikePuff(3, 4, 0.6);
    expect(dust.reduce((a, e) => a + e.count, 0)).toBe(green.reduce((a, e) => a + e.count, 0));
    for (const e of dust) {
      expect(e.colour).toEqual([...THEMES.desert.puff.grass]);
      // a pale dust: red over green over blue, and nothing like grass
      expect(e.colour[0]).toBeGreaterThan(e.colour[1]);
      expect(e.colour[1]).toBeGreaterThan(e.colour[2]);
    }
    for (const e of strikePuff(3, 4, 0.6, 'sand', THEMES.desert.puff))
      expect(e.colour).toEqual([...THEMES.desert.puff.sand]);
  });

  it('has a colour for the ground of every biome, a bladeless one’s included, so a stroke on it throws up something of its own', () => {
    for (const t of Object.values(THEMES))
      for (const ground of ['grass', 'sand'] as const)
        for (const c of t.puff[ground]) {
          expect(Number.isFinite(c), t.name).toBe(true);
          expect(c).toBeGreaterThanOrEqual(0);
          expect(c).toBeLessThanOrEqual(1);
        }
  });
});
