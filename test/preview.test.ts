/**
 * The preview of a golf shot: the flight a drag would make if the swing were true, drawn before it is taken. It is a
 * trial in a rehearsal, the game's own physics, so where it says the ball comes down is where the game puts it, and
 * these tests hold it to that, not to a formula: the arithmetic carry is four in a hundred short.
 */
import { describe, expect, it } from 'vitest';
import { BAG, bagClub, carryOf } from '../src/bag';
import type { HoleDef } from '../src/course';
import { DISPERSION, carryFrom, maxScatter } from '../src/flight';
import { Game } from '../src/game';
import { Previewer } from '../src/preview';
import { Progress, memoryStore } from '../src/progress';
import { LIE } from '../src/surfaces';
import { DT, field, golfGame } from './helpers';

const LOFTED = BAG.filter((c) => c.loft > 0);
const ROWS = 200,
  COLS = 81;
/** A field's tee is in its south end; the course runs north, which is an angle of a quarter turn. */
const NORTH = Math.PI / 2;

/** The ground rising by `per` a tile to the north, to the south, or to the east. */
const slope = (per: number, to: 'north' | 'south' | 'east') =>
  Float32Array.from({ length: ROWS * COLS }, (_, k) => {
    const row = Math.floor(k / COLS),
      col = k % COLS;
    return per * (to === 'north' ? row : to === 'south' ? ROWS - row : col);
  });

/** Where the game puts the ball first, struck true from where it lies: the ground truth a preview is held to. */
function real(hole: HoleDef, club: string, angle: number, power: number, from?: { x: number; y: number }) {
  const { game, calls } = golfGame(hole);
  if (from) game.place(from.x, from.y);
  for (let f = 0; f < 600 && !game.ready; f++) game.step(DT);
  game.pick(club);
  const start = { x: game.world.x[game.ball], y: game.world.y[game.ball] };
  game.shoot(angle, power);
  for (let f = 0; f < 60 * 12 && game.phase === 'play'; f++) {
    game.step(DT);
    const hit = calls.find(([n, a]) => n === 'landed' && a[3] === true);
    if (hit) return { x: hit[1][0] as number, y: hit[1][1] as number, start, calls };
    if (calls.some(([n]) => n === 'splash' || n === 'outOfBounds')) break;
  }
  // a ball that goes into the water or comes down out of bounds is lost where it is, and is told of as that and not as a landing
  const lost = calls.find(([n]) => n === 'splash' || n === 'outOfBounds');
  return { x: lost?.[1][0] as number, y: lost?.[1][1] as number, start, calls };
}

function preview(hole: HoleDef, club: string, angle: number, power: number, from?: { x: number; y: number }) {
  const { game } = golfGame(hole);
  if (from) game.place(from.x, from.y);
  for (let f = 0; f < 600 && !game.ready; f++) game.step(DT);
  const at = { x: game.world.x[game.ball], y: game.world.y[game.ball] };
  return { p: new Previewer(game).run(at, bagClub(club), angle, power), at };
}

describe('the preview of a shot', () => {
  describe('comes down where the game puts the ball, struck true', () => {
    for (const club of LOFTED) {
      for (const [angle, power] of [
        [NORTH, 1],
        [NORTH + 0.2, 0.7],
        [NORTH - 0.15, 0.3],
      ]) {
        it(`${club.id}, at ${power} of its power, aimed ${(angle - NORTH).toFixed(2)} off north, on the level`, () => {
          const hole = field('f', ROWS, COLS);
          const r = real(hole, club.id, angle, power);
          const { p } = preview(hole, club.id, angle, power);
          expect(p.end).toBe('landed');
          expect(Math.hypot(p.x - r.x, p.y - r.y), 'yards from where the game lands it').toBeLessThan(0.5);
        });
      }
    }

    for (const to of ['north', 'south', 'east'] as const) {
      it(`on a slope that rises to the ${to}, a 7-iron and a driver`, () => {
        const hole = field('f', ROWS, COLS, slope(0.3, to));
        for (const club of ['driver', '7-iron']) {
          const r = real(hole, club, NORTH + 0.1, 0.9);
          const { p } = preview(hole, club, NORTH + 0.1, 0.9);
          expect(Math.hypot(p.x - r.x, p.y - r.y), `${club} ${to}`).toBeLessThan(0.5);
        }
      });
    }

    for (const surface of ['r', 's'] as const) {
      it(`from ${surface === 'r' ? 'the rough' : 'a bunker'}, where the club takes less off the ball`, () => {
        const hole = field(surface, ROWS, COLS);
        const { game } = golfGame(hole);
        const from = { x: game.world.x[game.ball], y: game.world.y[game.ball] + 20 };
        for (const club of ['5-iron', 'sand-wedge']) {
          const r = real(hole, club, NORTH, 1, from);
          const { p } = preview(hole, club, NORTH, 1, from);
          expect(p.lie).toBe(surface === 'r' ? LIE.rough : LIE.sand);
          expect(Math.hypot(p.x - r.x, p.y - r.y), club).toBeLessThan(0.5);
        }
      });
    }
  });

  it('is exact where the arithmetic is not: a driver carries four in a hundred past the formula, and the preview knows', () => {
    const { p, at } = preview(field('f', ROWS, COLS), 'driver', NORTH, 1);
    const formula = carryFrom(bagClub('driver'), 1, LIE.fairway);
    expect(p.carry).toBeCloseTo(Math.hypot(p.x - at.x, p.y - at.y), 6);
    expect(p.carry).toBeGreaterThan(formula * 1.03);
  });

  describe('the path', () => {
    it('begins at the ball and ends where it comes down, rises and falls, and is as long as it says', () => {
      const { p, at } = preview(field('f', ROWS, COLS), 'driver', NORTH, 1);
      expect(p.n).toBeGreaterThan(30);
      expect(p.n).toBeLessThanOrEqual(p.points.length / 3);
      expect(Math.hypot(p.points[0] - at.x, p.points[1] - at.y)).toBeLessThan(0.5);
      const last = (p.n - 1) * 3;
      expect(Math.hypot(p.points[last] - p.x, p.points[last + 1] - p.y)).toBeLessThan(0.6);
      let apex = 0,
        along = 0;
      for (let k = 0; k < p.n; k++) {
        apex = Math.max(apex, p.points[k * 3 + 2]);
        for (const v of [p.points[k * 3], p.points[k * 3 + 1], p.points[k * 3 + 2]])
          expect(Number.isFinite(v)).toBe(true);
        if (k) along += Math.hypot(...[0, 1, 2].map((a) => p.points[k * 3 + a] - p.points[(k - 1) * 3 + a]));
      }
      expect(apex, 'a drive climbs to some twenty yards').toBeGreaterThan(10);
      // up the field, every point is short of where it comes down or at it: the flight does not overshoot and come back
      for (let k = 0; k < p.n; k++) expect(p.points[k * 3 + 1], `point ${k}`).toBeLessThanOrEqual(p.y + 0.05);
      expect(p.length[p.n - 1]).toBeCloseTo(along, 1);
      expect(p.length[0]).toBe(0);
    });

    it('is sampled along by its length: the point a distance along is that distance along the path, exactly', () => {
      const { p } = preview(field('f', ROWS, COLS), '7-iron', NORTH, 1);
      const total = p.length[p.n - 1];
      /** The point `s` along, found the slow way: by walking the segments and adding up what they measure. */
      const walked = (s: number) => {
        let done = 0;
        for (let k = 1; k < p.n; k++) {
          const seg = Math.hypot(...[0, 1, 2].map((c) => p.points[k * 3 + c] - p.points[(k - 1) * 3 + c]));
          if (done + seg >= s || k === p.n - 1) {
            const u = seg > 0 ? Math.max(0, Math.min(1, (s - done) / seg)) : 1;
            return [0, 1, 2].map(
              (c) => p.points[(k - 1) * 3 + c] + (p.points[k * 3 + c] - p.points[(k - 1) * 3 + c]) * u,
            );
          }
          done += seg;
        }
        return [p.points[0], p.points[1], p.points[2]];
      };
      const out = [0, 0, 0];
      for (const u of [0, 0.07, 0.25, 0.5, 0.81, 1]) {
        p.along(u * total, out);
        const want = walked(u * total);
        for (let c = 0; c < 3; c++) expect(out[c], `at ${u}, axis ${c}`).toBeCloseTo(want[c], 2);
      }
      p.along(0, out);
      expect([out[0], out[1]]).toEqual([p.points[0], p.points[1]]);
      p.along(1e9, out);
      expect(out[0]).toBeCloseTo(p.x, 0);
    });
  });

  describe('what it comes to', () => {
    it('is water where the ball goes in, at the place the game tells of, and the hole is not lost', () => {
      const base = field('f', ROWS, COLS);
      const map = base.map.slice();
      // a pond across the course, 240 to 270 yards up: a drive at full power is in it
      const tee = ROWS - 4;
      for (let r = tee - 90; r < tee - 80; r++) map[r] = map[r][0] + '~'.repeat(COLS - 2) + map[r][COLS - 1];
      const hole = { ...base, map };
      const r = real(hole, 'driver', NORTH, 1);
      const { p } = preview(hole, 'driver', NORTH, 1);
      expect(p.end).toBe('water');
      expect(Math.hypot(p.x - r.x, p.y - r.y)).toBeLessThan(0.5);
      expect(r.calls.some(([n]) => n === 'splash')).toBe(true);
    });

    it('is out of bounds where the ball comes down on it, and that is where the game lands it', () => {
      const base = field('f', ROWS, COLS);
      const map = base.map.slice();
      const tee = ROWS - 4;
      for (let r = tee - 90; r < tee - 80; r++) map[r] = map[r][0] + 'x'.repeat(COLS - 2) + map[r][COLS - 1];
      const hole = { ...base, map };
      const r = real(hole, 'driver', NORTH, 1);
      const { p } = preview(hole, 'driver', NORTH, 1);
      expect(p.end).toBe('out');
      expect(Math.hypot(p.x - r.x, p.y - r.y)).toBeLessThan(0.5);
    });

    it('knows a tree is in the way: where it is knocked, which is where the game knocks it, and then where it falls', () => {
      const base = field('f', ROWS, COLS);
      const map = base.map.slice();
      const tee = ROWS - 4,
        middle = Math.floor(COLS / 2);
      // a tree thirty yards up, a drive flies into it
      const r0 = tee - 10;
      map[r0] = map[r0].slice(0, middle) + '^' + map[r0].slice(middle + 1);
      const hole = { ...base, map };
      const { p } = preview(hole, 'driver', NORTH, 1);
      expect(p.hit, 'knocked in the air').not.toBeNull();
      expect(p.hit!.y - p.points[1], 'a drive meets it a short way up').toBeLessThan(40);
      expect(p.carry, 'and is stopped short of the carry it would have had').toBeLessThan(
        carryOf(bagClub('driver'), 1) * 0.6,
      );
      const { game, calls } = golfGame(hole);
      game.pick('driver');
      game.shoot(NORTH, 1);
      for (let f = 0; f < 600 && !calls.some(([n]) => n === 'knocked'); f++) game.step(DT);
      const knock = calls.find(([n]) => n === 'knocked')!;
      expect(Math.hypot((knock[1][1] as number) - p.hit!.x, (knock[1][2] as number) - p.hit!.y)).toBeLessThan(0.6);
    });

    it('forgets a tree it met when the next shot does not meet it: nothing is kept from shot to shot', () => {
      const base = field('f', ROWS, COLS);
      const map = base.map.slice();
      const tee = ROWS - 4,
        middle = Math.floor(COLS / 2);
      const r0 = tee - 10;
      map[r0] = map[r0].slice(0, middle) + '^' + map[r0].slice(middle + 1);
      const hole = { ...base, map };
      const { game } = golfGame(hole);
      const at = { x: game.world.x[game.ball], y: game.world.y[game.ball] };
      const previewer = new Previewer(game);
      expect(previewer.run(at, bagClub('driver'), NORTH, 1).hit, 'the drive meets it').not.toBeNull();
      // aimed well to one side, the same club meets nothing: the mark is gone
      expect(previewer.run(at, bagClub('driver'), NORTH + 0.25, 1).hit, 'and aimed away from it, does not').toBeNull();
    });

    it('is the cup where the ball drops straight into it from the air, and the real ball holes out', () => {
      const base = field('f', 60, 41);
      const map = base.map.map((row) => row.replace('C', 'f'));
      const cupRow = 60 - 4 - 4;
      map[cupRow] = map[cupRow].slice(0, 20) + 'C' + map[cupRow].slice(21);
      const hole = { ...base, map };
      const { game } = golfGame(hole);
      const from = { x: game.world.x[game.ball], y: game.world.y[game.ball] };
      const club = bagClub('sand-wedge');
      const previewer = new Previewer(game);
      const cup = game.layout.cup;
      // scan the aim and the power near a lob to the cup for a shot that drops in from the air: the ring is then the cup
      let found: { angle: number; power: number } | null = null;
      const need = Math.hypot(cup.x - from.x, cup.y - from.y) / carryOf(club, 1);
      for (let a = -20; a <= 20 && !found; a++)
        for (let k = -40; k <= 40 && !found; k++) {
          const angle = Math.atan2(cup.y - from.y, cup.x - from.x) + a * 0.0015;
          const power = Math.min(1, need * (1 + k * 0.004));
          if (previewer.run(from, club, angle, power).end === 'holed') found = { angle, power };
        }
      expect(found, 'a lob that drops in').not.toBeNull();
      const p = previewer.run(from, club, found!.angle, found!.power);
      expect(Math.hypot(p.x - cup.x, p.y - cup.y)).toBeLessThan(1.6);
      // and the game holes it, which is the preview's word made good
      const real = golfGame(hole);
      real.game.pick(club.id);
      real.game.shoot(found!.angle, found!.power);
      for (let f = 0; f < 600 && real.game.phase === 'play'; f++) real.game.step(DT);
      expect(real.calls.some(([n]) => n === 'holed')).toBe(true);
    });
  });

  describe('what is under the ring, and how the ground lies there', () => {
    it('names the lie it comes down on, and the slope at that spot', () => {
      const hole = field('f', ROWS, COLS, slope(0.3, 'north'));
      const { p } = preview(hole, '7-iron', NORTH, 1);
      expect(p.lie).toBe(LIE.fairway);
      // the ground rises to the north by 0.3 in 3, one in ten
      expect(p.slope.y).toBeCloseTo(0.1, 2);
      expect(p.slope.x).toBeCloseTo(0, 3);
    });
  });

  describe('the footprint of a swing that is not true', () => {
    /** A game that draws the given numbers for its first shot and the middle after: the extremes of a swing. */
    function struck(hole: HoleDef, club: string, power: number, draws: number[], from?: { x: number; y: number }) {
      let queue: number[] | null = null;
      const { game, calls } = golfGame(hole, () => (queue ? (queue.shift() ?? 0.5) : 0.5));
      if (from) game.place(from.x, from.y);
      for (let f = 0; f < 600 && !game.ready; f++) game.step(DT);
      game.pick(club);
      const start = { x: game.world.x[game.ball], y: game.world.y[game.ball] };
      queue = draws.slice();
      game.shoot(NORTH, power);
      for (let f = 0; f < 60 * 12; f++) {
        game.step(DT);
        const hit = calls.find(([n, a]) => n === 'landed' && a[3] === true);
        if (hit) return { x: (hit[1][0] as number) - start.x, y: (hit[1][1] as number) - start.y };
      }
      throw new Error('never landed');
    }

    for (const club of ['driver', '7-iron', 'pitching-wedge']) {
      it(`spans the ${club}'s widest miss either way, and its worst mishit short, and never past the ring`, () => {
        const hole = field('f', ROWS, COLS);
        const power = 0.9;
        const { p } = preview(hole, club, NORTH, power);
        const f = p.footprint;
        const spread = maxScatter(bagClub(club), LIE.fairway, power);
        // the widest: aimed off by the whole scatter, no speed lost
        for (const side of [
          [1, 1],
          [0, 0],
        ]) {
          const r = struck(hole, club, power, [...side, 0.5, 0.5]);
          expect(Math.abs(r.x), `${club} across`).toBeCloseTo(f.across, 0);
          expect(f.across).toBeCloseTo(p.carry * Math.sin(spread), 0);
        }
        // the shortest: aimed true, the most speed lost (the carry goes as the speed squared)
        const short = struck(hole, club, power, [0.5, 0.5, 1, 1]);
        const least = p.carry * (1 - DISPERSION.loss * power) ** 2;
        expect(Math.abs(short.x)).toBeLessThan(0.6);
        // the carry is not quite the speed squared (the ball comes down a little below where it left), so the shortest
        // landing is worked out from the carry to within a yard or two, which is as near as a swing's spread is known
        expect(Math.abs(short.y - least), `${club} short`).toBeLessThan(1.6);
        // the ellipse's far end is the ring and its near end is that shortest landing
        expect(2 * f.along).toBeCloseTo(p.carry - least, 6);
      });
    }

    it('is wider from the rough, where the club is wilder, and nothing for a swing of no power', () => {
      const hole = field('r', ROWS, COLS);
      const { game } = golfGame(hole);
      const from = { x: game.world.x[game.ball], y: game.world.y[game.ball] + 20 };
      const fairway = preview(field('f', ROWS, COLS), '5-iron', NORTH, 1).p;
      const rough = preview(hole, '5-iron', NORTH, 1, from).p;
      // across each yard it goes: the rough's shorter carry is a narrower footprint in yards, and a wider one for its length
      expect(rough.footprint.across / rough.carry / (fairway.footprint.across / fairway.carry)).toBeGreaterThan(1.4);
      expect(preview(field('f', ROWS, COLS), '5-iron', NORTH, 0.0001).p.footprint.across).toBeLessThan(0.05);
    });
  });

  describe('costs the game nothing', () => {
    it('spends no chance, takes no stroke, and leaves the played ball, the clock and the card as they were', () => {
      const hole = field('f', ROWS, COLS);
      let draws = 0;
      const game = new Game(new Progress(memoryStore(null)), {}, { random: () => (draws++, 0.5), course: [hole] });
      for (let f = 0; f < 200; f++) game.step(DT);
      const before = JSON.stringify([
        game.t,
        game.strokes,
        game.card,
        game.phase,
        game.world.x[game.ball],
        game.world.y[game.ball],
        game.world.z[game.ball],
        game.inHand.id,
      ]);
      const drawn = draws;
      const previewer = new Previewer(game);
      const at = { x: game.world.x[game.ball], y: game.world.y[game.ball] };
      for (const club of BAG) for (const power of [0.2, 0.6, 1]) previewer.run(at, club, NORTH + power / 5, power);
      const after = JSON.stringify([
        game.t,
        game.strokes,
        game.card,
        game.phase,
        game.world.x[game.ball],
        game.world.y[game.ball],
        game.world.z[game.ball],
        game.inHand.id,
      ]);
      expect(after).toBe(before);
      expect(draws, 'no chance drawn by the played game').toBe(drawn);
    });

    it('is made and written into once: the same result and the same buffers for every shot, and the same answer twice', () => {
      const { game } = golfGame(field('f', ROWS, COLS));
      const previewer = new Previewer(game);
      const at = { x: game.world.x[game.ball], y: game.world.y[game.ball] };
      const a = previewer.run(at, bagClub('driver'), NORTH, 1);
      const buffer = a.points;
      const x = a.x,
        y = a.y;
      const b = previewer.run(at, bagClub('9-iron'), NORTH, 0.5);
      expect(b).toBe(a);
      expect(b.points).toBe(buffer);
      expect(b.carry).toBeLessThan(100);
      const c = previewer.run(at, bagClub('driver'), NORTH, 1);
      expect([c.x, c.y]).toEqual([x, y]);
    });

    it('is nothing for the putter, which goes along the ground and is aimed by its dots as it always was', () => {
      const { game } = golfGame(field('f', ROWS, COLS));
      const at = { x: game.world.x[game.ball], y: game.world.y[game.ball] };
      expect(new Previewer(game).run(at, bagClub('putter'), NORTH, 0.5).n).toBe(0);
    });
  });
});
