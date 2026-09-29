import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    include: ['test/**/*.test.ts'],
    environment: 'node',
    // the tests that walk every hole of every course, the rail's and the turf's, take two to five seconds each on a
    // quiet machine and grow with each course added; the default five leaves no room for a busy one
    testTimeout: 30_000,
  },
});
