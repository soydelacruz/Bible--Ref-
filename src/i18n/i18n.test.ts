import { describe, expect, it } from 'vitest';
import { BOOKS } from '../core/bible/books.ts';
import { GENRES } from '../core/bible/genres.ts';
import {
  bookNameCollisions,
  foldBookName,
  lookupBook,
  normalizeBookName,
} from '../core/bible/book-lookup.ts';
import { enBooks } from './books/en.ts';
import { ptBooks } from './books/pt.ts';
import { isLocaleId, LOCALE_IDS, matchLocale, type LocaleId } from './locale-id.ts';
import { en } from './messages/en.ts';
import type { Emphasized } from './messages/types.ts';
import { DEFAULT_LOCALE_ID, getLocale, LOCALE_LIST } from './registry.ts';
import { TRANSLATION_MANIFESTS } from '../translations/registry.ts';
import { message } from './translate.ts';

describe('locale ids', () => {
  it('recognises the languages the app speaks, and nothing else', () => {
    expect(isLocaleId('en')).toBe(true);
    expect(isLocaleId('pt')).toBe(true);
    expect(isLocaleId('pt-BR')).toBe(false);
    expect(isLocaleId('klingon')).toBe(false);
  });

  it('matches a browser’s list on the base language, most preferred first', () => {
    expect(matchLocale(['pt-BR', 'en-US'])).toBe('pt');
    expect(matchLocale(['pt-PT'])).toBe('pt');
    expect(matchLocale(['en-GB', 'pt'])).toBe('en');
    expect(matchLocale(['PT'])).toBe('pt');
  });

  it('matches nothing for a language it does not have', () => {
    expect(matchLocale(['ja', 'ko'])).toBeNull();
    expect(matchLocale([])).toBeNull();
  });
});

describe('the message catalogues', () => {
  it('has a locale for every id, each with its own name for itself', () => {
    expect(LOCALE_LIST).toHaveLength(LOCALE_IDS.length);
    for (const locale of LOCALE_LIST) {
      expect(locale.endonym.length).toBeGreaterThan(0);
      expect(locale.tag.length).toBeGreaterThan(0);
      // A tag `Intl` rejects is not a typo that shows up as odd formatting — `new
      // Intl.NumberFormat('pt_BR')` throws, and the first number on screen takes the app with it.
      expect(() => Intl.getCanonicalLocales(locale.tag), locale.id).not.toThrow();
      expect(Intl.getCanonicalLocales(locale.tag), locale.id).toEqual([locale.tag]);
    }
  });

  it('translates a message, and falls back to English for one it has not', () => {
    const portuguese = getLocale('pt');
    expect(message(portuguese, 'panel.close')).toBe('Fechar');
    const sparse = { ...portuguese, messages: {} };
    expect(message(sparse, 'panel.close')).toBe('Close');
  });

  it('keeps the arguments of a message that takes them', () => {
    expect(message(getLocale('en'), 'panel.copy')('John 3:16')).toBe('Copy John 3:16 with a link');
    expect(message(getLocale('pt'), 'panel.copy')('João 3:16')).toBe(
      'Copiar João 3:16 com um link',
    );
  });

  it('sets a summary line’s numbers apart from the words around them', () => {
    for (const locale of LOCALE_LIST) {
      const parts = message(locale, 'stats.verses')('31,102');
      expect(parts[0]).toEqual({ strong: '31,102' });
      expect(typeof parts[1]).toBe('string');
    }
  });

  it('tells a touch screen to tap a verse where it tells a mouse to click one', () => {
    for (const locale of LOCALE_LIST) {
      expect(message(locale, 'threads.hint.touch'), locale.id).not.toBe(
        message(locale, 'threads.hint'),
      );
    }
    expect(message(getLocale('en'), 'threads.hint.touch')).toContain('tap a verse');
    expect(message(getLocale('en'), 'threads.hint')).toContain('click a verse');
  });

  it('counts in the language’s own way, singular and plural', () => {
    const more = message(getLocale('pt'), 'panel.moreVerses');
    expect(more('1', 1)).toContain('1 versículo');
    expect(more('3', 3)).toContain('3 versículos');
  });

  /**
   * Languages whose catalogue is allowed to be incomplete, with the English fallback showing
   * through. Being on this list is a decision — a half-translated language is better than none
   * — and being off it is a promise that CI keeps.
   */
  const WORK_IN_PROGRESS: readonly LocaleId[] = [];

  it.each(LOCALE_LIST.filter((locale) => !WORK_IN_PROGRESS.includes(locale.id)))(
    'translates every English key into $id, so nothing is half-done in a shipped language',
    (locale) => {
      const missing = Object.keys(en).filter((key) => !(key in locale.messages));
      expect(missing).toEqual([]);
    },
  );

  it.each(LOCALE_LIST)('has no $id key that English does not define', (locale) => {
    const extra = Object.keys(locale.messages).filter((key) => !(key in en));
    expect(extra).toEqual([]);
  });

  it.each(LOCALE_LIST)('gives $id a book catalogue no two books share a spelling in', (locale) => {
    expect(bookNameCollisions(locale.books)).toEqual([]);
  });
});

describe('every message, in every language', () => {
  /**
   * Walks the whole catalogue and renders each message. A message that takes arguments is a
   * small function, and a mistake in one — a wrong argument name, a template that throws — is
   * invisible until the screen that uses it is opened. This opens all of them at once.
   *
   * `1` stands in for every argument: it reads as a count and as a word, and it is the value
   * that picks the singular branch where a message has one.
   */
  /**
   * Asserts a rendered message actually says something.
   *
   * A message may return a string or an `Emphasized` array of segments, and the difference
   * matters: on an array, `.length` is the number of segments, so a check for `length > 0` passes
   * for `['', '']` — a message that renders to nothing at all. This flattens first.
   */
  function expectWords(rendered: string | Emphasized, key: string): void {
    expect(textOf(rendered).trim().length, key).toBeGreaterThan(0);
  }

  /** Flattens a rendered message to plain text. */
  function textOf(rendered: string | Emphasized): string {
    return typeof rendered === 'string'
      ? rendered
      : rendered.map((part) => (typeof part === 'string' ? part : part.strong)).join('');
  }

  /**
   * A value no message would contain by accident, so that a message which drops an argument can
   * be told from one that renders it.
   */
  const SENTINEL = '⟪arg⟫';

  function renderAll(messages: Readonly<Record<string, unknown>>): void {
    for (const [key, value] of Object.entries(messages)) {
      if (typeof value === 'string') {
        expect(value.length, key).toBeGreaterThan(0);
        continue;
      }
      expect(typeof value, key).toBe('function');
      const render = value as (...args: unknown[]) => string | Emphasized;
      const args = Array.from({ length: render.length }, () => 1);
      // Both forms, so a message with a singular and a plural branch is seen each way.
      expectWords(render(...args), key);
      expectWords(render(...args.map(() => 2)), key);

      // A translation may legitimately take fewer arguments than English — TypeScript allows it
      // and some languages need fewer. What it may not do is quietly stop showing one. Where the
      // English message puts an argument on screen, the translation has to as well, or a reader
      // gets "Copy with a link" where the reference should have been.
      const english = en[key as keyof typeof en];
      if (typeof english !== 'function') {
        continue;
      }
      const reference = english as (...args: unknown[]) => string | Emphasized;
      const marked = Array.from({ length: reference.length }, () => SENTINEL);
      if (!textOf(reference(...marked)).includes(SENTINEL)) {
        continue;
      }
      expect(
        textOf(render(...marked.slice(0, render.length))),
        `${key} drops its argument`,
      ).toContain(SENTINEL);
    }
  }

  it.each(LOCALE_LIST)('renders every message in $id', (locale) => {
    // Every language, not two named by hand: a catalogue nobody executes is a catalogue whose
    // first broken template a reader finds.
    renderAll({ ...en, ...locale.messages });
  });

  it('renders the messages whose arguments may be absent', () => {
    for (const locale of LOCALE_LIST) {
      expect(message(locale, 'stats.links')('1', null).length).toBeGreaterThan(0);
      expect(message(locale, 'stats.links')('1', '2').length).toBeGreaterThan(0);
    }
  });

  it('words stepping by a verse differently from stepping by a chapter', () => {
    for (const locale of LOCALE_LIST) {
      expect(message(locale, 'panel.previousVerse')).not.toBe(
        message(locale, 'panel.previousChapter'),
      );
      expect(message(locale, 'panel.nextVerse')).not.toBe(message(locale, 'panel.nextChapter'));
    }
  });
});

describe('book names', () => {
  it('names all 66 books in every language', () => {
    for (const locale of LOCALE_LIST) {
      expect(Object.keys(locale.books)).toHaveLength(BOOKS.length);
      for (const book of BOOKS) {
        expect(locale.books[book.id].name.length).toBeGreaterThan(0);
      }
    }
  });

  it('names all ten genres in every language', () => {
    for (const locale of LOCALE_LIST) {
      for (const genre of GENRES) {
        expect(locale.genres[genre.id].length).toBeGreaterThan(0);
      }
    }
  });

  it('gives Portuguese a short form for the axis, where the OSIS id would be wrong', () => {
    expect(ptBooks.Matt.abbreviation).toBe('Mt');
    expect(ptBooks.Rev.abbreviation).toBe('Ap');
    for (const book of BOOKS) {
      expect(ptBooks[book.id].abbreviation?.length).toBeGreaterThan(0);
    }
  });

  it('takes the English names from the canon rather than repeating them', () => {
    expect(enBooks.Gen.name).toBe('Genesis');
    expect(enBooks.Ps.referenceName).toBe('Psalm');
  });
});

describe('normalizeBookName', () => {
  it('keeps the accents, which are what tell two books apart', () => {
    expect(normalizeBookName('Gênesis')).toBe('gênesis');
    expect(normalizeBookName('Jó')).toBe('jó');
  });

  it('folds them away in the second pass, for a reader who types without them', () => {
    expect(foldBookName('Gênesis')).toBe('genesis');
    expect(foldBookName('Êxodo')).toBe('exodo');
    expect(foldBookName('Josué')).toBe('josue');
    expect(foldBookName('Jó')).toBe('jo');
  });

  it('still turns a roman numeral into a digit and drops spaces and dots', () => {
    expect(normalizeBookName('II Reis')).toBe('2reis');
    expect(normalizeBookName('1 Co.')).toBe('1co');
  });
});

describe('looking a book up in Portuguese', () => {
  const find = (query: string) => lookupBook(query, ptBooks);

  it('finds a book by its Portuguese name, accented or not', () => {
    for (const query of ['Gênesis', 'genesis', 'GÊNESIS']) {
      const result = find(query);
      expect(result.kind === 'found' && result.book.id).toBe('Gen');
    }
  });

  /**
   * `Jo` is the conventional abbreviation for João and the most-typed reference in Brazilian
   * Portuguese, while `Jó` is Job: the accent is the whole difference, which is why the lookup
   * matches what was typed before it folds anything away.
   */
  it('tells Jó from João, and both from Joel, Jonas and Josué', () => {
    for (const [query, id] of [
      ['Jo', 'John'],
      ['jo', 'John'],
      ['Jó', 'Job'],
      ['jó', 'Job'],
      ['job', 'Job'],
      ['joao', 'John'],
      ['João', 'John'],
      ['joel', 'Joel'],
      ['jonas', 'Jonah'],
      ['josue', 'Josh'],
      ['juizes', 'Judg'],
      ['judas', 'Jude'],
    ] as const) {
      const result = find(query);
      expect(result.kind === 'found' && result.book.id).toBe(id);
    }
  });

  it('accepts the abbreviations a Brazilian actually types', () => {
    for (const [query, id] of [
      ['sl', 'Ps'],
      ['ap', 'Rev'],
      ['1co', '1Cor'],
      ['mt', 'Matt'],
      ['tg', 'Jas'],
    ] as const) {
      const result = find(query);
      expect(result.kind === 'found' && result.book.id).toBe(id);
    }
  });

  it('still answers by OSIS id, which is what the app’s own links use', () => {
    const result = find('Rev');
    expect(result.kind === 'found' && result.book.id).toBe('Rev');
  });

  it('builds each language’s index and answers from it', () => {
    // `bookNameCollisions` above is what proves no two books share a spelling — `buildIndex`
    // stopped throwing on a duplicate, because that throw landed in the search box's submit
    // handler where nothing catches it. This checks the index is built and usable at all.
    for (const locale of LOCALE_LIST) {
      expect(lookupBook('Gen', locale.books).kind).toBe('found');
    }
  });
});

describe('the default locale', () => {
  it('is the language the source is written in', () => {
    expect(DEFAULT_LOCALE_ID).toBe('en');
    expect(getLocale(DEFAULT_LOCALE_ID).messages).toBe(en);
  });
});

describe('the translation credits', () => {
  /**
   * The credit exists twice over: in the manifest, which is what the generated dataset carries
   * for anyone who reads the file on its own, and in the catalogue, which is what the app shows
   * a reader in their own language. The English pair has to agree, or one of them is wrong.
   */
  it('says the same thing in the manifest and in English', () => {
    for (const manifest of TRANSLATION_MANIFESTS) {
      expect(message(getLocale('en'), `attribution.${manifest.id}`)).toBe(manifest.attribution);
    }
  });

  it('credits every translation in every language', () => {
    for (const locale of LOCALE_LIST) {
      for (const manifest of TRANSLATION_MANIFESTS) {
        const credit = message(locale, `attribution.${manifest.id}`);
        expect(credit.length, `${locale.id}/${manifest.id}`).toBeGreaterThan(0);
        // Whatever else it says, a credit has to name the work it credits.
        expect(credit, `${locale.id}/${manifest.id}`).toContain(manifest.name);
      }
    }
  });
});
