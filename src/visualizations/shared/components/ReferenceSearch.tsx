import { useEffect, useId, useRef, useState, useSyncExternalStore, type SubmitEvent } from 'react';
import { passageFromReference, versePassage, type Passage } from '../../../core/bible/passage.ts';
import { formatVerseRef } from '../../../core/bible/reference-format.ts';
import { parseReference } from '../../../core/bible/reference-parse.ts';
import type { VerseIndex } from '../../../core/bible/verse-ref.ts';
import type { Versification } from '../../../core/bible/versification.ts';
import { describeReferenceError } from '../../../i18n/describe-reference-error.ts';
import { useLocalization } from '../../../i18n/use-locale.tsx';
import { CloseIcon, SearchIcon } from '../../../shared/ui/icons.tsx';
import type { Translation } from '../../../translations/translation.ts';
import styles from './controls.module.css';

/** More than a reader scrolls through; past this, the box asks for a narrower search instead. */
const MAX_RESULTS = 100;

/** Phones, where the box starts too narrow for its example (the width controls.module.css uses). */
const NARROW_SCREEN = '(max-width: 47.99rem)';

/** Follows the narrow-screen query as the window is resized or turned. */
function subscribeToNarrowScreen(onChange: () => void): () => void {
  const list = window.matchMedia(NARROW_SCREEN);
  list.addEventListener('change', onChange);
  return () => {
    list.removeEventListener('change', onChange);
  };
}

function isNarrowScreen(): boolean {
  return window.matchMedia(NARROW_SCREEN).matches;
}

/**
 * What the box says under itself. A reference it cannot open is an `error`; a search that finds
 * nothing is a `notice`, an answer rather than a mistake, and is not dressed as one.
 */
interface BoxMessage {
  readonly text: string;
  readonly tone: 'error' | 'notice';
}

interface ReferenceSearchProps {
  readonly versification: Versification;
  /** The text being read: what the box searches when it is given words rather than a reference. */
  readonly translation?: Translation | undefined;
  readonly onSelect: (passage: Passage) => void;
}

interface TextResults {
  readonly query: string;
  readonly totalCount: number;
  readonly verses: readonly VerseIndex[];
}

/**
 * Words a reader typed, without the quotation marks they may have put round them to search for a
 * book's name rather than open it (`"mark"`).
 */
function searchWords(input: string): string {
  return input.trim().replace(/^["“”]+|["“”]+$/g, '');
}

/**
 * "Go to" box: accepts references such as `John 3:16`, `jn 3 16`, `Ps 23` or `Gen.1.1`, and
 * otherwise searches the text being read for the words, e.g. `living water`.
 */
export function ReferenceSearch({ versification, translation, onSelect }: ReferenceSearchProps) {
  const localization = useLocalization();
  const { t, books } = localization;
  const [message, setMessage] = useState<BoxMessage | null>(null);
  const [results, setResults] = useState<TextResults | null>(null);
  // On a phone the example is cut to "Joh", so the empty box says only what it is for; once it
  // has focus, the reader is about to type and the full example shows.
  const isNarrow = useSyncExternalStore(subscribeToNarrowScreen, isNarrowScreen);
  const [isFocused, setIsFocused] = useState(false);
  const messageId = useId();
  const resultsId = useId();
  const formRef = useRef<HTMLFormElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  // The results close when the reader turns elsewhere, as a menu does.
  useEffect(() => {
    if (results === null) {
      return undefined;
    }
    const closeOutside = (event: PointerEvent) => {
      if (event.target instanceof Node && !formRef.current?.contains(event.target)) {
        setResults(null);
      }
    };
    document.addEventListener('pointerdown', closeOutside);
    return () => {
      document.removeEventListener('pointerdown', closeOutside);
    };
  }, [results]);

  const finish = (passage: Passage) => {
    setMessage(null);
    setResults(null);
    formRef.current?.reset();
    if (document.activeElement instanceof HTMLElement) {
      document.activeElement.blur(); // Closes the on-screen keyboard on phones.
    }
    onSelect(passage);
  };

  const handleSubmit = (event: SubmitEvent<HTMLFormElement>) => {
    event.preventDefault();
    const input = new FormData(event.currentTarget).get('reference');
    const typed = typeof input === 'string' ? input : '';
    const quoted = /^\s*["“]/.test(typed);
    const result = quoted ? null : parseReference(typed, versification, books);
    if (result?.ok) {
      finish(passageFromReference(result.reference, versification));
      return;
    }
    // Words rather than a reference: a book that is not there, or nothing shaped like one. A
    // reference that names a real book but a chapter or verse it lacks is a mistyped reference,
    // and the reader is better served by being told so than by a search for "John 3:99".
    const words = searchWords(typed);
    const searchable =
      translation !== undefined &&
      words !== '' &&
      (result === null ||
        result.error.kind === 'unreadable' ||
        result.error.kind === 'unknown-book');
    const found = searchable ? translation.search(words, MAX_RESULTS) : null;
    if (found !== null && found.totalCount > 0) {
      setMessage(null);
      setResults({ query: words, ...found });
      return;
    }
    setResults(null);
    if (result === null || (searchable && result.error.kind === 'unreadable')) {
      setMessage({ text: t('search.noResults')(words), tone: 'notice' });
    } else if (typed.trim() !== '') {
      setMessage({ text: describeReferenceError(result.error, localization), tone: 'error' });
    }
  };

  return (
    <form
      ref={formRef}
      role="search"
      className={styles.search}
      onSubmit={handleSubmit}
      onKeyDown={(event) => {
        if (event.key === 'Escape' && results !== null) {
          setResults(null);
          inputRef.current?.focus();
        }
      }}
    >
      <SearchIcon className={styles.searchIcon} />
      <input
        ref={inputRef}
        name="reference"
        type="search"
        className={styles.input}
        placeholder={
          isNarrow && !isFocused ? t('search.placeholder.short') : t('search.placeholder')
        }
        aria-label={t('search.label')}
        aria-invalid={message?.tone === 'error'}
        aria-describedby={message === null ? undefined : messageId}
        aria-controls={results === null ? undefined : resultsId}
        autoComplete="off"
        // The longest real reference is ~25 characters; this only bounds what a paste can hand
        // the parser, whose book pattern is quadratic in the length of what it is given.
        maxLength={120}
        enterKeyHint="go"
        onChange={() => {
          setMessage(null);
        }}
        onFocus={() => {
          setIsFocused(true);
        }}
        onBlur={() => {
          setIsFocused(false);
        }}
      />
      {message !== null &&
        (message.tone === 'error' ? (
          <p id={messageId} role="alert" className={styles.error}>
            {message.text}
          </p>
        ) : (
          <p id={messageId} role="status" className={styles.notice}>
            {message.text}
          </p>
        ))}
      {results !== null && translation !== undefined && (
        <SearchResults
          id={resultsId}
          results={results}
          translation={translation}
          versification={versification}
          onSelect={(verse) => {
            finish(versePassage(verse));
          }}
          onClose={() => {
            setResults(null);
            inputRef.current?.focus();
          }}
        />
      )}
    </form>
  );
}

function SearchResults({
  id,
  results,
  translation,
  versification,
  onSelect,
  onClose,
}: {
  readonly id: string;
  readonly results: TextResults;
  readonly translation: Translation;
  readonly versification: Versification;
  readonly onSelect: (verse: VerseIndex) => void;
  readonly onClose: () => void;
}) {
  const { t, books, n } = useLocalization();
  const { query, totalCount, verses } = results;
  return (
    <div id={id} className={styles.results} role="region" aria-label={t('search.results.label')}>
      <div className={styles.resultsHeader}>
        <p role="status" className={styles.resultsCount}>
          {t('search.results')(n(totalCount), totalCount, query)}
          {totalCount > verses.length && ` ${t('search.results.limited')(n(verses.length))}`}
        </p>
        <button
          type="button"
          className={styles.resultsClose}
          aria-label={t('search.results.close')}
          onClick={onClose}
        >
          <CloseIcon />
        </button>
      </div>
      <ul className={styles.resultsList}>
        {verses.map((verse) => (
          <li key={verse}>
            <button
              type="button"
              className={styles.result}
              onClick={() => {
                onSelect(verse);
              }}
            >
              <strong>{formatVerseRef(versification.refAt(verse), books)}</strong>
              <span lang={translation.manifest.language} dir={translation.manifest.direction}>
                <Highlighted text={translation.verseText(verse)} query={query} />
              </span>
            </button>
          </li>
        ))}
      </ul>
    </div>
  );
}

/**
 * The verse with the words searched for marked. The search itself also ignores quote styles and
 * the brackets of supplied words, so a match it found is not always one a plain search of the
 * text can place; that verse is shown unmarked rather than marked in the wrong place.
 */
function Highlighted({ text, query }: { readonly text: string; readonly query: string }) {
  const at = text.toLowerCase().indexOf(query.toLowerCase().replace(/\s+/g, ' '));
  if (at < 0) {
    return text;
  }
  const end = at + query.length;
  return (
    <>
      {text.slice(0, at)}
      <mark className={styles.match}>{text.slice(at, end)}</mark>
      {text.slice(end)}
    </>
  );
}
