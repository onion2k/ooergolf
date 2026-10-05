/**
 * The words over the course as a player meets them, on a desktop and on a
 * phone: every text clear against its panel, every button big enough for a
 * thumb, the score named large when a hole is done, and every panel
 * springing in and out, except for a player who has asked the system for
 * less motion, for whom none moves at all. Without these, a panel made
 * see-through or a button shrunk would only be caught by a picture, and a
 * picture cannot say which text is too faint to read.
 */
import { expect, test, type Page } from '@playwright/test';
import { CALLOUTS } from '../src/hud';
import { scoreKind, scoreName } from '../src/score';
import { SIDE_HILL } from '../test/hills';
import { drag, start, watch } from './game';
import { CLUBS, CLUB_LEAST, CONTRAST, THUMB, closeDrawer, holeOut, openDrawer, read, toCard } from './panels';

const DESKTOP = { viewport: { width: 1280, height: 800 } };
const PHONE = { viewport: { width: 400, height: 860 }, hasTouch: true, isMobile: true };

/** The texts on the screen as it stands that are too faint, and the buttons too small. */
async function faults(page: Page, screen: string) {
  const r = await read(page);
  expect(r.texts.length, `${screen}: some words read`).toBeGreaterThan(0);
  return {
    faint: r.texts
      .filter((t) => t.ratio < CONTRAST)
      .map((t) => `${screen}: "${t.text}" ${t.ratio}:1, ${t.colour} on ${t.behind}`),
    small: r.buttons.filter((b) => b.height < THUMB).map((b) => `${screen}: "${b.text}" ${b.height} px high`),
  };
}

for (const [where, device] of [
  ['on a desktop', DESKTOP],
  ['on a phone', PHONE],
] as const) {
  test.describe(where, () => {
    test.use(device);

    test('the start screen holds its four minigolf and one golf course without scrolling, the colours going round the cards', async ({
      page,
    }) => {
      const problems = watch(page);
      await start(page, { seed: 11, paused: true, screen: true });
      const r = await page.evaluate(() => {
        const panel = document.querySelector<HTMLElement>('#start')!;
        const faces = Array.from(document.querySelectorAll<HTMLElement>('#courses .course')).map(
          (c) => getComputedStyle(c).getPropertyValue('--face').trim() || getComputedStyle(c).backgroundColor,
        );
        return { fits: panel.scrollHeight <= panel.clientHeight, faces };
      });
      expect(r.fits, 'no scrolling in the start screen').toBe(true);
      // five cards, five colours: a heading among them must not shift the cycle
      expect(new Set(r.faces).size, 'each card its own colour').toBe(5);
      expect(problems).toEqual([]);
    });

    test('every text is clear against its panel and every button is a thumb high, on every screen', async ({
      page,
    }) => {
      const problems = watch(page);
      const found: Awaited<ReturnType<typeof faults>>[] = [];
      // a club in hand, one owned and the rest for sale, some too dear: every kind of button the shop has
      await start(page, {
        seed: 11,
        paused: true,
        screen: true,
        save: { coins: 130, gems: 1, owned: ['putter', 'brass'], club: 'brass' },
      });
      found.push(await faults(page, 'the start screen'));
      await page.evaluate(() => {
        window.game!.chooseCourse('The Meadow');
        window.game!.step(60);
      });
      found.push(await faults(page, 'the course'));
      await page.locator('#shopOpen').click();
      found.push(await faults(page, 'the shop'));
      await page.locator('#shopClose').click();
      expect((await holeOut(page)).phase, 'the first hole done').toBe('done');
      found.push(await faults(page, 'a hole done'));
      // every kind of word the callout is coloured for, shown in place of the one this hole gave, since a round
      // played to reach each would be a round of chance
      for (const kind of CALLOUTS) {
        await page.locator('#toast').evaluate((el: HTMLElement, k) => (el.dataset.kind = k), kind);
        found.push(await faults(page, `the callout for ${kind}`));
      }
      expect((await toCard(page)).phase, 'the round over').toBe('over');
      found.push(await faults(page, 'the card'));
      expect(found.flatMap((f) => f.faint)).toEqual([]);
      expect(found.flatMap((f) => f.small)).toEqual([]);
      expect(problems).toEqual([]);
    });

    test('the bag, on a golf hole: all eight clubs across, one lit, clear of the other panels and the edges, and away on minigolf', async ({
      page,
    }) => {
      const problems = watch(page);
      await start(page, { seed: 11, paused: true, screen: true });
      // under the start screen, and on a hole of minigolf, there is no bag
      await expect(page.locator('#bag')).toBeHidden();
      await page.evaluate(() => {
        window.game!.chooseCourse('The Meadow');
        window.game!.step(60);
      });
      await expect(page.locator('#bag')).toBeHidden();
      // the instruction to drag back is for a desk: a phone is not given it
      if (where === 'on a phone') await expect(page.locator('#help')).toBeHidden();
      else await expect(page.locator('#help')).toContainText('putt');
      await page.evaluate(() => {
        window.game!.chooseCourse('The Links');
        window.game!.step(60);
      });
      await expect(page.locator('#bag')).toBeVisible();
      if (where === 'on a phone') await expect(page.locator('#help')).toBeHidden();
      else await expect(page.locator('#help')).toContainText('swing');
      const r = await read(page);
      expect(r.outside, 'nothing past the screen').toEqual([]);
      expect(r.scrollWidth, 'nothing scrolls sideways').toBeLessThanOrEqual(page.viewportSize()!.width);
      const clubs = page.locator('#bagClubs button');
      await expect(clubs).toHaveCount(8);
      // each round and a thumb across on a desk, and on a phone as wide as eight across the screen allow
      const clubButtons = r.buttons.filter((b) => CLUBS.includes(b.text));
      expect(clubButtons.length).toBe(8);
      for (const b of clubButtons)
        expect(b.height, `the ${b.text} button`).toBeGreaterThanOrEqual(where === 'on a phone' ? CLUB_LEAST : THUMB);
      const circles = await page.locator('#bagClubs button').evaluateAll((els) =>
        els.map((el) => {
          const b = el.getBoundingClientRect();
          return { wide: b.width, high: b.height, radius: getComputedStyle(el).borderTopLeftRadius };
        }),
      );
      for (const c of circles) {
        expect(c.wide, 'a club is as wide as it is high').toBeCloseTo(c.high, 0);
        expect(c.radius, 'and round').toBe('50%');
      }
      // the club buttons do not touch one another
      const spans = await page
        .locator('#bagClubs button')
        .evaluateAll((els) => els.map((el) => [el.getBoundingClientRect().left, el.getBoundingClientRect().right]));
      for (let i = 1; i < spans.length; i++)
        expect(spans[i][0], `club ${i} clear of the one before`).toBeGreaterThan(spans[i - 1][1]);
      expect(r.texts.filter((t) => t.ratio < CONTRAST).map((t) => `"${t.text}" ${t.ratio}:1`)).toEqual([]);
      // the bag does not sit on the switch, the help or the frame's cost, or the hole's words
      const box = async (sel: string) => (await page.locator(sel).boundingBox())!;
      const bag = await box('#bag');
      for (const other of [
        '#viewMode',
        '#viewFlag',
        where === 'on a phone' ? '#holeChip' : '#strokes',
        ...(where === 'on a phone' ? [] : ['#help']),
      ]) {
        const o = await box(other);
        const apart =
          bag.x + bag.width <= o.x || o.x + o.width <= bag.x || bag.y + bag.height <= o.y || o.y + o.height <= bag.y;
        expect(apart, `the bag and ${other} do not overlap`).toBe(true);
      }
      expect(bag.x).toBeGreaterThanOrEqual(0);
      expect(bag.x + bag.width).toBeLessThanOrEqual(page.viewportSize()!.width);
      // a club pressed is in hand: lit, and the others not, and said above them
      await page.locator('#bagClubs button[data-club="sand-wedge"]').click();
      await expect(page.locator('#bagClubs button[aria-pressed="true"]')).toHaveCount(1);
      await expect(page.locator('#bagClubs button[data-club="sand-wedge"]')).toHaveAttribute('aria-pressed', 'true');
      await expect(page.locator('#bagInfo')).toContainText('Sand wedge');
      // and away again on a hole of minigolf
      await page.evaluate(() => {
        window.game!.chooseCourse('The Meadow');
        window.game!.step(60);
      });
      await expect(page.locator('#bag')).toBeHidden();
      expect(problems).toEqual([]);
    });

    test("the hole's words: a chip and a drawer on a phone that is shut by its button, a tap beside it or escape and is never a shot, and the panel as it was on a desk", async ({
      page,
    }) => {
      const problems = watch(page);
      await start(page, { seed: 11, paused: true, screen: true });
      // under the start screen neither is there
      await expect(page.locator('#holeChip')).toBeHidden();
      await expect(page.locator('#strokes')).toBeHidden();
      await page.evaluate(() => {
        window.game!.chooseCourse('The Links');
        window.game!.step(60);
      });
      if (where !== 'on a phone') {
        // a desk has no chip, no scrim and no button to shut a panel that stays where it is
        await expect(page.locator('#holeChip')).toBeHidden();
        await expect(page.locator('#strokes')).toBeVisible();
        await expect(page.locator('#holeInfoClose')).toBeHidden();
        await expect(page.locator('#pin')).toBeVisible();
        expect(problems).toEqual([]);
        return;
      }
      const { width, height } = page.viewportSize()!;
      const settle = () =>
        page.evaluate(() => {
          for (const a of document.getAnimations()) a.finish();
        });
      // the chip says which hole and how many strokes, and the panel is out of sight with its words out of reach
      const chip = page.locator('#holeChip');
      await expect(chip).toBeVisible();
      await expect(chip).toContainText('Hole 1');
      await expect(chip).toContainText('0 strokes');
      await expect(page.locator('#strokes')).toBeHidden();
      await expect(page.locator('#pin')).toBeHidden();
      await expect(page.locator('#drawerScrim')).toBeHidden();
      await expect(page.locator('#holeInfoOpen')).toHaveAttribute('aria-expanded', 'false');
      // pulled out, it holds the hole's name and par, the strokes, the pin and the wind, whole on the screen, over a dimmed course
      await openDrawer(page);
      await expect(page.locator('#strokes')).toBeVisible();
      await expect(page.locator('#strokes .name')).toHaveText('The Opener');
      for (const id of ['#holePar', '#pin', '#wind', '#holeInfoClose']) await expect(page.locator(id)).toBeVisible();
      await expect(page.locator('#drawerScrim')).toBeVisible();
      await expect(page.locator('#holeInfoOpen')).toHaveAttribute('aria-expanded', 'true');
      const d = (await page.locator('#strokes').boundingBox())!;
      expect(d.x, 'the drawer: left').toBeGreaterThanOrEqual(-0.5);
      expect(d.y, 'the drawer: top').toBeGreaterThanOrEqual(0);
      expect(d.x + d.width, 'the drawer: right').toBeLessThanOrEqual(width + 0.5);
      expect(d.y + d.height, 'the drawer: bottom').toBeLessThanOrEqual(height + 0.5);
      // the drawer is as high as its words and no more: not a wall down the screen, so the course shows beside and below it
      expect(d.height, 'the drawer is as high as its words').toBeLessThan(height * 0.7);
      // shut three ways, each time pulled out again: its button, a tap on the course beside it, and escape
      for (const how of ['its button', 'a tap on the course', 'escape'] as const) {
        if (how === 'its button') await page.locator('#holeInfoClose').click();
        else if (how === 'a tap on the course') await page.mouse.click(width - 6, height / 2);
        else await page.keyboard.press('Escape');
        await settle();
        await expect(page.locator('#strokes'), `shut by ${how}`).toBeHidden();
        await expect(page.locator('#drawerScrim'), `shut by ${how}: no scrim`).toBeHidden();
        await expect(page.locator('#holeInfoOpen'), `shut by ${how}`).toHaveAttribute('aria-expanded', 'false');
        await openDrawer(page);
      }
      // a drag across the course beside the open drawer is never a shot, and a finger's tap there shuts it
      const before = await page.evaluate(() => window.game!.state().strokes);
      await drag(page, { x: width - 40, y: height * 0.6 }, { x: width - 40, y: height * 0.8 }, { touch: true });
      await settle();
      expect(await page.evaluate(() => window.game!.state().strokes), 'no stroke from a drag on the scrim').toBe(
        before,
      );
      await page.touchscreen.tap(width - 6, height / 2);
      await settle();
      await expect(page.locator('#strokes')).toBeHidden();
      // a stroke taken is on the chip, shut, and in the drawer
      await page.evaluate(() => {
        const g = window.game!;
        const shot = g.suggest()!;
        g.shoot(shot.angle, shot.power, shot.club);
        g.step(30);
      });
      await expect(chip).toContainText('1 stroke');
      await expect(chip).not.toContainText('1 strokes');
      await openDrawer(page);
      await expect(page.locator('#strokes b')).toHaveText('1');
      // a new hole puts the drawer away
      await page.evaluate(() => window.game!.startHole(1));
      await settle();
      await expect(page.locator('#strokes')).toBeHidden();
      await expect(chip).toContainText('Hole 2');
      await expect(chip).toContainText('0 strokes');
      // and the start screen has neither
      await page.evaluate(() => window.game!.step(10));
      expect(problems).toEqual([]);
    });

    test("the purse on a hole of golf is the shop's button and nothing to count, and on minigolf has its coins and gems", async ({
      page,
    }) => {
      const problems = watch(page);
      await start(page, { seed: 11, paused: true, screen: true, save: { coins: 130, gems: 1 } });
      const settle = () =>
        page.evaluate(() => {
          for (const a of document.getAnimations()) a.finish();
        });
      await page.evaluate(() => {
        window.game!.chooseCourse('The Meadow');
        window.game!.step(60);
      });
      await settle();
      await expect(page.locator('#purse .coin')).toBeVisible();
      await expect(page.locator('#purse .gem')).toBeVisible();
      await expect(page.locator('#coins')).toHaveText('130');
      const minigolf = (await page.locator('#purse').boundingBox())!;
      await page.evaluate(() => {
        window.game!.chooseCourse('The Links');
        window.game!.step(60);
      });
      await settle();
      await expect(page.locator('#purse .coin')).toBeHidden();
      await expect(page.locator('#purse .gem')).toBeHidden();
      await expect(page.locator('#shopOpen')).toBeVisible();
      const golf = (await page.locator('#purse').boundingBox())!;
      expect(golf.width, 'a purse of the button alone is the narrower').toBeLessThan(minigolf.width - 60);
      // the panel is the button and its edge and no more, so it is as high as it was
      expect(golf.height).toBeCloseTo(minigolf.height, 0);
      // the shop opens from it, and is the shop it always was
      await page.locator('#shopOpen').click();
      await expect(page.locator('#shop')).toBeVisible();
      await expect(page.locator('#shopClubs .club')).not.toHaveCount(0);
      await page.locator('#shopClose').click();
      // and the next minigolf course has the coins and gems back
      await page.evaluate(() => {
        window.game!.chooseCourse('The Meadow');
        window.game!.step(60);
      });
      await settle();
      await expect(page.locator('#purse .coin')).toBeVisible();
      await expect(page.locator('#purse .gem')).toBeVisible();
      expect(problems).toEqual([]);
    });

    test('the pin and the map, on a golf hole: the pin under the strokes, the map at the side, clear of every other panel and the edges, and the longest words for a landing fit the bag', async ({
      page,
    }) => {
      const problems = watch(page);
      await start(page, { seed: 11, paused: true, screen: true });
      await expect(page.locator('#pin')).toBeHidden();
      await expect(page.locator('#holeMap')).toBeHidden();
      await page.evaluate(() => {
        window.game!.chooseCourse('The Links');
        window.game!.startHole(2);
        window.game!.step(60);
      });
      // on a phone the pin is in the drawer, which the chip pulls out; on a desk it is under the strokes
      const drawer = await openDrawer(page);
      await expect(page.locator('#pin')).toBeVisible();
      await expect(page.locator('#holeMap')).toBeVisible();
      // the pin is inside the strokes panel (the drawer, on a phone), which is clear of the purse as it always was
      {
        const strokes = (await page.locator('#strokes').boundingBox())!;
        const pin = (await page.locator('#pin').boundingBox())!;
        expect(pin.x).toBeGreaterThanOrEqual(strokes.x);
        expect(pin.x + pin.width).toBeLessThanOrEqual(strokes.x + strokes.width + 1);
        expect(pin.y + pin.height).toBeLessThanOrEqual(strokes.y + strokes.height + 1);
        expect(strokes.x, 'the strokes panel is on the screen').toBeGreaterThanOrEqual(0);
        if (drawer) await closeDrawer(page);
      }
      // the longest thing the bag says: a club with a long name, a tree in the way, and the longest ground
      await page.locator('#bagClubs button[data-club="pitching-wedge"]').click();
      await page
        .locator('#bagInfo')
        .evaluate(
          (el: HTMLElement) =>
            (el.textContent = 'Pitching wedge \u00b7 hits a tree \u00b7 lands 100 yd \u00b7 putting green'),
        );
      const r = await read(page);
      expect(r.outside, 'nothing past the screen').toEqual([]);
      expect(r.scrollWidth, 'nothing scrolls sideways').toBeLessThanOrEqual(page.viewportSize()!.width);
      expect(r.texts.filter((t) => t.ratio < CONTRAST).map((t) => `"${t.text}" ${t.ratio}:1`)).toEqual([]);
      const box = async (sel: string) => (await page.locator(sel).boundingBox())!;
      const apart = (a: { x: number; y: number; width: number; height: number }, b: typeof a) =>
        a.x + a.width <= b.x || b.x + b.width <= a.x || a.y + a.height <= b.y || b.y + b.height <= a.y;
      const map = await box('#holePanel');
      for (const other of [
        where === 'on a phone' ? '#holeChip' : '#strokes',
        '#purse',
        '#bag',
        '#viewMode',
        '#viewFlag',
        ...(where === 'on a phone' ? [] : ['#help']),
      ])
        expect(apart(map, await box(other)), `the map and ${other} do not overlap`).toBe(true);
      expect(map.x).toBeGreaterThanOrEqual(0);
      expect(map.x + map.width).toBeLessThanOrEqual(page.viewportSize()!.width);
      expect(map.y).toBeGreaterThanOrEqual(0);
      expect(map.y + map.height).toBeLessThanOrEqual(page.viewportSize()!.height);
      if (!drawer)
        expect(apart(await box('#strokes'), await box('#purse')), 'the strokes and the purse do not overlap').toBe(
          true,
        );
      // the words in the bag fit inside it, and it inside the screen
      const info = await box('#bagInfo');
      const bag = await box('#bag');
      expect(info.x).toBeGreaterThanOrEqual(bag.x);
      expect(info.x + info.width).toBeLessThanOrEqual(bag.x + bag.width + 1);
      expect(bag.x).toBeGreaterThanOrEqual(0);
      expect(bag.x + bag.width).toBeLessThanOrEqual(page.viewportSize()!.width);
      // on a hole of minigolf, neither is there
      await page.evaluate(() => {
        window.game!.chooseCourse('The Meadow');
        window.game!.step(60);
      });
      await expect(page.locator('#pin')).toBeHidden();
      await expect(page.locator('#holeMap')).toBeHidden();
      expect(problems).toEqual([]);
    });

    test('the shape and spin buttons and the wind line, on a golf hole: a thumb high and clear in every state, inside the bag and the strokes panel, clear of every other panel and the edges, and away for the putter and on minigolf', async ({
      page,
    }) => {
      const problems = watch(page);
      await start(page, { seed: 11, paused: true, screen: true });
      // a golf hole of the test's own with a gale on it, the most wind there is, which makes the longest words
      await page.evaluate(() => {
        const cols = 41,
          rows = 70;
        const map = Array.from({ length: rows }, (_, r) =>
          Array.from({ length: cols }, (_, c) => {
            if (r === 0 || r === rows - 1 || c === 0 || c === cols - 1) return '#';
            if (r === rows - 4) return c === 20 ? 'T' : c === 19 || c === 21 ? 't' : 'f';
            if (r === 2 && c === 3) return 'C';
            return 'f';
          }).join(''),
        );
        const g = window.game!;
        g.chooseCourse('The Meadow');
        g.playCourse([{ name: 'Gale', par: 4, map, wind: 25 }]);
        g.step(60);
      });
      await expect(page.locator('#bagShaping')).toBeVisible();
      // on a phone the wind is in the drawer, and is read when it is open, below
      await expect(page.locator('#windText')).toHaveText('25 mph');
      const box = async (sel: string) => (await page.locator(sel).boundingBox())!;
      const apart = (a: { x: number; y: number; width: number; height: number }, b: typeof a) =>
        a.x + a.width <= b.x || b.x + b.width <= a.x || a.y + a.height <= b.y || b.y + b.height <= a.y;
      const inside = (a: { x: number; y: number; width: number; height: number }, b: typeof a, what: string) => {
        expect(a.x, `${what}: left`).toBeGreaterThanOrEqual(b.x - 1);
        expect(a.x + a.width, `${what}: right`).toBeLessThanOrEqual(b.x + b.width + 1);
        expect(a.y, `${what}: top`).toBeGreaterThanOrEqual(b.y - 1);
        expect(a.y + a.height, `${what}: bottom`).toBeLessThanOrEqual(b.y + b.height + 1);
      };
      // every state of both buttons, each read: nine in all, from straight and flat round to a fade and topspin; and the
      // arrow on the shape's button, which is drawn from the stylesheet and different for each of the three
      const arrows = new Map<string, string>();
      for (let k = 0; k < 9; k++) {
        const drawn = await page.locator('#shapeButton').evaluate((el) => {
          const s = getComputedStyle(el, '::before');
          return { shape: (el as HTMLElement).dataset.shape!, mask: s.maskImage || s.webkitMaskImage, w: s.width };
        });
        expect(drawn.mask, `shape ${drawn.shape}: an arrow is drawn`).toContain('data:image/svg+xml');
        expect(parseFloat(drawn.w), `shape ${drawn.shape}: the arrow has a size`).toBeGreaterThan(8);
        arrows.set(drawn.shape, drawn.mask);
        const r = await read(page);
        const label = `${await page.locator('#shapeButton').textContent()} / ${await page.locator('#spinButton').textContent()}`;
        expect(r.outside, `${label}: nothing past the screen`).toEqual([]);
        expect(r.scrollWidth, `${label}: nothing scrolls sideways`).toBeLessThanOrEqual(page.viewportSize()!.width);
        expect(r.texts.filter((t) => t.ratio < CONTRAST).map((t) => `"${t.text}" ${t.ratio}:1`)).toEqual([]);
        for (const b of r.buttons.filter((b) => b.text.startsWith('Shape') || b.text.startsWith('Spin')))
          expect(b.height, `the ${b.text} button`).toBeGreaterThanOrEqual(THUMB);
        const bag = await box('#bag');
        inside(await box('#shapeButton'), bag, `${label}: the shape button in the bag`);
        inside(await box('#spinButton'), bag, `${label}: the spin button in the bag`);
        expect(apart(await box('#shapeButton'), await box('#spinButton')), `${label}: the two do not overlap`).toBe(
          true,
        );
        expect(bag.x).toBeGreaterThanOrEqual(0);
        expect(bag.x + bag.width).toBeLessThanOrEqual(page.viewportSize()!.width);
        // pressed again, and again: the shape every press, the spin every third, so nine states go through all of both
        await page.locator('#shapeButton').click();
        if (k % 3 === 2) await page.locator('#spinButton').click();
      }
      expect([...arrows.keys()].sort(), 'a draw, straight and a fade').toEqual(['-1', '0', '1']);
      expect(new Set(arrows.values()).size, 'an arrow of its own for each').toBe(3);
      // the bag, taller for them, is clear of the other panels, and does not reach up into them
      const bag = await box('#bag');
      for (const other of [
        '#viewMode',
        '#viewFlag',
        where === 'on a phone' ? '#holeChip' : '#strokes',
        '#holePanel',
        '#purse',
        ...(where === 'on a phone' ? [] : ['#help']),
      ])
        expect(apart(bag, await box(other)), `the bag and ${other} do not overlap`).toBe(true);
      expect(bag.y, 'the bag is on the screen').toBeGreaterThanOrEqual(0);
      // the wind line is in the strokes panel (the drawer, on a phone), under the pin, which is clear of the purse
      const drawer = await openDrawer(page);
      await expect(page.locator('#wind')).toBeVisible();
      const strokes = await box('#strokes');
      const wind = await box('#wind');
      const pin = await box('#pin');
      inside(wind, strokes, 'the wind in the strokes panel');
      expect(wind.y, 'under the pin').toBeGreaterThanOrEqual(pin.y + pin.height - 1);
      if (!drawer) {
        expect(apart(strokes, await box('#purse')), 'the strokes and the purse do not overlap').toBe(true);
        expect(apart(strokes, await box('#holePanel')), 'the strokes and the map do not overlap').toBe(true);
      }
      // the arrow is there and drawn, and calm has the word only
      const arrow = await box('#windArrow');
      expect(arrow.width).toBeGreaterThan(8);
      inside(arrow, wind, 'the arrow in the wind line');
      if (drawer) await closeDrawer(page);
      // the putter has neither button, and the bag is the shorter for it
      await page.locator('#bagClubs button[data-club="putter"]').click();
      await expect(page.locator('#bagShaping')).toBeHidden();
      expect((await box('#bag')).height).toBeLessThan(bag.height - 40);
      // and on a hole of minigolf neither the buttons nor the wind are there
      await page.evaluate(() => {
        window.game!.chooseCourse('The Meadow');
        window.game!.step(60);
      });
      await expect(page.locator('#bagShaping')).toBeHidden();
      await expect(page.locator('#wind')).toBeHidden();
      expect(problems).toEqual([]);
    });

    test('the map is put away under the start screen, from the card of a round of golf, and is back with the next course of golf', async ({
      page,
    }) => {
      const problems = watch(page);
      await start(page, { seed: 11, paused: true, screen: true });
      await page.evaluate(() => {
        window.game!.chooseCourse('The Links');
        window.game!.step(60);
      });
      await expect(page.locator('#holeMap')).toBeVisible();
      expect((await toCard(page)).phase, 'the round over').toBe('over');
      await expect(page.locator('#card')).toBeVisible();
      await page.locator('#cardCourses').click();
      await expect(page.locator('#start')).toBeVisible();
      await expect(page.locator('#holeMap'), 'no map over the start screen').toBeHidden();
      await expect(page.locator('#bag')).toBeHidden();
      await page.locator('#start .course', { hasText: 'The Links' }).click();
      await page.evaluate(() => window.game!.step(60));
      await expect(page.locator('#holeMap')).toBeVisible();
      await openDrawer(page);
      await expect(page.locator('#pin')).toBeVisible();
      expect(problems).toEqual([]);
    });

    test("a hole done: its score's name, large, over the course, until the next hole begins", async ({ page }) => {
      const problems = watch(page);
      await start(page, { seed: 11, paused: true });
      const done = await holeOut(page);
      expect(done.phase).toBe('done');
      const toast = page.locator('#toast');
      await expect(toast).toBeVisible();
      await expect(toast).toHaveText(scoreName(done.card[0], done.par));
      await expect(toast).toHaveAttribute('data-kind', scoreKind(done.card[0], done.par));
      const size = await toast.evaluate((el) => parseFloat(getComputedStyle(el).fontSize));
      // larger by far than anything else over the course: a word to be read from across the room
      expect(size, 'named large').toBeGreaterThanOrEqual(where === 'on a phone' ? 36 : 48);
      expect((await read(page)).outside, 'and all of it on the screen').toEqual([]);
      await page.evaluate(() => window.game!.step(150));
      expect(await page.evaluate(() => window.game!.state().hole), 'the next hole begun').toBe(1);
      await expect(toast).toBeHidden();
      expect(problems).toEqual([]);
    });
  });
}

/** What moved as the page did one thing: each animation on a panel or in one, as it started. */
interface Motion {
  panel: string;
  what: string;
  ms: number;
  easing: string;
}

/** The things a player does, or the game does, that bring a panel or take one away. */
type Act = 'choose' | 'shop' | 'close' | 'hole' | 'next' | 'last' | 'card' | 'courses';

/**
 * One thing done on the page, with every motion before it finished first,
 * and the motions it started: the course chosen, the shop opened or
 * closed, a hole played out, the next begun, the last hole played out, the
 * card after it, and the card's way back to the start screen.
 */
function act(page: Page, what: Act): Promise<Motion[]> {
  return page.evaluate((what) => {
    for (const a of document.getAnimations()) a.finish();
    // the page's style worked out again with every motion at its end, so what is done next moves from there, as it
    // would a frame later; without it, a panel put away in the same moment its arrival was finished never leaves
    document.body.getBoundingClientRect();
    const g = window.game!;
    const playOut = () => {
      for (let s = 0; s < 12 && g.state().phase === 'play'; s++) {
        const shot = g.suggest();
        if (shot) g.shoot(shot.angle, shot.power);
        for (let f = 0; f < 900 && g.state().phase === 'play' && !g.state().ready; f++) g.step(1);
      }
    };
    if (what === 'choose') g.chooseCourse('The Meadow');
    else if (what === 'shop') document.getElementById('shopOpen')!.click();
    else if (what === 'close') document.getElementById('shopClose')!.click();
    else if (what === 'hole') playOut();
    else if (what === 'next' || what === 'card') g.step(150);
    else if (what === 'last') {
      g.startHole(g.content().holes.length - 1);
      playOut();
    } else document.getElementById('cardCourses')!.click();
    return document.getAnimations().flatMap((a) => {
      const effect = a.effect instanceof KeyframeEffect ? a.effect : null;
      const panel = effect?.target?.closest('.panel');
      if (!effect || !panel) return [];
      const what =
        a instanceof CSSTransition ? a.transitionProperty : a instanceof CSSAnimation ? a.animationName : 'script';
      return [
        {
          panel: panel.id,
          what,
          ms: Number(effect.getComputedTiming().endTime),
          easing: effect.getTiming().easing ?? '',
        },
      ];
    });
  }, what);
}

/** Each panel that moved, by id. */
const panelsIn = (m: Motion[]) => [...new Set(m.map((x) => x.panel))].sort();

/** The panels each thing done brings or takes away, in the order a round goes, from the start screen and back. */
const ROUND: [Act, string[]][] = [
  ['choose', ['help', 'purse', 'start', 'strokes', 'viewMode']],
  ['shop', ['shop']],
  ['close', ['shop']],
  ['hole', ['toast']],
  ['next', ['toast']],
  ['last', ['toast']],
  ['card', ['card', 'toast']],
  ['courses', ['card', 'help', 'purse', 'start', 'strokes', 'viewMode']],
];

test.describe('motion', () => {
  test('every panel arrives with a spring and leaves quickly, through a whole round', async ({ page }) => {
    const problems = watch(page);
    await start(page, { seed: 11, paused: true, screen: true });
    for (const [what, panels] of ROUND) {
      const moved = await act(page, what);
      expect(panelsIn(moved), `what moves as the page does "${what}"`).toEqual([...panels].sort());
      // short: a player is never kept waiting on a panel
      expect(
        moved.filter((m) => m.ms > 700),
        `nothing long as the page does "${what}"`,
      ).toEqual([]);
    }
    // a spring overshoots and comes back: a panel arriving grows past its size, along a curve that goes above one
    const grows = (await act(page, 'choose')).filter((m) => m.panel === 'strokes' && m.what === 'scale');
    expect(grows.length, 'the hole and strokes arrive by growing').toBe(1);
    const values = grows[0].easing.match(/-?\d*\.?\d+(?=[\s,)])/g) ?? [];
    expect(Math.max(0, ...values.map(Number)), `past its size and back: ${grows[0].easing}`).toBeGreaterThan(1);
    expect(problems).toEqual([]);
  });

  test('under reduced motion, no panel moves at all: each is there, or gone, at once', async ({ page }) => {
    const problems = watch(page);
    await page.emulateMedia({ reducedMotion: 'reduce' });
    await start(page, { seed: 11, paused: true, screen: true });
    for (const [what] of ROUND) {
      expect(await act(page, what), `nothing moves as the page does "${what}"`).toEqual([]);
      // and nothing in the stylesheet would, on any panel shown or not, or anything in one
      const set = await page.evaluate(() =>
        Array.from(document.querySelectorAll('.panel, .panel *')).flatMap((el) => {
          const s = getComputedStyle(el);
          const still =
            s.transitionDuration.split(',').every((d) => parseFloat(d) === 0) &&
            s.animationName.split(',').every((n) => n.trim() === 'none');
          return still
            ? []
            : [
                `${el.tagName.toLowerCase()}#${el.id}: ${s.transitionProperty} ${s.transitionDuration}, ${s.animationName}`,
              ];
        }),
      );
      expect(set, `nothing set to move after "${what}"`).toEqual([]);
    }
    await expect(page.locator('#start')).toBeVisible();
    expect(problems).toEqual([]);
  });
});

/**
 * Every phone the game is held to, held upright and on its side: the panels over the course must each be whole on the
 * screen and a few pixels from every other, on a golf hole (the most crowded: the bag with its shape and spin, the map, the
 * pin, the wind, the greens and the switch), on a hole of minigolf whose ground leans (the break in words) and under the start
 * screen, the card and the shop. A short screen asks for less of the playfield than a tall one has to spare.
 */
const PHONES = [
  ['280 by 560', 280, 560],
  ['300 by 640', 300, 640],
  ['320 by 568', 320, 568],
  ['340 by 700', 340, 700],
  ['560 by 280', 560, 280],
  ['568 by 320', 568, 320],
  ['580 by 290', 580, 290],
  ['640 by 300', 640, 300],
  ['360 by 640', 360, 640],
  ['375 by 667', 375, 667],
  ['390 by 844', 390, 844],
  ['430 by 932', 430, 932],
  ['640 by 360', 640, 360],
  ['740 by 360', 740, 360],
  ['812 by 375', 812, 375],
  ['932 by 430', 932, 430],
] as const;

/** The air between two panels, in pixels, that a thumb and an eye need to tell them apart. */
const AIR = 4;

/** What the shape and spin buttons may be on a screen too short for the bag's rows to be a thumb each. */
const SHORT_THUMB = 36;

interface Rect {
  x: number;
  y: number;
  width: number;
  height: number;
}

/** Each panel of the chrome that is up, with where it is; and the buttons and what reaches past the page. */
async function chrome(page: Page) {
  return page.evaluate(() => {
    for (const a of document.getAnimations()) a.finish();
    const ids = ['holeChip', 'strokes', 'purse', 'holePanel', 'bag', 'viewMode', 'help', 'stats'];
    const rects: Record<string, Rect> = {};
    for (const id of ids) {
      const el = document.getElementById(id)!;
      if (!el.checkVisibility({ visibilityProperty: true })) continue;
      const b = el.getBoundingClientRect();
      rects[id] = { x: b.x, y: b.y, width: b.width, height: b.height };
    }
    return { rects, width: innerWidth, height: innerHeight, air: 0 };
  });
}

/** The pairs of panels that overlap or stand closer than `AIR`, and the panels that are not wholly on the screen, in words. */
function crowding(c: Awaited<ReturnType<typeof chrome>>): string[] {
  const out: string[] = [];
  const names = Object.keys(c.rects);
  const at = (r: Rect) => `${Math.round(r.x)},${Math.round(r.y)} ${Math.round(r.width)}x${Math.round(r.height)}`;
  for (const n of names) {
    const r = c.rects[n];
    if (r.x < 0 || r.y < 0 || r.x + r.width > c.width + 0.5 || r.y + r.height > c.height + 0.5)
      out.push(`#${n} (${at(r)}) is not on the ${c.width}x${c.height} screen`);
  }
  for (let i = 0; i < names.length; i++)
    for (let j = i + 1; j < names.length; j++) {
      const a = c.rects[names[i]],
        b = c.rects[names[j]];
      const gapX = Math.max(b.x - (a.x + a.width), a.x - (b.x + b.width));
      const gapY = Math.max(b.y - (a.y + a.height), a.y - (b.y + b.height));
      if (Math.max(gapX, gapY) < c.air)
        out.push(`#${names[i]} (${at(a)}) and #${names[j]} (${at(b)}) are less than ${c.air.toFixed(1)}px apart`);
    }
  return out;
}

for (const [label, width, height] of PHONES) {
  test.describe(`on a ${label} phone`, () => {
    test.use({ viewport: { width, height }, hasTouch: true, isMobile: true });
    const short = height <= 500;
    // a thumb high, but the shape and spin on a short screen, where three rows of thumbs are most of its height, and a club
    // round and as wide as the row of eight allows
    const thumbOf = (text: string) =>
      CLUBS.includes(text)
        ? CLUB_LEAST
        : (text.startsWith('Shape') || text.startsWith('Spin')) && short
          ? SHORT_THUMB
          : THUMB;

    test('the panels are whole, apart and read well on a golf hole, on a hole of minigolf whose ground leans, and under the start screen, the card and the shop', async ({
      page,
    }) => {
      const problems = watch(page);
      await start(page, { seed: 11, paused: true, screen: true });
      const fine = async (what: string) => {
        // the longest name any hole has, in the strokes panel, which is what stands nearest the switch on a narrow phone
        await page.evaluate(() => {
          const names = window.game!.content().holes.map((h) => h.name);
          const longest = names.reduce((a, b) => (b.length > a.length ? b : a), '');
          document.querySelector('#holeName .name')!.textContent = longest;
        });
        const c = await chrome(page);
        const r = await read(page);
        c.air = AIR * r.ui;
        expect.soft(crowding(c), `${what}: crowding`).toEqual([]);
        expect.soft(r.outside, `${what}: past the screen`).toEqual([]);
        expect(r.scrollWidth, `${what}: scrolls sideways`).toBeLessThanOrEqual(width);
        expect(
          r.texts.filter((t) => t.ratio < CONTRAST).map((t) => `"${t.text}" ${t.ratio}:1`),
          `${what}: faint words`,
        ).toEqual([]);
        // a thumb high, but the shape and spin on a short screen, where three rows of thumbs are most of its height
        expect
          .soft(
            r.buttons.filter((b) => b.height < thumbOf(b.text)),
            `${what}: small buttons`,
          )
          .toEqual([]);
        return c;
      };
      // the words and the buttons of a screen over the course, read: the start screen, the shop and the card
      const readable = async (what: string) => {
        const r = await read(page);
        expect.soft(r.outside, `${what}: past the screen`).toEqual([]);
        expect
          .soft(
            r.texts.filter((t) => t.ratio < CONTRAST).map((t) => `"${t.text}" ${t.ratio}:1`),
            `${what}: faint words`,
          )
          .toEqual([]);
        expect
          .soft(
            r.buttons.filter((b) => b.height < thumbOf(b.text)),
            `${what}: small buttons`,
          )
          .toEqual([]);
      };
      // the start screen: whole on the screen, scrolling inside itself where it must
      await readable('the start screen');
      const rect = (sel: string) => page.locator(sel).evaluate((el) => el.getBoundingClientRect().toJSON() as Rect);
      let box = await rect('#start');
      expect(box.x, 'the start screen: left').toBeGreaterThanOrEqual(0);
      expect(box.y, 'the start screen: top').toBeGreaterThanOrEqual(0);
      expect(box.x + box.width, 'the start screen: right').toBeLessThanOrEqual(width + 0.5);
      expect(box.y + box.height, 'the start screen: bottom').toBeLessThanOrEqual(height + 0.5);
      // minigolf on a slope: the break is drawn and told, the longest the strokes panel gets
      await page.evaluate((hole) => {
        window.game!.chooseCourse('The Meadow');
        window.game!.playCourse([hole]);
        window.game!.step(60);
      }, SIDE_HILL);
      await page.locator('#putt').evaluate((el: HTMLElement) => {
        el.hidden = false;
        el.textContent = 'breaks left, 14 ft uphill';
      });
      await fine('minigolf on a slope');
      await page.evaluate(() => {
        window.game!.chooseCourse('The Meadow');
        window.game!.step(60);
      });
      await fine('minigolf');
      // golf, with the longest of everything: a shape and a spin chosen, the longest words for a landing, the wind
      await page.evaluate(() => {
        window.game!.chooseCourse('The Links');
        window.game!.startHole(2);
        window.game!.step(300);
      });
      await page.locator('#shapeButton').click({ timeout: 5000 });
      await page.locator('#spinButton').click({ timeout: 5000 });
      await page
        .locator('#bagInfo')
        .evaluate(
          (el: HTMLElement) => (el.textContent = 'Pitching wedge · hits a tree · lands 100 yd · putting green'),
        );
      const golf = await fine('golf');
      expect(Object.keys(golf.rects), 'the golf hole shows the chip, the purse, the bag and the switch').toEqual(
        expect.arrayContaining(['holeChip', 'purse', 'bag', 'viewMode']),
      );
      expect(Object.keys(golf.rects), "the hole's panel is a drawer, shut").not.toContain('strokes');
      expect(Object.keys(golf.rects), 'a phone is not given the instruction to drag back').not.toContain('help');
      // the switch stands under the coins and the shop, at the right edge, and at least a pillow of air from the purse
      const sw = golf.rects.viewMode,
        pu = golf.rects.purse;
      expect(sw.y - (pu.y + pu.height), 'the switch under the purse').toBeGreaterThanOrEqual(
        AIR * (await read(page)).ui,
      );
      expect(width - (sw.x + sw.width), 'the switch and the purse share the right edge').toBeCloseTo(
        width - (pu.x + pu.width),
        0,
      );
      // the drawer, pulled out with the longest of everything in it: whole on the screen, nothing scrolling inside it, its
      // words clear and its button a thumb, over a course whose other panels are dimmed and out of its way
      await page.locator('#putt').evaluate((el: HTMLElement) => {
        el.hidden = false;
        el.textContent = 'Putt: aim 14.5 yd left, uphill 12.5 yd';
      });
      await page.locator('#greens').evaluate((el: HTMLElement) => {
        el.hidden = false;
        el.textContent = 'Medium greens';
      });
      await openDrawer(page);
      const dr = await read(page);
      const drawerBox = await rect('#strokes');
      expect(drawerBox.x, 'the drawer: left').toBeGreaterThanOrEqual(-0.5);
      expect(drawerBox.y, 'the drawer: top').toBeGreaterThanOrEqual(0);
      expect(drawerBox.x + drawerBox.width, 'the drawer: right').toBeLessThanOrEqual(width + 0.5);
      expect(drawerBox.y + drawerBox.height, 'the drawer: bottom').toBeLessThanOrEqual(height + 0.5);
      expect(
        await page.locator('#strokes').evaluate((el) => el.scrollHeight - el.clientHeight),
        'the drawer does not scroll',
      ).toBeLessThanOrEqual(1);
      expect.soft(dr.outside, 'the open drawer: past the screen').toEqual([]);
      expect
        .soft(
          dr.texts.filter((t) => t.ratio < CONTRAST).map((t) => `"${t.text}" ${t.ratio}:1`),
          'the open drawer: faint words',
        )
        .toEqual([]);
      expect(
        dr.buttons.find((b) => b.text === '')?.height ?? THUMB,
        'the drawer: its button is a thumb',
      ).toBeGreaterThanOrEqual(THUMB);
      await closeDrawer(page);
      // the shop and the card, from a hole finished
      await page.locator('#shopOpen').click({ timeout: 5000 });
      await readable('the shop');
      box = await rect('#shop');
      expect(box.x, 'the shop: left').toBeGreaterThanOrEqual(0);
      expect(box.y, 'the shop: top').toBeGreaterThanOrEqual(0);
      expect(box.x + box.width, 'the shop: right').toBeLessThanOrEqual(width + 0.5);
      expect(box.y + box.height, 'the shop: bottom').toBeLessThanOrEqual(height + 0.5);
      await page.locator('#shopClose').click({ timeout: 5000 });
      expect((await toCard(page)).phase, 'the round over').toBe('over');
      await readable('the card');
      box = await rect('#card');
      expect(box.x, 'the card: left').toBeGreaterThanOrEqual(0);
      expect(box.y, 'the card: top').toBeGreaterThanOrEqual(0);
      expect(box.x + box.width, 'the card: right').toBeLessThanOrEqual(width + 0.5);
      expect(box.y + box.height, 'the card: bottom').toBeLessThanOrEqual(height + 0.5);
      expect(problems).toEqual([]);
    });
  });
}
