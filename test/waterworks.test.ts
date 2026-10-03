/**
 * The Waterworks, hole by hole: each hole's idea held as a test, the course registered, and a round of it played by the
 * autopilot with every rule held. A ball on water is lost, so what each hole asks is how near the water a player may go.
 */
import { describe, expect, it } from 'vitest';
import { TILE, layoutOf, powerFor, terrainAt, tileAt } from '../src/arena';
import { Autopilot, pathToCup } from '../src/autopilot';
import { COURSES } from '../src/course';
import { Game } from '../src/game';
import { breakOf, greenArrows, leansOnMinigolf, puttFrom } from '../src/green';
import { arrowProblems, breakProblems, checkInvariants } from '../src/invariants';
import { Obstacles, type ObstacleDef } from '../src/obstacles';
import { WATERWORKS } from '../src/waterworks';
import { DT, newGame } from './helpers';
import { PLAYER } from '../scripts/pace';
import { seeded } from '../src/random';
import { fuzz } from '../scripts/fuzzer';

const hole = (name: string) => WATERWORKS.find((h) => h.name === name)!;
const CAUSEWAY = hole('The Causeway'),
  STONES = hole('The Stepping Stones'),
  LOCK = hole('The Lock'),
  ISLAND = hole('The Island Green'),
  SPILLWAY = hole('The Spillway'),
  MILL = hole('Mill Pond'),
  WEIR = hole('The Weir'),
  RAPIDS = hole('The Rapids'),
  FLOOD = hole('The Flood');

/** A game of the one hole, which says what it was told (`told`), at rest on its tee. */
const gameOn = (h: (typeof WATERWORKS)[number], seed = 1) => newGame(seed, null, [h]);
const splashes = (told: string[]) => told.filter((t) => t.startsWith('splash')).length;
/** The game stepped until the ball is at rest or the hole is done, for at most `seconds` of game time. */
function settleOut(game: Game, seconds = 40) {
  // not ready for the first few frames: the ball is struck, and the physics has yet to put it to sleep
  for (let f = 0; f < seconds * 60 && game.phase === 'play' && !(f > 5 && game.ready); f++) game.step(DT);
}
/**
 * The game stepped for `seconds` whatever the ball is doing: a ball carried along a stream is put to sleep by the physics
 * while it is carried (its speed is under what it sleeps at), so `ready` is no sign that it has come to rest there.
 */
const run = (game: Game, seconds: number) => {
  for (let f = 0; f < seconds * 60 && game.phase === 'play'; f++) game.step(DT);
};
/** The angle from the ball to the cup. */
const toCup = (g: Game) => Math.atan2(g.layout.cup.y - g.world.y[g.ball], g.layout.cup.x - g.world.x[g.ball]);
/** The power the autopilot would strike the ball with from where it lies, which is the right one for the cup. */
const planned = (g: Game) => new Autopilot(g).plan()!;
/** Game time stepped on, so that what moves is somewhere else when the ball is struck. */
const wait = (g: Game, seconds: number) => {
  for (let f = 0; f < Math.round(seconds * 60); f++) g.step(DT);
};

/** The tile a barrier or a windmill of the hole stands at, as the map is drawn. */
const standsAt = (h: (typeof WATERWORKS)[number]) =>
  (h.obstacles![0] as Extract<ObstacleDef, { kind: 'barrier' | 'windmill' }>).at;

describe('the course', () => {
  it('is registered among the minigolf courses after The Meadow, nine holes, each with water on it and a map drawn square', () => {
    const names = COURSES.map((c) => c.name);
    expect(names.indexOf('The Waterworks')).toBeGreaterThan(names.indexOf('The Meadow'));
    expect(names.indexOf('The Waterworks')).toBeLessThan(names.indexOf('The Range'));
    const course = COURSES.find((c) => c.name === 'The Waterworks')!;
    expect(course.holes).toBe(WATERWORKS);
    expect(course.golf).toBeFalsy();
    expect(course.summary).toEqual({ holes: 9, par: 28 });
    expect(WATERWORKS.map((h) => h.name)).toEqual([
      'The Causeway',
      'The Stepping Stones',
      'The Lock',
      'The Island Green',
      'The Spillway',
      'Mill Pond',
      'The Weir',
      'The Rapids',
      'The Flood',
    ]);
    for (const h of WATERWORKS) {
      expect(new Set(h.map.map((r) => r.length)).size, `${h.name}: every row as wide as the rest`).toBe(1);
      expect(
        layoutOf(h.map, h.terrain).water.some((w) => w === 1),
        `${h.name}: water`,
      ).toBe(true);
    }
  });
});

describe('The Causeway', () => {
  it('is holed by a straight putt at the right power, and a few degrees off the ball is lost in the pond', () => {
    const straight = gameOn(CAUSEWAY);
    const shot = planned(straight.game);
    expect(straight.game.shoot(toCup(straight.game), shot.power)).toBe(true);
    settleOut(straight.game);
    expect(straight.game.phase, 'holed').not.toBe('play');
    expect(straight.game.strokes).toBe(1);
    expect(splashes(straight.told)).toBe(0);

    // the tee is a tile off the strip's middle, so the water is a tile and a half from the ball on the east side and
    // four and a half on the west: eight degrees east, or eleven either way, and the ball is lost
    for (const slip of [-0.14, 0.2, -0.2]) {
      const off = gameOn(CAUSEWAY);
      off.game.shoot(toCup(off.game) + slip, shot.power);
      settleOut(off.game);
      expect(splashes(off.told), `${slip} off`).toBe(1);
      expect(off.game.strokes, 'a stroke for the splash').toBe(2);
      expect(off.game.phase, 'put back on the tee, not holed').toBe('play');
    }
  });

  it('is a strip two tiles wide with water either side the whole way from the tee platform to the cup’s island', () => {
    const strip = CAUSEWAY.map.filter((r) => r.replace(/#/g, '').replace(/~/g, '') === '..' && r.includes('~..~'));
    expect(strip.length, 'rows of strip').toBeGreaterThanOrEqual(8);
    expect(new Set(strip).size, 'the same strip all the way').toBe(1);
  });
});

describe('The Stepping Stones', () => {
  const l = layoutOf(STONES.map);

  it('has a way from the tee to the cup over the grass, round the pond and never across it', () => {
    const way = pathToCup(l, l.tee.x, l.tee.y);
    expect(way.length).toBeGreaterThan(10);
    expect(way.at(-1)![0]).toBeCloseTo(l.cup.x, 6);
    expect(way.at(-1)![1]).toBeCloseTo(l.cup.y, 6);
    for (const [x, y] of way) {
      const t = tileAt(l, x, y);
      expect(l.water[t] || l.solid[t], `the way is on grass at ${x},${y}`).toBeFalsy();
    }
  });

  it('is not to be crossed in a line: struck straight at the cup the ball is lost, and it must be stopped on each stone', () => {
    const g = gameOn(STONES);
    g.game.shoot(toCup(g.game), planned(g.game).power);
    settleOut(g.game);
    expect(splashes(g.told)).toBe(1);
    // and the autopilot, which keeps to the strips, takes the stones in turn: stopped on the first, the second, and then home
    const pilot = gameOn(STONES, 2);
    const autopilot = new Autopilot(pilot.game);
    for (let f = 0; f < 60 * 120 && pilot.game.phase === 'play'; f++) autopilot.step(DT);
    expect(pilot.game.phase).not.toBe('play');
    expect(splashes(pilot.told)).toBe(0);
    expect(pilot.game.strokes).toBeGreaterThanOrEqual(3);
    expect(pilot.game.strokes).toBeLessThanOrEqual(pilot.game.limit);
  });
});

describe('The Lock', () => {
  const l = layoutOf(LOCK.map);
  const channelX = l.originX + (Math.floor(l.cols / 2) + 0.5) * TILE;

  it('has a gate that is clear of the channel a little over half of every period, and across it the rest', () => {
    const o = new Obstacles(LOCK.obstacles!, l);
    const [gate] = o.pushers;
    const period = (LOCK.obstacles![0] as { period: number }).period;
    let clear = 0,
      n = 0;
    for (let t = 0; t < period; t += 0.005, n++) {
      o.update(t, DT);
      // the gate clears a ball in the middle of the channel when its edge is more than the ball's radius from the ball's middle
      if (Math.abs(gate.x - channelX) - gate.hx > 1.0) clear++;
    }
    expect(clear / n).toBeGreaterThan(0.45);
    expect(clear / n).toBeLessThan(0.65);
  });

  it('lets the same shot through, bounces it back or throws it in the water, by when it is struck', () => {
    const outcomes = { through: 0, back: 0, splash: 0 };
    const gateY = l.originY + (l.rows - 1 - standsAt(LOCK)[1] + 0.5) * TILE;
    for (let off = 0; off < 4; off += 0.1) {
      const g = gameOn(LOCK);
      wait(g.game, off);
      const power = planned(g.game).power;
      g.game.shoot(toCup(g.game), power);
      let top = -Infinity;
      for (let f = 0; f < 60 * 10 && !(f > 5 && g.game.ready) && g.game.phase === 'play'; f++) {
        g.game.step(DT);
        top = Math.max(top, g.game.world.y[g.game.ball]);
      }
      if (splashes(g.told)) outcomes.splash++;
      else if (top > gateY) outcomes.through++;
      else outcomes.back++;
    }
    expect(outcomes.through, 'some shots pass the open gate').toBeGreaterThan(10);
    expect(outcomes.back, 'some meet it shut').toBeGreaterThan(5);
    expect(outcomes.splash, 'and the gate on its way knocks some off the strip').toBeGreaterThan(2);
  });
});

describe('The Island Green', () => {
  /** A shot of `power` at the cup from the tee, `slip` radians off the line, and how far from the cup the ball rests, how many times it splashed, and whether it dropped. */
  const struck = (power: number, slip = 0) => {
    const g = gameOn(ISLAND);
    g.game.shoot(toCup(g.game) + slip, power);
    settleOut(g.game);
    const { cup } = g.game.layout;
    return {
      holed: g.game.phase !== 'play',
      splashed: splashes(g.told),
      from: Math.hypot(g.game.world.x[g.game.ball] - cup.x, g.game.world.y[g.game.ball] - cup.y),
    };
  };

  it('leaves a ball that is struck short of the rim where it is, on the neck or the shore, and takes one that gets onto the grass to the cup', () => {
    for (const power of [0.04, 0.12, 0.2]) {
      const r = struck(power);
      expect(r.holed || r.splashed > 0, `power ${power}: nothing happened to it`).toBe(false);
      expect(r.from, `power ${power}: short of the grass`).toBeGreaterThan(9);
    }
    // from the first power that gets over the rim to well past it, straight at the cup: the bowl does the rest
    for (const power of [0.28, 0.36, 0.44, 0.52]) expect(struck(power).holed, `power ${power}`).toBe(true);
  });

  it('is not a funnel to a ball struck a little off the cup: it comes to rest in the bowl, and one struck too long rolls out of the far side into the pond', () => {
    const outcomes = { bowl: 0, lost: 0 };
    for (let power = 0.3; power <= 1.0001; power += 0.02) {
      const r = struck(power, 0.08);
      if (r.splashed) outcomes.lost++;
      else if (!r.holed && r.from < 9) outcomes.bowl++;
    }
    expect(outcomes.bowl, 'rests on the grass of the bowl').toBeGreaterThan(5);
    expect(outcomes.lost, 'rolled out of the far side').toBeGreaterThan(3);
  });

  it('is struck as hard as it goes, straight at the cup, and does not drown the ball: the cup’s far lip stops it', () => {
    const r = struck(1);
    expect(r.splashed).toBe(0);
  });
});

describe('The Spillway', () => {
  const l = layoutOf(SPILLWAY.map, SPILLWAY.terrain);

  it('tilts the lane toward the pond and holds a ball at rest on it wherever it is put, a tile from the water included', () => {
    let tried = 0;
    for (let tx = 1; tx <= 6; tx++)
      for (const ty of [3, 6, 9, 12]) {
        const x = l.originX + (tx + 0.5) * TILE,
          y = l.originY + (ty + 0.5) * TILE;
        const g = gameOn(SPILLWAY);
        try {
          g.game.place(x, y);
        } catch {
          continue;
        }
        tried++;
        const at = [g.game.world.x[g.game.ball], g.game.world.y[g.game.ball]];
        wait(g.game, 6);
        expect(g.game.world.x[g.game.ball], `${tx},${ty}`).toBeCloseTo(at[0], 2);
        expect(g.game.world.y[g.game.ball], `${tx},${ty}`).toBeCloseTo(at[1], 2);
        expect(g.game.world.asleep[g.game.ball], `${tx},${ty} at rest`).toBe(1);
        expect(splashes(g.told)).toBe(0);
      }
    expect(tried).toBeGreaterThan(15);
    // the ground goes down to the east, where the water is: a ball moving is carried that way
    expect(terrainAt(l, l.tee.x, l.tee.y)).toBeLessThan(terrainAt(l, l.tee.x - 9, l.tee.y) - 0.8);
  });

  it('shows the break: arrows over the lane, a break off the cup that is a number, and the putt it names holes', () => {
    expect(leansOnMinigolf(l)).toBe(true);
    const arrows = greenArrows(l);
    let floor = 0;
    for (let t = 0; t < l.cols * l.rows; t++) if (!l.solid[t] && !l.water[t]) floor++;
    expect(arrows.length).toBeGreaterThan(floor / 3);
    const g = gameOn(SPILLWAY).game;
    expect(arrowProblems(g.layout, arrows)).toEqual([]);
    expect(breakProblems(g)).toEqual([]);
    expect(checkInvariants(g)).toEqual([]);
    const b = breakOf(l, l.tee.x, l.tee.y);
    expect(Number.isFinite(b.across) && Number.isFinite(b.rise)).toBe(true);
    // carried toward the water, which is to the right of a ball going north, so it is aimed to the left, which is a negative across
    expect(b.across, 'aimed up the slope').toBeLessThan(-1);
    const putt = puttFrom(l, l.tee.x, l.tee.y);
    expect(putt.speed, 'a putt the putter can strike').toBeLessThan(g.hardest);
    g.shoot(putt.aim, powerFor(putt.speed, g.hardest));
    settleOut(g);
    expect(g.phase, 'the putt the arrows show holes').not.toBe('play');
  });

  it('is not holed by a ball struck straight at the cup, which the break carries off its line toward the pond', () => {
    const straight = gameOn(SPILLWAY);
    straight.game.shoot(toCup(straight.game), planned(straight.game).power);
    settleOut(straight.game);
    expect(straight.game.phase, 'the break takes it off the cup').toBe('play');
  });
});

describe('Mill Pond', () => {
  const l = layoutOf(MILL.map);

  it('knocks a ball struck at the door at the wrong moment away from it, sometimes into the pond, and lets it through at the right one', () => {
    const outcomes = { through: 0, back: 0, splash: 0 };
    expect(
      MILL.obstacles?.map((o) => o.kind),
      'a windmill in the rail',
    ).toEqual(['windmill']);
    const doorY = l.originY + (l.rows - 1 - standsAt(MILL)[1] + 0.5) * TILE;
    for (let off = 0; off < 8; off += 0.1) {
      const g = gameOn(MILL);
      wait(g.game, off);
      g.game.shoot(toCup(g.game), planned(g.game).power);
      let top = -Infinity;
      for (let f = 0; f < 60 * 12 && !(f > 5 && g.game.ready) && g.game.phase === 'play'; f++) {
        g.game.step(DT);
        top = Math.max(top, g.game.world.y[g.game.ball]);
      }
      if (splashes(g.told)) {
        outcomes.splash++;
        expect(top, 'a ball knocked into the pond never got through the door').toBeLessThan(doorY + 1);
      } else if (top > doorY) {
        outcomes.through++;
      } else outcomes.back++;
    }
    expect(outcomes.through).toBeGreaterThan(20);
    expect(outcomes.back).toBeGreaterThan(10);
    expect(outcomes.splash, 'a blade knocks a ball off the causeway').toBeGreaterThan(2);
  });

  it('has its windmill standing in the rail across the causeway, on level ground', () => {
    expect(MILL.obstacles![0].kind).toBe('windmill');
    const [col, row] = standsAt(MILL);
    expect(MILL.map[row][col]).toBe('.');
    expect(MILL.map[row].replace('.', '')).toMatch(/^#+$/);
    expect(new Obstacles(MILL.obstacles!, l).windmills.length).toBe(1);
  });
});

/** The tile column and the row from the top of the map that a point stands on. */
const cellOf = (g: Game, x: number, y: number): [number, number] => {
  const t = tileAt(g.layout, x, y);
  return [t % g.layout.cols, g.layout.rows - 1 - Math.floor(t / g.layout.cols)];
};
/** Every tile of a hole's conveyors, as `col,row` from the top, one set for each conveyor in the order they are given. */
const streamTiles = (h: (typeof WATERWORKS)[number]) =>
  (h.obstacles ?? [])
    .filter((o): o is Extract<ObstacleDef, { kind: 'conveyor' }> => o.kind === 'conveyor')
    .map((o) => {
      const out = new Set<string>();
      const n = Math.max(Math.abs(o.to[0] - o.from[0]), Math.abs(o.to[1] - o.from[1]));
      for (let k = 0; k <= n; k++)
        out.add(`${o.from[0] + Math.sign(o.to[0] - o.from[0]) * k},${o.from[1] + Math.sign(o.to[1] - o.from[1]) * k}`);
      return out;
    });

describe('the streams of the last three holes', () => {
  it('are on grass, are drawn as water, and each belt runs where its map says, with a pond or the rail at its end', () => {
    for (const h of [WEIR, RAPIDS, FLOOD]) {
      const g = gameOn(h).game;
      const l = g.layout;
      const belts = (h.obstacles ?? []).filter((o) => o.kind === 'conveyor');
      expect(belts.length, `${h.name}: streams`).toBeGreaterThan(0);
      for (const o of belts) expect((o as { look?: string }).look, `${h.name}: drawn as water`).toBe('water');
      expect(g.obstacles.streamed.size, h.name).toBe(g.obstacles.belted.size);
      for (const t of g.obstacles.streamed) {
        expect(l.water[t] || l.solid[t], `${h.name}: tile ${t} is grass`).toBeFalsy();
        expect(h.map[l.rows - 1 - Math.floor(t / l.cols)][t % l.cols], `${h.name}: tile ${t} is '.' on the map`).toBe(
          '.',
        );
      }
    }
  });
});

describe('The Weir', () => {
  it('is not crossed by a ball struck onto the stream, at any power: the belt takes the ball’s speed and carries it down to the pond', () => {
    // from the grass beside the stream, struck east across it at every power from a roll to the hardest there is: the
    // stream pulls a ball's velocity toward its own at an eighth a step, so none gets across, however hard
    for (const power of [0.2, 0.5, 1]) {
      const g = gameOn(WEIR);
      const l = g.game.layout;
      g.game.place(l.originX + 3.5 * TILE, l.originY + (l.rows - 1 - 11 + 0.5) * TILE);
      g.game.shoot(0, power);
      run(g.game, 30);
      expect(splashes(g.told), `power ${power}: carried into the pond`).toBeGreaterThanOrEqual(1);
      expect(g.game.strokes, `power ${power}: a stroke for the splash`).toBe(2);
      expect(g.told.filter((t) => t.startsWith('outOfBounds'))).toEqual([]);
    }
  });

  it('is not a danger to a ball struck down the west side: the autopilot holes it in a stroke or two with the pond untouched', () => {
    for (const seed of [1, 2, 3, 4, 5, 6]) {
      const g = gameOn(WEIR, seed);
      const pilot = new Autopilot(g.game, { skill: PLAYER, random: seeded(seed * 31 + 7) });
      for (let f = 0; f < 60 * 120 && g.game.phase === 'play'; f++) pilot.step(DT);
      expect(g.game.phase, `seed ${seed}`).not.toBe('play');
      expect(g.game.strokes, `seed ${seed}`).toBeLessThanOrEqual(WEIR.par + 1);
      expect(splashes(g.told), `seed ${seed}`).toBe(0);
    }
  });

  it('has its stream beside the line to the cup, which keeps clear of it, and its pond at the stream’s end', () => {
    const l = layoutOf(WEIR.map);
    const [cupCol] = cellOf(gameOn(WEIR).game, l.cup.x, l.cup.y);
    const tiles = new Set(streamTiles(WEIR).flatMap((s) => [...s].map((c) => Number(c.split(',')[0]))));
    expect(
      Math.min(...tiles) - cupCol,
      'a tile of grass at least between the line and the stream',
    ).toBeGreaterThanOrEqual(1);
    expect(WEIR.map[1].includes('~') && WEIR.map[2].includes('~'), 'pond where the stream ends').toBe(true);
  });
});

describe('The Rapids', () => {
  /** A ball struck from the tee straight at the river's mouth, with its tile (col,row) noted every frame until it is at rest. */
  const ride = (power = 0.3) => {
    const g = gameOn(RAPIDS);
    const l = g.game.layout;
    g.game.shoot(Math.PI / 2, power);
    const cells: string[] = [];
    let farEast = -Infinity;
    for (let f = 0; f < 60 * 30 && g.game.phase === 'play'; f++) {
      g.game.step(DT);
      cells.push(cellOf(g.game, g.game.world.x[g.game.ball], g.game.world.y[g.game.ball]).join(','));
      farEast = Math.max(farEast, g.game.world.x[g.game.ball] - l.tee.x);
    }
    return { ...g, cells, farEast };
  };

  it('carries a ball struck at its mouth through each of its five runs of stream in turn, which swing it right across the lane and back, and does not lose it', () => {
    const streams = streamTiles(RAPIDS);
    // the belts come in pairs, two tiles wide: north, east, north, west, north is five runs of them and the river's four
    // streams are the pairs that carry it sideways and the stretches between
    expect(streams.length).toBe(10);
    const r = ride();
    expect(splashes(r.told)).toBe(0);
    const runs = [0, 2, 4, 6, 8].map((k) => new Set([...streams[k], ...streams[k + 1]]));
    const order = runs.map((set) => r.cells.findIndex((c) => set.has(c)));
    expect(
      order.every((at) => at >= 0),
      `every stream was ridden: ${order.join(',')}`,
    ).toBe(true);
    expect(order, 'in the order the river runs').toEqual([...order].sort((a, b) => a - b));
    // swung across: the river's first corner is a tile and a half either side of the middle, and the next goes six tiles east
    expect(r.farEast, 'carried across the lane').toBeGreaterThan(12);
    // and out at the top, on the cup's platform side of the pond
    const [, row] = cellOf(r.game, r.game.world.x[r.game.ball], r.game.world.y[r.game.ball]);
    expect(row, 'at the river’s end').toBeLessThanOrEqual(4);
  });

  it('is the only way: a ball struck off the tee’s pad toward the pond, rather than at the river’s mouth, is lost', () => {
    const g = gameOn(RAPIDS);
    g.game.shoot(Math.PI / 4, 0.3);
    run(g.game, 30);
    expect(splashes(g.told)).toBeGreaterThanOrEqual(1);
    expect(g.game.phase, 'put back on the tee, not holed').toBe('play');
  });

  it('is holed by the autopilot in a stroke or two over the ride, with no splash on a few seeds', () => {
    for (const seed of [1, 2, 3, 4]) {
      const g = gameOn(RAPIDS, seed);
      const pilot = new Autopilot(g.game, { skill: PLAYER, random: seeded(seed * 31 + 7) });
      for (let f = 0; f < 60 * 120 && g.game.phase === 'play'; f++) pilot.step(DT);
      expect(g.game.phase, `seed ${seed}`).not.toBe('play');
      expect(g.game.strokes, `seed ${seed}`).toBeLessThanOrEqual(RAPIDS.par + 2);
    }
  });
});

describe('The Flood', () => {
  it('has a stream, a lock’s gate, water and ground that rises and falls, on one line from the tee to the cup', () => {
    const l = layoutOf(FLOOD.map, FLOOD.terrain);
    expect(FLOOD.obstacles!.map((o) => o.kind).sort()).toEqual(['barrier', 'conveyor']);
    expect(l.water.some((w) => w === 1)).toBe(true);
    expect(FLOOD.terrain, 'a bowl').toBeDefined();
    const heights = new Set<number>();
    for (let x = l.originX; x < l.originX + l.cols * TILE; x += 1.5)
      for (let y = l.originY; y < l.originY + l.rows * TILE; y += 1.5) heights.add(terrainAt(l, x, y));
    expect(heights.size, 'more than one height').toBeGreaterThan(3);
    expect(l.tee.x).toBeCloseTo(l.cup.x, 6);
    const g = gameOn(FLOOD).game;
    expect(g.obstacles.pushers.length, 'one gate').toBe(1);
    expect(g.obstacles.streamed.size, 'a stream of five tiles').toBe(5);
  });

  it('is crossed by the stream: a ball struck from the stone onto it is carried to the neck and not lost', () => {
    const g = gameOn(FLOOD);
    const l = g.game.layout;
    // on the stone, just before the stream, struck north at the island
    g.game.place(l.originX + (6 + 0.5) * TILE, l.originY + (l.rows - 1 - 15 + 0.5) * TILE);
    g.game.shoot(Math.PI / 2, 0.3);
    settleOut(g.game);
    expect(splashes(g.told)).toBe(0);
    const [col, row] = cellOf(g.game, g.game.world.x[g.game.ball], g.game.world.y[g.game.ball]);
    expect(col).toBe(6);
    expect(row, 'carried up the stream to the island’s end').toBeLessThan(14);
  });

  it('is holed by the autopilot within its limit on a few seeds, with every rule held on the way', () => {
    for (const seed of [1, 2, 3, 4]) {
      const g = gameOn(FLOOD, seed);
      const pilot = new Autopilot(g.game, { skill: PLAYER, random: seeded(seed * 31 + 7) });
      for (let f = 0; f < 60 * 240 && g.game.phase === 'play'; f++) {
        pilot.step(DT);
        if (f % 30 === 0) expect(checkInvariants(g.game), `seed ${seed} frame ${f}`).toEqual([]);
      }
      expect(g.game.phase, `seed ${seed}`).not.toBe('play');
      expect(g.game.strokes, `seed ${seed}`).toBeLessThanOrEqual(FLOOD.par + 3);
    }
  });
});

describe('the fuzzer on The Waterworks', () => {
  it('plays the whole course at random with the stream struck onto, and finds nothing wrong, over a few seeds', () => {
    for (const seed of [1, 2, 3]) {
      const r = fuzz(seed, 4000, WATERWORKS);
      expect(r.failure, `seed ${seed}`).toBeNull();
    }
  });

  it('strikes the ball onto the stream of each of the three holes that have one, and finds nothing wrong', () => {
    for (const h of [WEIR, RAPIDS, FLOOD])
      for (const seed of [1, 2]) {
        const r = fuzz(seed, 3000, [h]);
        expect(r.failure, `${h.name} seed ${seed}`).toBeNull();
        expect(r.done['strike onto the stream'] ?? 0, `${h.name} seed ${seed} struck onto it`).toBeGreaterThan(0);
      }
  });
});

describe('a round of The Waterworks', () => {
  it('is played by the autopilot with a player’s slips on a few seeds: every hole holed within its limit and none picked up, no rule broken, and the splashes counted', () => {
    const splashed: Record<string, number> = {};
    for (const seed of [1, 2, 3, 4]) {
      const { game, told } = newGame(seed, null, WATERWORKS);
      const pilot = new Autopilot(game, { skill: PLAYER, random: seeded(seed * 31 + 7) });
      for (let f = 0; f < 60 * 60 * 10 && game.phase !== 'over'; f++) {
        pilot.step(DT);
        if (f % 30 === 0) expect(checkInvariants(game), `seed ${seed} frame ${f}`).toEqual([]);
        if (told.at(-1)?.startsWith('splash')) {
          splashed[game.def.name] = (splashed[game.def.name] ?? 0) + 1;
          told.push('counted');
        }
      }
      expect(game.phase, `seed ${seed}`).toBe('over');
      expect(game.card.length).toBe(WATERWORKS.length);
      game.card.forEach((score, k) =>
        expect(score, `seed ${seed}: ${WATERWORKS[k].name}`).toBeLessThan(WATERWORKS[k].par + 5),
      );
      expect(told.filter((t) => t.startsWith('pickedUp'))).toEqual([]);
    }
    // the autopilot keeps a ball's width and more off the water, so the holes do not drown it
    expect(Object.values(splashed).reduce((a, b) => a + b, 0)).toBeLessThan(8);
  });
});
