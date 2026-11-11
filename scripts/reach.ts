/**
 * Which gates a change can reach, for `npm run check:change`: the pass for a change in flight, sized to it by what the
 * files import and not by anyone's memory of it. The full check is three quarters of an hour (11 November 2026: the
 * smoke tests 33 minutes of it, the slow unit tests, the pace gate and the daily gate three and a half each), and run
 * for every change of several in flight it was most of a day's work. Without this file the pass is sized by hand, as
 * `AGENTS.md` asks, and a gate left out by mistake passes in silence.
 *
 * A gate that runs in Node is reached when a changed file is among the files its bundle is made of, which esbuild says.
 * The smoke tests play the built page, which is every file `main.ts` reaches, so for those there is a short table below
 * of the kinds of file that can move only some of them. Whatever the table does not know reaches all of smoke, and
 * whatever nothing here knows (a config, the lockfile, a deleted source file) reaches the whole check: an unknown is
 * never a pass.
 *
 * It says which; `change-check.ts` reads git and esbuild, and runs them.
 */

/** A gate that runs in Node, by the name of its npm script. */
export const NODE_GATES = ['fuzz', 'determinism', 'leaks:check', 'pace:check', 'daily:check', 'bench'] as const;
export type NodeGate = (typeof NODE_GATES)[number];

/** The script each Node gate's bundle is built from. */
export const GATE_ENTRY: Record<NodeGate, string> = {
  fuzz: 'scripts/fuzz.ts',
  determinism: 'scripts/determinism-check.ts',
  'leaks:check': 'scripts/leak-check.ts',
  'pace:check': 'scripts/pace-check.ts',
  'daily:check': 'scripts/daily-check.ts',
  bench: 'scripts/bench.ts',
};

/** A baseline a gate reads from the disk and does not import, and the gate that reads it. */
const BASELINE: Record<string, NodeGate> = {
  'scripts/pace-baseline.json': 'pace:check',
  'scripts/bench-baseline.json': 'bench',
};

/** What esbuild says each thing is made of: the Node gates, the page (`src/main.ts`) and the models' showcase. */
export interface Inputs {
  gates: Record<NodeGate, ReadonlySet<string>>;
  page: ReadonlySet<string>;
  showcase: ReadonlySet<string>;
}

/** What a change is held to. `whole` is why nothing less than the full check will do, or null. */
export interface Reach {
  whole: string | null;
  gates: NodeGate[];
  /** Every smoke spec, some of them by name (without `smoke/` and `.spec.ts`), or none. */
  smoke: 'all' | string[];
  /** Each choice and the file it was made for, for the report: a gate run or left out is said, with why. */
  why: string[];
}

/** The smoke specs that hold the page's words, panels and buttons: all a change to those alone can move. */
export const PAGE_SPECS = ['hud', 'title', 'progress', 'tournament-hud', 'look', 'sound', 'pwa'] as const;

/**
 * The files of the page that draw nothing in the world and decide nothing of play: the markup and its styles, the words,
 * the panels and the sound. A change to one moves what `PAGE_SPECS` hold, and no frame, hole or model. A file is here by
 * name, on purpose: one not named reaches all of smoke.
 */
const PAGE_ONLY: readonly (string | RegExp)[] = [
  'index.html',
  'src/hud.ts',
  'src/menu.ts',
  'src/board.ts',
  'src/uiscale.ts',
  'src/sound.ts',
  /^src\/\w*words\.ts$/,
];

/** A change to any of these is a change to how everything is built, installed or run. */
const EVERYTHING: readonly (string | RegExp)[] = [
  'package.json',
  'package-lock.json',
  'vite.config.ts',
  'vitest.config.ts',
  'playwright.config.ts',
  'eslint.config.js',
  /^tsconfig.*\.json$/,
  /^\.githooks\//,
];

/** Read by people and by no gate but the formatter, which the quick check runs. */
const WORDS_ONLY: readonly RegExp[] = [/\.md$/, /^\.claude\//, /^guardrails\//, /^LICENSE$/, /^\.gitignore$/];

const among = (path: string, list: readonly (string | RegExp)[]) =>
  list.some((p) => (typeof p === 'string' ? p === path : p.test(path)));

/**
 * What the changed files reach. `changed` is paths from the root, `exists` whether each is still there (a deleted file is
 * in no bundle, so esbuild cannot say who used it), `specs` the smoke specs there are, and `pictureOf` the spec that
 * names a picture in `smoke/screens`.
 */
export function reach(
  changed: readonly string[],
  inputs: Inputs,
  exists: (path: string) => boolean,
  specs: readonly string[],
  pictureOf: (picture: string) => string | undefined,
): Reach {
  const gates = new Set<NodeGate>();
  const smoke = new Set<string>();
  // a holder, since lint cannot see a closure write a `let`
  const wide = { all: false };
  let whole: string | null = null;
  const why: string[] = [];
  const everySpec = (path: string, because: string) => {
    wide.all = true;
    why.push(`${path}: all of smoke, ${because}`);
  };
  for (const path of changed) {
    if (among(path, EVERYTHING)) {
      whole ??= `${path} is how everything is built or run`;
      continue;
    }
    if (among(path, WORDS_ONLY)) {
      why.push(`${path}: the quick check alone, since no gate reads it`);
      continue;
    }
    if (path in BASELINE) {
      gates.add(BASELINE[path]);
      why.push(`${path}: ${BASELINE[path]}, whose baseline it is`);
      continue;
    }
    if (path.startsWith('test/')) {
      why.push(`${path}: the unit tests, which the test runner sizes for itself`);
      continue;
    }
    if (path.startsWith('smoke/')) {
      const spec = /^smoke\/([\w-]+)\.spec\.ts$/.exec(path)?.[1];
      const picture = /^smoke\/screens\/(.+\.png)$/.exec(path)?.[1];
      const holder = picture ? pictureOf(picture) : undefined;
      if (spec && specs.includes(spec)) {
        smoke.add(spec);
        why.push(`${path}: itself`);
      } else if (spec) why.push(`${path}: nothing, since the spec is gone`);
      else if (holder) {
        smoke.add(holder);
        why.push(`${path}: smoke/${holder}.spec.ts, which holds the picture`);
      } else everySpec(path, picture ? 'since no spec names the picture' : 'since every spec may use it');
      continue;
    }
    const reached = NODE_GATES.filter((g) => inputs.gates[g].has(path));
    const onPage = inputs.page.has(path) || path === 'index.html' || path.startsWith('public/');
    const onShowcase = inputs.showcase.has(path) || path === 'showcase.html';
    if (!exists(path) && (path.startsWith('src/') || path.startsWith('scripts/'))) {
      whole ??= `${path} is gone, and nothing can say what used it`;
      continue;
    }
    for (const g of reached) gates.add(g);
    if (reached.length) why.push(`${path}: ${reached.join(', ')}, whose bundles it is in`);
    if (onPage) {
      if (among(path, PAGE_ONLY)) {
        for (const s of PAGE_SPECS) if (specs.includes(s)) smoke.add(s);
        why.push(
          `${path}: the page's own specs (${PAGE_SPECS.join(', ')}), since it draws no world and decides no play`,
        );
      } else everySpec(path, 'since the built page is made of it');
    } else if (onShowcase) {
      if (specs.includes('models')) smoke.add('models');
      why.push(`${path}: smoke/models.spec.ts, the showcase's`);
    }
    if (!reached.length && !onPage && !onShowcase) {
      if (path.startsWith('scripts/')) why.push(`${path}: the unit tests alone, since no gate's bundle has it`);
      else whole ??= `${path} is of no kind this knows`;
    }
  }
  if (whole !== null) return { whole, gates: [...NODE_GATES], smoke: 'all', why: [`the full check: ${whole}`] };
  return { whole, gates: NODE_GATES.filter((g) => gates.has(g)), smoke: wide.all ? 'all' : [...smoke].sort(), why };
}
