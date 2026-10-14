/**
 * The built game, as it is served: `vite build` into `dist/`, which the perf gate measures and the app test serves,
 * so each runs against the build a player gets and not the dev server. Built quietly and in full every time it is
 * asked: a stale `dist` has passed the old code before.
 */
import { execFileSync } from 'node:child_process';

/** `dist/` built from the code as it stands. */
export function buildDist() {
  execFileSync('npx', ['vite', 'build', '--logLevel', 'silent'], { stdio: 'ignore' });
}
