/**
 * What a golf ball does when it comes down: it lands, its horizontal speed is scrubbed by the surface, it hops a
 * little by the surface's bounce, and it rolls out on the surface's roll, and comes to rest. Simulated in the game on a
 * hole that is one surface end to end, since the numbers that matter are the game's: how far each club carries and
 * how far it runs on after, as a share of the carry, which is what makes a driver a different club from a wedge.
 */
import { describe, expect, it } from 'vitest';
import { TILE } from '../src/arena';
import { BAG, carryOf } from '../src/bag';
import { checkInvariants } from '../src/invariants';
import { LANDING, LIE, SURFACES } from '../src/surfaces';
import { seeded } from '../src/random';
import { DT, field, golfGame } from './helpers';

/** North, along the field, which is the way the tee faces. */
const NORTH = Math.PI / 2;

interface Flight {
  /** How far the first landing was from where it was struck, along the field. */
  carry: number;
  /** How far the ball came to rest from where it was struck. */
  rest: number;
  /** How long it was in the air before it first landed, in seconds. */
  air: number;
  /** Every landing told: how hard it came down. */
  landings: number[];
}

/**
 * A club struck at `power` and watched until it is at rest: from the tee, or, `lying`, from the surface itself two
 * tiles up the field from it, which is where a shot from the rough or the sand is struck.
 */
function fly(surface: 'f' | 'r' | 'g' | 's', club: string, power = 1, lying = false): Flight {
  const { game, told } = golfGame(field(surface));
  if (lying) game.place(game.layout.tee.x, game.layout.tee.y + 2 * TILE);
  game.pick(club);
  const y0 = game.world.y[game.ball];
  const before = told.length;
  expect(game.shoot(NORTH, power)).toBe(true);
  let air = -1;
  for (let f = 0; f < 60 * 40; f++) {
    game.step(DT);
    expect(checkInvariants(game), `frame ${f}`).toEqual([]);
    const landed = told.slice(before).filter((t) => t.startsWith('landed '));
    if (air < 0 && landed.length) air = (f + 1) * DT;
    if (game.ready) break;
  }
  expect(game.ready, `${club} came to rest`).toBe(true);
  const landings = told
    .slice(before)
    .filter((t) => t.startsWith('landed '))
    .map((t) => Number(t.split(' ')[3]));
  const firstY = Number(
    told
      .slice(before)
      .find((t) => t.startsWith('landed '))
      ?.split(' ')[2],
  );
  return { carry: firstY - y0, rest: game.world.y[game.ball] - y0, air, landings };
}

describe('a lofted ball', () => {
  it('carries what the formula says, for every club in the bag, to within 8%', () => {
    for (const club of BAG.slice(0, -1)) {
      const f = fly('f', club.id);
      const expected = carryOf(club, 1);
      expect(f.carry, `${club.id}: carried ${f.carry.toFixed(1)}, formula ${expected.toFixed(1)}`).toBeGreaterThan(
        expected * 0.92,
      );
      expect(f.carry, `${club.id}: carried ${f.carry.toFixed(1)}, formula ${expected.toFixed(1)}`).toBeLessThan(
        expected * 1.08,
      );
    }
  });

  it('is in the air for under three seconds and over a second, for every club at full power', () => {
    for (const club of BAG.slice(0, -1)) {
      const f = fly('f', club.id);
      expect(f.air, club.id).toBeGreaterThan(1);
      expect(f.air, club.id).toBeLessThan(3);
    }
  });

  it('comes to rest, from every club at full power, on every surface', () => {
    for (const surface of ['f', 'r', 'g', 's'] as const)
      for (const club of BAG) {
        const f = fly(surface, club.id);
        expect(f.rest, `${club.id} on ${surface}`).toBeGreaterThan(0);
      }
  });

  it('runs on after landing by a share of its carry that falls from the driver to the wedge, on the fairway', () => {
    const run = (id: string) => {
      const f = fly('f', id);
      return (f.rest - f.carry) / f.carry;
    };
    const driver = run('driver'),
      five = run('5-iron'),
      seven = run('7-iron'),
      pitch = run('pitching-wedge'),
      sand = run('sand-wedge');
    // a driver runs on about a fifth of its carry, a mid iron about a tenth, a wedge a twentieth (test/feel.test.ts holds the figures)
    expect(driver).toBeGreaterThan(0.17);
    expect(driver).toBeLessThan(0.26);
    expect(seven).toBeGreaterThan(0.06);
    expect(seven).toBeLessThan(0.13);
    expect(pitch).toBeGreaterThan(0.02);
    expect(pitch).toBeLessThan(0.08);
    expect(driver).toBeGreaterThan(five);
    expect(five).toBeGreaterThan(seven);
    expect(seven).toBeGreaterThan(pitch);
    expect(pitch).toBeGreaterThanOrEqual(sand - 0.005);
  });

  it('runs on hardly at all in the rough or the sand, and further on the green than on the fairway', () => {
    const run = (surface: 'f' | 'r' | 'g' | 's', id: string) => {
      const f = fly(surface, id, 1, true);
      return f.rest - f.carry;
    };
    for (const id of ['driver', '7-iron', 'pitching-wedge']) {
      // struck from the surface it lands on, which takes speed off in the rough and the sand as well
      expect(run('r', id), `${id} in the rough`).toBeLessThan(4);
      expect(run('s', id), `${id} in the sand`).toBeLessThan(3);
      expect(run('g', id), `${id} on the green`).toBeGreaterThan(run('f', id) - 1);
    }
  });

  it('hops by the surface’s bounce: a landing is followed by a smaller one, and the fairway hops more than sand', () => {
    const f = fly('f', '7-iron', 1, true),
      s = fly('s', '7-iron', 1, true);
    expect(f.landings.length, 'the fairway hops').toBeGreaterThan(1);
    expect(f.landings[1]).toBeLessThan(f.landings[0]);
    expect(s.landings.length, 'sand does not').toBeLessThanOrEqual(2);
    expect(SURFACES[LIE.fairway].bounce).toBeGreaterThan(SURFACES[LIE.sand].bounce);
  });

  it('is told of only by landings, whatever the club and the power: none softer than a landing is, on any surface', () => {
    // a hop chain steps down by its bounce a time, so how hard the last of it comes down depends on where it began, and
    // some chains end with a touch that is not a landing: sweeping the power finds them
    let all = 0,
      soft = 0;
    for (const surface of ['f', 'g'] as const)
      for (const club of BAG.slice(0, -1))
        for (let power = 0.05; power <= 1.0001; power += 0.05) {
          const { game, told } = golfGame(field(surface));
          game.pick(club.id);
          game.shoot(NORTH, power);
          for (let f = 0; f < 60 * 30 && !(f > 1 && game.ready); f++) game.step(DT);
          for (const t of told.filter((t) => t.startsWith('landed '))) {
            all++;
            if (Number(t.split(' ')[3]) < LANDING.least) soft++;
          }
        }
    expect(all, 'a good many landings told').toBeGreaterThan(300);
    expect(soft, 'and none of them a touch softer than a landing').toBe(0);
  });

  it('is the same for a seed: the same swing from the same seed lands in the same place', () => {
    const shot = (seed: number) => {
      const { game } = golfGame(field('f'), seeded(seed));
      game.pick('driver');
      game.shoot(NORTH, 1);
      for (let f = 0; f < 60 * 20 && !(f > 1 && game.ready); f++) game.step(DT);
      return [game.world.x[game.ball], game.world.y[game.ball]];
    };
    expect(shot(21)).toEqual(shot(21));
    expect(shot(21)).not.toEqual(shot(22));
  });

  it('is scattered more the harder it is struck: a full swing lands wider of the line than a gentle one', () => {
    const wide = (power: number) => {
      let sum = 0;
      for (let seed = 1; seed <= 24; seed++) {
        const { game } = golfGame(field('f'), seeded(seed));
        game.pick('driver');
        const x0 = game.world.x[game.ball];
        game.shoot(NORTH, power);
        for (let f = 0; f < 60 * 20 && !(f > 1 && game.ready); f++) game.step(DT);
        sum += Math.abs(game.world.x[game.ball] - x0) / (game.world.y[game.ball] - game.layout.tee.y);
      }
      return sum / 24;
    };
    expect(wide(1)).toBeGreaterThan(wide(0.3) * 1.5);
  });
});

describe('a lie', () => {
  it('takes distance off a shot from the rough by about the square of what it takes off the speed', () => {
    const tee = fly('f', '7-iron', 1, true),
      rough = fly('r', '7-iron', 1, true);
    const expected = SURFACES[LIE.rough].power ** 2;
    expect(rough.carry / tee.carry).toBeGreaterThan(expected * 0.85);
    expect(rough.carry / tee.carry).toBeLessThan(expected * 1.15);
  });

  it('takes more from the sand, and sends the ball higher and shorter than the rough does', () => {
    const rough = fly('r', 'sand-wedge', 1, true),
      sand = fly('s', 'sand-wedge', 1, true),
      fair = fly('f', 'sand-wedge', 1, true);
    expect(sand.carry).toBeLessThan(rough.carry);
    expect(rough.carry).toBeLessThan(fair.carry);
    // steeper, so longer in the air for the distance
    expect(sand.air / sand.carry).toBeGreaterThan(fair.air / fair.carry);
  });

  it('is the putter’s along the ground, whatever it is struck from, and slowed by the surface: the rough holds it', () => {
    const green = fly('g', 'putter', 1, true),
      rough = fly('r', 'putter', 1, true);
    expect(green.landings.length, 'a putt does not fly').toBe(0);
    expect(rough.rest).toBeLessThan(green.rest / 2);
  });
});

describe('a landing on a slope', () => {
  /**
   * A field flat at the tee and rising to the north by `rise` a tile from twenty tiles up, so a ball struck north comes
   * down on a slope that faces south. Terrain runs row by row from the south, and a hill face is what a fairway has.
   */
  const hill = (rise: number) => {
    const rows = 130,
      cols = 41;
    const heights = new Float32Array(rows * cols);
    for (let r = 0; r < rows; r++) for (let c = 0; c < cols; c++) heights[r * cols + c] = Math.max(0, r - 20) * rise;
    return field('f', rows, cols, heights);
  };

  /** Where a 7-iron struck at 0.6 from the tee comes down, and where it rests, along the field. */
  const flightOnHill = (rise: number) => {
    const { game, told } = golfGame(hill(rise));
    game.pick('7-iron');
    game.shoot(NORTH, 0.6);
    for (let f = 0; f < 60 * 40 && !(f > 1 && game.ready); f++) {
      game.step(DT);
      expect(checkInvariants(game), `frame ${f}`).toEqual([]);
    }
    const landing = told.find((t) => t.startsWith('landed '))!.split(' ');
    return {
      landed: Number(landing[2]),
      rest: game.world.y[game.ball],
      ready: game.ready,
      foot: game.layout.originY + 20 * TILE,
    };
  };

  it('rolls back down a slope steeper than the fairway holds a ball, and stays on one that is not', () => {
    // 1.0 a tile is 18 degrees, past the 16.6 the fairway holds; 0.5 a tile is 9
    const steep = flightOnHill(1.0),
      gentle = flightOnHill(0.5);
    expect(steep.landed, 'it came down on the slope').toBeGreaterThan(steep.foot);
    expect(steep.rest, 'rolled downhill, toward the tee').toBeLessThan(steep.landed - 6);
    expect(gentle.rest - gentle.landed, 'stayed about where it came down').toBeGreaterThan(-1);
    expect(gentle.rest - gentle.landed).toBeLessThan(8);
    expect(gentle.ready).toBe(true);
  });
});

describe('a putt up a slope', () => {
  /**
   * A putting green rising to the north by `rise` a tile from the tee's box up, as a contoured green does at its steepest:
   * a ball struck flat into a face that leans toward it is going into the ground by its speed times the slope, which at the
   * putter's hardest and a tenth of a slope is more than a landing's least, and a landing is scrubbed.
   */
  const uphill = (rise: number, power: number) => {
    const rows = 130,
      cols = 41;
    const heights = new Float32Array(rows * cols);
    for (let r = 0; r < rows; r++) for (let c = 0; c < cols; c++) heights[r * cols + c] = Math.max(0, r - 6) * rise;
    const { game, told } = golfGame(field('g', rows, cols, heights));
    game.pick('putter');
    // the tee is in a box of its own: the ball is struck from where the slope has begun
    game.place(game.layout.tee.x, game.layout.tee.y + 8 * TILE);
    const y0 = game.world.y[game.ball];
    expect(game.shoot(NORTH, power)).toBe(true);
    for (let f = 0; f < 60 * 40 && !(f > 1 && game.ready); f++) game.step(DT);
    return { run: game.world.y[game.ball] - y0, landings: told.filter((t) => t.startsWith('landed ')).length };
  };

  it('is not a landing, and is slowed by the slope and the green and nothing else, up a tenth of a slope at its hardest', () => {
    // the putter's hardest speed is 40: up a slope of 0.3 a tile, which is a tenth, it goes into the ground by about 4 a second
    const up = uphill(0.3, 1),
      level = uphill(0, 1);
    expect(up.landings, 'it never came down').toBe(0);
    // v squared over twice what slows it, which is the green's roll and the slope's pull (g times the sine of a tenth is 7)
    const slows = 16 + 70 * Math.sin(Math.atan(0.1));
    expect(up.run).toBeGreaterThan((40 * 40) / (2 * slows) - 3);
    expect(up.run).toBeLessThan(level.run);
  });
});
