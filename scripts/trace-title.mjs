/**
 * Traces the lettering of `src/title_sq.png` into `src/titletrace.json`: the data `src/models/lettering.ts` builds the
 * 3D title from. It is run by hand, once, when the picture changes (`node scripts/trace-title.mjs`), and its output is
 * committed; the game never reads the picture, so the download holds a few kilobytes of outlines and not a 116 kB image.
 *
 * What it reads off the picture: the cream faces of each letter and their colour down their height, the tan underside,
 * the dark green outline behind the lot and its lighter outer edge, the ball and the ramp of light on it, the flag and
 * its two reds, the pole and the sparkles. Each region is classified by colour, blurred, and walked along its contour by
 * marching squares at sub-pixel precision, then simplified (Douglas-Peucker, half a pixel) and rounded off at gentle
 * corners (one Chaikin pass). Coordinates are picture pixels from the crop's corner, y down, to a tenth of a pixel.
 *
 * The outline is cut into a piece for each letter (and the ball, the pole and the flag) by which of them each pixel of it
 * is nearest to, and each piece is grown a pixel and a half under its neighbours, so that pieces moved apart a little
 * (a letter squashed as it lands) leave no hairline of sky between them. Without that every piece would stop exactly
 * where the next begins, and a gap the width of a pixel shows wherever two of them are not moved alike.
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { PNG } from 'pngjs';

/** The part of the picture that holds the lettering, from its corner and its size. */
export const CROP = { x0: 270, y0: 110, x1: 1020, y1: 570 };
/** How far each outline piece is grown under its neighbours, in picture pixels. */
export const GROW = 2;
/** How wide the outline's lighter outer edge is, in picture pixels. */
export const EDGE = 4;
/** How many bands of colour a letter's face is read in, from the top down. */
export const BANDS = 12;
/** Where the light comes from on the ball (right, up, toward the viewer), unnormalised: the picture's own. */
export const BALL_LIGHT = [0.5, 0.6, 0.62];
/** The ball's disc in the crop, found by eye on the picture. */
export const BALL = { cx: 262, cy: 130, r: 57 };
/** The two ends of the fold across the flag's cloth, in the crop, which splits its dark red from its light. */
export const FOLD = [
  [542, 57],
  [522, 105],
];
/** The round top of the pole, which the picture draws as a ball on it: where, in the crop, and how wide. */
export const KNOB = { x: 502, y: 36, r: 12.5 };
/** The letters by where each begins across the crop, since a letter's name is not in the picture. */
const NAMES = { 42: 'C', 175: 'o', 180: 'O', 285: 'u', 345: 'f', 389: 'r', 451: 's', 539: 'e', 627: 'dot', 641: 'bar' };

const median = (a) => [...a].sort((x, y) => x - y)[a.length >> 1];
const rgbMedian = (cells) => [0, 1, 2].map((c) => median(cells.map((v) => v[c])));

/** @param {Buffer} file the PNG's bytes */
export function traceTitle(file, { grow = GROW } = {}) {
  const png = PNG.sync.read(file);
  const W = png.width;
  const { x0: X0, y0: Y0 } = CROP;
  const w = CROP.x1 - X0,
    h = CROP.y1 - Y0,
    N = w * h;
  const px = (x, y) => {
    const i = ((y + Y0) * W + x + X0) * 4;
    return [png.data[i], png.data[i + 1], png.data[i + 2]];
  };
  const at = (k) => px(k % w, (k / w) | 0);

  // ---- what each pixel is, by its colour
  const sky = new Uint8Array(N),
    warm = new Uint8Array(N),
    red = new Uint8Array(N),
    yellow = new Uint8Array(N),
    green = new Uint8Array(N),
    cream = new Uint8Array(N);
  for (let k = 0; k < N; k++) {
    const [r, g, b] = at(k);
    sky[k] = b > r + 30 && b > 110 ? 1 : 0;
    yellow[k] = r > 220 && g > 190 && b < 130 ? 1 : 0;
    red[k] = r > 170 && g < 100 && b < 100 ? 1 : 0;
    green[k] = r < 75 && g < 115 && b < 85 && g >= r ? 1 : 0;
    warm[k] = !sky[k] && !yellow[k] && !red[k] && !green[k] && r > 120 && r >= b + 8 && r >= g - 4 ? 1 : 0;
    cream[k] = warm[k] && r > 205 && g > 185 && b > 135 ? 1 : 0;
  }

  const components = (mask) => {
    const id = new Int32Array(N).fill(-1),
      comps = [];
    for (let s = 0; s < N; s++) {
      if (!mask[s] || id[s] >= 0) continue;
      const c = { n: 0, x0: 1e9, y0: 1e9, x1: -1, y1: -1, cells: [] };
      const stack = [s];
      id[s] = comps.length;
      while (stack.length) {
        const k = stack.pop(),
          x = k % w,
          y = (k / w) | 0;
        c.n++;
        c.cells.push(k);
        c.x0 = Math.min(c.x0, x);
        c.x1 = Math.max(c.x1, x);
        c.y0 = Math.min(c.y0, y);
        c.y1 = Math.max(c.y1, y);
        for (const [dx, dy] of [
          [1, 0],
          [-1, 0],
          [0, 1],
          [0, -1],
        ]) {
          const nx = x + dx,
            ny = y + dy;
          if (nx < 0 || ny < 0 || nx >= w || ny >= h) continue;
          const q = ny * w + nx;
          if (mask[q] && id[q] < 0) {
            id[q] = comps.length;
            stack.push(q);
          }
        }
      }
      comps.push(c);
    }
    return comps;
  };
  const maskOf = (cells) => {
    const m = new Uint8Array(N);
    for (const k of cells) m[k] = 1;
    return m;
  };
  /** Two passes of a box blur of radius r each way, as floats: a pixel's share of its neighbourhood that is in the mask. */
  const blur = (m, r) => {
    let a = Float32Array.from(m);
    for (let pass = 0; pass < 2; pass++)
      for (const horizontal of [true, false]) {
        const b = new Float32Array(N);
        for (let y = 0; y < h; y++)
          for (let x = 0; x < w; x++) {
            let s = 0,
              c = 0;
            for (let d = -r; d <= r; d++) {
              const xx = horizontal ? x + d : x,
                yy = horizontal ? y : y + d;
              if (xx < 0 || yy < 0 || xx >= w || yy >= h) continue;
              s += a[yy * w + xx];
              c++;
            }
            b[y * w + x] = s / c;
          }
        a = b;
      }
    return a;
  };
  // ---- contours: marching squares at a level on a float field, closed loops of [x, y] with pixel centres at integers
  const contours = (f, level = 0.5) => {
    const pos = new Map(),
      adj = new Map();
    const v = (i, j) => f[j * w + i] - level;
    const cross = (key, a, b, ax, ay, bx, by) => {
      if (!pos.has(key)) {
        const t = a / (a - b);
        pos.set(key, [ax + (bx - ax) * t, ay + (by - ay) * t]);
      }
      return key;
    };
    const link = (a, b) => {
      (adj.get(a) ?? adj.set(a, []).get(a)).push(b);
      (adj.get(b) ?? adj.set(b, []).get(b)).push(a);
    };
    for (let j = 0; j + 1 < h; j++)
      for (let i = 0; i + 1 < w; i++) {
        const a = v(i, j),
          b = v(i + 1, j),
          c = v(i + 1, j + 1),
          e = v(i, j + 1);
        const keys = [];
        if (a < 0 !== b < 0) keys.push(cross(2 * (j * w + i), a, b, i, j, i + 1, j));
        if (b < 0 !== c < 0) keys.push(cross(2 * (j * w + i + 1) + 1, b, c, i + 1, j, i + 1, j + 1));
        if (e < 0 !== c < 0) keys.push(cross(2 * ((j + 1) * w + i), e, c, i, j + 1, i + 1, j + 1));
        if (a < 0 !== e < 0) keys.push(cross(2 * (j * w + i) + 1, a, e, i, j, i, j + 1));
        if (keys.length === 2) link(keys[0], keys[1]);
        else if (keys.length === 4) {
          const [kb, kr, kt, kl] = keys;
          if ((a + b + c + e) / 4 < 0 === a < 0) {
            link(kb, kr);
            link(kt, kl);
          } else {
            link(kb, kl);
            link(kt, kr);
          }
        }
      }
    const seen = new Set(),
      loops = [];
    for (const s of adj.keys()) {
      if (seen.has(s)) continue;
      const loop = [];
      let prev = -1,
        cur = s;
      for (;;) {
        seen.add(cur);
        loop.push(pos.get(cur));
        const next = adj.get(cur).find((k) => k !== prev && (!seen.has(k) || (k === s && loop.length > 2)));
        if (next === undefined || next === s) break;
        prev = cur;
        cur = next;
      }
      if (loop.length > 10) loops.push(loop);
    }
    return loops;
  };
  const area = (l) => {
    let s = 0;
    for (let i = 0; i < l.length; i++) {
      const a = l[i],
        b = l[(i + 1) % l.length];
      s += a[0] * b[1] - b[0] * a[1];
    }
    return s / 2;
  };
  /** Douglas-Peucker on a closed loop, split at the point farthest from its first. */
  const simplify = (pts, eps) => {
    let b = 0,
      best = -1;
    for (let i = 1; i < pts.length; i++) {
      const d = Math.hypot(pts[i][0] - pts[0][0], pts[i][1] - pts[0][1]);
      if (d > best) {
        best = d;
        b = i;
      }
    }
    const run = (p, q) => {
      const out = [pts[p]];
      const rec = (i, j) => {
        let md = 0,
          mi = -1;
        const [ax, ay] = pts[i % pts.length],
          [bx, by] = pts[j % pts.length];
        const L = Math.hypot(bx - ax, by - ay) || 1;
        for (let k = i + 1; k < j; k++) {
          const [x, y] = pts[k % pts.length];
          const d = Math.abs((bx - ax) * (ay - y) - (ax - x) * (by - ay)) / L;
          if (d > md) {
            md = d;
            mi = k;
          }
        }
        if (md > eps) {
          rec(i, mi);
          out.push(pts[mi % pts.length]);
          rec(mi, j);
        }
      };
      rec(p, q);
      out.push(pts[q % pts.length]);
      return out;
    };
    return [...run(0, b), ...run(b, pts.length).slice(1, -1)];
  };
  /** One Chaikin pass; corners sharper than `corner` radians stay put, so flat cuts stay crisp. */
  const round = (l, corner) => {
    const n = l.length,
      out = [];
    for (let i = 0; i < n; i++) {
      const p = l[(i + n - 1) % n],
        q = l[i],
        r = l[(i + 1) % n];
      const a1 = Math.atan2(q[1] - p[1], q[0] - p[0]),
        a2 = Math.atan2(r[1] - q[1], r[0] - q[0]);
      let da = Math.abs(a2 - a1);
      if (da > Math.PI) da = 2 * Math.PI - da;
      const L1 = Math.hypot(q[0] - p[0], q[1] - p[1]),
        L2 = Math.hypot(r[0] - q[0], r[1] - q[1]);
      if (da > corner || L1 < 3 || L2 < 3) {
        out.push(q);
        continue;
      }
      out.push(
        [q[0] * 0.75 + p[0] * 0.25, q[1] * 0.75 + p[1] * 0.25],
        [q[0] * 0.75 + r[0] * 0.25, q[1] * 0.75 + r[1] * 0.25],
      );
    }
    return out;
  };
  const tenth = (v) => Math.round(v * 10) / 10;
  const flat = (l) => l.flatMap(([x, y]) => [tenth(x), tenth(y)]);
  const inside = (p, l) => {
    let c = false;
    for (let i = 0, j = l.length - 1; i < l.length; j = i++)
      if (
        l[i][1] > p[1] !== l[j][1] > p[1] &&
        p[0] < ((l[j][0] - l[i][0]) * (p[1] - l[i][1])) / (l[j][1] - l[i][1]) + l[i][0]
      )
        c = !c;
    return c;
  };
  /** A mask's shapes: each outer loop with the holes inside it, simplified and rounded, as flat [x, y, ...] lists. */
  const shapesOf = (mask, { blurR = 1, eps = 0.5, minArea = 30 } = {}) => {
    const loops = contours(blur(mask, blurR))
      .map((l) => ({ l, a: area(l) }))
      .filter((o) => Math.abs(o.a) > minArea);
    const depth = loops.map((o, i) => loops.filter((p, j) => j !== i && inside(o.l[0], p.l)).length);
    const finish = (l) => flat(round(simplify(l, eps), 0.9));
    const outs = loops.filter((o, i) => depth[i] % 2 === 0).map((o) => ({ outer: finish(o.l), holes: [], src: o.l }));
    loops.forEach((o, i) => {
      if (depth[i] % 2 === 1) {
        const t = outs.find((s) => inside(o.l[0], s.src));
        if (t) t.holes.push(finish(o.l));
      }
    });
    return outs.map(({ outer, holes }) => ({ outer, holes }));
  };

  // ---- colours down a letter's height: read in rows, smoothed so that a few levels of noise are not a visible step,
  // and cut to the number of bands the model draws
  const columnOf = (cells, mask, y0, y1, n) => {
    const out = [];
    for (let k = 0; k < n; k++) {
      const lo = y0 + ((y1 - y0 + 1) * k) / n,
        hi = y0 + ((y1 - y0 + 1) * (k + 1)) / n;
      const seen = cells.filter((c) => mask[c] && Math.floor(c / w) >= lo && Math.floor(c / w) < hi).map(at);
      out.push(seen.length ? rgbMedian(seen) : null);
    }
    for (let k = 0; k < n; k++) out[k] ??= out[k ? k - 1 : n - 1] ?? [250, 240, 215];
    return out;
  };
  const smooth = (c, passes = 3) => {
    let a = c.map((v) => v.slice());
    for (let p = 0; p < passes; p++)
      a = a.map((v, i) =>
        v.map((x, k) => (i === 0 || i === a.length - 1 ? x : (a[i - 1][k] + 2 * x + a[i + 1][k]) / 4)),
      );
    return a;
  };
  const resample = (c, n) =>
    Array.from({ length: n }, (_, i) => {
      const t = ((i + 0.5) / n) * c.length - 0.5,
        a = Math.max(0, Math.min(c.length - 1, Math.floor(t))),
        b = Math.min(c.length - 1, a + 1),
        f = Math.max(0, Math.min(1, t - a));
      return c[a].map((x, k) => x + (c[b][k] - x) * f);
    });
  const whole = (c) => c.map((v) => v.map(Math.round));

  // ---- the letters, the pole and the flag's cloth: the warm pieces
  const warmC = components(warm)
    .filter((c) => c.n > 150)
    .sort((a, b) => a.x0 - b.x0);
  const inBall = (k) => Math.hypot((k % w) - BALL.cx, Math.floor(k / w) - BALL.cy) < BALL.r;
  /** The pixels of each thing the outline is split between. */
  const sources = {};
  const bodyOf = (c, cells) => {
    const m = maskOf(cells);
    const creamHere = new Uint8Array(N);
    for (const k of cells) if (cream[k]) creamHere[k] = 1;
    // the tan is what is not cream, read well inside the piece so that the blurred edge to the green is not in it
    const tanCells = cells.filter((k) => {
      if (cream[k]) return false;
      const x = k % w,
        y = Math.floor(k / w);
      return x > 0 && y > 0 && x < w - 1 && y < h - 1 && m[k - 1] && m[k + 1] && m[k - w] && m[k + w];
    });
    return {
      box: [c.x0, c.y0, c.x1, c.y1],
      face: shapesOf(creamHere, { blurR: 1 }),
      tan: shapesOf(m, { blurR: 1 }),
      bands: whole(resample(smooth(columnOf(cells, creamHere, c.y0, c.y1, BANDS + 2)), BANDS)),
      tanRgb: tanCells.length ? rgbMedian(tanCells.map(at)) : [186, 176, 144],
    };
  };
  const data = {
    w,
    h,
    x0: X0,
    y0: Y0,
    letters: [],
    pole: null,
    flag: null,
    ball: null,
    sparkles: [],
    sparkRgb: null,
    rim: null,
  };
  let flagBit = null;
  for (const c of warmC) {
    const isO = c.x0 === 180 && c.n > 16000;
    const cells = isO ? c.cells.filter((k) => !inBall(k)) : c.cells;
    if (c.n === 3021) {
      data.pole = {
        ...bodyOf(c, cells),
        knob: {
          ...KNOB,
          rgb: rgbMedian(
            cells.filter((k) => Math.hypot((k % w) - KNOB.x, Math.floor(k / w) - KNOB.y) < KNOB.r * 0.7).map(at),
          ),
        },
      };
      sources.pole = cells;
    } else if (c.n === 296) {
      flagBit = bodyOf(c, cells);
      (sources.flag ??= []).push(...cells);
    } else if (NAMES[c.x0] !== undefined) {
      const name = NAMES[c.x0];
      data.letters.push({ name, ...bodyOf(c, cells) });
      sources[name] = cells;
    }
  }
  if (data.letters.length !== 10 || !data.pole || !flagBit)
    throw new Error(`the picture is not the one this was written for: ${data.letters.length} letters found`);

  // ---- the ball: its disc, and the ramp of colour on it by how much of the light each part of it takes
  {
    const L = BALL_LIGHT,
      ll = Math.hypot(...L);
    const lo = -0.5,
      step = 0.125,
      bins = Array.from({ length: 12 }, () => []);
    for (let y = BALL.cy - BALL.r; y <= BALL.cy + BALL.r; y++)
      for (let x = BALL.cx - BALL.r; x <= BALL.cx + BALL.r; x++) {
        const dx = (x - BALL.cx) / BALL.r,
          dy = -(y - BALL.cy) / BALL.r,
          rho = dx * dx + dy * dy;
        if (rho > 0.9) continue;
        const lit = (dx * L[0] + dy * L[1] + Math.sqrt(1 - rho) * L[2]) / ll;
        bins[Math.min(11, Math.max(0, Math.floor((lit - lo) / step)))].push(px(x, y));
      }
    // a bin no part of the ball falls in takes its neighbour's colour
    const col = bins.map((b) => (b.length ? rgbMedian(b) : null));
    for (let k = 0; k < col.length; k++) col[k] ??= col[k - 1] ?? col.find(Boolean);
    data.ball = {
      ...BALL,
      light: BALL_LIGHT,
      ramp: whole(smooth(col, 2)).map((rgb, k) => ({ from: Math.round((lo + k * step) * 1000) / 1000, rgb })),
    };
  }
  sources.ball = [];
  for (let k = 0; k < N; k++) if (inBall(k)) sources.ball.push(k);

  // ---- the flag: its cloth in two reds either side of the fold, and the little tan piece where it meets the pole
  const redC = components(red).filter((c) => c.n > 300);
  {
    const side = (k) => {
      const [[ax, ay], [bx, by]] = FOLD;
      return (bx - ax) * (Math.floor(k / w) - ay) - (by - ay) * ((k % w) - ax) > 0;
    };
    const cells = redC.flatMap((c) => c.cells);
    const [a, b] = [cells.filter((k) => side(k)), cells.filter((k) => !side(k))];
    // the lighter half has the more green in it; the fold is written with the light cloth on its positive side, which is how the model finds it
    const lightIsA = rgbMedian(a.map(at))[1] > rgbMedian(b.map(at))[1];
    const [light, dark] = lightIsA ? [a, b] : [b, a];
    data.flag = {
      shapes: redC.flatMap((c) => shapesOf(maskOf(c.cells), { blurR: 1, minArea: 50 })),
      bit: flagBit.tan,
      bitRgb: flagBit.tanRgb,
      box: [
        Math.min(...redC.map((c) => c.x0)),
        Math.min(...redC.map((c) => c.y0)),
        Math.max(...redC.map((c) => c.x1)),
        Math.max(...redC.map((c) => c.y1)),
      ],
      fold: lightIsA ? FOLD : [FOLD[1], FOLD[0]],
      dark: rgbMedian(dark.map(at)),
      light: rgbMedian(light.map(at)),
    };
    (sources.flag ??= []).push(...cells);
  }

  // ---- the sparkles
  const yellowC = components(yellow).filter((c) => c.n > 120);
  data.sparkles = yellowC.map((c) => ({
    box: [c.x0, c.y0, c.x1, c.y1],
    shapes: shapesOf(maskOf(c.cells), { blurR: 1, minArea: 40 }),
  }));
  data.sparkRgb = rgbMedian(yellowC[0].cells.map(at));

  // ---- the outline: everything inked in the biggest piece, which the letters, the ball and the flag stand on
  const inked = new Uint8Array(N);
  for (let k = 0; k < N; k++) inked[k] = green[k] || warm[k] || red[k] || inBall(k) ? 1 : 0;
  const big = components(inked).sort((a, b) => b.n - a.n)[0];
  const inkedBig = maskOf(big.cells);
  const rimOpts = { blurR: 2, eps: 0.6, minArea: 200 };
  const pieceOpts = { ...rimOpts, blurR: 1 };

  // Steps from the sources through the cells `allowed`, by the four neighbours.
  const steps = (sources, allowed) => {
    const d = new Int32Array(N).fill(-1);
    const queue = [];
    for (const k of sources) {
      d[k] = 0;
      queue.push(k);
    }
    for (let i = 0; i < queue.length; i++) {
      const k = queue[i],
        x = k % w,
        y = Math.floor(k / w);
      for (const [dx, dy] of [
        [1, 0],
        [-1, 0],
        [0, 1],
        [0, -1],
      ]) {
        const nx = x + dx,
          ny = y + dy;
        if (nx < 0 || ny < 0 || nx >= w || ny >= h) continue;
        const q = ny * w + nx;
        if (d[q] < 0 && allowed(q)) {
          d[q] = d[k] + 1;
          queue.push(q);
        }
      }
    }
    return d;
  };
  // The open air round the word is what is reached from the crop's corner without crossing it: a speck inside the word that is
  // neither green nor cream (a white glint on a bevel) is not air, and the outline is the whole of what is not.
  const air = steps([0], (q) => !inkedBig[q]);
  const region = new Uint8Array(N);
  for (let k = 0; k < N; k++) region[k] = air[k] < 0 ? 1 : 0;
  // how far each pixel of the outline is in from the air, which is where its lighter edge is read and cut
  const depth = steps(
    Array.from({ length: N }, (_, k) => k).filter((k) => air[k] >= 0),
    (q) => air[q] < 0,
  );
  const greens = (lo, hi) => big.cells.filter((k) => green[k] && depth[k] >= lo && depth[k] <= hi).map(at);
  // a high percentile of each channel, since the outline's shade is darker toward the letters and it is the open green that shows, and its
  // edge is lit unevenly round the word (bright along the underside, dark at the top), so it is read nearer the top of what there is
  const upper = (list, share) =>
    [0, 1, 2].map((c) => list.map((v) => v[c]).sort((x, y) => x - y)[Math.floor(list.length * share)]);

  // Sweeps the place of the nearest source across a grid, forward and back, until nothing changes: `near[k]` is the cell nearest to
  // cell k that was a source, or -1 where there is none.
  const spread = (near, gw, gh) => {
    const d2 = (k, s) => ((k % gw) - (s % gw)) ** 2 + (Math.floor(k / gw) - Math.floor(s / gw)) ** 2;
    const forwards = [
      [-1, 0],
      [-1, -1],
      [0, -1],
      [1, -1],
    ];
    const backwards = [
      [1, 0],
      [1, 1],
      [0, 1],
      [-1, 1],
    ];
    for (let pass = 0; pass < 20; pass++) {
      let changed = false;
      for (const forward of [true, false])
        for (let j = 0; j < gh; j++)
          for (let i = 0; i < gw; i++) {
            const [x, y] = [forward ? i : gw - 1 - i, forward ? j : gh - 1 - j];
            const k = y * gw + x;
            for (const [dx, dy] of forward ? forwards : backwards) {
              const [nx, ny] = [x + dx, y + dy];
              if (nx < 0 || ny < 0 || nx >= gw || ny >= gh) continue;
              const s = near[ny * gw + nx];
              if (s >= 0 && (near[k] < 0 || d2(k, s) < d2(k, near[k]))) {
                near[k] = s;
                changed = true;
              }
            }
          }
      if (!changed) break;
    }
    return d2;
  };

  // which of them each pixel of the outline is nearest to
  const names = Object.keys(sources);
  const owner = new Int16Array(N).fill(-1);
  names.forEach((name, i) => {
    for (const k of sources[name]) owner[k] = i;
  });
  const near = new Int32Array(N).fill(-1);
  for (let k = 0; k < N; k++) if (owner[k] >= 0) near[k] = k;
  spread(near, w, h);

  /** The pixels within `g` pixels of a cell, found over a box round it. */
  const grownBy = (cell, g) => {
    let [x0, y0, x1, y1] = [w, h, -1, -1];
    for (let k = 0; k < N; k++)
      if (cell[k]) {
        const [x, y] = [k % w, Math.floor(k / w)];
        [x0, y0, x1, y1] = [Math.min(x0, x), Math.min(y0, y), Math.max(x1, x), Math.max(y1, y)];
      }
    [x0, y0, x1, y1] = [
      Math.max(0, x0 - Math.ceil(g)),
      Math.max(0, y0 - Math.ceil(g)),
      Math.min(w - 1, x1 + Math.ceil(g)),
      Math.min(h - 1, y1 + Math.ceil(g)),
    ];
    const [bw, bh] = [x1 - x0 + 1, y1 - y0 + 1];
    const nearest = new Int32Array(bw * bh).fill(-1);
    for (let j = 0; j < bh; j++)
      for (let i = 0; i < bw; i++) if (cell[(j + y0) * w + i + x0]) nearest[j * bw + i] = j * bw + i;
    const d2 = spread(nearest, bw, bh);
    const grown = new Uint8Array(N);
    for (let j = 0; j < bh; j++)
      for (let i = 0; i < bw; i++) {
        const k = j * bw + i;
        if (nearest[k] >= 0 && d2(k, nearest[k]) <= g * g) grown[(j + y0) * w + i + x0] = 1;
      }
    return grown;
  };

  const pieces = names.map((name, i) => {
    const cell = new Uint8Array(N);
    for (let k = 0; k < N; k++) cell[k] = region[k] && owner[near[k]] === i ? 1 : 0;
    // grown under its neighbours, but never past the outline's own edge
    const under = grownBy(cell, grow);
    const slab = new Uint8Array(N),
      inner = new Uint8Array(N);
    for (let k = 0; k < N; k++) {
      slab[k] = region[k] && (cell[k] || under[k]) ? 1 : 0;
      inner[k] = slab[k] && depth[k] > EDGE ? 1 : 0;
    }
    // blurred a little less than the whole, so that a notch of sky between two letters keeps its tip no more nor less than the whole's has
    return { name, slab: shapesOf(slab, pieceOpts), inner: shapesOf(inner, pieceOpts) };
  });
  data.rim = {
    whole: shapesOf(region, rimOpts),
    pieces,
    rgb: upper(greens(EDGE + 1, 40), 0.7),
    edgeRgb: upper(greens(2, EDGE), 0.9),
    grow,
    edge: EDGE,
  };
  return data;
}

const here = path.dirname(fileURLToPath(import.meta.url));
export const SOURCE = path.join(here, '..', 'src', 'title_sq.png');
export const OUTPUT = path.join(here, '..', 'src', 'titletrace.json');

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const start = performance.now();
  const text = JSON.stringify(traceTitle(fs.readFileSync(SOURCE)));
  fs.writeFileSync(OUTPUT, text);
  console.error(
    `traced ${path.relative(process.cwd(), SOURCE)} in ${Math.round(performance.now() - start)} ms, ${text.length} bytes`,
  );
}
