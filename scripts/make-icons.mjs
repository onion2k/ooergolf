/**
 * The app's icons, cut from the title picture: the ball on its tee over the lawn, which is the one thing in it that reads
 * at the size of a home-screen icon. Run by hand when the picture or the crop changes (`node scripts/make-icons.mjs`); it
 * writes the PNGs in `public/icons/`, which are committed and never edited, and `test/manifest.test.ts` holds their
 * sizes and bytes. Without it the icons would be art that drifts from the picture, or a picture nobody can make again.
 *
 * The maskable icon is cut wider, so the ball sits inside the inner four fifths an Android launcher may show of it (the
 * safe zone), with the lawn filling the rest; the plain icons are cut closer, so the ball fills the square on a desk.
 */
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { PNG } from 'pngjs';

/** The picture the icons are cut from, and the middle of the ball's disc on it, found by its white pixels. */
const SOURCE = 'src/title_sq.png';
const BALL = { x: 421, y: 1024 };

/**
 * How many levels a channel is kept at: 32 (five bits), which halves the bytes of the 512s (263 to 112 kB, the grass's
 * fine noise being most of a PNG's cost) and shows no banding on the ball or the lawn when looked at.
 */
export const LEVELS = 32;

/** Each icon: its file, its size, and how far the crop reaches either side of the ball, in picture pixels. */
export const ICONS = [
  { file: 'icon-192.png', size: 192, half: 230 },
  { file: 'icon-512.png', size: 512, half: 230 },
  { file: 'icon-512-maskable.png', size: 512, half: 300, y: 954 },
  { file: 'apple-touch-icon.png', size: 180, half: 230 },
];

/** A channel's value at the nearest of `LEVELS` levels, so the PNG's filter finds runs to pack. */
const level = (v) => Math.min(255, Math.round(v / (256 / LEVELS)) * (256 / LEVELS));

/**
 * A square of the picture `half` either side of (x, y), resampled to `size` a side by averaging the source pixels each
 * target pixel covers (a box filter: plain, and with no ringing on the ball's edge). The crop is clamped to the picture.
 */
function cut(png, x, y, half, size) {
  const x0 = Math.max(0, Math.min(png.width - 2 * half, x - half));
  const y0 = Math.max(0, Math.min(png.height - 2 * half, y - half));
  const span = 2 * half;
  const out = new PNG({ width: size, height: size });
  for (let ty = 0; ty < size; ty++) {
    const sy0 = y0 + Math.floor((ty * span) / size);
    const sy1 = y0 + Math.max(sy0 - y0 + 1, Math.floor(((ty + 1) * span) / size));
    for (let tx = 0; tx < size; tx++) {
      const sx0 = x0 + Math.floor((tx * span) / size);
      const sx1 = x0 + Math.max(sx0 - x0 + 1, Math.floor(((tx + 1) * span) / size));
      let r = 0,
        g = 0,
        b = 0,
        n = 0;
      for (let sy = sy0; sy < sy1; sy++) {
        for (let sx = sx0; sx < sx1; sx++) {
          const i = (sy * png.width + sx) * 4;
          r += png.data[i];
          g += png.data[i + 1];
          b += png.data[i + 2];
          n++;
        }
      }
      const o = (ty * size + tx) * 4;
      out.data[o] = level(r / n);
      out.data[o + 1] = level(g / n);
      out.data[o + 2] = level(b / n);
      out.data[o + 3] = 255;
    }
  }
  return out;
}

const png = PNG.sync.read(readFileSync(SOURCE));
mkdirSync('public/icons', { recursive: true });
for (const icon of ICONS) {
  const out = cut(png, BALL.x, icon.y ?? BALL.y, icon.half, icon.size);
  const bytes = PNG.sync.write(out, { colorType: 2, deflateLevel: 9 });
  writeFileSync(`public/icons/${icon.file}`, bytes);
  console.log(`${icon.file}: ${icon.size} a side, ${(bytes.length / 1024).toFixed(1)} kB`);
}
