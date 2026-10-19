import { describe, expect, it } from 'vitest';
import {
  atEndOfHead,
  AUTHOR,
  DEPLOY_BASE,
  PAGES,
  pageOf,
  pageUrl,
  SITE_NAME,
  SITE_URL,
  SOCIAL_IMAGE,
} from './site.ts';

describe('the site', () => {
  it('is published under its own path of a shared domain', () => {
    expect(DEPLOY_BASE).toBe('/Bible--Ref-/');
    expect(SITE_URL.endsWith(DEPLOY_BASE)).toBe(true);
    expect(SITE_URL.startsWith('https://')).toBe(true);
  });

  it('names itself and its author', () => {
    expect(SITE_NAME).toBe('Bible Cross-References');
    expect(AUTHOR.name).toBeTruthy();
    expect(AUTHOR.url.startsWith('https://')).toBe(true);
    expect(SOCIAL_IMAGE.file).toMatch(/\.(png|jpe?g)$/);
    expect(SOCIAL_IMAGE.width).toBeGreaterThan(SOCIAL_IMAGE.height);
    expect(SOCIAL_IMAGE.alt).toBeTruthy();
  });
});

describe('PAGES', () => {
  it("lists the app's pages and the debug page", () => {
    const entries = Object.values(PAGES);
    expect(entries.length).toBeGreaterThanOrEqual(3);
    expect(entries.filter((page) => page.app).length).toBeGreaterThanOrEqual(2);
    expect(entries.some((page) => !page.app)).toBe(true);
  });

  it('gives every page an entry HTML file', () => {
    for (const page of Object.values(PAGES)) {
      expect(page.entry.endsWith('index.html')).toBe(true);
    }
  });
});

describe('pageOf', () => {
  it('finds a page by the path Vite hands it', () => {
    for (const page of Object.values(PAGES)) {
      expect(pageOf(`/${page.entry}`)).toBe(page);
    }
  });

  it('is undefined for anything that is not a page', () => {
    expect(pageOf('/some/other.html')).toBeUndefined();
    expect(pageOf('')).toBeUndefined();
  });
});

describe('pageUrl', () => {
  it('joins a page onto the base it is served from', () => {
    const [page] = Object.values(PAGES);
    expect(page && pageUrl(page, '/base/')).toContain('/base/');
  });

  it('drops the index.html, so a page is its directory', () => {
    for (const page of Object.values(PAGES)) {
      expect(pageUrl(page, '/')).not.toContain('index.html');
    }
  });
});

describe('atEndOfHead', () => {
  it('puts every tag at the end of the head', () => {
    const tags = atEndOfHead([
      { tag: 'link', attrs: { rel: 'manifest', href: '/m.webmanifest' } },
      { tag: 'meta', attrs: { name: 'x' } },
    ]);
    expect(tags).toHaveLength(2);
    for (const tag of tags) {
      expect(tag.injectTo).toBe('head');
    }
  });

  it('keeps what each tag already said', () => {
    const [tag] = atEndOfHead([{ tag: 'script', children: 'console.log(1)' }]);
    expect(tag?.tag).toBe('script');
    expect(tag?.children).toBe('console.log(1)');
  });

  it('handles an empty list', () => {
    expect(atEndOfHead([])).toEqual([]);
  });
});
