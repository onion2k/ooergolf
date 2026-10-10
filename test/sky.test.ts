/**
 * The sky: the clouds over the hills past a hole, drawn only to a view that can see them. They drift at 90 to 250 yards up,
 * along the hole's wind and straight over the hole, which is the height and the place a shot is aimed from (the aim view of a
 * driver stands 108 up on a desk and 216 on a phone), and one drawn to such a view covered the screen: found 10 October 2026 on
 * The Fell Race, a phone's whole screen one cloud at about nine minutes in. They are put away as a matrix of no size, as the
 * title's ball is, while the view cannot see sky, and drawn as they always were while it can.
 */
import { describe, expect, it } from 'vitest';
import { BACKDROP } from '../src/backdrop';
import { COURSES } from '../src/course';
import { Game } from '../src/game';
import { Progress, memoryStore } from '../src/progress';
import { seeded } from '../src/random';
import { Scene } from '../src/scene';
import { windOf } from '../src/turf';

/** A hole of `course` drawn as the page draws it as it begins: the scene's moving part, made, and the scene. */
function drawn(course: string, index: number) {
  const holes = COURSES.find((c) => c.name === course)!.holes;
  const game = new Game(new Progress(memoryStore()), {}, { random: seeded(1), course: holes });
  game.startAt(index);
  const scene = new Scene();
  scene.static(game.layout, game.def.name, game.obstacles, game.cup.radius);
  scene.dynamic(game.obstacles, game.layout, game.def.name, windOf(game.def.name), {});
  return scene;
}

/** Every matrix of the scene's moving part, copied, written at game time `t`. */
const written = (scene: Scene, t: number) => scene.writeMoving(t).map((m) => Float32Array.from(m.matrices));

describe('the clouds a hole draws', () => {
  for (const [course, index] of [
    ['The Links', 0],
    ['The Fells', 8],
    ['The Meadow', 0],
  ] as const) {
    it(`are all there while the sky is seen, and none is a size to draw while it is not: ${course}, hole ${index + 1}`, () => {
      const scene = drawn(course, index);
      scene.setSky(true);
      scene.writeMoving(100);
      expect(scene.skyDrawn(), 'the sky as it always was').toBe(BACKDROP.clouds);
      scene.setSky(false);
      scene.writeMoving(100);
      expect(scene.skyDrawn(), 'put away').toBe(0);
      scene.setSky(true);
      scene.writeMoving(100);
      expect(scene.skyDrawn(), 'and drawn again').toBe(BACKDROP.clouds);
    });
  }

  it('are drawn by default, as before the sky was a thing a view could not see', () => {
    const scene = drawn('The Links', 0);
    scene.writeMoving(0);
    expect(scene.skyDrawn()).toBe(BACKDROP.clouds);
  });

  it('are the very matrices they were while the sky is seen, and put away they change nothing else on the hole', () => {
    const scene = drawn('The Links', 4);
    scene.setSky(true);
    const seen = written(scene, 345.5);
    scene.setSky(false);
    const away = written(scene, 345.5);
    scene.setSky(true);
    const back = written(scene, 345.5);
    expect(back).toEqual(seen);
    // the clouds are what differs, and only in their size: where each is stays where it was
    const changed = seen.filter((m, k) => m.some((v, i) => v !== away[k][i]));
    expect(changed.length, 'the groups that changed are the clouds, and nothing else').toBe(3);
    for (const m of changed) {
      const k = seen.indexOf(m);
      for (let c = 0; c < m.length / 16; c++) {
        for (const i of [12, 13, 14]) expect(away[k][c * 16 + i], `cloud ${c} stays where it is`).toBe(m[c * 16 + i]);
        for (const i of [0, 1, 5, 10]) expect(Math.abs(away[k][c * 16 + i]), `cloud ${c} has no size`).toBe(0);
      }
    }
  });

  it('are put away over game time as they are drawn: a cloud drifting over the hole is never seen from a play view', () => {
    const scene = drawn('The Fells', 8);
    scene.setSky(false);
    // the time The Fell Race's phone view was inside a cloud, and the times a cloud covered the hole's view
    for (const t of [0, 520, 545, 800, 3000]) {
      scene.writeMoving(t);
      expect(scene.skyDrawn(), `at ${t}`).toBe(0);
    }
  });
});
