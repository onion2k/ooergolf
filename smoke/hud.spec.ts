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
import { start, watch } from './game';
import { CONTRAST, THUMB, holeOut, read, toCard } from './panels';

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
