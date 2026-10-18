/** What is merged and left: read from a repository of the test's own, with a remote, branches and worktrees. */
import { execFileSync } from 'node:child_process';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterAll, describe, expect, it } from 'vitest';
import { defaultBranch, gitless, leftovers } from '../scripts/branches';

const root = mkdtempSync(join(tmpdir(), 'ooergolf-branches-'));
afterAll(() => rmSync(root, { recursive: true, force: true }));

/** Git in `dir`, as a test's own author, with nobody's hooks, and none of git's variables (a hook sets `GIT_DIR`). */
const git = (dir: string, ...args: string[]) =>
  execFileSync(
    'git',
    [
      '-C',
      dir,
      '-c',
      'user.name=test',
      '-c',
      'user.email=test@example.invalid',
      '-c',
      'core.hooksPath=/dev/null',
      ...args,
    ],
    { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'], env: gitless() },
  ).trim();
const commit = (dir: string, file: string) => {
  writeFileSync(join(dir, file), file);
  git(dir, 'add', file);
  git(dir, 'commit', '-q', '-m', file);
};

/**
 * A bare remote whose default branch is `trunk` (not `main`, to see it is read and not assumed), and a clone with: `done`
 * merged and left, here and on the remote; `open`, not merged, here and on the remote; and a worktree on each.
 */
function repository() {
  const remote = join(root, 'remote.git'),
    here = join(root, 'here');
  execFileSync('git', ['init', '-q', '--bare', '-b', 'trunk', remote], { env: gitless() });
  execFileSync('git', ['clone', '-q', remote, here], { stdio: 'ignore', env: gitless() });
  git(here, 'checkout', '-q', '-b', 'trunk');
  commit(here, 'a');
  git(here, 'push', '-q', 'origin', 'trunk');
  git(here, 'checkout', '-q', '-b', 'done');
  commit(here, 'b');
  git(here, 'push', '-q', 'origin', 'done');
  git(here, 'checkout', '-q', 'trunk');
  git(here, 'merge', '-q', '--no-ff', '-m', 'merge done', 'done');
  git(here, 'push', '-q', 'origin', 'trunk');
  git(here, 'checkout', '-q', '-b', 'open');
  commit(here, 'c');
  git(here, 'push', '-q', 'origin', 'open');
  git(here, 'checkout', '-q', 'trunk');
  git(here, 'remote', 'set-head', 'origin', 'trunk');
  git(here, 'worktree', 'add', '-q', join(root, 'wt-done'), 'done');
  git(here, 'worktree', 'add', '-q', '--detach', join(root, 'wt-open'), 'open');
  return here;
}

describe('what is merged and left', () => {
  const here = repository();

  it("reads the default branch from the remote's HEAD", () => {
    expect(defaultBranch(here)).toBe('refs/remotes/origin/trunk');
  });

  it('lists the branches merged into it, here and on the remote, and the worktree on one, and nothing not merged', () => {
    const found = leftovers(here);
    expect(found.base).toBe('refs/remotes/origin/trunk');
    expect(found.local).toEqual(['done']);
    expect(found.remote).toEqual(['origin/done']);
    expect(found.worktrees.map((w) => w.at)).toEqual(['done']);
  });

  it('lists nothing once they are cleared', () => {
    git(here, 'worktree', 'remove', join(root, 'wt-done'));
    git(here, 'branch', '-q', '-d', 'done');
    git(here, 'push', '-q', 'origin', '--delete', 'done');
    expect(leftovers(here)).toMatchObject({ local: [], remote: [], worktrees: [] });
  });

  it('refuses a remote that names no default branch, by name', () => {
    git(here, 'remote', 'set-head', 'origin', '--delete');
    expect(() => leftovers(here)).toThrow('names no default branch');
  });
});
