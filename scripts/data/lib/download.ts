import { formatBytes, writeFileAtomic } from './files.ts';
import { rawFilePath } from './paths.ts';
import { pinnedDigest, type RawSource } from './sources.ts';

/** Downloads a URL into memory. */
export async function download(url: string): Promise<Buffer> {
  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(`GET ${url} failed: HTTP ${response.status}`);
  }
  return Buffer.from(await response.arrayBuffer());
}

/**
 * Downloads a source, checks it against its pinned checksum and saves it to `data/raw/`.
 *
 * Used for the sources too large to keep in the repository: the pin in `data/sources.json` is
 * what makes the download trustworthy, so a build is reproducible as long as the file is still
 * served. A changed upstream file fails here rather than quietly becoming part of a build.
 */
export async function downloadPinnedSource(source: RawSource): Promise<Buffer> {
  if (source.extractedBy !== undefined) {
    throw new Error(
      `${source.id}: data/raw/${source.fileName} is missing. It is not downloaded: make it with ` +
        `\`node ${source.extractedBy}\`.`,
    );
  }
  const content = await download(source.url);
  const sha256 = pinnedDigest(source, content);
  if (sha256 !== source.sha256) {
    throw new Error(
      `${source.id}: the upstream file changed (expected SHA-256 ${source.sha256}, got ${sha256}).\n` +
        '  Review the new version, then pin it with `npm run data:fetch -- --update`.',
    );
  }
  await writeFileAtomic(rawFilePath(source.fileName), content);
  console.log(`↓ ${source.id}: downloaded and verified (${formatBytes(content.byteLength)})`);
  return content;
}
