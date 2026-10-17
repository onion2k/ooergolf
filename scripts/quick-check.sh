#!/bin/sh
# The quick check, the pre-commit hook's: formatting, types, lint and the quick unit tests, under half a minute so
# nobody is tempted past it (guardrails/checks/quick-check.md). Run one after another it took 95 s on 17 October 2026,
# so the three that read the code run side by side, and the tests, which take every core, run once they are done.
#
# Prettier and the types keep caches in node_modules/.cache/quick, each keyed by the files' contents, so a commit that
# touches a few files checks a few. Lint keeps none: a type-aware rule's answer for a file can change with another
# file's types, and a cache keyed by the one file would pass the old answer. Lint takes four threads instead, which
# halve its time; more cost as much again in building each thread's program as they save.
#
# The slow test files are the full check's (`SLOW` in vitest.config.ts).

cache=node_modules/.cache/quick
mkdir -p "$cache"

npx prettier --check . --log-level warn --cache --cache-strategy content --cache-location "$cache/prettier" &
format=$!
npx tsc --noEmit --incremental --tsBuildInfoFile "$cache/app.tsbuildinfo" &
app=$!
npx tsc --noEmit -p tsconfig.node.json --incremental --tsBuildInfoFile "$cache/node.tsbuildinfo" &
node=$!
npx eslint . --concurrency 4 &
lint=$!

failed=0
wait $format || { echo 'quick check: formatting failed (npm run format writes it)' >&2; failed=1; }
wait $app || { echo 'quick check: the types failed, in src' >&2; failed=1; }
wait $node || { echo 'quick check: the types failed, in the scripts, tests and configs' >&2; failed=1; }
wait $lint || { echo 'quick check: lint failed' >&2; failed=1; }
[ $failed -eq 0 ] || exit 1

exec npx vitest run --project quick --reporter dot
