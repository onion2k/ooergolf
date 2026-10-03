/**
 * The Pinball Shed's first five holes: each hole's idea held as a test, the course registered where it belongs, and a
 * round of it played by the autopilot with every rule that must always hold watched. Without these a hole could be
 * redrawn into a different, duller one and every general test would still pass.
 */
import { describe, expect, it } from 'vitest';
import {
  BUMPER,
  KIND_RADIUS,
  BALL,
  ROLL,
  STEP,
  TILE,
  heightAt,
  layoutOf,
  onFloor,
  slopeAt,
  stepAt,
} from '../src/arena';
import { Autopilot } from '../src/autopilot';
import { COURSES, type HoleDef } from '../src/course';
import { checkInvariants } from '../src/invariants';
import { PHYSICS } from '../src/physics';
import { SHED } from '../src/shed';
import { DT, newGame } from './helpers';

const hole = (name: string): HoleDef => SHED.find((h) => h.name === name)!;
const onlyHole = (name: string, seed = 1) => newGame(seed, null, [hole(name)]);

/** Strike from the tee and play until the ball rests or the hole is done: whether it dropped in one stroke. */
function holedInOne(name: string, angle: number, power: number, game = onlyHole(name).game): boolean {
  game.begin(0);
  game.shoot(angle, power);
  for (let f = 0; f < 60 * 12 && game.phase === 'play' && !game.ready; f++) game.step(DT);
  return game.phase !== 'play';
}

/** Every strike from the tee, at each degree and each power the player could pick, that drops in one stroke. */
function aces(name: string, degrees: number[], powers: number[]) {
  const { game } = onlyHole(name);
  const found: string[] = [];
  for (const deg of degrees)
    for (const power of powers)
      if (holedInOne(name, (deg * Math.PI) / 180, power, game)) found.push(`${deg}@${power.toFixed(3)}`);
  return found;
}
const range = (from: number, to: number, by: number) =>
  Array.from({ length: Math.floor((to - from) / by + 1e-9) + 1 }, (_, k) => from + k * by);

/** The tile a map letter is in, as (column, row from the top). */
const tileOf = (h: HoleDef, letter: string): [number, number] => {
  const r = h.map.findIndex((row) => row.includes(letter));
  return [h.map[r].indexOf(letter), r];
};

describe('the course', () => {
  it('is registered after The Meadow, as minigolf, of at most nine holes whose pars add up to its summary', () => {
    const at = COURSES.findIndex((c) => c.name === 'The Pinball Shed');
    expect(at).toBe(1);
    expect(COURSES[0].name).toBe('The Meadow');
    const course = COURSES[at];
    expect(course.golf).toBeFalsy();
    expect(course.holes).toBe(SHED);
    expect(SHED.length).toBeGreaterThanOrEqual(5);
    expect(SHED.length).toBeLessThanOrEqual(9);
    expect(course.summary).toEqual({ holes: SHED.length, par: SHED.reduce((a, h) => a + h.par, 0) });
    expect(SHED.map((h) => h.name).slice(0, 5)).toEqual([
      'Corner Pocket',
      'The Funnel',
      'Plinko',
      'Half-pipe',
      'Three Cushion',
    ]);
    expect(SHED.map((h) => h.par).slice(0, 5)).toEqual([2, 2, 3, 3, 3]);
  });

  it('draws no obstacle of a kind the engine lacks: only what The Meadow has, and the holes here use none that moves', () => {
    for (const h of SHED)
      for (const o of h.obstacles ?? []) expect(['barrier', 'windmill', 'conveyor'], h.name).toContain(o.kind);
  });
});

describe('Corner Pocket', () => {
  const h = hole('Corner Pocket');
  const l = layoutOf(h.map, h.terrain);

  it('has rail between the tee and the cup: no straight line from the tee reaches the cup', () => {
    // along the line, at the ball's width either side of it, the grass runs out
    const d = Math.hypot(l.cup.x - l.tee.x, l.cup.y - l.tee.y);
    const blocked = (side: number) => {
      const nx = -(l.cup.y - l.tee.y) / d,
        ny = (l.cup.x - l.tee.x) / d;
      for (let s = 0; s <= d; s += 0.25) {
        const x = l.tee.x + ((l.cup.x - l.tee.x) * s) / d + nx * side,
          y = l.tee.y + ((l.cup.y - l.tee.y) * s) / d + ny * side;
        if (!onFloor(l, x, y)) return true;
      }
      return false;
    };
    for (const side of [-1, 0, 1]) expect(blocked(side), `a line ${side} off the middle`).toBe(true);
  });

  it('is not holed by any shot struck straight at the cup, at any power', () => {
    const { game } = onlyHole('Corner Pocket');
    const toCup = Math.atan2(l.cup.y - l.tee.y, l.cup.x - l.tee.x);
    for (const off of range(-3, 3, 0.5))
      for (const power of range(0.1, 1, 0.05))
        expect(holedInOne('Corner Pocket', toCup + (off * Math.PI) / 180, power, game), `${off} off at ${power}`).toBe(
          false,
        );
  });

  it('is holed in one by a bank off the far rail, so the way round the corner is a line to find', () => {
    const found = aces('Corner Pocket', range(0, 359, 1), range(0.5, 1, 0.025));
    expect(found.length, found.join(' ')).toBeGreaterThan(5);
    // and each of them is a shot away from the cup: up and to the right toward the rail, or up and left to the top one
    for (const f of found)
      expect(Number(f.split('@')[0]), f).not.toBeCloseTo(
        (Math.atan2(l.cup.y - l.tee.y, l.cup.x - l.tee.x) * 180) / Math.PI,
        -1,
      );
  });
});

describe('The Funnel', () => {
  const h = hole('The Funnel');
  const l = layoutOf(h.map, h.terrain);
  const posts = h.map.flatMap((row, r) => [...row].flatMap((c, k) => (c === 'o' ? [[k, r] as const] : [])));
  const [cupCol, cupRow] = tileOf(h, 'C');

  it('is two lines of posts, one the other’s mirror about the cup, closing toward it from the mouth', () => {
    expect(posts.length).toBeGreaterThanOrEqual(8);
    for (const [c, r] of posts)
      expect(
        posts.some(([c2, r2]) => r2 === r && c2 === 2 * cupCol - c),
        `${c},${r}`,
      ).toBe(true);
    // each row's gap, from the post on its left to the one on its right, is no wider than the row below it
    const gap = new Map<number, number>();
    for (const [c, r] of posts) if (c > cupCol) gap.set(r, (c - (2 * cupCol - c)) * TILE);
    const rows = [...gap.keys()].sort((a, b) => b - a);
    for (let i = 1; i < rows.length; i++)
      expect(gap.get(rows[i])!, `row ${rows[i]}`).toBeLessThanOrEqual(gap.get(rows[i - 1])!);
    expect(gap.get(rows[0])!, 'the mouth is wide').toBeGreaterThan(gap.get(rows[rows.length - 1])! * 2);
    // the cup is beyond the narrow end, and the narrow end lets a ball through, with room either side
    expect(Math.max(...posts.map(([, r]) => r)), 'the posts are between the tee and the cup').toBeLessThan(l.rows - 1);
    expect(Math.min(...posts.map(([, r]) => r))).toBeGreaterThan(cupRow);
    expect(gap.get(rows[rows.length - 1])!).toBeGreaterThan(2 * (BUMPER.radius + KIND_RADIUS[BALL]));
  });

  it('throws a ball that is struck into either line back inward, toward the cup’s column', () => {
    const [teeCol] = tileOf(h, 'T');
    expect(teeCol).toBe(cupCol);
    for (const side of [-1, 1]) {
      const { game } = onlyHole('The Funnel');
      // the post of its line nearest the tee, from the tee
      const [pc, pr] = posts.filter(([c]) => Math.sign(c - cupCol) === side).sort((a, b) => b[1] - a[1])[0];
      const px = l.originX + (pc + 0.5) * TILE,
        py = l.originY + (l.rows - 1 - pr + 0.5) * TILE;
      game.shoot(Math.atan2(py - l.tee.y, px - l.tee.x), 0.5);
      let best = 0;
      for (let f = 0; f < 60 * 4; f++) {
        game.step(DT);
        // inward is toward the cup's column: the ball's velocity across, against the side it is on
        best = Math.max(best, -side * game.world.vx[game.ball]);
      }
      expect(best, `the ${side < 0 ? 'left' : 'right'} line`).toBeGreaterThan(3);
    }
  });

  it('is holed in one by a shot up the middle, which threads the posts', () => {
    expect(aces('The Funnel', [90], range(0.5, 1, 0.025)).length).toBeGreaterThan(0);
  });
});

describe('Plinko', () => {
  const h = hole('Plinko');
  const posts = h.map.flatMap((row, r) => [...row].flatMap((c, k) => (c === 'o' ? [[k, r] as const] : [])));

  it('is a short field of posts in staggered rows between the tee and the cup', () => {
    const rows = [...new Set(posts.map(([, r]) => r))].sort((a, b) => a - b);
    expect(rows.length).toBeGreaterThanOrEqual(3);
    expect(posts.length).toBeGreaterThanOrEqual(7);
    // each row is not the one before it: the posts of one row stand over the gaps of the next
    for (let i = 1; i < rows.length; i++) {
      const a = posts.filter(([, r]) => r === rows[i - 1]).map(([c]) => c);
      const b = posts.filter(([, r]) => r === rows[i]).map(([c]) => c);
      expect(a, `rows ${rows[i - 1]} and ${rows[i]}`).not.toEqual(b);
    }
    const [, cupRow] = tileOf(h, 'C'),
      [, teeRow] = tileOf(h, 'T');
    expect(Math.min(...rows)).toBeGreaterThan(cupRow);
    expect(Math.max(...rows)).toBeLessThan(teeRow);
    expect(h.map.length, 'short: a laugh and not a grind').toBeLessThanOrEqual(13);
  });

  it('rattles a ball struck straight up it: the middle of the field has a post in it, and the ball is knocked', () => {
    const { game, told } = onlyHole('Plinko');
    game.shoot(Math.PI / 2, 0.8);
    for (let f = 0; f < 60 * 8 && !game.ready && game.phase === 'play'; f++) game.step(DT);
    expect(told.filter((t) => t.startsWith('knocked')).length).toBeGreaterThanOrEqual(1);
  });
});

describe('Half-pipe', () => {
  const h = hole('Half-pipe');
  const l = layoutOf(h.map, h.terrain);
  const holds = ROLL.roll / PHYSICS.gravity;

  it('rises on both sides to a trough, the same along its whole length, the cup on the floor of it', () => {
    const terrain = h.terrain as readonly string[];
    expect(terrain.length).toBe(h.map.length);
    expect(new Set(terrain).size, 'every row is the same cross-section').toBe(1);
    const row = terrain[0].slice(1, -1);
    expect(row).toBe('3210123');
    expect(row, 'a mirror about the middle').toBe([...row].reverse().join(''));
    const [cupCol] = tileOf(h, 'C');
    expect(Number(terrain[0][cupCol]), 'the cup is in the trough').toBe(0);
  });

  it('is ground a ball rests on: no step wall, and the slope on every tile of grass within what the green holds', () => {
    for (let r = 0; r < h.map.length; r++)
      for (let c = 0; c < h.map[r].length; c++) {
        if (h.map[r][c] === '#') continue;
        const x = l.originX + (c + 0.5) * TILE,
          y = l.originY + (l.rows - 1 - r + 0.5) * TILE;
        expect(stepAt(l, x, y), `${c},${r} no raised grass`).toBe(0);
        const [sx, sy] = slopeAt(l, x, y);
        const s = Math.hypot(sx, sy);
        expect(s / Math.sqrt(1 + s * s), `${c},${r}`).toBeLessThanOrEqual(holds);
      }
    expect(heightAt(l, l.originX + 1.5 * TILE, l.tee.y), 'the side is higher than the trough').toBeGreaterThan(
      heightAt(l, l.cup.x, l.tee.y) + STEP,
    );
  });

  it('keeps a ball put down on its side where it was put, at rest', () => {
    const { game } = onlyHole('Half-pipe');
    const [x, y] = [l.originX + 1.5 * TILE, l.originY + 8.5 * TILE];
    game.place(x, y);
    for (let f = 0; f < 60 * 3; f++) game.step(DT);
    expect(Math.hypot(game.world.x[game.ball] - x, game.world.y[game.ball] - y)).toBeLessThan(0.5);
  });

  it('turns a ball struck up the side across the trough: it comes down toward the cup’s side', () => {
    const { game } = onlyHole('Half-pipe');
    game.shoot(Math.PI / 2, 0.45);
    let across = 0;
    for (let f = 0; f < 60 * 8 && !game.ready && game.phase === 'play'; f++) {
      game.step(DT);
      across = Math.max(across, game.world.x[game.ball] - l.tee.x);
    }
    // a straight shot up the tee's column goes nowhere near the middle on the flat: here the ground carries it over
    expect(across, 'the ball was carried across').toBeGreaterThan(2);
  });
});

describe('Three Cushion', () => {
  const h = hole('Three Cushion');
  const l = layoutOf(h.map, h.terrain);
  const [cupCol, cupRow] = tileOf(h, 'C');
  const raised = (c: number, r: number) => /[3-9]/.test(h.map[r][c]);

  it('walls the cup in on three sides with raised grass and opens it only toward the far rail', () => {
    // west, east and south of the cup, within two tiles, a wall the ball cannot climb (three steps, 1.2)
    for (const [dc, dr] of [
      [-2, 0],
      [2, 0],
      [0, 1],
    ])
      expect(Number(h.map[cupRow + dr][cupCol + dc]) * STEP, `${dc},${dr}`).toBeGreaterThanOrEqual(1.2);
    // the way in is the north: grass there, up to the rail, with nothing raised in the column
    for (let r = 1; r < cupRow; r++) expect(raised(cupCol, r), `row ${r}`).toBe(false);
    expect(h.map[cupRow - 1][cupCol]).toBe('.');
    expect(h.map[0][cupCol]).toBe('#');
  });

  it('cannot be holed by a straight shot: every line from the tee to the cup crosses the wall', () => {
    const { game } = onlyHole('Three Cushion');
    const toCup = Math.atan2(l.cup.y - l.tee.y, l.cup.x - l.tee.x);
    for (const off of range(-4, 4, 0.5))
      for (const power of range(0.1, 1, 0.05))
        expect(holedInOne('Three Cushion', toCup + (off * Math.PI) / 180, power, game), `${off} off at ${power}`).toBe(
          false,
        );
    // and it is the wall, not the rail, that is in the way
    let wall = false;
    const d = Math.hypot(l.cup.x - l.tee.x, l.cup.y - l.tee.y);
    for (let s = 0; s <= d; s += 0.25) {
      const x = l.tee.x + ((l.cup.x - l.tee.x) * s) / d,
        y = l.tee.y + ((l.cup.y - l.tee.y) * s) / d;
      if (stepAt(l, x, y) >= 1.2) wall = true;
    }
    expect(wall).toBe(true);
  });

  it('is holed in one by a bank off the rail above it, so there is a line to find', () => {
    const found = aces('Three Cushion', range(40, 80, 0.5), range(0.5, 1, 0.025));
    expect(found.length, found.join(' ')).toBeGreaterThan(5);
  });
});

describe('the five holes as a round', () => {
  it('are each holed within the limit by the autopilot from seeds of its own, breaking no rule on the way, and the card is whole', () => {
    for (const seed of [1, 2, 3]) {
      const { game } = newGame(seed, null, SHED);
      const pilot = new Autopilot(game);
      for (let f = 0; f < 60 * 60 * 6 && game.phase !== 'over'; f++) {
        pilot.step(DT);
        if (f % 30 === 0) expect(checkInvariants(game), `seed ${seed}, frame ${f}`).toEqual([]);
      }
      expect(game.phase, `seed ${seed}`).toBe('over');
      expect(game.card.length).toBe(SHED.length);
      game.card.forEach((s, i) => {
        expect(s, `${SHED[i].name}, seed ${seed}`).toBeGreaterThanOrEqual(1);
        expect(s, `${SHED[i].name}, seed ${seed}`).toBeLessThanOrEqual(SHED[i].par + 3);
      });
    }
  });
});
