/**
 * What the game costs a player, held to a budget and to what it cost
 * before: how long it takes to boot, what a frame costs to draw at the
 * standard view, how much is downloaded, and what the biggest holes there are
 * (a large test hole of minigolf, and the biggest golf hole of any course) cost to begin and to draw. The budget is what a good
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
import { layoutOf } from '../src/arena';
import { COURSES } from '../src/course';
import { bigHole, smallHole } from './bighole';
import { BUDGET } from './budget';
import { start, watch } from './game';

export { BUDGET };

/**
 * The biggest golf hole of any course by tiles of map, and the smallest of its own course to begin it in turn with, found
 * from the layouts and not by name, so a longer hole on any course is the one held to the budget and a course added is
 * reached without this file being told.
 */
function biggestGolfHole(): { course: string; big: number; small: number; tiles: number; name: string } {
  let best = { course: '', big: 0, small: 0, tiles: 0, name: '' };
  for (const c of COURSES) {
    if (!c.golf) continue;
    const tiles = c.holes.map((h) => {
      const l = layoutOf(h.map, h.terrain);
      return l.cols * l.rows;
    });
    const big = tiles.indexOf(Math.max(...tiles));
    if (tiles[big] > best.tiles)
      best = {
        course: c.name,
        big,
        small: tiles.indexOf(Math.min(...tiles)),
        tiles: tiles[big],
        name: c.holes[big].name,
      };
  }
  return best;
}

const BASELINE = 'smoke/perf-baseline.json';
/** How far a figure may move from the baseline before it is a change: a share, and a slack for the noisy ones. */
// the frame, timed ten at a time after the GPU is warmed, wobbles about 5% between runs (0.83 to 0.91 ms over ten):
// three times that, and a tenth of a millisecond for a frame so small
const TOLERANCE = {
  bootMs: [0.35, 250],
  frameMs: [0.15, 0.1],
  bundleKb: [0.1, 2],
  // begun: 38 to 49 ms over nine runs of the biggest hole, and a frame of it 3.07 to 3.77 ms: the tolerance is wider than
  // that spread, and narrower than a hole costing twice as much to begin or half as much again to draw
  beginMs: [0.5, 30],
  bigFrameMs: [0.25, 0.3],
  // the same for the biggest golf hole of any course (the figures keep their old names so the baseline's keys are the same), which is golf's: a hole of 24,000 tiles of map, hills, trees and water
  linksBeginMs: [0.5, 40],
  linksFrameMs: [0.25, 0.4],
} as const;

interface Figures {
  bootMs: number;
  frameMs: number;
  bundleKb: number;
  /** The biggest hole that is not golf (`BIG`) begun: the middle of nine begins, alternating with the smallest. */
  beginMs: number;
  /** A frame of that hole at the worst of three views: from its tee, and from outside its rail's corner at two zooms. */
  bigFrameMs: number;
  /** The same for the biggest hole of The Links, begun in turn with its smallest, and a frame of it at the worst of four views. */
  linksBeginMs: number;
  linksFrameMs: number;
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
  // the standard view: the whole course, seen from the far end of the zoom, the most of it there is to draw
  const frame = await page.evaluate(async () => {
    const g = window.game!;
    g.step(180);
    g.look(0, 0, 110);
    g.step(1);
    // a GPU idle while the page booted runs slow for a while: warmed first, or the figure is two figures
    return g.measureFrame(300);
  });
  // the biggest hole that is not golf (`BIG`, in `bighole.ts`, a test hole of the test's own), many times the size of
  // any on a course: what it costs to begin, and to draw. A hole is
  // begun and its readback awaited with nothing stepped between, since a frame stepped and not yet drawn is queued, and the
  // begin after it would wait on that as well; the biggest is begun in turn with the smallest, so each begin is a new hole
  const holes = [smallHole(), bigHole()];
  const big = await page.evaluate(async (holes) => {
    const g = window.game!;
    g.playCourse(holes.map((h) => ({ ...h, terrain: Float32Array.from(h.terrain) }) as never));
    g.step(2);
    await g.grass();
    const begins: number[] = [];
    for (let k = 0; k < 11; k++) {
      const t = performance.now();
      g.startHole(k % 2 ? 0 : 1);
      await g.grass();
      if (k % 2 === 0) begins.push(performance.now() - t);
    }
    begins.sort((a, b) => a - b);
    // a frame of the biggest, at the views that draw the most of it: the tee, and the rough from outside its corner
    g.startHole(1);
    g.step(120);
    const { floor } = g.content();
    const frames: number[] = [];
    for (const [x, y, distance] of [
      [g.ball().x, g.ball().y, 62],
      [floor.minX - 12, floor.minY - 12, 62],
      [floor.minX - 12, floor.minY - 12, 110],
    ]) {
      g.look(x, y, distance);
      g.step(2);
      frames.push(await g.measureFrame(120));
    }
    return { begin: begins[Math.floor(begins.length / 2)], frame: Math.max(...frames) };
  }, holes);
  // and the same of the biggest golf hole of any course (Home Waters, the par six of The Isles, at the time of writing):
  // golf's holes are of a different sort, tens of thousands of tiles of map with hills, lakes, trees and out of bounds on
  // them, and what they cost is held on their own
  const golf = biggestGolfHole();
  console.log(`perf: the biggest golf hole is ${golf.name} of ${golf.course}, ${golf.tiles} tiles`);
  const links = await page.evaluate(async (golf) => {
    const g = window.game!;
    g.chooseCourse(golf.course);
    g.step(2);
    await g.grass();
    const begins: number[] = [];
    for (let k = 0; k < 11; k++) {
      const t = performance.now();
      g.startHole(k % 2 ? golf.small : golf.big);
      await g.grass();
      if (k % 2 === 0) begins.push(performance.now() - t);
    }
    begins.sort((a, b) => a - b);
    g.startHole(golf.big);
    g.step(120);
    const { floor, tee, cup } = g.content();
    const frames: number[] = [];
    for (const [x, y, distance] of [
      [g.ball().x, g.ball().y, 62],
      [(tee.x + cup.x) / 2, (tee.y + cup.y) / 2, 110],
      [floor.minX - 12, floor.minY - 12, 62],
      [floor.maxX + 12, floor.maxY + 12, 110],
    ]) {
      g.look(x, y, distance);
      g.step(2);
      frames.push(await g.measureFrame(120));
    }
    return { begin: begins[Math.floor(begins.length / 2)], frame: Math.max(...frames) };
  }, golf);
  const now: Figures = {
    bootMs: Math.round(boot),
    frameMs: Math.round(frame * 100) / 100,
    bundleKb: bundle,
    beginMs: Math.round(big.begin),
    bigFrameMs: Math.round(big.frame * 100) / 100,
    linksBeginMs: Math.round(links.begin),
    linksFrameMs: Math.round(links.frame * 100) / 100,
  };
  info.annotations.push({ type: 'perf', description: JSON.stringify(now) });
  console.log(
    `perf: boot ${now.bootMs} ms, frame ${now.frameMs} ms, download ${now.bundleKb} kB, begin the biggest hole ${now.beginMs} ms, its frame ${now.bigFrameMs} ms; of ${golf.name}, begin ${now.linksBeginMs} ms, frame ${now.linksFrameMs} ms`,
  );

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
    for (const key of [
      'bootMs',
      'frameMs',
      'bundleKb',
      'beginMs',
      'bigFrameMs',
      'linksBeginMs',
      'linksFrameMs',
    ] as const) {
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
  expect(now.beginMs, 'the biggest hole begun within budget').toBeLessThanOrEqual(BUDGET.beginMs);
  expect(now.bigFrameMs, 'a frame of the biggest hole within budget').toBeLessThanOrEqual(BUDGET.bigFrameMs);
  expect(now.linksBeginMs, 'the biggest golf hole of any course begun within budget').toBeLessThanOrEqual(
    BUDGET.linksBeginMs,
  );
  expect(now.linksFrameMs, 'a frame of it within budget').toBeLessThanOrEqual(BUDGET.linksFrameMs);
  expect(problems).toEqual([]);
});
