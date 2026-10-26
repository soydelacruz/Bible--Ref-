import { useEffect, useMemo, useSyncExternalStore } from 'react';
import type { TranslationId } from '../../core/datasets/ids.ts';
import {
  subscribeToTexts,
  textStatus,
  translationLoader,
  type EarlyVizData,
  type TextStatus,
  type VizData,
} from './viz-data.ts';

/**
 * Where the text `id` stands, updated as it arrives or fails — without suspending, so whatever
 * does not need the words is drawn meanwhile. Starts the download if nothing has yet, and again
 * once a failure has been forgotten (`resetTranslation`), which is how retrying works.
 */
export function useTextStatus(id: TranslationId): TextStatus {
  const status = useSyncExternalStore(subscribeToTexts, () => textStatus(id));
  useEffect(() => {
    if (status.state === 'loading') {
      // Only starts it: a failure is reported through the status, not here.
      translationLoader(id)
        .load()
        .catch(() => undefined);
    }
  }, [id, status]);
  return status;
}

/** The data with its words once they are here, else `null`; the same object for the same data. */
export function useCompleteData(data: EarlyVizData): VizData | null {
  return useMemo(
    () =>
      data.text.state === 'loaded'
        ? {
            versification: data.versification,
            crossReferences: data.crossReferences,
            verseGenres: data.verseGenres,
            translation: data.text.translation,
          }
        : null,
    [data],
  );
}
