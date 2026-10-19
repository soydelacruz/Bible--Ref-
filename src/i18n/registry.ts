import type { GenreId } from '../core/bible/genres.ts';
import { enBooks } from './books/en.ts';
import { esBooks } from './books/es.ts';
import { ptBooks } from './books/pt.ts';
import type { BookNames } from './books/types.ts';
import { enGenres } from './genres/en.ts';
import { esGenres } from './genres/es.ts';
import { enInstall } from './install/en.tsx';
import { esInstall } from './install/es.tsx';
import { ptInstall } from './install/pt.tsx';
import type { InstallGuides } from './install/types.ts';
import { ptGenres } from './genres/pt.ts';
import { en } from './messages/en.ts';
import { es } from './messages/es.ts';
import { pt } from './messages/pt.ts';
import type { LocaleMessages } from './messages/types.ts';
import { DEFAULT_LOCALE_ID, type LocaleId } from './locale-id.ts';
import { LOCALE_TAGS } from './locale-tags.ts';

export interface Locale {
  readonly id: LocaleId;
  /** BCP 47 tag, for `<html lang>` and for `Intl` formatting. */
  readonly tag: string;
  /** The language's name in itself — what the picker shows, because its reader reads it. */
  readonly endonym: string;
  readonly messages: LocaleMessages;
  readonly books: BookNames;
  readonly genres: Readonly<Record<GenreId, string>>;
  readonly install: InstallGuides;
}

const LOCALES: Readonly<Record<LocaleId, Locale>> = {
  en: {
    id: 'en',
    ...LOCALE_TAGS.en,
    messages: en,
    books: enBooks,
    genres: enGenres,
    install: enInstall,
  },
  pt: {
    id: 'pt',
    ...LOCALE_TAGS.pt,
    messages: pt,
    books: ptBooks,
    genres: ptGenres,
    install: ptInstall,
  },
  es: {
    id: 'es',
    ...LOCALE_TAGS.es,
    messages: es,
    books: esBooks,
    genres: esGenres,
    install: esInstall,
  },
};

export { DEFAULT_LOCALE_ID };

/** Every locale, in the order a picker lists them. */
export const LOCALE_LIST: readonly Locale[] = Object.values(LOCALES);

export function getLocale(id: LocaleId): Locale {
  return LOCALES[id];
}

/** The locale the app falls back to, and the language its own source is written in. */
