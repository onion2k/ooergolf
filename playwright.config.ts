import { defineConfig } from '@playwright/test';

/**
 * The game in a real browser, headless, on the machine's own GPU: see smoke/.
 * Chromium's new headless mode (the `chromium` channel) has WebGPU on the real
 * adapter; the older headless shell has none, or only a software one.
 */
// 5201, or `PORT` from the environment, so a worktree's smoke run does not collide with another's on this machine; the
// app test serves on one past it, the headers test two past, and the showcase ten past (SHOWCASE_PORT), clear of other projects' dev servers, one of
// which sat on 5204
const PORT = Number(process.env.PORT) || 5201;
const SHOWCASE_PORT = PORT + 10;

export default defineConfig({
  testDir: 'smoke',
  outputDir: 'test-results',
  timeout: 90_000,
  fullyParallel: false,
  workers: 1,
  reporter: [['list']],
  // the pictures the look tests are held to, kept by name in smoke/screens; they are this machine's GPU
  snapshotPathTemplate: 'smoke/screens/{arg}{ext}',
  use: {
    baseURL: `http://localhost:${PORT}`,
    browserName: 'chromium',
    channel: 'chromium',
    launchOptions: { args: ['--enable-unsafe-webgpu'] },
    viewport: { width: 1280, height: 800 },
    screenshot: 'only-on-failure',
    trace: 'retain-on-failure',
  },
  webServer: [
    // the game as a player gets it: built from the code as it stands at the start of every run, so no run tests a stale
    // build or the dev server's own transforms (guardrails/checks/verification.md), and served by Vite's preview
    {
      command: `npx vite build --logLevel silent && npx vite preview --port ${PORT} --strictPort`,
      url: `http://localhost:${PORT}`,
      reuseExistingServer: false,
      timeout: 180_000,
    },
    // the models' showcase, which is a bench for building models and never ships, so is not in the build: the dev server
    // serves it to smoke/models.spec.ts alone
    {
      command: `npx vite --port ${SHOWCASE_PORT} --strictPort`,
      url: `http://localhost:${SHOWCASE_PORT}/showcase.html`,
      reuseExistingServer: false,
      timeout: 60_000,
    },
  ],
});
