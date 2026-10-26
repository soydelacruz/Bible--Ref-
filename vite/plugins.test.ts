import { mkdtemp, mkdir, writeFile } from 'node:fs/promises';
import { runInNewContext } from 'node:vm';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { Plugin } from 'vite';
import { describe, expect, it } from 'vitest';
import { analytics } from './analytics.ts';
import { firstFrame } from './first-frame.ts';
import { offline } from './offline.ts';
import { PAGES } from './site.ts';
import { preloadScript, siteHead } from './site-head.ts';
import { DEFAULT_LOCALE_ID, LOCALE_IDS } from '../src/i18n/locale-id.ts';
import { translationDatasetPath } from '../src/core/datasets/paths.ts';
import { defaultTranslationFor } from '../src/translations/default-for-locale.ts';
import { initialChoice } from '../src/app/initial-choice.ts';
import { TRANSLATION_MANIFESTS } from '../src/translations/registry.ts';
import { LOCALE_STORAGE_KEY, TRANSLATION_STORAGE_KEY } from '../src/shared/lib/preference-keys.ts';

const APP_PAGE = Object.values(PAGES).find((page) => page.app);
const PAGE_PATH = `/${APP_PAGE?.entry ?? 'index.html'}`;

/** What these plugins hand back: the page rewritten, tags to add, or both. */
type IndexHtmlResult = string | { html: string; tags: unknown[] };
type IndexHtmlHandler = (html: string, context: { path: string }) => IndexHtmlResult;

/** Calls a plugin hook that may be a function or an object with a handler. */
function hook(plugin: Plugin, name: 'transformIndexHtml'): IndexHtmlHandler {
  const value = plugin[name];
  return (typeof value === 'function' ? value : value?.handler) as IndexHtmlHandler;
}

function resolveConfig(plugin: Plugin, command: 'build' | 'serve', base = '/'): void {
  const configResolved = plugin.configResolved;
  const handler = typeof configResolved === 'function' ? configResolved : configResolved?.handler;
  void handler?.call({} as never, { command, base } as never);
}

const HTML = '<html><head><title>t</title></head><body><div id="root"></div></body></html>';

describe('analytics', () => {
  it('adds the tag to a built page', () => {
    const plugin = analytics();
    resolveConfig(plugin, 'build');
    const tags = hook(plugin, 'transformIndexHtml')(HTML, { path: PAGE_PATH });
    expect(JSON.stringify(tags)).toContain('googletagmanager.com');
  });

  it("reports only from the site's own origin, so forks and previews send nothing", () => {
    const plugin = analytics();
    resolveConfig(plugin, 'build');
    const tags = hook(plugin, 'transformIndexHtml')(HTML, { path: PAGE_PATH });
    expect(JSON.stringify(tags)).toContain('trekhleb.dev');
  });

  it('adds nothing on the dev server', () => {
    const plugin = analytics();
    resolveConfig(plugin, 'serve');
    expect(
      hook(plugin, 'transformIndexHtml')(HTML, {
        path: PAGE_PATH,
      }),
    ).toEqual([]);
  });

  it('adds nothing to a file that is not a page', () => {
    const plugin = analytics();
    resolveConfig(plugin, 'build');
    expect(hook(plugin, 'transformIndexHtml')(HTML, { path: '/elsewhere.html' })).toEqual([]);
  });
});

describe('firstFrame', () => {
  const transform = () => hook(firstFrame(), 'transformIndexHtml');

  it('fills the empty root with the logo, so the first paint is not blank', () => {
    const result = transform()(HTML, { path: PAGE_PATH });
    expect(typeof result).not.toBe('string');
    if (typeof result === 'string') return;
    expect(result.html).toContain('first-frame');
    expect(result.html).toContain('<svg');
    expect(JSON.stringify(result.tags)).toContain('color-scheme');
  });

  it('moves stylesheets to the end of the body, so content paints before them', () => {
    const withCss = HTML.replace('</head>', '<link rel="stylesheet" href="/a.css"></head>');
    const result = transform()(withCss, { path: PAGE_PATH });
    if (typeof result === 'string') throw new Error('expected a transform result');
    expect(result.html.indexOf('/a.css')).toBeGreaterThan(result.html.indexOf('<body>'));
  });

  it('leaves a page it does not know alone', () => {
    expect(transform()(HTML, { path: '/other.html' })).toBe(HTML);
  });

  it('refuses a page without the empty root it needs to fill', () => {
    expect(() => transform()('<html><body></body></html>', { path: PAGE_PATH })).toThrow(
      /expected an empty/,
    );
  });
});

describe('siteHead', () => {
  it('adds the metadata a shared link needs', () => {
    const plugin = siteHead();
    resolveConfig(plugin, 'build', '/bible-cross-references/');
    const tags = JSON.stringify(
      hook(plugin, 'transformIndexHtml')(HTML, {
        path: PAGE_PATH,
      }),
    );
    expect(tags).toContain('canonical');
    expect(tags).toContain('og:');
    expect(tags).toContain('twitter:');
  });

  it('names SoyDeLaCruz as the author, with no Twitter handle', () => {
    const plugin = siteHead();
    resolveConfig(plugin, 'build', '/bible-cross-references/');
    const tags = JSON.stringify(
      hook(plugin, 'transformIndexHtml')(HTML, {
        path: PAGE_PATH,
      }),
    );
    expect(tags).toContain('"name":"author","content":"SoyDeLaCruz"');
    expect(tags).not.toContain('twitter:creator');
    expect(tags).not.toContain('Trekhleb');
  });

  it('gives every page its icons and a dataset preload', () => {
    const plugin = siteHead();
    resolveConfig(plugin, 'build', '/base/');
    const tags = JSON.stringify(
      hook(plugin, 'transformIndexHtml')(HTML, {
        path: PAGE_PATH,
      }),
    );
    expect(tags).toContain('/base/favicon.svg');
    expect(tags).toContain('theme-color');
    expect(tags).toContain('preload');
  });

  it('keeps an unlisted page out of search engines, and gives it no card', () => {
    const plugin = siteHead();
    resolveConfig(plugin, 'build', '/');
    const tags = JSON.stringify(
      hook(plugin, 'transformIndexHtml')(HTML, {
        path: '/debug/index.html',
      }),
    );
    expect(tags).toContain('noindex');
    expect(tags).not.toContain('og:title');
  });

  it('keeps an unknown file out of search engines too', () => {
    const plugin = siteHead();
    resolveConfig(plugin, 'build', '/');
    expect(
      JSON.stringify(
        hook(plugin, 'transformIndexHtml')(HTML, {
          path: '/nope.html',
        }),
      ),
    ).toContain('noindex');
  });

  it('emits a sitemap', () => {
    const plugin = siteHead();
    resolveConfig(plugin, 'build', '/bible-cross-references/');
    const emitted: { fileName?: string; source?: string }[] = [];
    const generate = plugin.generateBundle;
    const handler = typeof generate === 'function' ? generate : generate?.handler;
    void handler?.call(
      { emitFile: (file: { fileName?: string; source?: string }) => emitted.push(file) } as never,
      {} as never,
      {} as never,
      false,
    );
    const sitemap = emitted.find((file) => file.fileName === 'sitemap.xml');
    expect(sitemap?.source).toContain('<urlset');
  });
});

describe('offline', () => {
  it('emits a web app manifest that works under any base', () => {
    const plugin = offline();
    const emitted: { fileName?: string; source?: string }[] = [];
    const generate = plugin.generateBundle;
    const handler = typeof generate === 'function' ? generate : generate?.handler;
    void handler?.call(
      { emitFile: (file: { fileName?: string; source?: string }) => emitted.push(file) } as never,
      {} as never,
      {} as never,
      false,
    );
    const manifest = emitted.find((file) => file.fileName === 'manifest.webmanifest');
    const parsed: unknown = JSON.parse(manifest?.source ?? '{}');
    expect(parsed).toMatchObject({ start_url: './', scope: './', display: 'standalone' });
  });

  it('links the manifest from an app page of a build, and nowhere else', () => {
    const plugin = offline();
    resolveConfig(plugin, 'build', '/base/');
    const transform = hook(plugin, 'transformIndexHtml');
    expect(JSON.stringify(transform(HTML, { path: PAGE_PATH }))).toContain(
      '/base/manifest.webmanifest',
    );
    expect(transform(HTML, { path: '/debug/index.html' })).toEqual([]);
  });

  it('adds nothing on the dev server', () => {
    const plugin = offline();
    resolveConfig(plugin, 'serve', '/');
    expect(
      hook(plugin, 'transformIndexHtml')(HTML, {
        path: PAGE_PATH,
      }),
    ).toEqual([]);
  });

  it('writes a worker listing the files that are really on disk', async () => {
    // The bug this guards against: a worker that lists a file the build never wrote fails to
    // install, and the whole offline cache goes with it.
    const dir = await mkdtemp(join(tmpdir(), 'offline-test-'));
    await mkdir(join(dir, 'assets'), { recursive: true });
    await mkdir(join(dir, 'icons'), { recursive: true });
    await writeFile(join(dir, 'assets', 'main-abc.js'), 'console.log(1)');
    await writeFile(join(dir, 'assets', 'main-abc.css'), 'body{}');
    await writeFile(join(dir, 'assets', 'logo.woff2'), 'font');
    await writeFile(join(dir, 'manifest.webmanifest'), '{}');
    for (const icon of ['favicon.svg', 'favicon.ico', 'apple-touch-icon.png']) {
      await writeFile(join(dir, icon), 'x');
    }
    for (const icon of ['icon-192.png', 'icon-512.png', 'icon-maskable-512.png']) {
      await writeFile(join(dir, 'icons', icon), 'x');
    }
    for (const page of Object.values(PAGES)) {
      await mkdir(join(dir, page.entry, '..'), { recursive: true });
      await writeFile(join(dir, page.entry), '<html></html>');
    }

    const plugin = offline();
    const write = plugin.writeBundle;
    const handler = typeof write === 'function' ? write : write?.handler;
    await handler?.call({} as never, { dir } as never, {} as never);

    const { readFile } = await import('node:fs/promises');
    const worker = await readFile(join(dir, 'sw.js'), 'utf8');
    const files = JSON.parse(/const FILES = (\[.*?\]);/s.exec(worker)?.[1] ?? '[]') as string[];
    expect(files).toContain('assets/main-abc.js');
    expect(files).toContain('assets/main-abc.css');
    // Anything the bundler emits, not only code and styles.
    expect(files).toContain('assets/logo.woff2');
    expect(files).toContain('manifest.webmanifest');
    expect(files).not.toContain('sw.js');
    expect(worker).toContain('const VERSION = "');
    expect(worker).toContain('const PAGES = ');
  });
});

describe('the inline preload script', () => {
  /**
   * Runs the generated script the way a browser would, and reports what it preloaded.
   *
   * The script is a second implementation of a rule the app already owns, written as a string
   * because it has to run before any module parses. The only way to keep the two honest is to
   * execute it and compare its answer to the real function — which is how three disagreements
   * were found the first time, including one that downloaded an extra 3.8 MB on every shared
   * link that named a translation.
   */
  function preloadedBy(options: {
    readonly search?: string;
    readonly stored?: Readonly<Record<string, string>>;
    readonly languages?: readonly string[];
  }): readonly string[] {
    const href = `https://trekhleb.dev/bible-cross-references/${options.search ?? ''}`;
    const store = options.stored ?? {};
    return preloads(PLAN, {
      navigator: {
        serviceWorker: { controller: null },
        languages: options.languages ?? ['en-US'],
      },
      location: { href },
      localStorage: { getItem: (key: string) => store[key] ?? null },
      URL,
    });
  }

  /** Runs the script for `plan` in `scope`, with a document that records what it preloads. */
  function preloads(
    plan: Parameters<typeof preloadScript>[0],
    scope: Record<string, unknown>,
  ): readonly string[] {
    const hrefs: string[] = [];
    runInNewContext(preloadScript(plan), {
      ...scope,
      document: {
        createElement: () => ({ rel: '', as: '', crossOrigin: '', href: '' }),
        head: {
          append: (link: { href: string }) => {
            hrefs.push(link.href);
          },
        },
      },
    });
    return hrefs;
  }

  const PLAN = {
    shared: '/base/data/cross-references/openbible.json',
    withText: true,
    byTranslation: Object.fromEntries(
      TRANSLATION_MANIFESTS.map((manifest) => [
        manifest.id,
        `/base/${translationDatasetPath(manifest.id)}`,
      ]),
    ),
    byLocale: Object.fromEntries(
      LOCALE_IDS.map((id) => [id, `/base/${translationDatasetPath(defaultTranslationFor(id))}`]),
    ),
    fallback: `/base/${translationDatasetPath(defaultTranslationFor(DEFAULT_LOCALE_ID))}`,
    localeKey: LOCALE_STORAGE_KEY,
    translationKey: TRANSLATION_STORAGE_KEY,
  };

  /** What the app itself will load, from the one function that decides it. */
  function appWouldLoad(options: {
    readonly search?: string;
    readonly stored?: Readonly<Record<string, string>>;
    readonly languages?: readonly string[];
  }): string {
    const url = new URL(`https://trekhleb.dev/bible-cross-references/${options.search ?? ''}`);
    const store = options.stored ?? {};
    const { translation } = initialChoice(
      url.searchParams,
      {
        locale: store[LOCALE_STORAGE_KEY] ?? null,
        translation: store[TRANSLATION_STORAGE_KEY] ?? null,
      },
      options.languages ?? ['en-US'],
    );
    return `/base/${translationDatasetPath(translation)}`;
  }

  it.each([
    ['a plain visit', {}],
    ['a link naming a translation', { search: '?t=kjv' }],
    ['a link naming a language', { search: '?lang=pt' }],
    ['a link naming both', { search: '?t=kjv&lang=pt' }],
    ['a Portuguese browser', { languages: ['pt-BR'] }],
    ['a browser shouting its tag', { languages: ['PT-BR'] }],
    ['a stored translation', { stored: { [TRANSLATION_STORAGE_KEY]: 'kjv' } }],
    ['a stored language', { stored: { [LOCALE_STORAGE_KEY]: 'pt' } }],
    [
      'a stored translation and a link naming another',
      { search: '?t=bsb', stored: { [TRANSLATION_STORAGE_KEY]: 'kjv' } },
    ],
    ['a language the app does not speak', { search: '?lang=fr' }],
  ])('preloads what the app will load, for %s', (_name, options) => {
    expect(preloadedBy(options)).toEqual([PLAN.shared, appWouldLoad(options)]);
  });

  it('is not fooled by a parameter that names something on Object.prototype', () => {
    // `lang in byLocale` found `toString` and preloaded a URL built from a function's source.
    for (const key of ['toString', 'constructor', '__proto__', 'valueOf', 'hasOwnProperty']) {
      expect(preloadedBy({ search: `?lang=${key}` })).toEqual([PLAN.shared, PLAN.fallback]);
      expect(preloadedBy({ search: `?t=${key}` })).toEqual([PLAN.shared, PLAN.fallback]);
    }
  });

  it('does nothing at all when the offline cache is already serving the page', () => {
    const hrefs: string[] = [];
    runInNewContext(preloadScript(PLAN), {
      navigator: { serviceWorker: { controller: {} }, languages: ['en-US'] },
      location: { href: 'https://trekhleb.dev/bible-cross-references/' },
      localStorage: { getItem: () => null },
      document: {
        createElement: () => ({}),
        head: { append: (link: { href: string }) => hrefs.push(link.href) },
      },
      URL,
    });
    expect(hrefs).toEqual([]);
  });

  it('survives a browser that refuses storage, rather than taking the page down with it', () => {
    const hrefs = preloads(PLAN, {
      navigator: { serviceWorker: { controller: null }, languages: ['en-US'] },
      location: { href: 'https://trekhleb.dev/bible-cross-references/' },
      localStorage: {
        getItem: () => {
          throw new Error('storage is disabled');
        },
      },
      URL,
    });
    expect(hrefs).toEqual([PLAN.shared, PLAN.fallback]);
  });

  it('preloads only the links where the first screen is drawn from them', () => {
    // The text would take half of a slow connection from the download the picture waits for;
    // the app asks for it once the links are in.
    const hrefs = preloads(
      { ...PLAN, withText: false },
      {
        navigator: { serviceWorker: { controller: null }, languages: ['pt-BR'] },
        location: { href: 'https://trekhleb.dev/bible-cross-references/?t=kjv' },
        localStorage: { getItem: () => null },
        URL,
      },
    );
    expect(hrefs).toEqual([PLAN.shared]);
  });

  // The views that draw before the text has arrived (`drawsBeforeText`: Arcs and Clusters, which
  // src/app/app-shell.test.tsx pins on its side) are the pages that leave the text to the app.
  it.each([
    ['index.html', false],
    ['clusters/index.html', false],
    ['threads/index.html', true],
    ['debug/index.html', true],
  ])('decides on %s whether to preload the text: %s', (entry, withText) => {
    const plugin = siteHead();
    resolveConfig(plugin, 'build', '/');
    const tags = JSON.stringify(hook(plugin, 'transformIndexHtml')(HTML, { path: `/${entry}` }));
    expect(tags).toContain(`\\"withText\\":${String(withText)}`);
  });
});
