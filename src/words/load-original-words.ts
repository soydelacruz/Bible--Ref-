import { CANONICAL_VERSIFICATION } from '../core/bible/versification.ts';
import {
  parseOriginalWordsFile,
  type DatasetProvenance,
  type ImportNotice,
} from '../core/datasets/formats.ts';
import { originalWordsDatasetPath } from '../core/datasets/paths.ts';
import { loadDatasetOffThread, type DatasetLoadReport } from '../shared/lib/fetch-dataset.ts';
import { OriginalWordIndex } from './original-words.ts';
import type { WordSourceManifest } from './word-source-manifest.ts';

export interface OriginalWordsDataset {
  readonly manifest: WordSourceManifest;
  readonly provenance: DatasetProvenance;
  readonly notices: readonly ImportNotice[];
  /** Words used in more verses than this are not in the dataset at all. */
  readonly maxVerses: number;
  readonly index: OriginalWordIndex;
}

export interface LoadedOriginalWords {
  readonly dataset: OriginalWordsDataset;
  readonly report: DatasetLoadReport;
}

export async function loadOriginalWords(
  manifest: WordSourceManifest,
): Promise<LoadedOriginalWords> {
  const expected = { id: manifest.id, versification: CANONICAL_VERSIFICATION.id };
  const { value: dataset, report } = await loadDatasetOffThread(
    originalWordsDatasetPath(manifest.id),
    { kind: 'original-words', expected },
    (value): OriginalWordsDataset => {
      const file = parseOriginalWordsFile(value, expected);
      return {
        manifest,
        provenance: file.provenance,
        notices: file.notices,
        maxVerses: file.maxVerses,
        index: new OriginalWordIndex(file.words, CANONICAL_VERSIFICATION.verseCount),
      };
    },
  );
  return { dataset, report };
}
