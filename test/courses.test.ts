/** The courses: The Meadow, the first nine, The Hills, whose holes slope, The Downs, whose ground is noise, and The Moors, whose holes are open country many times the size, each played as a round of its own. */
import { describe, expect, it } from 'vitest';
import { ROLL, TILE, layoutOf, slopeAt } from '../src/arena';
import { Autopilot, restsOn } from '../src/autopilot';
import { COURSE, COURSES, CUP, DOWNS, DOWNS_FEELS, HILLS, moors } from '../src/course';

const MOORS = moors();
import { checkInvariants } from '../src/invariants';
import { seeded } from '../src/random';
import { PHYSICS, terrainRefusal } from '../src/physics';
import { groundFigures } from './ground-metrics';
import { DT, newGame } from './helpers';

/** The Hills in the order they are played, easy to hard: the names are the save's keys, so the order is free. */
const HILLS_IN_ORDER = [
  'The Bowl',
  'The Hollow',
  'The Sink',
  'The Volcano',
  'The Sunken Lane',
  'The Hump',
  'Side-hill',
  'The Shelf',
  'Hill and Dale',
];
/** The four holes The Hills had before they were nine. */
const HILLS_BEFORE = ['The Hollow', 'The Volcano', 'The Bowl', 'Side-hill'];
const hills = () => COURSES.find((c) => c.name === 'The Hills')!;
const downs = () => COURSES.find((c) => c.name === 'The Downs')!;
/** How far the tee is from the cup, in tiles. */
const length = (h: { map: readonly string[]; terrain?: readonly string[] | Float32Array }) => {
  const l = layoutOf(h.map, h.terrain);
  return Math.hypot(l.tee.x - l.cup.x, l.tee.y - l.cup.y) / TILE;
};

describe('the courses', () => {
  it('are The Meadow, the first nine as they were, The Hills, nine holes that slope, The Downs, nine on noise, The Moors, The Range, the first of golf, and The Links', () => {
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
    expect(hills().holes.map((h) => h.name)).toEqual(HILLS_IN_ORDER);
    expect(hills().holes).toBe(HILLS);
    for (const hole of hills().holes) expect(hole.terrain, `${hole.name} slopes`).toBeDefined();
  });

  it('give The Hills nine holes, easy to hard, of par 24: the Bowl, Hollow and Volcano short, the rest three', () => {
    expect(HILLS.map((h) => h.par)).toEqual([2, 2, 3, 2, 3, 3, 3, 3, 3]);
    expect(HILLS.reduce((a, h) => a + h.par, 0)).toBe(24);
    expect(hills().summary).toMatchObject({ par: 24 });
    // the hand-drawn four keep their grass: only the new five have a map that nothing else drew
    const drawn = (n: string) => HILLS.find((h) => h.name === n)!;
    for (const n of ['The Sink', 'The Sunken Lane', 'The Hump', 'The Shelf', 'Hill and Dale']) {
      const l = layoutOf(drawn(n).map, drawn(n).terrain);
      expect(drawn(n).obstacles, `${n}: the ground is the only obstacle`).toBeUndefined();
      expect(l.cols + l.rows, `${n}: a map that fits a phone`).toBeLessThanOrEqual(32);
    }
  });

  it('draw The Meadow’s windmill and mill race so that the cup shows from the tee, and open the race’s barrier wider', () => {
    const hole = (n: string) => COURSE.find((h) => h.name === n)!;
    for (const n of ['Windmill', 'The Mill Race']) {
      const h = hole(n);
      const door = h.map.findIndex((r) => r.startsWith('####.####'));
      const cup = h.map.findIndex((r) => r.includes('C'));
      // the tower hides what is less than sixteen units beyond its door, from the tee, at the home view
      expect((door - cup) * TILE, `${n}: the cup is far enough past the door to be seen`).toBeGreaterThanOrEqual(16);
      expect(h.obstacles!.find((o) => o.kind === 'windmill')!.at, `${n}: the windmill stands in the door`).toEqual([
        4,
        door,
      ]);
    }
    const race = hole('The Mill Race').obstacles!.find((o) => o.kind === 'barrier')!;
    expect(race).toMatchObject({ phase: 0.25 });
    expect(hole('The Bunker').par).toBe(2);
    expect(
      COURSE.map((h) => h.par),
      'the other pars are left as they were',
    ).toEqual([2, 3, 2, 3, 3, 3, 3, 3, 4]);
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
    expect(game.card.length).toBe(9);
    game.card.forEach((score, h) => expect(score, hills().holes[h].name).toBeLessThanOrEqual(hills().holes[h].par));
    expect(told.filter((t) => t.startsWith('finished')).length).toBe(1);
  });
  it('The Downs are nine holes on ground made from noise, gentle, rolling, choppy and long hills, the last two rolling and choppy', () => {
    expect(DOWNS.length).toBe(9);
    expect(downs().holes).toBe(DOWNS);
    expect(DOWNS.map((h) => h.name)).toEqual([
      'Easy Does It',
      'Cobbles',
      'Long Swell',
      'Sea Legs',
      'The Roll',
      'Long Hill',
      'Post Office',
      'Two Shots',
      'The Big Dipper',
    ]);
    expect(DOWNS_FEELS).toEqual([
      'gentle',
      'choppy',
      'rolling',
      'rolling and choppy',
      'rolling',
      'long hills',
      'rolling',
      'rolling and choppy',
      'rolling and choppy',
    ]);
    expect(DOWNS.map((h) => h.par)).toEqual([3, 3, 3, 3, 3, 3, 4, 4, 4]);
    for (const hole of DOWNS)
      expect(hole.terrain, `${hole.name}: real heights, not digits`).toBeInstanceOf(Float32Array);
    for (const hole of DOWNS) {
      expect(hole.obstacles, `${hole.name}: the ground is the only obstacle`).toBeUndefined();
      expect(hole.map.join(''), `${hole.name}: no water or sand`).not.toMatch(/[~s]/);
      // the ground is the obstacle on every hole but the post office, whose one stand of posts stands across the line
      const posts = (hole.map.join('').match(/o/g) ?? []).length;
      if (hole.name === 'Post Office')
        expect(posts, 'the post office has its stand: at least three posts').toBeGreaterThanOrEqual(3);
      else expect(posts, `${hole.name}: no posts`).toBe(0);
    }
  });

  it('The first five Downs are half as long again as the holes there were: tee to cup, on the mean, and none of them short', () => {
    // the thirteen holes there were: the Hills have since been given more, which are not what the Downs were measured by,
    // and the Meadow's windmill and mill race were drawn again longer, seven tiles from tee to cup and eight, as they were
    const WAS = ['Windmill', 'The Mill Race'];
    const before = [
      ...COURSE.filter((h) => !WAS.includes(h.name)).map(length),
      ...HILLS.filter((h) => HILLS_BEFORE.includes(h.name)).map(length),
      7,
      8,
    ];
    const was = before.reduce((a, b) => a + b, 0) / before.length;
    // the rule held the course's nine until it was lifted for the last four, which are longer (below); the five kept are
    // the five of the nine that were not twins of another, so they are held to it still
    const now = DOWNS.slice(0, 5).map(length);
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

  it('The Downs climb: tee to cup from about forty units to ninety, and the autopilot takes more strokes down the course, none picked up', () => {
    // the length rule above is lifted from the sixth hole: the last four are longer than the putter's fifty units reaches
    const units = DOWNS.map((h) => length(h) * TILE);
    for (const i of [0, 1, 2, 3, 4]) expect(units[i], `${DOWNS[i].name} is a short hole`).toBeLessThan(46);
    expect(units[5], 'Long Hill').toBeGreaterThan(45);
    expect(units[6], 'Post Office').toBeGreaterThan(40);
    expect(units[7], 'Two Shots').toBeGreaterThan(65);
    expect(units[8], 'The Big Dipper').toBeGreaterThan(units[7] + 10);
    expect(Math.max(...units.slice(0, 7)), 'the first seven are within a putt and a bit').toBeLessThan(55);
    // the strokes: sixteen seeds of a hole each, with the pace gate's slips, the mean of each group of holes above the last
    const slips = { aim: 0.05, power: 0.1 };
    const means = DOWNS.map((hole) => {
      let total = 0;
      for (let seed = 1; seed <= 16; seed++) {
        const { game } = newGame(seed);
        game.playCourse([hole]);
        const pilot = new Autopilot(game, { skill: slips, random: seeded(seed * 31 + 7) });
        for (let f = 0; f < 60 * 60 * 5 && game.phase === 'play'; f++) pilot.step(DT);
        expect(game.phase, `${hole.name}: seed ${seed} finished`).not.toBe('play');
        expect(game.card[0], `${hole.name}: seed ${seed} was holed, not picked up`).toBeLessThan(hole.par + 5);
        total += game.card[0];
      }
      return total / 16;
    });
    const group = (from: number, to: number) => means.slice(from, to).reduce((a, b) => a + b, 0) / (to - from);
    expect(group(0, 5), 'the first five, then Long Hill and the post office').toBeLessThan(group(5, 7) - 0.3);
    expect(group(5, 7), 'then the two long holes').toBeLessThan(group(7, 9) - 0.15);
    expect(means[8], 'and the last is the hardest of all').toBeGreaterThan(Math.max(...means.slice(0, 8)));
    expect(means[0], 'the opener is the easiest').toBeLessThan(Math.min(...means.slice(1)) + 0.1);
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
    // the last two build: the finale steeper than the hole before
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
    expect(MOORS.map((h) => h.par)).toEqual([3, 3, 3, 4, 4, 4, 4, 4, 5]);
    expect(COURSES[3].name).toBe('The Moors');
    expect(COURSES[3].summary).toEqual({ holes: 9, par: 34 });
  });

  it('is tight: every hole fifty to eighty-three units from the tee to the cup, so the cup is in view from the tee, and bigger than The Downs on the mean', () => {
    const downsMean = mean(DOWNS.map(box));
    for (const hole of MOORS) {
      const units = length(hole) * TILE;
      expect(units, `${hole.name} tee to cup`).toBeGreaterThanOrEqual(50);
      expect(units, `${hole.name} tee to cup`).toBeLessThanOrEqual(83);
      // a hole of two thousand to six thousand square units, where it was eight to nineteen thousand
      expect(box(hole), `${hole.name}: its floor`).toBeGreaterThanOrEqual(2000);
      expect(box(hole), `${hole.name}: its floor`).toBeLessThanOrEqual(6000);
    }
    expect(mean(MOORS.map((h) => length(h) * TILE)), 'the mean tee to cup, against The Downs').toBeGreaterThan(
      mean(DOWNS.map((h) => length(h) * TILE)) * 1.3,
    );
    expect(mean(MOORS.map(box)) / downsMean, 'the mean floor, against The Downs').toBeGreaterThanOrEqual(2);
    // and they grow, from the first hole to the last
    expect(length(MOORS[8])).toBeGreaterThan(length(MOORS[0]) * 1.5);
    expect(box(MOORS[8])).toBeGreaterThan(box(MOORS[0]) * 2);
  });

  it('is the hazards it was given: nothing on the first, ponds where it has them, bunkers and stands', () => {
    const count = (name: string, ch: string) => featuresOf(MOORS.find((h) => h.name === name)!.map, ch);
    // two stands that fall near one another count as one by their tiles, so posts are counted
    const posts = (name: string) =>
      (
        MOORS.find((h) => h.name === name)!
          .map.join('')
          .match(/o/g) ?? []
      ).length;
    expect([count('Wide Open', '~'), count('Wide Open', 's'), posts('Wide Open')]).toEqual([0, 0, 0]);
    expect(count('Lily Ponds', '~')).toBe(1);
    expect(count('Sandy Reach', 's')).toBe(2);
    expect(posts('The Grove'), 'two stands, as they fall on this seed, are ten posts').toBe(10);
    expect(count('Long Roll', '~')).toBe(1);
    expect(count('Broken Ground', 's')).toBe(2);
    expect([count('Water Meadow', '~'), count('Water Meadow', 's')]).toEqual([2, 1]);
    expect([posts('The Ridge'), count('The Ridge', 's')]).toEqual([9, 1]);
    expect([count('The Far Pin', '~'), count('The Far Pin', 's'), posts('The Far Pin')]).toEqual([1, 2, 5]);
  });

  it('puts a hazard on the line: the pond, the bunkers or the posts each hole is named for come within a few units of the way from the tee to the cup', () => {
    const KIND: Record<string, string> = {
      'Lily Ponds': '~',
      'Sandy Reach': 's',
      'The Grove': 'o',
      'Long Roll': '~',
      'Broken Ground': 's',
      'Water Meadow': '~',
      'The Ridge': 'o',
      'The Far Pin': '~',
    };
    for (const hole of MOORS) {
      const ch = KIND[hole.name];
      if (!ch) continue;
      const l = layoutOf(hole.map, hole.terrain);
      const dx = l.cup.x - l.tee.x;
      const dy = l.cup.y - l.tee.y;
      let nearest = Infinity;
      for (let r = 0; r < hole.map.length; r++)
        for (let c = 0; c < hole.map[r].length; c++) {
          if (hole.map[r][c] !== ch) continue;
          // the tile's middle, the map's top row being the far end of the world
          const x = l.bounds.minX - TILE + (c + 0.5) * TILE;
          const y = l.bounds.minY - TILE + (hole.map.length - 1 - r + 0.5) * TILE;
          const t = Math.max(0, Math.min(1, ((x - l.tee.x) * dx + (y - l.tee.y) * dy) / (dx * dx + dy * dy)));
          nearest = Math.min(nearest, Math.hypot(x - l.tee.x - t * dx, y - l.tee.y - t * dy));
        }
      expect(nearest, `${hole.name}: its hazard is in the way`).toBeLessThanOrEqual(3.5);
    }
  });

  it('is hills and not bumps: two to seventeen units from the lowest ground to the highest, smooth, and the ball rests on nearly all of it', () => {
    const downs = DOWNS.map((h) => groundFigures(layoutOf(h.map, h.terrain)));
    const figures = MOORS.map((h) => groundFigures(layoutOf(h.map, h.terrain)));
    for (const [i, hole] of MOORS.entries()) {
      expect(hole.terrain, `${hole.name} slopes`).toBeInstanceOf(Float32Array);
      expect(terrainRefusal(layoutOf(hole.map, hole.terrain), CUP), hole.name).toBeNull();
      const f = figures[i];
      // measured: 2.4 to 17.0 units, against The Downs' 1.7 to 6.3, on holes a little bigger (a pond's bed at nought is what
      // makes the high ones: it lies under the banks round it)
      expect(f.relief, `${hole.name}: how high its hills stand`).toBeGreaterThanOrEqual(2);
      expect(f.relief).toBeLessThanOrEqual(20);
      // smooth: the slope turns a third as often as on The Downs' bumps (0.003 to 0.009, against 0.010 to 0.037)
      expect(f.bumpiness, `${hole.name}: how quickly the slope turns`).toBeLessThanOrEqual(0.012);
      expect(f.detail, `${hole.name}: small detail on the swell`).toBeLessThanOrEqual(0.3);
      // a slope of twenty degrees at the steepest, and a ball rests where it lies on nine tenths of the ground
      expect(f.steepest, `${hole.name}: its steepest slope`).toBeLessThanOrEqual(0.37);
      expect(f.rests, `${hole.name}: where a ball rests`).toBeGreaterThanOrEqual(0.9);
    }
    const mean = (xs: number[]) => xs.reduce((a, b) => a + b, 0) / xs.length;
    expect(mean(figures.map((f) => f.relief)), 'the mean').toBeGreaterThanOrEqual(7);
    expect(
      mean(figures.map((f) => f.relief)) / mean(downs.map((f) => f.relief)),
      'against The Downs',
    ).toBeGreaterThanOrEqual(2);
  });

  it('plays two or three strokes a hole for the autopilot with a player’s slips, none picked up and next to none in the water', () => {
    const slips = { aim: 0.05, power: 0.1 };
    let splashes = 0;
    let rounds = 0;
    for (const hole of MOORS) {
      let total = 0;
      for (let seed = 1; seed <= 16; seed++) {
        const { game, told } = newGame(seed, null, [hole]);
        const pilot = new Autopilot(game, { skill: slips, random: seeded(seed * 31 + 7) });
        for (let f = 0; f < 60 * 300 && game.phase === 'play'; f++) pilot.step(DT);
        expect(game.phase, `${hole.name}: seed ${seed} finished`).not.toBe('play');
        expect(game.card[0], `${hole.name}: seed ${seed} was holed, not picked up`).toBeLessThan(hole.par + 5);
        total += game.card[0];
        rounds++;
        splashes += told.filter((t) => t.startsWith('splash')).length;
      }
      expect(total / 16, `${hole.name}: strokes a hole`).toBeGreaterThan(1.9);
      expect(total / 16, `${hole.name}: strokes a hole`).toBeLessThan(hole.par);
    }
    expect(splashes / rounds, 'splashes a hole').toBeLessThan(0.05);
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
