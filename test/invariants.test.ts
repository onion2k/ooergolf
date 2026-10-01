import { describe, expect, it } from 'vitest';
import { BALL, BUMPER, FASTEST, HARDEST_SHOT } from '../src/arena';
import type { HoleDef } from '../src/course';
import { CameraRig, TILT, VIEW } from '../src/camera';
import { checkInvariants, planProblems, previewProblems, viewProblems } from '../src/invariants';
import { Previewer } from '../src/preview';
import { bagClub, carrying } from '../src/bag';
import { Autopilot } from '../src/autopilot';
import { fastest } from '../src/game';
import { WIND, windPush, windReach } from '../src/shaping';
import { GREEN, field, golfGame, newGame as newOn, onGreen as newGame, settle } from './helpers';

describe('what must always hold', () => {
  it('holds of a new game, and of one played on a little', () => {
    const { game } = newGame();
    expect(checkInvariants(game)).toEqual([]);
    game.shoot(1, 0.7);
    settle(game);
    expect(checkInvariants(game)).toEqual([]);
  });

  it('reports a ball in the rock, and a ball that is not a number', () => {
    const { game } = newGame();
    const { world, ball } = game;
    world.x[ball] = game.layout.originX + 1;
    world.y[ball] = game.layout.originY + 1;
    expect(checkInvariants(game).join('\n')).toMatch(/in the rock: ball/);
    world.x[ball] = NaN;
    expect(checkInvariants(game).join('\n')).toMatch(/not a number: ball/);
  });

  it('reports a body of no kind, a count that is out, and a time that is not one', () => {
    const { game } = newGame();
    const { world, ball } = game;
    world.kind[ball] = 9;
    expect(checkInvariants(game).join('\n')).toMatch(/of no kind \(9\)/);
    world.kind[ball] = BALL;
    world.alive[ball] = 0;
    expect(checkInvariants(game).join('\n')).toMatch(/counts 1 live, and has 0/);
    world.alive[ball] = 1;
    expect(checkInvariants(game)).toEqual([]);
    game.t = NaN;
    expect(checkInvariants(game).join('\n')).toMatch(/the time is NaN/);
  });

  it('reports a second ball, and the ball gone', () => {
    const { game } = newGame();
    const other = game.world.spawn(BALL, 5, 5, 1);
    expect(checkInvariants(game).join('\n')).toMatch(/2 bodies on the course, and only the ball should be/);
    game.world.remove(other);
    game.world.remove(game.ball);
    expect(checkInvariants(game).join('\n')).toMatch(/the ball is gone/);
  });

  it('reports a card with a score too many or too few, a score out of bounds, and strokes over the limit', () => {
    const { game } = newGame();
    game.card.push(2);
    expect(checkInvariants(game).join('\n')).toMatch(/the card has 1 scores, with 0 holes finished/);
    game.card.length = 0;
    game.phase = 'done';
    expect(checkInvariants(game).join('\n')).toMatch(/the card has 0 scores, with 1 holes finished/);
    game.card.push(0);
    expect(checkInvariants(game).join('\n')).toMatch(/hole 1 is scored 0/);
    game.card[0] = 3;
    game.phase = 'play';
    game.card.length = 0;
    game.strokes = 99;
    expect(checkInvariants(game).join('\n')).toMatch(/99 strokes on hole 1, over its limit/);
  });

  it('reports coins and gems that are not counts, a club no one sells, and a club in hand not owned', () => {
    const { game } = newGame();
    const save = game.progress.save;
    save.coins = -1;
    save.gems = 0.5;
    expect(checkInvariants(game).join('\n')).toMatch(/the coins are -1[\s\S]*the gems are 0.5/);
    save.coins = save.gems = 0;
    save.owned.push('stolen');
    expect(checkInvariants(game).join('\n')).toMatch(/a club no one sells is owned: stolen/);
    save.owned.pop();
    save.club = 'gold';
    expect(checkInvariants(game).join('\n')).toMatch(/the club in hand, gold, is not owned/);
    save.club = 'putter';
    save.owned.length = 0;
    expect(checkInvariants(game).join('\n')).toMatch(/the starting putter is not owned/);
  });

  it('reports a ball inside something that moves', () => {
    const { game } = newGame();
    const { world, ball } = game;
    expect(checkInvariants(game)).toEqual([]);
    game.obstacles.pushers.push({
      x: world.x[ball],
      y: world.y[ball],
      z: world.z[ball],
      yaw: 0,
      hx: 2,
      hy: 2,
      hz: 2,
      vx: 0,
      vy: 0,
      spin: 0,
      px: 0,
      py: 0,
      owner: 0,
    });
    expect(checkInvariants(game).join('\n')).toMatch(/inside a moving box/);
  });

  it('reports a ball at rest in the air, with nothing under it', () => {
    const { game } = newGame();
    const { world, ball } = game;
    expect(world.asleep[ball], 'at rest on the tee').toBe(1);
    expect(checkInvariants(game)).toEqual([]);
    world.z[ball] += 0.5;
    expect(checkInvariants(game).join('\n')).toMatch(/at rest in the air: ball/);
    // moving, it may be in the air: thrown up by the rim, or off an edge
    world.wake(ball);
    expect(checkInvariants(game)).toEqual([]);
  });

  it('reports a ball inside a post, and takes one at rest on the top of a post as lying on something', () => {
    const POST: HoleDef = {
      name: 'test post',
      par: 3,
      map: ['#####', '#.C.#', '#...#', '#.o.#', '#...#', '#.T.#', '#####'],
    };
    const { game } = newOn(1, null, [POST]);
    const { world, ball } = game;
    const post = game.layout.bumpers[0];
    expect(checkInvariants(game)).toEqual([]);
    world.x[ball] = post.x + BUMPER.radius;
    world.y[ball] = post.y;
    expect(checkInvariants(game).join('\n')).toMatch(/inside a post/);
    // on its top, which is a floor to what lands on it, and asleep there
    world.x[ball] = post.x;
    world.z[ball] = BUMPER.height + world.r[ball];
    world.vx[ball] = world.vy[ball] = world.vz[ball] = 0;
    world.asleep[ball] = 1;
    expect(checkInvariants(game)).toEqual([]);
  });

  it('lets a post throw a ball half as fast again as the club struck it, and no faster', () => {
    const { game } = newGame();
    game.shoot(0, 1);
    game.world.vx[game.ball] = HARDEST_SHOT * FASTEST * 0.999;
    expect(checkInvariants(game)).toEqual([]);
    game.world.vx[game.ball] = HARDEST_SHOT * FASTEST * 1.01;
    expect(checkInvariants(game).join('\n')).toMatch(/faster than a post and a slope may make it/);
  });

  it('holds the ball to the club that struck it, not to one put in hand while it rolls', () => {
    const { game } = newGame();
    game.progress.save.owned.push('gold');
    game.equip('gold');
    const gold = game.hardest;
    expect(gold, 'a club harder than the putter').toBeGreaterThan(HARDEST_SHOT);
    game.shoot(0, 1);
    expect(game.equip('putter')).toBe(true);
    expect(game.hardest).toBe(HARDEST_SHOT);
    // thrown by a post faster than any the putter could have been, but no faster than the gold's
    game.world.vx[game.ball] = gold * FASTEST * 0.99;
    expect(gold * FASTEST * 0.99, 'past what the putter allows').toBeGreaterThan(HARDEST_SHOT * FASTEST);
    expect(checkInvariants(game), 'struck by the gold, and going as a post may throw what the gold struck').toEqual([]);
    game.world.vx[game.ball] = gold * FASTEST * 1.01;
    expect(checkInvariants(game).join('\n')).toMatch(/faster than a post and a slope may make it/);
  });

  it('reports strokes that are not a count', () => {
    const { game } = newGame();
    game.shoot(0, 1);
    expect(checkInvariants(game)).toEqual([]);
    game.strokes = 1.5;
    expect(checkInvariants(game).join('\n')).toMatch(/strokes are 1.5/);
    game.strokes = -1;
    expect(checkInvariants(game).join('\n')).toMatch(/strokes are -1/);
  });
});

describe('what must always hold of the camera', () => {
  it('holds of a camera as it begins, turned and tilted and zoomed as far as a player can', () => {
    const rig = new CameraRig();
    expect(viewProblems(rig)).toEqual([]);
    rig.orbit(37, 100);
    rig.zoom(-1000);
    expect(viewProblems(rig)).toEqual([]);
    rig.orbit(-11, -100);
    rig.zoom(1000);
    expect(viewProblems(rig)).toEqual([]);
  });

  it('reports a tilt out of its limits, a turn or a tilt that is not a number, and a distance out of its own', () => {
    const rig = new CameraRig();
    rig.tilt = TILT.most + 0.1;
    expect(viewProblems(rig).join('\n')).toMatch(/tilt/);
    rig.tilt = TILT.least - 0.1;
    expect(viewProblems(rig).join('\n')).toMatch(/tilt/);
    rig.tilt = Number.NaN;
    expect(viewProblems(rig).join('\n')).toMatch(/tilt.*not a number/);
    rig.tilt = TILT.home;
    rig.azimuth = Number.POSITIVE_INFINITY;
    expect(viewProblems(rig).join('\n')).toMatch(/turn.*not a number/);
    rig.azimuth = 9;
    expect(viewProblems(rig).join('\n'), 'more than a turn').toMatch(/turn/);
    rig.azimuth = 0;
    rig.distance = 1;
    expect(viewProblems(rig).join('\n')).toMatch(/distance/);
  });

  it('allows a golf hole the further zoom it has, and nothing of it to a hole of minigolf', () => {
    const golf = new CameraRig();
    golf.setGolf(true);
    golf.zoom(1e6);
    expect(golf.distance).toBe(VIEW.golfFar);
    expect(viewProblems(golf)).toEqual([]);
    // a distance that is further than either allows is reported
    golf.distance = VIEW.golfFar + 1;
    expect(viewProblems(golf).join('\n')).toMatch(/distance/);
    const mini = new CameraRig();
    mini.distance = VIEW.far + 1;
    expect(viewProblems(mini).join('\n')).toMatch(/distance/);
  });

  it('reports a lead that is not a number or is under nought', () => {
    const rig = new CameraRig();
    rig.lead = Number.NaN;
    expect(viewProblems(rig).join('\n')).toMatch(/lead/);
    rig.lead = -1;
    expect(viewProblems(rig).join('\n')).toMatch(/lead/);
    rig.lead = 48;
    expect(viewProblems(rig)).toEqual([]);
  });
});

describe('what must always hold of a preview', () => {
  const hole = field('f', 200, 81);
  const aimed = () => {
    const { game } = golfGame(hole);
    const at = { x: game.world.x[game.ball], y: game.world.y[game.ball] };
    const club = bagClub('driver');
    const p = new Previewer(game).run(at, club, Math.PI / 2, 1);
    return { game, at, club, p };
  };

  it('holds of a preview the game made, of every club, at every power', () => {
    const { game } = golfGame(hole);
    const previewer = new Previewer(game);
    const at = { x: game.world.x[game.ball], y: game.world.y[game.ball] };
    for (const id of ['driver', '3-wood', '5-iron', '7-iron', '9-iron', 'pitching-wedge', 'sand-wedge']) {
      for (const power of [0.05, 0.4, 1]) {
        const club = bagClub(id);
        const p = previewer.run(at, club, Math.PI / 2 + power / 4, power);
        expect(previewProblems(game, at, club, p), `${id} at ${power}`).toEqual([]);
      }
    }
  });

  it('reports a flight that is not numbers, that does not begin at the ball, or that goes further than a club can send a ball', () => {
    const { game, at, club, p } = aimed();
    expect(previewProblems(game, at, club, p)).toEqual([]);
    const z = p.points[4];
    p.points[4] = NaN;
    expect(previewProblems(game, at, club, p).join('\n')).toMatch(/not a number/);
    p.points[4] = z;
    expect(previewProblems(game, { x: at.x + 5, y: at.y }, club, p).join('\n')).toMatch(/begin/);
    const carry = p.carry;
    p.carry = 600;
    expect(previewProblems(game, at, club, p).join('\n')).toMatch(/carries/);
    p.carry = carry;
    expect(previewProblems(game, at, club, p)).toEqual([]);
  });

  it('reports a landing that is not where the flight ends, a length that goes backwards, and a spread that is not a spread', () => {
    const { game, at, club, p } = aimed();
    const x = p.x;
    p.x = x + 10;
    expect(previewProblems(game, at, club, p).join('\n')).toMatch(/ends/);
    p.x = x;
    const len = p.length[5];
    p.length[5] = p.length[6] + 1;
    expect(previewProblems(game, at, club, p).join('\n')).toMatch(/length/);
    p.length[5] = len;
    p.footprint.across = -1;
    expect(previewProblems(game, at, club, p).join('\n')).toMatch(/spread/);
    p.footprint.across = 3;
    p.footprint.along = p.carry;
    expect(previewProblems(game, at, club, p).join('\n')).toMatch(/spread/);
  });

  it('is nothing to check for a club that has no loft, which is aimed by its dots', () => {
    const { game } = golfGame(hole);
    const at = { x: game.world.x[game.ball], y: game.world.y[game.ball] };
    const putter = bagClub('putter');
    const p = new Previewer(game).run(at, putter, Math.PI / 2, 0.5);
    expect(previewProblems(game, at, putter, p)).toEqual([]);
  });
});

describe('what must always hold of a plan', () => {
  it('is a shot: an aim that is a number, a power over nought and no more than all, and on a golf hole a club of the bag', () => {
    const { game } = golfGame(field('f'));
    const plan = new Autopilot(game).plan()!;
    expect(planProblems(game, plan)).toEqual([]);
    expect(planProblems(game, { ...plan, angle: NaN }).join('\n')).toMatch(/aim/);
    expect(planProblems(game, { ...plan, power: 0 }).join('\n')).toMatch(/power/);
    expect(planProblems(game, { ...plan, power: 1.2 }).join('\n')).toMatch(/power/);
    expect(planProblems(game, { ...plan, club: 'mashie' }).join('\n')).toMatch(/club/);
    expect(planProblems(game, { ...plan, club: undefined }).join('\n')).toMatch(/club/);
    expect(planProblems(game, { ...plan, expect: { x: NaN, y: 0, holed: false } }).join('\n')).toMatch(/expects/);
    // and on a hole of minigolf a plan names no club
    const mini = newGame();
    const putt = new Autopilot(mini.game).plan()!;
    expect(planProblems(mini.game, putt)).toEqual([]);
    expect(planProblems(mini.game, { ...putt, club: 'driver' }).join('\n')).toMatch(/club/);
  });
});

describe('what must always hold of shape, spin and wind', () => {
  const windy = (speed: number) => golfGame({ ...field('f', 200, 81), wind: speed });

  it('holds of a game that has a shape and a spin chosen, in a wind, and played a little', () => {
    const { game } = windy(WIND.most);
    expect(checkInvariants(game)).toEqual([]);
    game.setShape(1);
    game.setSpin(-1);
    expect(checkInvariants(game)).toEqual([]);
    game.pick('7-iron');
    game.shoot(Math.PI / 2, 0.8);
    for (let k = 0; k < 6; k++) {
      settle(game, 40);
      expect(checkInvariants(game), `after ${k + 1} of 40 frames`).toEqual([]);
    }
  });

  it('reports a shape or a spin that is not a number from minus one to one', () => {
    const { game } = windy(10);
    game.shape = 2;
    expect(checkInvariants(game).join('\n')).toMatch(/the shape is 2, not a number from -1 to 1/);
    game.shape = NaN;
    expect(checkInvariants(game).join('\n')).toMatch(/the shape is NaN/);
    game.shape = -1;
    expect(checkInvariants(game)).toEqual([]);
    game.spin = -1.5;
    expect(checkInvariants(game).join('\n')).toMatch(/the spin is -1.5/);
    game.spin = Infinity;
    expect(checkInvariants(game).join('\n')).toMatch(/the spin is Infinity/);
    game.spin = 1;
    expect(checkInvariants(game)).toEqual([]);
  });

  it('reports a wind that is not a speed from nought to the most, or that blows along no direction', () => {
    // a hole's wind is worked out as it begins, so each bad one is a hole that begins with it
    expect(checkInvariants(windy(10).game)).toEqual([]);
    expect(checkInvariants(windy(WIND.most).game)).toEqual([]);
    expect(checkInvariants(windy(WIND.most + 1).game).join('\n')).toMatch(/the wind is 26 miles an hour/);
    expect(checkInvariants(windy(-3).game).join('\n')).toMatch(/the wind is -3/);
    expect(checkInvariants(windy(NaN).game).join('\n')).toMatch(/the wind is NaN/);
    // a direction that is no unit vector, put on the game itself
    const { game } = windy(10);
    Object.defineProperty(game, 'wind', { get: () => ({ x: 3, y: 4, speed: 5 }), configurable: true });
    expect(checkInvariants(game).join('\n')).toMatch(/blows along 3,4, no direction/);
    delete (game as unknown as Record<string, unknown>).wind;
    expect(checkInvariants(game)).toEqual([]);
  });

  it('reports any wind at all on a hole of minigolf, which is always calm: the game makes it so, and the rule holds it to it', () => {
    // a hole of minigolf given a wind is calm all the same, since its ball never leaves the ground
    const given = newOn(1, null, [{ ...GREEN, wind: 8 }]);
    expect(given.game.layout.golf).toBe(false);
    expect(given.game.wind.speed).toBe(0);
    expect(checkInvariants(given.game)).toEqual([]);
    // but a game of minigolf that is blowing is reported
    Object.defineProperty(given.game, 'wind', { get: () => ({ x: 0, y: 1, speed: 8 }), configurable: true });
    expect(checkInvariants(given.game).join('\n')).toMatch(/the wind is 8 on a hole of minigolf, where it is calm/);
    const calm = newOn(1, null, [GREEN]);
    expect(checkInvariants(calm.game)).toEqual([]);
  });

  it('lets a tailwind add to the ball its push for as long as it flies, and nothing more', () => {
    const { game } = windy(WIND.most);
    game.shoot(0, 1);
    const { world, ball } = game;
    const most = fastest(game, world.x[ball], world.y[ball]) * 1.001;
    const blown = windPush(WIND.most) * 8;
    expect(blown, 'a push that is something').toBeGreaterThan(0);
    world.vx[ball] = most + blown * 0.99;
    world.vy[ball] = world.vz[ball] = 0;
    expect(checkInvariants(game), 'within what the wind adds').toEqual([]);
    world.vx[ball] = most + blown * 1.05;
    const found = checkInvariants(game).join('\n');
    expect(found).toMatch(/along the ground, faster than a post and a slope may make it/);
    expect(found).toMatch(/in all, faster than any club could send it/);
    // the same speed in a calm is too fast
    const calm = windy(0);
    calm.game.shoot(0, 1);
    calm.game.world.vx[calm.game.ball] = most + blown * 0.99;
    calm.game.world.vy[calm.game.ball] = calm.game.world.vz[calm.game.ball] = 0;
    expect(checkInvariants(calm.game).join('\n')).toMatch(/faster than a post/);
  });

  it('allows a preview the carry a wind adds, and a heading that is a number, and no more', () => {
    const { game } = windy(WIND.most);
    const at = { x: game.world.x[game.ball], y: game.world.y[game.ball] };
    const club = bagClub('driver');
    const p = new Previewer(game).run(at, club, Math.PI / 2, 1, 1, 0);
    expect(previewProblems(game, at, club, p)).toEqual([]);
    // a carry past what the club and the strongest tailwind could do is reported, and one within it is not
    const carry = p.carry;
    p.carry = carrying(club.hardest, club.loft) * 1.06 + windReach(club, 1, WIND.most) + 5;
    expect(previewProblems(game, at, club, p).join('\n'), 'a little over, with the wind').not.toMatch(/carries/);
    p.carry = 1000 + windReach(club, 1, WIND.most) * 1.1;
    expect(previewProblems(game, at, club, p).join('\n')).toMatch(/carries/);
    p.carry = carry;
    p.heading = NaN;
    expect(previewProblems(game, at, club, p).join('\n')).toMatch(/heading is NaN/);
    p.heading = Infinity;
    expect(previewProblems(game, at, club, p).join('\n')).toMatch(/heading is Infinity/);
    p.heading = 1;
    expect(previewProblems(game, at, club, p)).toEqual([]);
  });
});
