import { defineConfig } from 'vitest/config';

// The test files that take two seconds or more, which the quick check leaves to the full check so the hook stays under
// half a minute (guardrails/checks/quick-check.md). Measured 17 October 2026 at commit 62bb0d0, every file in one run
// across the machine's twelve cores, by the time each file's tests took: the walks over every hole of every course, the
// fuzzer's own tests and the hashes of whole courses. All of them run in `npm test` and in `npm run check`. A file that
// grows past two seconds is added here; one made quick again is taken off.
//
// `npm run check` runs them on half the cores (`--maxWorkers 50%`): on all twelve, the heaviest files side by side, the
// tests that time how long a course takes to make (The Fells', The Old Course's, the tint's and the zones' of The Isles)
// failed five in 997 on 17 October 2026, and on six they passed, sooner (115 s against 137).
const SLOW = [
  'test/autopilot-kit.test.ts',
  'test/banks.test.ts',
  'test/begin-same.test.ts',
  'test/bumper.test.ts',
  'test/caddie.test.ts',
  'test/contour.test.ts',
  'test/copernicus-play.test.ts',
  'test/copernicus.test.ts',
  'test/course.test.ts',
  'test/courses.test.ts',
  'test/cup-drawn.test.ts',
  'test/determinism.test.ts',
  'test/engine.test.ts',
  'test/fells-ground.test.ts',
  'test/fuzz-pan.test.ts',
  'test/fuzz-trees.test.ts',
  'test/fells.test.ts',
  'test/field.test.ts',
  'test/flight-through.test.ts',
  'test/flipper.test.ts',
  'test/fuzz-fells-isles.test.ts',
  'test/fuzz-links.test.ts',
  'test/fuzz-new-courses.test.ts',
  'test/fuzz.test.ts',
  'test/gap.test.ts',
  'test/golf-cut.test.ts',
  'test/golf-game.test.ts',
  'test/golf-hash.test.ts',
  'test/golf-hole.test.ts',
  'test/golf-turf.test.ts',
  'test/green.test.ts',
  'test/ground-zones.test.ts',
  'test/ground.test.ts',
  'test/heath.test.ts',
  'test/isles.test.ts',
  'test/kit-hash.test.ts',
  'test/lake-hollow.test.ts',
  'test/lakes.test.ts',
  'test/landing.test.ts',
  'test/lazy-course.test.ts',
  'test/leaks.test.ts',
  'test/lettering.test.ts',
  'test/lie-zones.test.ts',
  'test/lineofplay.test.ts',
  'test/links.test.ts',
  'test/noise.test.ts',
  'test/old.test.ts',
  'test/overhead-far.test.ts',
  'test/planner.test.ts',
  'test/preview-kit.test.ts',
  'test/previews.test.ts',
  'test/scenery.test.ts',
  'test/shape.test.ts',
  'test/shed.test.ts',
  'test/sky.test.ts',
  'test/spin.test.ts',
  'test/strategy.test.ts',
  'test/terrain.test.ts',
  'test/timed-holes.test.ts',
  'test/tint-colours.test.ts',
  'test/tint.test.ts',
  'test/tranquility-play.test.ts',
  'test/tranquility.test.ts',
  'test/tree-ground.test.ts',
  'test/trees-game.test.ts',
  'test/turf.test.ts',
  'test/waterdraw.test.ts',
  'test/waterworks.test.ts',
  'test/wind-preview.test.ts',
  'test/wind.test.ts',
  'test/woods.test.ts',
  'test/world.test.ts',
  'test/zones.test.ts',
];

export default defineConfig({
  test: {
    environment: 'node',
    // the tests that walk every hole of every course, the rail's and the turf's, take two to five seconds each on a
    // quiet machine and grow with each course added; the default five leaves no room for a busy one
    testTimeout: 30_000,
    projects: [
      { extends: true, test: { name: 'quick', include: ['test/**/*.test.ts'], exclude: SLOW } },
      { extends: true, test: { name: 'slow', include: SLOW } },
    ],
  },
});
