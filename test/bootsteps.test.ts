/** The boot's progress: a share from the named steps that only grows, and when the bar is to be seen. */
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { BOOT_BAR, BOOT_STEPS, BootProgress, barShown, type BootStep } from '../src/bootsteps';

describe('the boot bar', () => {
  it('is not shown in the first half second, nor once the title is up, and is shown when the title is late', () => {
    expect(barShown(0, false)).toBe(false);
    expect(barShown(BOOT_BAR.after - 1, false)).toBe(false);
    expect(barShown(BOOT_BAR.after, false)).toBe(true);
    expect(barShown(5000, false)).toBe(true);
    expect(barShown(5000, true), 'the title is up: nothing to wait for').toBe(false);
  });

  it('waits the half second the stylesheet waits', () => {
    const html = readFileSync(new URL('../index.html', import.meta.url), 'utf8');
    const delay = /#bootBar\s*\{[^}]*animation:[^;]*\b(\d+)ms\b/.exec(html);
    expect(delay, 'the stylesheet says how long the bar waits').not.toBeNull();
    expect(Number(delay![1])).toBe(BOOT_BAR.after);
  });
});

describe('the boot progress', () => {
  it('starts at nought, reaches one with every step and counts a step once', () => {
    const p = new BootProgress();
    expect(p.share).toBe(0);
    const steps = Object.keys(BOOT_STEPS) as BootStep[];
    let last = 0;
    for (const s of steps) {
      const share = p.finish(s);
      expect(share, `after ${s}`).toBeGreaterThan(last);
      last = share;
    }
    expect(last).toBeCloseTo(1, 12);
    expect(p.finish('scripts'), 'said twice').toBe(last);
  });

  it('never goes back, whatever order the steps finish in', () => {
    const p = new BootProgress();
    const order: BootStep[] = ['compile', 'scripts', 'grass', 'hole', 'scene', 'letters', 'compile'];
    let last = 0;
    for (const s of order) {
      const share = p.finish(s);
      expect(share).toBeGreaterThanOrEqual(last);
      last = share;
    }
  });

  it('refuses a step it does not know by name', () => {
    expect(() => new BootProgress().finish('coffee' as BootStep)).toThrow(/coffee/);
  });
});
