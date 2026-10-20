/// <reference types="vitest/config" />
import { resolve } from 'node:path';
import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';
import { analytics } from './vite/analytics.ts';
import { firstFrame } from './vite/first-frame.ts';
import { offline } from './vite/offline.ts';
import { DEPLOY_BASE, PAGES, ROOT_DIR, SITE_NAME, SITE_URL } from './vite/site.ts';
import { siteHead } from './vite/site-head.ts';

// https://vite.dev/config/
export default defineConfig(({ command, isPreview = false }) => ({
  // The dev server runs at the root; builds, and their preview, at the deployed sub-path, so a
  // path that ignores the base breaks in `npm run preview` rather than in production. Runtime code
  // builds every URL from `import.meta.env.BASE_URL`.
  base: process.env['BASE_PATH'] ?? (command === 'build' || isPreview ? DEPLOY_BASE : '/'),
  define: {
    'import.meta.env.SITE_NAME': JSON.stringify(SITE_NAME),
    'import.meta.env.SITE_URL': JSON.stringify(SITE_URL),
  },
  plugins: [react(), siteHead(), firstFrame(), offline(), analytics()],
  build: {
    // Three.js alone is ~550 kB minified (~140 kB gzipped); only the WebGL pages load it.
    chunkSizeWarningLimit: 600,
    rolldownOptions: {
      input: Object.fromEntries(
        Object.entries(PAGES).map(([name, { entry }]) => [name, resolve(ROOT_DIR, entry)]),
      ),
      output: {
        // Named vendor chunks: cacheable across pages and readable in the build report.
        codeSplitting: {
          groups: [
            { name: 'three', test: /node_modules[\\/]three[\\/]/ },
            { name: 'react', test: /node_modules[\\/](react|react-dom|scheduler)[\\/]/ },
          ],
        },
      },
    },
  },
  test: {
    include: [
      'src/**/*.test.{ts,tsx}',
      'scripts/**/*.test.ts',
      'vite/**/*.test.ts',
      'tests/**/*.test.ts',
    ],
    // A DOM for the components; the pipeline's tests use Node's APIs, which are still here.
    environment: 'happy-dom',
    setupFiles: ['./src/test-utils/setup.ts'],
    coverage: {
      provider: 'v8',
      reporter: ['text-summary', 'html', 'lcov'],
      include: ['src/**/*.{ts,tsx}', 'scripts/data/**/*.ts', 'vite/**/*.ts'],
      // The gate: `npm run check` fails below these, so a change that adds untested code is
      // caught before review. Branches sit lower on purpose — `noUncheckedIndexedAccess` makes
      // TypeScript demand a fallback on every array read (`counts[verse] ?? 0`), and most of
      // those fallbacks cannot happen, so the last few points would be tests of nothing.
      thresholds: { statements: 98, lines: 98, functions: 98, branches: 88 },
      exclude: [
        '**/*.test.{ts,tsx}',
        'src/test-utils/**',
        'src/env.d.ts',
        // Entry points: they run on import, so importing them is running them.
        'src/app/main.tsx',
        'src/features/debug/main.tsx',
        'src/features/cross/main.ts',
        'scripts/data/build.ts',
        'scripts/data/fetch.ts',
        'scripts/data/extract-netbible.ts',
        // Drawing code that needs a GPU: a WebGL context, shaders and canvas painting cannot be
        // exercised in this environment, and a mock of them would test the mock.
        'src/visualizations/arcs/arc-scene.ts',
        'src/visualizations/arcs/arc-shaders.ts',
        'src/visualizations/arcs/arcs-controller.ts',
        'src/visualizations/arcs/axis-painter.ts',
        'src/visualizations/arcs/ArcsStage.tsx',
        'src/visualizations/shared/components/LoadingArcs.tsx',
        'src/visualizations/threads/threads-drawing.ts',
        'src/visualizations/threads/ThreadsStage.tsx',
        'src/visualizations/clusters/clusters-drawing.ts',
        'src/visualizations/clusters/ClustersStage.tsx',
        'src/visualizations/shared/glow.ts',
        'src/visualizations/shared/instanced-templates.ts',
        'src/visualizations/shared/webgl.ts',
        'src/features/cross/cross-scene.ts',
        // Touch choreography and the views that host a GPU canvas. A fake DOM can be made to
        // report any pointer path and any transform, so a test here would mostly be checking
        // the fake; these are covered by the end-to-end suite in a real browser instead
        // (tests/e2e/, `npm run test:e2e`).
        'src/visualizations/shared/use-bottom-sheet.ts',
        'src/visualizations/arcs/ArcsExplorer.tsx',
        'src/visualizations/threads/ThreadsExplorer.tsx',
        'src/visualizations/clusters/ClustersExplorer.tsx',
        'src/app/Explorer.tsx',
      ],
    },
  },
}));
