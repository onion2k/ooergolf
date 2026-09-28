/** The courses: The Meadow, the first nine, and The Hills, whose holes slope, each played as a round of its own. */
import { describe, expect, it } from 'vitest';
import { ROLL, layoutOf, slopeAt } from '../src/arena';
import { Autopilot } from '../src/autopilot';
import { COURSE, COURSES, CUP } from '../src/course';
import { checkInvariants } from '../src/invariants';
import { PHYSICS, terrainRefusal } from '../src/physics';
import { DT, newGame } from './helpers';

const hills = () => COURSES.find((c) => c.name === 'The Hills')!;

describe('the courses', () => {
  it('are The Meadow, the first nine as they were, and The Hills, four holes that slope', () => {
    expect(COURSES.map((c) => c.name)).toEqual(['The Meadow', 'The Hills']);
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
});
