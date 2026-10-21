import type { HtmlTagDescriptor, Plugin } from 'vite';
import { defaultTranslationFor } from '../src/translations/default-for-locale.ts';
import { crossReferencesDatasetPath, translationDatasetPath } from '../src/core/datasets/paths.ts';
import { DEFAULT_LOCALE_ID, LOCALE_IDS } from '../src/i18n/locale-id.ts';
import { LOCALE_STORAGE_KEY, TRANSLATION_STORAGE_KEY } from '../src/shared/lib/preference-keys.ts';
import { TRANSLATION_MANIFESTS } from '../src/translations/registry.ts';
import { vizCrossReferenceSource } from '../src/visualizations/shared/viz-datasets.ts';
import {
  atEndOfHead,
  AUTHOR,
  PAGES,
  pageOf,
  pageUrl,
  SITE_NAME,
  SITE_ORIGIN,
  SOCIAL_IMAGE,
} from './site.ts';

/**
 * Completes every page's head: icons and theme color; for listed pages, the canonical URL, Open
 * Graph and Twitter card tags (from the page's own title and description) and, on the home page,
 * structured data; for unlisted pages, `noindex`. Also writes `sitemap.xml` with the listed pages.
 */
export function siteHead(): Plugin {
  let base = '/';
  return {
    name: 'bible-cross-references:site-head',
    configResolved(config) {
      base = config.base;
    },
    transformIndexHtml(html, context) {
      const tags: HtmlTagDescriptor[] = [
        { tag: 'link', attrs: { rel: 'icon', href: `${base}favicon.ico`, sizes: '32x32' } },
        { tag: 'link', attrs: { rel: 'icon', href: `${base}favicon.svg`, type: 'image/svg+xml' } },
        { tag: 'link', attrs: { rel: 'apple-touch-icon', href: `${base}apple-touch-icon.png` } },
        { tag: 'meta', attrs: { name: 'theme-color', content: '#0d0d0d' } },
      ];
      // The datasets start downloading with the page instead of after the scripts have run. Not
      // when the offline cache serves the page: it has them already, and Chrome can't hand a
      // preload over to the app's own request through a service worker (it would read them twice).
      //
      // Which Bible to preload depends on the reader, and the reader is only known here, in
      // the browser: the HTML is one file for everybody. Guessing wrong is expensive — the wrong
      // text is ~3.8 MB downloaded on top of the ~3.8 MB that is actually read.
      //
      // This has to answer exactly what `initialTranslationId` answers: the address's `?t=`,
      // then the stored choice, then the language's own Bible — where the language is the
      // address's `?lang=`, then the stored one, then the browser's. `vite/plugins.test.ts`
      // runs this script against that function to keep the two from drifting, which they did
      // the first time this was written.
      const shared = `${base}${crossReferencesDatasetPath(vizCrossReferenceSource().id)}`;
      const preload = {
        shared,
        byTranslation: Object.fromEntries(
          TRANSLATION_MANIFESTS.map((manifest) => [
            manifest.id,
            `${base}${translationDatasetPath(manifest.id)}`,
          ]),
        ),
        byLocale: Object.fromEntries(
          LOCALE_IDS.map((id) => [
            id,
            `${base}${translationDatasetPath(defaultTranslationFor(id))}`,
          ]),
        ),
        fallback: `${base}${translationDatasetPath(defaultTranslationFor(DEFAULT_LOCALE_ID))}`,
        localeKey: LOCALE_STORAGE_KEY,
        translationKey: TRANSLATION_STORAGE_KEY,
      };
      tags.push({ tag: 'script', children: preloadScript(preload) });
      const page = pageOf(context.path);
      if (!page?.listed) {
        tags.push({ tag: 'meta', attrs: { name: 'robots', content: 'noindex' } });
        return atEndOfHead(tags);
      }
      const title = /<title>([^<]*)<\/title>/.exec(html)?.[1] ?? SITE_NAME;
      const description = /<meta\s+name="description"\s+content="([^"]*)"/.exec(html)?.[1] ?? '';
      const url = pageUrl(page, base);
      const image = new URL(`${base}${SOCIAL_IMAGE.file}`, SITE_ORIGIN).href;
      const meta = (
        key: 'name' | 'property',
        name: string,
        content: string,
      ): HtmlTagDescriptor => ({
        tag: 'meta',
        attrs: { [key]: name, content },
      });
      tags.push(
        { tag: 'link', attrs: { rel: 'canonical', href: url } },
        meta('name', 'author', AUTHOR.name),
        meta('property', 'og:type', 'website'),
        meta('property', 'og:site_name', SITE_NAME),
        meta('property', 'og:locale', 'en_US'),
        meta('property', 'og:title', title),
        meta('property', 'og:description', description),
        meta('property', 'og:url', url),
        meta('property', 'og:image', image),
        meta('property', 'og:image:width', String(SOCIAL_IMAGE.width)),
        meta('property', 'og:image:height', String(SOCIAL_IMAGE.height)),
        meta('property', 'og:image:alt', SOCIAL_IMAGE.alt),
        meta('name', 'twitter:card', 'summary_large_image'),
        meta('name', 'twitter:title', title),
        meta('name', 'twitter:description', description),
        meta('name', 'twitter:image', image),
        meta('name', 'twitter:image:alt', SOCIAL_IMAGE.alt),
      );
      if (page === PAGES.main) {
        const structuredData = {
          '@context': 'https://schema.org',
          '@type': 'WebApplication',
          name: SITE_NAME,
          url,
          description,
          image,
          applicationCategory: 'ReferenceApplication',
          operatingSystem: 'Any',
          browserRequirements: 'Requires JavaScript and WebGL 2',
          isAccessibleForFree: true,
          inLanguage: 'en',
          author: { '@type': 'Person', name: AUTHOR.name, url: AUTHOR.url },
        };
        tags.push({
          tag: 'script',
          attrs: { type: 'application/ld+json' },
          children: JSON.stringify(structuredData),
        });
      }
      return atEndOfHead(tags);
    },
    generateBundle() {
      const urls = Object.values(PAGES)
        .filter(({ listed }) => listed)
        .map((page) => `  <url><loc>${pageUrl(page, base)}</loc></url>`);
      this.emitFile({
        type: 'asset',
        fileName: 'sitemap.xml',
        source: [
          '<?xml version="1.0" encoding="UTF-8"?>',
          '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">',
          ...urls,
          '</urlset>',
          '',
        ].join('\n'),
      });
    },
  };
}

/** What the inline preload script needs to make the same choice the app will. */
interface PreloadPlan {
  readonly shared: string;
  readonly byTranslation: Readonly<Record<string, string>>;
  readonly byLocale: Readonly<Record<string, string>>;
  readonly fallback: string;
  readonly localeKey: string;
  readonly translationKey: string;
}

/**
 * The script that starts the datasets downloading before the app has parsed.
 *
 * Written as a string because it has to run before any module does. `Object.keys` rather than
 * `in` throughout: `in` finds `toString` on the prototype of a plain object, so `?lang=toString`
 * would otherwise preload a URL made from a function's source text.
 */
export function preloadScript(plan: PreloadPlan): string {
  return [
    'if (!navigator.serviceWorker?.controller) {',
    `  const plan = ${JSON.stringify(plan)};`,
    '  const read = (key) => { try { return localStorage.getItem(key); } catch { return null; } };',
    '  const pick = (map, key) => (key !== null && Object.keys(map).includes(key) ? map[key] : null);',
    '  const params = new URL(location.href).searchParams;',
    '  const lang =',
    '    pick(plan.byLocale, params.get("lang")) !== null',
    '      ? params.get("lang")',
    '      : pick(plan.byLocale, read(plan.localeKey)) !== null',
    '        ? read(plan.localeKey)',
    '        : (navigator.languages || [])',
    '            .map((tag) => String(tag).toLowerCase().split("-")[0])',
    '            .find((tag) => Object.keys(plan.byLocale).includes(tag)) ?? null;',
    '  const text =',
    '    pick(plan.byTranslation, params.get("t")) ??',
    '    pick(plan.byTranslation, read(plan.translationKey)) ??',
    '    pick(plan.byLocale, lang) ??',
    '    plan.fallback;',
    '  for (const href of [plan.shared, text]) {',
    '    const link = document.createElement("link");',
    '    link.rel = "preload"; link.as = "fetch"; link.crossOrigin = "anonymous";',
    '    link.href = href; document.head.append(link);',
    '  }',
    '}',
  ].join('\n');
}
