/** The scenery round a hole: on the rough and never the course, clear of it, spaced, bounded, and the same for a hole every time. */
import { createHash } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import { TILE, layoutOf, tileAt } from '../src/arena';
import { COURSE } from '../src/course';
import { HILLS } from './hills';
import {
  BEYOND,
  DRESSING,
  REFERENCE,
  ROCK_SIZE,
  SCENERY,
  SCALE,
  beyond,
  BROADLEAF,
  bigness,
  clearings,
  dress,
  scatter,
} from '../src/scenery';
import { FLAT_HOLES } from './level';
import { links } from '../src/links';

describe('the scenery', () => {
  for (const hole of COURSE) {
    const l = layoutOf(hole.map);
    const items = scatter(l, hole.name);

    it(`round ${hole.name}: stands on the rough, clear of the grass and the rail, and spaced`, () => {
      expect(items.length).toBeGreaterThanOrEqual(SCENERY.least);
      expect(items.length).toBeLessThanOrEqual(SCENERY.most);
      for (const s of items) {
        // nothing on the course, nor within reach of its edge, where it would stand in the play or over the rail
        for (let a = 0; a < 8; a++) {
          const x = s.x + Math.cos((a / 8) * Math.PI * 2) * SCENERY.clear,
            y = s.y + Math.sin((a / 8) * Math.PI * 2) * SCENERY.clear;
          const t = tileAt(l, x, y);
          expect(
            t < 0 || (l.solid[t] === 1 && l.rail[t] === 0),
            `${s.kind} at ${s.x.toFixed(1)},${s.y.toFixed(1)}`,
          ).toBe(true);
        }
      }
      for (let i = 0; i < items.length; i++)
        for (let j = i + 1; j < items.length; j++)
          expect(Math.hypot(items[i].x - items[j].x, items[i].y - items[j].y)).toBeGreaterThanOrEqual(SCENERY.spacing);
    });
  }

  it('is the same for a hole every time, different from hole to hole, and has something of every kind on a course', () => {
    const l = layoutOf(COURSE[0].map);
    expect(scatter(l, COURSE[0].name)).toEqual(scatter(l, COURSE[0].name));
    expect(scatter(l, 'another name')).not.toEqual(scatter(l, COURSE[0].name));
    const kinds = new Set(COURSE.flatMap((h) => scatter(layoutOf(h.map), h.name).map((s) => s.kind)));
    for (const kind of ['broadleaf', 'conifer', 'bush', 'flowers', 'rock']) expect(kinds, kind).toContain(kind);
  });

  it('turns and sizes each piece a little, so no two trees are alike', () => {
    const items = scatter(layoutOf(COURSE[1].map), COURSE[1].name);
    expect(new Set(items.map((s) => s.yaw.toFixed(3))).size).toBeGreaterThan(items.length / 2);
    for (const s of items) {
      expect(s.scale).toBeGreaterThanOrEqual(0.8);
      expect(s.scale).toBeLessThanOrEqual(1.25);
    }
  });
});

describe('the dressing of a hole', () => {
  for (const hole of COURSE) {
    const l = layoutOf(hole.map);
    const d = dress(l, hole.name);
    const onRough = (x: number, y: number) => {
      const t = tileAt(l, x, y);
      return t < 0 || (l.solid[t] === 1 && l.rail[t] === 0);
    };

    it(`round ${hole.name}: bunting on three sides, outside the course, strung high enough to be seen over the rail`, () => {
      expect(d.bunting.length).toBe(3);
      for (const b of d.bunting) {
        // both posts and the middle of the string off the course, on the rough
        const c = Math.cos(b.yaw),
          s = Math.sin(b.yaw);
        for (const k of [-0.5, 0, 0.5]) expect(onRough(b.x + c * b.length * k, b.y + s * b.length * k)).toBe(true);
        expect(b.height, 'above the rail, from the rough').toBeGreaterThan(DRESSING.railTop + 2);
      }
    });

    it(`round ${hole.name}: flower beds along the foot of the rail, on the rough`, () => {
      expect(d.beds.length).toBeGreaterThanOrEqual(4);
      for (const bed of d.beds) {
        expect(onRough(bed.x, bed.y), `${bed.x},${bed.y}`).toBe(true);
        // near the rail: a rail tile within a tile and a half
        let near = false;
        for (let a = 0; a < 8; a++) {
          const t = tileAt(
            l,
            bed.x + Math.cos((a / 8) * Math.PI * 2) * TILE,
            bed.y + Math.sin((a / 8) * Math.PI * 2) * TILE,
          );
          if (t >= 0 && l.rail[t] === 1) near = true;
        }
        expect(near, `${bed.x.toFixed(1)},${bed.y.toFixed(1)} beside the rail`).toBe(true);
      }
    });

    it(`round ${hole.name}: rocks in clusters, on the rough, and the scattered trees kept off the bunting`, () => {
      expect(d.rocks.length).toBeGreaterThanOrEqual(4);
      for (const r of d.rocks) {
        expect(onRough(r.x, r.y)).toBe(true);
        // every rock has another of its cluster close by: two of a cluster stand on a circle of 1.8 round its middle, so
        // as far apart as 3.6 and no further (a bound of 3 held on the holes there were and on none by right)
        expect(d.rocks.some((o) => o !== r && Math.hypot(o.x - r.x, o.y - r.y) < 3.6)).toBe(true);
      }
      for (const p of scatter(l, hole.name))
        for (const b of d.bunting) {
          const c = Math.cos(b.yaw),
            s = Math.sin(b.yaw);
          const along = (p.x - b.x) * c + (p.y - b.y) * s,
            across = -(p.x - b.x) * s + (p.y - b.y) * c;
          expect(Math.abs(across) > 2 || Math.abs(along) > b.length / 2 + 1, `${p.kind} under the bunting`).toBe(true);
        }
    });
  }

  it('is the same for a hole every time', () => {
    const l = layoutOf(COURSE[2].map);
    expect(dress(l, COURSE[2].name)).toEqual(dress(l, COURSE[2].name));
  });
});

describe('the clearings round the rocks', () => {
  for (const hole of COURSE) {
    it(`on ${hole.name}: a bare patch under every rock, big enough for it, on the rough and nowhere else`, () => {
      const l = layoutOf(hole.map);
      const rocks = [...dress(l, hole.name).rocks, ...scatter(l, hole.name).filter((p) => p.kind === 'rock')];
      const bare = clearings(l, hole.name);
      expect(rocks.length, 'rocks on every hole').toBeGreaterThan(0);
      expect(bare.length, 'a clearing for each').toBe(rocks.length);
      rocks.forEach((rock, i) => {
        expect(bare[i].x).toBe(rock.x);
        expect(bare[i].y).toBe(rock.y);
        // wider than the rock is, or the blades stand over its edge and it is seen through them
        expect(bare[i].r, 'the rock and a margin').toBeGreaterThan(ROCK_SIZE * rock.scale);
        const t = tileAt(l, rock.x, rock.y);
        expect(t < 0 || (l.solid[t] === 1 && l.rail[t] === 0), 'on the rough').toBe(true);
      });
    });
  }

  it('is the same for a hole every time', () => {
    const l = layoutOf(COURSE[0].map);
    expect(clearings(l, COURSE[0].name)).toEqual(clearings(l, COURSE[0].name));
    expect(SCALE.least).toBeGreaterThan(0);
  });
});

/**
 * What stands round a hole many times the size of any there is. The scenery was placed for holes up to fifteen tiles by
 * seventeen: thirty pieces, three clusters of rocks, and one string of bunting a side. Round a hole of a hundred and
 * fifty units that is a bare field with two tall posts a long way apart, so all of it grows with the hole's perimeter
 * past the biggest there was, and for every hole there was it is what it was.
 */
describe('the scenery of a big hole', () => {
  /** An open green `cols` tiles across and `rows` long inside a rail. */
  const open = (cols: number, rows: number) =>
    layoutOf(
      Array.from({ length: rows }, (_, r) =>
        Array.from({ length: cols }, (_, c) => {
          if (r === 0 || r === rows - 1 || c === 0 || c === cols - 1) return '#';
          if (r === rows - 3 && c === Math.floor(cols / 4)) return 'T';
          if (r === 2 && c === Math.floor((cols * 3) / 4)) return 'C';
          return '.';
        }).join(''),
      ),
    );

  /**
   * The names the kinds had when the hash was written, before they were drawn low-poly (8 October 2026) and named for
   * what is drawn: a broadleaf, a conifer, and a bush (or a fern, by its variant).
   */
  const WRITTEN_AS: Record<string, string> = { broadleaf: 'round tree', conifer: 'pine', bush: 'hedge' };
  /** Every hole that exists: its scatter, its dressing and its clearings, hashed, written before any of it grew. */
  const GOLDEN = '79bc75c85fe56b7ccbc4ccaf640b47c7accf5015a328c9f104d9d2e5eb6254ee';
  /**
   * The holes the golden was written from, in the order it was: the Meadow but for the windmill and the mill race, which
   * were drawn again so that the cup shows, and the four slope holes the tests keep (the four The Hills had first, which
   * were on the course until it was scrapped). The five Downs that were hashed beside them went with their course.
   */
  const ORIGINAL = [
    ...COURSE.filter((h) => !['Windmill', 'The Mill Race'].includes(h.name)),
    ...['The Hollow', 'The Volcano', 'The Bowl', 'Side-hill'].map((n) => HILLS.find((h) => h.name === n)!),
  ];
  /** Every hand-drawn hole added since, each held to the same rules but not to a hash, so adding one moves nothing above. */
  const ADDED = [...COURSE, ...HILLS].filter((h) => !ORIGINAL.includes(h));

  it('is what every hole that existed had, piece for piece, none of them being bigger than the biggest', () => {
    const all = createHash('sha256');
    let holes = 0;
    for (const hole of ORIGINAL) {
      const l = layoutOf(hole.map, hole.terrain);
      expect(bigness(l), hole.name).toBe(1);
      // the kinds named as they were when the hash was written, so it holds every piece's place, size and turn as it was
      const asWritten = scatter(l, hole.name).map((p) => ({ ...p, kind: WRITTEN_AS[p.kind] ?? p.kind }));
      all.update(JSON.stringify([asWritten, dress(l, hole.name), clearings(l, hole.name)]));
      holes++;
    }
    expect(holes).toBe(11);
    expect(all.digest('hex'), 'the hand-drawn holes').toBe(GOLDEN);
  });

  it('gives every hole added since the same scenery twice, and none of them bigger than the biggest drawn by hand', () => {
    for (const hole of ADDED) {
      const l = layoutOf(hole.map, hole.terrain);
      expect(bigness(l), hole.name).toBe(1);
      const once = JSON.stringify([scatter(l, hole.name), dress(l, hole.name), clearings(l, hole.name)]);
      expect(once, `${hole.name} is made the same each time`).toBe(
        JSON.stringify([scatter(l, hole.name), dress(l, hole.name), clearings(l, hole.name)]),
      );
    }
  });

  it('is bigger by the perimeter past the biggest hole, and never below one', () => {
    expect(REFERENCE.perimeter, 'the biggest: fifteen tiles by seventeen, in units').toBe(2 * (15 + 17) * TILE);
    expect(bigness(open(15, 17))).toBe(1);
    expect(bigness(open(10, 10))).toBe(1);
    expect(bigness(open(30, 34))).toBeCloseTo(2, 9);
    expect(bigness(open(45, 51))).toBeCloseTo(3, 9);
    expect(bigness(open(300, 300))).toBeCloseTo(18.75, 9);
  });

  for (const [cols, rows] of [
    [30, 34],
    [45, 51],
    [100, 100],
    [200, 200],
  ] as const) {
    const l = open(cols, rows);
    const k = bigness(l);
    const items = scatter(l, `big ${cols}`);

    it(`stands ${Math.ceil(SCENERY.most * k)} pieces round a hole of ${cols} tiles by ${rows}, on the rough, clear of the course, and spaced`, () => {
      // near as many as the hole's size says: the same to the perimeter as a small hole has, give or take what will not fit
      expect(items.length).toBeGreaterThanOrEqual(Math.floor(SCENERY.most * k * 0.8));
      expect(items.length).toBeLessThanOrEqual(Math.ceil(SCENERY.most * k));
      for (const s of items) {
        for (let a = 0; a < 8; a++) {
          const t = tileAt(
            l,
            s.x + Math.cos((a / 8) * Math.PI * 2) * SCENERY.clear,
            s.y + Math.sin((a / 8) * Math.PI * 2) * SCENERY.clear,
          );
          expect(t < 0 || (l.solid[t] === 1 && l.rail[t] === 0), `${s.kind} at ${s.x},${s.y} near the course`).toBe(
            true,
          );
        }
      }
      for (let i = 0; i < items.length; i++)
        for (let j = i + 1; j < items.length; j++)
          expect(Math.hypot(items[i].x - items[j].x, items[i].y - items[j].y)).toBeGreaterThanOrEqual(SCENERY.spacing);
    });

    it(`has rocks in clusters in proportion, and a clearing under every one, on a hole of ${cols} tiles by ${rows}`, () => {
      const d = dress(l, `big ${cols}`);
      // three clusters of two rocks or more a hole's size over the biggest's, or nearly, since a cluster has to fit
      expect(d.rocks.length).toBeGreaterThanOrEqual(Math.floor(Math.ceil(3 * k) * 2 * 0.8));
      const rocks = d.rocks.length + items.filter((p) => p.kind === 'rock').length;
      expect(clearings(l, `big ${cols}`).length, 'a clearing for each').toBe(rocks);
    });

    it(`strings bunting in lengths a pennant hangs on and a post holds, round a hole of ${cols} tiles by ${rows}`, () => {
      const d = dress(l, `big ${cols}`);
      for (const b of d.bunting)
        expect(b.length, 'no string longer than can be strung').toBeLessThanOrEqual(REFERENCE.string + 1e-9);
      // the strings of each side end to end: as long as the side, and their posts where the next begins
      const side = (pick: (b: (typeof d.bunting)[number]) => boolean) => d.bunting.filter(pick);
      const across = side((b) => Math.abs(Math.sin(b.yaw)) < 1e-9);
      const along = side((b) => Math.abs(Math.cos(b.yaw)) < 1e-9);
      expect(across.length + along.length, 'every string is along a side').toBe(d.bunting.length);
      const width = l.bounds.maxX - l.bounds.minX + 2 * (TILE + DRESSING.buntingOut),
        depth = l.bounds.maxY - l.bounds.minY + 2 * (TILE + DRESSING.buntingOut);
      expect(
        across.reduce((n, b) => n + b.length, 0),
        'the far side, all of it',
      ).toBeCloseTo(width, 6);
      expect(
        along.reduce((n, b) => n + b.length, 0),
        'both long sides, all of them',
      ).toBeCloseTo(2 * depth, 6);
      expect(across.length).toBe(Math.ceil(width / REFERENCE.string));
      expect(along.length).toBe(2 * Math.ceil(depth / REFERENCE.string));
    });
  }

  it('strings one string a side on every hole that exists, and more on a hole whose sides are longer than sixty units', () => {
    for (const hole of [...COURSE, ...HILLS]) {
      const l = layoutOf(hole.map, hole.terrain);
      const out = 2 * (TILE + DRESSING.buntingOut);
      const strings =
        Math.ceil((l.bounds.maxX - l.bounds.minX + out) / REFERENCE.string) +
        2 * Math.ceil((l.bounds.maxY - l.bounds.minY + out) / REFERENCE.string);
      expect(dress(l, hole.name).bunting.length, hole.name).toBe(strings);
      expect(strings, `${hole.name}: one a side`).toBe(3);
    }
    expect(dress(open(45, 51), 'big').bunting.length).toBeGreaterThan(3);
  });
});

describe('the kinds of scenery', () => {
  it('are named for what is drawn: a broadleaf, a conifer, a bush, flowers and a rock', () => {
    const kinds = new Set(COURSE.flatMap((h) => scatter(layoutOf(h.map), h.name).map((p) => p.kind)));
    expect([...kinds].sort()).toEqual(['broadleaf', 'bush', 'conifer', 'flowers', 'rock']);
  });
});

describe('the scenery beyond a golf hole', () => {
  const holes = [...FLAT_HOLES, links()[0], links()[4]];

  it('stands off the course, its margin clear of every tile a ball can be on, within its reach, and nearer than the map’s edge', () => {
    for (const hole of holes) {
      const l = layoutOf(hole.map, hole.terrain);
      const pieces = beyond(l, hole.name);
      expect(pieces.length, hole.name).toBeGreaterThan(20);
      // a tile a ball can be on is any of the hole's but the empty ones past its out of bounds, beyond the wall there
      const playable = (x: number, y: number) => {
        const t = tileAt(l, x, y);
        return t >= 0 && (l.solid[t] === 0 || l.rail[t] === 1);
      };
      const x0 = l.originX,
        y0 = l.originY,
        x1 = l.originX + l.cols * TILE,
        y1 = l.originY + l.rows * TILE;
      let inside = 0;
      for (const p of pieces) {
        for (let a = 0; a < 16; a++)
          for (const r of [0, BEYOND.margin / 2, BEYOND.margin])
            expect(
              playable(p.x + Math.cos((a / 16) * Math.PI * 2) * r, p.y + Math.sin((a / 16) * Math.PI * 2) * r),
              `${hole.name}: a piece within its margin of the course at ${p.x.toFixed(1)},${p.y.toFixed(1)}`,
            ).toBe(false);
        expect(Math.max(x0 - p.x, p.x - x1, y0 - p.y, p.y - y1), `${hole.name}: within its reach`).toBeLessThanOrEqual(
          BEYOND.reach,
        );
        if (tileAt(l, p.x, p.y) >= 0) inside++;
      }
      // a golf hole made by the generator has empty ground round its out of bounds, and the woods begin there, near the
      // course; a level hole of the tests' own has none
      const empty = Array.from({ length: l.cols * l.rows }, (_, t) => l.solid[t] === 1 && l.rail[t] === 0).some(
        Boolean,
      );
      if (empty) expect(inside, `${hole.name}: some on the empty ground inside the map`).toBeGreaterThan(0);
    }
  });

  it('is the same for a hole every time, another for another, and none on a hole of minigolf', () => {
    const l = layoutOf(links()[0].map, links()[0].terrain);
    expect(beyond(l, 'The Opener')).toEqual(beyond(l, 'The Opener'));
    expect(beyond(l, 'another')).not.toEqual(beyond(l, 'The Opener'));
    for (const hole of COURSE) expect(beyond(layoutOf(hole.map), hole.name)).toEqual([]);
  });

  it('sizes its broadleaves 0.7 to 1.4 of the model by a hash of the place, one in five within 45 yards of the map 1.9 times more, and leaves every other kind as it was', () => {
    let near = 0,
      great = 0,
      far = 0;
    const normal = SCALE.least + SCALE.spread;
    for (const hole of holes) {
      const l = layoutOf(hole.map, hole.terrain);
      const x0 = l.originX,
        y0 = l.originY,
        x1 = l.originX + l.cols * TILE,
        y1 = l.originY + l.rows * TILE;
      for (const p of beyond(l, hole.name)) {
        if (p.kind !== 'broadleaf') {
          expect(p.scale, `${hole.name}: a ${p.kind}`).toBeGreaterThanOrEqual(SCALE.least);
          expect(p.scale, `${hole.name}: a ${p.kind}`).toBeLessThanOrEqual(normal);
          continue;
        }
        const away = Math.max(x0 - p.x, p.x - x1, y0 - p.y, p.y - y1);
        expect(p.scale).toBeGreaterThanOrEqual(SCALE.least * BROADLEAF.least - 1e-9);
        if (away >= BROADLEAF.near) {
          far++;
          // past the near ring there are no great trees, only the hash's 0.7 to 1.4 of the scatter's own 0.8 to 1.25
          expect(p.scale, `${hole.name}: a far broadleaf`).toBeLessThanOrEqual(normal * BROADLEAF.most + 1e-9);
        } else {
          near++;
          expect(p.scale).toBeLessThanOrEqual(normal * BROADLEAF.most * BROADLEAF.big + 1e-9);
          if (p.scale > normal * BROADLEAF.most) great++;
        }
      }
    }
    // a check that found nothing to check passes in silence: some were near, some far, and some of the near were great
    expect(near).toBeGreaterThan(50);
    expect(far).toBeGreaterThan(50);
    expect(great).toBeGreaterThan(0);
    // a great one is by the hash one in five of the near ones, and only the ones the 1.9 lifts past the biggest a plain one is
    expect(great / near).toBeGreaterThan(0.05);
    expect(great / near).toBeLessThan(BROADLEAF.bigShare + 0.05);
  });

  it('is mostly wood, in pine to broadleaf to bush as five to five to one, and denser by the course’s edge than out at the reach', () => {
    const count: Record<string, number> = {};
    let near = 0,
      far = 0;
    for (const hole of holes) {
      const l = layoutOf(hole.map, hole.terrain);
      const x0 = l.originX,
        y0 = l.originY,
        x1 = l.originX + l.cols * TILE,
        y1 = l.originY + l.rows * TILE;
      const round = 2 * (x1 - x0 + y1 - y0);
      for (const p of beyond(l, hole.name)) {
        count[p.kind] = (count[p.kind] ?? 0) + 1;
        const away = Math.max(x0 - p.x, p.x - x1, y0 - p.y, p.y - y1);
        // by the yard of ground: a band further out is longer round
        if (away > 0 && away < BEYOND.reach / 2)
          near += 1 / ((round + (Math.PI * BEYOND.reach) / 2) * (BEYOND.reach / 2));
        else if (away >= BEYOND.reach / 2) far += 1 / ((round + Math.PI * BEYOND.reach * 1.5) * (BEYOND.reach / 2));
      }
    }
    // of the woods’ own pieces (a scrub clump has bushes too) the pines and broadleaves are alike, and each many times the bushes
    expect(count.conifer / count.broadleaf).toBeGreaterThan(0.8);
    expect(count.conifer / count.broadleaf).toBeLessThan(1.25);
    expect(count.conifer + count.broadleaf).toBeGreaterThan(0.6 * Object.values(count).reduce((a, b) => a + b, 0));
    expect(near).toBeGreaterThan(far * 1.2);
  });

  it('is woods and scrub in clumps: every kind, and most pieces near another, never more than its ceiling', () => {
    for (const hole of holes) {
      const l = layoutOf(hole.map, hole.terrain);
      const pieces = beyond(l, hole.name);
      expect(pieces.length).toBeLessThanOrEqual(BEYOND.most);
      expect(new Set(pieces.map((p) => p.kind))).toEqual(new Set(['broadleaf', 'conifer', 'bush', 'fern', 'rock']));
      const near = pieces.filter((p) => pieces.some((q) => q !== p && Math.hypot(q.x - p.x, q.y - p.y) < BEYOND.clump));
      expect(near.length / pieces.length, hole.name).toBeGreaterThan(0.8);
    }
  });
});
