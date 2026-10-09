/**
 * The world past a hole, as the title picture has it: a ring of faceted hills round the hole, blue mountains behind
 * them, a lake in a gap of the hills, forest on the hills and clouds that drift with the hole's wind. Seen only from the
 * fly-in, so it is held to standing well clear of the hole and what is round it, to being the same for a hole every
 * time, to a triangle ceiling, and the clouds to drifting by game time without leaving the ring.
 */
import { describe, expect, it } from 'vitest';
import { TILE, layoutOf, type Layout } from '../src/arena';
import { BACKDROP, backdropOf, cloudAt } from '../src/backdrop';
import { groundZOf } from '../src/hills';
import { COURSES } from '../src/course';
import { BEYOND } from '../src/scenery';
import { BUDGET } from '../src/models';
import { links } from '../src/links';

const BASE = -3;
const meadow = COURSES[0].holes[0];
const holes: [string, Layout][] = [
  [meadow.name, layoutOf(meadow.map)],
  [links()[0].name, layoutOf(links()[0].map, links()[0].terrain)],
];

/** The ring's middle and how far its inside is from it, worked out here from the hole's map. */
function ring(l: Layout) {
  const cx = l.originX + (l.cols * TILE) / 2,
    cy = l.originY + (l.rows * TILE) / 2;
  const half = Math.hypot(l.cols * TILE, l.rows * TILE) / 2;
  return { cx, cy, half };
}

const points = (p: Float32Array) =>
  Array.from({ length: p.length / 3 }, (_, i) => [p[i * 3], p[i * 3 + 1], p[i * 3 + 2]]);

describe('the world past a hole', () => {
  it('is the same for a hole every time, and another for another', () => {
    const [name, l] = holes[0];
    expect(backdropOf(l, name, BASE)).toEqual(backdropOf(l, name, BASE));
    expect(backdropOf(l, 'another', BASE).forest).not.toEqual(backdropOf(l, name, BASE).forest);
  });

  it('stands clear of the hole and all round it: the hills rise from past the hole and its scenery, out to the mountains', () => {
    for (const [name, l] of holes) {
      const b = backdropOf(l, name, BASE);
      const { cx, cy, half } = ring(l);
      // nothing of it stands over the hole, or the scenery beyond a golf hole
      const clear = half + (l.golf ? BEYOND.reach : 0);
      for (const mesh of [b.hills, b.mountains, b.lake])
        for (const [x, y, z] of points(mesh.positions)) {
          const d = Math.hypot(x - cx, y - cy);
          expect(d, `${name}: too near the hole`).toBeGreaterThan(clear);
          expect(z, `${name}: under the ground`).toBeGreaterThan(BASE - 10);
        }
      for (const [, , z] of points(b.hills.positions))
        expect(z, `${name}: a hill taller than the hills`).toBeLessThanOrEqual(BASE + hillMost() + 1e-6);
      for (const t of b.forest) expect(Math.hypot(t.x - cx, t.y - cy)).toBeGreaterThan(clear);
    }
  });

  it('has a lake in a gap of the hills, open water a little under the ground round it', () => {
    for (const [name, l] of holes) {
      const b = backdropOf(l, name, BASE);
      expect(b.lake.indices.length, name).toBeGreaterThan(0);
      for (const [, , z] of points(b.lake.positions)) expect(z).toBeCloseTo(BASE - 2, 6);
    }
  });

  it('has forest on the hills, each tree on the hill where it stands, and clouds high over them, within its counts', () => {
    for (const [name, l] of holes) {
      const b = backdropOf(l, name, BASE);
      expect(b.forest.length, name).toBeGreaterThan(100);
      expect(b.forest.length).toBeLessThanOrEqual(BACKDROP.forest);
      expect(b.clouds.length).toBe(BACKDROP.clouds);
      for (const c of b.clouds) {
        expect(c.z).toBeGreaterThanOrEqual(BACKDROP.cloudHeight[0]);
        expect(c.z).toBeLessThanOrEqual(BACKDROP.cloudHeight[1]);
      }
    }
  });

  it('keeps to its triangle budget, every tree drawn', () => {
    for (const [name, l] of holes) {
      const b = backdropOf(l, name, BASE);
      const total =
        (b.hills.indices.length + b.mountains.indices.length + b.lake.indices.length) / 3 +
        b.forest.length * BACKDROP.treeTriangles +
        b.clouds.length * BUDGET.cloud;
      expect(total, name).toBeLessThanOrEqual(BUDGET.backdrop);
    }
  });
});

describe('the world past a golf hole, on its hills', () => {
  const [name, l] = holes[1];
  const ground = groundZOf(l, name);
  const b = backdropOf(l, name, ground);

  it('stands on the ground where it is: no hill, mountain or tree under it, none floating more than the hills’ own height over it', () => {
    let rises = 0;
    for (const mesh of [b.hills, b.mountains])
      for (const [x, y, z] of points(mesh.positions)) {
        expect(z, 'under the ground').toBeGreaterThanOrEqual(ground(x, y) - 8 - 1e-6);
        expect(z, 'over the ground').toBeLessThanOrEqual(ground(x, y) + 260 + hillMost() + 1e-6);
        if (ground(x, y) > 5) rises++;
      }
    expect(rises, 'a check that met no rise in the ground passes in silence').toBeGreaterThan(0);
    for (const t of b.forest) expect(t.z, 'a tree under the ground').toBeGreaterThanOrEqual(ground(t.x, t.y) - 9);
  });

  it("keeps its lake level, at the water's own level of the hollow the ground was carved to, and is the same as on a constant base where the ground is one", () => {
    const level = new Set(points(b.lake.positions).map(([, , z]) => z.toFixed(4)));
    expect(level.size).toBe(1);
    expect(Number(Array.from(level)[0])).toBeCloseTo(ground.lake!.level, 3);
    // the shore's points (the fan's middle is in the water) meet the ground, which never stands under the water there
    const shore = points(b.lake.positions).filter(([x, y]) => ground.lake!.weight(x, y) < 1);
    expect(shore.length, 'a check that met no shore passes in silence').toBeGreaterThan(0);
    for (const [x, y] of shore) expect(ground(x, y)).toBeGreaterThanOrEqual(ground.lake!.level - 0.05);
    expect(backdropOf(l, name, () => BASE)).toEqual(backdropOf(l, name, BASE));
  });
});

describe('the clouds', () => {
  const wind: [number, number] = [0.6, 0.8];

  it("drift with the hole's wind by game time, the same for the same time", () => {
    const [name, l] = holes[0];
    const c = backdropOf(l, name, BASE).clouds[0];
    const a = cloudAt(c, 0, wind),
      b = cloudAt(c, 10, wind);
    const moved = [b.x - a.x, b.y - a.y];
    expect(Math.hypot(moved[0], moved[1])).toBeCloseTo(10 * BACKDROP.drift, 4);
    expect((moved[0] * wind[0] + moved[1] * wind[1]) / Math.hypot(moved[0], moved[1])).toBeCloseTo(1, 6);
    expect(cloudAt(c, 10, wind)).toEqual(b);
  });

  it('never leave the sky round the hole: a cloud blown out past the ring comes back in on the far side', () => {
    const [name, l] = holes[1];
    const b = backdropOf(l, name, BASE);
    for (const c of b.clouds)
      for (let t = 0; t < 4000; t += 97) {
        const at = cloudAt(c, t, wind);
        const d = Math.hypot(at.x - b.centre[0], at.y - b.centre[1]);
        expect(d).toBeLessThanOrEqual(b.outer + 1e-6);
      }
  });
});

/** The tallest a hill stands above the ground, from the figures. */
function hillMost(): number {
  return BACKDROP.hill[0] + BACKDROP.hill[1];
}
