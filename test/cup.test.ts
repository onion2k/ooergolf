/**
 * What the cup catches, measured on an open green, by the speed a ball
 * arrives at. The cup has a rim, as artshape-physics 0.4.0 makes one, and
 * no pull: a ball slow enough drops, and one too fast is thrown up off the
 * far side and runs over; off the middle, the rim meets it sooner and turns
 * it away, so a putt lips out at a speed that would have dropped through the
 * middle. Figures from the physics' own table for a cup of this size, run
 * again here on the game's own green.
 */
import { describe, expect, it } from 'vitest';
import { HARDEST_SHOT, ROLL, powerFor } from '../src/arena';
import { CUP } from '../src/course';
import type { HoleDef } from '../src/course';
import { CLEAR_OF_CUP } from '../src/game';
import { DT, newGame } from './helpers';

/** A green with the cup in its middle and room all round, so a ball that runs past goes on. */
const OPEN: HoleDef = {
  name: 'Open green',
  par: 2,
  map: [
    '#################',
    ...Array.from({ length: 7 }, () => '#...............#'),
    '#.......C.......#',
    ...Array.from({ length: 7 }, () => '#...............#'),
    '#.......T.......#',
    '#################',
  ],
};

/**
 * A ball struck at the cup from just clear of it, `aside` off its middle,
 * arriving at the cup's edge at `speed`: whether it drops, and its heading
 * once it is past, in radians off straight on. A ball that runs past is
 * over, and one that comes back off the rail behind is not a catch.
 */
function putt(speed: number, aside = 0): { holed: boolean; turned: number } {
  const { game } = newGame(1, null, [OPEN]);
  const { cup } = game.layout;
  const y0 = cup.y - CLEAR_OF_CUP - 0.1;
  game.place(cup.x + aside, y0);
  const toEdge = cup.y - Math.sqrt(Math.max(0, CUP.radius ** 2 - aside ** 2)) - y0;
  game.shoot(Math.PI / 2, powerFor(Math.sqrt(speed * speed + 2 * ROLL.roll * toEdge), HARDEST_SHOT));
  const { world, ball } = game;
  let turned = 0;
  for (let f = 0; f < 300 && game.phase === 'play'; f++) {
    game.step(DT);
    if (!world.alive[ball]) continue;
    // its heading as it leaves the far side of the rim, before the green has slowed it to a stop
    if (!turned && world.y[ball] > cup.y + CUP.radius) turned = Math.abs(Math.atan2(world.vx[ball], world.vy[ball]));
    if (world.y[ball] > cup.y + CUP.radius + 2.5 || (f > 10 && game.ready)) return { holed: false, turned };
  }
  return { holed: game.phase === 'done', turned };
}

describe('the cup', () => {
  /** Through the cup `aside` off its middle: every speed up to `caught` drops, and every one from `over` to the hardest shot runs on. */
  const holds = (aside: number, caught: number, over: number) => {
    for (let v = 2; v <= caught; v += 1)
      expect(putt(v, aside).holed, `${v} a second, ${aside.toFixed(2)} aside`).toBe(true);
    for (let v = over; v <= HARDEST_SHOT; v += 2)
      expect(putt(v, aside).holed, `${v} a second, ${aside.toFixed(2)} aside`).toBe(false);
  };

  it('has a rim and no pull toward it', () => {
    expect(CUP.rim).toBe(0.3);
    expect(CUP.pull).toBe(0);
  });

  it('catches every putt through the middle up to 18 a second, and throws every one from 23 up and over', () => {
    holds(0, 18, 23);
  });

  it('catches off the middle only slower: up to 7 at 0.6 of its radius, and lets every one from 9 lip out', () => {
    holds(CUP.radius * 0.6, 7, 9);
  });

  it('turns a putt that lips out off the middle, by the rim, rather than letting it run straight on', () => {
    const { holed, turned } = putt(12, CUP.radius * 0.6);
    expect(holed).toBe(false);
    expect(turned, 'turned away by the rim').toBeGreaterThan(0.1);
  });

  it('never leaves a ball hanging in its mouth: one running round inside the rim drops', () => {
    // as the fuzzer found it, seed 18: held up by the rim and going round it at ten a second, a lap about as long as
    // the physics' sleep window, so it was back where it was as the window closed, and was put to sleep there for good
    const { game } = newGame(1, null, [OPEN]);
    const { world, ball, layout } = game;
    world.x[ball] = layout.cup.x + 0.125;
    world.y[ball] = layout.cup.y + 0.547;
    world.z[ball] = 0.458;
    world.vx[ball] = -10.7;
    world.vy[ball] = 1.14;
    world.vz[ball] = -1.61;
    world.wake(ball);
    for (let f = 0; f < 120 && game.phase === 'play'; f++) {
      game.step(DT);
      expect(world.asleep[ball], `asleep in the mouth of the cup at frame ${f}`).toBe(0);
    }
    expect(game.phase, 'holed').toBe('done');
  });

  it('refuses a ball put down on the cup or its rim, and takes one clear of both', () => {
    const { game } = newGame(1, null, [OPEN]);
    const { cup } = game.layout;
    expect(() => game.place(cup.x, cup.y - CUP.radius - 1.2)).toThrow(/near the cup/);
    expect(() => game.place(cup.x, cup.y - CLEAR_OF_CUP - 0.01)).not.toThrow();
    expect(() => game.place(game.layout.originX + 1, game.layout.originY + 1)).toThrow(/grass/);
  });
});
