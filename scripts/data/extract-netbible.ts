/**
 * Extracts the NET Bible from a local copy of the NET Bible study archive (the responses
 * netbible.org served, downloaded 2026-10-19) into two files under `data/raw/`:
 *
 * - `net2_vpl.txt`, its text, as eBible verse-per-line text that the eBible importer builds like
 *   any other translation;
 * - `net2-notes.zip`, its notes, one JSON line each (`net2-notes.jsonl`): the verse and place its
 *   marker stands at in that text, and the note's HTML as served, which the build turns into the
 *   app's own structure.
 *
 *   node scripts/data/extract-netbible.ts --archive <path to NETBible-Archive>
 *
 * The archive itself stays out of the repository: each of its Bible responses pairs the NET with
 * another translation whose licence does not allow it here. Only the NET's own text and notes are
 * written, and both files are pinned in data/sources.json like downloads. Run this again only to
 * re-extract from a newer archive, then re-pin with `npm run data:fetch -- --update`.
 */
import { readdirSync } from 'node:fs';
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { parseArgs } from 'node:util';
import { zipSync } from 'fflate';
import { BOOKS } from '../../src/core/bible/books.ts';
import { parseOsisId } from '../../src/core/bible/verse-ref.ts';
import { netBookFromHtml, netVerseLines, type NetNoteAnchor } from './importers/netbible-html.ts';
import { splitNetNotes, type NetNoteRecord } from './importers/netbible-notes.ts';
import { formatBytes, sha256Hex, writeFileAtomic } from './lib/files.ts';
import { rawFilePath } from './lib/paths.ts';

const TEXT_FILE = 'net2_vpl.txt';
const NOTES_FILE = 'net2-notes.zip';
const NOTES_MEMBER = 'net2-notes.jsonl';
/** The date the archive was made, so that extracting it again writes the very same archive. */
const ARCHIVE_DATE = new Date('2026-10-19T00:00:00Z');
/** The archive's NET responses, each paired with the KJV; `bible1` is the NET. */
const RESPONSES_DIR = join('raw', 'bibles', 'net_strongs2--kjv');
/** The NET's notes, one HTML file a book, named as the responses are. */
const NOTES_DIR = join('raw', 'notes', 'net_strongs2');

const { values: options } = parseArgs({ options: { archive: { type: 'string' } } });
const archive = options.archive;
if (!archive) {
  throw new Error('Usage: node scripts/data/extract-netbible.ts --archive <NETBible-Archive>');
}

/** A book's notes, each with the place its marker stands at; every note must have one. */
async function bookNotes(
  file: string,
  anchors: ReadonlyMap<number, NetNoteAnchor>,
): Promise<NetNoteRecord[]> {
  const notesFile = join(archive ?? '', NOTES_DIR, file.replace(/\.json$/, '.html'));
  const notes = splitNetNotes(await readFile(notesFile, 'utf8'));
  const unmarked = [...notes.keys()].filter((number) => !anchors.has(number));
  const missing = [...anchors.keys()].filter((number) => !notes.has(number));
  if (unmarked.length > 0 || missing.length > 0) {
    throw new Error(
      `${file}: notes without a marker (${unmarked.slice(0, 5).join(', ')}) or markers ` +
        `without a note (${missing.slice(0, 5).join(', ')}).`,
    );
  }
  return [...notes]
    .toSorted(([a], [b]) => a - b)
    .map(([number, html]) => {
      const anchor = anchors.get(number);
      const book = anchor ? parseOsisId(anchor.verse)?.book : undefined;
      if (!anchor || !book) {
        throw new Error(`${file}: note ${String(number)} has no verse.`);
      }
      return { book, number, verse: anchor.verse, at: anchor.at, html };
    });
}

const responsesDir = join(archive, RESPONSES_DIR);
const files = readdirSync(responsesDir)
  .filter((name) => name.endsWith('.json'))
  .sort();
if (files.length !== BOOKS.length) {
  throw new Error(`${responsesDir}: expected 66 book responses, found ${String(files.length)}.`);
}

const verses = new Map<string, string>();
const records: NetNoteRecord[] = [];
for (const file of files) {
  const response: unknown = JSON.parse(await readFile(join(responsesDir, file), 'utf8'));
  const html =
    typeof response === 'object' && response !== null && 'bible1' in response
      ? response.bible1
      : undefined;
  if (typeof html !== 'string') {
    throw new Error(`${file}: no NET text ("bible1") in the response.`);
  }
  const book = netBookFromHtml(html);
  for (const [id, text] of book.verses) {
    if (verses.has(id)) {
      throw new Error(`${file}: verse ${id} appears in more than one book response.`);
    }
    verses.set(id, text);
  }
  records.push(...(await bookNotes(file, book.notes)));
}

const text = new TextEncoder().encode(netVerseLines(verses));
await writeFileAtomic(rawFilePath(TEXT_FILE), text);
const withText = [...verses.values()].filter((verse) => verse !== '').length;
console.log(`✓ data/raw/${TEXT_FILE}: ${String(withText)} verses (${formatBytes(text.length)})`);
console.log(`  SHA-256 ${sha256Hex(text)}`);

const jsonl = new TextEncoder().encode(
  `${records.map((record) => JSON.stringify(record)).join('\n')}\n`,
);
const zip = zipSync({ [NOTES_MEMBER]: [jsonl, { level: 9, mtime: ARCHIVE_DATE }] });
await writeFileAtomic(rawFilePath(NOTES_FILE), zip);
console.log(
  `✓ data/raw/${NOTES_FILE}: ${String(records.length)} notes ` +
    `(${formatBytes(zip.length)}, ${formatBytes(jsonl.length)} unzipped)`,
);
console.log(`  SHA-256 of ${NOTES_MEMBER}: ${sha256Hex(jsonl)}`);
