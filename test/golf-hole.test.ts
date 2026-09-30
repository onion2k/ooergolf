/**
 * Golf holes made from a spec and a seed: a fairway along a way of play from a tee to a green (straight, or bent as a
 * dogleg), rough either side, out of bounds beyond it and a wall beyond that; a green at the cup and a box at the tee;
 * bunkers, ponds and trees where the spec asks, never where they would spoil the hole; and ground that is hills, with the
 * tee, the green, the bunkers' beds and the ponds levelled. What is held is that every hole made is a hole that can be
 * played: legal to the physics, a way from tee to cup that a ball can take, hazards off the tee and the cup, and the same
 * hole for the same spec every time; and that a spec that cannot be made is refused by name.
 */
import { describe, expect, it } from 'vitest';
import { TILE, layoutOf, lieAt, slopeAt, tileAt } from '../src/arena';
import { CUP } from '../src/course';
import { golfHole, type GolfSpec } from '../src/golf';
import { terrainRefusal } from '../src/physics';
import { LIE, SURFACES } from '../src/surfaces';
import { TREE } from '../src/trees';
import { PHYSICS } from '../src/physics';

/** A par four of 380 yards with a bend in it, a bunker or two and a pond, and trees. */
const SPEC: GolfSpec = {
  name: 'Test Four',
  par: 4,
  length: 380,
  bend: 25,
  width: 13,
  seed: 5,
  feel: 'hills',
  steepness: 0.75,
  bunkers: { fairway: 2, green: 2 },
  ponds: [{ at: 0.62, side: -1, size: [3, 4] }],
  trees: 24,
};

const hole = (over: Partial<GolfSpec> = {}) => golfHole({ ...SPEC, ...over });
const layout = (h = hole()) => layoutOf(h.map, h.terrain);
const count = (h: ReturnType<typeof hole>, ch: string) => h.map.join('').split(ch).length - 1;
const tilesOf = (l: ReturnType<typeof layout>, on: (t: number) => boolean) => {
  const out: number[] = [];
  for (let t = 0; t < l.cols * l.rows; t++) if (on(t)) out.push(t);
  return out;
};

describe('a golf hole made from a spec', () => {
  it('is golf: a tee on a tee and a cup on a green, the length of the hole apart, within a tile', () => {
    const h = hole({ bend: 0 });
    const l = layout(h);
    expect(l.golf).toBe(true);
    expect(lieAt(l, l.tee.x, l.tee.y)).toBe(LIE.tee);
    expect(lieAt(l, l.cup.x, l.cup.y)).toBe(LIE.green);
    expect(Math.abs(Math.hypot(l.cup.x - l.tee.x, l.cup.y - l.tee.y) - 380)).toBeLessThanOrEqual(TILE);
    // a dogleg is shorter as the crow flies than as the ball is played: by the cosine of half its bend or so
    const bent = layout(hole({ bend: 40 }));
    const crow = Math.hypot(bent.cup.x - bent.tee.x, bent.cup.y - bent.tee.y);
    expect(crow).toBeLessThan(380 - 4);
    expect(crow).toBeGreaterThan(380 * 0.85);
  });

  it('is the same hole for the same spec and another for another seed', () => {
    expect(hole()).toEqual(hole());
    const other = hole({ seed: 6 });
    expect(other.map).not.toEqual(hole().map);
    expect(Array.from(other.terrain as Float32Array)).not.toEqual(Array.from(hole().terrain as Float32Array));
  });

  it('has every kind of ground it was asked for: fairway, rough, green, tee, sand, water, out of bounds and trees', () => {
    const h = hole();
    for (const ch of ['f', 'r', 'g', 't', 's', '~', 'x', '^', ' ']) expect(count(h, ch), `"${ch}"`).toBeGreaterThan(0);
    expect(count(h, '^'), 'the trees asked for').toBe(24);
    // a hole with none asked for has none
    const bare = hole({ bunkers: { fairway: 0, green: 0 }, ponds: [], trees: 0 });
    for (const ch of ['s', '~', '^']) expect(count(bare, ch), `"${ch}"`).toBe(0);
  });

  it('has a fairway of about the width it was given, all the way from the tee to the green', () => {
    const l = layout(hole({ bend: 0, bunkers: { fairway: 0, green: 0 }, ponds: [], trees: 0 }));
    // straight up the middle from past the tee to short of the green: fairway
    for (let y = l.tee.y + 6 * TILE; y < l.cup.y - 8 * TILE; y += TILE) expect(lieAt(l, l.tee.x, y)).toBe(LIE.fairway);
    // and across, from side to side of it, about thirteen tiles of it at the middle of the hole
    const y = (l.tee.y + l.cup.y) / 2;
    let wide = 0;
    for (let x = l.originX; x < l.originX + l.cols * TILE; x += TILE) if (lieAt(l, x, y) === LIE.fairway) wide++;
    expect(wide).toBeGreaterThanOrEqual(10);
    expect(wide).toBeLessThanOrEqual(17);
  });

  it('keeps play off the wall: out of bounds lies between every tile in play and the rock beyond', () => {
    const l = layout();
    const inPlay = (t: number) => !l.solid[t] && !l.oob[t] && !l.water[t];
    for (const t of tilesOf(l, inPlay)) {
      const tx = t % l.cols,
        ty = Math.floor(t / l.cols);
      for (const [dx, dy] of [
        [1, 0],
        [-1, 0],
        [0, 1],
        [0, -1],
        [1, 1],
        [-1, -1],
        [1, -1],
        [-1, 1],
      ]) {
        const u = (ty + dy) * l.cols + (tx + dx);
        expect(l.solid[u], `a tile of play at ${tx},${ty} touches rock`).toBe(0);
      }
    }
  });

  it('puts no hazard near the tee or the cup, and keeps a way from the one to the other that a ball can take', () => {
    const l = layout();
    const KEEP = 4 * TILE;
    const hazard = (t: number) => l.water[t] || l.sand[t] || (l.lie[t] === LIE.rough && false);
    for (const t of tilesOf(l, (t) => !!l.water[t] || !!l.sand[t])) {
      const x = l.originX + ((t % l.cols) + 0.5) * TILE,
        y = l.originY + (Math.floor(t / l.cols) + 0.5) * TILE;
      expect(Math.hypot(x - l.tee.x, y - l.tee.y), 'a hazard by the tee').toBeGreaterThan(KEEP);
      expect(Math.hypot(x - l.cup.x, y - l.cup.y), 'a hazard on the cup').toBeGreaterThan(2 * TILE);
    }
    for (const tr of l.trees) {
      expect(Math.hypot(tr.x - l.tee.x, tr.y - l.tee.y), 'a tree by the tee').toBeGreaterThan(KEEP);
      expect(Math.hypot(tr.x - l.cup.x, tr.y - l.cup.y), 'a tree on the green').toBeGreaterThan(8 * TILE);
    }
    void hazard;
    // a route three tiles wide over ground a ball rolls on, from the tee to the cup
    const open = (t: number) => t >= 0 && !l.solid[t] && !l.water[t] && !l.oob[t];
    const clear = (tx: number, ty: number) => {
      for (let dx = -1; dx <= 1; dx++)
        for (let dy = -1; dy <= 1; dy++) {
          const c = tx + dx,
            r = ty + dy;
          if (c < 0 || r < 0 || c >= l.cols || r >= l.rows) return false;
          const t = r * l.cols + c;
          if (!open(t)) return false;
          const x = l.originX + (c + 0.5) * TILE,
            y = l.originY + (r + 0.5) * TILE;
          for (const tr of l.trees) if (Math.hypot(x - tr.x, y - tr.y) < 2) return false;
        }
      return true;
    };
    const from = tileAt(l, l.tee.x, l.tee.y),
      to = tileAt(l, l.cup.x, l.cup.y);
    const seen = new Uint8Array(l.cols * l.rows);
    const todo = [from];
    seen[from] = 1;
    let reached = false;
    for (let head = 0; head < todo.length && !reached; head++) {
      const t = todo[head];
      if (t === to) reached = true;
      const tx = t % l.cols,
        ty = Math.floor(t / l.cols);
      for (const [dx, dy] of [
        [1, 0],
        [-1, 0],
        [0, 1],
        [0, -1],
      ]) {
        const u = (ty + dy) * l.cols + tx + dx;
        if (u >= 0 && u < seen.length && !seen[u] && clear(tx + dx, ty + dy)) {
          seen[u] = 1;
          todo.push(u);
        }
      }
    }
    expect(reached, 'a way from the tee to the cup').toBe(true);
  });

  it('is ground the physics takes, with the tee, the cup and the green level enough to rest a ball on', () => {
    const l = layout();
    expect(terrainRefusal(l, CUP)).toBeNull();
    const holds = SURFACES[LIE.green].roll / PHYSICS.gravity;
    for (const [what, x, y, radius] of [
      ['tee', l.tee.x, l.tee.y, 2 * TILE],
      ['cup', l.cup.x, l.cup.y, 4 * TILE],
    ] as const)
      for (let a = 0; a < 24; a++)
        for (const r of [0, radius / 2, radius]) {
          const [sx, sy] = slopeAt(
            l,
            x + Math.cos((a / 24) * Math.PI * 2) * r,
            y + Math.sin((a / 24) * Math.PI * 2) * r,
          );
          const s = Math.hypot(sx, sy);
          expect(s / Math.sqrt(1 + s * s), `the ${what}`).toBeLessThanOrEqual(holds);
        }
    // the fairway slopes no more than it holds a ball on: the steepness is set so the steepest step is a share of the limit
    const fairHolds = SURFACES[LIE.fairway].roll / PHYSICS.gravity;
    for (const t of tilesOf(l, (t) => l.lie[t] === LIE.fairway)) {
      const x = l.originX + ((t % l.cols) + 0.5) * TILE,
        y = l.originY + (Math.floor(t / l.cols) + 0.5) * TILE;
      const [sx, sy] = slopeAt(l, x, y);
      const s = Math.hypot(sx, sy);
      expect(s / Math.sqrt(1 + s * s)).toBeLessThanOrEqual(fairHolds);
    }
  });

  it('levels its ponds at nought and its bunkers’ beds, and is hilly elsewhere', () => {
    const l = layout();
    const wet = tilesOf(l, (t) => !!l.water[t]);
    expect(wet.length).toBeGreaterThan(5);
    for (const t of wet) expect(l.terrain[t], 'water lies at the floor of the ground').toBeCloseTo(0, 5);
    let high = 0;
    for (const h of l.terrain) high = Math.max(high, h);
    expect(high, 'hills, and not a plain').toBeGreaterThan(3);
  });

  it('is a course of trees a ball can be played round: none on the fairway, none within a canopy’s width of another’s trunk', () => {
    const l = layout();
    for (const t of l.trees) expect(lieAt(l, t.x, t.y), 'a tree stands in the rough').toBe(LIE.rough);
    for (let i = 0; i < l.trees.length; i++)
      for (let j = i + 1; j < l.trees.length; j++)
        expect(
          Math.hypot(l.trees[i].x - l.trees[j].x, l.trees[i].y - l.trees[j].y),
          'two trunks one tile apart',
        ).toBeGreaterThanOrEqual(2 * TILE - 1e-9);
    expect(TREE.radius).toBeGreaterThan(TILE);
  });
});

describe('every hole made is a hole that can be played', () => {
  /** What is wrong with a hole made, by every rule a hole must keep: none, for a hole that can be played. */
  function problems(h: ReturnType<typeof hole>): string[] {
    const out: string[] = [];
    const l = layoutOf(h.map, h.terrain);
    if (terrainRefusal(l, CUP)) out.push(`the physics refuses its ground: ${terrainRefusal(l, CUP)}`);
    const hold = (lie: number) => SURFACES[lie].roll / PHYSICS.gravity;
    for (const t of tilesOf(
      l,
      (t) => [LIE.fairway, LIE.green, LIE.tee].includes(l.lie[t] as never) && !l.oob[t] && !l.solid[t],
    )) {
      const x = l.originX + ((t % l.cols) + 0.5) * TILE,
        y = l.originY + (Math.floor(t / l.cols) + 0.5) * TILE;
      const [sx, sy] = slopeAt(l, x, y);
      const s = Math.hypot(sx, sy);
      if (s / Math.sqrt(1 + s * s) > hold(l.lie[t])) {
        out.push('a tile of fairway, green or tee is steeper than it holds a ball on');
        break;
      }
    }
    for (const t of tilesOf(l, (t) => !l.solid[t] && !l.oob[t] && !l.water[t]))
      for (const [dx, dy] of [
        [1, 0],
        [-1, 0],
        [0, 1],
        [0, -1],
        [1, 1],
        [-1, -1],
      ])
        if (l.solid[(Math.floor(t / l.cols) + dy) * l.cols + (t % l.cols) + dx]) {
          out.push('play touches the rock');
          return out;
        }
    return out;
  }

  it('is legal, rests a ball on its tee, fairway and green, and keeps play off the rock, for a run of seeds, bends and lengths', () => {
    let made = 0,
      refused = 0;
    for (const [length, width, bend] of [
      [160, 11, 0],
      [380, 13, 25],
      [420, 14, -35],
      [560, 16, 45],
    ] as const)
      for (let seed = 1; seed <= 6; seed++) {
        let h;
        try {
          h = hole({ length, width, bend, seed, par: length > 500 ? 5 : length > 250 ? 4 : 3 });
        } catch (e) {
          // a hole that will not be made is refused, by name; and never returned
          expect((e as Error).message).toMatch(/could not place|will not rest/);
          refused++;
          continue;
        }
        made++;
        expect(problems(h), `${length} yards, bend ${bend}, seed ${seed}`).toEqual([]);
      }
    expect(made, 'most seeds make a hole').toBeGreaterThan(20);
    expect(refused).toBeLessThan(4);
  });
});

describe('a spec that is not a hole', () => {
  const refused = (over: Partial<GolfSpec>, what: RegExp) => expect(() => hole(over)).toThrow(what);

  it('is refused by what is wrong with it', () => {
    refused({ name: '' }, /name/);
    refused({ par: 0 }, /par/);
    refused({ par: 2.5 }, /par/);
    refused({ seed: 1.5 }, /seed/);
    refused({ length: 20 }, /length/);
    refused({ length: 2000 }, /length/);
    refused({ width: 3 }, /width/);
    refused({ width: 60 }, /width/);
    refused({ bend: 120 }, /bend/);
    refused({ bunkers: { fairway: -1, green: 0 } }, /bunker/);
    refused({ trees: -2 }, /tree/);
    refused({ ponds: [{ at: 1.4, side: 1, size: [3, 4] }] }, /pond/);
    refused({ ponds: [{ at: 0.5, side: 1, size: [4, 3] }] }, /pond/);
    refused({ steepness: 1.4 }, /steepness/);
  });

  it('is refused, and not made into a hole that cannot be played, when its trees will not fit', () => {
    expect(() => hole({ trees: 5000 })).toThrow(/could not place/);
  });
});
