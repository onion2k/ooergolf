/** What the page says when it cannot go on: which hole, and why, for whatever was thrown. */
import { describe, expect, it } from 'vitest';
import { holeFailureText, reasonOf } from '../src/failure';

describe('the reason something was thrown', () => {
  it('is an error’s message, and a string as it stands', () => {
    expect(reasonOf(new RangeError('a collar 3 across cannot hold a cup of radius 1.9'))).toBe(
      'a collar 3 across cannot hold a cup of radius 1.9',
    );
    expect(reasonOf('the grass')).toBe('the grass');
    expect(reasonOf(42)).toBe('42');
    // what a browser's own errors are, some of them: a message and no `Error` behind it
    expect(reasonOf({ message: 'the device was lost' })).toBe('the device was lost');
  });

  it('is an error’s name where it has no message, and says so where nothing was given', () => {
    expect(reasonOf(new TypeError(''))).toBe('TypeError');
    expect(reasonOf(undefined)).toBe('no reason was given');
    expect(reasonOf(null)).toBe('no reason was given');
    expect(reasonOf('')).toBe('no reason was given');
  });

  it('says nothing was given for an object with no message, whose own words would be [object Object]', () => {
    expect(reasonOf({})).toBe('no reason was given');
    expect(reasonOf(Object.create(null))).toBe('no reason was given');
    expect(reasonOf({ message: '' })).toBe('no reason was given');
  });

  it('is never thrown itself, whatever it is handed: it is what the page runs as it fails', () => {
    const hostile = {
      get message(): string {
        throw new Error('not even this');
      },
    };
    expect(() => reasonOf(hostile)).not.toThrow();
    expect(reasonOf(hostile)).toBe('no reason was given');
  });
});

describe('the words for a hole that cannot be drawn', () => {
  it('name the hole by its number from one and by its name, give the reason, and say what to do', () => {
    const text = holeFailureText(1, 'The Mill Race', new RangeError('too wide for the grass'));
    expect(text.split('\n')).toEqual([
      'Hole 2, The Mill Race, could not be drawn.',
      'too wide for the grass',
      'Reload the page to start again.',
    ]);
  });

  it('count the first hole as one, and give a reason for anything that was thrown', () => {
    expect(holeFailureText(0, 'Wide Open', 'no field').split('\n')[0]).toBe('Hole 1, Wide Open, could not be drawn.');
    expect(holeFailureText(8, 'The Last', undefined).split('\n')[1]).toBe('no reason was given');
  });
});
