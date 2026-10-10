/** How the title screen's panel leaves: a fade out of a little over half a second, none for a player who asked for less motion. */
import { describe, expect, it } from 'vitest';
import { TITLE, fades } from '../src/title';

describe('the title screen', () => {
  it('fades out over a little over half a second', () => {
    expect(TITLE.fadeOut).toBe(600);
    expect(fades(false)).toEqual({ fadeOut: 600 });
  });

  it('has no fade for a player who asked for less motion', () => {
    expect(fades(true)).toEqual({ fadeOut: 0 });
  });
});
