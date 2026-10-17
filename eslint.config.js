// Lint for mistakes, not style: Prettier has the look of the code. The type-aware
// rules are the point, since they catch what the compiler lets through: a promise
// dropped on the floor, a comparison that can never be true, a value used as the
// wrong type through an `any`.
import js from '@eslint/js';
import prettier from 'eslint-config-prettier';
import globals from 'globals';
import tseslint from 'typescript-eslint';

// A rule turned off says why, on the line, after ` -- `: whoever wants it gone has the reason beside it. A few lines
// here rather than a plugin taken in for the one rule (guardrails/checks/lint.md).
const DIRECTIVE = /^\s*eslint-disable(-next-line|-line)?(\s|$)/;
/**
 * The picture: the page and what draws, which alone may import the renderer, and which nothing else imports, so the game
 * itself runs headless in a test and a script. `models/` is all of it. A module that comes to import the renderer is
 * added here, and the rule then holds that nothing of the game imports it.
 */
const PICTURE = [
  'main',
  'showcase',
  'debug',
  'hud',
  'titlepage',
  'install',
  'scene',
  'ground',
  'look',
  'models',
  'quality',
  'previews',
  'holemap',
  'sway',
  'hills',
  'meshes',
  'backdrop',
  'fastmesh',
  'tintmesh',
  'waterdraw',
];
/** The game does not import the renderer: it runs without a page, in a test and in the fuzzer. */
const RENDERER = {
  group: ['artshape-render', 'artshape-render/*'],
  allowTypeImports: true,
  message: 'The game runs headless: only the page and what draws (PICTURE in eslint.config.js) import the renderer.',
};
/** Nor does it import the picture's own modules. */
const THE_PICTURE = {
  regex: `^\\.{1,2}/(\\.\\./)*(${PICTURE.join('|')})(/.*)?$`,
  allowTypeImports: true,
  message:
    'The game does not import its picture (PICTURE in eslint.config.js): the page reads the game, not the other way.',
};
/** The physics package is reached through its one side, physics.ts, which the rest import. */
const PHYSICS = {
  group: ['artshape-physics', 'artshape-physics/*'],
  allowTypeImports: true,
  message: 'Only src/physics.ts imports artshape-physics; import physics.ts.',
};
/** One place wires everything: the page's entries are imported by nothing. */
const THE_PAGE = {
  regex: '^\\.{1,2}/(\\.\\./)*(main|showcase)$',
  message: 'main.ts and showcase.ts are entries, the one place that wires everything: nothing imports them.',
};

const house = {
  rules: {
    'directive-reason': {
      meta: {
        type: 'suggestion',
        messages: { bare: 'Say why the rule is off, after " -- ", on the line.' },
        schema: [],
      },
      create(context) {
        return {
          Program() {
            for (const comment of context.sourceCode.getAllComments()) {
              if (DIRECTIVE.test(comment.value) && !/\s--\s+\S/.test(comment.value))
                context.report({ loc: comment.loc, messageId: 'bare' });
            }
          },
        };
      },
    },
  },
};

export default tseslint.config(
  // .claude holds agents' worktrees, whole copies of the repo that are not this one
  { ignores: ['dist', 'node_modules', '.claude'] },
  js.configs.recommended,
  ...tseslint.configs.recommendedTypeChecked,
  {
    languageOptions: {
      parserOptions: { project: ['./tsconfig.json', './tsconfig.node.json'], tsconfigRootDir: import.meta.dirname },
      globals: { ...globals.browser },
    },
    rules: {
      eqeqeq: ['error', 'always'],
      'no-constant-condition': ['error', { checkLoops: false }],
      '@typescript-eslint/no-unused-vars': ['error', { argsIgnorePattern: '^_', varsIgnorePattern: '^_' }],
      '@typescript-eslint/switch-exhaustiveness-check': 'error',
      '@typescript-eslint/no-unnecessary-condition': ['error', { allowConstantLoopConditions: true }],
      '@typescript-eslint/prefer-nullish-coalescing': 'off',
    },
  },
  { files: ['**/*.js', '**/*.mjs'], ...tseslint.configs.disableTypeChecked },
  { plugins: { house }, rules: { 'house/directive-reason': 'error' } },
  {
    files: ['src/**/*.ts'],
    rules: {
      // Chance comes from the one seeded source handed in (src/random.ts): the fuzzer's replays, the determinism check and
      // every baseline gate rest on the same seed giving the same game.
      'no-restricted-properties': [
        'error',
        { object: 'Math', property: 'random', message: 'Take chance from the seeded source handed in.' },
      ],
      // The game tells what happened through its events; a console line in it is debugging left in. The page's few that
      // report a failure say so on the line.
      'no-console': 'error',
    },
  },
  // What may import what in src/ (guardrails/checks/structure.md; nothing in a circle is held by test/structure.test.ts).
  // A type alone is let through every rule: it is gone when the game runs, so it never stops the game running headless.
  {
    files: ['src/**/*.ts'],
    ignores: PICTURE.map((m) => `src/${m}.ts`).concat('src/models/**/*.ts', 'src/physics.ts'),
    rules: { 'no-restricted-imports': ['error', { patterns: [RENDERER, THE_PICTURE, PHYSICS] }] },
  },
  { files: ['src/physics.ts'], rules: { 'no-restricted-imports': ['error', { patterns: [RENDERER, THE_PICTURE] }] } },
  {
    files: PICTURE.map((m) => `src/${m}.ts`).concat('src/models/**/*.ts'),
    rules: { 'no-restricted-imports': ['error', { patterns: [PHYSICS, THE_PAGE] }] },
  },
  {
    files: ['scripts/**', 'test/**', '*.config.ts', '*.config.js'],
    languageOptions: { globals: { ...globals.node } },
  },
  prettier,
);
