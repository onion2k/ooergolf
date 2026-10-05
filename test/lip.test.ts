/**
 * A ball that comes to rest balanced on the lip of the cup: its middle over the hole and one side of it on the rim, which the
 * physics put to sleep because it was slow, where it could never stay. It is not a lie a player could strike from (the
 * invariant calls it at rest in the air) and it is not holed: so it falls in, as a ball more than half over a hole does.
 */
import { describe, expect, it } from 'vitest';
import { bagClub } from '../src/bag';
import { carryFrom } from '../src/flight';
import { Game } from '../src/game';
import { checkInvariants } from '../src/invariants';
import { Progress, memoryStore } from '../src/progress';
import { seeded } from '../src/random';
import { LIE } from '../src/surfaces';
import { FLAT } from './helpers';

const DT = 1 / 60;

/** A sand wedge from `back` yards short of the cup, struck at the cup with a draw and topspin, played until it is ready or holed. */
function chip(seed: number, back: number, shape: number, spin: number) {
  const g = new Game(new Progress(memoryStore()), {}, { random: seeded(seed), course: [FLAT.pitch] });
  const { cup } = g.layout;
  g.place(cup.x, cup.y - back);
  g.pick('sand-wedge');
  g.setShape(shape);
  g.setSpin(spin);
  g.shoot(Math.PI / 2, back / (carryFrom(bagClub('sand-wedge'), 1, LIE.fairway) * 1.03));
  for (let f = 0; f < 2400 && g.phase === 'play' && !g.ready; f++) g.step(DT);
  return g;
}

describe('a ball on the lip of the cup', () => {
  it('is not left asleep there: the chip that was found resting on the rim falls in', () => {
    const g = chip(401, 34, -1, 1);
    expect(checkInvariants(g)).toEqual([]);
    expect(g.phase, 'it dropped').toBe('done');
  });

  it('never comes to rest sunk in the mouth of the cup, over every shaped and spun chip near it, and a ball on the rim stays where it is', () => {
    let checked = 0;
    for (const seed of [401, 402, 403])
      for (const shape of [-1, 0, 1])
        for (const spin of [-1, 0, 1])
          for (const back of [30, 32, 34, 36]) {
            const g = chip(seed, back, shape, spin);
            checked++;
            expect(checkInvariants(g), `seed ${seed} shape ${shape} spin ${spin} from ${back}`).toEqual([]);
          }
    expect(checked).toBe(108);
    // standing on the rim, its middle 1.4 from the cup's and as high as any ball stands, is a lie, and is left alone
    const g = new Game(new Progress(memoryStore()), {}, { random: seeded(401), course: [FLAT.pitch] });
    const { cup } = g.layout;
    g.place(cup.x, cup.y - 5);
    g.world.x[g.ball] = cup.x - 1.4;
    g.world.y[g.ball] = cup.y;
    // on level ground a ball stands a radius above it
    g.world.z[g.ball] = g.world.r[g.ball];
    g.world.vx[g.ball] = g.world.vy[g.ball] = g.world.vz[g.ball] = 0;
    for (let f = 0; f < 120; f++) g.step(DT);
    expect(g.phase, 'a ball on the rim does not fall in on its own').toBe('play');
  });

  it('is holed by a ball put back onto it, and is never gone from the world with the hole still in play', () => {
    // a ball struck from where it lay on the rim and lost is put back there, which `place` refuses to do by hand: a fresh ball
    // on the rim is not asleep, as the one that rested there was, and falls in while it settles
    for (const back of [1.1, 1.3, 1.37, 1.44, 1.6]) {
      const g = new Game(new Progress(memoryStore()), {}, { random: seeded(1), course: [FLAT.pitch] });
      const { cup } = g.layout;
      g.lie.x = cup.x + 0.27;
      g.lie.y = cup.y - back;
      (g as unknown as { putBack(x: number, y: number): void }).putBack(cup.x + 50, cup.y);
      expect(checkInvariants(g), `put back ${back} yards from the cup`).toEqual([]);
      // 0.27 across and `back` along is inside the cup's radius up to a little past 1.42, and a ball outside it just rests there
      expect(g.phase, `put back ${back} yards from the cup`).toBe(Math.hypot(0.27, back) < 1.43 ? 'done' : 'play');
    }
  });
});
