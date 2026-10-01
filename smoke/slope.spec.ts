/**
 * The break shown on a hole of minigolf whose ground leans, in a real browser: the arrows over its floor while the ball
 * rests, the roll of the putt a drag would make, and the break in words; and a level hole, which shows none of it. The new
 * pictures are of The Hills' Side-hill, written for these scenes alone.
 */
import { expect, test, type Page } from '@playwright/test';
import { layoutOf } from '../src/arena';
import { COURSES } from '../src/course';
import { breakOf } from '../src/green';
import { puttText } from '../src/readout';
import { bigHole } from './bighole';
import { drag, start, watch } from './game';
import { CONTRAST, read } from './panels';

const TOLERANCE = { maxDiffPixelRatio: 0.002, threshold: 0.02 };
const SIDE_HILL = COURSES.find((c) => c.name === 'The Hills')!.holes.find((h) => h.name === 'Side-hill')!;
const LAYOUT = layoutOf(SIDE_HILL.map, SIDE_HILL.terrain);

async function onSideHill(page: Page) {
  await page.evaluate(() => {
    const g = window.game!;
    g.chooseCourse('The Hills');
    g.startHole(g.content().holes.findIndex((h) => h.name === 'Side-hill'));
    for (let f = 0; f < 120; f++) g.step(1);
  });
}
const hideStats = (page: Page) => page.locator('#stats').evaluate((el: HTMLElement) => (el.hidden = true));

/** Pressed on the ball and pulled back down the page, across, and held. */
async function aim(page: Page, down: number, across: number) {
  const at = await page.evaluate(() => {
    const b = window.game!.ball();
    return window.game!.project(b.x, b.y, b.z);
  });
  await drag(page, at, { x: at.x + across, y: at.y + down }, { hold: true });
  await page.evaluate(() => window.game!.step(1));
}

test.describe('the break on a sloped hole of minigolf', () => {
  test('arrows over the floor and the break in words while the ball rests, away while it rolls, back at rest; no speed of greens', async ({
    page,
  }) => {
    const problems = watch(page);
    await start(page, { seed: 5, paused: true });
    await onSideHill(page);
    const rest = await page.evaluate(() => {
      const g = window.game!;
      return { arrows: g.motions().arrows, count: g.content().arrows, view: g.view(), ball: g.ball() };
    });
    expect(rest.count, 'the slope has arrows to show').toBeGreaterThan(40);
    expect(rest.arrows).toEqual({ shown: true, count: rest.count });
    expect(rest.view.putt).toBe(puttText(breakOf(LAYOUT, rest.ball.x, rest.ball.y)));
    expect(rest.view.greens, 'minigolf has no greens speed').toBeNull();
    await expect(page.locator('#putt')).toBeVisible();
    await expect(page.locator('#greens')).toBeHidden();

    await page.evaluate(() => {
      window.game!.shoot(Math.PI / 2, 0.3);
      window.game!.step(1);
    });
    const rolling = await page.evaluate(() => ({ view: window.game!.view(), arrows: window.game!.motions().arrows }));
    expect(rolling.arrows).toEqual({ shown: false, count: 0 });
    expect(rolling.view.putt).toBeNull();
    for (let k = 0; k < 120 && !(await page.evaluate(() => window.game!.state().ready)); k++)
      await page.evaluate(() => window.game!.step(10));
    const after = await page.evaluate(() => ({ arrows: window.game!.motions().arrows, view: window.game!.view() }));
    expect(after.arrows.shown).toBe(true);
    expect(after.view.putt).not.toBeNull();
    expect(await page.evaluate(() => window.game!.invariants())).toEqual([]);
    expect(problems).toEqual([]);
  });

  test('a putt aimed has its roll drawn, which bends off the aimed line and ends in the ring where the ball rests; a frame of it is inside the budget', async ({
    page,
  }) => {
    const problems = watch(page);
    await start(page, { seed: 5, paused: true });
    await onSideHill(page);
    await aim(page, 150, -20);
    const aimed = await page.evaluate(() => ({ aim: window.game!.aiming(), shot: window.game!.motions().shot }));
    expect(aimed.aim).not.toBeNull();
    expect(aimed.shot, 'the roll is drawn').not.toBeNull();
    expect(aimed.shot!.arc).toBeGreaterThan(4);
    expect(aimed.shot!.ring).not.toBeNull();
    expect(aimed.shot!.spread, 'a putt has none').toBeNull();
    const ms = await page.evaluate(() => window.game!.measureFrame());
    console.log(`slope: a frame with the roll aimed and the arrows up, ${ms.toFixed(2)} ms`);
    expect(ms).toBeLessThan(5);
    await hideStats(page);
    await expect(page.locator('#view')).toHaveScreenshot('slope-aim.png', TOLERANCE);
    const ring = aimed.shot!.ring!;
    const ball = await page.evaluate(() => window.game!.ball());
    await page.mouse.up();
    for (let k = 0; k < 120 && !(await page.evaluate(() => window.game!.state().ready)); k++)
      await page.evaluate(() => window.game!.step(10));
    const stopped = await page.evaluate(() => ({ ball: window.game!.ball(), phase: window.game!.state().phase }));
    // either the roll said it drops, or the ball rests where the ring was
    if (stopped.phase === 'play')
      expect(Math.hypot(stopped.ball.x - ring.x, stopped.ball.y - ring.y), 'rests at the ring').toBeLessThan(0.8);
    expect(ball).toBeDefined();
    expect(problems).toEqual([]);
  });

  test('the biggest sloped hole of minigolf, with its two thousand arrows up and a putt aimed, draws a frame inside the budget', async ({
    page,
  }) => {
    const problems = watch(page);
    await start(page, { seed: 5, paused: true });
    // the biggest hole of minigolf there is, which is a test hole of its own now that The Moors are tight (`bighole.ts`)
    await page.evaluate((hole) => {
      const g = window.game!;
      g.playCourse([{ ...hole, terrain: Float32Array.from(hole.terrain) }] as never);
      for (let f = 0; f < 120; f++) g.step(1);
    }, bigHole());
    await aim(page, 100, 10);
    const seen = await page.evaluate(async () => ({
      arrows: window.game!.motions().arrows,
      shot: window.game!.motions().shot,
      ms: await window.game!.measureFrame(),
    }));
    expect(seen.arrows.count).toBeGreaterThan(1500);
    expect(seen.shot).not.toBeNull();
    console.log(`slope: The Far Pin, ${seen.arrows.count} arrows and a roll aimed, a frame ${seen.ms.toFixed(2)} ms`);
    expect(seen.ms).toBeLessThan(5);
    await page.mouse.up();
    expect(problems).toEqual([]);
  });

  test('the resting ball on the slope with its arrows, from above and behind', async ({ page }) => {
    const problems = watch(page);
    await start(page, { seed: 11, paused: true });
    await onSideHill(page);
    await hideStats(page);
    await expect(page.locator('#view')).toHaveScreenshot('slope-arrows.png', TOLERANCE);
    expect(problems).toEqual([]);
  });

  test('a level hole of The Meadow shows nothing of it: no arrows, no break line, no roll when aimed', async ({
    page,
  }) => {
    const problems = watch(page);
    await start(page, { seed: 5, paused: true });
    await page.evaluate(() => {
      for (let f = 0; f < 60; f++) window.game!.step(1);
    });
    await aim(page, 120, 0);
    const seen = await page.evaluate(() => {
      const g = window.game!;
      return { arrows: g.motions().arrows, view: g.view(), shot: g.motions().shot, count: g.content().arrows };
    });
    expect(seen.count).toBe(0);
    expect(seen.arrows).toEqual({ shown: false, count: 0 });
    expect(seen.view.putt).toBeNull();
    expect(seen.shot).toBeNull();
    await expect(page.locator('#putt')).toBeHidden();
    await page.mouse.up();
    expect(problems).toEqual([]);
  });

  test.describe('on a phone', () => {
    test.use({ viewport: { width: 400, height: 860 }, hasTouch: true, isMobile: true });

    test('the break line fits its panel and the screen and is readable; the slope pictured', async ({ page }) => {
      const problems = watch(page);
      await start(page, { seed: 11, paused: true });
      await onSideHill(page);
      const r = await read(page);
      expect(r.outside).toEqual([]);
      expect(r.texts.filter((t) => t.ratio < CONTRAST).map((t) => `"${t.text}" ${t.ratio}:1`)).toEqual([]);
      expect(r.texts.some((t) => t.text.startsWith('Putt:'))).toBe(true);
      await hideStats(page);
      await expect(page).toHaveScreenshot('phone-slope.png', TOLERANCE);
      expect(problems).toEqual([]);
    });
  });
});
