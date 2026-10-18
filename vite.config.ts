import { build as bundle } from 'esbuild';
import { readFileSync, readdirSync, statSync, writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { dirname, join, relative } from 'node:path';
import { defineConfig, type Plugin } from 'vite';
import { headersFile, headersFor } from './scripts/headers';
import { assetsToCache } from './src/offline';

/**
 * Where the three packages actually are: inside node_modules when installed,
 * and a checkout elsewhere on the disk when linked for working on both at
 * once. The dev server has to be allowed to serve from there, and its
 * watcher told not to ignore them.
 */
const at = (pkg: string) => dirname(createRequire(import.meta.url).resolve(`${pkg}/package.json`));
const packages = ['artshape-render', 'artshape-physics', 'artshape-sound'];

/** The dev server's port: 5200, or `PORT` from the environment so a worktree built beside this one has a port of its own. */
const port = Number(process.env.PORT) || 5200;

/** Every file under `dir`, as a path relative to it with forward slashes, in any order. */
function filesUnder(dir: string, root = dir): string[] {
  const found: string[] = [];
  for (const name of readdirSync(dir)) {
    const path = join(dir, name);
    if (statSync(path).isDirectory()) found.push(...filesUnder(path, root));
    else found.push(relative(root, path).split('\\').join('/'));
  }
  return found;
}

/**
 * The service worker, built as the build closes: `src/sw.ts` bundled to `dist/sw.js` with `__ASSETS__` the files the
 * build wrote (the page, `dist/assets`, and `public/` as it was copied), so the worker keeps exactly this build and its
 * cache is named by it. A generated file: it is never edited, and never in the dev server, which registers no worker.
 */
function worker(): Plugin {
  return {
    name: 'ooergolf-worker',
    apply: 'build',
    async closeBundle() {
      const assets = assetsToCache(filesUnder('dist/assets'), filesUnder('public'));
      await bundle({
        entryPoints: ['src/sw.ts'],
        bundle: true,
        format: 'esm',
        minify: true,
        outfile: 'dist/sw.js',
        define: { __ASSETS__: JSON.stringify(assets) },
        logLevel: 'warning',
      });
    },
  };
}

/**
 * What the served game tells the browser to refuse, written as the build closes: `dist/_headers`, which Netlify serves
 * every response with, its policy hashing the built page's own inline stylesheet (`scripts/headers.ts` says the rest).
 * A generated file, never edited, and not in `public/`, so the service worker does not keep it.
 */
function headers(): Plugin {
  return {
    name: 'ooergolf-headers',
    apply: 'build',
    closeBundle() {
      writeFileSync('dist/_headers', headersFile(headersFor(readFileSync('dist/index.html', 'utf8'))));
    },
  };
}

export default defineConfig({
  plugins: [worker(), headers()],
  server: {
    port,
    strictPort: true,
    watch: { ignored: packages.map((p) => `!**/node_modules/${p}/**`) },
    fs: { allow: ['.', ...packages.map(at)] },
  },
  optimizeDeps: { exclude: packages },
});
