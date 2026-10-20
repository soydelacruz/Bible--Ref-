/**
 * Downloads the raw source files listed in `data/sources.json` into `data/raw/` and verifies them
 * against their pinned SHA-256 checksums.
 *
 *   npm run data:fetch               download missing or outdated files, verify checksums
 *   npm run data:fetch -- --update   accept new upstream versions and re-pin their checksums
 */
import { parseArgs } from 'node:util';
import { download } from './lib/download.ts';
import { formatBytes, readFileIfExists, today, writeFileAtomic } from './lib/files.ts';
import { rawFilePath } from './lib/paths.ts';
import { pinnedDigest, readSources, writeSources, type RawSource } from './lib/sources.ts';

const { values: options } = parseArgs({
  options: { update: { type: 'boolean', default: false } },
});

/**
 * Checks a file the pipeline makes rather than downloads. Its URL is where the upstream material
 * lives, not the file, so nothing is fetched: a file made again on purpose is re-pinned from disk
 * with `--update`. Its `retrievedAt` stays the date of the copy it was made from.
 */
function repinExtractedSource(
  source: RawSource,
  extractedBy: string,
  existing: Buffer | undefined,
): RawSource {
  if (!existing) {
    throw new Error(
      `${source.id}: data/raw/${source.fileName} is missing. It is not downloaded: make it with ` +
        `\`node ${extractedBy}\`.`,
    );
  }
  const sha256 = pinnedDigest(source, existing);
  if (!options.update) {
    throw new Error(
      `${source.id}: data/raw/${source.fileName} does not match its pin (expected SHA-256 ` +
        `${source.sha256}, got ${sha256}).\n` +
        `  If ${extractedBy} made it again on purpose, review it, then pin it with ` +
        '`npm run data:fetch -- --update`.',
    );
  }
  console.log(
    `↻ ${source.id}: pinned the file ${extractedBy} made (${formatBytes(existing.byteLength)})`,
  );
  return { ...source, sha256 };
}

/** Makes sure the source's raw file is present and matches its pin; returns the updated pin. */
async function fetchSource(source: RawSource): Promise<RawSource> {
  const path = rawFilePath(source.fileName);
  const existing = await readFileIfExists(path);
  if (existing && pinnedDigest(source, existing) === source.sha256) {
    console.log(`✓ ${source.id}: up to date (${formatBytes(existing.byteLength)})`);
    return source;
  }
  if (source.extractedBy !== undefined) {
    return repinExtractedSource(source, source.extractedBy, existing);
  }

  console.log(`↓ ${source.id}: downloading ${source.url}`);
  const content = await download(source.url);
  const sha256 = pinnedDigest(source, content);
  if (sha256 === source.sha256) {
    await writeFileAtomic(path, content);
    console.log(`✓ ${source.id}: downloaded and verified (${formatBytes(content.byteLength)})`);
    return source;
  }
  if (!options.update) {
    throw new Error(
      `${source.id}: the upstream file changed (expected SHA-256 ${source.sha256}, got ${sha256}).\n` +
        '  Review the new version, then pin it with `npm run data:fetch -- --update`.',
    );
  }
  await writeFileAtomic(path, content);
  console.log(
    `↻ ${source.id}: pinned the new upstream version (${formatBytes(content.byteLength)})`,
  );
  return { ...source, sha256, retrievedAt: today() };
}

const sources = await readSources();
const updatedSources: RawSource[] = [];
let failed = false;
for (const source of sources) {
  try {
    updatedSources.push(await fetchSource(source));
  } catch (error) {
    failed = true;
    updatedSources.push(source);
    console.error(`✗ ${error instanceof Error ? error.message : String(error)}`);
  }
}

if (updatedSources.some((source, index) => source !== sources[index])) {
  await writeSources(updatedSources);
  console.log('Updated data/sources.json. Commit it together with any code changes it needs.');
}
if (failed) {
  process.exitCode = 1;
}
