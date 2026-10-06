/** The courses: The Meadow, the first nine, the three newer courses of minigolf and The Links; and the slope holes the tests keep, played as a round. */
import { describe, expect, it } from 'vitest';
import { ROLL, TILE, layoutOf, slopeAt } from '../src/arena';
import { Autopilot } from '../src/autopilot';
import { COURSE, COURSES, CUP } from '../src/course';
import { checkInvariants } from '../src/invariants';
import { PHYSICS, terrainRefusal } from '../src/physics';
import { Progress, memoryStore } from '../src/progress';
import { DT, newGame } from './helpers';
import { HILLS } from './hills';

const holeNames = (course: string) => COURSES.find((c) => c.name === course)!.holes.map((h) => h.name);

describe('the courses', () => {
  it('are The Meadow, the first nine as they were, the three newer courses and The Links, The Fells and The Isles, the courses of golf, in order of difficulty', () => {
    expect(COURSES.map((c) => c.name)).toEqual([
      'The Meadow',
      'The Pinball Shed',
      'The Fair',
      'The Waterworks',
      'The Links',
      'The Fells',
      'The Isles',
    ]);
    expect(COURSES[0].holes).toBe(COURSE);
    expect(COURSE.length).toBe(9);
    expect(COURSES.filter((c) => c.golf).map((c) => c.name)).toEqual(['The Links', 'The Fells', 'The Isles']);
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
    const names = [...COURSES.flatMap((c) => c.holes.map((h) => h.name)), ...HILLS.map((h) => h.name)];
    expect(new Set(names).size).toBe(names.length);
  });

  it('keep a best score by the name of each hole of The Fells and The Isles, saved and read back', () => {
    const names = ['The Fells', 'The Isles'].flatMap((n) =>
      COURSES.find((c) => c.name === n)!.summary.holes ? holeNames(n) : [],
    );
    expect(names.length).toBe(18);
    const best: Record<string, { strokes: number; item: string }> = {};
    names.forEach((n, i) => (best[n] = { strokes: 2 + (i % 5), item: '' }));
    const store = memoryStore(JSON.stringify({ coins: 0, gems: 0, owned: [], item: '', best }));
    const progress = new Progress(store);
    progress.persist();
    const again = new Progress(store);
    expect(again.save.best).toEqual(best);
  });

  it('slope only as the physics allows, and round each cup no steeper than the green holds a ball', () => {
    const holds = ROLL.roll / PHYSICS.gravity;
    for (const hole of [...COURSES.flatMap((c) => c.holes), ...HILLS]) {
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
});

describe('the slope holes the tests keep', () => {
  it('are four that slope, played as a round of their own: every hole holed within par by the autopilot, breaking no rule, and the card', () => {
    expect(HILLS.map((h) => h.name)).toEqual(['The Bowl', 'The Hollow', 'The Volcano', 'Side-hill']);
    for (const hole of HILLS) expect(hole.terrain, `${hole.name} slopes`).toBeDefined();
    const { game, told } = newGame(1);
    game.playCourse(HILLS);
    const pilot = new Autopilot(game);
    for (let f = 0; f < 60 * 60 * 3 && game.phase !== 'over'; f++) {
      pilot.step(DT);
      if (f % 30 === 0) expect(checkInvariants(game), `frame ${f}`).toEqual([]);
    }
    expect(game.phase).toBe('over');
    expect(game.card.length).toBe(4);
    game.card.forEach((score, h) => expect(score, HILLS[h].name).toBeLessThanOrEqual(HILLS[h].par));
    expect(told.filter((t) => t.startsWith('finished')).length).toBe(1);
  });
});
