/**
 * The kicker, drawn to exactly the footprint the physics gives it: a pinball's mushroom bumper, a round post that
 * throws a ball harder than a post does. It reads as another thing from a post at a glance, which is the point of it:
 * a player must know which one will kick before the ball gets there. Its origin is the middle of its foot, and it
 * faces nowhere.
 */
import { PALETTE, ROUGH } from './palette';
import { matte, type Colour, type Model } from './part';
import { at, built, lathe, type Turned } from './shapes';

/**
 * A kicker of `radius` and `height`: a flanged foot, a short stem and a domed cap whose rim is the widest the kicker is,
 * at the height of the ball's middle, which is where the ball meets a post and so where the drawn edge must be the
 * physics' circle. Everything else stands inside it. The cap is turned from two quarters of an ellipse, shaded round,
 * and the whole is lathe-turned in `sides`, so its points are on the circle and it is never wider than the physics'.
 */
export function kicker(
  radius: number,
  {
    height = 1.6,
    colour = PALETTE.plastic.orange,
    stem = PALETTE.plastic.blue,
    foot = PALETTE.cream,
    sides = 20,
  }: { height?: number; colour?: Colour; stem?: Colour; foot?: Colour; sides?: number } = {},
): Model {
  const r = radius,
    h = height;
  const here = at(0, 0, 0);
  // the cap: an ellipse about (0, rim), wide as the kicker, taller above the rim than it is below
  const rim = 0.62 * h,
    above = h - rim,
    below = 0.26 * h;
  const cap: Turned[] = [];
  const arc = (from: number, to: number, rings: number, b: number) => {
    for (let i = 0; i <= rings; i++) {
      const t = from + ((to - from) * i) / rings;
      const out = Math.cos(t),
        up = Math.sin(t);
      // on the axis exactly, so the pole closes the surface; the normal of an ellipse leans by the squares of its axes
      const nr = out / r,
        nz = up / b,
        n = Math.hypot(nr, nz);
      cap.push([Math.abs(out) < 1e-9 ? 0 : r * out, rim + b * up, nr / n, nz / n]);
    }
  };
  // from the underside's pole out to the rim, and over the dome to the top, the outside on the right all the way
  arc(-Math.PI / 2, 0, 2, below);
  cap.pop();
  arc(0, Math.PI / 2, 5, above);
  const post = 0.55 * r;
  return {
    name: 'kicker',
    parts: [
      {
        // a flange round the foot, which is as wide as the cap so the drawn circle holds at the ground too
        name: 'foot',
        material: matte(foot, ROUGH.plastic),
        mesh: built((b) =>
          lathe(b, here, sides, [
            [r, 0, 1, 0],
            [r, 0.1 * h, 1, 0],
            [0.82 * r, 0.16 * h, 0.5, 0.87],
            [0.7 * r, 0.2 * h, 0, 1],
          ]),
        ),
      },
      {
        name: 'stem',
        material: matte(stem, ROUGH.plastic),
        mesh: built((b) =>
          lathe(b, here, sides, [
            [post, 0.18 * h, 1, 0],
            [post, rim - below * 0.4, 1, 0],
          ]),
        ),
      },
      {
        name: 'cap',
        material: matte(colour, ROUGH.plastic),
        mesh: built((b) => lathe(b, here, sides, cap)),
      },
    ],
    moving: [],
  };
}
