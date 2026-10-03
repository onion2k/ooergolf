/**
 * A hole with a stream across it, for the tests, the fuzzer and the stream's picture: a belt of four tiles drawn as
 * running water, carrying toward the east and ending in the open, so a ball that crosses it is carried a little way
 * and comes to rest on grass. It is on no course: a test plays it as a course of its own.
 */
import type { HoleDef } from '../src/course';

/** The same hole with a plain conveyor in the stream's place, which the stream must carry a ball exactly as. */
export const BELT_HOLE: HoleDef = {
  name: 'Belt test',
  par: 3,
  map: [
    '#########',
    '#...C...#',
    '#.......#',
    '#.......#',
    '#.......#',
    '#.......#',
    '#.......#',
    '#.......#',
    '#.......#',
    '#.T.....#',
    '#########',
  ],
  obstacles: [{ kind: 'conveyor', from: [1, 5], to: [4, 5], speed: 3 }],
};

export const STREAM_HOLE: HoleDef = {
  ...BELT_HOLE,
  name: 'Stream test',
  obstacles: [{ kind: 'conveyor', from: [1, 5], to: [4, 5], speed: 3, look: 'water' }],
};
