/**
 * The autopilot putting, on greens that slope and run at different speeds, and playing from the first cut. A putt on a
 * golf hole is aimed through the rehearsal as a chip is, so a good putter reads a cross slope and a fast downhill putt,
 * where the arithmetic that aims at the cup and judges the distance on the level misses the one and runs past on the
 * other. The holes here are the tests' own, a green of a slope given to the percent, since the generator's contour is
 * another part's and these must hold for any green the physics can roll a ball on.
 */
import { describe, expect, it } from 'vitest';
import { Autopilot, golfCandidates, speedAcross } from '../src/autopilot';
import { layoutOf, lieAt } from '../src/arena';
import { PUTTER, bagClub } from '../src/bag';
import { Rehearsal } from '../src/planner';
import type { HoleDef } from '../src/course';
import { GREENS, LIE } from '../src/surfaces';
import { seeded } from '../src/random';
import { DT, FLAT, field, golfGame } from './helpers';

const ROWS = 40,
  COLS = 41,
  TILE = 3;

/**
 * A green end to end, rising `down` of a unit a unit along x and `across` along y (so a putt toward the cup, which is west
 * of the ball, runs downhill for a positive `down` and across the fall for `across`), at a speed of `greens`, with a band of
 * the first cut across the columns `cut` (from, to) if given. Heights are what the physics wants: not below nought.
 */
function slopedGreen(down: number, across: number, greens?: number, cut?: [number, number]): HoleDef {
  const base = field('g', ROWS, COLS);
  const terrain = new Float32Array(COLS * ROWS);
  let lowest = Infinity;
  for (let s = 0; s < ROWS; s++)
    for (let c = 0; c < COLS; c++) {
      const x = (c + 0.5 - COLS / 2) * TILE,
        y = (s + 0.5 - ROWS / 2) * TILE;
      terrain[s * COLS + c] = down * x + across * y;
      lowest = Math.min(lowest, terrain[s * COLS + c]);
    }
  for (let k = 0; k < terrain.length; k++) terrain[k] -= lowest;
  const band = cut ?? [0, -1];
  const map =
    cut === undefined
      ? base.map
      : base.map.map((line, r) =>
          r > 0 && r < ROWS - 1
            ? line
                .split('')
                .map((ch, c) => (c >= band[0] && c <= band[1] && ch === 'g' ? 'c' : ch))
                .join('')
            : line,
        );
  return { ...base, map, terrain, ...(greens === undefined ? {} : { greens }), name: 'Sloped green' };
}

/** What a putt took: the strokes, whether it dropped, and where the ball lay after each stroke that did not drop it. */
interface Putts {
  strokes: number;
  holed: boolean;
  rests: { x: number; y: number }[];
}

type Slips = { aim: number; power: number } | undefined;

/**
 * Holed out from `distance` from the cup along the line to it (and `dy` to the north), by the autopilot, with a player's
 * slips if given and none if not, until it drops or has taken six.
 */
function putt(hole: HoleDef, distance: number, dy = 0, slips?: Slips, seed = 1): Putts {
  const { game } = golfGame(hole, seeded(seed));
  const { cup } = game.layout;
  game.place(cup.x + distance, cup.y + dy);
  const pilot = new Autopilot(game, slips ? { skill: slips, random: seeded(seed * 31 + 7) } : {});
  const rests: { x: number; y: number }[] = [];
  let taken = 0;
  const playing = () => game.phase === 'play';
  for (let f = 0; f < 60 * 120 && playing() && game.strokes < 6; f++) {
    pilot.step(DT);
    if (playing() && game.ready && game.strokes > taken) {
      taken = game.strokes;
      rests.push({ x: game.world.x[game.ball], y: game.world.y[game.ball] });
    }
  }
  return { strokes: game.strokes, holed: game.phase !== 'play', rests };
}

const SLOPES = [0, 0.03, 0.05];
const SPEEDS = [GREENS.fast, GREENS.normal, GREENS.slow];
const DISTANCES = [8, 12, 16, 20, 25];
/** A player's slips, as the pace gate has them. */
const SLIPS = { aim: 0.05, power: 0.1 };

/** The green's own, for where a ball rests. */
const onGreen = (hole: HoleDef, q: { x: number; y: number }) =>
  lieAt(layoutOf(hole.map, hole.terrain), q.x, q.y) === LIE.green;

describe('putting on a green with a slope, at any speed', () => {
  it('holes out in two putts or fewer from eight to twenty-five yards, with no slips, on every slope and speed: all of them in one', () => {
    let putts = 0,
      strokes = 0;
    for (const greens of SPEEDS)
      for (const across of SLOPES)
        for (const down of SLOPES)
          for (const d of DISTANCES) {
            const r = putt(slopedGreen(down, across, greens), d);
            putts++;
            strokes += r.strokes;
            expect(r.holed, `greens ${greens} down ${down} across ${across} from ${d}`).toBe(true);
            expect(r.strokes, `greens ${greens} down ${down} across ${across} from ${d}`).toBeLessThanOrEqual(2);
          }
    // measured: every one of the 135 drops at the first stroke, since the plan is the stroke tried in the rehearsal
    expect(putts).toBe(135);
    expect(strokes).toBe(135);
  });

  it('reads the break: a 4 per cent cross slope is missed by a putt aimed at the cup, and holed by the putter’s plan', () => {
    let straight = 0,
      read = 0,
      tried = 0;
    for (const greens of SPEEDS)
      for (const side of [-0.04, 0.04])
        for (const d of [12, 16, 20, 25]) {
          const hole = slopedGreen(0, side, greens);
          const { game } = golfGame(hole);
          const { cup } = game.layout;
          game.place(cup.x + d, cup.y);
          const rehearsal = new Rehearsal(game.rehearsal());
          const aimed = golfCandidates(game, cup.x + d, cup.y)[0];
          if (rehearsal.shot({ x: cup.x + d, y: cup.y }, PUTTER.id, aimed.angle, aimed.power).holed) straight++;
          const plan = new Autopilot(game).plan()!;
          expect(plan.club).toBe('putter');
          if (rehearsal.shot({ x: cup.x + d, y: cup.y }, PUTTER.id, plan.angle, plan.power).holed) read++;
          // and, over twenty yards, it aims off the line: up the slope, by more than the cup is wide at that distance
          if (d >= 20)
            expect(Math.abs(Math.sin(plan.angle - Math.PI)) * d, `aim ${greens} ${side} ${d}`).toBeGreaterThan(0.5);
          tried++;
        }
    expect(tried).toBe(24);
    // measured: aimed at the cup, 4 of the 24 drop (the 12-yard ones, where the break is less than the cup's width); read, every one does
    expect(straight).toBeLessThanOrEqual(4);
    expect(read).toBe(tried);
  });

  it('is told by its plan where the putt will rest, and that is what the real game does', () => {
    const hole = slopedGreen(0.03, 0.03, GREENS.fast);
    const { game } = golfGame(hole);
    const { cup } = game.layout;
    game.place(cup.x + 20, cup.y);
    const plan = new Autopilot(game).plan()!;
    expect(plan.expect).toBeDefined();
    expect(plan.expect!.holed).toBe(true);
    const r = putt(hole, 20);
    expect(r.strokes).toBe(1);
  });

  it('strikes harder on slower greens, and a downhill putt softer than the same one on the level', () => {
    const power = (down: number, greens: number) => {
      const { game } = golfGame(slopedGreen(down, 0, greens));
      const { cup } = game.layout;
      game.place(cup.x + 18, cup.y);
      return new Autopilot(game).plan()!.power;
    };
    expect(power(0, GREENS.slow)).toBeGreaterThan(power(0, GREENS.normal));
    expect(power(0, GREENS.normal)).toBeGreaterThan(power(0, GREENS.fast));
    expect(power(0.05, GREENS.fast)).toBeLessThan(power(0, GREENS.fast));
    expect(power(-0.05, GREENS.fast)).toBeGreaterThan(power(0, GREENS.fast));
  });

  it('says the speed over the green from the hole’s own: the arithmetic’s speed is the hole’s, not the minigolf’s', () => {
    const layout = (greens: number) => {
      const { game } = golfGame(slopedGreen(0, 0, greens));
      return game.layout;
    };
    const at = (greens: number, g = greens) => {
      const l = layout(greens);
      return speedAcross(l, l.cup.x + 10, l.cup.y, l.cup.x, l.cup.y, 0, g);
    };
    expect(at(GREENS.fast)).toBeCloseTo(Math.sqrt(2 * GREENS.fast * 10), 6);
    expect(at(GREENS.slow)).toBeCloseTo(Math.sqrt(2 * GREENS.slow * 10), 6);
    // with none handed it is the green's own, GREENS.normal, as on every hole that had none
    const l = layout(GREENS.normal);
    expect(speedAcross(l, l.cup.x + 10, l.cup.y, l.cup.x, l.cup.y, 0)).toBeCloseTo(
      Math.sqrt(2 * GREENS.normal * 10),
      6,
    );
  });

  it('with a player’s slips, never leaves a putt dying short or runs it off the green, on the fastest and slowest greens, downhill and across', () => {
    let rests = 0;
    for (const [down, across, greens] of [
      [0.05, 0, GREENS.fast],
      [0.05, 0, GREENS.slow],
      [0.05, 0.05, GREENS.fast],
      [0, 0.05, GREENS.slow],
    ] as const) {
      const hole = slopedGreen(down, across, greens);
      for (const d of [8, 16, 25])
        for (let seed = 1; seed <= 16; seed++) {
          const r = putt(hole, d, 0, SLIPS, seed);
          const label = `greens ${greens} down ${down} across ${across} from ${d}, seed ${seed}`;
          const { cup } = layoutOf(hole.map, hole.terrain);
          expect(r.holed, label).toBe(true);
          expect(r.strokes, label).toBeLessThanOrEqual(3);
          for (const q of r.rests) {
            rests++;
            expect(onGreen(hole, q), label).toBe(true);
            // measured, over these 192 putts: the worst first stroke leaves 3.8, and the farthest short is 2.7
            expect(Math.hypot(q.x - cup.x, q.y - cup.y), label).toBeLessThan(5);
            expect(q.x - cup.x, `${label}: short`).toBeLessThan(4);
          }
        }
    }
    expect(rests).toBeGreaterThan(0);
  });

  it('putts a little better than the arithmetic did over the same greens, with slips: the strokes a putt takes, before and after', () => {
    let after = 0,
      n = 0;
    for (const [down, across, greens] of [
      [0, 0.05, GREENS.normal],
      [0.05, 0.05, GREENS.slow],
    ] as const)
      for (const d of DISTANCES)
        for (let seed = 1; seed <= 16; seed++) {
          after += putt(slopedGreen(down, across, greens), d, 0, SLIPS, seed).strokes;
          n++;
        }
    // measured over these 160 putts, with the arithmetic that aimed at the cup and judged the level at 16: 1.65 and 2.30 a
    // putt (1.97 on average), and with the rehearsal 1.21 and 1.29 (1.25)
    expect(after / n).toBeLessThan(1.4);
  });
});

describe('putting from the fringe and playing from the first cut', () => {
  it('putts from the first cut round a green with the putter and holes out, whatever the slope', () => {
    for (const [down, across] of [
      [0, 0],
      [0.03, 0.03],
      [0.05, 0.05],
      [0.05, 0],
    ])
      for (const dx of [18, 21]) {
        const hole = slopedGreen(down, across, GREENS.normal, [8, 9]);
        const { game } = golfGame(hole);
        const { cup } = game.layout;
        game.place(cup.x + dx, cup.y);
        expect(lieAt(game.layout, cup.x + dx, cup.y)).toBe(LIE.cut);
        expect(new Autopilot(game).plan()!.club).toBe('putter');
        const r = putt(hole, dx);
        expect(r.holed, `${down} ${across} ${dx}`).toBe(true);
        expect(r.strokes, `${down} ${across} ${dx}`).toBeLessThanOrEqual(2);
      }
  });

  it('rolls the putt over the fringe at the first cut’s own, slower, roll: it strikes harder from the cut than from the same distance on the green', () => {
    const power = (cut: [number, number] | undefined, dx: number) => {
      const { game } = golfGame(slopedGreen(0, 0, GREENS.normal, cut));
      const { cup } = game.layout;
      game.place(cup.x + dx, cup.y);
      return new Autopilot(game).plan()!.power;
    };
    // the same 21 units, over cut for the last 6, or all green
    expect(power([8, 9], 21)).toBeGreaterThan(power(undefined, 21));
  });

  it('plays a ball in the first cut of a fairway as it would from the fairway, a club the power a little short of it', () => {
    const base = field('f');
    const strip = base.map.map((line, r) =>
      r > 0 && r < base.map.length - 1 ? line.slice(0, 5) + 'ccc' + line.slice(8) : line,
    );
    const cutHole: HoleDef = { ...base, map: strip, name: 'Fairway with a cut' };
    const from = (hole: HoleDef) => {
      const { game } = golfGame(hole);
      const { cup } = game.layout;
      game.place(cup.x + 12, cup.y - 90);
      return { game, plan: new Autopilot(game).plan()!, at: { x: cup.x + 12, y: cup.y - 90 } };
    };
    const fair = from(base),
      cut = from(cutHole);
    expect(lieAt(cut.game.layout, cut.at.x, cut.at.y)).toBe(LIE.cut);
    expect(cut.plan.club).toBeDefined();
    expect(bagClub(cut.plan.club!).loft).toBeGreaterThan(0);
    // the cut takes three per cent off a club, so what reaches from the fairway is struck a little harder, or one club longer
    const lofts = (p: { club?: string }) => bagClub(p.club!).loft;
    expect(lofts(cut.plan) <= lofts(fair.plan)).toBe(true);
    // and it expects the ball to come to rest near the cup, as the fairway's does
    const d = (p: { expect?: { x: number; y: number } }, g: typeof fair.game) =>
      Math.hypot(p.expect!.x - g.layout.cup.x, p.expect!.y - g.layout.cup.y);
    expect(d(cut.plan, cut.game)).toBeLessThan(6);
    expect(d(fair.plan, fair.game)).toBeLessThan(6);
  });

  it('gets a ball from the cut of a fairway round to the cup in a few strokes, with slips', () => {
    const base = field('f');
    const strip = base.map.map((line, r) =>
      r > 0 && r < base.map.length - 1 ? line.slice(0, 5) + 'ccc' + line.slice(8) : line,
    );
    const hole: HoleDef = { ...base, map: strip, name: 'Fairway with a cut' };
    for (let seed = 1; seed <= 6; seed++) {
      const { game } = golfGame(hole, seeded(seed));
      game.place(game.layout.cup.x + 12, game.layout.cup.y - 90);
      const pilot = new Autopilot(game, { skill: SLIPS, random: seeded(seed) });
      for (let f = 0; f < 60 * 120 && game.phase === 'play'; f++) pilot.step(DT);
      expect(game.phase, `seed ${seed}`).not.toBe('play');
      expect(game.strokes, `seed ${seed}`).toBeLessThanOrEqual(5);
    }
  });
});

describe('A level green, as it was', () => {
  it('putts by the arithmetic alone on a level green, which is exact: no trial is made, and the plan is the first guess', () => {
    const { game } = golfGame(FLAT.pitch);
    const { cup } = game.layout;
    game.place(cup.x - 8, cup.y - 10);
    const pilot = new Autopilot(game);
    const plan = pilot.plan()!;
    expect(plan.expect).toBeUndefined();
    expect(pilot.trials).toBe(0);
    expect(plan).toEqual(golfCandidates(game, game.world.x[game.ball], game.world.y[game.ball])[0]);
  });
});
