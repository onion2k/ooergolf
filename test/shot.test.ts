/** Turning a drag on the screen into a shot on the course, and finding where on the ground the pointer is. */
import { Camera } from 'artshape-render/gpu/camera';
import { describe, expect, it } from 'vitest';
import { DRAG, HeldView, groundAt, shotFromDrag } from '../src/shot';

/** A camera looking up the course from the south, three-quarters from above. */
function camera(aspect = 1.6) {
  const c = new Camera();
  c.position = [0, -60, 50];
  c.target = [0, 0, 0];
  c.fov = 40;
  c.aspect = aspect;
  c.update();
  return c;
}

/** Where a point on the ground is drawn, in normalised device coordinates. */
function ndc(c: Camera, x: number, y: number, z = 0): [number, number] {
  const m = c.viewProjection;
  const w = m[3] * x + m[7] * y + m[11] * z + m[15];
  return [(m[0] * x + m[4] * y + m[8] * z + m[12]) / w, (m[1] * x + m[5] * y + m[9] * z + m[13]) / w];
}

describe('where the pointer is on the ground', () => {
  it('finds the point on the ground a spot on the screen shows, for any aspect and height', () => {
    for (const aspect of [1.6, 0.46]) {
      const c = camera(aspect);
      for (const [x, y, z] of [
        [0, 0, 0],
        [10, 20, 0],
        [-25, -30, 1],
        [30, 30, 1],
      ]) {
        const [nx, ny] = ndc(c, x, y, z);
        const g = groundAt(c, nx, ny, z)!;
        expect(g[0], `x of ${x},${y} at ${aspect}`).toBeCloseTo(x, 3);
        expect(g[1], `y of ${x},${y} at ${aspect}`).toBeCloseTo(y, 3);
      }
    }
  });

  it('finds no ground above the horizon', () => {
    // low over the course, looking along it: the top of the screen is sky
    const c = new Camera();
    c.position = [0, -60, 6];
    c.target = [0, 0, 0];
    c.fov = 40;
    c.aspect = 1.6;
    c.update();
    expect(groundAt(c, 0, 0.99, 0)).toBe(null);
    expect(groundAt(c, 0, -0.99, 0)).not.toBe(null);
  });
});

describe('a drag turned into a shot', () => {
  const short = 800;
  const full = DRAG.full * short;

  it('goes the way opposite to the drag, on the ground', () => {
    // pulled back toward the camera, down the screen: the ball goes up the course
    const s = shotFromDrag([400, 300], [400, 300 + full / 2], [0, 0], [0, -5], short)!;
    expect(s.angle).toBeCloseTo(Math.PI / 2, 6);
    const e = shotFromDrag([400, 300], [400 - full / 2, 300], [0, 0], [-5, 0], short)!;
    expect(e.angle).toBeCloseTo(0, 6);
  });

  it('has the power of the drag length, as a share of the shorter side of the screen, full at its most', () => {
    const at = (px: number) => shotFromDrag([100, 100], [100, 100 + px], [0, 0], [0, -1], short)!.power;
    expect(at(full)).toBeCloseTo(1, 6);
    expect(at(full / 2)).toBeCloseTo(0.5, 6);
    expect(at(full * 3), 'held at the most').toBe(1);
  });

  it('is no shot at all for a drag within the dead zone, or with no ground under it', () => {
    const dead = DRAG.dead * short;
    expect(shotFromDrag([100, 100], [100, 100 + dead * 0.9], [0, 0], [0, -1], short)).toBe(null);
    expect(shotFromDrag([100, 100], [100, 100 + dead * 1.5], [0, 0], [0, -1], short)).not.toBe(null);
    expect(shotFromDrag([100, 100], [100, 400], null, [0, -1], short)).toBe(null);
    expect(shotFromDrag([100, 100], [100, 400], [0, 0], [0, 0], short), 'no direction').toBe(null);
  });

  it('measures power the same on a phone and a desktop, by the shorter side', () => {
    const phone = shotFromDrag([200, 400], [200, 400 + DRAG.full * 400 * 0.5], [0, 0], [0, -1], 400)!;
    const desk = shotFromDrag([600, 400], [600, 400 + DRAG.full * 800 * 0.5], [0, 0], [0, -1], 800)!;
    expect(phone.power).toBeCloseTo(desk.power, 6);
  });
});

describe('a held view', () => {
  it('gives the ground the live camera gave at the hold, and still does once the camera has turned', () => {
    const c = camera();
    const held = new HeldView();
    held.hold(c);
    const spots: [number, number, number][] = [
      [0, 0, 0],
      [0.4, -0.3, 0],
      [-0.7, -0.8, 1],
    ];
    const before = spots.map(([nx, ny, z]) => groundAt(c, nx, ny, z));
    for (const [k, [nx, ny, z]] of spots.entries()) expect(held.ground(nx, ny, z)).toEqual(before[k]);
    // the camera swung round the course
    c.position = [60, 0, 50];
    c.target = [10, 10, 0];
    c.update();
    for (const [k, [nx, ny, z]] of spots.entries()) {
      expect(held.ground(nx, ny, z), `held at ${k}`).toEqual(before[k]);
      expect(groundAt(c, nx, ny, z), `live at ${k}`).not.toEqual(before[k]);
    }
  });

  it('is not changed by the camera it copied from, and a frame can be read by groundAt as a camera is', () => {
    const c = camera();
    const held = new HeldView();
    held.hold(c);
    const was = groundAt(held.frame, 0.2, 0.1, 0);
    c.target = [30, 30, 0];
    c.update();
    expect(groundAt(held.frame, 0.2, 0.1, 0)).toEqual(was);
  });

  it('writes into the point it is given and makes nothing when it is', () => {
    const c = camera();
    const held = new HeldView();
    held.hold(c);
    const out: [number, number] = [0, 0];
    expect(held.ground(0, 0, 0, out)).toBe(out);
  });
});
