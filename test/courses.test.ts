/** The courses: The Meadow, the first nine, The Hills, whose holes slope, The Downs, whose ground is noise, and The Moors, whose holes are open country many times the size, each played as a round of its own. */
import { describe, expect, it } from 'vitest';
import { ROLL, TILE, layoutOf, slopeAt } from '../src/arena';
import { Autopilot, restsOn } from '../src/autopilot';
import { COURSE, COURSES, CUP, DOWNS, DOWNS_FEELS, HILLS, moors } from '../src/course';

const MOORS = moors();
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
  it('are The Meadow, the first nine as they were, The Hills, four holes that slope, The Downs, nine on noise, The Moors, The Range, the first of golf, and The Links', () => {
    expect(COURSES.map((c) => c.name)).toEqual([
      'The Meadow',
      'The Hills',
      'The Downs',
      'The Moors',
      'The Range',
      'The Links',
    ]);
    expect(COURSES[3].holes).toBe(MOORS);
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

/**
 * The Moors: nine open holes made by the generator, each far bigger than any drawn by hand, with ponds, bunkers and
 * stands of posts on hills. Held to what it is for.
 */
describe('The Moors', () => {
  /** The playable floor inside the rail, in square units. */
  const box = (h: { map: readonly string[]; terrain?: readonly string[] | Float32Array }) => {
    const { bounds } = layoutOf(h.map, h.terrain);
    return (bounds.maxX - bounds.minX) * (bounds.maxY - bounds.minY);
  };
  const mean = (xs: number[]) => xs.reduce((a, b) => a + b, 0) / xs.length;
  /** How many separate features of a kind a hole has: tiles that touch, even at a corner, being one, and a stand's posts being one. */
  const featuresOf = (map: readonly string[], ch: string) => {
    const seen = new Set<string>();
    let n = 0;
    for (let r = 0; r < map.length; r++)
      for (let c = 0; c < map[r].length; c++) {
        if (map[r][c] !== ch || seen.has(`${c},${r}`)) continue;
        n++;
        const todo = [[c, r]];
        seen.add(`${c},${r}`);
        while (todo.length) {
          const [x, y] = todo.pop()!;
          const reach = ch === 'o' ? 2 : 1;
          for (let dx = -reach; dx <= reach; dx++)
            for (let dy = -reach; dy <= reach; dy++)
              if (map[y + dy]?.[x + dx] === ch && !seen.has(`${x + dx},${y + dy}`)) {
                seen.add(`${x + dx},${y + dy}`);
                todo.push([x + dx, y + dy]);
              }
        }
      }
    return n;
  };

  it('is nine holes, each named once, with the pars it was drawn to, and a limit of five over each', () => {
    expect(MOORS.map((h) => h.name)).toEqual([
      'Wide Open',
      'Lily Ponds',
      'Sandy Reach',
      'The Grove',
      'Long Roll',
      'Broken Ground',
      'Water Meadow',
      'The Ridge',
      'The Far Pin',
    ]);
    expect(MOORS.map((h) => h.par)).toEqual([4, 5, 5, 5, 5, 5, 6, 6, 6]);
    expect(COURSES[3].name).toBe('The Moors');
  });

  it('is many times the size of The Downs: every hole nearly six times its mean or more, the mean ten times, and a long way from tee to cup', () => {
    const downsMean = mean(DOWNS.map(box));
    for (const hole of MOORS) {
      expect(box(hole) / downsMean, `${hole.name}`).toBeGreaterThanOrEqual(5.8);
      // ninety-five units or more from the tee to the cup, and no farther than a putter and its slips can be expected to reach in a few shots
      expect(length(hole) * TILE, `${hole.name} tee to cup`).toBeGreaterThanOrEqual(95);
      expect(length(hole) * TILE, `${hole.name} tee to cup`).toBeLessThanOrEqual(160);
    }
    expect(mean(MOORS.map(box)) / downsMean, 'the mean').toBeGreaterThanOrEqual(10);
    // and they grow, from the first hole to the last
    expect(box(MOORS[8])).toBeGreaterThan(box(MOORS[0]) * 2);
  });

  it('is the hazards it was given: nothing on the first, ponds where it has them, bunkers and stands', () => {
    const count = (name: string, ch: string) => featuresOf(MOORS.find((h) => h.name === name)!.map, ch);
    expect([count('Wide Open', '~'), count('Wide Open', 's'), count('Wide Open', 'o')]).toEqual([0, 0, 0]);
    expect(count('Lily Ponds', '~')).toBe(2);
    expect(count('Sandy Reach', 's')).toBe(3);
    expect(count('The Grove', 'o')).toBe(2);
    expect(count('Long Roll', '~')).toBe(1);
    expect(count('Broken Ground', 's')).toBe(2);
    expect([count('Water Meadow', '~'), count('Water Meadow', 's')]).toEqual([2, 2]);
    expect([count('The Ridge', 'o'), count('The Ridge', 's')]).toEqual([2, 1]);
    expect([count('The Far Pin', '~'), count('The Far Pin', 's'), count('The Far Pin', 'o')]).toEqual([1, 2, 1]);
  });

  it('is hills and not bumps: seven to eighteen units from the lowest ground to the highest, smooth, and the ball rests on nearly all of it', () => {
    const downs = DOWNS.map((h) => groundFigures(layoutOf(h.map, h.terrain)));
    const figures = MOORS.map((h) => groundFigures(layoutOf(h.map, h.terrain)));
    for (const [i, hole] of MOORS.entries()) {
      expect(hole.terrain, `${hole.name} slopes`).toBeInstanceOf(Float32Array);
      expect(terrainRefusal(layoutOf(hole.map, hole.terrain), CUP), hole.name).toBeNull();
      const f = figures[i];
      // measured: 7.4 to 17.8 units, against The Downs' 1.7 to 3.2, on holes twice the size
      expect(f.relief, `${hole.name}: how high its hills stand`).toBeGreaterThanOrEqual(i === 0 ? 7 : 9);
      expect(f.relief).toBeLessThanOrEqual(20);
      // smooth: the slope turns a fifth as often as on The Downs' bumps (0.003 to 0.009, against 0.010 to 0.039)
      expect(f.bumpiness, `${hole.name}: how quickly the slope turns`).toBeLessThanOrEqual(0.012);
      expect(f.detail, `${hole.name}: small detail on the swell`).toBeLessThanOrEqual(0.1);
      // a slope of twenty degrees at the steepest, and a ball rests where it lies on nine tenths of the ground
      expect(f.steepest, `${hole.name}: its steepest slope`).toBeLessThanOrEqual(0.37);
      expect(f.rests, `${hole.name}: where a ball rests`).toBeGreaterThanOrEqual(0.9);
    }
    const mean = (xs: number[]) => xs.reduce((a, b) => a + b, 0) / xs.length;
    expect(mean(figures.map((f) => f.relief)), 'the mean').toBeGreaterThanOrEqual(11.5);
    expect(
      mean(figures.map((f) => f.relief)) / mean(downs.map((f) => f.relief)),
      'against The Downs',
    ).toBeGreaterThanOrEqual(4.5);
  });

  it('is played out from the tee to the cup by the autopilot, on every hole, holing out within the limit, and breaking no rule', () => {
    for (const hole of MOORS) {
      const { game } = newGame(1, null, [hole]);
      const pilot = new Autopilot(game);
      let frames = 0;
      for (; frames < 60 * 300 && game.phase === 'play'; frames++) {
        pilot.step(DT);
        if (frames % 30 === 0) expect(checkInvariants(game), `${hole.name} frame ${frames}`).toEqual([]);
      }
      expect(game.phase, `${hole.name} done`).not.toBe('play');
      expect(game.strokes, `${hole.name} holed inside its limit`).toBeLessThan(game.limit);
    }
  });
});
