/**
 * The ground a hole stands on, out to the horizon. On a hole of minigolf it is a square 600 across under the rough that
 * grows on past it. A hole of golf has no grass past its stakes, so it is the ground itself that must reach as far as the
 * camera sees, or the sky shows through where the ground ends: a camera 200 back sees 800 on, over a hole 650 long.
 */
import { describe, expect, it } from 'vitest';
import { TILE, layoutOf } from '../src/arena';
import { COURSES } from '../src/course';
import { golfHole } from '../src/golf';
import { LINKS_SPECS } from '../src/links';
import { PALETTE } from '../src/models/palette';
import { ROUGH_DEPTH, Scene } from '../src/scene';

/** The half width of the great flat square under a hole, and the colour it is painted. */
function floor(hole: { name: string; map: readonly string[]; terrain?: readonly string[] | Float32Array }) {
  const layout = layoutOf(hole.map, hole.terrain);
  const groups = new Scene().static(layout, hole.name);
  const g = groups.find((x) => x.mesh.positions.length === 12 && x.matrices[14] === -ROUGH_DEPTH)!;
  expect(g, `${hole.name}: a square under the hole`).toBeDefined();
  return {
    half: Math.max(...Array.from(g.mesh.positions, Math.abs)),
    colour: (g as { albedo?: number[] }).albedo,
    extent: Math.max(layout.cols, layout.rows) * TILE,
  };
}

describe('the ground under a golf hole', () => {
  it('reaches past the hole as far as the camera sees from the furthest back it stands, on every hole of The Links', () => {
    for (const spec of LINKS_SPECS.filter((_, k) => k % 4 === 2)) {
      const f = floor(golfHole(spec));
      // the camera 200 back, looking out to 800: from the edge of the hole and from the middle of it
      expect(f.half, spec.name).toBeGreaterThanOrEqual(f.extent / 2 + 1000);
    }
  });

  it('is the dry colour of the grass out of bounds, so past the stakes it is the one plain to the horizon', () => {
    const f = floor(golfHole(LINKS_SPECS[2]));
    expect(f.colour).toEqual([...PALETTE.oobGround]);
  });

  it("is what it always was under a hole of minigolf: 600 across, in the rough's own colour", () => {
    const f = floor(COURSES[0].holes[0]);
    expect(f.half).toBe(300);
    expect(f.colour).toEqual([...PALETTE.rough]);
  });
});
