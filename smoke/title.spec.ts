/**
 * The title screen: the picture shown on the boot panel while the game boots, faded in once it is drawable and out once
 * the game is ready but not before it has been seen in full, whole on a desk and on a phone, with none of the old
 * status words, and a boot that fails still saying why. Every other smoke test leaves the title out (`?title=0`), so
 * this is the one that loads the page as a player does. Timing is read from when the page changed its own classes, not
 * waited on, so a slow machine fails nothing here by being slow.
 */
import { expect, test, type Page } from '@playwright/test';
import { TITLE } from '../src/title';

const DESKTOP = { viewport: { width: 1280, height: 800 } };
const PHONE = { viewport: { width: 400, height: 860 }, hasTouch: true, isMobile: true };

/** Records when the panel was shown and when it was let go, and every word it ever said, in the page's own time. */
async function record(page: Page) {
  await page.addInitScript(() => {
    const log = { shown: -1, gone: -1, said: new Set<string>() };
    (window as unknown as { titleLog: typeof log }).titleLog = log;
    const watch = () => {
      const boot = document.getElementById('boot');
      if (!boot) return false;
      const look = () => {
        if (boot.classList.contains('shown') && log.shown < 0) log.shown = performance.now();
        if (boot.classList.contains('gone') && log.gone < 0) log.gone = performance.now();
        const words = boot.textContent.trim();
        if (words) log.said.add(words);
      };
      new MutationObserver(look).observe(boot, {
        attributes: true,
        childList: true,
        subtree: true,
        characterData: true,
      });
      look();
      return true;
    };
    if (!watch())
      new MutationObserver((_, o) => watch() && o.disconnect()).observe(document, { childList: true, subtree: true });
  });
}

/** Holds the panel up and whole for a picture of it: the game behind it is ready in a moment and would fade it out under the camera. */
const HOLD = '#boot.gone { opacity: 1 !important; visibility: visible !important; transition: none !important; }';

/** Whether what is on top at the middle of the screen is the title's panel, and not a panel of the game's. */
const onTop = (page: Page) =>
  page.evaluate(() => document.elementFromPoint(innerWidth / 2, innerHeight / 2)?.closest('#boot') !== null);

const log = (page: Page) =>
  page.evaluate(() => {
    const l = (window as unknown as { titleLog: { shown: number; gone: number; said: Set<string> } }).titleLog;
    return { shown: l.shown, gone: l.gone, said: [...l.said] };
  });

test.describe('on a desk', () => {
  test.use(DESKTOP);

  test('fades the picture in, holds it until it has been seen, fades it out on to the start screen', async ({
    page,
  }) => {
    await record(page);
    await page.goto('/?paused=1&seed=1');
    await expect(page.locator('#boot')).toHaveClass(/shown/, { timeout: 30_000 });

    // the fade-in, read at its start, middle and end by setting the animation's own time
    const opacityAt = (ms: number) =>
      page.evaluate((t) => {
        const a = document.getAnimations().find((x) => (x as CSSAnimation).animationName === 'bootTitleIn')!;
        a.pause();
        a.currentTime = t;
        return Number(getComputedStyle(document.getElementById('bootTitle')!).opacity);
      }, ms);
    expect(await opacityAt(0), 'clear at the start').toBe(0);
    const middle = await opacityAt(TITLE.fadeIn / 2);
    expect(middle, 'half way in, neither clear nor whole').toBeGreaterThan(0.2);
    expect(middle).toBeLessThan(0.95);
    expect(await opacityAt(TITLE.fadeIn), 'whole at the end').toBe(1);

    await expect(page.locator('#boot')).toHaveClass(/gone/, { timeout: 60_000 });
    const l = await log(page);
    expect(l.shown, 'the picture was shown').toBeGreaterThan(0);
    expect(l.gone - l.shown, 'not let go before the fade-in was over').toBeGreaterThanOrEqual(TITLE.fadeIn - 10);
    expect(l.said, 'no word on the panel, the status texts included, at any moment of a good boot').toEqual([]);

    await expect(page.locator('#boot')).toBeHidden();
    const state = await page.evaluate(() => window.game!.state());
    expect(state.choosing, 'the start screen is up under it').toBe(true);
    await expect(page.locator('#courses')).toBeVisible();
  });

  test('is whole, never cropped, and draws the picture that was made', async ({ page }) => {
    await page.goto('/?paused=1&seed=1');
    await expect(page.locator('#boot')).toHaveClass(/shown/, { timeout: 30_000 });
    const box = await page.evaluate(() => {
      document.getAnimations().forEach((a) => ((a.currentTime = 600), a.pause()));
      const img = document.getElementById('bootTitle') as HTMLImageElement;
      const r = img.getBoundingClientRect();
      return {
        fit: getComputedStyle(img).objectFit,
        natural: [img.naturalWidth, img.naturalHeight],
        box: [r.left, r.top, r.right, r.bottom],
        view: [innerWidth, innerHeight],
      };
    });
    expect(box.fit).toBe('contain');
    expect(box.natural, 'the portrait picture').toEqual([512, 768]);
    expect(box.box[0]).toBeGreaterThanOrEqual(0);
    expect(box.box[1]).toBeGreaterThanOrEqual(0);
    expect(box.box[2]).toBeLessThanOrEqual(box.view[0]);
    expect(box.box[3]).toBeLessThanOrEqual(box.view[1]);
    await page.addStyleTag({ content: HOLD });
    await expect.poll(() => page.evaluate(() => window.game?.state().choosing ?? false)).toBe(true);
    expect(await onTop(page), 'the title is over the start screen that is up behind it').toBe(true);
    await expect(page.locator('#boot')).toHaveScreenshot('title-desk.png', { maxDiffPixelRatio: 0.02 });
  });
});

test.describe('on a phone', () => {
  test.use(PHONE);

  test('is whole and not cropped on a tall narrow screen', async ({ page }) => {
    await page.goto('/?paused=1&seed=1');
    await expect(page.locator('#boot')).toHaveClass(/shown/, { timeout: 30_000 });
    const box = await page.evaluate(() => {
      document.getAnimations().forEach((a) => ((a.currentTime = 600), a.pause()));
      const r = document.getElementById('bootTitle')!.getBoundingClientRect();
      return { right: r.right, bottom: r.bottom, left: r.left, top: r.top, w: innerWidth, h: innerHeight };
    });
    expect(box.left).toBeGreaterThanOrEqual(0);
    expect(box.top).toBeGreaterThanOrEqual(0);
    expect(box.right).toBeLessThanOrEqual(box.w);
    expect(box.bottom).toBeLessThanOrEqual(box.h);
    await page.addStyleTag({ content: HOLD });
    await expect.poll(() => page.evaluate(() => window.game?.state().choosing ?? false)).toBe(true);
    expect(await onTop(page), 'the title is over the start screen that is up behind it').toBe(true);
    await expect(page.locator('#boot')).toHaveScreenshot('title-phone.png', { maxDiffPixelRatio: 0.02 });
  });
});

test.describe('where it cannot be shown as it is', () => {
  test.use(DESKTOP);

  test('a player who asked for less motion gets no fade at all', async ({ page }) => {
    await page.emulateMedia({ reducedMotion: 'reduce' });
    await record(page);
    await page.goto('/?paused=1&seed=1');
    await expect(page.locator('#boot')).toHaveClass(/gone/, { timeout: 60_000 });
    const times = await page.evaluate(() => {
      const boot = document.getElementById('boot')!;
      return [boot.style.getPropertyValue('--title-in'), boot.style.getPropertyValue('--title-out')];
    });
    expect(times, 'no fade in and no fade out').toEqual(['0ms', '0ms']);
    await expect(page.locator('#boot')).toBeHidden();
  });

  test('a picture that is slow to come is not waited for, and not shown after the game is up', async ({ page }) => {
    let release = () => {};
    const held = new Promise<void>((r) => (release = r));
    await page.route('**/title.webp', async (route) => {
      await held;
      await route.continue();
    });
    // the load event waits on the picture, which is held: the page is asked for and let be
    await page.goto('/?paused=1&seed=1', { waitUntil: 'commit' });
    await expect(page.locator('#boot')).toHaveClass(/gone/, { timeout: 60_000 });
    expect(await page.evaluate(() => window.game!.ready), 'the game is up with the picture still on its way').toBe(
      true,
    );
    release();
    // let it arrive and decode: it is never shown over a game that is up
    await page.evaluate(() => (document.getElementById('bootTitle') as HTMLImageElement).decode().catch(() => {}));
    await expect(page.locator('#boot')).not.toHaveClass(/shown/);
  });

  test('a picture that cannot be had leaves the panel plain, and the game starts all the same', async ({ page }) => {
    const errors: string[] = [];
    page.on('pageerror', (e) => errors.push(e.message));
    await page.route('**/title.webp', (r) => r.abort());
    await page.goto('/?paused=1&seed=1');
    await expect(page.locator('#boot')).toHaveClass(/gone/, { timeout: 60_000 });
    await expect(page.locator('#bootTitle')).toBeHidden();
    expect(await page.evaluate(() => window.game!.state().choosing)).toBe(true);
    expect(errors).toEqual([]);
  });

  test('a boot that fails says why, under the picture, and the panel stays up', async ({ page }) => {
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
