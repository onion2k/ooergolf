/**
 * The command behind `npm run branches`: every branch and worktree merged into the default branch and left, listed with
 * how each is cleared, and a failure while there is any (`branches.ts` says what counts). Clearing is never done here:
 * a branch on the remote is someone's, and it goes only on the user's word.
 */
import { leftovers } from './branches';

const found = leftovers('.');
const count = found.local.length + found.remote.length + found.worktrees.length;
console.log(`branches: ${count ? count : 'nothing'} merged into ${found.base.replace('refs/remotes/', '')} and left`);
for (const w of found.worktrees) console.log(`  worktree ${w.path} (${w.at})     git worktree remove ${w.path}`);
for (const b of found.local) console.log(`  branch ${b}     git branch -d ${b}`);
for (const r of found.remote) {
  const [remote, ...name] = r.split('/');
  console.log(`  branch ${r}     git push ${remote} --delete ${name.join('/')}`);
}
process.exit(count ? 1 : 0);
