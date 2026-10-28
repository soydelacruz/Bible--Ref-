/**
 * Builds the app's datasets from the raw source files: `data/raw/` → `public/data/`.
 *
 *   npm run data:build
 *
 * Each dataset is produced by an importer that validates the raw data against the canonical
 * versification and fails loudly on anything unexpected. Each is written under a name carrying a
 * hash of its bytes, and `src/core/datasets/dataset-files.ts` is written to match.
 */
import { DATASETS_DIRECTORY } from '../../src/core/datasets/paths.ts';
import { DATASET_BUILDERS, type RawSourceReader } from './datasets.ts';
import { downloadPinnedSource } from './lib/download.ts';
import { formatBytes, readFileIfExists, writeFileAtomic } from './lib/files.ts';
import {
  DATASET_FILES_MODULE,
  prepareDataset,
  renderDatasetFiles,
  writeDatasetFiles,
  type DatasetFile,
} from './lib/output.ts';
import { publicFilePath, rawFilePath } from './lib/paths.ts';
import { findSource, pinnedDigest, readSources } from './lib/sources.ts';

const sources = await readSources();

const readSource: RawSourceReader = async (sourceId) => {
  const source = findSource(sources, sourceId);
  const content =
    (await readFileIfExists(rawFilePath(source.fileName))) ??
    // A source the repository does not carry (and any that went missing) is downloaded here,
    // against its pin, so a fresh clone can build.
    (await downloadPinnedSource(source));
  if (pinnedDigest(source, content) !== source.sha256) {
    throw new Error(
      `Raw file for "${sourceId}" does not match its pinned checksum. Run \`npm run data:fetch\`.`,
    );
  }
  return { source, content };
};

const files: DatasetFile[] = [];
for (const builder of DATASET_BUILDERS) {
  const dataset = await builder.build(readSource);
  const prepared = prepareDataset(builder.name, dataset);
  files.push(prepared);
  console.log(
    `✓ public/${DATASETS_DIRECTORY}/${prepared.file} (${formatBytes(prepared.bytes.byteLength)})`,
  );
  for (const notice of dataset.notices) {
    console.log(`  ${notice.level}: ${notice.message} [${notice.count}]`);
  }
}

const removed = await writeDatasetFiles(files, publicFilePath(DATASETS_DIRECTORY));
if (removed.length > 0) {
  console.log(`✗ removed ${String(removed.length)} files of an earlier build`);
}
const table = renderDatasetFiles(files);
if ((await readFileIfExists(DATASET_FILES_MODULE))?.toString('utf8') !== table) {
  await writeFileAtomic(DATASET_FILES_MODULE, table);
  console.log(
    '✎ src/core/datasets/dataset-files.ts names new files: commit it with the change that made them',
  );
}
