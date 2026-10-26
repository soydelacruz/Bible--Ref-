import { CANONICAL_VERSIFICATION } from '../core/bible/versification.ts';
import {
  parseCrossReferencesFile,
  type DatasetProvenance,
  type ImportNotice,
} from '../core/datasets/formats.ts';
import { crossReferencesDatasetPath } from '../core/datasets/paths.ts';
import {
  loadDataset,
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

export async function loadCrossReferences(
  manifest: CrossReferenceSourceManifest,
  options: FetchDatasetOptions = {},
): Promise<LoadedCrossReferences> {
  const { value: dataset, report } = await loadDataset(
    crossReferencesDatasetPath(manifest.id),
    (json): CrossReferenceDataset => {
      const file = parseCrossReferencesFile(json, {
        id: manifest.id,
        versification: CANONICAL_VERSIFICATION.id,
      });
      return {
        manifest,
        provenance: file.provenance,
        notices: file.notices,
        sourceRowCount: file.sourceRowCount,
        index: new CrossReferenceIndex(file.links, CANONICAL_VERSIFICATION.verseCount),
      };
    },
    options,
  );
  return { dataset, report };
}
