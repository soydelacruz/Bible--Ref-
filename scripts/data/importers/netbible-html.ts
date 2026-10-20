import { BOOKS, type BookId } from '../../../src/core/bible/books.ts';
import { toOsisId } from '../../../src/core/bible/verse-ref.ts';
import { CANONICAL_VERSIFICATION } from '../../../src/core/bible/versification.ts';
import { elementAt } from '../../../src/core/lib/array.ts';
import { BOOK_CODES } from './ebible-vpl.ts';

/**
 * Reads the NET Bible's text out of the book HTML netbible.org serves (the `netTexts` resource, as
 * kept in the NET Bible study archive), and writes it as eBible verse-per-line text, so the
 * existing eBible importer builds it like any other translation.
 *
 * The HTML marks each verse with `<span id="netText_<Book>_<chapter>_<verse>" class="netVerse">`,
 * but it does not close those spans reliably: a poetic line often opens a new paragraph, and a new
 * span for the same verse, inside the last one. So no tree is built. Text belongs to the verse
 * whose marker came last, and a verse split over several lines is joined back together.
 *
 * Left out, as eBible leaves them out of its own text editions: verse and chapter numbers, the
 * note markers (`<sup>`), section headings, the acrostic letters heading the stanzas of
 * Lamentations, and the speakers named above the lines of the Song of Songs. Small capitals
 * ("Lord" for the divine name) are written as capitals, "LORD", as the other editions print them.
 */

/** Book names netbible.org uses where they differ from the app's. */
const NET_BOOK_ALIASES: Readonly<Record<string, BookId>> = { 'Song of Songs': 'Song' };

const BOOK_IDS_BY_NET_NAME: ReadonlyMap<string, BookId> = new Map([
  ...BOOKS.map((book): [string, BookId] => [book.name, book.id]),
  ...Object.entries(NET_BOOK_ALIASES),
]);

/** The app's book for a book name as netbible.org writes it, e.g. `1 Corinthians`. */
export function netBookId(name: string): BookId {
  const id = BOOK_IDS_BY_NET_NAME.get(name);
  if (id === undefined) {
    throw new Error(`NET: unknown book "${name}".`);
  }
  return id;
}

const TAG_PATTERN = /<(\/?)([a-zA-Z][a-zA-Z0-9]*)([^>]*)>/g;
const VERSE_ID_PATTERN = /\bid="netText_(.+?)_(\d+)_(\d+)"/;
const CLASS_PATTERN = /\bclass="([^"]*)"/;

const NAMED_ENTITIES: Readonly<Record<string, string>> = {
  amp: '&',
  apos: "'",
  gt: '>',
  lt: '<',
  nbsp: ' ',
  quot: '"',
};

function decodeEntities(text: string): string {
  return text.replace(/&(#x[0-9a-f]+|#\d+|[a-z]+);/gi, (entity, name: string) => {
    if (name.startsWith('#x') || name.startsWith('#X')) {
      return String.fromCodePoint(parseInt(name.slice(2), 16));
    }
    if (name.startsWith('#')) {
      return String.fromCodePoint(Number(name.slice(1)));
    }
    return NAMED_ENTITIES[name.toLowerCase()] ?? entity;
  });
}

/** Joins a verse's pieces into one line: single spaces, none before closing punctuation. */
function tidy(text: string): string {
  return decodeEntities(text)
    .replace(/\s+/g, ' ')
    .replace(/ ([,.;:!?)\]])/g, '$1')
    .replace(/([([]) /g, '$1')
    .trim();
}

type SpanKind = 'number' | 'smallCaps' | 'other';

/** Verse texts keyed by OSIS ID (e.g. `John.3.16`), in the order they appear. */
export function netVersesFromHtml(html: string): Map<string, string> {
  const pieces = new Map<string, string[]>();
  const spans: SpanKind[] = [];
  let verse: string | null = null;
  let noteDepth = 0;
  let boldDepth = 0;
  let inHeading = false;
  let paragraph = '';

  const keep = (text: string) => {
    if (verse === null || text === '') return;
    const skipped =
      noteDepth > 0 ||
      inHeading ||
      paragraph === 'lamhebrew' ||
      (paragraph === 'sosspeaker' && boldDepth > 0) ||
      spans.includes('number');
    if (skipped) return;
    const words = spans.includes('smallCaps') ? text.toUpperCase() : text;
    const list = pieces.get(verse) ?? [];
    list.push(words);
    pieces.set(verse, list);
  };

  let last = 0;
  for (const match of html.matchAll(TAG_PATTERN)) {
    keep(html.slice(last, match.index));
    last = match.index + match[0].length;
    const [, slash = '', rawName = '', attributes = ''] = match;
    const name = rawName.toLowerCase();
    const closing = slash === '/';
    const className = CLASS_PATTERN.exec(attributes)?.[1] ?? '';

    const id = closing ? null : VERSE_ID_PATTERN.exec(attributes);
    if (id) {
      const [, book = '', chapter = '', number = ''] = id;
      verse = toOsisId({
        book: netBookId(book.replace(/_/g, ' ')),
        chapter: Number(chapter),
        verse: Number(number),
      });
      // A verse resuming on a new line: its pieces are joined with a space between the lines.
      pieces.get(verse)?.push(' ');
    }

    switch (name) {
      case 'sup':
        noteDepth = Math.max(0, noteDepth + (closing ? -1 : 1));
        break;
      case 'b':
        boldDepth = Math.max(0, boldDepth + (closing ? -1 : 1));
        break;
      case 'div':
        if (closing) inHeading = false;
        else if (className.includes('paragraphtitle')) inHeading = true;
        break;
      case 'p':
        paragraph = closing ? '' : className.trim();
        break;
      case 'br':
        keep(' ');
        break;
      case 'span':
        if (closing) {
          spans.pop();
        } else if (/\b(vref|verseNumber|chapterNumber)\b/.test(className)) {
          spans.push('number');
        } else if (attributes.includes('smcaps')) {
          // A few spans carry their class escaped (`class=&quot;smcaps&quot;`): match either form.
          spans.push('smallCaps');
        } else {
          spans.push('other');
        }
        break;
      default:
        break;
    }
  }
  keep(html.slice(last));

  // The pieces are joined as the HTML has them: its own spaces separate the words, and none
  // belongs between a word and the dash or quotation mark set against it.
  return new Map([...pieces].map(([id, parts]) => [id, tidy(parts.join(''))]));
}

/**
 * The verses of the KJV versification the NET's text leaves out: the sixteen the BSB also leaves
 * out, and Acts 24:7, which the NET keeps in a note. Any other verse without text means the
 * archive or its markup changed, not the translation.
 */
export const NET_OMITTED_VERSES: ReadonlySet<string> = new Set([
  'Matt.17.21',
  'Matt.18.11',
  'Matt.23.14',
  'Mark.7.16',
  'Mark.9.44',
  'Mark.9.46',
  'Mark.11.26',
  'Mark.15.28',
  'Luke.17.36',
  'Luke.23.17',
  'John.5.4',
  'Acts.8.37',
  'Acts.15.34',
  'Acts.24.7',
  'Acts.28.29',
  'Rom.16.24',
  '2Cor.13.14',
]);

/**
 * The whole Bible as eBible verse-per-line text, `<BOOK> <chapter>:<verse> <text>`, one line for
 * every verse of the KJV versification. A verse the NET leaves out is written with no text, which
 * the importer records as omitted; a verse missing for any other reason is refused, so a parsing
 * failure cannot pass for an omission.
 */
export function netVerseLines(verses: ReadonlyMap<string, string>): string {
  const versification = CANONICAL_VERSIFICATION;
  const lines: string[] = [];
  const seen = new Set<string>();
  const missing: string[] = [];
  for (let index = 0; index < versification.verseCount; index += 1) {
    const ref = versification.refAt(index);
    const id = toOsisId(ref);
    seen.add(id);
    const code = elementAt(BOOK_CODES, versification.bookAt(index).ordinal);
    const text = verses.get(id) ?? '';
    if (text === '' && !NET_OMITTED_VERSES.has(id)) {
      missing.push(id);
    }
    lines.push(`${code} ${String(ref.chapter)}:${String(ref.verse)}${text ? ` ${text}` : ''}`);
  }
  const outside = [...verses.keys()].filter((id) => !seen.has(id));
  if (outside.length > 0) {
    throw new Error(
      `NET: verses outside the KJV versification: ${outside.slice(0, 5).join(', ')}.`,
    );
  }
  if (missing.length > 0) {
    throw new Error(
      `NET: no text for ${String(missing.length)} verses the NET does not leave out, e.g. ` +
        `${missing.slice(0, 5).join(', ')}. Has the archive's markup changed?`,
    );
  }
  return `${lines.join('\n')}\n`;
}
