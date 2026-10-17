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
  {
    files: ['scripts/**', 'test/**', '*.config.ts', '*.config.js'],
    languageOptions: { globals: { ...globals.node } },
  },
  prettier,
);
