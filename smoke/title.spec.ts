/**
 * The title screen: the page opens on plain sky, fades away to a hole of The Links drawn by the game with "Of Course!" in
 * 3D letters dropping in over it one by one from the left, and brings the course cards up under them once they have landed.
 * The word is held inside the screen and clear of the cards on the eight sizes the picture it replaces was held on, a course
 * chosen mid-drop begins that course and lets the whole scene go, and the card's Courses button brings the title back with
 * its letters standing. Every other smoke test leaves the title out (`?title=0`), so this is the one that loads the page as a
 * player does. Time is the test's own: the page is paused and stepped, and the title's clock goes by the frames stepped, so
 * a slow machine fails nothing here by being slow.
 */
import { expect, test, type Page } from '@playwright/test';
import { DROP } from '../src/titlescene';
import { landed, ready, start, watch } from './game';
import { toCard } from './panels';

const DESKTOP = { viewport: { width: 1280, height: 800 } };
const PHONE = { viewport: { width: 400, height: 860 }, hasTouch: true, isMobile: true };

/** The frames of 1/60 s that take the title's clock from its start to `t` seconds. */
const framesTo = (t: number) => Math.ceil((t + DROP.lead) * 60);

/** The title as the test's page reads it. */
const title = (page: Page) => page.evaluate(() => window.game!.title());

/** The page opened as a player opens it, paused, with the title's clock at its start. */
async function open(page: Page, seed = 1) {
  await start(page, { title: true, paused: true, seed, screen: true });
}

/** Frames stepped, the title's clock with them. */
const step = (page: Page, frames: number) => page.evaluate((n) => window.game!.step(n), frames);

/** The panel's fade finished, so a picture is of the scene and not of the scene through a panel on its way out. */
const faded = (page: Page) => expect(page.locator('#boot')).toBeHidden();

/** The frame's cost in words is the one thing in the scene that changes from run to run. */
const SCENE_ONLY = '#stats { visibility: hidden !important; }';

/** The box that holds every piece that is shown, in the page's own pixels. */
async function wordBox(page: Page) {
  const t = await title(page);
  let [x0, y0, x1, y1] = [Infinity, Infinity, -Infinity, -Infinity];
  for (const p of t.pieces)
    if (p.box) {
      x0 = Math.min(x0, p.box[0]);
      y0 = Math.min(y0, p.box[1]);
      x1 = Math.max(x1, p.box[2]);
      y1 = Math.max(y1, p.box[3]);
    }
  return { x0, y0, x1, y1 };
}

test.describe('the boot panel', () => {
  test.use(DESKTOP);

  test('is plain sky: no picture is fetched, and it says nothing at any moment of a good boot', async ({ page }) => {
    const pictures: string[] = [];
    page.on('request', (r) => {
      if (r.resourceType() === 'image') pictures.push(r.url());
    });
    await page.addInitScript(() => {
      const said = new Set<string>();
      (window as unknown as { said: Set<string> }).said = said;
      new MutationObserver(() => {
        const words = document.getElementById('boot')?.textContent.trim();
        if (words) said.add(words);
      }).observe(document, { childList: true, subtree: true, characterData: true });
    });
    await page.goto('/?paused=1&seed=1');
    await ready(page);
    expect(pictures, 'no picture is fetched by the page').toEqual([]);
    const boot = await page.evaluate(() => {
      const el = document.getElementById('boot')!;
      return {
        pictures: el.querySelectorAll('img').length,
        background: getComputedStyle(el).backgroundImage,
        said: [...(window as unknown as { said: Set<string> }).said],
      };
    });
    expect(boot.pictures, 'no picture on the panel').toBe(0);
    expect(boot.background, 'the title scene’s own sky, a gradient in the stylesheet').toContain('linear-gradient');
    expect(boot.said, 'no word on the panel').toEqual([]);
    await faded(page);
  });

  test('fades away to the title scene, which is drawn behind it, with the start screen up and held back', async ({
    page,
  }) => {
    const problems = watch(page);
    await open(page);
    const t = await title(page);
    expect(t.up).toBe(true);
    expect(t.landed).toBe(false);
    expect(t.cards, 'the cards wait for the letters').toBe(false);
    expect(await page.evaluate(() => window.game!.state().choosing), 'the start screen is up').toBe(true);
    await expect(page.locator('#start')).toBeHidden();
    await expect(page.locator('#strokes'), 'nothing of the hole is over the scene').toBeHidden();
    await faded(page);
    expect(problems).toEqual([]);
  });

  test('says nothing on the console from the first frame to the last letter landed, warnings included', async ({
    page,
  }) => {
    // the GPU's warnings (a draw of nothing is one) come as console warnings, which `watch` leaves out; it says each once
    const said: string[] = [];
    page.on('console', (m) => {
      if (m.type() === 'warning' || m.type() === 'error') said.push(`${m.type()}: ${m.text()}`);
    });
    await open(page);
    for (let k = 0; k < 5; k++) {
      await step(page, framesTo(1.7) / 5 + 1);
      await page.waitForTimeout(100);
    }
    expect((await title(page)).landed, 'the whole drop was drawn').toBe(true);
    expect(said, 'the title’s console is clean').toEqual([]);
  });

  test('a boot that fails says why, and the panel stays up', async ({ page }) => {
    await page.addInitScript(() => {
      Object.defineProperty(navigator, 'gpu', { value: undefined, configurable: true });
    });
    await page.goto('/?seed=1');
    const message = page.locator('#bootMsg');
    await expect(message).toBeVisible({ timeout: 30_000 });
    expect((await message.textContent())!.length, 'the reason is in words').toBeGreaterThan(5);
    await expect(page.locator('#boot')).not.toHaveClass(/gone/);
  });
});

test.describe('the letters', () => {
  test.use(DESKTOP);

  test('drop in one by one from the left, land by 1.7 s, and the cards come up when they have', async ({ page }) => {
    const problems = watch(page);
    await open(page);
    // before the first letter
    await step(page, 6);
    let t = await title(page);
    expect(t.t).toBeLessThan(0);
    expect(
      t.pieces.filter((p) => p.shown),
      'none yet',
    ).toEqual([]);
    // a third of a second in: the steps whose turn has come are there, and the rest are not
    await step(page, framesTo(0.34) - 6);
    t = await title(page);
    for (const p of t.pieces) expect(p.shown, `${p.name} at ${t.t.toFixed(2)}`).toBe(DROP.apart * p.step <= t.t + 1e-9);
    const there = t.pieces.filter((p) => p.shown && p.kind === 'face').map((p) => p.step);
    expect(Math.max(...there), 'from the left').toBeLessThan(5);
    expect(
      t.pieces.some((p) => p.shown && p.lift > 0),
      'one is in the air',
    ).toBe(true);
    expect(t.cards).toBe(false);
    // the whole of it
    await step(page, framesTo(1.7) - framesTo(0.34));
    t = await title(page);
    expect(t.landed, `landed by ${t.t.toFixed(2)} s`).toBe(true);
    for (const p of t.pieces) {
      expect(p.shown, p.name).toBe(true);
      expect([p.lift, p.sx, p.sy], p.name).toEqual([0, 1, 1]);
    }
    expect(t.cards).toBe(true);
    await expect(page.locator('#start')).toBeVisible();
    await faded(page);
    expect(await page.evaluate(() => window.game!.invariants())).toEqual([]);
    expect(problems).toEqual([]);
  });

  test('the clock goes by the frames stepped and nothing else: a paused page is still', async ({ page }) => {
    await open(page);
    await step(page, 30);
    const before = await title(page);
    await page.waitForTimeout(400);
    const after = await title(page);
    expect(after.t).toBe(before.t);
    expect(after.pieces).toEqual(before.pieces);
  });

  test('the same frames give the same pose, boxes and all, on a second page', async ({ page, browser }) => {
    await open(page);
    await step(page, 48);
    const a = await title(page);
    const other = await browser.newPage({ viewport: { width: 1280, height: 800 } });
    await open(other);
    await step(other, 48);
    const b = await title(other);
    await other.close();
    expect(b).toEqual(a);
  });

  test('stand at once for a player who asked for less motion, with the cards up and no fade', async ({ page }) => {
    await page.emulateMedia({ reducedMotion: 'reduce' });
    await open(page);
    const t = await title(page);
    expect(t.landed).toBe(true);
    expect(t.cards).toBe(true);
    for (const p of t.pieces) expect([p.shown, p.lift, p.sx, p.sy], p.name).toEqual([true, 0, 1, 1]);
    await expect(page.locator('#start')).toBeVisible();
    const fade = await page.evaluate(() => document.getElementById('boot')!.style.getPropertyValue('--title-out'));
    expect(fade, 'no fade').toBe('0ms');
  });
});

test.describe('the word on every screen', () => {
  // a desk, a wide one, a phone on its side, a tablet each way and a tall phone: the word is whole and clear of the cards on all
  for (const [name, width, height] of [
    ['a desk', 1280, 800],
    ['an ultrawide', 2560, 1080],
    ['a phone on its side', 844, 390],
    ['a tablet on its side', 1024, 768],
    ['a tablet upright', 768, 1024],
    ['a phone upright', 400, 860],
    ['a tall phone', 360, 800],
    ['a very tall phone', 360, 900],
  ] as const) {
    test(`is whole on the screen and above the cards on ${name}, ${width} by ${height}`, async ({ page }) => {
      await page.setViewportSize({ width, height });
      await open(page);
      await step(page, framesTo(1.7));
      const word = await wordBox(page);
      expect(word.x0, 'its left edge').toBeGreaterThanOrEqual(0);
      expect(word.x1, 'its right edge').toBeLessThanOrEqual(width);
      expect(word.y0, 'its top').toBeGreaterThanOrEqual(0);
      await expect(page.locator('#start')).toBeVisible();
      await faded(page);
      const cards = await page.locator('#start').boundingBox();
      expect(word.y1, 'its foot is above the cards').toBeLessThanOrEqual(cards!.y);
      expect(word.x1 - word.x0, 'and it is a good size').toBeGreaterThan(0.3 * Math.min(width, height * 1.2));
    });
  }
});

test.describe('choosing a course', () => {
  test.use(DESKTOP);

  test('mid-drop begins the course and lets the whole scene go', async ({ page }) => {
    const problems = watch(page);
    await open(page);
    await step(page, framesTo(0.5));
    expect((await title(page)).landed).toBe(false);
    await page.evaluate(() => window.game!.chooseCourse('The Meadow'));
    const after = await title(page);
    expect(after.up, 'the title is let go').toBe(false);
    expect(after.pieces, 'and none of its letters is kept').toEqual([]);
    const state = await page.evaluate(() => window.game!.state());
    expect(state.choosing).toBe(false);
    expect(state.course).toBe('The Meadow');
    expect([state.hole, state.strokes, state.phase]).toEqual([0, 0, 'play']);
    expect(await page.evaluate(() => document.documentElement.hasAttribute('data-title'))).toBe(false);
    await expect(page.locator('#start')).toBeHidden();
    await expect(page.locator('#strokes')).toBeVisible();
    // and the course is played over a screen that has no letters on it: the clock does not run on
    await step(page, 120);
    expect((await title(page)).up).toBe(false);
    expect(await page.evaluate(() => window.game!.invariants())).toEqual([]);
    expect(problems).toEqual([]);
  });

  test('on a golf course, after the letters have landed, begins its first hole', async ({ page }) => {
    await open(page);
    await step(page, framesTo(1.7));
    await page.evaluate(() => window.game!.chooseCourse('The Links'));
    const state = await page.evaluate(() => window.game!.state());
    expect([state.course, state.hole, state.choosing, state.golf]).toEqual(['The Links', 0, false, true]);
    expect((await title(page)).up).toBe(false);
  });

  test('the card’s Courses button brings the title back behind the start screen, its letters standing', async ({
    page,
  }) => {
    await open(page);
    await page.evaluate(() => window.game!.chooseCourse('The Meadow'));
    const over = await toCard(page);
    expect(over.phase).toBe('over');
    await page.locator('#cardCourses').click();
    const t = await title(page);
    expect(t.up, 'the title is up again').toBe(true);
    expect(t.landed, 'standing').toBe(true);
    for (const p of t.pieces) expect([p.shown, p.lift, p.sx, p.sy], p.name).toEqual([true, 0, 1, 1]);
    expect(t.cards).toBe(true);
    await expect(page.locator('#start')).toBeVisible();
    expect(await page.evaluate(() => window.game!.state().choosing)).toBe(true);
    // and a course can be chosen again from it
    await page.evaluate(() => window.game!.chooseCourse('The Pinball Shed'));
    expect((await title(page)).up).toBe(false);
    expect(await page.evaluate(() => window.game!.state().course)).toBe('The Pinball Shed');
  });

  test('choosing and going back, round after round, keeps nothing of the title: no scene is held once a course is chosen', async ({
    page,
  }) => {
    test.setTimeout(180_000);
    await open(page);
    const cdp = await page.context().newCDPSession(page);
    // the title scenes the page still holds, after a collection and a moment for the collector to say so
    const alive = async () => {
      await cdp.send('HeapProfiler.collectGarbage');
      await page.waitForTimeout(100);
      await cdp.send('HeapProfiler.collectGarbage');
      await page.waitForTimeout(100);
      return (await title(page)).alive;
    };
    const round = async () => {
      await page.evaluate(() => window.game!.chooseCourse('The Meadow'));
      await toCard(page);
      await page.locator('#cardCourses').click();
      expect((await title(page)).up).toBe(true);
    };
    for (let n = 0; n < 4; n++) await round();
    // one standing, behind the start screen, and none of the four before it
    expect(await alive(), 'title scenes held after four rounds, the one on the screen among them').toBe(1);
    await page.evaluate(() => window.game!.chooseCourse('The Meadow'));
    expect(await alive(), 'and none once a course is chosen').toBe(0);
    await round();
    expect((await title(page)).pieces.length, 'one title standing, and no more').toBeGreaterThan(0);
  });

  test('a page that leaves the title out has none: the start screen is over The Meadow, as it was', async ({
    page,
  }) => {
    await start(page, { paused: true, seed: 1, screen: true });
    const t = await title(page);
    expect(t.up).toBe(false);
    expect(t.pieces).toEqual([]);
    expect(await page.evaluate(() => window.game!.state().choosing)).toBe(true);
    await expect(page.locator('#start')).toBeVisible();
    expect(await page.evaluate(() => document.documentElement.hasAttribute('data-title'))).toBe(false);
  });
});

test.describe('the pictures', () => {
  test.describe('on a desk', () => {
    test.use(DESKTOP);

    test('the title standing, with the cards under it', async ({ page }) => {
      await open(page);
      await page.addStyleTag({ content: SCENE_ONLY });
      await step(page, framesTo(1.7));
      await faded(page);
      await expect(page.locator('#start')).toBeVisible();
      await landed(page);
      await expect(page).toHaveScreenshot('title-desk.png', { maxDiffPixelRatio: 0.02 });
    });

    test('the letters in the air, a third of the way through the drop', async ({ page }) => {
      await open(page);
      await page.addStyleTag({ content: SCENE_ONLY });
      await step(page, framesTo(0.55));
      await faded(page);
      await expect(page).toHaveScreenshot('title-drop.png', { maxDiffPixelRatio: 0.02 });
    });
  });

  test.describe('on a phone', () => {
    test.use(PHONE);

    test('the title standing, with the cards under it', async ({ page }) => {
      await open(page);
      await page.addStyleTag({ content: SCENE_ONLY });
      await step(page, framesTo(1.7));
      await faded(page);
      await expect(page.locator('#start')).toBeVisible();
      await landed(page);
      await expect(page).toHaveScreenshot('title-phone.png', { maxDiffPixelRatio: 0.02 });
    });
  });
});
