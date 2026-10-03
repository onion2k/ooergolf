/**
 * The flipper: an arm that swings about one end on its own clock, as a pinball flipper does without its button. Its pose
 * comes from time alone, the physics is told how fast it turns so it shoves a ball and does not pass through it, a ball
 * met on its upswing is flung where one rolled onto it at rest is not, and a round that has one is the same round every
 * time from the same seed.
 */
import { createHash } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import { fuzz } from '../scripts/fuzzer';
import { BALL, KIND_RADIUS, TILE, layoutOf } from '../src/arena';
import { Autopilot } from '../src/autopilot';
import type { HoleDef } from '../src/course';
import { checkInvariants } from '../src/invariants';
import { FLIPPER, Obstacles, flipperAngle, type ObstacleDef } from '../src/obstacles';
import { DT, newGame, settle } from './helpers';

type Flipper = Extract<ObstacleDef, { kind: 'flipper' }>;

/** A lane eleven tiles wide with the cup in the north-west corner, the tee south of the middle and the flipper across the way. */
const MAP = [
  '#############',
  '#C..........#',
  '#...........#',
  '#...........#',
  '#...........#',
  '#...........#',
  '#...........#',
  '#...........#',
  '#.....T.....#',
  '#############',
];
const layout = layoutOf(MAP);
const tileX = (col: number) => layout.originX + (col + 0.5) * TILE;
const tileY = (row: number) => layout.originY + (layout.rows - 1 - row + 0.5) * TILE;

const LEFT: Flipper = { kind: 'flipper', at: [1, 4], length: 3, swing: 1, period: 2, pivot: 'left' };
const RIGHT: Flipper = { ...LEFT, at: [11, 4], pivot: 'right' };
const HOLE: HoleDef = { name: 'Flipper test', par: 4, map: MAP, obstacles: [LEFT] };

/** The pusher a flipper alone makes, put where it is at `t`. */
function at(def: Flipper, t: number, dt = DT) {
  const o = new Obstacles([def], layout);
  o.update(t, dt);
  return { o, p: o.pushers[0] };
}

/** Where the arm's free end is, from the box the physics is given: the far end of its length. */
function tip(p: { x: number; y: number; yaw: number; hx: number }) {
  return { x: p.x + Math.cos(p.yaw) * p.hx, y: p.y + Math.sin(p.yaw) * p.hx };
}

describe('the flipper’s pose at a time', () => {
  it('is at rest at phase nought, at its full swing a quarter of a period on, and rests again at the half', () => {
    expect(flipperAngle(LEFT, 0)).toBeCloseTo(0, 9);
    expect(flipperAngle(LEFT, LEFT.period / 4)).toBeCloseTo(LEFT.swing, 9);
    expect(flipperAngle(LEFT, LEFT.period / 2)).toBeCloseTo(0, 9);
    // the other half of the period it lies at rest, which is the time a player has to roll a ball under it
    for (const u of [0.55, 0.75, 0.95]) expect(flipperAngle(LEFT, u * LEFT.period)).toBe(0);
    // never past its swing, nor below rest, whatever the time and the phase
    for (let t = 0; t < 7; t += 0.05)
      for (const phase of [0, 0.3, 0.9]) {
        const a = flipperAngle({ ...LEFT, phase }, t);
        expect(a).toBeGreaterThanOrEqual(0);
        expect(a).toBeLessThanOrEqual(LEFT.swing + 1e-12);
      }
  });

  it('is put where it is, on the left: the arm lies along the way across to the right at rest, and rises toward the cup', () => {
    const rest = at(LEFT, 0).p;
    expect(rest.yaw).toBeCloseTo(0, 9);
    expect(rest.px).toBeCloseTo(tileX(1), 9);
    expect(rest.py).toBeCloseTo(tileY(4), 9);
    expect(rest.hx).toBeCloseTo((LEFT.length * TILE) / 2, 9);
    expect(rest.hy).toBeCloseTo(FLIPPER.hy, 9);
    expect(tip(rest).x).toBeCloseTo(tileX(1) + LEFT.length * TILE, 9);
    expect(tip(rest).y).toBeCloseTo(tileY(4), 9);
    const up = at(LEFT, LEFT.period / 4).p;
    expect(up.yaw).toBeCloseTo(LEFT.swing, 9);
    expect(tip(up).y, 'the free end has come up the hole').toBeCloseTo(
      tileY(4) + Math.sin(LEFT.swing) * LEFT.length * TILE,
      9,
    );
  });

  it('is put where it is, on the right: the arm lies across to the left and rises toward the cup the same way', () => {
    const rest = at(RIGHT, 0).p;
    expect(Math.cos(rest.yaw)).toBeCloseTo(-1, 9);
    expect(tip(rest).x).toBeCloseTo(tileX(11) - RIGHT.length * TILE, 9);
    const up = at(RIGHT, RIGHT.period / 4).p;
    expect(tip(up).y).toBeCloseTo(tileY(4) + Math.sin(RIGHT.swing) * RIGHT.length * TILE, 9);
    expect(tip(up).x).toBeCloseTo(tileX(11) - Math.cos(RIGHT.swing) * RIGHT.length * TILE, 9);
  });

  it('keeps the end it turns on where it is, for all time, either way round', () => {
    for (const def of [LEFT, RIGHT, { ...LEFT, phase: 0.37 }])
      for (let t = 0; t < 5; t += 0.07) {
        const { p } = at(def, t);
        const root = { x: p.x - Math.cos(p.yaw) * p.hx, y: p.y - Math.sin(p.yaw) * p.hx };
        expect(root.x).toBeCloseTo(tileX(def.at[0]), 9);
        expect(root.y).toBeCloseTo(tileY(def.at[1]), 9);
        expect(p.px).toBeCloseTo(tileX(def.at[0]), 9);
        expect(p.py).toBeCloseTo(tileY(def.at[1]), 9);
      }
  });

  it('starts part way through its swing by its phase', () => {
    expect(flipperAngle({ ...LEFT, phase: 0.25 }, 0)).toBeCloseTo(LEFT.swing, 9);
    expect(flipperAngle({ ...LEFT, phase: 0.25 }, LEFT.period)).toBeCloseTo(LEFT.swing, 9);
  });
});

describe('the velocity the physics is handed', () => {
  it('is the pose’s difference over a frame: the turn it made, and none of its root, which stands still', () => {
    for (const def of [LEFT, RIGHT]) {
      for (let t = 0.05; t < def.period; t += 0.043) {
        const { p } = at(def, t);
        const before = at(def, t - DT).p;
        expect(p.spin, `at ${t.toFixed(2)}`).toBeCloseTo((p.yaw - before.yaw) / DT, 9);
        expect(p.vx).toBe(0);
        expect(p.vy).toBe(0);
        // the speed the physics gives the free end, the root's plus the turn out along the arm, is the way the end went
        const arm = { x: tip(p).x - p.px, y: tip(p).y - p.py };
        const was = { x: tip(before).x - before.px, y: tip(before).y - before.py };
        const pushed = { x: -p.spin * arm.y, y: p.spin * arm.x };
        const moved = { x: (arm.x - was.x) / DT, y: (arm.y - was.y) / DT };
        const scale = Math.hypot(moved.x, moved.y);
        if (scale > 1) {
          expect(Math.hypot(pushed.x - moved.x, pushed.y - moved.y) / scale).toBeLessThan(0.05);
        }
      }
    }
  });

  it('is nought while it lies at rest', () => {
    expect(at(LEFT, 1.4).p.spin).toBe(0);
  });
});

/** How many units further up the hole in half a second the worst ball met on the upswing goes than the best one met at rest. */
const MARGIN = 2;

describe('a ball met on the upswing', () => {
  /**
   * A ball laid on the north face of the arm and rolled south onto it, the strike delayed by `wait` seconds so the arm is met at
   * a different moment of its swing. Says when it met the arm and how far up the hole it went in the half second after: what
   * the arm did to it, and nothing the next swing does.
   */
  function meet(wait: number, power = 0.4) {
    const { game } = newGame(1, null, [{ ...HOLE, obstacles: [LEFT] }]);
    const r = KIND_RADIUS[BALL];
    const x = tileX(1) + 4.5;
    const face = tileY(4) + FLIPPER.hy + r;
    // the strike is put off by the game's own clock, so the arm is where it is at that time and not where it was
    while (game.t < wait - 1e-9) game.step(DT);
    game.place(x, face + 3);
    game.shoot(-Math.PI / 2, power);
    let contact = -1;
    let rose = 0;
    let peak = 0;
    for (let f = 0; f < 6 * 60; f++) {
      const before = game.world.vy[game.ball];
      game.step(DT);
      const vy = game.world.vy[game.ball];
      // the first step in which the ball's way down the hole turns to a way up it is where it met the arm
      if (contact < 0 && before < -1 && vy > before + 2) contact = game.t;
      if (contact >= 0 && game.t - contact < 0.5) {
        rose = Math.max(rose, game.world.y[game.ball] - face);
        peak = Math.max(peak, vy);
      }
    }
    return { contact, rose, peak };
  }

  it('is flung further than one rolled onto the arm at rest, by a margin', () => {
    const top = (LEFT.swing * 2 * Math.PI) / LEFT.period;
    const rate = (t: number) => (flipperAngle(LEFT, t + 0.01) - flipperAngle(LEFT, t - 0.01)) / 0.02;
    const resting: ReturnType<typeof meet>[] = [];
    const flung: ReturnType<typeof meet>[] = [];
    for (let wait = 0; wait < 2; wait += 0.05) {
      const m = meet(wait);
      if (m.contact < 0) continue;
      // at rest through the whole of the half second, or going up faster than half as fast as it ever does
      if (
        flipperAngle(LEFT, m.contact) === 0 &&
        flipperAngle(LEFT, m.contact + 0.5) === 0 &&
        rate(m.contact + 0.5) === 0
      )
        resting.push(m);
      else if (rate(m.contact) > 0.5 * top) flung.push(m);
    }
    expect(resting.length, 'rolls that met it at rest').toBeGreaterThan(2);
    expect(flung.length, 'rolls that met it on the upswing').toBeGreaterThan(2);
    const restRose = Math.max(...resting.map((m) => m.rose)),
      flungRose = Math.max(...flung.map((m) => m.rose));
    const restPeak = Math.max(...resting.map((m) => m.peak)),
      flungPeak = Math.max(...flung.map((m) => m.peak));
    console.log(
      `flipper: rolled onto it at rest the ball goes up the hole ${restRose.toFixed(1)} units at most in half a second, at ${restPeak.toFixed(1)} a second at most; met on the upswing it goes ${flungRose.toFixed(1)} at most, at ${flungPeak.toFixed(1)} a second: ${(flungRose - restRose).toFixed(1)} units and ${(flungPeak - restPeak).toFixed(1)} a second more, ${(flungPeak / restPeak).toFixed(1)} times as fast (${resting.length} rests, ${flung.length} upswings)`,
    );
    expect(flungRose).toBeGreaterThan(restRose + MARGIN);
    expect(flungPeak).toBeGreaterThan(restPeak * 1.5);
  });
});

describe('a round with a flipper in it', () => {
  /** Hashes where the ball and the arm are over a few hundred frames of a fixed set of strokes. */
  function round(seed: number): string {
    const { game } = newGame(seed, null, [HOLE]);
    const hash = createHash('sha256');
    const strokes: [number, number][] = [
      [2.2, 0.55],
      [1.2, 0.4],
      [2.8, 0.7],
    ];
    let next = 0;
    for (let f = 0; f < 600; f++) {
      if (game.ready && next < strokes.length && f % 90 === 0) game.shoot(strokes[next][0], strokes[next++][1]);
      game.step(DT);
      const { world, ball, obstacles } = game;
      hash.update(
        [world.x[ball], world.y[ball], world.z[ball], obstacles.pushers[0].yaw].map((n) => n.toFixed(9)).join(),
      );
    }
    return hash.digest('hex');
  }

  it('is the same round from the same seed, the arm turning the same each time', () => {
    expect(round(7)).toBe(round(7));
    // the strokes are the same and minigolf draws no chance, so another seed is the same round: what the hash holds is the arm and the ball
    expect(round(7)).toBe(round(8));
  });

  it('has its pose from time alone: asked at a time cold it is what it is after playing up to it', () => {
    const { game } = newGame(3, null, [HOLE]);
    settle(game, 237);
    const played = { yaw: game.obstacles.pushers[0].yaw, spin: game.obstacles.pushers[0].spin };
    const cold = new Obstacles(HOLE.obstacles!, game.layout);
    // the game steps the physics in its own fixed step, and the clock is the sum of them
    cold.update(game.obstacles.time, 1 / 60);
    expect(cold.pushers[0].yaw).toBe(played.yaw);
    expect(cold.pushers[0].spin).toBe(played.spin);
  });

  it('keeps every rule while it is played, which the invariants say of its pose among them', () => {
    const { game } = newGame(5, null, [HOLE]);
    for (let f = 0; f < 400; f++) {
      if (game.ready && f % 70 === 0) game.shoot(1.9 + f / 400, 0.5);
      game.step(DT);
      if (f % 10 === 0) expect(checkInvariants(game), `frame ${f}`).toEqual([]);
    }
  });
});

describe('a flipper on ground that slopes', () => {
  const sloped = (row: number) =>
    layoutOf(
      MAP,
      MAP.map((r, i) =>
        i === row ? '1'.repeat(r.length) : i === row + 1 ? '2'.repeat(r.length) : '0'.repeat(r.length),
      ),
    );

  it('is refused by name when the hole is built, as a barrier is, where the swing sweeps', () => {
    // a step in the ground a tile and a half above the arm's row: inside the sweep of its tip
    expect(() => new Obstacles([LEFT], sloped(2))).toThrow(/flipper at column 1, row 4.*slopes/);
    expect(() => new Obstacles([RIGHT], sloped(2))).toThrow(/flipper at column 11, row 4.*slopes/);
    expect(() => new Obstacles([LEFT], layout), 'on the level').not.toThrow();
  });

  it('is refused for a length or a period that is not one, by name', () => {
    expect(() => new Obstacles([{ ...LEFT, length: 0 }], layout)).toThrow(/flipper.*length/);
    expect(() => new Obstacles([{ ...LEFT, period: 0 }], layout)).toThrow(/flipper.*period/);
    expect(() => new Obstacles([{ ...LEFT, swing: Number.NaN }], layout)).toThrow(/flipper.*swing/);
  });
});

describe('the autopilot on a hole with a flipper', () => {
  it('holes it within the limit, with every rule kept all the way', () => {
    for (const seed of [1, 2]) {
      const { game } = newGame(seed, null, [HOLE]);
      const pilot = new Autopilot(game);
      let frames = 0;
      while (game.phase === 'play' && frames < 60 * 240) {
        pilot.step(DT);
        frames++;
        if (frames % 15 === 0) expect(checkInvariants(game), `seed ${seed} frame ${frames}`).toEqual([]);
      }
      expect(game.card.length, `seed ${seed} finished the hole`).toBe(1);
      expect(game.card[0], `seed ${seed}: strokes`).toBeLessThan(HOLE.par + 6);
    }
  });

  // the straight line from the tee to the cup is across the arm's rest, four tiles up the lane from its root and a tile
  // short of its tip: the arm lies across it at rest and stands well clear of it near the top of its swing
  const LANE: HoleDef = {
    name: 'Flipper lane',
    par: 3,
    map: MAP.map((row, r) => (r === 1 ? '#..C........#' : r === 8 ? '#..T........#' : row.replace(/[CT]/g, '.'))),
    obstacles: [{ ...LEFT, swing: 1.3, period: 6 }],
  };

  /** When the arm has just gone down, a little past half way through its period, which is its swing and the rest of it. */
  const LATE = 3.3;

  /** Whether a shot struck at game time `t` from the tee goes through the arm's lane untouched and holes out, played out in a game of its own. */
  function clear(t: number): boolean {
    const { game } = newGame(1, null, [LANE]);
    while (game.t < t - 1e-9) game.step(DT);
    const shot = new Autopilot(game).plan()!;
    game.shoot(shot.angle, shot.power);
    for (let f = 0; f < 8 * 60 && game.phase === 'play'; f++) game.step(DT);
    return game.phase !== 'play' && game.strokes === 1;
  }

  it('waits for the arm to be out of the way, and no longer than it has to, which is not while it is turned clear of the line', () => {
    const { game } = newGame(1, null, [LANE]);
    // come to it just as the arm has gone down, with the whole of its rest ahead
    while (game.t < LATE) game.step(DT);
    const pilot = new Autopilot(game);
    while (game.strokes === 0 && game.t < 20) pilot.step(DT);
    const struck = game.t;
    expect(game.strokes, 'it struck').toBe(1);
    expect(clear(struck - DT), 'the shot it took is through').toBe(true);
    // the first moment on the grid that the shot is clear, which it should not be much later than
    let earliest = LATE;
    while (!clear(earliest) && earliest < 20) earliest += 0.05;
    expect(clear(earliest), 'there is a way through').toBe(true);
    expect(
      struck,
      `it waited until ${struck.toFixed(2)}, and the shot was clear from ${earliest.toFixed(2)}`,
    ).toBeLessThan(earliest + 0.3);
    // and it does wait: struck at the moment the arm is across the line, the shot is not clear
    expect(
      [LATE, LATE + 0.5, LATE + 1, LATE + 1.5, LATE + 2].map(clear).some((c) => !c),
      'some moments are not clear',
    ).toBe(true);
  });
});

describe('the fuzzer on a hole with a flipper', () => {
  it('strikes at the arm at every phase of its swing, and runs clean', () => {
    let struck = 0;
    for (const seed of [1, 2, 3, 4, 5, 6]) {
      const result = fuzz(seed, 6000, [HOLE, { ...HOLE, name: 'Flipper test, right', obstacles: [RIGHT] }]);
      expect(result.failure, `seed ${seed}`).toBeNull();
      struck += result.done['strike at the flipper'] ?? 0;
    }
    expect(struck, 'the action ran').toBeGreaterThan(10);
  });
});
