/**
 * The caddie: a tip when a golf ball comes to rest, worked out from previews a step at a time. These hold what it says to the
 * game's own physics (a tip's shot comes down clear), what it says it about (the club in hand, the line of play), when it says
 * nothing, and that it changes nothing of the game it reads.
 */
import { describe, expect, it } from 'vitest';
import { BAG } from '../src/bag';
import { CADDIE, Caddie, CaddieTalk, fineText, speaks, tookTip, troubleOf } from '../src/caddie';
import { COURSES, type HoleDef } from '../src/course';
import { Game } from '../src/game';
import { Progress, memoryStore } from '../src/progress';
import { DT, golfGame } from './helpers';
import { CADDIE_HOLES, FLAT } from './level';
import { lieAt } from '../src/arena';
import { LIE } from '../src/surfaces';

const { pondRight, pondAcross } = CADDIE_HOLES;

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
    expect(tip!.text).toMatch(/^Driver finds the water at \d+ yd\. The .+ lays up at \d+ yd on the (fairway|rough)\.$/);
    expect(tip!.button).toBe(`Take the ${BAG[k].name.toLowerCase()}`);
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
      /^Driver carries \d+, and the pin is 10\d yd\. A full 9-iron (carries \d+|drops in the cup)\.$/,
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
      expect(caddie.previews).toBeLessThanOrEqual(CADDIE.previews);
      expect(steps).toBeLessThanOrEqual(CADDIE.previews + 3);
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
        expect(tip.club !== game.inHand.id || tip.shape !== Math.sign(game.shape)).toBe(true);
      }
    }
    // The Heath's tees found trouble with a driver along the line on twenty of thirty-six over four rounds
    expect(tips).toBeGreaterThan(0);
  });

  it('counts a shot as taking a tip by its club, and its shape for a tip of shape', () => {
    const shape = { kind: 'shape', club: 'driver', shape: -1, angle: 0, carry: 0, text: '', button: '' } as const;
    expect(tookTip(shape, 'driver', -1)).toBe(true);
    expect(tookTip(shape, 'driver', 0)).toBe(false);
    expect(tookTip(shape, '3-wood', -1)).toBe(false);
    const club = { ...shape, kind: 'club', club: '9-iron', shape: 0 } as const;
    expect(tookTip(club, '9-iron', 1)).toBe(true);
    expect(tookTip(club, 'driver', 0)).toBe(false);
  });

  it('goes quiet on a kind once three of it are taken', () => {
    expect(speaks('shape', { club: 0, shape: 2 })).toBe(true);
    expect(speaks('shape', { club: 0, shape: 3 })).toBe(false);
    expect(speaks('club', { club: 3, shape: 0 })).toBe(false);
  });
});

describe('when the caddie speaks', () => {
  const NONE = { club: 0, shape: 0 };
  /** Frames of a talk until its look is done, and then one more: what the page does over the frames after a ball rests. */
  function talkUntilDone(talk: CaddieTalk, game: Game, taken = NONE) {
    let frames = 0;
    do {
      talk.frame(game, taken);
      frames++;
    } while (!talk.looking.done && frames < 20);
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
    expect(frames).toBeLessThanOrEqual(CADDIE.previews);
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
    talkUntilDone(talk, game, { club: 0, shape: CADDIE.taken });
    expect(talk.said.text).toBeNull();
    talk.ask();
    talkUntilDone(talk, game, { club: 0, shape: CADDIE.taken });
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
