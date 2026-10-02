/**
 * The words over the course, read as a player's eyes and thumbs meet them:
 * each text's contrast against the panel it is on, anything that reaches
 * past the sides of the screen, and each button's height. The pictures in
 * `look.spec.ts` show what the panels look like; these are the figures a
 * picture cannot hold, so a panel made see-through again, or a line that
 * runs off a phone, fails a test and not only a look.
 *
 * Also the ways to the screens they are read on, played by the autopilot
 * through the test API, so each is reached as a player reaches it.
 */
import type { Page } from '@playwright/test';

/** What a text needs against its panel: WCAG's AA for body text, held for text of every size. */
export const CONTRAST = 4.5;
/** A thumb's height, in CSS pixels: the least a button may be. */
export const THUMB = 44;
/**
 * The least a club's round button may be across on a phone, in the panel's own pixels. The bag's eight stand in a row
 * across a screen of 360, which leaves 35.9 each between its margins, and a thumb is 44: they are a thumb wide on a desk
 * and as wide as the row allows on a phone, where the row is as wide as the screen was laid out for.
 */
export const CLUB_LEAST = 35;
/** The names of the eight clubs on the bag's buttons. */
export const CLUBS = ['Dr', '3W', '5i', '7i', '9i', 'PW', 'SW', 'Pt'];

export interface Reading {
  /** Each text that is up, with its contrast against what is behind it. */
  texts: { text: string; ratio: number; colour: string; behind: string }[];
  /** Anything up that reaches past a side of the screen, and how far. */
  outside: string[];
  /** Each button that is up, and how high it is in the panel's own pixels: on a screen too small for the panels they are scaled by `ui`, so a button is a thumb when this is, however small it is drawn. */
  buttons: { text: string; height: number }[];
  /** The panels that are up, by id. */
  panels: string[];
  /** How much the panels are scaled down on this screen: one on every screen they were laid out for. */
  ui: number;
  /** How wide the page scrolls. */
  scrollWidth: number;
}

/**
 * Every panel that is up read, with its motion finished first, since the
 * panels spring in on the wall clock and what is read is where they come
 * to rest.
 */
export function read(page: Page): Promise<Reading> {
  return page.evaluate(() => {
    for (const a of document.getAnimations()) a.finish();
    const rgba = (c: string): [number, number, number, number] => {
      const m = /^rgba?\(([\d.]+),\s*([\d.]+),\s*([\d.]+)(?:,\s*([\d.]+))?\)$/.exec(c);
      if (!m) throw new Error(`a colour this test cannot read: ${c}`);
      const alpha = m[4] as string | undefined;
      return [+m[1], +m[2], +m[3], alpha === undefined ? 1 : +alpha];
    };
    const linear = (v: number) => {
      const s = v / 255;
      return s <= 0.04045 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
    };
    const luminance = (c: number[]) => 0.2126 * linear(c[0]) + 0.7152 * linear(c[1]) + 0.0722 * linear(c[2]);
    // the colour behind a thing is the nearest painted one; a see-through one has the course behind it, which is any
    // colour at all, so it is no background, and neither is a faded one
    const behind = (from: Element): number[] | string => {
      for (let el: Element | null = from; el; el = el.parentElement) {
        const style = getComputedStyle(el);
        if (+style.opacity < 1) return `faded to ${style.opacity}`;
        const c = rgba(style.backgroundColor);
        if (c[3] === 0) continue;
        return c[3] < 1 ? `see-through at ${c[3]}` : c;
      }
      return 'nothing';
    };
    const ratio = (fg: number[], bg: number[]) => {
      // a see-through text is its colour laid over what is behind it
      const a = fg[3];
      const laid = [0, 1, 2].map((i) => fg[i] * a + bg[i] * (1 - a));
      const [hi, lo] = [luminance(laid), luminance(bg)].sort((x, y) => y - x);
      return (hi + 0.05) / (lo + 0.05);
    };
    const up = Array.from(document.querySelectorAll<HTMLElement>('.panel')).filter((p) =>
      p.checkVisibility({ visibilityProperty: true }),
    );
    const ui = parseFloat(getComputedStyle(document.documentElement).getPropertyValue('--ui')) || 1;
    const reading: Reading = {
      ui,
      texts: [],
      outside: [],
      buttons: [],
      panels: up.map((p) => p.id),
      scrollWidth: document.documentElement.scrollWidth,
    };
    const measure = (text: string, colour: string, from: Element) => {
      const bg = behind(from);
      const fg = rgba(colour);
      reading.texts.push(
        typeof bg === 'string'
          ? { text, ratio: 0, colour, behind: bg }
          : { text, ratio: Math.round(ratio(fg, bg) * 100) / 100, colour, behind: `rgb(${bg.slice(0, 3).join(', ')})` },
      );
    };
    for (const panel of up) {
      for (const el of [panel, ...Array.from(panel.querySelectorAll('*'))]) {
        if (!el.checkVisibility({ visibilityProperty: true })) continue;
        const box = el.getBoundingClientRect();
        if (box.width > 0 && (box.left < -0.5 || box.right > innerWidth + 0.5))
          reading.outside.push(
            `${el.tagName.toLowerCase()}${el.id ? `#${el.id}` : ''} "${el.textContent.trim().slice(0, 30)}" from ${Math.round(box.left)} to ${Math.round(box.right)} of ${innerWidth}`,
          );
        if (el instanceof HTMLButtonElement)
          reading.buttons.push({ text: el.textContent.trim(), height: Math.round((box.height / ui) * 10) / 10 });
        const own = Array.from(el.childNodes)
          .filter((n) => n.nodeType === Node.TEXT_NODE)
          .map((n) => n.textContent ?? '')
          .join('')
          .trim();
        if (own) measure(own, getComputedStyle(el).color, el);
        // words the stylesheet writes are words too
        for (const pseudo of ['::before', '::after']) {
          const style = getComputedStyle(el, pseudo);
          const content = style.content;
          if (content === 'none' || content === 'normal' || !/[^"'\s]/.test(content)) continue;
          measure(`${own || el.tagName.toLowerCase()}${pseudo} ${content}`, style.color, el);
        }
      }
    }
    return reading;
  });
}

/**
 * The hole's drawer pulled out by its chip, on a phone, with its motion finished: true if it did, and false on a screen
 * with no chip, which is a desk, where the pin, the wind and the rest are in the hole's panel as they always were.
 */
export async function openDrawer(page: Page): Promise<boolean> {
  const chip = page.locator('#holeInfoOpen');
  if (!(await chip.isVisible())) return false;
  await chip.click();
  await page.evaluate(() => {
    for (const a of document.getAnimations()) a.finish();
  });
  return true;
}

/** The drawer shut by its own button, and the motion finished. */
export async function closeDrawer(page: Page) {
  await page.locator('#holeInfoClose').click();
  await page.evaluate(() => {
    for (const a of document.getAnimations()) a.finish();
  });
}

/** The ball played to the cup by the autopilot's shots, a frame at a time, until the hole is done. */
export function holeOut(page: Page) {
  return page.evaluate(() => {
    const g = window.game!;
    for (let s = 0; s < 12 && g.state().phase === 'play'; s++) {
      const shot = g.suggest();
      if (shot) g.shoot(shot.angle, shot.power, shot.club);
      for (let f = 0; f < 900 && g.state().phase === 'play' && !g.state().ready; f++) g.step(1);
    }
    return g.state();
  });
}

/** The last hole played out, and the frames after it, to the card at the end of the round. */
export async function toCard(page: Page) {
  await page.evaluate(() => window.game!.startHole(window.game!.content().holes.length - 1));
  await holeOut(page);
  return page.evaluate(() => {
    window.game!.step(150);
    return window.game!.state();
  });
}
