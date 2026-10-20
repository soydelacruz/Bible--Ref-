/**
 * Extracts the NET Bible's text from a local copy of the NET Bible study archive (the responses
 * netbible.org served, downloaded 2026-10-19) into `data/raw/net2_vpl.txt`, eBible verse-per-line
 * text that the eBible importer builds like any other translation.
 *
 *   node scripts/data/extract-netbible.ts --archive <path to NETBible-Archive>
 *
 * The archive itself stays out of the repository: each of its Bible responses pairs the NET with
 * another translation whose licence does not allow it here. Only the NET's own text is written,
 * and the result is pinned in data/sources.json like a downloaded file. Run this again only to
 * re-extract from a newer archive, then re-pin with `npm run data:fetch -- --update`.
 */
import { readdir, readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { parseArgs } from 'node:util';
import { netVerseLines, netVersesFromHtml } from './importers/netbible-html.ts';
import { formatBytes, sha256Hex, writeFileAtomic } from './lib/files.ts';
import { rawFilePath } from './lib/paths.ts';

const OUTPUT_FILE = 'net2_vpl.txt';
/** The archive's NET responses, each paired with the KJV; `bible1` is the NET. */
const RESPONSES_DIR = join('raw', 'bibles', 'net_strongs2--kjv');

const { values: options } = parseArgs({ options: { archive: { type: 'string' } } });
if (!options.archive) {
  throw new Error('Usage: node scripts/data/extract-netbible.ts --archive <NETBible-Archive>');
}

const dir = join(options.archive, RESPONSES_DIR);
const files = (await readdir(dir)).filter((name) => name.endsWith('.json')).sort();
if (files.length !== 66) {
  throw new Error(`${dir}: expected 66 book responses, found ${String(files.length)}.`);
}

const verses = new Map<string, string>();
for (const file of files) {
  const response: unknown = JSON.parse(await readFile(join(dir, file), 'utf8'));
  const html =
    typeof response === 'object' && response !== null && 'bible1' in response
      ? response.bible1
      : undefined;
  if (typeof html !== 'string') {
    throw new Error(`${file}: no NET text ("bible1") in the response.`);
  }
  for (const [id, text] of netVersesFromHtml(html)) {
    if (verses.has(id)) {
      throw new Error(`${file}: verse ${id} appears in more than one book response.`);
    }
    verses.set(id, text);
  }
}

const text = netVerseLines(verses);
const bytes = new TextEncoder().encode(text);
await writeFileAtomic(rawFilePath(OUTPUT_FILE), bytes);
const withText = [...verses.values()].filter((verse) => verse !== '').length;
console.log(`✓ data/raw/${OUTPUT_FILE}: ${String(withText)} verses (${formatBytes(bytes.length)})`);
console.log(`  SHA-256 ${sha256Hex(bytes)}`);
