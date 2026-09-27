/**
 * What the game costs a player, held to a budget and to what it cost
 * before: how long it takes to boot, what a frame costs to draw at the
 * standard view, and how much is downloaded. The budget is what a good
 * browser game may cost at all; the baseline is what this one cost at the
 * last commit, so a step toward the budget is noticed as much as a step
 * over it.
 *
 *   npm run perf               the figures, held to smoke/perf-baseline.json and the budget
 *   npm run perf:update        the baseline written again, after a change meant to move it
 *
 * The boot and the frame are this machine's, headless on its own GPU, and
 * both wobble from run to run; the tolerances were set by running it several
 * times first, and the frame is the lower quartile of many. The download is
 * the built bundle, gzipped, and does not wobble at all.
 */
import { execFileSync } from 'node:child_process';
import { readFileSync, readdirSync, statSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { gzipSync } from 'node:zlib';
import { expect, test } from '@playwright/test';
import { start, watch } from './game';

const BASELINE = 'smoke/perf-baseline.json';
/** What the game may cost at all, on this machine, whatever it cost before. */
export const BUDGET = { bootMs: 3000, frameMs: 8, bundleKb: 400 };
/** How far a figure may move from the baseline before it is a change: a share, and a slack for the noisy ones. */
const TOLERANCE = { bootMs: [0.35, 250], frameMs: [0.3, 0.6], bundleKb: [0.1, 2] } as const;

interface Figures {
  bootMs: number;
  frameMs: number;
  bundleKb: number;
}

/** The built game's download: every script and stylesheet in dist/, gzipped, in kilobytes. */
function bundleKb(): number {
  execFileSync('npx', ['vite', 'build', '--logLevel', 'silent'], { stdio: 'ignore' });
  const dir = 'dist/assets';
  let bytes = 0;
  for (const f of readdirSync(dir)) {
    if (!/\.(js|css)$/.test(f)) continue;
    if (!statSync(join(dir, f)).isFile()) continue;
    bytes += gzipSync(readFileSync(join(dir, f))).length;
  }
  return Math.round(bytes / 102.4) / 10;
}

test('boots, draws and downloads within budget, and as it did before', async ({ page }, info) => {
  test.setTimeout(180_000);
  const problems = watch(page);
  const bundle = bundleKb();
  await start(page, { seed: 11, paused: true });
  const boot = await page.evaluate(() => window.game!.bootMs);
  // the standard view: the arena settled, seen from the look picture's camera
  const frame = await page.evaluate(async () => {
    const g = window.game!;
    g.step(180);
    g.look(0, 0, { azimuth: 0.9, polar: 0.95, radius: 90 });
    g.step(1);
    return g.measureFrame();
  });
  const now: Figures = { bootMs: Math.round(boot), frameMs: Math.round(frame * 100) / 100, bundleKb: bundle };
  info.annotations.push({ type: 'perf', description: JSON.stringify(now) });
  console.log(`perf: boot ${now.bootMs} ms, frame ${now.frameMs} ms, download ${now.bundleKb} kB`);

  if (process.env.PERF_UPDATE) {
    writeFileSync(BASELINE, `${JSON.stringify(now, null, 2)}\n`);
    console.log('perf baseline written');
  } else {
    let baseline: Partial<Figures> = {};
    try {
      baseline = JSON.parse(readFileSync(BASELINE, 'utf8')) as Partial<Figures>;
    } catch {
      throw new Error('no baseline: run npm run perf:update first');
    }
    const moved: string[] = [];
    for (const key of ['bootMs', 'frameMs', 'bundleKb'] as const) {
      const was = baseline[key];
      if (was === undefined) {
        moved.push(`${key} ${now[key]} (not in the baseline)`);
        continue;
      }
      const [share, slack] = TOLERANCE[key];
      const out = Math.abs(now[key] - was) > Math.max(Math.abs(was) * share, slack);
      console.log(`  ${key}: ${was} -> ${now[key]} (${out ? 'MOVED' : 'within tolerance'})`);
      if (out) moved.push(`${key} ${was} -> ${now[key]}`);
    }
    expect(moved, 'moved from the baseline: if that was meant, npm run perf:update, and say why').toEqual([]);
  }
  expect(now.bootMs, 'boot within budget').toBeLessThanOrEqual(BUDGET.bootMs);
  expect(now.frameMs, 'frame within budget').toBeLessThanOrEqual(BUDGET.frameMs);
  expect(now.bundleKb, 'download within budget').toBeLessThanOrEqual(BUDGET.bundleKb);
  expect(problems).toEqual([]);
});
