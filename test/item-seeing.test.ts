/**
 * The two items that show a player more: the ghost shot (the preview carries on past the first landing to where the ball
 * comes to rest) and the break reader (the break's arrows and words on any putt, off the green too). Each is held to what it
 * shows, to the number the game's own rehearsal gives for it, to being the preview and the arrows as they were where it is
 * not held, to its bounds, and to the rules that hold with it (`previewProblems`, `arrowProblems`, `breakProblems`).
 */
import type { Wind } from 'artshape-render/game/grass';
import { describe, expect, it, vi } from 'vitest';
import { TILE, lieAt, tileAt } from '../src/arena';
import { Autopilot } from '../src/autopilot';
import { BAG, bagClub } from '../src/bag';
import type { HoleDef } from '../src/course';
import { Game } from '../src/game';
import { golfHole } from '../src/golf';
import { READER, breakAids, breakOf, greenArrows, readerArrows } from '../src/green';
import { arrowProblems, breakProblems, checkInvariants, previewProblems } from '../src/invariants';
import { LINKS_SPECS } from '../src/links';
import { GHOST_EVERY, GHOST_FRAMES, Preview, Previewer } from '../src/preview';
import { Progress, memoryStore } from '../src/progress';
import { landingText } from '../src/readout';
import { seeded } from '../src/random';
import { Scene } from '../src/scene';
import { LIE } from '../src/surfaces';
import { DT, FLAT } from './helpers';

const NORTH = Math.PI / 2;
const WIND: Wind = { direction: [1, 0], strength: 0.5, gustSize: 8, gustSpeed: 5 };

function held(hole: HoleDef, item = '', seed = 1): Game {
  const save = JSON.stringify({ owned: item ? [item] : [], item });
  return new Game(new Progress(memoryStore(save)), {}, { random: seeded(seed), course: [hole] });
}

const at = (g: Game) => ({ x: g.world.x[g.ball], y: g.world.y[g.ball] });

/** A real shot's resting place: the game struck true (chance in the middle), played until the ball is ready again. */
function realRest(hole: HoleDef, item: string, club: string, power: number, angle = NORTH) {
  const g = new Game(
    new Progress(memoryStore(JSON.stringify({ owned: item ? [item] : [], item }))),
    {},
    {
      random: () => 0.5,
      course: [hole],
    },
  );
  g.pick(club);
  g.shoot(angle, power);
  for (let f = 0; f < 60 * 40 && g.phase === 'play'; f++) {
    g.step(DT);
    if (f > 1 && g.ready) break;
  }
  return { x: g.world.x[g.ball], y: g.world.y[g.ball], phase: g.phase };
}

/** Everything of a preview that the ghost shot must leave as it was. */
function flight(p: Preview) {
  return {
    n: p.n,
    end: p.end,
    x: p.x,
    y: p.y,
    z: p.z,
    lie: p.lie,
    carry: p.carry,
    heading: p.heading,
    slope: { ...p.slope },
    footprint: { ...p.footprint },
    points: Array.from(p.points.slice(0, p.n * 3)),
    length: Array.from(p.length.slice(0, p.n)),
  };
}

describe('the ghost shot', () => {
  const hole = FLAT.long;
  const run = (item: string, club = 'driver', power = 1, g: Game = held(hole, item)) =>
    new Previewer(g).run(at(g), bagClub(club), NORTH, power);

  it('is no continuation where it is not held: nothing of the rest, and the flight as it was', () => {
    const p = run('');
    expect(p.rest.n).toBe(0);
    expect(p.rest.shown).toBe(false);
    expect(p.n).toBeGreaterThan(10);
  });

  it('leaves the first landing alone to the bit: the flight, the ring, the lie, the carry and the spread are the preview’s', () => {
    for (const [club, power] of [
      ['driver', 1],
      ['7-iron', 0.8],
      ['sand-wedge', 0.5],
    ] as const) {
      const a = flight(run('', club, power));
      const b = flight(run('ghost', club, power));
      expect(b, `${club} at ${power}`).toEqual(a);
    }
  });

  it('carries on to where the ball comes to rest: the very place the game puts it', () => {
    for (const [club, power] of [
      ['driver', 1],
      ['7-iron', 0.9],
      ['9-iron', 0.6],
    ] as const) {
      const p = run('ghost', club, power);
      const real = realRest(hole, 'ghost', club, power);
      expect(p.rest.shown, club).toBe(true);
      expect(p.rest.end).toBe('rest');
      expect(p.rest.settled).toBe(true);
      expect(Math.hypot(p.rest.x - real.x, p.rest.y - real.y), `${club} rest against the shot`).toBeLessThan(1e-6);
      // it ran on past where it came down: a drive on a fairway runs a fifth of its carry
      expect(Math.hypot(p.rest.x - p.x, p.rest.y - p.y), club).toBeGreaterThan(0.5);
    }
  });

  it('is a line from the first landing to the rest, growing in length, a point every few frames, and bounded', () => {
    const p = run('ghost');
    const r = p.rest;
    expect(r.n).toBeGreaterThan(3);
    expect(r.n).toBeLessThanOrEqual(GHOST_FRAMES / GHOST_EVERY + 2);
    expect(r.points.length / 3).toBeGreaterThanOrEqual(r.n);
    expect(Math.hypot(r.points[0] - p.x, r.points[1] - p.y)).toBeLessThan(1e-4);
    const last = r.n - 1;
    expect(Math.hypot(r.points[last * 3] - r.x, r.points[last * 3 + 1] - r.y)).toBeLessThan(1e-4);
    for (let k = 1; k < r.n; k++) expect(r.length[k], `point ${k}`).toBeGreaterThanOrEqual(r.length[k - 1]);
    expect(r.carry).toBeCloseTo(Math.hypot(r.x - at(held(hole)).x, r.y - at(held(hole)).y), 6);
    expect(r.lie).toBe(lieAt(held(hole).layout, r.x, r.y));
  });

  it('is written into buffers made once: a second preview writes over the first, and a shot that is not lofted has none', () => {
    const g = held(hole, 'ghost');
    const pv = new Previewer(g);
    const first = pv.run(at(g), bagClub('driver'), NORTH, 1);
    const buf = first.rest.points;
    pv.run(at(g), bagClub('9-iron'), NORTH, 0.5);
    expect(pv.result.rest.points).toBe(buf);
    const putt = pv.run(at(g), bagClub('putter'), NORTH, 0.5);
    expect(putt.rest.n).toBe(0);
    expect(putt.rest.shown).toBe(false);
  });

  it('says nothing of a rest for a ball that goes in the water or out: it is lost where it came down', () => {
    const g = held(FLAT.pond, 'ghost');
    let lost = 0;
    for (const club of BAG.filter((c) => c.loft > 0))
      for (const power of [0.6, 0.8, 1]) {
        const p = new Previewer(g).run(at(g), club, NORTH, power);
        if (p.end === 'water') {
          lost++;
          expect(p.rest.n).toBe(0);
          expect(p.rest.end).toBe('water');
          expect([p.rest.x, p.rest.y]).toEqual([p.x, p.y]);
        }
      }
    expect(lost, 'shots that reach the pond are counted').toBeGreaterThan(0);
  });

  it('costs steps only where it is held: no longer rehearsal without the item', () => {
    const spy = vi.spyOn(Game.prototype, 'step');
    try {
      const g = held(hole, '');
      const h = held(hole, 'ghost');
      spy.mockClear();
      new Previewer(g).run(at(g), bagClub('driver'), NORTH, 1);
      const plain = spy.mock.calls.length;
      spy.mockClear();
      new Previewer(h).run(at(h), bagClub('driver'), NORTH, 1);
      const ghost = spy.mock.calls.length;
      expect(ghost).toBeGreaterThan(plain);
      expect(ghost - plain).toBeLessThanOrEqual(GHOST_FRAMES);
    } finally {
      spy.mockRestore();
    }
  });

  it('holds every rule of a preview, and the rest is held to its own: numbers, in order, inside the hole', () => {
    const g = held(hole, 'ghost');
    const p = new Previewer(g).run(at(g), bagClub('driver'), NORTH, 1);
    expect(previewProblems(g, at(g), bagClub('driver'), p)).toEqual([]);
    // a rest that is not a number is a problem named
    const bad = new Previewer(g).run(at(g), bagClub('driver'), NORTH, 1);
    bad.rest.points[3] = NaN;
    expect(previewProblems(g, at(g), bagClub('driver'), bad).join()).toMatch(/rest/);
  });

  it('is the same preview from the same game twice', () => {
    const a = run('ghost');
    const pa = Array.from(a.rest.points.slice(0, a.rest.n * 3));
    const b = run('ghost');
    expect(Array.from(b.rest.points.slice(0, b.rest.n * 3))).toEqual(pa);
  });

  it('is said in words, beside where the shot lands, and only when there is a rest to say', () => {
    const base = { carry: 260, end: 'landed' as const, lie: LIE.fairway, hit: false, shape: 0, spin: 0 };
    expect(landingText(base)).toBe('lands 260 yd · fairway');
    expect(landingText({ ...base, rest: 270 })).toBe('lands 260 yd · fairway · rests 270 yd');
    expect(landingText({ ...base, end: 'water', rest: 270 })).not.toMatch(/rests/);
  });

  it('is drawn apart from the first landing: dots and a ring of its own, only on a hole begun with the item', () => {
    const g = held(hole, 'ghost');
    const p = new Previewer(g).run(at(g), bagClub('driver'), NORTH, 1);
    const scene = new Scene();
    scene.static(g.layout, 'ghost');
    const plainGroups = new Scene();
    plainGroups.static(g.layout, 'ghost');
    const without = plainGroups.dynamic(undefined, g.layout, 'ghost', WIND).length;
    const groups = scene.dynamic(undefined, g.layout, 'ghost', WIND, { ghost: true });
    expect(groups.length).toBeGreaterThan(without);
    scene.setShot(p, 1);
    scene.writeMoving(0);
    const marks = scene.shotMarks();
    expect(marks.rest).not.toBeNull();
    expect(marks.rest!.dots).toBeGreaterThan(3);
    expect(Math.hypot(marks.rest!.ring.x - p.rest.x, marks.rest!.ring.y - p.rest.y)).toBeLessThan(0.3);
    // the first landing's ring is where it was, and not the rest's
    expect(Math.hypot(marks.ring!.x - p.x, marks.ring!.y - p.y)).toBeLessThan(0.3);
    // put away with the shot
    scene.setShot(null);
    scene.writeMoving(0);
    expect(scene.shotMarks().rest).toBeNull();
    // and not drawn on a hole begun without it, whatever preview it is handed
    const bare = new Scene();
    bare.static(g.layout, 'ghost');
    bare.dynamic(undefined, g.layout, 'ghost', WIND);
    bare.setShot(p, 1);
    bare.writeMoving(0);
    expect(bare.shotMarks().rest).toBeNull();
  });
});

describe('the break reader', () => {
  const hills = golfHole(LINKS_SPECS[1]);
  const game = held(hills, 'reader');
  const { layout } = game;

  /** A ball's places across the hole, a few of each kind of ground a golf ball may lie on. */
  function lies() {
    const out: { x: number; y: number; lie: number }[] = [];
    const want = new Set<number>([LIE.fairway, LIE.rough, LIE.sand, LIE.green, LIE.cut, LIE.tee]);
    const seen = new Map<number, number>();
    for (let t = 0; t < layout.cols * layout.rows; t += 7) {
      const x = layout.originX + ((t % layout.cols) + 0.5) * TILE,
        y = layout.originY + (Math.floor(t / layout.cols) + 0.5) * TILE;
      if (layout.solid[t] || layout.water[t] || layout.oob[t]) continue;
      const lie = lieAt(layout, x, y);
      if (!want.has(lie) || (seen.get(lie) ?? 0) >= 8) continue;
      seen.set(lie, (seen.get(lie) ?? 0) + 1);
      out.push({ x, y, lie });
    }
    return out;
  }

  it('is an arrow for each leaning tile of ground the ball may lie on near it, not only the green’s', () => {
    const near = lies().find((l) => l.lie === LIE.fairway)!;
    expect(greenArrows(layout).every((a) => lieAt(layout, a.x, a.y) === LIE.green)).toBe(true);
    const arrows = readerArrows(layout, near.x, near.y);
    expect(arrows.length).toBeGreaterThan(5);
    expect(arrows.length).toBeLessThanOrEqual(READER.most);
    for (const a of arrows) {
      const t = tileAt(layout, a.x, a.y);
      expect(layout.solid[t] || layout.water[t] || layout.oob[t], 'on ground a ball is played from').toBeFalsy();
      expect(Math.hypot(a.x - near.x, a.y - near.y), 'near the ball').toBeLessThanOrEqual(READER.radius + TILE);
      expect(Number.isFinite(a.slopeX + a.slopeY)).toBe(true);
    }
    expect(
      arrows.some((a) => lieAt(layout, a.x, a.y) !== LIE.green),
      'over ground that is not the green',
    ).toBe(true);
    expect(arrowProblems(layout, arrows, { anywhere: true })).toEqual([]);
  });

  it('is none over level ground, and never more than the bound, at any lie of the hole', () => {
    const level = held(FLAT.long, 'reader');
    expect(readerArrows(level.layout, level.layout.tee.x, level.layout.tee.y)).toEqual([]);
    for (const l of lies()) expect(readerArrows(layout, l.x, l.y).length).toBeLessThanOrEqual(READER.most);
  });

  it('is held to a rule of its own: an arrow on the rail or in the water is named, and the green’s rule is not widened for it', () => {
    const near = lies().find((l) => l.lie === LIE.fairway)!;
    const arrows = readerArrows(layout, near.x, near.y);
    // the green's own rule refuses an arrow over the fairway, as ever
    expect(arrowProblems(layout, arrows).length).toBeGreaterThan(0);
    // and the widened rule refuses one that is not on ground to be played from
    const rail = layout.solid.findIndex((s) => s === 1);
    const rx = layout.originX + ((rail % layout.cols) + 0.5) * TILE,
      ry = layout.originY + (Math.floor(rail / layout.cols) + 0.5) * TILE;
    const bad = [...arrows, { x: rx, y: ry, slopeX: 0.1, slopeY: 0 }];
    expect(arrowProblems(layout, bad, { anywhere: true }).join()).toMatch(/not on/);
  });

  it('keeps the break a number, inside the cup’s distance, at every kind of lie, and bounded in work', () => {
    for (const l of lies()) {
      const b = breakOf(layout, l.x, l.y, game.greens);
      expect(Number.isFinite(b.across), `lie ${l.lie} at ${l.x},${l.y}`).toBe(true);
      expect(Number.isFinite(b.rise)).toBe(true);
      const far = Math.hypot(layout.cup.x - l.x, layout.cup.y - l.y);
      expect(Math.abs(b.across)).toBeLessThanOrEqual(far + 1e-6);
      game.place(l.x, l.y);
      expect(breakProblems(game)).toEqual([]);
    }
  });

  it('is asked of the lie and the club: arrows near the ball and the words, for a putter on any ground, only with the item', () => {
    const putter = 0,
      lofted = 25;
    // without it, the green and the first cut alone, as it always was
    expect(breakAids(LIE.green, putter, false, true)).toEqual({ arrows: 'green', words: true });
    expect(breakAids(LIE.cut, lofted, false, true)).toEqual({ arrows: 'green', words: true });
    expect(breakAids(LIE.fairway, putter, false, true)).toEqual({ arrows: null, words: false });
    expect(breakAids(LIE.rough, putter, false, true)).toEqual({ arrows: null, words: false });
    // with it, off the green with the putter in hand, near the ball
    expect(breakAids(LIE.fairway, putter, true, true)).toEqual({ arrows: 'near', words: true });
    expect(breakAids(LIE.sand, putter, true, true)).toEqual({ arrows: 'near', words: true });
    // a lofted club is not a putt
    expect(breakAids(LIE.fairway, lofted, true, true)).toEqual({ arrows: null, words: false });
    // a hole that has not set its greens' speed has no words, as it never had
    expect(breakAids(LIE.fairway, putter, true, false)).toEqual({ arrows: 'near', words: false });
    expect(breakAids(LIE.green, putter, true, false)).toEqual({ arrows: 'green', words: false });
  });

  it('is drawn in a pool of its own, put away when the ball moves on, and in no group on a hole begun without the item', () => {
    const near = lies().find((l) => l.lie === LIE.fairway)!;
    const arrows = readerArrows(layout, near.x, near.y);
    const scene = new Scene();
    scene.static(layout, 'reader');
    const bare = new Scene();
    bare.static(layout, 'reader');
    const without = bare.dynamic(undefined, layout, 'reader', WIND).length;
    expect(scene.dynamic(undefined, layout, 'reader', WIND, { reader: true }).length).toBe(without + 1);
    scene.setReaderArrows(arrows);
    scene.writeMoving(0);
    expect(scene.arrowsDrawn().reader).toBe(arrows.length);
    expect(scene.arrowsDrawn().shown).toBe(true);
    scene.setReaderArrows(null);
    scene.writeMoving(0);
    expect(scene.arrowsDrawn().reader).toBe(0);
    // a scene made without it draws none, though it is handed some
    bare.setReaderArrows(arrows);
    bare.writeMoving(0);
    expect(bare.arrowsDrawn().reader).toBeUndefined();
    expect(bare.arrowsDrawn().count).toBe(0);
  });

  it('holds every rule on every frame of a round of the autopilot’s with it, and shows nothing the green does not off it', () => {
    const g = held(hills, 'reader', 3);
    const pilot = new Autopilot(g, { replay: true });
    let checked = 0;
    for (let f = 0; f < 60 * 40; f++) {
      pilot.step(DT);
      const bad = checkInvariants(g);
      if (bad.length) throw new Error(`frame ${f}: ${bad.join('; ')}`);
      if (g.ready && g.world.alive[g.ball]) {
        const { x, y } = at(g);
        expect(readerArrows(g.layout, x, y).length).toBeLessThanOrEqual(READER.most);
        checked++;
      }
    }
    expect(checked, 'the rule was reached').toBeGreaterThan(2);
  });
});
