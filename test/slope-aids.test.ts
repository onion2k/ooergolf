/**
 * The break shown on a hole of minigolf whose ground leans: the arrows over its floor, the roll of the putt a drag would
 * make, and the arithmetic of the break, held to the minigolf's own putts. Without these a sloped minigolf hole is the one
 * place a player gets no help reading a slope that golf's greens give, and a level hole must show nothing new.
 */
import { describe, expect, it } from 'vitest';
import type { Wind } from 'artshape-render/game/grass';
import { layoutOf, powerFor, slopeAt, tileAt } from '../src/arena';
import { PUTTER } from '../src/bag';
import { COURSES, type HoleDef } from '../src/course';
import { BOWL, HOLLOW, SIDE_HILL } from './hills';
import { BIG } from '../smoke/bighole';
import { openHole } from '../src/open';
import { Game } from '../src/game';
import { arrowProblems, breakProblems, checkInvariants } from '../src/invariants';
import { breakOf, greenArrows, puttFrom } from '../src/green';
import { Previewer } from '../src/preview';
import { Progress, memoryStore } from '../src/progress';
import { Scene, arrowMarks } from '../src/scene';
import { DT, newGame } from './helpers';

const WIND: Wind = { direction: [1, 0], strength: 0.5, gustSize: 8, gustSpeed: 5 };
const SLOPED = [HOLLOW, BOWL, SIDE_HILL];
const hole = (name: string): HoleDef => SLOPED.find((h) => h.name === name)!;
const LEVEL = COURSES.find((c) => c.name === 'The Meadow')!.holes;

/** A game of the one hole, with no item equipped. */
function gameOn(h: HoleDef) {
  return new Game(new Progress(memoryStore()), {}, { random: () => 0.5, course: [h] });
}
/** Spots round the cup on ground a ball may lie on, `far` yards off. */
function spots(game: Game, far: number, n: number): [number, number][] {
  const out: [number, number][] = [];
  const { cup } = game.layout;
  for (let k = 0; out.length < n && k < n * 20; k++) {
    const a = (k * 2.399963) % (Math.PI * 2);
    const x = cup.x + Math.cos(a) * far,
      y = cup.y + Math.sin(a) * far;
    try {
      game.place(x, y);
      out.push([x, y]);
    } catch {
      /* not a place a ball may lie */
    }
  }
  return out;
}
function played(game: Game, angle: number, power: number) {
  expect(game.shoot(angle, power)).toBe(true);
  for (let f = 0; f < 60 * 40 && !game.ready && game.phase === 'play'; f++) game.step(DT);
}

describe('the arrows over a hole of minigolf', () => {
  it('are none on every level hole of The Meadow, which reads and looks as it did', () => {
    for (const h of LEVEL) expect(greenArrows(layoutOf(h.map, h.terrain)), h.name).toEqual([]);
  });

  it('are one for each floor tile that leans, each in its tile, none on rail, water or the cup, never more than the floor', () => {
    for (const h of SLOPED) {
      const l = layoutOf(h.map, h.terrain);
      const arrows = greenArrows(l);
      let floor = 0;
      for (let t = 0; t < l.cols * l.rows; t++) if (!l.solid[t] && !l.water[t]) floor++;
      expect(arrows.length, h.name).toBeGreaterThan(floor / 3);
      expect(arrows.length, h.name).toBeLessThanOrEqual(floor);
      for (const a of arrows) {
        const t = tileAt(l, a.x, a.y);
        expect(l.solid[t] || l.water[t], h.name).toBeFalsy();
        expect(tileAt(l, l.cup.x, l.cup.y), h.name).not.toBe(t);
        const [sx, sy] = slopeAt(l, a.x, a.y);
        expect([a.slopeX, a.slopeY]).toEqual([sx, sy]);
        expect(Math.hypot(sx, sy)).toBeGreaterThan(0.002);
      }
    }
  });

  it('point downhill and are placed by the scene, with the groups of a shot, which a level hole has none of', () => {
    const l = layoutOf(hole('Side-hill').map, hole('Side-hill').terrain);
    for (const m of arrowMarks(l)) {
      const [sx, sy] = slopeAt(l, m.x, m.y);
      expect(Math.cos(m.yaw) * sx + Math.sin(m.yaw) * sy).toBeLessThan(0);
    }
    const counts = (h: HoleDef) => {
      const lay = layoutOf(h.map, h.terrain);
      const scene = new Scene();
      scene.static(lay, h.name);
      const groups = scene.dynamic(undefined, lay, h.name, WIND);
      scene.setArrows(true);
      scene.writeMoving(0);
      return { groups: groups.length, arrows: scene.arrowsDrawn() };
    };
    const level = counts(LEVEL[0]),
      sloped = counts(hole('Side-hill'));
    expect(level.arrows).toEqual({ shown: false, count: 0 });
    expect(sloped.arrows.count).toBe(arrowMarks(l).length);
    expect(sloped.groups).toBeGreaterThan(level.groups + 3);
  });
});

describe('the break, on the minigolf’s own ground', () => {
  it('is what the game does: a putt aimed and struck as puttFrom says drops in the cup, from a ring of spots on each sloped hole', () => {
    let tried = 0,
      holed = 0;
    for (const h of SLOPED.slice(0, 3))
      for (const far of [8, 14]) {
        const game = gameOn(h);
        for (const [x, y] of spots(game, far, 10)) {
          const putt = puttFrom(game.layout, x, y);
          if (putt.speed > game.hardest) continue;
          const g = gameOn(h);
          g.place(x, y);
          played(g, putt.aim, powerFor(putt.speed, g.hardest));
          tried++;
          if (g.phase !== 'play') holed++;
        }
      }
    expect(tried).toBeGreaterThan(30);
    expect(holed / tried).toBeGreaterThan(0.7);
  });

  it('says it in words, the break and the rise, on a hole that leans, and says straight on a level one', () => {
    const l = layoutOf(hole('Side-hill').map, hole('Side-hill').terrain);
    const b = breakOf(l, l.tee.x, l.tee.y);
    expect(Math.abs(b.across) + Math.abs(b.rise)).toBeGreaterThan(0.1);
    const flat = layoutOf(LEVEL[0].map);
    expect(breakOf(flat, flat.tee.x, flat.tee.y).across).toBeCloseTo(0, 6);
  });
});

describe('the roll of a putt on minigolf', () => {
  it('comes to rest where the game leaves the ball, to a hair, on each sloped hole', () => {
    for (const h of SLOPED.slice(0, 3)) {
      const probe = gameOn(h);
      for (const [x, y] of spots(probe, 10, 4))
        for (const power of [0.2, 0.6]) {
          const g = gameOn(h);
          g.place(x, y);
          const from = { x: g.world.x[g.ball], y: g.world.y[g.ball] };
          const angle = Math.atan2(g.layout.cup.y - y, g.layout.cup.x - x) + 0.6;
          const p = new Previewer(g).roll(from, PUTTER, angle, power);
          expect(p.n, h.name).toBeGreaterThan(2);
          played(g, angle, power);
          if (p.end === 'holed') expect(g.phase).not.toBe('play');
          else
            expect(Math.hypot(p.x - g.world.x[g.ball], p.y - g.world.y[g.ball]), `${h.name} ${power}`).toBeLessThan(
              0.25,
            );
        }
    }
  });

  it('is struck with the course’s putter: a half-power putt on a long hole rolls the arithmetic’s distance, as far as the game’s own', () => {
    // a long putt wants room: the big test hole of the perf gate, open country with the cup clear of the rail
    const h = openHole(BIG);
    const g = gameOn(h);
    const [x, y] = spots(g, 40, 1)[0];
    g.place(x, y);
    const from = { x: g.world.x[g.ball], y: g.world.y[g.ball] };
    const angle = Math.atan2(g.layout.cup.y - from.y, g.layout.cup.x - from.x);
    const rolled = new Previewer(g).roll(from, PUTTER, angle, 0.5).carry;
    expect(rolled).toBeGreaterThan(10);
    expect(Number.isFinite(rolled)).toBe(true);
  });

  it('keeps to its one ball, however many putts are tried, and leaves the game as it was', () => {
    const { game } = newGame(3, null, [hole('The Bowl')]);
    const previewer = new Previewer(game);
    const before = JSON.stringify([game.t, game.strokes, game.world.x[game.ball], game.world.y[game.ball]]);
    for (let k = 0; k < 40; k++)
      previewer.roll({ x: game.world.x[game.ball], y: game.world.y[game.ball] }, PUTTER, k / 6, 0.3 + (k % 5) / 8);
    expect(previewer.bodies).toBe(1);
    expect(JSON.stringify([game.t, game.strokes, game.world.x[game.ball], game.world.y[game.ball]])).toBe(before);
  });
});

describe('the rules, held on a hole of minigolf that leans', () => {
  it('accept the arrows and the break the game works out, and refuse an arrow off the floor, one that is not a number, or a break that is not', () => {
    const g = gameOn(hole('Side-hill'));
    const arrows = greenArrows(g.layout);
    expect(arrowProblems(g.layout, arrows)).toEqual([]);
    expect(breakProblems(g)).toEqual([]);
    expect(checkInvariants(g)).toEqual([]);
    expect(arrowProblems(g.layout, [{ ...arrows[0], slopeX: NaN }]).join('\n')).toMatch(/not a number/);
    expect(arrowProblems(g.layout, [{ ...arrows[0], x: g.layout.originX - 30 }]).join('\n')).toMatch(
      /not on the floor/,
    );
    expect(arrowProblems(g.layout, [...arrows, ...arrows, ...arrows]).join('\n')).toMatch(/more arrows than/);
    expect(breakProblems(g, { across: NaN, rise: 0 }).join('\n')).toMatch(/across is NaN/);
    expect(breakProblems(g, { across: 0, rise: Infinity }).join('\n')).toMatch(/rise is Infinity/);
  });
});
