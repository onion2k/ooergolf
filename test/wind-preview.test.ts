/**
 * The preview of a shot with a shape in a wind: a trial in a rehearsal of the same hole, so where it says the ball comes
 * down is where the game puts it, to within half a yard, for the driver, the 7-iron and the sand wedge, with a draw, a fade
 * or neither, in ten and twenty miles an hour blowing across the aim either way, with it and against it, on the level and
 * on a slope; and the heading it gives is the way the ball went, which is what the page lays the spread along.
 */
import { describe, expect, it } from 'vitest';
import { bagClub, carryOf } from '../src/bag';
import type { HoleDef } from '../src/course';
import { Previewer } from '../src/preview';
import { DT, field, golfGame } from './helpers';
import { NORTH, windy } from './wind-helpers';

const ROWS = 200,
  COLS = 81;

/** The ground rising by `per` a tile to the north. */
const rising = (per: number) => Float32Array.from({ length: ROWS * COLS }, (_, k) => per * Math.floor(k / COLS));

/** Where the game puts the ball first, struck true from where it lies, with `shape` and `spin`: the ground truth. */
function real(hole: HoleDef, club: string, angle: number, power: number, shape: number, spin: number) {
  const { game, calls } = golfGame(hole);
  game.pick(club);
  game.setShape(shape);
  game.setSpin(spin);
  const start = { x: game.world.x[game.ball], y: game.world.y[game.ball] };
  game.shoot(angle, power);
  for (let f = 0; f < 60 * 12 && game.phase === 'play'; f++) {
    game.step(DT);
    const hit = calls.find(([n, a]) => n === 'landed' && a[3] === true);
    if (hit) return { x: hit[1][0] as number, y: hit[1][1] as number, start };
    const lost = calls.find(([n]) => n === 'splash' || n === 'outOfBounds');
    if (lost) return { x: lost[1][0] as number, y: lost[1][1] as number, start };
  }
  throw new Error('the ball did not come down');
}

function preview(hole: HoleDef, club: string, angle: number, power: number, shape: number, spin: number) {
  const { game } = golfGame(hole);
  const at = { x: game.world.x[game.ball], y: game.world.y[game.ball] };
  return { p: new Previewer(game).run(at, bagClub(club), angle, power, shape, spin), at };
}

const WINDS = [
  ['with the aim', NORTH],
  ['against the aim', -NORTH],
  ['across it, to the left', NORTH + Math.PI / 2],
  ['across it, to the right', NORTH - Math.PI / 2],
] as const;

describe('the preview comes down where the game puts the ball, with a shape in a wind', () => {
  for (const [ground, base] of [
    ['on the level', field('f', ROWS, COLS)],
    ['on a slope rising to the north', field('f', ROWS, COLS, rising(0.3))],
  ] as const) {
    for (const club of ['driver', '7-iron', 'sand-wedge']) {
      it(`${club}, ${ground}: a draw, a fade and neither, in ten and twenty miles an hour from every side`, () => {
        for (const [side, toward] of WINDS)
          for (const mph of [10, 20])
            for (const shape of [-1, 0, 1]) {
              const hole = windy(base, toward, mph);
              const r = real(hole, club, NORTH + 0.1, 0.9, shape, 0);
              const { p } = preview(hole, club, NORTH + 0.1, 0.9, shape, 0);
              expect(p.end, `${mph} mph ${side}, shape ${shape}`).toBe('landed');
              expect(
                Math.hypot(p.x - r.x, p.y - r.y),
                `${mph} mph ${side}, shape ${shape}, yards from the game's landing`,
              ).toBeLessThan(0.5);
            }
      });
    }
  }

  it('is the same with a spin, which has no effect in the air, and the preview stops at the first landing', () => {
    const hole = windy(field('f', ROWS, COLS), NORTH, 10);
    const flat = preview(hole, 'driver', NORTH, 1, 1, 0).p;
    const back = preview(hole, 'driver', NORTH, 1, 1, -1).p;
    expect([back.x, back.y]).toEqual([flat.x, flat.y]);
  });
});

describe('the heading of a preview', () => {
  it('is the aim for a straight shot in no wind, and the way the ball went otherwise', () => {
    const level = field('f', ROWS, COLS);
    for (const angle of [NORTH, NORTH + 0.2, NORTH - 0.3]) {
      const { p } = preview(level, '7-iron', angle, 0.8, 0, 0);
      expect(p.heading).toBeCloseTo(angle, 3);
    }
    // a fade ends to the right of its aim, which is a smaller angle; a draw to the left, a larger
    expect(preview(level, 'driver', NORTH, 1, 1, 0).p.heading).toBeLessThan(NORTH - 0.02);
    expect(preview(level, 'driver', NORTH, 1, -1, 0).p.heading).toBeGreaterThan(NORTH + 0.02);
    // and a wind that blows to the left turns it to the left
    expect(preview(windy(level, NORTH + Math.PI / 2, 15), 'driver', NORTH, 1, 0, 0).p.heading).toBeGreaterThan(
      NORTH + 0.02,
    );
    expect(preview(windy(level, NORTH - Math.PI / 2, 15), 'driver', NORTH, 1, 0, 0).p.heading).toBeLessThan(
      NORTH - 0.02,
    );
  });

  it('is the line from the ball to the ring, to the digit', () => {
    const hole = windy(field('f', ROWS, COLS), 0.4, 12);
    const { p, at } = preview(hole, 'driver', NORTH, 1, 1, 0);
    expect(p.heading).toBeCloseTo(Math.atan2(p.y - at.y, p.x - at.x), 9);
  });

  it('is the line to the cup for a shot that drops in it from the air, in a wind', () => {
    const base = field('f', 60, 41);
    const map = base.map.map((row) => row.replace('C', 'f'));
    const cupRow = 60 - 4 - 4;
    map[cupRow] = map[cupRow].slice(0, 20) + 'C' + map[cupRow].slice(21);
    const hole = windy({ ...base, map }, 0, 6);
    const { game } = golfGame(hole);
    const from = { x: game.world.x[game.ball], y: game.world.y[game.ball] };
    const club = bagClub('sand-wedge');
    const previewer = new Previewer(game);
    const cup = game.layout.cup;
    // scan the aim and the power near a lob to the cup for one that drops in from the air, as the preview of it does
    let found: { angle: number; power: number } | null = null;
    const need = Math.hypot(cup.x - from.x, cup.y - from.y) / carryOf(club, 1);
    for (let a = -40; a <= 40 && !found; a++)
      for (let k = -40; k <= 40 && !found; k++) {
        const angle = Math.atan2(cup.y - from.y, cup.x - from.x) + a * 0.004;
        const power = Math.min(1, need * (1 + k * 0.004));
        if (previewer.run(from, club, angle, power).end === 'holed') found = { angle, power };
      }
    expect(found, 'a lob that drops in, in a wind').not.toBeNull();
    const p = previewer.run(from, club, found!.angle, found!.power);
    expect(p.heading).toBeCloseTo(Math.atan2(cup.y - from.y, cup.x - from.x), 9);
  });

  it('is cleared for the next preview, and is the aim for a shot that cannot be previewed', () => {
    const { game } = golfGame(field('f', ROWS, COLS));
    const previewer = new Previewer(game);
    const from = { x: game.world.x[game.ball], y: game.world.y[game.ball] };
    previewer.run(from, bagClub('driver'), NORTH + 0.4, 1);
    expect(previewer.result.heading).not.toBe(0);
    previewer.run(from, bagClub('putter'), NORTH + 0.4, 1);
    expect(previewer.result.heading).toBe(0);
  });
});
