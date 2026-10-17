/**
 * The caddie: a tip when a golf ball comes to rest, worked out from previews a step at a time. These hold what it says to the
 * game's own physics (a tip's shot comes down clear), what it says it about (the club in hand, the line of play), when it says
 * nothing, and that it changes nothing of the game it reads.
 */
import { describe, expect, it } from 'vitest';
import { BAG } from '../src/bag';
import { CADDIE, Caddie, CaddieTalk, bestSpin, fineText, speaks, tookTip, troubleOf, type Spun } from '../src/caddie';
import { COURSES, type HoleDef } from '../src/course';
import { Game } from '../src/game';
import { GHOST_FRAMES } from '../src/preview';
import { Progress, memoryStore } from '../src/progress';
import { DT, golfGame } from './helpers';
import { CADDIE_HOLES, FLAT } from './level';
import { lieAt } from '../src/arena';
import { LIE } from '../src/surfaces';

const { pondRight, pondAcross } = CADDIE_HOLES;
/** The most steps a look takes: its flights, and three rolls to rest a slice a step, each no longer than the longest roll. */
const LOOK_STEPS = CADDIE.previews + CADDIE.spins * (1 + Math.ceil(GHOST_FRAMES / CADDIE.slice)) + 1;

function ready(hole: HoleDef) {
  const { game } = golfGame(hole);
  for (let f = 0; f < 600 && !game.ready; f++) game.step(DT);
  return game;
}

describe('the caddie', () => {
  it('offers a draw when a straight drive finds the water and a draw stays clear', () => {
    const game = ready(pondRight);
    expect(game.inHand.id).toBe('driver');
    const tip = new Caddie(game).advise();
    expect(tip).not.toBeNull();
    expect(tip!.kind).toBe('shape');
    expect(tip!.club).toBe('driver');
    expect(tip!.shape).toBe(-1);
    expect(tip!.text).toMatch(/^Driver finds the water at \d+ yd\. A draw bends it clear\.$/);
    expect(tip!.button).toBe('Try a draw');
  });

  it('offers a club to lay up with when no shape of the club in hand stays dry', () => {
    const game = ready(pondAcross);
    const tip = new Caddie(game).advise();
    expect(tip).not.toBeNull();
    expect(tip!.kind).toBe('club');
    expect(tip!.shape).toBe(0);
    const k = BAG.findIndex((c) => c.id === tip!.club);
    expect(k).toBeGreaterThan(0);
    expect(tip!.text).toMatch(/^Driver finds the water at \d+ yd\. The .+ lays up at \d+ yd on the (fairway|rough)\./);
    expect(tip!.button).toMatch(new RegExp(`^Take the ${BAG[k].name.toLowerCase()}`));
  });

  it('offers the club that carries to the pin when the one in hand flies it', () => {
    const game = ready(FLAT.pitch);
    expect(game.inHand.id).toBe('driver');
    const tip = new Caddie(game).advise();
    expect(tip).not.toBeNull();
    expect(tip!.kind).toBe('club');
    // the shortest club whose full carry reaches 105 yards: the pitching wedge carries about 101, the 9-iron 120
    expect(tip!.club).toBe('9-iron');
    expect(tip!.text).toMatch(
      /^Driver carries \d+, and the pin is 10\d yd\. A full 9-iron (carries \d+|drops in the cup)\./,
    );
  });

  it('says nothing when the club in hand comes down clear and short of the pin', () => {
    const game = ready(FLAT.long);
    expect(new Caddie(game).advise()).toBeNull();
  });

  it('says nothing for a club already shaped as it would say', () => {
    const game = ready(pondRight);
    game.setShape(-1);
    const tip = new Caddie(game).advise();
    expect(tip === null || tip.club !== 'driver' || tip.shape !== -1).toBe(true);
  });

  it('says nothing on the putting green, with the putter in hand, or on a hole of minigolf', () => {
    const green = ready(FLAT.pitch);
    const cup = green.layout.cup;
    green.place(cup.x + 6, cup.y);
    for (let f = 0; f < 60 && !green.ready; f++) green.step(DT);
    expect(lieAt(green.layout, cup.x + 6, cup.y)).toBe(LIE.green);
    expect(new Caddie(green).advise()).toBeNull();

    const putter = ready(FLAT.pitch);
    putter.pick('putter');
    expect(new Caddie(putter).advise()).toBeNull();

    const mini = new Game(new Progress(memoryStore()), {}, { random: () => 0.5 });
    for (let f = 0; f < 600 && !mini.ready; f++) mini.step(DT);
    expect(mini.layout.golf).toBe(false);
    expect(new Caddie(mini).advise()).toBeNull();
  });

  it('spends at most one preview a step and no more than its limit a look', () => {
    for (const hole of [pondRight, pondAcross, FLAT.pitch, FLAT.long]) {
      const game = ready(hole);
      const caddie = new Caddie(game);
      caddie.begin();
      let steps = 0,
        last = 0;
      while (!caddie.done) {
        caddie.step();
        steps++;
        expect(caddie.previews - last).toBeLessThanOrEqual(1);
        last = caddie.previews;
      }
      expect(caddie.previews).toBeLessThanOrEqual(CADDIE.previews + CADDIE.spins);
      expect(steps).toBeLessThanOrEqual(LOOK_STEPS);
    }
  });

  it('changes nothing of the game: its chance, its clock, its ball, its club and its shape', () => {
    let drawn = 0;
    const { game } = golfGame(pondAcross, () => {
      drawn++;
      return 0.5;
    });
    for (let f = 0; f < 600 && !game.ready; f++) game.step(DT);
    const before = {
      drawn,
      t: game.t,
      x: game.world.x[game.ball],
      y: game.world.y[game.ball],
      strokes: game.strokes,
      club: game.inHand.id,
      shape: game.shape,
      bodies: game.world.live,
    };
    new Caddie(game).advise();
    expect({
      drawn,
      t: game.t,
      x: game.world.x[game.ball],
      y: game.world.y[game.ball],
      strokes: game.strokes,
      club: game.inHand.id,
      shape: game.shape,
      bodies: game.world.live,
    }).toEqual(before);
  });

  it('gives a tip on the tees of the real courses only where its own shot, tried again, comes down clear', () => {
    let tips = 0;
    const kinds = new Set<string>();
    for (const name of ['The Heath', 'The Fells']) {
      const holes = COURSES.find((c) => c.name === name)!.holes;
      for (const hole of holes) {
        const game = ready(hole);
        const caddie = new Caddie(game);
        const tip = caddie.advise();
        if (!tip) continue;
        tips++;
        kinds.add(tip.kind);
        expect(troubleOf(caddie.retry(tip))).toBeNull();
        // a shot that comes down clear by striking a hillside a few yards out is no advice
        expect(tip.carry).toBeGreaterThan(100);
        expect(
          tip.club !== game.inHand.id || tip.shape !== Math.sign(game.shape) || tip.spin !== Math.sign(game.spin),
        ).toBe(true);
      }
    }
    // The Heath's tees found trouble with a driver along the line on twenty of thirty-six over four rounds
    expect(tips).toBeGreaterThan(0);
  });

  it('adds back spin to a club that lands on the green and runs off it, where back spin holds it', () => {
    const game = ready(FLAT.pitch);
    const caddie = new Caddie(game);
    const tip = caddie.advise()!;
    expect([tip.kind, tip.club, tip.spin]).toEqual(['club', '9-iron', -1]);
    expect(tip.text).toMatch(
      /It lands on the green and runs off it\. Back spin (stops it \d+ yd from the pin|drops it in the cup)\.$/,
    );
    expect(tip.button).toBe('Take the 9-iron with back spin');
    // tried again with its spin it rests on the green, and flat it does not
    const spun = caddie.retry(tip);
    expect(spun.rest.end === 'holed' || spun.rest.lie === LIE.green).toBe(true);
    const flat = caddie.retry({ ...tip, spin: 0 });
    expect(flat.rest.shown).toBe(false);
  });

  it('offers top spin to a drive that comes up short, where it runs on to a good lie nearer the pin', () => {
    const game = ready(FLAT.road);
    const caddie = new Caddie(game);
    const tip = caddie.advise()!;
    expect([tip.kind, tip.club, tip.shape, tip.spin]).toEqual(['spin', 'driver', 0, 1]);
    expect(tip.text).toMatch(/^Top spin runs the driver on to \d+ yd, \d+ yd from the pin\.$/);
    expect(tip.button).toBe('Add top spin');
    const spun = caddie.retry(tip);
    expect(spun.rest.end).toBe('rest');
    expect([LIE.fairway, LIE.green, LIE.cut]).toContain(spun.rest.lie);
  });

  it('offers no spin that is in hand already', () => {
    const game = ready(FLAT.road);
    game.setSpin(1);
    expect(new Caddie(game).advise()).toBeNull();
  });

  it('keeps a lay-up out of the water its roll would find, with back spin, and says so', () => {
    const game = ready(pondAcross);
    const caddie = new Caddie(game);
    const tip = caddie.advise()!;
    expect(tip.kind).toBe('club');
    expect(tip.spin).toBe(-1);
    expect(tip.text).toMatch(/Struck flat, it runs into the water\. Back spin keeps it (on|in) the \w+/);
    const spun = caddie.retry(tip);
    expect(spun.rest.end).toBe('rest');
    expect(spun.rest.lie).not.toBe(LIE.sand);
  });

  it('counts a shot as taking a tip by its club, and its shape for a tip of shape', () => {
    const shape = {
      kind: 'shape',
      club: 'driver',
      shape: -1,
      spin: 0,
      angle: 0,
      carry: 0,
      text: '',
      button: '',
    } as const;
    expect(tookTip(shape, 'driver', -1)).toBe(true);
    expect(tookTip(shape, 'driver', 0)).toBe(false);
    expect(tookTip(shape, '3-wood', -1)).toBe(false);
    const club = { ...shape, kind: 'club', club: '9-iron', shape: 0 } as const;
    expect(tookTip(club, '9-iron', 1)).toBe(true);
    expect(tookTip(club, 'driver', 0)).toBe(false);
    // a tip of spin is taken by its club and its spin, whatever the shape
    const spin = { ...shape, kind: 'spin', club: 'driver', shape: 0, spin: 1 } as const;
    expect(tookTip(spin, 'driver', -1, 1)).toBe(true);
    expect(tookTip(spin, 'driver', 0, 0)).toBe(false);
    expect(tookTip(spin, '3-wood', 0, 1)).toBe(false);
  });

  it('goes quiet on a kind once three of it are taken', () => {
    expect(speaks('shape', { club: 0, shape: 2, spin: 0 })).toBe(true);
    expect(speaks('shape', { club: 0, shape: 3, spin: 0 })).toBe(false);
    expect(speaks('club', { club: 3, shape: 0, spin: 0 })).toBe(false);
    expect(speaks('spin', { club: 3, shape: 3, spin: 2 })).toBe(true);
    expect(speaks('spin', { club: 0, shape: 0, spin: 3 })).toBe(false);
  });
});

describe('when the caddie speaks', () => {
  const NONE = { club: 0, shape: 0, spin: 0 };
  /** Frames of a talk until its look is done, and then one more: what the page does over the frames after a ball rests. */
  function talkUntilDone(talk: CaddieTalk, game: Game, taken = NONE) {
    let frames = 0;
    do {
      talk.frame(game, taken);
      frames++;
    } while (!talk.looking.done && frames < LOOK_STEPS + 2);
    talk.frame(game, taken);
    return frames;
  }

  it('says a tip of its own accord once the look is done, a preview a frame', () => {
    const game = ready(pondRight);
    const talk = new CaddieTalk();
    talk.hole(game);
    talk.frame(game, NONE);
    expect(talk.said.text).toBeNull();
    const frames = talkUntilDone(talk, game);
    expect(frames).toBeLessThanOrEqual(LOOK_STEPS);
    expect(talk.said.text).toMatch(/A draw bends it clear/);
    expect(talk.said.button).toBe('Try a draw');
  });

  it('puts the tip in hand when its button is pressed, says nothing more of it, and counts the stroke as taking it', () => {
    const game = ready(pondRight);
    const talk = new CaddieTalk();
    talk.hole(game);
    talkUntilDone(talk, game);
    expect(talk.take(game)).toBe(true);
    expect([game.inHand.id, game.shape]).toEqual(['driver', -1]);
    talkUntilDone(talk, game);
    expect(talk.said.text).toBeNull();
    expect(talk.struck('driver', -1)).toBe('shape');
    expect(talk.offered).toBeNull();
  });

  it('counts a stroke that chose the tip without its button, and not one that did not take it', () => {
    const game = ready(FLAT.pitch);
    const talk = new CaddieTalk();
    talk.hole(game);
    talkUntilDone(talk, game);
    expect(talk.offered?.club).toBe('9-iron');
    expect(talk.struck('9-iron', 0)).toBe('club');
    const again = ready(FLAT.pitch);
    talk.hole(again);
    talkUntilDone(talk, again);
    expect(talk.struck('driver', 0)).toBeNull();
  });

  it('is quiet on a kind taken three times, until it is asked; and says the club is fine when it has nothing', () => {
    const game = ready(pondRight);
    const talk = new CaddieTalk();
    talk.hole(game);
    talkUntilDone(talk, game, { club: 0, shape: CADDIE.taken, spin: 0 });
    expect(talk.said.text).toBeNull();
    talk.ask();
    talkUntilDone(talk, game, { club: 0, shape: CADDIE.taken, spin: 0 });
    expect(talk.said.button).toBe('Try a draw');

    const fine = ready(FLAT.long);
    talk.hole(fine);
    // asked of the ball at rest: a word asked for while it moves is for the shot it was, and not the next
    talk.frame(fine, NONE);
    talk.ask();
    talkUntilDone(talk, fine);
    expect(talk.said).toEqual({ text: fineText('Driver'), button: null });
  });

  it('puts a tip away for the shot when it is closed, and not for the next', () => {
    const game = ready(pondRight);
    const talk = new CaddieTalk();
    talk.hole(game);
    talkUntilDone(talk, game);
    talk.close();
    talkUntilDone(talk, game);
    expect(talk.said.text).toBeNull();
    // a club changed and changed back is looked at again, and still not said, since it was put away for this shot
    game.pick('3-wood');
    talkUntilDone(talk, game);
    game.pick('driver');
    talkUntilDone(talk, game);
    expect(talk.said.text).toBeNull();
    // the ball put back where it was, as from the water, is a new shot, which is told again
    talk.struck('driver', 0);
    talkUntilDone(talk, game);
    expect(talk.said.text).not.toBeNull();
  });

  it('looks again when the kit changes, since a tip worked out with the last kit may not hold with the new', () => {
    const game = ready(pondAcross);
    const talk = new CaddieTalk();
    talk.hole(game);
    talkUntilDone(talk, game);
    expect(talk.looking.done).toBe(true);
    const was = talk.looking.previews;
    expect(was).toBeGreaterThan(1);
    game.progress.save.coins = 1000;
    game.progress.save.gems = 10;
    expect(game.buy('titan')).toBe(true);
    expect(game.equip('titan')).toBe(true);
    talk.frame(game, NONE);
    // a new look, a preview into it
    expect(talk.looking.previews).toBe(1);
    talkUntilDone(talk, game);
    const tip = talk.own!.tip;
    if (tip) expect(troubleOf(talk.own!.retry(tip))).toBeNull();
  });

  it('puts a spin in hand by its button, and counts the stroke that took it as a tip of spin', () => {
    const game = ready(FLAT.road);
    const talk = new CaddieTalk();
    talk.hole(game);
    talkUntilDone(talk, game);
    expect(talk.said.button).toBe('Add top spin');
    expect(talk.take(game)).toBe(true);
    expect([game.inHand.id, game.shape, game.spin]).toEqual(['driver', 0, 1]);
    talkUntilDone(talk, game);
    expect(talk.said.text).toBeNull();
    expect(game.shoot(Math.PI / 2, 1)).toBe(true);
    expect(game.struckSpin).toBe(1);
    expect(talk.struck(game.inHand.id, game.struckShape, game.struckSpin)).toBe('spin');
  });

  it('says nothing while it is told to be quiet, while the ball is moving, or on a hole of minigolf', () => {
    const game = ready(pondRight);
    const talk = new CaddieTalk();
    talk.hole(game);
    for (let f = 0; f < 10; f++) talk.frame(game, NONE, true);
    expect(talk.said.text).toBeNull();
    game.shoot(Math.PI / 2, 0.5);
    game.step(DT);
    for (let f = 0; f < 10; f++) talk.frame(game, NONE);
    expect(talk.said.text).toBeNull();
    const mini = new Game(new Progress(memoryStore()), {}, { random: () => 0.5 });
    for (let f = 0; f < 600 && !mini.ready; f++) mini.step(DT);
    talk.hole(mini);
    for (let f = 0; f < 10; f++) talk.frame(mini, NONE);
    expect(talk.said.text).toBeNull();
    expect(talk.own).toBeNull();
  });
});

describe('the spin the caddie chooses', () => {
  /** What flat, back and top came to: each a rest's lie (or 'holed', 'water'), its distance from the pin. */
  function spun(landedOnGreen: boolean, ...three: [lie: number | 'holed' | 'water', miss: number][]): Spun {
    const ok = three.map(([l]) => l === 'holed' || (l !== 'water' && l !== LIE.sand));
    const good = three.map(
      ([l]) => l === 'holed' || l === LIE.fairway || l === LIE.cut || l === LIE.green || l === LIE.tee,
    );
    return {
      ok,
      good,
      miss: Float64Array.from(three.map(([, m]) => m)),
      landedOnGreen,
      flatEnd: three[0][0] === 'water' ? 'water' : 'rest',
      flatLie: typeof three[0][0] === 'number' ? three[0][0] : 0,
      restLie: three.map(([l]) => (typeof l === 'number' ? l : 0)),
      holed: three.map(([l]) => l === 'holed'),
      restYards: new Float64Array(3),
    };
  }

  it('holds a green with back spin where flat runs off it, however few yards that gains', () => {
    expect(bestSpin(spun(true, [LIE.cut, 12], [LIE.green, 8], [LIE.rough, 20]))).toBe(-1);
    // and not where back does not hold it either
    expect(bestSpin(spun(true, [LIE.cut, 12], [LIE.cut, 8], [LIE.rough, 20]))).toBe(0);
    // nor where flat holds it, and back gains too little to be worth the words
    expect(bestSpin(spun(true, [LIE.green, 12], [LIE.green, 5], [LIE.rough, 20]))).toBe(0);
  });

  it('takes whichever of back and top comes to a good lie the more yards nearer, and at least the least', () => {
    expect(bestSpin(spun(false, [LIE.fairway, 200], [LIE.fairway, 205], [LIE.fairway, 170]))).toBe(1);
    expect(bestSpin(spun(false, [LIE.fairway, 200], [LIE.fairway, 185], [LIE.fairway, 195]))).toBe(-1);
    expect(bestSpin(spun(false, [LIE.fairway, 200], [LIE.fairway, 195], [LIE.fairway, 192]))).toBe(0);
    // a rest in the rough or the sand is not a good one, however near
    expect(bestSpin(spun(false, [LIE.fairway, 200], [LIE.rough, 150], [LIE.sand, 120]))).toBe(0);
    // the cup is the best rest of all
    expect(bestSpin(spun(false, [LIE.green, 30], [LIE.green, 28], ['holed', 0]))).toBe(1);
  });

  it('keeps out of the trouble flat rolls into, at any distance, with a spin that comes to a good lie', () => {
    expect(bestSpin(spun(false, ['water', 0], [LIE.fairway, 250], [LIE.rough, 200]))).toBe(-1);
    expect(bestSpin(spun(false, ['water', 0], [LIE.rough, 250], [LIE.rough, 200]))).toBe(0);
  });
});
