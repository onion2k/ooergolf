/** The title screen on its panel: when the panel is let go, and that a page stopped on it stays stopped. Fakes for the DOM, so no page. */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { TITLE } from '../src/title';
import { titlePage } from '../src/titlepage';

/** A panel and a picture as far as the title reads them, and the picture's decode in the test's hands. */
function fakes() {
  const classes = new Set<string>();
  const boot = {
    classList: { add: (c: string) => classes.add(c), remove: (c: string) => classes.delete(c) },
    style: { setProperty: () => {} },
  } as unknown as HTMLElement;
  let settle = (_ok: boolean) => {};
  const img = {
    hidden: false,
    decode: () => new Promise<void>((res, rej) => (settle = (ok) => (ok ? res() : rej(new Error('no picture'))))),
  } as unknown as HTMLImageElement;
  return { boot, img, classes, decoded: (ok = true) => settle(ok) };
}

describe('the title page', () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  it('lets the panel go only once the fade-in is over, when the game is ready before that', async () => {
    const f = fakes();
    let t = 1000;
    const page = titlePage(f.boot, f.img, false, false, () => t);
    f.decoded();
    await vi.advanceTimersByTimeAsync(0);
    expect(f.classes.has('shown')).toBe(true);
    t = 1200;
    page.leave();
    expect(f.classes.has('gone'), 'not yet').toBe(false);
    await vi.advanceTimersByTimeAsync(TITLE.fadeIn - 200 - 1);
    expect(f.classes.has('gone'), 'still not, a millisecond short').toBe(false);
    await vi.advanceTimersByTimeAsync(1);
    expect(f.classes.has('gone')).toBe(true);
  });

  it('does not wait for a picture that has not decoded, and never shows it after', async () => {
    const f = fakes();
    const page = titlePage(f.boot, f.img, false, false, () => 0);
    page.leave();
    expect(f.classes.has('gone')).toBe(true);
    f.decoded();
    await vi.advanceTimersByTimeAsync(0);
    expect(f.classes.has('shown')).toBe(false);
  });

  it('leaves the panel plain, and goes at once, when the picture cannot be had', async () => {
    const f = fakes();
    const page = titlePage(f.boot, f.img, false, false, () => 0);
    f.decoded(false);
    await vi.advanceTimersByTimeAsync(0);
    expect(f.img.hidden).toBe(true);
    page.leave();
    expect(f.classes.has('gone')).toBe(true);
  });

  it('never lets the panel go once the page has stopped on it, even with its exit already on its way', async () => {
    const f = fakes();
    let t = 0;
    const page = titlePage(f.boot, f.img, false, false, () => t);
    f.decoded();
    await vi.advanceTimersByTimeAsync(0);
    t = 100;
    page.leave();
    page.hold();
    await vi.advanceTimersByTimeAsync(TITLE.fadeIn * 2);
    expect(f.classes.has('gone')).toBe(false);
  });
});
