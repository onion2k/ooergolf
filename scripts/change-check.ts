/**
 * The command behind `npm run check:change`: the pass for a change in flight. It reads what has changed against the
 * remote's default branch (or `--base <ref>`), asks `reach.ts` which gates that can move, says so, and runs them one
 * after another, stopping at the first red: the quick check, the slow unit tests that import what changed, the Node
 * gates whose bundles hold it, and the smoke specs it can reach. `--plan` says and runs nothing, and
 * `--plan --files a,b` says what those files would reach.
 *
 * It is not the full check, and says what it left out. A fault in what it leaves out is found by `npm run check`, which
 * is still the pass before a push that deploys.
 */
import { execFileSync, spawnSync } from 'node:child_process';
import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { build } from 'esbuild';
import { GATE_ENTRY, NODE_GATES, reach, type Inputs, type NodeGate } from './reach';

const args = process.argv.slice(2);
const flag = (name: string) => {
  const at = args.indexOf(name);
  return at < 0 ? undefined : args[at + 1];
};
const git = (...a: string[]) => execFileSync('git', a, { encoding: 'utf8' }).trim();

/** The remote's default branch as this clone last saw it: read, never taken to be `main`. */
function defaultBase(): string {
  try {
    return git('symbolic-ref', '--short', 'refs/remotes/origin/HEAD');
  } catch {
    const head = /HEAD branch: (\S+)/.exec(git('remote', 'show', 'origin'))?.[1];
    if (!head) throw new Error('check:change: the remote names no default branch; pass --base <ref>');
    return `origin/${head}`;
  }
}

/** Every file a bundle of `entry` is made of, from the root; null where it cannot be built, which reaches everything. */
async function inputsOf(entry: string): Promise<Set<string> | null> {
  try {
    const out = await build({
      entryPoints: [entry],
      bundle: true,
      write: false,
      metafile: true,
      platform: 'neutral',
      format: 'esm',
      packages: 'external',
      logLevel: 'silent',
      loader: { '.png': 'empty', '.jpg': 'empty', '.svg': 'empty', '.css': 'empty', '.wgsl': 'text' },
      external: ['node:*'],
    });
    return new Set(Object.keys(out.metafile.inputs));
  } catch {
    return null;
  }
}

const base = flag('--base') ?? defaultBase();
const lines = (s: string) => s.split('\n').filter(Boolean);
const named = flag('--files');
const changed = [
  ...new Set(
    named
      ? named.split(',')
      : [
          ...lines(git('diff', '--name-only', `${base}...HEAD`)),
          ...lines(git('diff', '--name-only', 'HEAD')),
          ...lines(git('ls-files', '--others', '--exclude-standard')),
        ],
  ),
].sort();
// `--files a,b` asks what those files would reach, and is for asking only: a pass is of what has changed
if (named && !args.includes('--plan')) {
  console.error('check:change: --files is for --plan alone');
  process.exit(1);
}
if (!changed.length) {
  console.error(`check:change: nothing has changed against ${base}, so nothing was checked; pass --base <ref>`);
  process.exit(1);
}

const built = await Promise.all([
  ...NODE_GATES.map((g) => inputsOf(GATE_ENTRY[g])),
  inputsOf('src/main.ts'),
  inputsOf('src/showcase.ts'),
]);
const unbuilt = built.includes(null);
const every = new Set(changed);
const set = (i: number) => built[i] ?? every;
const inputs: Inputs = {
  gates: Object.fromEntries(NODE_GATES.map((g, i) => [g, set(i)])) as Record<NodeGate, Set<string>>,
  page: set(NODE_GATES.length),
  showcase: set(NODE_GATES.length + 1),
};
const specs = readdirSync('smoke')
  .filter((f) => f.endsWith('.spec.ts'))
  .map((f) => f.replace('.spec.ts', ''));
const sources = new Map(specs.map((s) => [s, readFileSync(`smoke/${s}.spec.ts`, 'utf8')]));
const pictureOf = (picture: string) => specs.find((s) => sources.get(s)!.includes(`'${picture}'`));
const plan = reach(changed, inputs, existsSync, specs, pictureOf);

/** What is run, in the full check's order, each with the command. */
const steps: { name: string; cmd: string[] }[] = [
  { name: 'check:quick', cmd: ['npm', 'run', '--silent', 'check:quick'] },
];
const slow = ['npx', 'vitest', 'run', '--project', 'slow', '--reporter', 'dot', '--maxWorkers', '50%'];
if (plan.whole) steps.push({ name: 'the slow unit tests, all', cmd: slow });
else {
  // counted first, so a run that found no test to run is said and is not a step that passed
  const listed = lines(
    execFileSync('npx', ['vitest', 'list', '--project', 'slow', '--changed', base, '--filesOnly'], {
      encoding: 'utf8',
    }),
  ).filter((l) => l.includes('test/'));
  if (listed.length)
    steps.push({
      name: `the ${listed.length} slow test files that import what changed`,
      cmd: [...slow, '--changed', base],
    });
  else plan.why.push('no slow test file imports what changed, so none is run');
}
for (const g of plan.gates) steps.push({ name: g, cmd: ['npm', 'run', '--silent', g] });
if (plan.smoke === 'all')
  steps.push({ name: 'smoke, all of it', cmd: ['npx', 'playwright', 'test', '--trace', 'off'] });
else if (plan.smoke.length)
  steps.push({
    name: `smoke: ${plan.smoke.join(', ')}`,
    cmd: ['npx', 'playwright', 'test', ...plan.smoke.map((s) => `smoke/${s}.spec.ts`), '--trace', 'off'],
  });

console.log(`check:change: ${changed.length} files changed against ${base}`);
for (const w of plan.why) console.log(`  ${w}`);
if (unbuilt) console.log('  a bundle could not be read, so every changed file is taken to be in it');
const left = [
  ...NODE_GATES.filter((g) => !plan.gates.includes(g)),
  ...(plan.smoke === 'all' ? [] : specs.filter((s) => !plan.smoke.includes(s)).map((s) => `smoke/${s}`)),
  'licences',
  'unused',
  'branches',
];
console.log(`  runs: ${steps.map((s) => s.name).join('; ')}`);
console.log(`  left to the full check: ${left.join(', ')}`);
if (args.includes('--plan')) process.exit(0);

const began = Date.now();
for (const step of steps) {
  const from = Date.now();
  console.log(`\ncheck:change: ${step.name}`);
  const done = spawnSync(step.cmd[0], step.cmd.slice(1), { stdio: 'inherit' });
  const seconds = Math.round((Date.now() - from) / 1000);
  if (done.status !== 0) {
    console.error(`\ncheck:change: ${step.name} failed after ${seconds} s; nothing after it was run`);
    process.exit(1);
  }
  console.log(`check:change: ${step.name} passed in ${seconds} s`);
}
console.log(
  `\ncheck:change: ${steps.length} steps green in ${Math.round((Date.now() - began) / 1000)} s; not the full check`,
);
