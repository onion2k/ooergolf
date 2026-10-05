/**
 * The seed search's command line: the course it names and the hole it is asked for. The search is slow and is not run here;
 * without these a flag in front of the hole's name would be read as the name, and a misspelt course would quietly search
 * The Links.
 */
import { describe, expect, it } from 'vitest';
import { parseArgs, specsOf } from '../scripts/seed-search';
import { LINKS_SPECS } from '../src/links';

describe('seed-search arguments', () => {
  it('reads the old command line as it always did', () => {
    const o = parseArgs(['The Opener', '--seeds', '1-40', '--rounds', '24', '--set', '{"length":400}']);
    expect(o).toEqual({
      name: 'The Opener',
      course: 'links',
      set: '{"length":400}',
      seeds: '1-40',
      rounds: 24,
      from: 1,
    });
  });

  it('finds the hole whether the course comes before it or after', () => {
    expect(parseArgs(['--course', 'fells', 'Tight Left']).name).toBe('Tight Left');
    expect(parseArgs(['Tight Left', '--course', 'isles']).course).toBe('isles');
  });

  it('refuses a course it does not know, by name', () => {
    expect(() => parseArgs(['x', '--course', 'moors'])).toThrow(/no course is called moors/);
  });

  it('gives The Links its own holes', async () => {
    expect(await specsOf('links')).toBe(LINKS_SPECS);
  });
});
