/**
 * What is left lying about once work has landed (guardrails/checks/landing.md): every branch, here or on the remote, and
 * every worktree whose commits are all on the default branch. The default branch is read from the remote's own HEAD
 * (`refs/remotes/origin/HEAD`), never taken to be `main`. A branch is merged when its tip is an ancestor of the default
 * branch's, which is what a merge commit or a fast-forward leaves; this project lands by merge commit, so a squashed
 * branch would not be seen, and is not the house's.
 *
 * `branches-check.ts` runs it as `npm run branches`; the tests make a repository of their own.
 */
import { execFileSync } from 'node:child_process';

/**
 * The environment without git's own variables: a hook is run with `GIT_DIR` and `GIT_INDEX_FILE` set to the repository
 * it is in, which would win over `-C` and turn every command here on that repository instead of the one asked about.
 */
export function gitless(env: NodeJS.ProcessEnv = process.env): NodeJS.ProcessEnv {
  return Object.fromEntries(Object.entries(env).filter(([name]) => !name.startsWith('GIT_')));
}

/** Git in `repo`, its output trimmed. */
function git(repo: string, ...args: string[]): string {
  return execFileSync('git', ['-C', repo, ...args], { encoding: 'utf8', env: gitless() }).trim();
}

/** Whether `ref` is an ancestor of `base`, or `base` itself. */
function isOn(repo: string, ref: string, base: string): boolean {
  try {
    execFileSync('git', ['-C', repo, 'merge-base', '--is-ancestor', ref, base], { stdio: 'ignore', env: gitless() });
    return true;
  } catch {
    return false;
  }
}

/** The default branch as the remote says it, `refs/remotes/<remote>/<name>`, or null where the remote has said none. */
export function defaultBranch(repo: string, remote = 'origin'): string | null {
  try {
    return git(repo, 'symbolic-ref', `refs/remotes/${remote}/HEAD`);
  } catch {
    return null;
  }
}

/** What is merged and left: the branches here, the branches on the remote, and the worktrees, by name. */
export interface Leftovers {
  base: string;
  local: string[];
  remote: string[];
  /** Each worktree other than the main one whose branch or commit is merged: its path, and its branch or commit. */
  worktrees: { path: string; at: string }[];
}

/**
 * Everything merged into the default branch and left: a local branch (not the default branch's own), a branch on the
 * remote (not its HEAD or the default branch), and a worktree other than the repository's own.
 */
export function leftovers(repo: string, remote = 'origin'): Leftovers {
  const base = defaultBranch(repo, remote);
  if (!base) throw new Error(`the remote "${remote}" names no default branch: git remote set-head ${remote} --auto`);
  const name = base.slice(`refs/remotes/${remote}/`.length);
  const refs = git(repo, 'for-each-ref', '--format=%(refname)', 'refs/heads', `refs/remotes/${remote}`)
    .split('\n')
    .filter(Boolean);
  const local = refs
    .filter((r) => r.startsWith('refs/heads/') && r !== `refs/heads/${name}` && isOn(repo, r, base))
    .map((r) => r.slice('refs/heads/'.length));
  const remoteRefs = refs
    .filter(
      (r) =>
        r.startsWith(`refs/remotes/${remote}/`) &&
        r !== base &&
        r !== `refs/remotes/${remote}/HEAD` &&
        isOn(repo, r, base),
    )
    .map((r) => r.slice('refs/remotes/'.length));
  const worktrees: Leftovers['worktrees'] = [];
  const blocks = git(repo, 'worktree', 'list', '--porcelain').split('\n\n').slice(1);
  for (const block of blocks) {
    const path = /^worktree (.*)$/m.exec(block)?.[1];
    const head = /^HEAD (\w+)$/m.exec(block)?.[1];
    const branch = /^branch refs\/heads\/(.*)$/m.exec(block)?.[1];
    if (path && head && branch !== name && isOn(repo, head, base))
      worktrees.push({ path, at: branch ?? head.slice(0, 7) });
  }
  return { base, local, remote: remoteRefs, worktrees };
}
