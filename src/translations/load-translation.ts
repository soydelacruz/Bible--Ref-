import { CANONICAL_VERSIFICATION } from '../core/bible/versification.ts';
import { parseTranslationTextFile } from '../core/datasets/formats.ts';
import { translationDatasetPath } from '../core/datasets/paths.ts';
import { loadDatasetOffThread, type DatasetLoadReport } from '../shared/lib/fetch-dataset.ts';
import { Translation } from './translation.ts';
import type { TranslationManifest } from './translation-manifest.ts';

export interface LoadedTranslation {
  readonly translation: Translation;
  readonly report: DatasetLoadReport;
}

/** A Bible's text, parsed in the dataset worker: four megabytes of JSON, read off the main thread. */
export async function loadTranslation(manifest: TranslationManifest): Promise<LoadedTranslation> {
  const expected = { id: manifest.id, versification: CANONICAL_VERSIFICATION.id };
  const { value: translation, report } = await loadDatasetOffThread(
    translationDatasetPath(manifest.id),
    { kind: 'translation', expected },
    // Checked again on arrival, which is cheap next to the parsing the worker did.
    (value) =>
      new Translation(manifest, CANONICAL_VERSIFICATION, parseTranslationTextFile(value, expected)),
  );
  return { translation, report };
}
