/**
 * The tournament's screens as the hud draws them, handed fixed figures through the test API, on a desk and a phone: the
 * event card on the start screen with its order of merit, Enter and Practise, Enter refused with its words when the coins
 * are short, the picker as it was once no event is shown, the leaderboard in the hole's panel (in the drawer on a phone),
 * and the card at an event's end. Each is held to the panels' rules: nothing past the screen's edges, every word clear
 * against its panel and every button a thumb, and the start screen not scrolling. The game is not wired to the season
 * here, so this holds the drawing and nothing of what fills it.
 */
import { expect, test, type Page } from '@playwright/test';
import type { Board, EventCard, Results } from '../src/hud';
import { start } from './game';
import { CONTRAST, THUMB, openDrawer, read } from './panels';

const DESKTOP = { viewport: { width: 1280, height: 800 } };
const PHONE = { viewport: { width: 400, height: 860 }, hasTouch: true, isMobile: true };
const SIDEWAYS = { viewport: { width: 860, height: 400 }, hasTouch: true, isMobile: true };
const SHOTS = process.env.TOURNAMENT_SHOTS;

const golf = (coins: number): EventCard => ({
  tour: 'golf',
  grade: 'club',
  event: 2,
  events: 6,
  course: 'The Heath',
  par: 32,
  fee: 33,
  pot: 396,
  paid: 3,
  coins,
  merit: [
    { place: 1, tied: false, name: 'Mo Mulligan', points: 25, you: false },
    { place: 2, tied: true, name: 'Fern Gully', points: 18, you: false },
    { place: 2, tied: true, name: 'You', points: 18, you: true },
    { place: 4, tied: false, name: 'Bunker Hill', points: 12, you: false },
  ],
  promoted: 3,
});
const mini: EventCard = {
  ...golf(500),
  tour: 'mini',
  grade: 'county',
  event: 1,
  events: 3,
  course: 'The Meadow',
  par: 26,
  fee: 25,
  pot: 300,
  merit: [],
};
const BOARD: Board = {
  thru: 5,
  rows: [
    { place: 1, tied: false, name: 'Fern Gully', toPar: -3, you: false },
    { place: 2, tied: false, name: 'Mo Mulligan', toPar: -2, you: false },
    { place: 3, tied: true, name: 'Dot Divot', toPar: -1, you: false },
    { place: 3, tied: true, name: 'You', toPar: -1, you: true },
  ],
  cut: -1,
  behind: 8,
};
const RESULTS: Results = {
  course: 'The Heath',
  place: 2,
  tied: false,
  prize: 118,
  rows: [
    { place: 1, tied: false, name: 'Fern Gully', total: 28, you: false },
    { place: 2, tied: false, name: 'You', total: 29, you: true },
    { place: 3, tied: false, name: 'Mo Mulligan', total: 30, you: false },
    { place: 4, tied: false, name: 'Bunker Hill', total: 31, you: false },
  ],
  meritFrom: 3,
  meritTo: 2,
  seasonOver: true,
  promotedTo: 'county',
  title: false,
};

/** What is wrong with the screen as it stands: words too faint, buttons too small, anything past an edge. */
async function faults(page: Page, screen: string): Promise<string[]> {
  const r = await read(page);
  return [
    ...r.texts.filter((t) => t.ratio < CONTRAST).map((t) => `${screen}: "${t.text}" ${t.ratio}:1`),
    ...r.buttons.filter((b) => b.height < THUMB).map((b) => `${screen}: "${b.text}" ${b.height} px high`),
    ...r.outside.map((o) => `${screen}: ${o}`),
  ];
}

/** Whether the start screen scrolls, which it must not on any screen the picker was laid out for. */
const scrolls = (page: Page) =>
  page.evaluate(() => {
    const s = document.getElementById('start')!;
    return s.scrollHeight > s.clientHeight + 1;
  });

async function shot(page: Page, name: string) {
  if (SHOTS) await page.screenshot({ path: `${SHOTS}/${name}.png` });
}

for (const [where, device] of [
  ['desk', DESKTOP],
  ['phone', PHONE],
] as const) {
  test.describe(`on a ${where}`, () => {
    test.use(device);

    test("the event card stands in for the picker's course, Enter is refused short of coins, and no event is the picker as it was", async ({
      page,
    }) => {
      await start(page, { seed: 3, paused: true, screen: true });
      const before = await page.evaluate(() => document.getElementById('start')!.innerText);
      await page.evaluate((cards) => window.game!.tournamentHud({ events: cards }), { golf: golf(140), mini });
      await expect(page.locator('#courseName')).toHaveText('The Heath');
      await expect(page.locator('#courseEvent')).toHaveText('Club tour · Event 2 of 6');
      await expect(page.locator('#courseStats')).toContainText('Entry');
      await expect(page.locator('#enterEvent')).toHaveText('Enter · 33');
      await expect(page.locator('#enterEvent')).toBeEnabled();
      await expect(page.locator('#practise')).toBeVisible();
      await expect(page.locator('#playCourse')).toBeHidden();
      await expect(page.locator('#courseNext')).toBeHidden();
      await expect(page.locator('#merit tr.you')).toHaveText(/T2\s*You\s*18/);
      await expect(page.locator('#meritLine')).toHaveText('Top 3 after 6 events go up to the County tour');
      expect(await faults(page, 'event card')).toEqual([]);
      expect(await scrolls(page), 'the start screen scrolls').toBe(false);
      await shot(page, `${where}-event`);
      // the other tab is the other tour's event, with its own course
      await page.locator('#tab-minigolf').click();
      await expect(page.locator('#courseName')).toHaveText('The Meadow');
      await expect(page.locator('#courseEvent')).toHaveText('County tour · Event 1 of 3');
      await page.locator('#tab-golf').click();
      // short of coins: Enter refused, and said why
      await page.evaluate((cards) => window.game!.tournamentHud({ events: cards }), { golf: golf(20) });
      await expect(page.locator('#enterEvent')).toBeDisabled();
      await expect(page.locator('#enterNote')).toHaveText('You need 33 coins');
      expect(await faults(page, 'event card short')).toEqual([]);
      expect(await scrolls(page), 'the start screen scrolls short of coins').toBe(false);
      await shot(page, `${where}-event-short`);
      // no event: the picker is as it was, left on the event's course, which the arrows step from as ever
      await page.evaluate(() => window.game!.tournamentHud({ events: null }));
      await expect(page.locator('#enterEvent')).toBeHidden();
      await expect(page.locator('#merit')).toBeHidden();
      await expect(page.locator('#courseName')).toHaveText('The Heath');
      await page.locator('#coursePrev').click();
      expect(await page.evaluate(() => document.getElementById('start')!.innerText)).toBe(before);
    });

    test('the leaderboard stands in the hole panel, in the drawer on a phone', async ({ page }) => {
      await start(page, { seed: 3, paused: true });
      await page.evaluate((board) => window.game!.tournamentHud({ board }), BOARD);
      await openDrawer(page);
      await expect(page.locator('#board')).toBeVisible();
      await expect(page.locator('#boardHead')).toHaveText('Leaderboard · thru 5');
      await expect(page.locator('#board tr.you')).toHaveText(/T3\s*You\s*−1/);
      await expect(page.locator('#boardCut')).toHaveText('cut −1 · 8 behind you');
      expect(await faults(page, 'board')).toEqual([]);
      await shot(page, `${where}-board`);
      await page.evaluate(() => window.game!.tournamentHud({ board: null }));
      await expect(page.locator('#board')).toBeHidden();
    });

    test("the card at an event's end says the place, the field, the order of merit and the season, with Next event", async ({
      page,
    }) => {
      await start(page, { seed: 3, paused: true });
      await page.evaluate((results) => window.game!.tournamentHud({ results }), RESULTS);
      await expect(page.locator('#card h2')).toHaveText('The Heath');
      await expect(page.locator('#cardPrize')).toHaveText('2nd · 118 coins');
      await expect(page.locator('#cardResults tr.you')).toHaveText(/2\s*You\s*29/);
      await expect(page.locator('#meritMove')).toHaveText('Order of merit: 3rd → 2nd');
      await expect(page.locator('#seasonLine')).toHaveText('Season over: up to the County tour');
      await expect(page.locator('#nextEvent')).toBeVisible();
      await expect(page.locator('#again')).toBeHidden();
      expect(await faults(page, 'results')).toEqual([]);
      await shot(page, `${where}-results`);
      // a round with no event's results is the card as it always was
      await page.evaluate(() => window.game!.tournamentHud({ results: null }));
      await expect(page.locator('#card h2')).toHaveText('The card');
      await expect(page.locator('#again')).toBeVisible();
      await expect(page.locator('#nextEvent')).toBeHidden();
    });
  });
}

test.describe('on a phone on its side', () => {
  test.use(SIDEWAYS);
  test('the event card reaches past no edge', async ({ page }) => {
    await start(page, { seed: 3, paused: true, screen: true });
    await page.evaluate((cards) => window.game!.tournamentHud({ events: cards }), { golf: golf(140) });
    expect((await read(page)).outside).toEqual([]);
    await shot(page, 'sideways-event');
  });
});
