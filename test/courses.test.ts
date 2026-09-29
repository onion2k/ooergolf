/** The courses: The Meadow, the first nine, The Hills, whose holes slope, and The Downs, whose ground is noise, each played as a round of its own. */
import { describe, expect, it } from 'vitest';
import { ROLL, TILE, layoutOf, slopeAt } from '../src/arena';
import { Autopilot, restsOn } from '../src/autopilot';
import { COURSE, COURSES, CUP, DOWNS, DOWNS_FEELS, HILLS } from '../src/course';
import { checkInvariants } from '../src/invariants';
import { PHYSICS, terrainRefusal } from '../src/physics';
import { groundFigures } from './ground-metrics';
import { DT, newGame } from './helpers';

const hills = () => COURSES.find((c) => c.name === 'The Hills')!;
const downs = () => COURSES.find((c) => c.name === 'The Downs')!;
/** How far the tee is from the cup, in tiles. */
const length = (h: { map: readonly string[]; terrain?: readonly string[] | Float32Array }) => {
  const l = layoutOf(h.map, h.terrain);
  return Math.hypot(l.tee.x - l.cup.x, l.tee.y - l.cup.y) / TILE;
};

describe('the courses', () => {
  it('are The Meadow, the first nine as they were, The Hills, four holes that slope, and The Downs, nine on noise', () => {
    expect(COURSES.map((c) => c.name)).toEqual(['The Meadow', 'The Hills', 'The Downs']);
    expect(COURSES[0].holes).toBe(COURSE);
    expect(COURSE.length).toBe(9);
    expect(hills().holes.map((h) => h.name)).toEqual(['The Hollow', 'The Volcano', 'The Bowl', 'Side-hill']);
    for (const hole of hills().holes) expect(hole.terrain, `${hole.name} slopes`).toBeDefined();
  });

  it('name every hole once across them all, since a best score is kept by the hole’s name', () => {
    const names = COURSES.flatMap((c) => c.holes.map((h) => h.name));
    expect(new Set(names).size).toBe(names.length);
  });

  it('slope only as the physics allows, and round each cup no steeper than the green holds a ball', () => {
    const holds = ROLL.roll / PHYSICS.gravity;
    for (const hole of COURSES.flatMap((c) => c.holes)) {
      const l = layoutOf(hole.map, hole.terrain);
      expect(terrainRefusal(l, CUP), hole.name).toBeNull();
      // out to the cup's radius and two balls past it: a ball can come to rest beside the cup and not creep in
      for (let a = 0; a < 48; a++)
        for (const r of [0.5, 1.5, CUP.radius + 1, CUP.radius + 2]) {
          const [sx, sy] = slopeAt(
            l,
            l.cup.x + Math.cos((a / 48) * Math.PI * 2) * r,
            l.cup.y + Math.sin((a / 48) * Math.PI * 2) * r,
          );
          const s = Math.hypot(sx, sy);
          expect(s / Math.sqrt(1 + s * s), `${hole.name}, ${r} from the cup`).toBeLessThanOrEqual(holds);
        }
    }
  });

  it('play The Hills as a round of their own: every hole holed within par by the autopilot, breaking no rule, and the card', () => {
    const { game, told } = newGame(1);
    game.playCourse(hills().holes);
    const pilot = new Autopilot(game);
    for (let f = 0; f < 60 * 60 * 3 && game.phase !== 'over'; f++) {
      pilot.step(DT);
      if (f % 30 === 0) expect(checkInvariants(game), `frame ${f}`).toEqual([]);
    }
    expect(game.phase).toBe('over');
    expect(game.card.length).toBe(4);
    game.card.forEach((score, h) => expect(score, hills().holes[h].name).toBeLessThanOrEqual(hills().holes[h].par));
    expect(told.filter((t) => t.startsWith('finished')).length).toBe(1);
  });
  it('The Downs are nine holes on ground made from noise, gentle, rolling and choppy, and the last three both rolling and choppy', () => {
    expect(DOWNS.length).toBe(9);
    expect(downs().holes).toBe(DOWNS);
    expect(DOWNS_FEELS).toEqual([
      'gentle',
      'rolling',
      'gentle',
      'choppy',
      'rolling',
      'choppy',
      'rolling and choppy',
      'rolling and choppy',
      'rolling and choppy',
    ]);
    for (const hole of DOWNS)
      expect(hole.terrain, `${hole.name}: real heights, not digits`).toBeInstanceOf(Float32Array);
    for (const hole of DOWNS) {
      expect(hole.obstacles, `${hole.name}: the ground is the only obstacle`).toBeUndefined();
      expect(hole.map.join(''), `${hole.name}: no water, sand or posts`).not.toMatch(/[~so]/);
    }
  });

  it('The Downs are half as long again as the holes there were: tee to cup, on the mean, and none of them short', () => {
    const before = [...COURSE, ...HILLS].map(length);
    const was = before.reduce((a, b) => a + b, 0) / before.length;
    const now = DOWNS.map(length);
    const mean = now.reduce((a, b) => a + b, 0) / now.length;
    expect(mean / was, 'the mean length, against the mean before').toBeGreaterThan(1.45);
    expect(mean / was).toBeLessThan(1.55);
    for (const [i, d] of now.entries()) {
      expect(d, `${DOWNS[i].name} is at least as long as the longest there was`).toBeGreaterThanOrEqual(
        Math.max(...before),
      );
      expect(d, `${DOWNS[i].name} is not twice the length`).toBeLessThan(2 * was);
    }
  });

  it('The Downs feel as they are named, hole by hole, in figures', () => {
    const f = DOWNS.map((h) => groundFigures(layoutOf(h.map, h.terrain)));
    const of = (feel: string) => DOWNS_FEELS.flatMap((x, i) => (x === feel ? [i] : []));
    const mean = (feel: string, pick: (g: (typeof f)[number]) => number) =>
      of(feel).reduce((a, i) => a + pick(f[i]), 0) / of(feel).length;
    for (const i of of('gentle')) {
      expect(f[i].steepest, `${DOWNS[i].name}: gentle, the steepest`).toBeLessThan(0.17);
      expect(f[i].rests, `${DOWNS[i].name}: a ball rests everywhere`).toBeGreaterThan(0.99);
      expect(f[i].relief, `${DOWNS[i].name}: still rises and falls`).toBeGreaterThan(0.8);
    }
    for (const i of of('rolling')) {
      expect(f[i].steepest, `${DOWNS[i].name}: rolling, the steepest`).toBeGreaterThan(0.2);
      expect(f[i].relief, `${DOWNS[i].name}: relief`).toBeGreaterThan(1.6);
    }
    const rolling = {
      bump: mean('rolling', (g) => g.bumpiness),
      detail: mean('rolling', (g) => g.detail),
      relief: mean('rolling', (g) => g.relief),
    };
    for (const i of of('choppy')) {
      expect(f[i].bumpiness, `${DOWNS[i].name}: choppy turns the slope oftener`).toBeGreaterThan(1.2 * rolling.bump);
      expect(f[i].detail, `${DOWNS[i].name}: and has more small detail`).toBeGreaterThan(1.4 * rolling.detail);
    }
    for (const i of of('rolling and choppy')) {
      expect(f[i].relief, `${DOWNS[i].name}: keeps the swell`).toBeGreaterThan(0.75 * rolling.relief);
      expect(f[i].bumpiness, `${DOWNS[i].name}: and the bumps`).toBeGreaterThan(1.15 * rolling.bump);
      expect(f[i].detail, `${DOWNS[i].name}: and the detail`).toBeGreaterThan(1.25 * rolling.detail);
    }
    // the last three build: each steeper than the one before
    expect(f[6].steepest).toBeLessThanOrEqual(f[7].steepest);
    expect(f[7].steepest).toBeLessThanOrEqual(f[8].steepest);
  });

  it('rest a ball on every tee, and hold every hole within what the physics allows', () => {
    for (const hole of DOWNS) {
      const l = layoutOf(hole.map, hole.terrain);
      expect(restsOn(l, l.tee.x, l.tee.y), `${hole.name}: the tee`).toBe(true);
      expect(terrainRefusal(l, CUP), hole.name).toBeNull();
    }
  });

  it('play The Downs as a round of their own: every hole holed within par by the autopilot, breaking no rule, and nine on the card', () => {
    const { game, told } = newGame(1);
    game.playCourse(downs().holes);
    const pilot = new Autopilot(game);
    for (let f = 0; f < 60 * 60 * 8 && game.phase !== 'over'; f++) {
      pilot.step(DT);
      if (f % 30 === 0) expect(checkInvariants(game), `frame ${f}`).toEqual([]);
    }
    expect(game.phase).toBe('over');
    expect(game.card.length).toBe(9);
    game.card.forEach((score, h) => expect(score, downs().holes[h].name).toBeLessThanOrEqual(downs().holes[h].par));
    expect(told.filter((t) => t.startsWith('finished')).length).toBe(1);
  });
});
