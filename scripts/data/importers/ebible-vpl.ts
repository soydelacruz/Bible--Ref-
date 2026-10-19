import { BOOKS, type BookId } from '../../../src/core/bible/books.ts';
import { parseOsisId, toOsisId, type VerseIndex } from '../../../src/core/bible/verse-ref.ts';
import { CANONICAL_VERSIFICATION } from '../../../src/core/bible/versification.ts';
import { getTranslationManifest } from '../../../src/translations/registry.ts';
import {
  DATASET_SCHEMA_VERSION,
  type DatasetProvenance,
  type TranslationTextFile,
} from '../../../src/core/datasets/formats.ts';
import type { TranslationId } from '../../../src/core/datasets/ids.ts';
import { stripByteOrderMark } from '../lib/files.ts';
import { createNotice } from '../lib/notices.ts';

/**
 * Importer for eBible.org's verse-per-line editions (`<id>_vpl.zip` → `<id>_vpl.txt`), which every
 * translation there is published in: one line per verse, `<BOOK> <chapter>:<verse> <text>`, text
 * only (eBible strips notes, headings and paragraph formatting from these files).
 *
 * Books are named with the three-letter codes BibleWorks uses, listed below in canonical order.
 */

/** eBible's book codes, in the same order as `BOOKS`. */
export const BOOK_CODES = [
  'GEN',
  'EXO',
  'LEV',
  'NUM',
  'DEU',
  'JOS',
  'JDG',
  'RUT',
  '1SA',
  '2SA',
  '1KI',
  '2KI',
  '1CH',
  '2CH',
  'EZR',
  'NEH',
  'EST',
  'JOB',
  'PSA',
  'PRO',
  'ECC',
  'SOL',
  'ISA',
  'JER',
  'LAM',
  'EZE',
  'DAN',
  'HOS',
  'JOE',
  'AMO',
  'OBA',
  'JON',
  'MIC',
  'NAH',
  'HAB',
  'ZEP',
  'HAG',
  'ZEC',
  'MAL',
  'MAT',
  'MAR',
  'LUK',
  'JOH',
  'ACT',
  'ROM',
  '1CO',
  '2CO',
  'GAL',
  'EPH',
  'PHI',
  'COL',
  '1TH',
  '2TH',
  '1TI',
  '2TI',
  'TIT',
  'PHM',
  'HEB',
  'JAM',
  '1PE',
  '2PE',
  '1JO',
  '2JO',
  '3JO',
  'JUD',
  'REV',
] as const;

if (BOOK_CODES.length !== BOOKS.length) {
  throw new Error(`eBible: ${BOOK_CODES.length} book codes for ${BOOKS.length} books.`);
}

const BOOK_IDS_BY_CODE: ReadonlyMap<string, BookId> = new Map(
  BOOKS.map((book, index) => [BOOK_CODES[index] ?? '', book.id]),
);

const VERSE_LINE_PATTERN = /^(\S+) (\d+):(\d+) ?(.*)$/;

/**
 * Verses a translation numbers differently from the KJV, from its own reference to the KJV's.
 *
 * The World English Bible follows the manuscripts that close Romans 14 with the doxology the KJV
 * prints as 16:25–27, and leaves 16:25 blank where it moved from. The words are the same verses
 * either way, so they go back to the KJV's place, where the cross-references expect them.
 */
const VERSE_MOVES: Partial<Record<TranslationId, ReadonlyMap<string, string>>> = {
  web: new Map([
    ['Rom.14.24', 'Rom.16.25'],
    ['Rom.14.25', 'Rom.16.26'],
    ['Rom.14.26', 'Rom.16.27'],
  ]),
};

/**
 * Pilcrows start a paragraph in these editions and the app has no place for them, so they go.
 *
 * Square brackets stay. They are not typography: they mark words the translators supplied rather
 * than found in the Greek or Hebrew — the convention printed Bibles set in italics, and in the
 * source they are an explicit `\added` element. Dropping them would present a translator's own
 * additions as original text, in 45.8% of the KJV and 15.6% of the Bíblia Livre, so every copy
 * this build distributes keeps them exactly where the translators put them.
 */
function cleanVerseText(text: string): string {
  return (
    text
      .replace(/¶\s*/g, '')
      // Colon spacing. Some editions set a psalm's superscription against its first words with no
      // space at all, and others leave the space on the wrong side of the colon. Both read as
      // mistakes, and neither is about the wording: the colon keeps its place, only the space
      // moves. Letters only, so `:)` — which the KJV uses forty times — is left exactly as it is.
      .replace(/\s+:/g, ': ')
      .replace(/:(?=\p{L})/gu, ': ')
      .replace(/\s+/g, ' ')
      .trim()
  );
}

export function importEbibleVerseLines(
  text: string,
  translationId: TranslationId,
  provenance: DatasetProvenance,
): TranslationTextFile {
  // The credit travels in the file: it is served on its own and kept on readers' devices.
  const manifest = getTranslationManifest(translationId);
  const versification = CANONICAL_VERSIFICATION;
  const verses = new Array<string | undefined>(versification.verseCount).fill(undefined);
  const moves = VERSE_MOVES[translationId] ?? new Map<string, string>();
  const destinations = new Set(moves.values());

  stripByteOrderMark(text)
    .split(/\r?\n/)
    .forEach((line, offset) => {
      if (line.trim() === '') {
        return;
      }
      const lineNumber = offset + 1;
      const match = VERSE_LINE_PATTERN.exec(line);
      if (!match) {
        throw new Error(
          `${translationId} line ${lineNumber}: unrecognized format: "${line.slice(0, 80)}".`,
        );
      }
      const [, code = '', chapter = '', verse = '', verseText = ''] = match;
      const book = BOOK_IDS_BY_CODE.get(code);
      if (book === undefined) {
        throw new Error(`${translationId} line ${lineNumber}: unknown book code "${code}".`);
      }
      const ownId = toOsisId({ book, chapter: Number(chapter), verse: Number(verse) });
      if (verseText.trim() === '' && destinations.has(ownId)) {
        // The blank a moved verse left behind: its words arrive from where the translation put them.
        return;
      }
      const kjvId = moves.get(ownId) ?? ownId;
      const ref = parseOsisId(kjvId);
      const index = ref && versification.indexOf(ref);
      if (index === undefined) {
        // Translations that number verses differently need an entry in VERSE_MOVES first.
        throw new Error(
          `${translationId} line ${lineNumber}: ${kjvId} is not in the KJV versification.`,
        );
      }
      if (verses[index] !== undefined) {
        throw new Error(`${translationId} line ${lineNumber}: duplicate verse ${kjvId}.`);
      }
      verses[index] = cleanVerseText(verseText);
    });

  const missing: VerseIndex[] = [];
  const complete = verses.map((verseText, index) => {
    if (verseText === undefined) {
      missing.push(index);
    }
    return verseText ?? '';
  });
  const osisIdAt = (index: VerseIndex) => toOsisId(versification.refAt(index));
  if (missing.length > 0) {
    throw new Error(
      `${translationId}: ${missing.length} verses are missing, ` +
        `e.g. ${missing.slice(0, 5).map(osisIdAt).join(', ')}.`,
    );
  }

  const omitted = complete.flatMap((verseText, index) =>
    verseText === '' ? [osisIdAt(index)] : [],
  );
  return {
    format: 'translation-text',
    schemaVersion: DATASET_SCHEMA_VERSION,
    versification: versification.id,
    provenance,
    license: manifest.license,
    attribution: manifest.attribution,
    notices:
      omitted.length > 0
        ? [
            createNotice(
              'info',
              'Verses without text: the translation omits them (they are absent from the ' +
                'earliest manuscripts) and gives them in footnotes instead.',
              omitted,
            ),
          ]
        : [],
    translationId,
    verses: complete,
  };
}
