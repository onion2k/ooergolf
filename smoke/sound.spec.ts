/**
 * The sound in a real browser, read through the test API, since what is heard cannot be: nothing made before the first
 * gesture, which makes the context and loads the sounds a frame at a time; each event the game tells of heard once, as
 * the event log says (a stroke by its club, a landing, a knock, the cup, the water); the music under a menu and the wind
 * on a golf hole, each moving only while the game steps; and the speaker button, the M key and the start screen's slider,
 * kept in the save across a reload, from a save that has the setting, one that lacks it and one with it wrong.
 *
 * Played paused and stepped, as the other smoke tests are. Playwright's Chromium is started with the autoplay rule
 * lifted (playwright.config.ts), so that a context made by `wake()`, which is not a gesture, runs.
 */
import { expect, test, type Page } from '@playwright/test';
import { COURSES } from '../src/course';
import { drag, intoThePond, landed, start, watch } from './game';
import { holeOut } from './panels';

const sound = (page: Page) => page.evaluate(() => window.game!.sound());
/** The events told of since they were last read: reading them empties the log. */
const events = (page: Page) => page.evaluate(() => window.game!.events());
const count = (lines: string[], re: RegExp) => lines.filter((l) => re.test(l)).length;
const savedSound = (page: Page) =>
  page.evaluate(() => {
    const save = JSON.parse(localStorage.getItem('ooergolf-save-v1') ?? '{}') as { muted?: unknown; volume?: unknown };
    return { muted: save.muted, volume: save.volume };
  });

/** A drag from the ball, `dx` and `dy` across and down the page, let go. */
async function stroke(page: Page, dx: number, dy: number) {
  const at = await page.evaluate(() => {
    const b = window.game!.ball();
    return window.game!.project(b.x, b.y, b.z);
  });
  await drag(page, at, { x: at.x + dx, y: at.y + dy });
}

/** Steps until the ball is at rest. */
async function toRest(page: Page) {
  await page.evaluate(() => {
    const g = window.game!;
    for (let f = 0; f < 1200 && !(g.state().ready && f > 5); f++) g.step(1);
  });
}

test('the first gesture makes the sound and loads it a frame at a time, and a putt and its knocks are heard', async ({
  page,
}) => {
  const problems = watch(page);
  await start(page, { seed: 1, paused: true });
  expect(await sound(page), 'nothing before a gesture').toMatchObject({ awake: false, voices: 0, loaded: 0 });

  await landed(page);
  await stroke(page, 0, 150);
  const woken = await sound(page);
  // the drag was the gesture: the context is made and the putt loaded at once, so the putt was heard
  expect(woken.awake).toBe(true);
  expect(woken.loaded).toBe(1);
  // and it is playing: a voice of the package's, and not only a line in the log
  expect(woken.voices).toBeGreaterThan(0);
  expect((await events(page)).filter((l) => l.startsWith('sound struck'))).toEqual([
    expect.stringMatching(/^sound struck putter 0\.\d\d$/) as unknown as string,
  ]);

  // then one sound a frame, never two, and while the ball rolls only those cheap to load: the dear ones wait for it to rest
  const DEAR = ['strike-iron', 'strike-wood', 'strike-wedge', 'splash', 'applause', 'bell', 'wind', 'music'];
  let loaded = woken.loaded;
  let names: string[] = [];
  for (let f = 0; f < 1200; f++) {
    // moving through the whole frame: not at rest before the step, nor after it
    const before = await page.evaluate(() => window.game!.state().ready);
    await page.evaluate(() => window.game!.step(1));
    const now = await sound(page);
    const after = await page.evaluate(() => window.game!.state().ready);
    const fresh = Object.keys(now.loadMs).filter((n) => !names.includes(n));
    expect(now.loaded - loaded, `frame ${f}`).toBeLessThanOrEqual(1);
    if (!before && !after)
      expect(
        fresh.filter((n) => DEAR.includes(n)),
        `frame ${f}, rolling`,
      ).toEqual([]);
    [loaded, names] = [now.loaded, Object.keys(now.loadMs)];
    if (loaded === now.queued) break;
  }
  const all = await sound(page);
  expect(all.loaded).toBe(all.queued);
  console.log(`the slowest sound to load, ${all.slowestLoad}, took ${all.slowestLoadMs.toFixed(1)} ms`);
  console.log(
    Object.entries(all.loadMs)
      .map(([n, ms]) => `${n} ${ms.toFixed(1)}`)
      .join(', '),
  );
  // what loads while the ball moves is held to 4 ms, the agreed figure; the first after the putt to 6, a frame's budget, since
  // it is the first to run the layers' code the putt does not (the bounces), and pays the browser's warm-up: 3.6 to 4.1 ms
  // over runs on 18 October 2026, where the rest are under 3.7
  const cheap = Object.entries(all.loadMs).filter(([name]) => !DEAR.includes(name) && name !== 'putt');
  cheap.forEach(([name, ms], k) => expect(ms, `${name}, loaded while the ball may move`).toBeLessThan(k === 0 ? 6 : 4));

  await toRest(page);
  const lines = await events(page);
  // every knock the game told of was heard, and no more
  expect(count(lines, /^sound knocked/)).toBe(count(lines, /^knocked /));
  expect((await sound(page)).voices, 'the pool caps the voices').toBeLessThanOrEqual(16);
  expect(problems).toEqual([]);
});

test('a ball holed is heard once, and a ball into water once', async ({ page }) => {
  await start(page, { seed: 3, paused: true });
  await page.evaluate(() => {
    window.game!.wake();
    window.game!.step(30);
  });
  await holeOut(page);
  let lines = await events(page);
  expect(count(lines, /^holed /)).toBe(1);
  expect(count(lines, /^sound holed \d+ \d+$/)).toBe(1);
  // the next frames add no second rattle
  await page.evaluate(() => window.game!.step(120));
  expect(count(await events(page), /^sound holed/)).toBe(0);

  const pond = COURSES.find((c) => c.holes.some((h) => h.name === 'Pond'))!;
  const index = pond.holes.findIndex((h) => h.name === 'Pond');
  const angle = intoThePond();
  lines = await page.evaluate(
    ({ name, index, angle }) => {
      const g = window.game!;
      g.chooseCourse(name);
      g.startHole(index);
      g.step(5);
      g.events();
      g.shoot(angle, 1);
      const seen: string[] = [];
      for (let f = 0; f < 600 && !seen.some((l) => l.startsWith('splash')); f++) {
        g.step(1);
        seen.push(...g.events());
      }
      g.step(5);
      return seen.concat(g.events());
    },
    { name: pond.name, index, angle },
  );
  expect(count(lines, /^splash /)).toBeGreaterThan(0);
  expect(count(lines, /^sound splash$/)).toBe(count(lines, /^splash /));
});

test('on a golf hole the club strikes as it is, the landing thuds, and the wind blows; the menus have music', async ({
  page,
}) => {
  await start(page, { seed: 2, paused: true, screen: true });
  await page.evaluate(() => {
    window.game!.wake();
    window.game!.step(30);
  });
  // the start screen is a menu: the music plays while the game steps
  const before = await sound(page);
  expect(before).toMatchObject({ music: true, ambience: false });
  await page.evaluate(() => window.game!.step(120));
  const beat = (await sound(page)).beat;
  expect(beat).toBeGreaterThan(before.beat);

  await page.evaluate(() => window.game!.chooseCourse('The Links'));
  await page.evaluate(() => window.game!.step(30));
  const course = await sound(page);
  expect(course).toMatchObject({ music: false, ambience: true, loops: 1 });
  await page.evaluate(() => window.game!.step(120));
  expect((await sound(page)).beat, 'the music waits under the course').toBe(course.beat);

  await landed(page);
  await stroke(page, 0, 160);
  expect((await events(page)).filter((l) => l.startsWith('sound struck'))).toEqual([
    expect.stringMatching(/^sound struck wood 0\.\d\d$/) as unknown as string,
  ]);
  await toRest(page);
  const lines = await events(page);
  expect(count(lines, /^sound landed \d\.\d\d$/)).toBe(1);

  // the shop is a menu too
  await page.click('#shopOpen');
  await page.evaluate(() => window.game!.step(2));
  expect(await sound(page)).toMatchObject({ music: true, ambience: false, loops: 0 });
  await page.click('#shopClose');
  await page.evaluate(() => window.game!.step(2));
  expect(await sound(page)).toMatchObject({ music: false, ambience: true });
});

test('the speaker button, the M key and the slider set the sound, and a reload keeps it', async ({ page }) => {
  await start(page, { seed: 1, paused: true, screen: true });
  expect((await sound(page)).shown).toEqual({ muted: false, switchOn: true, volume: 1 });
  // the slider, as a player moves it, before any sound is made: kept all the same
  await page.locator('#volume').fill('0.3');
  expect(await sound(page)).toMatchObject({ volume: 0.3, shown: { volume: 0.3 } });
  expect(await savedSound(page)).toEqual({ muted: false, volume: 0.3 });

  await page.evaluate(() => window.game!.chooseCourse('The Meadow'));
  await landed(page);
  await page.click('#viewSound');
  expect(await sound(page)).toMatchObject({ awake: true, muted: true, volume: 0.3, shown: { muted: true } });
  await expect(page.locator('#viewSound')).toHaveAttribute('aria-label', 'Unmute');
  expect(await savedSound(page)).toEqual({ muted: true, volume: 0.3 });
  await page.keyboard.press('m');
  expect(await sound(page)).toMatchObject({ muted: false, shown: { muted: false } });
  await page.keyboard.press('M');
  expect(await savedSound(page)).toEqual({ muted: true, volume: 0.3 });

  await page.reload();
  await page.waitForFunction(() => window.game?.ready === true);
  expect(await sound(page)).toMatchObject({
    awake: false,
    muted: true,
    volume: 0.3,
    shown: { muted: true, switchOn: false, volume: 0.3 },
  });
});

test('a save without the setting plays at full volume, and one with it wrong takes the defaults', async ({
  browser,
}) => {
  for (const save of [{ coins: 5 }, { coins: 5, muted: 'yes', volume: 7 }]) {
    const page = await browser.newPage();
    await start(page, { seed: 1, paused: true, save });
    expect(await sound(page), JSON.stringify(save)).toMatchObject({
      muted: false,
      volume: 1,
      shown: { muted: false, switchOn: true, volume: 1 },
    });
    await page.close();
  }
});

test('what the sound keeps stays bounded over many holes: the voices, the loops and the loads', async ({ page }) => {
  // the ceilings: the package's voice pool (16), one loop (the wind) and one load a sound; scripts/leaks.ts plays the game
  // in node, where there is no AudioContext, so the sound's ceilings are held here, in the browser, over a course
  await start(page, { seed: 5, paused: true });
  await page.evaluate(() => {
    window.game!.wake();
    window.game!.step(30);
  });
  for (const name of ['The Meadow', 'The Links']) {
    await page.evaluate((n) => window.game!.chooseCourse(n), name);
    for (let hole = 0; hole < 4; hole++) {
      await page.evaluate((h) => {
        window.game!.startHole(h);
        window.game!.step(5);
      }, hole);
      await holeOut(page);
      const now = await sound(page);
      expect(now.voices, `${name} ${hole + 1}`).toBeLessThanOrEqual(16);
      expect(now.loops).toBeLessThanOrEqual(1);
      expect(Object.keys(now.loadMs).length).toBeLessThanOrEqual(now.queued);
      await events(page);
    }
  }
});

test('a page out of sight stops the sound, the wind with it, and it comes back when the page is seen', async ({
  page,
}) => {
  await start(page, { seed: 2, paused: true });
  await page.evaluate(() => {
    window.game!.wake();
    window.game!.chooseCourse('The Links');
    window.game!.step(30);
  });
  await expect.poll(async () => (await sound(page)).context).toBe('running');
  const seen = (hidden: boolean) =>
    page.evaluate((h) => {
      Object.defineProperty(document, 'hidden', { configurable: true, get: () => h });
      document.dispatchEvent(new Event('visibilitychange'));
    }, hidden);
  await seen(true);
  await expect.poll(async () => (await sound(page)).context).toBe('suspended');
  await seen(false);
  await expect.poll(async () => (await sound(page)).context).toBe('running');
});

test('on a phone the course has no speaker, and the start screen’s switch turns the sound off and on', async ({
  page,
}) => {
  for (const size of [
    { width: 375, height: 812 },
    { width: 812, height: 375 },
  ]) {
    await page.setViewportSize(size);
    await start(page, { seed: 1, paused: true, screen: true });
    await landed(page);
    await page.click('#soundSwitch');
    expect(await sound(page), `${size.width} wide`).toMatchObject({
      muted: true,
      shown: { muted: true, switchOn: false },
    });
    expect(await savedSound(page)).toMatchObject({ muted: true });
    await page.click('#soundSwitch');
    expect(await sound(page)).toMatchObject({ muted: false, shown: { switchOn: true } });
    await page.evaluate(() => window.game!.chooseCourse('The Meadow'));
    await landed(page);
    await expect(page.locator('#viewMode')).toBeVisible();
    await expect(page.locator('#viewSound'), 'no speaker on a phone’s course').toBeHidden();
    await page.evaluate(() => localStorage.clear());
  }
});
