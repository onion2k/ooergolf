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

describe('the title page', () => {
  it('lets the panel go when the game is ready, over the fade the stylesheet is told', () => {
    const f = fakes();
    const page = titlePage(f.boot, false, false);
    expect(f.style.get('--title-out')).toBe('600ms');
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
