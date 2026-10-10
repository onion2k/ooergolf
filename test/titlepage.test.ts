/** The title screen on its panel: when the panel is let go, and that a page stopped on it stays stopped. Fakes for the DOM, so no page. */
import { describe, expect, it } from 'vitest';
import { titlePage } from '../src/titlepage';

/** A panel as far as the title reads it: its classes and the properties written to its style. */
function fakes() {
  const classes = new Set<string>();
  const style = new Map<string, string>();
  const boot = {
    classList: { add: (c: string) => classes.add(c), remove: (c: string) => classes.delete(c) },
    style: { setProperty: (k: string, v: string) => style.set(k, v) },
  } as unknown as HTMLElement;
  return { boot, classes, style };
}

/** A panel and its bar as far as the page reads them: the bar's hidden flag and the properties written to it. */
function bars() {
  const f = fakes();
  const style = new Map<string, string>();
  const attrs = new Map<string, string>();
  const bar = {
    hidden: false,
    style: { setProperty: (k: string, v: string) => style.set(k, v) },
    setAttribute: (k: string, v: string) => attrs.set(k, v),
  } as unknown as HTMLElement;
  return { ...f, bar, barStyle: style, attrs };
}

describe('the title page', () => {
  it('writes the boot’s share to the bar, which only grows, and puts the bar away with the panel for a page that skips the title', () => {
    const f = bars();
    const page = titlePage(f.boot, false, false, f.bar);
    page.progress(0.25);
    expect(f.barStyle.get('--p')).toBe('0.25');
    expect(f.attrs.get('aria-valuenow')).toBe('25');
    page.progress(0.1);
    expect(f.barStyle.get('--p'), 'never back').toBe('0.25');
    page.progress(0.6);
    expect(f.barStyle.get('--p')).toBe('0.6');
    expect(f.bar.hidden).toBe(false);
    const off = bars();
    titlePage(off.boot, true, false, off.bar);
    expect(off.bar.hidden, '?title=0 has no bar').toBe(true);
  });

  it('puts the bar away when the page stops on the panel to say something', () => {
    const f = bars();
    const page = titlePage(f.boot, false, false, f.bar);
    page.hold();
    expect(f.bar.hidden).toBe(true);
  });

  it('lets the panel go when the game is ready, over the fade the stylesheet is told', () => {
    const f = fakes();
    const page = titlePage(f.boot, false, false);
    expect(f.style.get('--title-out')).toBe('300ms');
    expect(f.classes.has('gone'), 'not before the game is ready').toBe(false);
    page.leave();
    expect(f.classes.has('gone')).toBe(true);
  });

  it('has no fade under reduced motion, nor for a page that skips the title', () => {
    expect(
      (() => {
        const f = fakes();
        titlePage(f.boot, false, true);
        return f.style.get('--title-out');
      })(),
    ).toBe('0ms');
    const g = fakes();
    titlePage(g.boot, true, false);
    expect(g.style.get('--title-out')).toBe('0ms');
  });

  it('never lets the panel go once the page has stopped on it, even if its exit is asked for after', () => {
    const f = fakes();
    const page = titlePage(f.boot, false, false);
    page.hold();
    page.leave();
    expect(f.classes.has('gone')).toBe(false);
  });
});
