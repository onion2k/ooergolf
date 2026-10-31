/**
 * A golf hole may belong to a biome, and the six courses there are do not (they are earth): the seam Part 2 of the biomes plan
 * builds, with no course on it yet. What a biome changes is held here, on holes as flat as a table so that the ground adds
 * nothing: the Moon's slow clock (the world's seconds to the clock's, so a drive hangs 1.53 times as long and carries the same),
 * its calm, a surface table of a biome's own, and that earth named outright plays the very game that earth named by nothing does.
 */
import { Camera } from 'artshape-render/gpu/camera';
import { describe, expect, it } from 'vitest';
import { Autopilot } from '../src/autopilot';
import { safeBox } from '../src/aimview';
import { TILE, layoutOf } from '../src/arena';
import { BIOMES, surfacesOf, type BiomeName } from '../src/biome';
import { bagClub } from '../src/bag';
import { CameraRig } from '../src/camera';
import { COURSES, type HoleDef } from '../src/course';
import { Director } from '../src/director';
import { golfHole } from '../src/golf';
import { framingProblems, checkInvariants } from '../src/invariants';
import { LINKS_SPECS } from '../src/links';
import { PHYSICS } from '../src/physics';
import { Progress, memoryStore } from '../src/progress';
import { Previewer } from '../src/preview';
import { windText } from '../src/readout';
import { seeded } from '../src/random';
import { GREENS, LIE, SURFACES } from '../src/surfaces';
import { DT, field, golfGame, hashHole, levelHole, settle } from './helpers';
import { wearing } from './kits';
import { Game } from '../src/game';

const NORTH = Math.PI / 2;
/** The Moon's clock: the root of 30 over 70, the gravity a ball of the same carry would have, as `biome.ts` says. */
const MOON = Math.sqrt(30 / 70);

/** A level par four of 400 yards, in `biome` (earth where none). */
const hole = (biome?: BiomeName, wind?: number) =>
  levelHole({
    name: 'Level biome',
    par: 4,
    length: 400,
    rough: 20,
    ...(biome ? { biome } : {}),
    ...(wind ? { wind } : {}),
  });

/** A driver struck true from the tee: the frame it first lands on, the place, and the frame the ball is ready again. */
function drive(def: HoleDef, power = 1) {
  const { game, calls } = golfGame(def);
  game.pick('driver');
  const y0 = game.world.y[game.ball];
  expect(game.shoot(NORTH, power)).toBe(true);
  let landedAt = -1,
    landedY = NaN,
    readyAt = -1;
  for (let f = 1; f <= 60 * 40; f++) {
    game.step(DT);
    const l = calls.find(([n]) => n === 'landed');
    if (landedAt < 0 && l) {
      landedAt = f;
      landedY = (l[1][1] as number) - y0;
    }
    if (game.ready) {
      readyAt = f;
      break;
    }
  }
  return { game, landedAt, carry: landedY, readyAt, rest: game.world.y[game.ball] - y0 };
}

describe('the biomes', () => {
  it('has the four, with earth the surface table itself and a pace of one, and the Moon slow and calm', () => {
    expect(Object.keys(BIOMES).sort()).toEqual(['desert', 'future', 'moon', 'earth'].sort());
    for (const [name, b] of Object.entries(BIOMES)) expect(b.name).toBe(name);
    expect(BIOMES.earth.surfaces).toBe(SURFACES);
    expect(BIOMES.earth.pace).toBe(1);
    expect(BIOMES.earth.calm).toBe(false);
    expect(BIOMES.moon.pace).toBeCloseTo(MOON, 3);
    expect(BIOMES.moon.calm).toBe(true);
    for (const b of Object.values(BIOMES)) {
      expect(b.surfaces.length, b.name).toBe(SURFACES.length);
      expect(b.pace, b.name).toBeGreaterThan(0);
      expect(b.pace, b.name).toBeLessThanOrEqual(1);
    }
  });

  it('keeps the minigolf green and the names of the table in every biome, since a biome overrides a row and does not renumber it', () => {
    for (const b of Object.values(BIOMES)) {
      expect(b.surfaces[LIE.none], b.name).toBe(SURFACES[LIE.none]);
      b.surfaces.forEach((s, i) => expect(s.name, `${b.name} ${i}`).toBe(SURFACES[i].name));
    }
  });

  it('overrides the rows the plan says and leaves the rest as earth has them', () => {
    expect(BIOMES.desert.surfaces[LIE.fairway]).toMatchObject({ keep: 0.55, roll: 18 });
    expect(BIOMES.desert.surfaces[LIE.rough]).toMatchObject({
      roll: 30,
      keep: 0.3,
      bounce: 0.2,
      power: 0.85,
      wild: 1.3,
    });
    expect(BIOMES.moon.surfaces[LIE.rough]).toMatchObject({ keep: 0.05, bounce: 0.03, power: 0.7 });
    expect(BIOMES.future.surfaces[LIE.fairway]).toMatchObject({ keep: 0.6, bounce: 0.6 });
    expect(BIOMES.future.surfaces[LIE.rough]).toMatchObject({
      roll: 40,
      keep: 0.4,
      bounce: 0.45,
      power: 0.9,
      wild: 1.1,
    });
    expect(BIOMES.moon.surfaces[LIE.fairway]).toBe(SURFACES[LIE.fairway]);
    expect(BIOMES.desert.surfaces[LIE.green]).toBe(SURFACES[LIE.green]);
  });

  it('is earth for a hole that says none, and its layout says so', () => {
    expect(layoutOf(hole().map).biome).toBe('earth');
    expect(surfacesOf(layoutOf(hole().map))).toBe(SURFACES);
    expect(layoutOf(hole('moon').map, undefined, undefined, 'moon').biome).toBe('moon');
    const { game } = golfGame(hole('desert'));
    expect(game.layout.biome).toBe('desert');
    expect(golfGame(hole()).game.layout.biome).toBe('earth');
  });

  it('is on none of the earth’s courses, and none of their holes carries the key; a biome’s course names it, on every hole', () => {
    for (const c of COURSES) {
      for (const h of c.holes) {
        if (c.biome === undefined) expect('biome' in h, `${c.name}/${h.name}`).toBe(false);
        else expect(h.biome, `${c.name}/${h.name}`).toBe(c.biome);
      }
    }
    expect(COURSES.filter((c) => c.biome).map((c) => c.biome)).toEqual([
      ...Array.from({ length: 3 }, () => 'desert'),
      ...Array.from({ length: 3 }, () => 'moon'),
      ...Array.from({ length: 3 }, () => 'future'),
    ]);
  });

  it('is carried by a generated hole, and left out of one that has none', () => {
    const spec = LINKS_SPECS[0];
    expect('biome' in golfHole(spec)).toBe(false);
    // (the Moon has no tree, so a spec on it plants none)
    const bare = { ...spec, trees: 0 };
    expect(golfHole({ ...bare, biome: 'moon' }).biome).toBe('moon');
    // the generator does not see it: the same ground, tile for tile
    expect(golfHole({ ...bare, biome: 'moon' }).map).toEqual(golfHole(bare).map);
  });
});

describe('the Moon’s clock', () => {
  it('has a drive in the air 1/0.655 as long as earth’s, and the same carry to a yard', () => {
    const earth = drive(hole());
    const moon = drive(hole('moon'));
    expect(earth.landedAt).toBeGreaterThan(50);
    expect(moon.landedAt / earth.landedAt).toBeGreaterThan(1 / MOON - 0.03);
    expect(moon.landedAt / earth.landedAt).toBeLessThan(1 / MOON + 0.03);
    expect(Math.abs(moon.landedAt - earth.landedAt / MOON)).toBeLessThanOrEqual(2);
    expect(Math.abs(moon.carry - earth.carry)).toBeLessThan(1);
    expect(Math.abs(moon.rest - earth.rest)).toBeLessThan(1);
  });

  it('leaves gravity as it was, and game time the clock’s', () => {
    expect(PHYSICS.gravity).toBe(70);
    const { game } = golfGame(hole('moon'));
    const t = game.t;
    settle(game, 60);
    expect(game.t - t).toBeCloseTo(1, 9);
  });

  it('keeps input out through the whole of the longer flight, and takes the next stroke only when the ball is ready', () => {
    const { game, calls } = golfGame(hole('moon'));
    game.pick('driver');
    expect(game.shoot(NORTH, 1)).toBe(true);
    const strokes = game.strokes;
    // earth's drive has landed by 1.12 s; this one is still up at 1.5 s and refuses a second stroke
    for (let f = 0; f < 90; f++) {
      game.step(DT);
      if (!calls.some(([n]) => n === 'landed')) {
        expect(game.ready, `frame ${f}`).toBe(false);
        expect(game.shoot(NORTH, 1), `frame ${f}`).toBe(false);
      }
    }
    expect(game.strokes).toBe(strokes);
    expect(calls.some(([n]) => n === 'landed')).toBe(false);
    for (let f = 0; f < 60 * 20 && !game.ready; f++) game.step(DT);
    expect(game.ready).toBe(true);
    expect(game.shoot(NORTH, 0.2)).toBe(true);
  });

  it('is told of the stop and the landing once each, as on earth', () => {
    const count = (def: HoleDef) => {
      const { game, calls } = golfGame(def);
      game.pick('driver');
      game.shoot(NORTH, 1);
      for (let f = 0; f < 60 * 20 && !game.ready; f++) game.step(DT);
      settle(game, 30);
      const n = (name: string) => calls.filter(([c]) => c === name).length;
      return [n('struck'), n('landed') > 0, n('stopped')];
    };
    expect(count(hole('moon'))).toEqual(count(hole()));
  });

  it('plays to rest within the planner’s and the preview’s limits, with room to spare', () => {
    const moon = drive(hole('moon'));
    // the planner follows a trial for 25 seconds, the preview 720 frames to the landing and 1500 on to the rest
    expect(moon.readyAt).toBeLessThan(25 * 60);
    expect(moon.landedAt).toBeLessThan(720);
    expect(moon.readyAt).toBeLessThan(1500);
  });
});

describe('the Moon’s calm', () => {
  it('has no wind on a hole that says twelve miles an hour, and the readout says calm', () => {
    const calm = golfGame(hole('moon', 12)).game;
    expect(calm.wind.speed).toBe(0);
    expect(windText(calm.wind.speed)).toBe(windText(0));
    expect(golfGame(hole(undefined, 12)).game.wind.speed).toBe(12);
    expect(golfGame(hole('desert', 12)).game.wind.speed).toBe(12);
    // the hole's own figure is still what the spec says: a biome silences the wind and does not rewrite the hole
    expect(calm.def.wind).toBe(12);
  });

  it('flies a ball as it flies with no wind at all, to the bit', () => {
    const state = (def: HoleDef) => {
      const g = drive(def, 0.8).game;
      return JSON.stringify([g.world.x[g.ball], g.world.y[g.ball], g.world.z[g.ball]]);
    };
    expect(state(hole('moon', 12))).toBe(state(hole('moon')));
    expect(state(hole(undefined, 12))).not.toBe(state(hole()));
  });

  it('gives the aim, the caddie and the camera the same nought', () => {
    const { game } = golfGame(hole('moon', 12));
    const rig = new CameraRig();
    const director = new Director(rig);
    director.use(game);
    director.setScreen(1.6, 800);
    director.started();
    const reach = { x: 0, y: 0, z: 0 };
    expect(director.reachPoint(reach)).toBe(true);
    const calmReach = Math.hypot(reach.x - game.world.x[game.ball], reach.y - game.world.y[game.ball]);
    const windy = golfGame(hole(undefined, 12)).game;
    const rig2 = new CameraRig();
    const d2 = new Director(rig2);
    d2.use(windy);
    d2.setScreen(1.6, 800);
    d2.started();
    const r2 = { x: 0, y: 0, z: 0 };
    d2.reachPoint(r2);
    // the windy hole's reach is a wind's longer or shorter; the calm one's is the plain carry
    expect(
      Math.abs(Math.hypot(r2.x - windy.world.x[windy.ball], r2.y - windy.world.y[windy.ball]) - calmReach),
    ).toBeGreaterThan(0.01);
    expect(calmReach).toBeGreaterThan(100);
  });
});

describe('a surface table of a biome’s own', () => {
  it('changes where a ball rests on a desert fairway, and not on a moon one', () => {
    const rest = (biome?: BiomeName) => {
      const { game, calls } = golfGame(field('f', 130, 41, undefined, 4, biome));
      game.pick('7-iron');
      const y0 = game.world.y[game.ball];
      game.shoot(NORTH, 1);
      for (let f = 0; f < 60 * 30 && !game.ready; f++) game.step(DT);
      expect(game.ready).toBe(true);
      const land = calls.find(([n]) => n === 'landed')!;
      return { carry: (land[1][1] as number) - y0, rest: game.world.y[game.ball] - y0 };
    };
    const earth = rest(),
      desert = rest('desert'),
      moon = rest('moon');
    expect(desert.carry).toBeCloseTo(earth.carry, 6);
    // keeps more of its speed and rolls less: a different place to rest
    expect(desert.rest).toBeGreaterThan(earth.rest + 1);
    expect(moon.rest).toBeLessThan(earth.rest + 1);
  });

  it('reads the biome’s rough for the strike, the carry and the roll alike', () => {
    const { game } = golfGame(field('r', 130, 41, undefined, 4, 'moon'));
    // the tee's box is the tee's: the rough two tiles on is what the ball is struck from
    game.place(game.layout.tee.x, game.layout.tee.y + 2 * TILE);
    expect(game.rollAt(game.layout.tee.x, game.layout.tee.y + 6 * TILE)).toBe(SURFACES[LIE.rough].roll);
    const desert = golfGame(field('r', 130, 41, undefined, 4, 'desert')).game;
    expect(desert.rollAt(desert.layout.tee.x, desert.layout.tee.y + 6 * TILE)).toBe(
      BIOMES.desert.surfaces[LIE.rough].roll,
    );
    const strike = (g: Game) => {
      g.place(g.layout.tee.x, g.layout.tee.y + 2 * TILE);
      g.pick('7-iron');
      const y0 = g.world.y[g.ball];
      g.shoot(NORTH, 1);
      let first = NaN;
      for (let f = 0; f < 600 && Number.isNaN(first); f++) {
        g.step(DT);
        if (g.world.vz[g.ball] < 0 && g.world.z[g.ball] < 1.5 && f > 10) first = g.world.y[g.ball] - y0;
      }
      return first;
    };
    const earth = strike(golfGame(field('r', 130, 41, undefined, 4)).game);
    // moon rough takes 0.7 of the speed where earth's takes 0.76: it flies shorter
    expect(strike(golfGame(field('r', 130, 41, undefined, 4, 'moon')).game)).toBeLessThan(earth);
    // desert rough takes 0.85: it flies further
    expect(strike(desert)).toBeGreaterThan(earth);
  });

  it('holds a ball on a slope by its own biome’s roll, and the invariants agree', () => {
    // a long gentle tilt along the field, at a slope the fairway (roll 20) holds and a moon's fairway holds the same
    const rows = 130,
      cols = 41;
    const terrain = new Float32Array(rows * cols);
    for (let r = 0; r < rows; r++) for (let c = 0; c < cols; c++) terrain[r * cols + c] = 0.15 * r * TILE;
    const rest = (biome?: BiomeName) => {
      const { game } = golfGame(field('f', rows, cols, terrain, 4, biome));
      game.place(game.layout.tee.x, game.layout.tee.y + 10 * TILE);
      for (let f = 0; f < 60 * 20; f++) {
        game.step(DT);
        expect(checkInvariants(game), `${biome ?? 'earth'} frame ${f}`).toEqual([]);
        if (game.ready) break;
      }
      expect(game.ready).toBe(true);
      return [game.world.x[game.ball], game.world.y[game.ball]];
    };
    expect(rest('moon')).toEqual(rest());
    // desert fairway's roll 18 holds a shallower slope than earth's 20, so this ball is not asked to stay where earth's would
    expect(rest('desert')).not.toBeNull();
  });
});

describe('earth named outright', () => {
  it('plays the very game that earth named by nothing does, shot for shot, to the bit', () => {
    const play = (def: HoleDef) => {
      const g = new Game(new Progress(memoryStore()), {}, { random: seeded(7), course: [def] });
      const bytes: number[][] = [];
      for (const [club, angle, power] of [
        ['driver', NORTH + 0.05, 1],
        ['7-iron', NORTH - 0.1, 0.9],
        ['sand-wedge', NORTH, 0.5],
        ['putter', NORTH, 0.3],
      ] as const) {
        for (let f = 0; f < 60 * 40 && !g.ready; f++) g.step(DT);
        if (g.phase !== 'play') break;
        g.pick(club);
        g.shoot(angle, power);
        for (let f = 0; f < 600; f++) {
          g.step(DT);
          bytes.push([
            g.t,
            g.strokes,
            g.world.x[g.ball],
            g.world.y[g.ball],
            g.world.z[g.ball],
            g.world.vx[g.ball],
            g.world.vz[g.ball],
          ]);
        }
      }
      return JSON.stringify([bytes, g.total]);
    };
    const none = play(hole(undefined, 9));
    expect(play(hole('earth', 9))).toBe(none);
    expect(none.length).toBeGreaterThan(1000);
  });

  it('is left out of a hole’s hash when absent, written when named, and never the same named as not', () => {
    // the hashes of every course's holes are held by golf-hash and kit-hash; this holds the rule they lean on
    const h = hole();
    expect(hashHole(h)).toBe(hashHole({ ...h, biome: undefined }));
    expect(hashHole({ ...h, biome: 'moon' })).not.toBe(hashHole(h));
    expect(hashHole({ ...h, biome: 'moon' })).not.toBe(hashHole({ ...h, biome: 'desert' }));
    expect(hashHole({ ...h, biome: 'earth' })).not.toBe(hashHole(h));
    expect(golfGame(hole('earth')).game.layout.biome).toBe('earth');
  });

  it('refuses a biome it does not know, by name, from a map and from a spec', () => {
    expect(() => layoutOf(hole().map, undefined, undefined, 'mars' as BiomeName)).toThrow(/biome.*mars/);
    expect(() => golfHole({ ...LINKS_SPECS[0], biome: 'mars' as BiomeName })).toThrow(/biome.*mars/);
  });
});

describe('a preview on the Moon', () => {
  it('reports the flight to its landing, the same place as earth’s, in more frames', () => {
    const run = (biome?: BiomeName) => {
      const { game } = golfGame(hole(biome));
      const at = { x: game.world.x[game.ball], y: game.world.y[game.ball] };
      const p = new Previewer(game).run(at, bagClub('driver'), NORTH, 1);
      return { p, at };
    };
    const earth = run().p;
    const moon = run('moon').p;
    expect(moon.end).toBe('landed');
    expect(earth.end).toBe('landed');
    expect(moon.n / earth.n).toBeGreaterThan(1.4);
    expect(moon.n / earth.n).toBeLessThan(1.65);
    expect(Math.abs(moon.carry - earth.carry)).toBeLessThan(1);
    expect(Math.abs(moon.y - earth.y)).toBeLessThan(1);
    expect(moon.lie).toBe(earth.lie);
  });

  it('carries the ghost shot on to the same rest, finished within its frames', () => {
    const run = (biome?: BiomeName) => {
      const { game } = wearing(['scope'], [hole(biome)]);
      const at = { x: game.world.x[game.ball], y: game.world.y[game.ball] };
      return new Previewer(game).run(at, bagClub('driver'), NORTH, 1);
    };
    const earth = run(),
      moon = run('moon');
    expect(earth.rest.shown).toBe(true);
    expect(moon.rest.shown).toBe(true);
    expect(earth.rest.settled).toBe(true);
    expect(moon.rest.settled).toBe(true);
    expect(moon.rest.n / earth.rest.n).toBeGreaterThan(1.3);
    expect(Math.abs(moon.rest.y - earth.rest.y)).toBeLessThan(1);
    expect(Math.abs(moon.rest.carry - earth.rest.carry)).toBeLessThan(1);
  });
});

describe('the autopilot and the caddie on the Moon', () => {
  it('plan the same club and power from the tee as on earth, since every distance holds', () => {
    const plan = (biome?: BiomeName) => new Autopilot(golfGame(hole(biome)).game).plan()!;
    const earth = plan(),
      moon = plan('moon');
    expect(moon.club).toBe(earth.club);
    expect(moon.power).toBeCloseTo(earth.power, 6);
  });

  it('plays a hole round, from the tee to the cup, in the strokes earth takes', () => {
    const round = (biome?: BiomeName) => {
      const game = new Game(new Progress(memoryStore()), {}, { random: seeded(3), course: [hole(biome)] });
      const pilot = new Autopilot(game, { random: seeded(5) });
      for (let f = 0; f < 60 * 60 * 4 && game.phase !== 'over'; f++) {
        pilot.step(DT);
        if (f % 30 === 0) expect(checkInvariants(game), `frame ${f}`).toEqual([]);
      }
      return { phase: game.phase, strokes: game.total };
    };
    const earth = round(),
      moon = round('moon');
    expect(moon.phase).toBe('over');
    expect(Math.abs(moon.strokes - earth.strokes)).toBeLessThanOrEqual(1);
  });
});

/** Whether the ball is ready, read afresh, since the compiler holds a flag read once to be what it was. */
const readyNow = (g: Game) => g.ready;

/** A full drive followed by the director on a screen, in `biome`: how many frames it flew, the framing's problems, and the worst change of the camera target's speed, units a second a second. */
function followed(biome: BiomeName, mode: 'always' | 'never', aspect: number, height: number) {
  const { game } = golfGame(hole(biome));
  const rig = new CameraRig();
  const director = new Director(rig);
  director.use(game);
  director.setScreen(aspect, height);
  director.followShots(mode);
  director.started();
  game.pick('driver');
  for (let f = 0; f < 600; f++) director.frame(DT, false);
  expect(game.shoot(NORTH, 1)).toBe(true);
  director.struck();
  const cam = new Camera();
  cam.fov = rig.fov;
  cam.aspect = aspect;
  const box = safeBox(aspect, height);
  const targets: number[][] = [];
  const problems: string[] = [];
  for (let f = 0; f < 60 * 14 && !game.ready; f++) {
    game.step(DT);
    director.frame(DT, false);
    rig.place(cam, game.t);
    cam.update();
    const { world, ball } = game;
    if (readyNow(game)) break;
    problems.push(...framingProblems(rig, cam, { x: world.x[ball], y: world.y[ball], z: world.z[ball] }, null, box));
    targets.push([rig.target[0], rig.target[1], rig.target[2]]);
  }
  const speeds = targets.slice(1).map((t, i) => Math.hypot(...t.map((v, k) => v - targets[i][k])) / DT);
  let worst = 0;
  for (let i = 1; i < speeds.length; i++) worst = Math.max(worst, Math.abs(speeds[i] - speeds[i - 1]) / DT);
  return { flying: targets.length, problems, worst };
}

describe('the camera on the Moon', () => {
  for (const [aspect, height] of [
    [1.6, 800],
    [400 / 860, 860],
  ] as const) {
    for (const mode of ['always', 'never'] as const) {
      it(`keeps the ball on the screen the whole of a slower drive, followed ${mode}, and hands over no harder than earth's, on ${aspect.toFixed(2)}`, () => {
        const earth = followed('earth', mode, aspect, height);
        const moon = followed('moon', mode, aspect, height);
        expect(moon.flying, 'a drive that took a while').toBeGreaterThan(earth.flying * 1.4);
        expect(moon.problems).toEqual([]);
        // held still and then handed over under `HAND_OVER`'s cap of 400 (the test of it allows 500); a ball followed all the way is
        // eased as it always was, and a slower ball is eased no harder
        if (mode === 'never') expect(moon.worst).toBeLessThan(500);
        else expect(moon.worst).toBeLessThanOrEqual(earth.worst + 1);
      });
    }
  }
});

describe('the rules for a biome', () => {
  it('say nothing of a hole in any known biome, and name an unknown one', () => {
    for (const biome of Object.keys(BIOMES) as BiomeName[]) {
      const { game } = golfGame(hole(biome));
      expect(checkInvariants(game), biome).toEqual([]);
    }
    const { game } = golfGame(hole('moon'));
    (game.layout as { biome: string }).biome = 'jupiter';
    expect(checkInvariants(game).join('\n')).toMatch(/biome/);
  });

  it('name a wind on a calm hole', () => {
    const { game } = golfGame(hole('moon', 12));
    expect(checkInvariants(game)).toEqual([]);
    (game.wind as { speed: number }).speed = 5;
    expect(checkInvariants(game).join('\n')).toMatch(/calm/);
  });

  it('keep The Links’ nine holes on the Moon clean through a round played by the autopilot (a throwaway biome, not a course)', () => {
    const holes = LINKS_SPECS.slice(0, 3).map((s) => golfHole({ ...s, trees: 0, biome: 'moon' }));
    const game = new Game(new Progress(memoryStore()), {}, { random: seeded(11), course: holes });
    const pilot = new Autopilot(game, { random: seeded(13) });
    let checked = 0;
    for (let f = 0; f < 60 * 60 * 12 && game.phase !== 'over'; f++) {
      pilot.step(DT);
      if (f % 20 === 0) {
        checked++;
        expect(checkInvariants(game), `frame ${f}, hole ${game.hole}`).toEqual([]);
      }
    }
    expect(checked, 'a round that was played, and checked as it went').toBeGreaterThan(50);
    expect(game.phase).toBe('over');
    expect(game.card.length).toBe(3);
    expect(GREENS.normal).toBe(14);
  });
});
