import { CANONICAL_VERSIFICATION } from '../core/bible/versification.ts';
import { acceptCrossReferenceTables } from '../core/datasets/decoders.ts';
import type { DatasetProvenance, ImportNotice } from '../core/datasets/formats.ts';
import { crossReferencesDatasetPath } from '../core/datasets/paths.ts';
import {
  loadDatasetOffThread,
  type DatasetLoadReport,
  type FetchDatasetOptions,
} from '../shared/lib/fetch-dataset.ts';
import { CrossReferenceIndex } from './cross-reference-index.ts';
import type { CrossReferenceSourceManifest } from './source-manifest.ts';

export interface CrossReferenceDataset {
  readonly manifest: CrossReferenceSourceManifest;
  readonly provenance: DatasetProvenance;
  readonly notices: readonly ImportNotice[];
  /** Number of data rows in the raw source file. */
  readonly sourceRowCount: number;
  readonly index: CrossReferenceIndex;
}

export interface LoadedCrossReferences {
  readonly dataset: CrossReferenceDataset;
  readonly report: DatasetLoadReport;
}

/**
 * The links of one source. Read and indexed in the dataset worker; what arrives here is the
 * index's tables, ready to use.
 */
export async function loadCrossReferences(
  manifest: CrossReferenceSourceManifest,
  options: FetchDatasetOptions = {},
): Promise<LoadedCrossReferences> {
  const expected = { id: manifest.id, versification: CANONICAL_VERSIFICATION.id };
  const { verseCount } = CANONICAL_VERSIFICATION;
  const { value: dataset, report } = await loadDatasetOffThread(
    crossReferencesDatasetPath(manifest.id),
    { kind: 'cross-references', expected, verseCount },
    (value): CrossReferenceDataset => {
      const { metadata, tables } = acceptCrossReferenceTables(value, expected, verseCount);
      return {
        manifest,
        provenance: metadata.provenance,
        notices: metadata.notices,
        sourceRowCount: metadata.sourceRowCount,
        index: new CrossReferenceIndex(tables, verseCount),
      };
    },
    options,
  );
  return { dataset, report };
}
