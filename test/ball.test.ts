/**
 * The ball on the ground (Part 4): what each figure of a ball moves, and by how much, on a hole of minigolf and on a hole of
 * golf. A putt's power stays how far it rolls, whatever the ball.
 */
import { describe, expect, it } from 'vitest';
import { BUMPER, KICKER, ROLL, SAND, layoutOf } from '../src/arena';
import { CUP } from '../src/course';
import { Game } from '../src/game';
import { ITEMS, NO_KIT, kitOf } from '../src/items';
import { checkInvariants } from '../src/invariants';
import { makeWorld } from '../src/physics';
import { TREE } from '../src/trees';
import { LIE, groundRoll, rollScale } from '../src/surfaces';
import { BELT_HOLE } from './stream-hole';
import { DT, GREEN, field } from './helpers';
import { slotsOf, wearing } from './kits';

const BALLS = ITEMS.filter((i) => i.aisle === 'ball');
const ball = (id: string) => BALLS.find((b) => b.id === id)!;

const dist = (g: Game, x0: number, y0: number) => Math.hypot(g.world.x[g.ball] - x0, g.world.y[g.ball] - y0);
function rollOut(g: Game) {
  for (let f = 0; f < 60 * 20 && !(f > 1 && g.ready); f++) g.step(DT);
}

describe('a putt’s power stays how far it rolls', () => {
  it('rolls a power’s share of 50 on the level, with every ball, as it does with none', () => {
    const farthest = (ids: string[]) => {
      const { game } = wearing(ids, [GREEN]);
      game.place(0, -20);
      game.shoot(Math.PI / 2, 0.4);
      rollOut(game);
      return dist(game, 0, -20);
    };
    const plain = farthest([]);
    // the hardest rolls 40 squared over twice the roll, 50; two fifths of it is twenty (less the sleep at a speed of two)
    expect(plain).toBeGreaterThan(19.5);
    expect(plain).toBeLessThan(20.1);
    for (const b of BALLS) expect(farthest([b.id]), b.id).toBeCloseTo(plain, 0);
  });

  it('is struck harder for a ball that slows sooner, and softer for one that glides', () => {
    const hardest = (id: string) => wearing([id], [GREEN]).game.hardest;
    expect(hardest('clay')).toBeCloseTo(40 * Math.sqrt(1.15), 9);
    expect(hardest('glide')).toBeCloseTo(40 * Math.sqrt(0.85), 9);
    expect(hardest('desert'), 'sand is not the green').toBe(40);
    expect(hardest('links')).toBeCloseTo(40 * Math.sqrt(0.95), 9);
    expect(wearing([], [GREEN]).game.hardest).toBe(40);
  });

  it('rolls the same on a hole of golf’s green too: the putter’s speed is its own, and the ground slows it', () => {
    expect(wearing(['clay'], [field('g')]).game.rollAt(0, 0)).toBeCloseTo(
      groundRoll(LIE.green, undefined, kitOf(slotsOf(['clay']))),
      12,
    );
  });
});

describe('the ground', () => {
  it('slows a minigolf ball by the roll and the green, and a ball in sand by the roll and the sand', () => {
    expect(wearing([], [GREEN]).game.rollAt(0, 0)).toBe(ROLL.roll);
    expect(wearing(['clay'], [GREEN]).game.rollAt(0, 0)).toBeCloseTo(ROLL.roll * 1.15, 12);
    expect(wearing(['links'], [GREEN]).game.rollAt(0, 0)).toBeCloseTo(ROLL.roll * 0.95, 12);
    expect(wearing(['desert'], [GREEN]).game.rollAt(0, 0), 'the sand ball on grass').toBe(ROLL.roll);
    expect(rollScale(LIE.sand, kitOf(slotsOf(['desert'])))).toBeCloseTo(0.55, 12);
    expect(SAND.roll * rollScale(LIE.sand, kitOf(slotsOf(['gem'])))).toBeCloseTo(60 * 0.93 * 0.7, 12);
  });

  /** How far a putter strikes a ball on `surface` of golf, in the hardest the putter gives it. */
  function putted(surface: 'f' | 'r' | 'g' | 's', ids: string[], power = 0.9) {
    const { game } = wearing(ids, [field(surface)]);
    const { tee } = game.layout;
    game.pick('putter');
    game.place(tee.x, tee.y + 12);
    game.shoot(Math.PI / 2, power);
    rollOut(game);
    return dist(game, tee.x, tee.y + 12);
  }

  it('lengthens a putt by the inverse of the figure that slows it: the roll everywhere, and the sand, the green and the rough on their own', () => {
    for (const [surface, id, figure] of [
      ['f', 'clay', 1.15],
      ['f', 'glide', 0.85],
      ['s', 'desert', 0.55],
      ['s', 'snow', 1.3 * 1.1],
      ['g', 'links', 0.95],
      ['r', 'grippy', 0.8],
      ['r', 'clay', 1.15],
    ] as const) {
      const plain = putted(surface, []);
      const worn = putted(surface, [id]);
      // distance goes as speed squared over the slowing, less the rest of a ball asleep at two
      expect(worn / plain, `${id} on ${surface}`).toBeGreaterThan((1 / figure) * 0.93);
      expect(worn / plain, `${id} on ${surface}`).toBeLessThan((1 / figure) * 1.07);
    }
    // a ball that moves only the sand leaves the green as it was
    expect(putted('g', ['desert'])).toBe(putted('g', []));
    expect(putted('s', ['links'])).toBe(putted('s', []));
  });
});

describe('the rail', () => {
  const posts = layoutOf(['#####', '#.C.#', '#.o.#', '#.k.#', '#.T.#', '#####']);
  const trees = layoutOf(['#####', '#gCg#', '#g^g#', '#gTg#', '#####']);
  const restitutions = (layout: ReturnType<typeof layoutOf>, ids: string[]) => {
    const kit = kitOf(slotsOf(ids));
    return makeWorld(layout, CUP, () => 0.5, new Set(), undefined, kit.rail, kit).bumpers.map((b) => b.restitution);
  };

  it('scales the posts, the kickers and the trees by the ball’s rail figure', () => {
    expect(restitutions(posts, [])).toEqual([BUMPER.restitution, KICKER.restitution]);
    const bouncy = restitutions(posts, ['bouncer']);
    expect(bouncy[0]).toBeCloseTo(BUMPER.restitution * 1.5, 12);
    expect(bouncy[1]).toBeCloseTo(KICKER.restitution * 1.5, 12);
    expect(restitutions(trees, [])).toEqual([TREE.restitution]);
    expect(restitutions(trees, ['bowling'])[0]).toBeCloseTo(TREE.restitution * 0.5, 12);
    expect(restitutions(trees, ['steel'])[0]).toBeCloseTo(TREE.restitution * 0.6, 12);
  });

  it('scales the rail itself: a head-on shot returns the ball’s share of what it comes back with', () => {
    const back = (ids: string[]) => {
      const { game } = wearing(ids, [GREEN]);
      game.place(24, 0);
      game.shoot(0, 0.5);
      let before = 0,
        speed = 0;
      for (let f = 0; f < 120 && !speed; f++) {
        before = Math.hypot(game.world.vx[game.ball], game.world.vy[game.ball]);
        game.step(DT);
        if (game.world.vx[game.ball] < 0)
          speed = Math.hypot(game.world.vx[game.ball], game.world.vy[game.ball]) / before;
      }
      return speed;
    };
    const plain = back([]);
    expect(plain).toBeGreaterThan(0.5);
    for (const [id, figure] of [
      ['super', 1.5],
      ['bowling', 0.5],
      ['tacky', 0.75],
      ['marble', 1.1],
    ] as const)
      expect(back([id]) / plain, id).toBeCloseTo(figure, 1);
  });

  it('holds a hole’s world to the figure it was begun with, and tells it as the game’s bounce', () => {
    expect(wearing(['super'], [GREEN]).game.bounceScale).toBe(1.5);
    expect(wearing([], [GREEN]).game.bounceScale).toBe(1);
  });

  it('breaks no rule at the hardest shot into a corner with the springiest ball and the hardest club', () => {
    const { game } = wearing(
      ['super', 'mallet', 'shoes'].filter((id) => id !== 'x'),
      [GREEN],
    );
    game.place(20, 20);
    game.shoot(Math.PI / 4, 1);
    for (let f = 0; f < 300; f++) {
      game.step(DT);
      expect(checkInvariants(game), `frame ${f}`).toEqual([]);
    }
  });
});

describe('a landing', () => {
  /** The horizontal speed and the speed up the ball leaves its first landing with, from a 7-iron struck at power 0.8 on the fairway. */
  function landing(ids: string[]) {
    const seen: { out: [number, number] | null } = { out: null };
    const g: { game?: Game } = {};
    const w = wearing(ids, [field('f')], () => 0.5, {
      landed: (_x: number, _y: number, _s: number, first: boolean) => {
        const { world, ball } = g.game!;
        if (first && !seen.out) seen.out = [Math.hypot(world.vx[ball], world.vy[ball]), world.vz[ball]];
      },
    });
    g.game = w.game;
    w.game.pick('7-iron');
    w.game.shoot(Math.PI / 2, 0.8);
    for (let f = 0; f < 600 && !seen.out; f++) w.game.step(DT);
    if (!seen.out) throw new Error('no landing');
    return seen.out;
  }

  it('keeps the ball’s share of the speed along the ground at the first landing, and hops by the ball’s share', () => {
    const [along, up] = landing([]);
    expect(up).toBeGreaterThan(0);
    for (const [id, keep, hop] of [
      ['links', 1.25, 1],
      ['snow', 0.5, 1],
      ['tacky', 0.6, 1],
      ['super', 1, 1.5],
      ['cork', 0.8, 0.4],
      ['steel', 1, 0.5],
      ['bouncer', 1, 1.5],
      ['feather', 1, 0.7],
    ] as const) {
      const [a, u] = landing([id]);
      expect(a / along, `${id} keep`).toBeCloseTo(keep, 3);
      expect(u / up, `${id} hop`).toBeCloseTo(hop, 3);
    }
  });

  it('is the landing that was, for a ball that moves neither', () => {
    const [along, up] = landing([]);
    // the roll is the ground's, felt for a step of contact and not at the landing itself
    for (const id of ['desert', 'clay', 'glide']) {
      const [a, u] = landing([id]);
      expect(a / along, id).toBeCloseTo(1, 2);
      expect(u / up, id).toBeCloseTo(1, 2);
    }
    expect(landing(['desert'])).toEqual(landing([]));
  });
});

describe('the belt', () => {
  /** The ball’s speed along a belt of speed three, `frames` after it is put on it at rest. */
  function carried(ids: string[], frames: number) {
    const { game } = wearing(ids, [BELT_HOLE]);
    const belt = game.obstacles.belts[0];
    game.place(belt.cx, belt.cy);
    for (let f = 0; f < frames; f++) game.step(DT);
    return game.world.vx[game.ball] * belt.dx + game.world.vy[game.ball] * belt.dy;
  }

  it('pulls a ball as hard as the ball’s figure says: more for the featherie, half for the grippy ball, and as it did for none', () => {
    const plain = carried([], 6);
    const feather = carried(['feather'], 6);
    const grippy = carried(['grippy'], 6);
    const bowling = carried(['bowling'], 6);
    expect(plain).toBeGreaterThan(0);
    expect(feather).toBeGreaterThan(plain);
    expect(grippy).toBeLessThan(plain);
    expect(bowling).toBeLessThan(plain);
    expect(bowling).toBeGreaterThan(grippy);
    // the first frame: half the pull for the grippy ball, a quarter more for the featherie, and the bowling ball’s 0.6 between
    expect(carried(['grippy'], 1) / carried([], 1)).toBeGreaterThan(0.4);
    expect(carried(['grippy'], 1) / carried([], 1)).toBeLessThan(0.65);
    expect(carried(['feather'], 1) / carried([], 1)).toBeGreaterThan(1.1);
    expect(carried(['feather'], 1) / carried([], 1)).toBeLessThan(1.4);
    expect(carried(['bowling'], 1) / carried([], 1)).toBeGreaterThan(0.5);
    expect(carried(['bowling'], 1) / carried([], 1)).toBeLessThan(0.75);
    // and every belt carries the ball to its own speed in the end
    expect(carried(['grippy'], 90)).toBeCloseTo(3, 1);
  });

  it('gives the physics its belts when the ball leaves them alone, and the game pulls them when it does not', () => {
    expect(wearing(['clay'], [BELT_HOLE]).game.world.belts).toHaveLength(1);
    expect(wearing([], [BELT_HOLE]).game.world.belts).toHaveLength(1);
    expect(wearing(['grippy'], [BELT_HOLE]).game.world.belts).toHaveLength(0);
    expect(carried(['clay'], 6)).toBeCloseTo(carried([], 6), 9);
  });
});

describe('when a ball takes hold', () => {
  it('takes hold at the next hole for the ground, and at once for a club’s strike', () => {
    const { game } = wearing([], [GREEN, GREEN]);
    expect(game.rollAt(0, 0)).toBe(ROLL.roll);
    game.progress.save.coins = 1000;
    expect(game.buy('clay')).toBe(true);
    expect(game.buy('mallet')).toBe(true);
    expect(game.equip('clay')).toBe(true);
    expect(game.equip('mallet')).toBe(true);
    // the club is felt now, the ball when the next hole is begun
    expect(game.hardest).toBe(40 * 1.15);
    expect(game.rollAt(0, 0)).toBe(ROLL.roll);
    // what the hole was begun with is what the rules hold it to, however the kit is changed in the middle of it (the fuzzer’s try-on found
    // the rail and the cup held to the kit as it is and not as the hole was made)
    expect(game.equip('clay') && checkInvariants(game)).toEqual([]);
    expect(game.ground).toBe(NO_KIT);
    expect(game.bounceScale).toBe(1);
    game.begin(1);
    expect(game.rollAt(0, 0)).toBeCloseTo(ROLL.roll * 1.15, 12);
    expect(game.ground.roll).toBe(1.15);
    expect(game.hardest).toBeCloseTo(40 * 1.15 * Math.sqrt(1.15), 9);
    // a ball emptied is gone at the next hole as well
    game.unequip('ball');
    expect(game.rollAt(0, 0)).toBeCloseTo(ROLL.roll * 1.15, 12);
    game.begin(0);
    expect(game.rollAt(0, 0)).toBe(ROLL.roll);
  });

  it('takes the bounce of the rail at the next hole too', () => {
    const { game } = wearing([], [GREEN, GREEN]);
    game.progress.save.coins = 1000;
    game.buy('super');
    game.buy('horseshoe');
    game.equip('super');
    game.equip('horseshoe');
    expect(checkInvariants(game), 'a ball and a cup put on in the middle of a hole').toEqual([]);
    expect(game.bounceScale).toBe(1);
    expect(game.cup.radius).toBe(CUP.radius);
    game.begin(1);
    expect(game.bounceScale).toBe(1.5);
    expect(game.cup.radius).toBe(1.8);
  });
});

describe('every ball', () => {
  it('moves something on a hole of golf and something on a hole of minigolf', () => {
    for (const b of BALLS) {
      const k = kitOf(slotsOf([b.id]));
      const mini = [k.roll, k.sand, k.green, k.rail, k.belt].some((v) => v !== 1);
      const golf = [k.roll, k.sand, k.green, k.rough, k.rail, k.keep, k.hop].some((v) => v !== 1);
      expect(mini, `${b.id} on minigolf`).toBe(true);
      expect(golf, `${b.id} on golf`).toBe(true);
    }
    expect(ball('gem').figures.roll).toBe(0.93);
  });
});
