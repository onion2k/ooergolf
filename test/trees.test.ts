/**
 * A tree's canopy: a cone standing on the trunk's post, which the physics has no shape for, so the game tests the ball's
 * path against it. Pure arithmetic, tried on its own: where a ball's step first meets the cone (the ball being a sphere,
 * so the cone is met by its middle at a ball's radius out from it), which way the cone's face looks there, and what a
 * ball keeps of its speed when it is turned by it. What is held is that a fast ball is stopped and never passes through,
 * that one over the tip or under the base is not touched, and that a ball is never sped up by a tree.
 */
import { describe, expect, it } from 'vitest';
import { TREE, deflect, hitCanopy, insideCanopy, treeCone, turned } from '../src/trees';
import { seeded } from '../src/random';

const R = 1; // a ball's radius
const cone = treeCone(0, 0, 0);

const along = (from: [number, number, number], to: [number, number, number]) => hitCanopy(cone, from, to, R);

describe('a tree’s canopy', () => {
  it('stands on its trunk from the base to the tip, as wide at its base as the tree says', () => {
    expect(cone.base).toBe(TREE.base);
    expect(cone.apex).toBe(TREE.apex);
    expect(cone.radius).toBe(TREE.radius);
    const raised = treeCone(3, 4, 10);
    expect(raised.base).toBe(10 + TREE.base);
    expect(raised.apex).toBe(10 + TREE.apex);
    expect([raised.x, raised.y]).toEqual([3, 4]);
    // a tall tree, of a ball’s size a good deal bigger than the ball, and a canopy well clear of the ground
    expect(TREE.apex).toBeGreaterThan(12);
    expect(TREE.base).toBeGreaterThan(2);
  });

  it('is met by a ball flying at it at the driver’s speed, on its side, and the ball is turned and not let through', () => {
    // a couple of units short of the canopy at ten up, straight at the trunk, a step of two
    const hit = along([-6, 0, 10], [-4, 0, 10.4])!;
    expect(hit).not.toBeNull();
    expect(hit.t).toBeGreaterThan(0);
    // on the side: the face looks out, away from the trunk, and up
    expect(hit.nx).toBeLessThan(-0.5);
    expect(hit.nz).toBeGreaterThan(0.2);
    expect(Math.hypot(hit.nx, hit.ny, hit.nz)).toBeCloseTo(1, 9);
    // and it lay a ball’s radius out of the cone’s own side, so its middle was met a little further out
    const rhoAtTen = (TREE.radius * (TREE.apex - 10)) / (TREE.apex - TREE.base);
    const middle = -6 + 2 * hit.t;
    expect(Math.abs(middle)).toBeGreaterThan(rhoAtTen);
  });

  it('is not met by a ball over the tip, or under the base, or outside its edge', () => {
    // over the tip, low and fast: 30 up
    expect(along([-30, 0, 30], [30, 0, 30])).toBeNull();
    // under the base, at the height a driver flies at, between the ground and the canopy: the trunk is the physics’
    expect(along([-30, 0, 2], [30, 0, 2])).toBeNull();
    // outside the edge at the widest, ten units wide of it
    expect(along([-30, 12, 6], [30, 12, 6])).toBeNull();
    // going away
    expect(along([-3, 0, 10], [-9, 0, 10])).toBeNull();
  });

  it('is met from below by a ball that rises into its underside, which looks straight down', () => {
    const hit = along([2, 0, TREE.base - 1.4], [2.2, 0, TREE.base - 0.4])!;
    expect(hit).not.toBeNull();
    expect(hit.nz).toBe(-1);
    expect(hit.nx).toBeCloseTo(0, 9);
  });

  it('is met from above by a ball that falls onto it, on the side that faces up', () => {
    const hit = along([2.5, 0, 24], [2.5, 0, 6])!;
    expect(hit).not.toBeNull();
    expect(hit.nz).toBeGreaterThan(0.2);
  });

  it('is never passed through, at any speed a ball goes, by a ball aimed at its middle from any side and height', () => {
    const random = seeded(3);
    let hits = 0;
    for (let k = 0; k < 400; k++) {
      const a = random() * Math.PI * 2;
      const z = TREE.base + 1 + random() * (TREE.apex - TREE.base - 3);
      const speed = 20 + random() * 220;
      const step = speed / 120;
      const from: [number, number, number] = [Math.cos(a) * 12, Math.sin(a) * 12, z];
      // stepped as the game steps it, straight at the trunk, until it is past where the canopy is
      let p = from;
      let entered = false;
      for (let s = 0; s < 2000 && !entered; s++) {
        const q: [number, number, number] = [p[0] - Math.cos(a) * step, p[1] - Math.sin(a) * step, p[2]];
        if (hitCanopy(cone, p, q, R)) entered = true;
        p = q;
        if (Math.hypot(p[0], p[1]) < 1) break;
      }
      if (entered) hits++;
      expect(entered, `from ${a.toFixed(2)} at ${z.toFixed(1)}, ${speed.toFixed(0)} a second`).toBe(true);
    }
    expect(hits).toBe(400);
  });

  it('puts the hit on the face: the hit point is on the surface a ball’s radius out, and the step before it is outside', () => {
    const random = seeded(8);
    for (let k = 0; k < 200; k++) {
      const p0: [number, number, number] = [(random() - 0.5) * 30, (random() - 0.5) * 30, random() * 26];
      const p1: [number, number, number] = [(random() - 0.5) * 30, (random() - 0.5) * 30, random() * 26];
      // a step that begins inside it is met at once, and no place on the surface: not what is tried here
      if (insideCanopy(cone, p0, R) > 0) continue;
      const hit = along(p0, p1);
      if (!hit) continue;
      const at: [number, number, number] = [
        p0[0] + (p1[0] - p0[0]) * hit.t,
        p0[1] + (p1[1] - p0[1]) * hit.t,
        p0[2] + (p1[2] - p0[2]) * hit.t,
      ];
      // just before it, outside; at it, on the surface, which is inside by no more than a whisker
      if (hit.t > 1e-6) {
        const before: [number, number, number] = [
          p0[0] + (p1[0] - p0[0]) * hit.t * 0.999,
          p0[1] + (p1[1] - p0[1]) * hit.t * 0.999,
          p0[2] + (p1[2] - p0[2]) * hit.t * 0.999,
        ];
        expect(insideCanopy(cone, before, R)).toBeLessThanOrEqual(1e-6);
      }
      expect(Math.abs(insideCanopy(cone, at, R)), `case ${k}`).toBeLessThan(1e-4);
    }
  });

  it('reports how far into the canopy a point is: over nought inside, nought on the surface, nought outside', () => {
    expect(insideCanopy(cone, [0, 0, 10], R)).toBeGreaterThan(1);
    expect(insideCanopy(cone, [0, 0, 30], R)).toBe(0);
    expect(insideCanopy(cone, [0, 0, 2], R)).toBe(0);
    expect(insideCanopy(cone, [9, 0, 10], R)).toBe(0);
  });
});

describe('a ball turned by a canopy', () => {
  it('keeps some of its speed along the face and a little of what it had into it, and is turned away from the face', () => {
    const n: [number, number, number] = [-0.8, 0, 0.6];
    const v: [number, number, number] = [100, 0, 20];
    const out = deflect(v, n, TREE.glance);
    // away from the face: no longer going into it
    expect(out[0] * n[0] + out[1] * n[1] + out[2] * n[2]).toBeGreaterThanOrEqual(0);
    // and slower, a good deal
    expect(Math.hypot(...out)).toBeLessThan(Math.hypot(...v) * 0.7);
  });

  it('never gives a ball speed: for any way in, at any face, the ball is no faster for it', () => {
    const random = seeded(12);
    for (let k = 0; k < 500; k++) {
      const a = random() * Math.PI * 2,
        b = (random() - 0.2) * Math.PI;
      const n: [number, number, number] = [Math.cos(a) * Math.cos(b), Math.sin(a) * Math.cos(b), Math.sin(b)];
      const v: [number, number, number] = [(random() - 0.5) * 240, (random() - 0.5) * 240, (random() - 0.5) * 120];
      const into = v[0] * n[0] + v[1] * n[1] + v[2] * n[2];
      if (into >= 0) continue;
      const out = deflect(v, n, random() < 0.5 ? TREE.glance : TREE.under);
      expect(Math.hypot(...out)).toBeLessThanOrEqual(Math.hypot(...v) + 1e-9);
      expect(out[0] * n[0] + out[1] * n[1] + out[2] * n[2]).toBeGreaterThanOrEqual(-1e-9);
    }
  });

  it('leaves a ball that is going away from the face as it is', () => {
    const n: [number, number, number] = [0, 0, 1];
    const v: [number, number, number] = [5, 6, 7];
    expect(deflect(v, n, TREE.glance)).toEqual(v);
  });

  it('knocks a ball rising into the underside back down, and near enough dead', () => {
    const out = deflect([30, 0, 40], [0, 0, -1], TREE.under);
    expect(out[2]).toBeLessThan(0);
    expect(Math.hypot(...out)).toBeLessThan(Math.hypot(30, 0, 40) * 0.5);
  });
});

describe('a ball turned by the face it met', () => {
  it('is knocked down, nearly dead, by the underside, and turned as a glance by the side', () => {
    const v: [number, number, number] = [30, 0, 40];
    const under = turned(v, { t: 0.5, nx: 0, ny: 0, nz: -1 });
    expect(under).toEqual(deflect(v, [0, 0, -1], TREE.under));
    const side = turned([100, 0, 20], { t: 0.5, nx: -0.8, ny: 0, nz: 0.6 });
    expect(side).toEqual(deflect([100, 0, 20], [-0.8, 0, 0.6], TREE.glance));
    // and the two are not the same treatment
    expect(TREE.under.keep).not.toBe(TREE.glance.keep);
    expect(turned(v, { t: 0.5, nx: 0, ny: 0, nz: -1 })).not.toEqual(turned(v, { t: 0.5, nx: 0, ny: 0.6, nz: -0.8 }));
  });
});
