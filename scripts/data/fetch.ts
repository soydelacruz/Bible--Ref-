/**
 * Downloads the raw source files listed in `data/sources.json` into `data/raw/` and verifies them
 * against their pinned SHA-256 checksums.
 *
 *   npm run data:fetch                   download missing files, verify every checksum
 *   npm run data:fetch -- --update       check upstream for new versions, show what changed in
 *                                        each and re-pin it
 *   npm run data:fetch -- --update web   the same for the sources named, and only those
 */
import { parseArgs } from 'node:util';
import { describePinnedChange } from './lib/changes.ts';
import { download, unpackedSourceUnavailable } from './lib/download.ts';
import { formatBytes, readFileIfExists, today, writeFileAtomic } from './lib/files.ts';
import { rawFilePath } from './lib/paths.ts';
import {
  findSource,
  pinnedContent,
  pinnedDigest,
  rawFileContent,
  readSources,
  writeSources,
  type RawSource,
} from './lib/sources.ts';

const { values: options, positionals: sourceIds } = parseArgs({
  options: { update: { type: 'boolean', default: false } },
  allowPositionals: true,
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
  if (sha256 === source.sha256) {
    console.log(`✓ ${source.id}: up to date (${formatBytes(existing.byteLength)})`);
    return source;
  }
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
  if (source.extractedBy !== undefined) {
    return repinExtractedSource(source, source.extractedBy, existing);
  }
  const pinned =
    existing !== undefined && pinnedDigest(source, existing) === source.sha256
      ? existing
      : undefined;
  // Only an update looks upstream for a file that already matches its pin: a copy the repository
  // carries always does, so otherwise a newer version could never be found.
  if (pinned && !options.update) {
    console.log(`✓ ${source.id}: up to date (${formatBytes(pinned.byteLength)})`);
    return source;
  }
  if (source.unpacked === true && !options.update) {
    throw new Error(
      unpackedSourceUnavailable(source, existing ? 'does not match its pin' : 'is missing'),
    );
  }

  console.log(`↓ ${source.id}: downloading ${source.url}`);
  const content = rawFileContent(source, await download(source.url));
  const sha256 = pinnedDigest(source, content);
  if (sha256 === source.sha256) {
    if (pinned) {
      console.log(`✓ ${source.id}: still the upstream version (${formatBytes(pinned.byteLength)})`);
    } else {
      await writeFileAtomic(path, content);
      console.log(`✓ ${source.id}: downloaded and verified (${formatBytes(content.byteLength)})`);
    }
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
  const changes = pinned
    ? describePinnedChange(source, pinnedContent(source, pinned), pinnedContent(source, content))
    : ['No pinned copy was here to compare it with.'];
  for (const line of changes) {
    console.log(`  ${line}`);
  }
  return { ...source, sha256, retrievedAt: today() };
}

const sources = await readSources();
const selected = new Set(sourceIds.map((id) => findSource(sources, id)));
const updatedSources: RawSource[] = [];
let failed = false;
for (const source of sources) {
  if (selected.size > 0 && !selected.has(source)) {
    updatedSources.push(source);
    continue;
  }
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
