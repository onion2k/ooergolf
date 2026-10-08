/** The moving things on a hole, where each is at any moment of game time: the barrier, the windmill's gate, and the belt. */
import { describe, expect, it } from 'vitest';
import { BALL, KIND_RADIUS, TILE, layoutOf } from '../src/arena';
import { COURSE, CUP, type HoleDef } from '../src/course';
import { Obstacles, WINDMILL, type ObstacleDef } from '../src/obstacles';
import { Autopilot } from '../src/autopilot';
import { checkInvariants } from '../src/invariants';
import { terrainRefusal } from '../src/physics';
import { DT, newGame, settle } from './helpers';

const MAP = ['#########', '#...C...#', '#.......#', '###.#####', '#.......#', '#.......#', '#...T...#', '#########'];
const layout = layoutOf(MAP);
const tileX = (col: number) => layout.originX + (col + 0.5) * TILE;
const tileY = (row: number) => layout.originY + (layout.rows - 1 - row + 0.5) * TILE;

describe('a sliding barrier', () => {
  const def: ObstacleDef = { kind: 'barrier', at: [4, 5], length: 2, travel: 2.8, period: 4 };
  const o = new Obstacles([def], layout);
  const [box] = o.pushers;

  it('stands where it is put, across the line up the hole, and goes to and fro by its travel over its period', () => {
    o.update(0, 1 / 60);
    expect(box.x).toBeCloseTo(tileX(4), 6);
    expect(box.y).toBeCloseTo(tileY(5), 6);
    expect(box.hx).toBeCloseTo(TILE, 6);
    let least = Infinity,
      most = -Infinity;
    for (let t = 0; t < 4; t += 0.01) {
      o.update(t, 0.01);
      least = Math.min(least, box.x);
      most = Math.max(most, box.x);
    }
    expect(most - tileX(4)).toBeCloseTo(2.8, 2);
    expect(tileX(4) - least).toBeCloseTo(2.8, 2);
    o.update(1.23, 1 / 60);
    const x = box.x;
    o.update(1.23 + 4, 1 / 60);
    expect(box.x, 'the same a period later').toBeCloseTo(x, 6);
  });

  it('says how fast it goes, as the physics needs to shove a ball with it', () => {
    const dt = 1 / 60;
    o.update(0.7 - dt, dt);
    const before = box.x;
    o.update(0.7, dt);
    expect(box.vx).toBeCloseTo((box.x - before) / dt, 1);
    expect(box.vy).toBe(0);
  });

  it('never closes the gap to the rail to less than the ball can pass through', () => {
    for (let t = 0; t < 4; t += 0.01) {
      o.update(t, 0.01);
      const gap = Math.min(box.x - box.hx - layout.bounds.minX, layout.bounds.maxX - (box.x + box.hx));
      expect(gap).toBeGreaterThan(KIND_RADIUS[BALL] * 2 + 0.2);
    }
  });
});

describe('a windmill', () => {
  const def: ObstacleDef = { kind: 'windmill', at: [3, 3], period: 4 };
  const o = new Obstacles([def], layout);
  const [gate] = o.pushers;
  const door = { x: tileX(3), y: tileY(3) };

  it('blocks its door at the height of the ball when a blade points down', () => {
    o.update(0, 1 / 60);
    expect(o.windmills[0].turn, 'a blade straight down at the start').toBeCloseTo(0, 6);
    expect(Math.abs(gate.x - door.x)).toBeLessThan(0.01);
    expect(gate.hx).toBeGreaterThan(0.5);
    expect(gate.z - gate.hz, 'down to near the grass').toBeLessThan(0.6);
    expect(gate.z + gate.hz, 'up past the top of the ball').toBeGreaterThanOrEqual(KIND_RADIUS[BALL] * 2);
    expect(Math.abs(gate.y - (door.y + WINDMILL.hub[1])), 'at the blades, in front of the door').toBeLessThan(0.01);
  });

  it('leaves the door clear when the blades are across it, a quarter of a blade turn on', () => {
    // four blades: straight down again every quarter turn, and clearest half way between
    o.update(4 / 8, 1 / 60);
    expect(gate.z - gate.hz, 'the gate out of the ball’s way').toBeGreaterThan(KIND_RADIUS[BALL] * 2);
    o.update(4 / 4, 1 / 60);
    expect(Math.abs(gate.x - door.x), 'a blade down again a quarter turn on').toBeLessThan(0.01);
  });

  it('sweeps across the door as a blade comes down and goes up, and says how fast', () => {
    const dt = 1 / 120;
    const xs: number[] = [];
    for (let t = -0.3; t <= 0.3; t += 0.05) {
      o.update(t - dt, dt);
      const x0 = gate.x;
      o.update(t, dt);
      if (gate.z - gate.hz < 2) {
        xs.push(gate.x);
        expect(gate.vx, `at ${t.toFixed(2)}`).toBeCloseTo((gate.x - x0) / dt, 0);
      }
    }
    expect(xs.length).toBeGreaterThan(4);
    expect(xs[xs.length - 1] - xs[0], 'it has swept across').not.toBeCloseTo(0, 0);
  });
});

describe('a conveyor', () => {
  it('lays a belt from one tile to another, a tile wide, carrying toward the far end', () => {
    const o = new Obstacles([{ kind: 'conveyor', from: [4, 5], to: [4, 4], speed: 6 }], layout);
    const [belt] = o.belts;
    expect(belt.dx).toBeCloseTo(0, 6);
    expect(belt.dy).toBeCloseTo(1, 6);
    expect(belt.speed).toBe(6);
    expect(belt.cx).toBeCloseTo(tileX(4), 6);
    expect(belt.cy).toBeCloseTo((tileY(5) + tileY(4)) / 2, 6);
    expect(belt.half).toBeCloseTo(TILE, 6);
    expect(belt.width, 'the full width of a tile').toBeCloseTo(TILE, 6);
    expect(o.pushers).toEqual([]);
  });
});

describe('the order the things are listed in', () => {
  // The Mill Race lists its barrier before its windmill; the same hole with the two swapped must move the same boxes
  const race = COURSE.find((h) => h.name === 'The Mill Race')!;
  const layout = layoutOf(race.map);
  const swapped = [...race.obstacles!].sort((a, b) => (a.kind === 'windmill' ? -1 : b.kind === 'windmill' ? 1 : 0));

  it('moves each barrier’s own box and each windmill’s own gate, whichever is listed first', () => {
    expect(swapped[0].kind).toBe('windmill');
    const given = new Obstacles(race.obstacles!, layout);
    const other = new Obstacles(swapped, layout);
    for (const t of [0.3, 1.7, 2.9, 5.2]) {
      given.update(t, DT);
      other.update(t, DT);
      // a barrier's box is a tile along its slide from its middle, never parked in the sky; a windmill's gate is at its door
      for (const o of [given, other]) {
        for (const b of o.barriers) {
          const p = b.pusher;
          expect(o.pushers, `t ${t}: the barrier's box is one the physics has`).toContain(p);
          expect(Math.abs(p.x - b.x), `t ${t}: the barrier's box within its travel`).toBeLessThanOrEqual(
            b.def.travel + 1e-9,
          );
          expect(p.z, `t ${t}: the barrier's box on the ground`).toBeLessThan(10);
        }
        for (const w of o.windmills)
          expect(o.pushers, `t ${t}: the windmill's gate is one the physics has`).toContain(w.pusher);
      }
      // and the two holes agree, box for box, by what each box is
      const boxes = (o: Obstacles) =>
        [...o.barriers.map((b) => b.pusher), ...o.windmills.map((w) => w.pusher)].map((p) =>
          [p.x, p.y, p.z, p.hx, p.vx].map((n) => n.toFixed(6)).join(),
        );
      expect(boxes(other), `t ${t}`).toEqual(boxes(given));
    }
  });

  it('keeps the rule that each box is its own thing’s, through a round on the swapped hole', () => {
    const { game } = newGame(1, null, [{ ...race, obstacles: swapped }]);
    const pilot = new Autopilot(game);
    for (let f = 0; f < 60 * 30 && game.phase !== 'over'; f++) {
      pilot.step(DT);
      if (f % 10 === 0) expect(checkInvariants(game), `frame ${f}`).toEqual([]);
    }
    expect(game.phase).toBe('over');
  });
});

describe('a conveyor on a slope', () => {
  // The Lift (a hole of The Fair, cut on 8 October 2026) was to be a belt up a ramp, and was drawn level; this is what
  // settled that it was the scene, which draws a belt at the grass's height, and not the physics, that made it so
  const map = ['#######', '#..C..#', ...Array.from({ length: 8 }, () => '#.....#'), '#..T..#', '#######'];
  const terrain = [
    '3333333',
    '3333333',
    '3333333',
    '3333333',
    '3333333',
    '2222222',
    '1111111',
    '0000000',
    '0000000',
    '0000000',
    '0000000',
    '0000000',
  ];
  const ramp: HoleDef = {
    name: 'A belt up a ramp',
    par: 3,
    map,
    terrain,
    obstacles: [{ kind: 'conveyor', from: [3, 9], to: [3, 4], speed: 5 }],
  };

  it('is not refused, by the physics or by the obstacles, which refuse only a barrier and a windmill', () => {
    const layout = layoutOf(map, terrain);
    expect(terrainRefusal(layout, CUP)).toBeNull();
    expect(() => new Obstacles(ramp.obstacles!, layout)).not.toThrow();
    const barrier: ObstacleDef = { kind: 'barrier', at: [3, 6], length: 1, travel: 2, period: 4 };
    expect(() => new Obstacles([barrier], layout), 'where a barrier on the same ground is').toThrow(/slopes/);
  });

  it('carries a ball up it, to the top, at the belt’s own speed', () => {
    const { game } = newGame(1, null, [ramp]);
    game.place(0, -9);
    const y0 = game.world.y[game.ball];
    const z0 = game.world.z[game.ball];
    settle(game, 60 * 2);
    // two seconds at five a second, less the first moments' gathering
    expect(game.world.y[game.ball] - y0).toBeGreaterThan(8);
    expect(game.world.z[game.ball] - z0, 'and it has risen').toBeGreaterThan(0.5);
    settle(game, 60 * 3);
    expect(game.world.y[game.ball], 'past the belt, on the top').toBeGreaterThan(5);
  });
});
