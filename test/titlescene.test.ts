/**
 * The title scene's own arithmetic, with no page: where the camera stands and how the word is fitted to the screen's shape
 * above the course cards, and how each piece of the lettering drops, squashes and settles from the title's clock alone.
 * Held as numbers because a letter that pokes out of its outline for a frame, one that is below the ground or a word cut
 * by a phone's edge is plain to see and easy to lose in a change.
 */
import { describe, expect, it } from 'vitest';
import { Camera } from 'artshape-render/gpu/camera';
import data from '../src/titletrace.json';
import { titleLetters, type TitlePiece } from '../src/models/lettering';
import { titleProblems } from '../src/invariants';
import {
  CARDS,
  DROP,
  TitleScene,
  boxOf,
  cardsMax,
  cardsTop,
  fitTitle,
  letterPose,
  piecesBounds,
  placeCamera,
  titleFrame,
  wordOf,
  WORD,
  type Pose,
} from '../src/titlescene';

const title = titleLetters(data);
const pieces = title.pieces;
const word = wordOf(pieces);
const rest: Pose = { shown: true, lift: 0, sx: 1, sy: 1 };
const pose = (piece: TitlePiece, t: number, reduced = false): Pose => letterPose(piece, t, reduced, { ...rest });
const named = (name: string) => pieces.find((p) => p.name === name)!;

/** The eight screens `smoke/title.spec.ts` has always held the logo to: a desk to an ultrawide, and a phone on its side. */
const SCREENS = [
  ['a desk', 1280, 800],
  ['an ultrawide', 2560, 1080],
  ['a phone on its side', 844, 390],
  ['a tablet on its side', 1024, 768],
  ['a tablet upright', 768, 1024],
  ['a phone upright', 400, 860],
  ['a tall phone', 360, 800],
  ['a very tall phone', 360, 900],
] as const;

/** The camera the page would set, placed for a hole whose tee and cup are at these places, and updated. */
function cameraFor(width: number, height: number) {
  const aspect = width / height;
  const fit = fitTitle(aspect, cardsTop(width, height), word);
  const cam = new Camera();
  cam.near = 2;
  cam.far = 800;
  cam.aspect = aspect;
  placeCamera(cam, { x: 40, y: 10 }, { x: 40, y: 400 }, 0.5, fit);
  cam.update();
  return { fit, cam, aspect };
}

describe('the title camera and the word fitted to a screen', () => {
  for (const [name, width, height] of SCREENS) {
    it(`holds the whole word on the screen and above the cards on ${name}, ${width} by ${height}`, () => {
      const { fit, cam, aspect } = cameraFor(width, height);
      const frame = titleFrame(cam, fit, word);
      let [x0, y0, x1, y1] = [Infinity, Infinity, -Infinity, -Infinity];
      const box = [0, 0, 0, 0];
      for (const piece of pieces) {
        boxOf(box, cam.viewProjection, frame, piece.pivot, piecesBounds(piece), rest);
        x0 = Math.min(x0, box[0]);
        y0 = Math.min(y0, box[1]);
        x1 = Math.max(x1, box[2]);
        y1 = Math.max(y1, box[3]);
      }
      // normalised device coordinates, y up: the screen is -1 to 1 each way
      expect(x0, 'left edge').toBeGreaterThanOrEqual(-0.97);
      expect(x1, 'right edge').toBeLessThanOrEqual(0.97);
      expect(y1, 'top').toBeLessThanOrEqual(0.97);
      expect(y0, 'foot, clear of the cards').toBeGreaterThanOrEqual(cardsTop(width, height) - 1e-6);
      // and not a speck: it is as big as the room lets it, tight against the sides or against the top and the cards
      const room = 0.95 - (cardsTop(width, height) + 0.05);
      expect(
        x1 - x0 >= 0.9 * 1.84 || y1 - y0 >= 0.85 * room,
        `${(x1 - x0).toFixed(2)} wide, ${(y1 - y0).toFixed(2)} high`,
      ).toBe(true);
      void aspect;
    });
  }

  it('is the same for the same screen, and puts the camera behind the tee, looking down the hole', () => {
    const a = cameraFor(1280, 800);
    const b = cameraFor(1280, 800);
    expect(a.cam.position).toEqual(b.cam.position);
    expect(a.cam.target).toEqual(b.cam.target);
    // a hole that runs north from the tee: the camera stands south of it, high, and looks far up the hole and a little down
    expect(a.cam.position[1]).toBeLessThan(10);
    expect(a.cam.position[2]).toBeGreaterThan(8);
    expect(a.cam.target[1]).toBeGreaterThan(100);
    expect(a.cam.target[2]).toBeLessThan(a.cam.position[2]);
  });

  it('stands the word four units from the camera, as the agreed look has it', () => {
    expect(cameraFor(1280, 800).fit.depth).toBe(4);
    expect(cameraFor(400, 860).fit.depth).toBe(4);
  });

  it('keeps the cards under the word: they take no more than their share from the foot of the screen', () => {
    for (const [, w, h] of SCREENS) {
      const max = cardsMax(w, h);
      expect(max).toBeGreaterThan(0);
      expect(max).toBeLessThanOrEqual(0.56 * h + 1e-9);
      // the panel's top edge, as a share of the screen from its foot, in normalised coordinates
      expect(cardsTop(w, h)).toBeCloseTo(1 - (2 * (h - CARDS.foot - max)) / h, 9);
    }
  });
});

describe('the word', () => {
  it('is the size the fit is made for, which is the lettering the page draws', () => {
    expect(word.width).toBeCloseTo(WORD.width, 1);
    expect(word.height).toBeCloseTo(WORD.height, 1);
    expect(Math.abs(word.width - WORD.width) / WORD.width).toBeLessThan(0.01);
    expect(Math.abs(word.height - WORD.height) / WORD.height).toBeLessThan(0.01);
  });
});

describe('the drop', () => {
  it('is hidden before its step and falls in from above, never below the ground', () => {
    for (const piece of pieces) {
      const begins = DROP.apart * piece.step;
      expect(pose(piece, begins - 1e-6).shown, `${piece.name} before its turn`).toBe(false);
      for (let t = begins; t < begins + 3; t += 1 / 120) {
        const p = pose(piece, t);
        expect(p.shown).toBe(true);
        expect(p.lift, `${piece.name} lift at ${t.toFixed(3)}`).toBeGreaterThanOrEqual(0);
        expect(p.lift).toBeLessThanOrEqual(DROP.height + 1e-9);
        expect(Number.isFinite(p.sx) && Number.isFinite(p.sy)).toBe(true);
        expect(p.sx).toBeGreaterThan(0.5);
        expect(p.sy).toBeGreaterThan(0.5);
      }
    }
  });

  it('lets the letters go one by one from the left, 0.09 s apart', () => {
    const order = ['O', 'f', 'C', 'o', 'u', 'r', 's', 'e', 'bar', 'dot'];
    order.forEach((name, k) => expect(named(name).step, name).toBe(k));
    const t = DROP.apart * 3 + 0.01;
    expect(pose(named('o'), t).shown).toBe(true);
    expect(pose(named('u'), t).shown).toBe(false);
  });

  it('falls for 0.3 s, then squashes down and out against the ground and springs back', () => {
    const f = named('C');
    const at = DROP.apart * f.step;
    expect(pose(f, at).lift).toBeCloseTo(DROP.height, 6);
    expect(pose(f, at + DROP.fall * 0.5).lift).toBeGreaterThan(0);
    expect(pose(f, at + DROP.fall).lift).toBeCloseTo(0, 9);
    const hit = pose(f, at + DROP.fall + 1e-4);
    expect(hit.sy, 'squashed down').toBeLessThan(0.8);
    expect(hit.sx, 'and out').toBeGreaterThan(1.05);
    let rises = false;
    for (let t = at + DROP.fall; t < at + DROP.fall + DROP.settle; t += 1 / 240) if (pose(f, t).sy > 1) rises = true;
    expect(rises, 'springs past its height').toBe(true);
    const done = pose(f, at + DROP.fall + DROP.settle);
    expect(done).toEqual(rest);
  });

  it('has every piece standing at rest, exactly, by 1.7 s, and says when', () => {
    const scene = new TitleScene(pieces, false);
    expect(scene.end).toBeLessThanOrEqual(1.7);
    expect(scene.end).toBeGreaterThan(1.4);
    for (const piece of pieces) expect(pose(piece, scene.end), piece.name).toEqual(rest);
    for (const piece of pieces) expect(pose(piece, 40), piece.name).toEqual(rest);
  });

  it('is the same for the same time, whoever asks and however often', () => {
    for (const piece of pieces)
      for (const t of [-0.3, 0, 0.2, 0.55, 0.9, 1.3, 1.6, 9]) {
        const a = pose(piece, t);
        const b = pose(piece, t);
        letterPose(piece, 0.1, false, { ...rest });
        expect(b).toEqual(a);
      }
  });

  it('drops the outline with its letter and never squashes it, so no crack opens between two rows', () => {
    const outlines = pieces.filter((p) => p.kind === 'outline');
    expect(outlines.length).toBeGreaterThan(8);
    for (const out of outlines) {
      const owner = named(out.owner);
      expect(out.step, out.name).toBe(owner.step);
      for (let t = -0.2; t < 2; t += 1 / 60) {
        const o = pose(out, t);
        const w = pose(owner, t);
        expect(o.shown, `${out.name} at ${t.toFixed(3)}`).toBe(w.shown);
        expect(o.lift).toBe(w.lift);
        expect(o.sx).toBe(1);
        expect(o.sy).toBe(1);
      }
    }
  });

  it('keeps a squashed face inside its own rigid outline all the way down', () => {
    for (const out of pieces.filter((p) => p.kind === 'outline' && named(p.owner).kind === 'face')) {
      const owner = named(out.owner);
      // the faces and the pieces standing on the ground squash about their own foot; the outline stays as it was cut
      const face = piecesBounds(owner);
      const rim = piecesBounds(out);
      for (let t = 0; t < 2.2; t += 1 / 240) {
        const p = pose(owner, t);
        const left = owner.pivot[0] + face.x0 * p.sx;
        const right = owner.pivot[0] + face.x1 * p.sx;
        expect(left, `${owner.name} left at ${t.toFixed(3)}`).toBeGreaterThanOrEqual(out.pivot[0] + rim.x0 - 1e-6);
        expect(right, `${owner.name} right at ${t.toFixed(3)}`).toBeLessThanOrEqual(out.pivot[0] + rim.x1 + 1e-6);
      }
    }
  });

  it('squashes the faces, the ball, the pole and the flag, and drops the sparkles whole', () => {
    for (const piece of pieces) {
      let squashed = false;
      const at = DROP.apart * piece.step;
      for (let t = at; t < at + 1; t += 1 / 240) {
        const p = pose(piece, t);
        if (p.sy !== 1 || p.sx !== 1) squashed = true;
      }
      expect(squashed, piece.name).toBe(piece.kind === 'face' || piece.kind === 'ball' || piece.kind === 'flag');
    }
  });

  it('puts everything up at once for a player who asked for less motion', () => {
    for (const piece of pieces) for (const t of [-5, 0, 0.3, 1]) expect(pose(piece, t, true), piece.name).toEqual(rest);
  });
});

describe('the title scene as the page runs it', () => {
  it('has a clock of its own that begins a moment before the first letter and stands the word by its end', () => {
    const scene = new TitleScene(pieces, false);
    expect(scene.t).toBeLessThan(0);
    expect(scene.landed).toBe(false);
    for (let n = 0; n < 60 * 3; n++) scene.advance(1 / 60);
    expect(scene.landed).toBe(true);
    // the clock stops where it landed: nothing is added to for ever
    const t = scene.t;
    scene.advance(5);
    expect(scene.t).toBe(t);
  });

  it('is landed from the start under reduced motion, or when asked to stand', () => {
    expect(new TitleScene(pieces, true).landed).toBe(true);
    const standing = new TitleScene(pieces, false, true);
    expect(standing.landed).toBe(true);
    for (const piece of pieces) expect(standing.pose(piece, { ...rest }), piece.name).toEqual(rest);
  });

  it('refuses a step that is not a time', () => {
    const scene = new TitleScene(pieces, false);
    const t = scene.t;
    scene.advance(NaN);
    scene.advance(-1);
    expect(scene.t).toBe(t);
  });
});

describe('the rules the fuzzer holds the title to', () => {
  it('finds nothing wrong with a drop run frame by frame to its end and past it, nor with one stood at once', () => {
    const scene = new TitleScene(pieces, false);
    let asked = 0;
    for (let n = 0; n < 60 * 3; n++) {
      expect(titleProblems(scene, pieces), `frame ${n}`).toEqual([]);
      asked++;
      scene.advance(1 / 60);
    }
    expect(asked, 'the rule was asked').toBeGreaterThan(100);
    expect(scene.landed).toBe(true);
    expect(titleProblems(new TitleScene(pieces, true), pieces)).toEqual([]);
    expect(titleProblems(new TitleScene(pieces, false, true), pieces)).toEqual([]);
  });

  it('finds an outline that squashes, one with no owner to drop with, and a scene that says it landed too soon', () => {
    const scene = new TitleScene(pieces, false);
    scene.t = DROP.apart * 2 + DROP.fall + 0.02;
    // a scene whose outlines are squashed with their letters
    const bad = Object.assign(Object.create(scene) as TitleScene, {
      pose: (piece: Parameters<TitleScene['pose']>[0], out: Pose) => {
        scene.pose(piece, out);
        if (piece.kind === 'outline') out.sx = 1.1;
        return out;
      },
    });
    expect(titleProblems(bad, pieces).join()).toContain('is squashed');
    expect(titleProblems(scene, [{ kind: 'outline', owner: 'nobody', step: 0 }]).join()).toContain(
      'no piece to drop with',
    );
    scene.t = 0.1;
    Object.defineProperty(scene, 'landed', { value: true });
    expect(titleProblems(scene, pieces).join()).toContain('has landed');
  });
});
