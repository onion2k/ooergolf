/**
 * The Pinball Shed's nine holes: each hole's idea held as a test, the course registered where it belongs, and a
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
import { FLIPPER, flipperAngle } from '../src/obstacles';
import { PHYSICS } from '../src/physics';
import { SHED } from '../src/shed';
import { fuzz } from '../scripts/fuzzer';
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
    expect(SHED.length).toBe(9);
    expect(course.summary).toEqual({ holes: SHED.length, par: SHED.reduce((a, h) => a + h.par, 0) });
    expect(SHED.map((h) => h.name)).toEqual([
      'Corner Pocket',
      'The Funnel',
      'Plinko',
      'Half-pipe',
      'Three Cushion',
      'The Kicker',
      'Flipper Alley',
      'The Bowl Pit',
      'Multiball',
    ]);
    expect(SHED.map((h) => h.par)).toEqual([2, 2, 3, 3, 3, 2, 3, 3, 4]);
    // the plan said par 27, but its own nine pars add up to 25: the holes' pars are what was drawn
    expect(SHED.reduce((a, h) => a + h.par, 0)).toBe(25);
  });

  it('draws nothing that moves but the flipper, which only Flipper Alley and Multiball have: the rest is skill, not timing', () => {
    for (const h of SHED)
      for (const o of h.obstacles ?? []) {
        expect(o.kind, h.name).toBe('flipper');
        expect(['Flipper Alley', 'Multiball'], h.name).toContain(h.name);
      }
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

describe('the nine holes as a round', () => {
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

/** The tiles of a map a letter is on, as (column, row from the top). */
const tilesOf = (h: HoleDef, test: (c: string) => boolean) =>
  h.map.flatMap((row, r) => [...row].flatMap((c, k) => (test(c) ? [[k, r] as const] : [])));
const xOf = (l: ReturnType<typeof layoutOf>, col: number) => l.originX + (col + 0.5) * TILE;
const yOf = (l: ReturnType<typeof layoutOf>, row: number) => l.originY + (l.rows - 1 - row + 0.5) * TILE;

describe('The Kicker', () => {
  const h = hole('The Kicker');
  const l = layoutOf(h.map, h.terrain);

  it('has one kicker, in a lane, with a door in the lane’s wall beside it and the cup in the room beyond', () => {
    expect(l.kickers).toHaveLength(1);
    expect(h.obstacles ?? []).toEqual([]);
    const [kc, kr] = tileOf(h, 'k');
    const [cc, cr] = tileOf(h, 'C');
    const [tc] = tileOf(h, 'T');
    expect(kc, 'square in the lane the tee is in').toBe(tc);
    expect(cc, 'the cup is off to one side').toBeGreaterThan(kc + 2);
    expect(
      cr,
      'and level with the kicker or a row above it, so the throw out through the door can reach it',
    ).toBeLessThanOrEqual(kr);
  });

  it('shows no straight line from the tee to the cup: the lane’s wall is across every one', () => {
    const d = Math.hypot(l.cup.x - l.tee.x, l.cup.y - l.tee.y);
    const blocked = (side: number) => {
      const nx = -(l.cup.y - l.tee.y) / d,
        ny = (l.cup.x - l.tee.x) / d;
      for (let s = 0; s <= d; s += 0.25)
        if (
          !onFloor(
            l,
            l.tee.x + ((l.cup.x - l.tee.x) * s) / d + nx * side,
            l.tee.y + ((l.cup.y - l.tee.y) * s) / d + ny * side,
          )
        )
          return true;
      return false;
    };
    for (const side of [-1, 0, 1]) expect(blocked(side), `a line ${side} off the middle`).toBe(true);
  });

  it('is holed in one by a soft shot into the kicker’s right cheek, which throws the ball out through the door', () => {
    const { game, told } = onlyHole('The Kicker');
    const kicker = l.kickers[0];
    // aimed a little to the right of the kicker: its near cheek, at the lane’s far end
    const angle = (82 * Math.PI) / 180;
    expect(
      Math.abs(kicker.x - l.tee.x),
      'the kicker is straight up the lane, so 82 degrees is off its middle',
    ).toBeLessThan(1e-6);
    game.shoot(angle, 0.65);
    let met = false;
    for (let f = 0; f < 60 * 12 && game.phase === 'play' && !game.ready; f++) {
      game.step(DT);
      if (Math.hypot(game.world.x[game.ball] - kicker.x, game.world.y[game.ball] - kicker.y) < 2.3) met = true;
    }
    expect(met, 'the ball met the kicker').toBe(true);
    expect(
      told.some((t) => t.startsWith('knocked')),
      'and was knocked by it',
    ).toBe(true);
    expect(game.phase, 'and was holed in one').not.toBe('play');
    expect(game.strokes).toBe(1);
    // and it is a soft shot: well under the hardest
    expect(0.65).toBeLessThan(0.75);
  });

  it('is not holed by a straight shot at the kicker, at any power: it is thrown back harder than it met it', () => {
    const { game } = onlyHole('The Kicker');
    for (const power of range(0.1, 1, 0.05))
      expect(holedInOne('The Kicker', Math.PI / 2, power, game), `power ${power}`).toBe(false);
    // and the hard one comes back down the lane, past the tee
    const { game: g, told } = onlyHole('The Kicker');
    g.shoot(Math.PI / 2, 1);
    let back = false;
    for (let f = 0; f < 60 * 4; f++) {
      g.step(DT);
      if (g.world.vy[g.ball] < -20) back = true;
    }
    expect(told.filter((t) => t.startsWith('knocked')).length).toBeGreaterThanOrEqual(1);
    expect(back, 'thrown back at more than twenty a second').toBe(true);
  });
});

describe('Flipper Alley', () => {
  const h = hole('Flipper Alley');
  const l = layoutOf(h.map, h.terrain);
  const flipper = h.obstacles![0] as Extract<NonNullable<HoleDef['obstacles']>[number], { kind: 'flipper' }>;
  const sand = tilesOf(h, (c) => c === 's');
  const r = KIND_RADIUS[BALL];
  const face = yOf(l, flipper.at[1]) + FLIPPER.hy + r;
  const sandSouth = yOf(l, sand[0][1]) - TILE / 2,
    sandNorth = yOf(l, sand[0][1]) + TILE / 2;

  it('is a lane with a flipper at its foot, the tee north of the arm, and a bunker across the lane before the cup', () => {
    expect(h.obstacles).toHaveLength(1);
    expect(flipper.kind).toBe('flipper');
    expect(flipper.period, 'a four-second period').toBe(4);
    expect(l.tee.y, 'the tee is north of the arm, so a ball struck onto it lands on its north face').toBeGreaterThan(
      yOf(l, flipper.at[1]) + FLIPPER.hy + r,
    );
    expect(l.cup.y, 'the cup is up the lane from the bunker').toBeGreaterThan(sandNorth);
    // the sand is in one row and across the whole width of the lane the arm flings a ball up
    const [firstCol] = tileOf(h, 's');
    const row = h.map[sand[0][1]];
    expect(sand.length).toBeGreaterThanOrEqual(3);
    expect(row[firstCol - 1]).toBe('#');
    expect(row[firstCol + sand.length]).toBe('#');
    // and the ground is level where the arm sweeps, which the flipper insists on
    expect(h.terrain).toBeUndefined();
  });

  /**
   * A ball laid on the arm's north face, near its tip, and rolled gently south onto it, the strike put off until `wait`
   * seconds of the game's own clock: where it is a second and a half after it first meets the arm, and the angle the arm was
   * at when it did.
   */
  function meet(wait: number) {
    const { game } = onlyHole('Flipper Alley');
    while (game.t < wait - 1e-9) game.step(DT);
    game.place(xOf(l, flipper.at[0]) + 7.5, face + 1.5);
    game.shoot(-Math.PI / 2, 0.2);
    let contact = -1;
    let peak = -Infinity;
    for (let f = 0; f < 5 * 60; f++) {
      const before = game.world.vy[game.ball];
      game.step(DT);
      if (contact < 0 && before < -1 && game.world.vy[game.ball] > before + 2) contact = game.t;
      if (contact >= 0 && game.t - contact < 1.5) peak = Math.max(peak, game.world.y[game.ball]);
    }
    return { contact, peak, angle: contact > 0 ? flipperAngle(flipper, contact) : NaN };
  }

  it('flings a ball timed to the upswing up the lane past the bunker, and not one timed to the rest', () => {
    // met just as the arm starts up, which is when it is going fastest where the ball is
    const up = meet(0);
    expect(up.contact, 'it met the arm').toBeGreaterThan(0);
    expect(up.angle, 'on the upswing').toBeGreaterThan(0);
    expect(up.angle).toBeLessThan(0.3);
    expect(up.peak, 'flung past the bunker’s far edge').toBeGreaterThan(sandNorth + 1);
    // met while it lies at rest, and left there for the next second and a half: it never leaves the south of the bunker
    for (const wait of [2.0, 2.2, 2.4]) {
      const rest = meet(wait);
      expect(rest.contact, `wait ${wait}`).toBeGreaterThan(0);
      expect(flipperAngle(flipper, rest.contact), `wait ${wait}: at rest`).toBe(0);
      expect(flipperAngle(flipper, rest.contact + 1.5), `wait ${wait}: and still at rest`).toBe(0);
      expect(rest.peak, `wait ${wait}: stays south of the bunker`).toBeLessThan(sandSouth);
    }
  });

  it('puts a ball timed a little early into the sand, and not past it', () => {
    // the arm is at rest, but about to go up: the ball lies on it and is pushed, softly, up into the bunker's edge
    const early = meet(2.7);
    expect(early.peak).toBeGreaterThan(sandSouth);
    expect(early.peak, 'pushed into the sand, no further than the sand’s far edge').toBeLessThan(sandNorth + 0.5);
  });

  it('is holed in one from the tee by a shot struck so the ball meets the arm as it starts up, and not by the same shot at the wrong moment', () => {
    const shot = (wait: number) => {
      const { game } = onlyHole('Flipper Alley');
      while (game.t < wait - 1e-9) game.step(DT);
      game.shoot((168 * Math.PI) / 180, 0.5);
      for (let f = 0; f < 60 * 12 && game.phase === 'play' && !game.ready; f++) game.step(DT);
      return game.phase !== 'play';
    };
    for (const wait of [2.5, 2.75, 3])
      expect(shot(wait), `struck at ${wait} seconds, met at the foot of the upswing`).toBe(true);
    for (const wait of [0, 0.5, 1, 1.5, 2, 3.75])
      expect(shot(wait), `the same shot struck at ${wait} seconds`).toBe(false);
  });
});

describe('The Bowl Pit', () => {
  const h = hole('The Bowl Pit');
  const l = layoutOf(h.map, h.terrain);
  const rows = h.terrain as readonly string[];
  const [cupCol, cupRow] = tileOf(h, 'C');

  it('is a bowl of digits with the cup at the bottom of it, rising all round to a rim', () => {
    expect(rows.length).toBe(h.map.length);
    expect(Number(rows[cupRow][cupCol]), 'the cup is at the bottom').toBe(0);
    for (let r = 1; r < rows.length - 1; r++)
      for (let c = 1; c < rows[r].length - 1; c++) {
        const d = Math.max(Math.abs(r - cupRow), Math.abs(c - cupCol));
        // the height rises with the distance from the cup, a step a tile, to a flat rim: a bowl and not a hill
        expect(Number(rows[r][c]), `${c},${r}`).toBe(Math.min(3, Math.max(0, d - 1)));
      }
    expect(heightAt(l, l.cup.x, l.cup.y)).toBeLessThan(heightAt(l, l.tee.x, l.tee.y) - 1);
    expect(heightAt(l, l.tee.x, l.tee.y), 'the tee is on the rim, level').toBeGreaterThan(1.4);
  });

  it('has kickers all round its rim, on the level of it, and a way over the far rim between two of them', () => {
    const kickers = tilesOf(h, (c) => c === 'k');
    expect(kickers.length).toBeGreaterThanOrEqual(8);
    const rim = (c: number, r: number) => Math.max(Math.abs(r - cupRow), Math.abs(c - cupCol));
    const onRim = kickers.filter(([c, r]) => rim(c, r) === 4);
    expect(onRim.length, 'most are on the rim').toBeGreaterThanOrEqual(8);
    // the far side of the rim, straight over the cup from the tee, has a kicker nowhere on the column
    const [teeCol, teeRow] = tileOf(h, 'T');
    expect(teeCol).toBe(cupCol);
    expect(teeRow).toBeGreaterThan(cupRow);
    expect(kickers.some(([c, r]) => c === cupCol && r === cupRow - 4)).toBe(false);
  });

  it('kicks a ball that reaches the rim back in, toward the cup', () => {
    // struck at the kickers on the east side at every power from a good one to the hardest
    const east = l.kickers.find((k) => k.x > 6 && k.y > 0 && k.y < 8)!;
    expect(east).toBeDefined();
    for (const power of [0.7, 0.8, 0.9, 1]) {
      const { game, told } = onlyHole('The Bowl Pit');
      game.shoot(Math.atan2(east.y - l.tee.y, east.x - l.tee.x), power);
      let reached = Infinity;
      let nearest = Infinity;
      for (let f = 0; f < 60 * 6 && game.phase === 'play'; f++) {
        game.step(DT);
        const x = game.world.x[game.ball],
          y = game.world.y[game.ball];
        const d = Math.hypot(x - l.cup.x, y - l.cup.y);
        if (reached === Infinity && Math.hypot(x - east.x, y - east.y) < 2.3) reached = d;
        if (reached !== Infinity) nearest = Math.min(nearest, d);
      }
      expect(reached, `power ${power}: it reached the rim`).toBeGreaterThan(9);
      expect(
        told.some((t) => t.startsWith('knocked')),
        `power ${power}: and was knocked`,
      ).toBe(true);
      expect(nearest, `power ${power}: and came back in`).toBeLessThan(5);
      expect(nearest).toBeLessThan(reached / 2);
    }
  });

  it('brings a soft shot to rest near the cup, and a shot struck too hard goes up the far side and out over the rim toward the rail', () => {
    const end = (deg: number, power: number) => {
      const { game } = onlyHole('The Bowl Pit');
      game.shoot((deg * Math.PI) / 180, power);
      let peak = -Infinity;
      for (let f = 0; f < 60 * 10 && game.phase === 'play' && !game.ready; f++) {
        game.step(DT);
        peak = Math.max(peak, game.world.y[game.ball]);
      }
      return { x: game.world.x[game.ball], y: game.world.y[game.ball], peak, holed: game.phase !== 'play' };
    };
    const soft = end(80, 0.5);
    expect(Math.hypot(soft.x - l.cup.x, soft.y - l.cup.y), 'a soft shot ends near the cup').toBeLessThan(5);
    const hard = end(84, 1);
    expect(hard.peak, 'a hard one reaches the far rim').toBeGreaterThan(l.cup.y + 10);
    expect(hard.holed).toBe(false);
    expect(hard.y, 'and rests out on it, over the far side of the bowl').toBeGreaterThan(l.cup.y + 8);
  });

  it('is ground a ball rests on at the foot of the bowl, round the cup and nowhere steeper than the green holds', () => {
    const holds = ROLL.roll / PHYSICS.gravity;
    for (let a = 0; a < 48; a++)
      for (const rad of [0.5, 1.5, 3, 5, 7, 9]) {
        const [sx, sy] = slopeAt(
          l,
          l.cup.x + Math.cos((a / 48) * Math.PI * 2) * rad,
          l.cup.y + Math.sin((a / 48) * Math.PI * 2) * rad,
        );
        const s = Math.hypot(sx, sy);
        expect(s / Math.sqrt(1 + s * s), `${a}, ${rad} from the cup`).toBeLessThanOrEqual(holds);
      }
  });
});

describe('Multiball', () => {
  const h = hole('Multiball');
  const l = layoutOf(h.map, h.terrain);
  const posts = tilesOf(h, (c) => c === 'o');
  const flipper = h.obstacles![0] as Extract<NonNullable<HoleDef['obstacles']>[number], { kind: 'flipper' }>;
  const [, cupRow] = tileOf(h, 'C');
  const [, teeRow] = tileOf(h, 'T');
  const [, kickRow] = tileOf(h, 'k');

  it('has a kicker, a flipper and a funnel of posts, in the order they are met from the tee to the cup', () => {
    expect(l.kickers).toHaveLength(1);
    expect(h.obstacles).toHaveLength(1);
    expect(flipper.kind).toBe('flipper');
    expect(posts.length, 'a funnel of posts').toBeGreaterThanOrEqual(8);
    const postRows = posts.map(([, r]) => r);
    // the flipper is at the cup's mouth: nearest the cup of the three, and the funnel is the furthest from it
    expect(flipper.at[1], 'the flipper is between the cup and the kicker').toBeGreaterThan(cupRow);
    expect(flipper.at[1]).toBeLessThan(kickRow);
    expect(Math.min(...postRows), 'the posts are the other side of the kicker from the flipper').toBeLessThan(kickRow);
    expect(Math.max(...postRows)).toBeLessThan(kickRow);
    expect(kickRow).toBeLessThan(teeRow);
    // the posts close on the way to the cup: each row's pair is no wider than the one before it
    const width = (r: number) => {
      const cs = posts.filter(([, pr]) => pr === r).map(([c]) => c);
      return Math.max(...cs) - Math.min(...cs);
    };
    const rowsDown = [...new Set(postRows)].sort((a, b) => b - a);
    for (let i = 1; i < rowsDown.length; i++)
      expect(width(rowsDown[i]), `row ${rowsDown[i]}`).toBeLessThanOrEqual(width(rowsDown[i - 1]));
    expect(width(rowsDown[rowsDown.length - 1])).toBeLessThan(width(rowsDown[0]));
  });

  it('has a jut of rail between the tee and the funnel, so the first shot is a way round it: a bank', () => {
    const [teeCol, tRow] = tileOf(h, 'T');
    // a row of rail with grass only at its far end, over the tee's side
    const jutRows = h.map.flatMap((row, r) => (r > 1 && r < tRow && row.slice(1, 4) === '###' ? [r] : []));
    expect(jutRows.length).toBeGreaterThanOrEqual(2);
    for (const r of jutRows) expect(h.map[r][teeCol], `row ${r}: rail over the tee`).toBe('#');
    // and no straight shot at the cup from the tee is clear: not at any power
    const d = Math.hypot(l.cup.x - l.tee.x, l.cup.y - l.tee.y);
    let blocked = false;
    for (let s = 0; s <= d; s += 0.25)
      if (!onFloor(l, l.tee.x + ((l.cup.x - l.tee.x) * s) / d, l.tee.y + ((l.cup.y - l.tee.y) * s) / d)) blocked = true;
    expect(blocked).toBe(true);
  });

  it('stands its flipper on level ground and across the lane to the cup, long enough to close it at rest', () => {
    const row = h.map[flipper.at[1]];
    const first = row.indexOf('.'),
      last = row.lastIndexOf('.');
    expect(flipper.at[0], 'rooted at the lane’s west wall').toBe(first);
    expect(flipper.pivot).toBe('left');
    expect(flipper.at[0] + flipper.length, 'its tip reaches the east wall at rest').toBeGreaterThanOrEqual(last);
    expect(h.terrain).toBeUndefined();
  });

  it('is holed by the autopilot, which waits for the arm, within the limit, and is a hole that takes it strokes', () => {
    const strokes: number[] = [];
    for (const seed of [1, 2, 3, 4]) {
      const { game } = newGame(seed, null, [h]);
      const pilot = new Autopilot(game);
      for (let f = 0; f < 60 * 60 * 4 && game.phase === 'play'; f++) {
        pilot.step(DT);
        if (f % 30 === 0) expect(checkInvariants(game), `seed ${seed}, frame ${f}`).toEqual([]);
      }
      expect(game.card.length, `seed ${seed} finished`).toBe(1);
      expect(game.card[0], `seed ${seed}`).toBeLessThanOrEqual(h.par + 3);
      strokes.push(game.card[0]);
    }
    expect(Math.max(...strokes), 'a long hole, not a putt').toBeGreaterThanOrEqual(2);
  });
});

describe('the fuzzer on the whole course', () => {
  it('plays it clean from a few seeds, striking at the kicker and at the flipper', () => {
    let kicks = 0,
      flips = 0;
    for (const seed of [1, 2, 3]) {
      const result = fuzz(seed, 6000, SHED);
      expect(result.failure, `seed ${seed}`).toBeNull();
      kicks += result.done['strike a kicker'] ?? 0;
      flips += result.done['strike at the flipper'] ?? 0;
    }
    expect(kicks, 'the kicker action ran').toBeGreaterThan(0);
    expect(flips, 'the flipper action ran').toBeGreaterThan(0);
  });
});
