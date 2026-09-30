/**
 * The open holes: the generator that makes a hole many times the size of any drawn by hand, from a spec and a seed. What
 * it makes is held to what a player and the physics need of it, worked out here for itself and not by the generator's own
 * arithmetic: the tee and the cup joined by a route wide enough to putt along, water in the hollows and at nought,
 * sand on a level bed, nothing on the tee or the cup or in the rail, and the ground the physics takes.
 */
import { describe, expect, it } from 'vitest';
import { TILE, layoutOf } from '../src/arena';
import { Autopilot } from '../src/autopilot';
import { CUP } from '../src/course';
import { noiseGround } from '../src/noise';
import { openHole, type OpenSpec } from '../src/open';
import { terrainRefusal } from '../src/physics';
import { seeded } from '../src/random';
import { newGame } from './helpers';

/** A hole thirty tiles by thirty-four with something of every kind on it, from the south end to the north. */
const spec = (over: Partial<OpenSpec> = {}): OpenSpec => ({
  name: 'test open',
  par: 4,
  shape: [30, 34, [7, 31], [22, 2]],
  feel: 'rolling',
  steepness: 0.5,
  seed: 1,
  features: [
    { kind: 'pond', count: 2, size: [2, 3.5] },
    { kind: 'sand', count: 3, size: [1.5, 2.5] },
    { kind: 'stand', count: 2, size: [3, 5] },
  ],
  ...over,
});

/** The tiles of a kind, as [column, row from the top]. */
const tilesOf = (map: readonly string[], ch: string) =>
  map.flatMap((row, r) => [...row].flatMap((c, k) => (c === ch ? [[k, r] as [number, number]] : [])));

/** How many separate groups of a kind of tile there are, tiles that touch, even at a corner, being one. */
function groups(map: readonly string[], ch: string): [number, number][][] {
  const seen = new Set<string>();
  const out: [number, number][][] = [];
  for (const [c, r] of tilesOf(map, ch)) {
    if (seen.has(`${c},${r}`)) continue;
    const group: [number, number][] = [];
    const todo: [number, number][] = [[c, r]];
    seen.add(`${c},${r}`);
    while (todo.length) {
      const [x, y] = todo.pop()!;
      group.push([x, y]);
      for (let dx = -1; dx <= 1; dx++)
        for (let dy = -1; dy <= 1; dy++)
          if (map[y + dy]?.[x + dx] === ch && !seen.has(`${x + dx},${y + dy}`)) {
            seen.add(`${x + dx},${y + dy}`);
            todo.push([x + dx, y + dy]);
          }
    }
    out.push(group);
  }
  return out;
}

/**
 * Whether a route three tiles wide joins the tee and the cup: over grass and sand, where no water, rail or post is within
 * a tile of either side, so a ball has room to roll along it. Worked out here by a search of its own.
 */
function joined(map: readonly string[]): boolean {
  const open = (c: number, r: number) => '.TCs'.includes(map[r]?.[c] ?? '#');
  const wide = (c: number, r: number) => {
    for (let dc = -1; dc <= 1; dc++) for (let dr = -1; dr <= 1; dr++) if (!open(c + dc, r + dr)) return false;
    return true;
  };
  const [tee] = tilesOf(map, 'T'),
    [cup] = tilesOf(map, 'C');
  const seen = new Set<string>([`${tee[0]},${tee[1]}`]);
  const todo = [tee];
  while (todo.length) {
    const [c, r] = todo.shift()!;
    if (c === cup[0] && r === cup[1]) return true;
    for (const [dc, dr] of [
      [1, 0],
      [-1, 0],
      [0, 1],
      [0, -1],
    ]) {
      const key = `${c + dc},${r + dr}`;
      if (!seen.has(key) && wide(c + dc, r + dr)) {
        seen.add(key);
        todo.push([c + dc, r + dr]);
      }
    }
  }
  return false;
}

describe('an open hole', () => {
  it('is the same for a spec every time, and another hole for another seed', () => {
    const a = openHole(spec()),
      b = openHole(spec());
    expect(a.map).toEqual(b.map);
    expect(a.terrain).toEqual(b.terrain);
    expect(openHole(spec({ seed: 2 })).map).not.toEqual(a.map);
    expect(a.name).toBe('test open');
    expect(a.par).toBe(4);
  });

  it('is the shape asked: a rail all round, the tee and the cup where they were put, and nothing else on the edge', () => {
    const { map } = openHole(spec());
    expect(map.length).toBe(34);
    for (const row of map) expect(row.length).toBe(30);
    expect(tilesOf(map, 'T')).toEqual([[7, 31]]);
    expect(tilesOf(map, 'C')).toEqual([[22, 2]]);
    for (let r = 0; r < map.length; r++)
      for (let c = 0; c < 30; c++)
        if (r === 0 || r === 33 || c === 0 || c === 29) expect(map[r][c], `${c},${r}`).toBe('#');
  });

  it('leaves a route three tiles wide in a narrow hole where a pond in the middle would wall it off, on every seed of sixty', () => {
    // eight tiles between the rail: a pond of any size in the middle leaves less than three each side, so the ponds go
    // to the sides, one after another, or are not placed at all
    for (let seed = 1; seed <= 60; seed++) {
      const { map } = openHole(
        spec({
          shape: [12, 44, [6, 41], [6, 2]],
          seed,
          features: [
            { kind: 'pond', count: 2, size: [1.5, 2.2] },
            { kind: 'sand', count: 1, size: [1.5, 2.2] },
          ],
        }),
      );
      expect(joined(map), `seed ${seed}`).toBe(true);
      expect(groups(map, '~').length).toBe(2);
    }
  });

  it('is a hole the game builds and the physics accepts, on every seed of sixty, of every feel', () => {
    const feels = ['gentle', 'rolling', 'choppy', 'rolling and choppy'] as const;
    for (let seed = 1; seed <= 60; seed++) {
      const hole = openHole(spec({ seed, feel: feels[seed % 4], steepness: 0.3 + (seed % 5) * 0.1 }));
      const layout = layoutOf(hole.map, hole.terrain);
      expect(terrainRefusal(layout, CUP), `seed ${seed}`).toBe(null);
    }
  });

  it('has a route three tiles wide from the tee to the cup, on every seed of sixty, with features of every kind on it', () => {
    for (let seed = 1; seed <= 60; seed++) expect(joined(openHole(spec({ seed })).map), `seed ${seed}`).toBe(true);
  });

  it('has as many ponds, bunkers and stands as it was asked for, kept apart, and a stand of the size asked for', () => {
    for (let seed = 1; seed <= 30; seed++) {
      const { map } = openHole(spec({ seed }));
      expect(groups(map, '~').length, `ponds, seed ${seed}`).toBe(2);
      expect(groups(map, 's').length, `bunkers, seed ${seed}`).toBe(3);
      const posts = tilesOf(map, 'o').length;
      expect(posts, `posts, seed ${seed}`).toBeGreaterThanOrEqual(2 * 3);
      expect(posts).toBeLessThanOrEqual(2 * 5);
    }
  });

  it('keeps every feature three and a half tiles from the tee and the cup and two tiles in from the rail, and a tile from the next', () => {
    for (let seed = 1; seed <= 40; seed++) {
      const { map } = openHole(spec({ seed }));
      const [tee] = tilesOf(map, 'T'),
        [cup] = tilesOf(map, 'C');
      for (const ch of '~so')
        for (const [c, r] of tilesOf(map, ch)) {
          expect(
            Math.hypot(c - tee[0], r - tee[1]),
            `${ch} at ${c},${r} near the tee, seed ${seed}`,
          ).toBeGreaterThanOrEqual(3.5);
          expect(Math.hypot(c - cup[0], r - cup[1]), `${ch} at ${c},${r} near the cup`).toBeGreaterThanOrEqual(3.5);
          expect(c >= 2 && c <= 27 && r >= 2 && r <= 31, `${ch} at ${c},${r} in from the rail`).toBe(true);
        }
      // a tile between one feature and another of a different kind or group
      for (const ch of '~s')
        for (const group of groups(map, ch))
          for (const [c, r] of group)
            for (let dc = -1; dc <= 1; dc++)
              for (let dr = -1; dr <= 1; dr++) {
                const n = map[r + dr][c + dc];
                expect('.' === n || n === ch, `${ch} at ${c},${r} touches ${n}, seed ${seed}`).toBe(true);
              }
    }
  });

  it('lies its ponds in the hollows, at nought, the lowest the ground goes, and its sand on level beds', () => {
    for (let seed = 1; seed <= 20; seed++) {
      const hole = openHole(spec({ seed }));
      const terrain = hole.terrain as Float32Array;
      const height = (c: number, r: number) => terrain[(hole.map.length - 1 - r) * 30 + c];
      expect(Math.min(...terrain), 'the ground has its floor at nought').toBe(0);
      for (const [c, r] of tilesOf(hole.map, '~'))
        expect(height(c, r), `water at ${c},${r}, seed ${seed}`).toBeLessThan(1e-5);
      for (const group of groups(hole.map, 's')) {
        const hs = group.map(([c, r]) => height(c, r));
        expect(Math.max(...hs) - Math.min(...hs), `a bed of sand, seed ${seed}`).toBeLessThan(1e-5);
      }
    }
  });

  it('puts its ponds where the ground is low, in the lowest part of it, and not on a rise: a pond is a hollow', () => {
    const feels = ['gentle', 'rolling', 'choppy', 'rolling and choppy'] as const;
    let ponds = 0;
    for (let seed = 1; seed <= 40; seed++) {
      const feel = feels[seed % 4];
      const hole = openHole(spec({ seed, feel }));
      // the ground this spec had before anything was levelled: the same noise, as the generator saw it
      const plain = noiseGround(layoutOf(hole.map), { seed, feel, steepness: 0.5 });
      const highest = Math.max(...plain);
      for (const group of groups(hole.map, '~')) {
        const mean = group.reduce((n, [c, r]) => n + plain[(hole.map.length - 1 - r) * 30 + c], 0) / group.length;
        expect(mean, `a pond on a rise, seed ${seed}`).toBeLessThanOrEqual(0.4 * highest + 1e-9);
        ponds++;
      }
    }
    expect(ponds).toBe(80);
  });

  it('keeps its hills with a pond in them: the relief is most of what the same hole has without one, and not a third of it', () => {
    // measured over twenty seeds of hills at a steepness of 0.7: with the old blend of two tiles one pond left 0.32 of the
    // relief on the mean and two 0.28; with a blend of half the swell 0.93, and 0.85
    const relief = (h: { map: readonly string[]; terrain?: readonly string[] | Float32Array }) => {
      const l = layoutOf(h.map, h.terrain);
      let lo = Infinity,
        hi = -Infinity;
      for (let ty = 1; ty < l.rows - 1; ty++)
        for (let tx = 1; tx < l.cols - 1; tx++) {
          lo = Math.min(lo, l.terrain[ty * l.cols + tx]);
          hi = Math.max(hi, l.terrain[ty * l.cols + tx]);
        }
      return hi - lo;
    };
    const hill = (seed: number, ponds: number) =>
      openHole(
        spec({
          shape: [45, 51, [11, 48], [33, 2]],
          feel: 'hills',
          steepness: 0.7,
          seed,
          features: ponds ? [{ kind: 'pond', count: ponds, size: [2.5, 4] }] : [],
        }),
      );
    for (const ponds of [1, 2]) {
      const ratios: number[] = [];
      for (let seed = 1; seed <= 20; seed++) ratios.push(relief(hill(seed, ponds)) / relief(hill(seed, 0)));
      const mean = ratios.reduce((a, b) => a + b, 0) / ratios.length;
      expect(mean, `${ponds} pond(s), the mean`).toBeGreaterThanOrEqual(ponds === 1 ? 0.85 : 0.78);
      expect(Math.min(...ratios), `${ponds} pond(s), the worst`).toBeGreaterThanOrEqual(0.5);
    }
  });

  it('has ground as steep as was asked, and no steeper, with its ponds and beds levelled', () => {
    for (const steepness of [0.3, 0.6, 0.9]) {
      const hole = openHole(spec({ steepness }));
      const t = hole.terrain as Float32Array;
      let most = 0;
      for (let ty = 0; ty < 34; ty++)
        for (let tx = 0; tx < 30; tx++) {
          if (tx + 1 < 30) most = Math.max(most, Math.abs(t[ty * 30 + tx + 1] - t[ty * 30 + tx]));
          if (ty + 1 < 34) most = Math.max(most, Math.abs(t[(ty + 1) * 30 + tx] - t[ty * 30 + tx]));
        }
      expect(most / (TILE / 2), `at ${steepness}`).toBeCloseTo(steepness, 2);
    }
  });

  it('makes a hole with nothing on it when it is asked for nothing, which is the ground alone', () => {
    const hole = openHole(spec({ features: [] }));
    for (const ch of '~so') expect(tilesOf(hole.map, ch)).toEqual([]);
  });

  it('is made however big, up to a hole of three hundred tiles a side', () => {
    const hole = openHole(
      spec({ shape: [300, 300, [70, 297], [220, 2]], features: [{ kind: 'pond', count: 4, size: [4, 8] }] }),
    );
    expect(hole.map.length).toBe(300);
    expect(joined(hole.map)).toBe(true);
    expect(groups(hole.map, '~').length).toBe(4);
  });

  it('is played out by the autopilot, with a player’s slips, from the tee to the cup, on sixteen seeds', () => {
    let holed = 0;
    for (let seed = 1; seed <= 16; seed++) {
      const hole = openHole(spec({ seed, par: 5 }));
      const { game } = newGame(seed, null, [hole]);
      const pilot = new Autopilot(game, { skill: { aim: 0.05, power: 0.1 }, random: seeded(seed * 3 + 1) });
      for (let f = 0; f < 60 * 400 && game.phase === 'play'; f++) pilot.step(1 / 60);
      expect(game.phase, `seed ${seed} finished`).not.toBe('play');
      if (game.strokes < game.limit) holed++;
    }
    // measured on this spec, thirteen of sixteen: the three that are picked up at the limit are ones where the autopilot
    // skirts a pond by a fixed margin and its slips, over shots of forty units, carry it in again and again, which is a
    // matter of how it plays and not of the hole
    expect(holed, 'holed out, and not picked up at the limit, on most seeds').toBeGreaterThanOrEqual(10);
  });

  it('refuses a spec that cannot be made, by name: a wall round the cup, and things that are not a hole', () => {
    expect(() =>
      openHole(spec({ shape: [12, 14, [4, 11], [8, 2]], features: [{ kind: 'pond', count: 6, size: [3, 4] }] })),
    ).toThrow(/test open.*could not place.*pond/);
    expect(() => openHole(spec({ shape: [30, 34, [1, 31], [22, 2]] }))).toThrow(/tee.*rail/);
    expect(() => openHole(spec({ shape: [30, 34, [7, 31], [7, 31]] }))).toThrow(/tee and the cup/);
    expect(() => openHole(spec({ shape: [30, 34, [7, 31], [8, 29]] }))).toThrow(/tee and the cup/);
    expect(() => openHole(spec({ shape: [6, 6, [2, 3], [3, 2]] }))).toThrow(RangeError);
    expect(() => openHole(spec({ name: '' }))).toThrow(/name/);
    expect(() => openHole(spec({ par: 0 }))).toThrow(/par/);
    expect(() => openHole(spec({ steepness: 1 }))).toThrow(RangeError);
    expect(() => openHole(spec({ features: [{ kind: 'pond', count: -1, size: [2, 3] }] }))).toThrow(/count/);
    expect(() => openHole(spec({ features: [{ kind: 'sand', count: 1, size: [3, 2] }] }))).toThrow(/size/);
    expect(() => openHole(spec({ features: [{ kind: 'stand', count: 1, size: [3, 12] }] }))).toThrow(/size/);
    expect(() => openHole(spec({ seed: 1.5 }))).toThrow(/seed/);
  });
});
