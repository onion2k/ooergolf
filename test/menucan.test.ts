/** When the hole's menu may be opened: over a hole in play, and over nothing else. */
import { describe, expect, it } from 'vitest';
import { menuMayOpen } from '../src/menu';

const ready = { phase: 'play', choosing: false, titled: false } as const;

describe('when the menu may be opened', () => {
  it('opens over a hole in play', () => {
    expect(menuMayOpen(ready)).toBe(true);
  });

  it('does not open between holes, over the card, under the start screen or under the title', () => {
    expect(menuMayOpen({ ...ready, phase: 'done' })).toBe(false);
    expect(menuMayOpen({ ...ready, phase: 'over' })).toBe(false);
    expect(menuMayOpen({ ...ready, choosing: true })).toBe(false);
    expect(menuMayOpen({ ...ready, titled: true })).toBe(false);
  });
});
