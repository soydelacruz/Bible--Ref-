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

/** Where one of the NET's notes is marked in its text. */
export interface NetNoteAnchor {
  /** The verse the marker is in, by OSIS ID. */
  readonly verse: string;
  /** How many characters of the verse's text come before the marker. */
  readonly at: number;
}

/** A book of the NET as its HTML gives it: the text of each verse, and where its notes are marked. */
export interface NetBookText {
  /** Verse texts keyed by OSIS ID (e.g. `John.3.16`), in the order they appear. */
  readonly verses: Map<string, string>;
  /** Where each of the book's notes is marked, by the NET's number for it within the book. */
  readonly notes: Map<number, NetNoteAnchor>;
}

/**
 * Stands for a note marker while a verse's pieces are joined (a private-use character, which the
 * text itself never contains), so that its place survives the tidying of the text around it.
 */
const MARKER = '';

/**
 * The places of the markers in a verse's tidied text. Tidying removes some spaces (before closing
 * punctuation, after an opening bracket), and a marker can keep a space from being removed, so
 * the text with markers is walked alongside the text without them.
 */
function placeMarkers(joined: string): { readonly text: string; readonly at: number[] } {
  const text = tidy(joined.replaceAll(MARKER, ''));
  const marked = tidy(joined);
  const at: number[] = [];
  let index = 0;
  for (const character of marked) {
    if (character === MARKER) {
      at.push(index);
      continue;
    }
    if (character !== ' ' && text[index] === ' ' && text[index + 1] === character) {
      // A space only the text has: the marker kept the tidying from seeing it the same way.
      index += 1;
    }
    if (text[index] === character) {
      index += 1;
    } else if (character !== ' ') {
      throw new Error(`NET: the text "${text}" does not line up with its note markers.`);
    }
  }
  return { text, at };
}

/** Verse texts keyed by OSIS ID (e.g. `John.3.16`), in the order they appear. */
export function netVersesFromHtml(html: string): Map<string, string> {
  return netBookFromHtml(html).verses;
}

/**
 * The text of a book of the NET, and the place of each note marker in it (`<sup><a
 * class="netNoteSuper">219</a></sup>`, the 219th note of the book). A marker in a part of the text
 * that is left out (a heading, an acrostic letter, a speaker's name) stands at the start of the
 * verse that follows it.
 */
export function netBookFromHtml(html: string): NetBookText {
  const pieces = new Map<string, string[]>();
  const markerOrder = new Map<string, number[]>();
  const notes = new Map<number, NetNoteAnchor>();
  const pending: number[] = [];
  const spans: SpanKind[] = [];
  let verse: string | null = null;
  let noteDepth = 0;
  let boldDepth = 0;
  let inHeading = false;
  let paragraph = '';
  let markerDigits: string | null = null;

  const leftOut = () =>
    inHeading ||
    paragraph === 'lamhebrew' ||
    (paragraph === 'sosspeaker' && boldDepth > 0) ||
    spans.includes('number');

  const push = (id: string, piece: string) => {
    const list = pieces.get(id) ?? [];
    list.push(piece);
    pieces.set(id, list);
  };

  const marked = new Set<number>();
  const mark = (id: string, number: number) => {
    if (marked.has(number)) {
      throw new Error(`NET: note ${String(number)} is marked more than once.`);
    }
    marked.add(number);
    push(id, MARKER);
    markerOrder.set(id, [...(markerOrder.get(id) ?? []), number]);
  };

  const keep = (text: string) => {
    if (markerDigits !== null) {
      markerDigits += text;
      return;
    }
    if (verse === null || text === '') return;
    if (noteDepth > 0 || leftOut()) return;
    push(verse, spans.includes('smallCaps') ? text.toUpperCase() : text);
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
      for (const number of pending.splice(0)) {
        mark(verse, number);
      }
    }

    switch (name) {
      case 'a':
        if (!closing && className.includes('netNoteSuper')) {
          markerDigits = '';
        } else if (closing && markerDigits !== null) {
          const number = Number(markerDigits.trim());
          markerDigits = null;
          if (!Number.isInteger(number) || number < 1) {
            throw new Error(`NET: a note marker has no number (${verse ?? 'before the text'}).`);
          }
          if (verse === null || leftOut()) {
            pending.push(number);
          } else {
            mark(verse, number);
          }
        }
        break;
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
  if (pending.length > 0) {
    throw new Error(`NET: notes ${pending.join(', ')} are marked after the last verse.`);
  }

  // The pieces are joined as the HTML has them: its own spaces separate the words, and none
  // belongs between a word and the dash or quotation mark set against it.
  const verses = new Map<string, string>();
  for (const [id, parts] of pieces) {
    const { text, at } = placeMarkers(parts.join(''));
    verses.set(id, text);
    (markerOrder.get(id) ?? []).forEach((number, index) => {
      notes.set(number, { verse: id, at: at[index] ?? text.length });
    });
  }
  return { verses, notes };
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
