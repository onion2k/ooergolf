/**
 * What the models look like, held to pictures taken before, in the showcase
 * (`/showcase.html`): the whole set on its patch of grass, the obstacles
 * close, the decoration, and the obstacles on a phone, turned so the row
 * runs up the screen; the whole set on a phone is too small for a colour to
 * show in the tolerance, so it would hold nothing. The unit tests hold
 * the models' sizes and faces; only a picture notices a colour gone muddy or
 * a part lit inside out.
 *
 * Each view is set through the showcase's test API with the decoration
 * seeded and the blades and belt paused, so the same machine draws the same
 * pixels every run. The pictures are in `smoke/screens/`, and are this
 * machine's GPU, held with the same tolerance as the game's own.
 *
 *   npx playwright test smoke/models.spec.ts                        the views against the pictures
 *   npx playwright test smoke/models.spec.ts --update-snapshots     the pictures written again, after a change meant to alter them
 */
import { expect, test, type Page } from '@playwright/test';
import type {} from '../src/showcase';
import { watch } from './game';

/** How far the pictures may differ before it is a change and not the GPU: as the game's look pictures. */
const TOLERANCE = { maxDiffPixelRatio: 0.002, threshold: 0.02 };
/** What a frame may cost at all, as the game's perf budget has it. */
const FRAME_BUDGET_MS = 8;

/** The showcase in the page, paused, its decoration from `seed`, and ready; `model` adds an exhibit that is shown only when asked for (`title`, `balls`). */
async function showcase(page: Page, seed = 1, model?: string) {
  await page.goto(`/showcase.html?paused=1&seed=${seed}${model ? `&model=${model}` : ''}`);
  try {
    await expect.poll(() => page.evaluate(() => window.showcase?.ready ?? false), { timeout: 60_000 }).toBe(true);
  } catch {
    throw new Error(`the showcase did not boot: ${await page.locator('#bootMsg').textContent()}`);
  }
}

/** The camera parked on a view, and a frame drawn there. */
async function look(page: Page, view: string) {
  await page.evaluate((v) => {
    window.showcase!.look(v);
    window.showcase!.step(0);
  }, view);
}

test.describe('the models', () => {
  test('boots with no errors, and every view can be looked at', async ({ page }) => {
    const problems = watch(page);
    await showcase(page);
    const views = await page.evaluate(() => window.showcase!.views);
    for (const v of ['all', 'course', 'obstacles', 'decoration', 'windmill', 'bunker', 'flowers', 'rail'])
      expect(views).toContain(v);
    for (const v of views) await look(page, v);
    await expect(page.locator('.label:not([hidden])').first()).toBeVisible();
    expect(problems).toEqual([]);
  });

  test('a frame of the whole set costs well inside the budget', async ({ page }) => {
    const problems = watch(page);
    await showcase(page);
    await look(page, 'all');
    const { ms, triangles } = await page.evaluate(async () => ({
      ms: await window.showcase!.measureFrame(),
      triangles: window.showcase!.triangles,
    }));
    console.log(`showcase: frame ${ms.toFixed(2)} ms, ${triangles} triangles`);
    expect(ms).toBeGreaterThan(0);
    expect(ms).toBeLessThan(FRAME_BUDGET_MS / 2);
    expect(problems).toEqual([]);
  });

  test('the whole set, in rows on the grass', async ({ page }) => {
    const problems = watch(page);
    await showcase(page);
    await look(page, 'all');
    await expect(page).toHaveScreenshot('models-all.png', TOLERANCE);
    expect(problems).toEqual([]);
  });

  test('the course’s furniture, close: the rail round a corner and a T, the cups and flags, the tee and the ball', async ({
    page,
  }) => {
    const problems = watch(page);
    await showcase(page);
    await look(page, 'course');
    await expect(page).toHaveScreenshot('models-furniture.png', TOLERANCE);
    expect(problems).toEqual([]);
  });

  test('the obstacles, close', async ({ page }) => {
    const problems = watch(page);
    await showcase(page);
    await look(page, 'obstacles');
    await expect(page).toHaveScreenshot('models-obstacles.png', TOLERANCE);
    expect(problems).toEqual([]);
  });

  test('the decoration', async ({ page }) => {
    const problems = watch(page);
    await showcase(page);
    await look(page, 'decoration');
    await expect(page).toHaveScreenshot('models-decoration.png', TOLERANCE);
    expect(problems).toEqual([]);
  });

  test.describe('on a phone', () => {
    test.use({ viewport: { width: 400, height: 860 }, hasTouch: true, isMobile: true });

    test('the obstacles, upright', async ({ page }) => {
      const problems = watch(page);
      await showcase(page);
      await look(page, 'obstacles');
      await expect(page).toHaveScreenshot('models-phone.png', TOLERANCE);
      expect(problems).toEqual([]);
    });
  });
});

test.describe('the kicker', () => {
  test('close: a mushroom bumper, wider at the cap than the foot, in colours of its own', async ({ page }) => {
    const problems = watch(page);
    await showcase(page);
    await look(page, 'kicker');
    await expect(page).toHaveScreenshot('kicker.png', TOLERANCE);
    expect(problems).toEqual([]);
  });
});

test.describe('the flipper', () => {
  test('the flipper, close, turned a little up its swing', async ({ page }) => {
    const problems = watch(page);
    await showcase(page);
    await look(page, 'flipper');
    await expect(page).toHaveScreenshot('flipper.png', TOLERANCE);
    expect(problems).toEqual([]);
  });
});

test.describe('the title', () => {
  test('the traced lettering, standing in its outline with the ball, the flag and the sparkles, seen from the front', async ({
    page,
  }) => {
    const problems = watch(page);
    await showcase(page, 1, 'title');
    await look(page, 'title');
    await expect(page).toHaveScreenshot('title-lettering.png', TOLERANCE);
    expect(problems).toEqual([]);
  });
});
