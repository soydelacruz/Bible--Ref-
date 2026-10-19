import { defineConfig, devices } from '@playwright/test';
import { DEPLOY_BASE } from './vite/site.ts';

/** Where `npm run preview` serves the built site, base path and all. */
const PORT = 4173;
export const BASE_URL = `http://localhost:${String(PORT)}${DEPLOY_BASE}`;

/**
 * End-to-end tests: the built site in a real browser.
 *
 * They cover what a fake DOM cannot answer honestly — the WebGL arcs, the bottom sheet's
 * gestures, the service worker, and how the layout holds at a given width — and they are the
 * reason those files are left out of the unit coverage thresholds (see vite.config.ts).
 */
export default defineConfig({
  testDir: 'tests/e2e',
  // A flow test that needs more than this is usually waiting for something it should assert on.
  timeout: 60_000,
  expect: {
    timeout: 15_000,
    toHaveScreenshot: {
      // The arcs are drawn by a software renderer here, which is not pixel-identical run to run,
      // and text antialiasing moves a little between machines. Big enough to absorb that, small
      // enough that a wrapped footer or a lost panel still fails.
      maxDiffPixelRatio: 0.02,
      animations: 'disabled',
      caret: 'hide',
      scale: 'css',
    },
  },
  fullyParallel: true,
  forbidOnly: Boolean(process.env['CI']),
  retries: process.env['CI'] ? 2 : 0,
  // Left to Playwright locally. On CI, half the runner's cores: every worker drives a Chromium that
  // draws WebGL on the CPU (swiftshader), so each needs a core of its own plus room for the
  // preview server. A fixed count does not travel: GitHub's runners have four cores for a public
  // repository and two for a private one, and two workers on two cores starved each other into
  // timeouts — the same commit took 8 minutes upstream and failed after 26 here.
  ...(process.env['CI'] ? { workers: '50%' } : {}),
  reporter: process.env['CI'] ? [['github'], ['html', { open: 'never' }]] : [['list']],
  use: {
    baseURL: BASE_URL,
    trace: 'on-first-retry',
    screenshot: 'only-on-failure',
    // The software renderer: the arcs are WebGL, and CI machines have no GPU.
    launchOptions: {
      args: ['--use-gl=swiftshader', '--enable-unsafe-swiftshader'],
      ...(process.env['CHROMIUM_PATH'] ? { executablePath: process.env['CHROMIUM_PATH'] } : {}),
    },
  },
  projects: [
    {
      name: 'desktop',
      use: { ...devices['Desktop Chrome'], viewport: { width: 1440, height: 900 } },
      testIgnore: /(offline|visual)\.spec\.ts/,
    },
    {
      name: 'phone',
      use: { ...devices['Pixel 7'] },
      // `responsive` too: it drives the viewport itself, so every one of its tests skipped here
      // at run time. A skipped test is not free — sharding counts it the same as a real one, so
      // a few dozen of them sent one machine home early while the others were still working.
      testIgnore: /(offline|visual|responsive)\.spec\.ts/,
    },
    // The offline tests install a service worker and edit the built `dist/sw.js` to stand in for
    // a new release, so they cannot share the site with anything else: their own project, running
    // once the rest have finished.
    {
      name: 'offline',
      use: { ...devices['Desktop Chrome'], viewport: { width: 1440, height: 900 } },
      testMatch: /offline\.spec\.ts/,
      dependencies: ['desktop', 'phone'],
    },
    // The gallery: a picture of every major screen, at the two sizes that matter. Kept out of
    // `npm run test:e2e` because a baseline is tied to the machine that drew it — see
    // tests/e2e/README.md. Run it with `npm run test:visual`.
    {
      name: 'visual-desktop',
      use: { ...devices['Desktop Chrome'], viewport: { width: 1440, height: 900 } },
      testMatch: /visual\.spec\.ts/,
    },
    {
      name: 'visual-phone',
      use: { ...devices['Pixel 7'] },
      testMatch: /visual\.spec\.ts/,
    },
  ],
  webServer: {
    command: 'npm run preview',
    url: BASE_URL,
    reuseExistingServer: !process.env['CI'],
    timeout: 120_000,
  },
});
