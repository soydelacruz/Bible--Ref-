import { Suspense, use, type ReactNode } from 'react';
import { CANONICAL_VERSIFICATION } from '../../../core/bible/versification.ts';
import { DatasetUnavailableError } from '../../../shared/lib/fetch-dataset.ts';
import { useLocalization } from '../../../i18n/use-locale.tsx';
import { ErrorBoundary } from '../../../shared/ui/ErrorBoundary.tsx';
import { RetryIcon } from '../../../shared/ui/icons.tsx';
import { resetTranslations, vizCoreLoader, type VizCore } from '../viz-data.ts';
import styles from './controls.module.css';
import { LoadingArcs } from './LoadingArcs.tsx';

interface VizDataBoundaryProps {
  readonly children: (core: VizCore) => ReactNode;
}

function Loaded({ children }: VizDataBoundaryProps) {
  return children(use(vizCoreLoader.load()));
}

/**
 * How many links the dataset holds, for the waiting screen. It is a round statement of what is
 * coming rather than a reading of the file, which has not arrived yet.
 */
const LINK_COUNT = 344_799;

/** Why a dataset is missing, in the reader's words, and a button to try again. */
export function DatasetError({
  error,
  onRetry,
}: {
  readonly error: unknown;
  readonly onRetry: () => void;
}) {
  const { t } = useLocalization();
  return (
    <div role="alert" style={{ padding: 'var(--space-6)' }}>
      {/* A `DatasetUnavailableError` carries a developer's sentence — it names the file and says
          to run `npm run data` — which is the wrong thing to show a reader, and in the wrong
          language. Anything else is a real fault worth reading verbatim. */}
      <p>
        {error instanceof DatasetUnavailableError
          ? t('error.datasetUnavailable')
          : error instanceof Error
            ? error.message
            : String(error)}
      </p>
      <button type="button" className={styles.button} onClick={onRetry}>
        <RetryIcon />
        {t('error.retry')}
      </button>
    </div>
  );
}

/**
 * Loads the shared data with Suspense and shows a retryable error if it fails. The text of a
 * translation is not waited for here: the views draw without it, and the parts that show words
 * wait for it in place (see `Explorer` and `TextPending`). Retrying forgets the texts as well, so
 * one that failed alongside the links starts over too.
 */
export function VizDataBoundary({ children }: VizDataBoundaryProps) {
  const { t, n } = useLocalization();
  return (
    <ErrorBoundary
      fallback={(error, reset) => (
        <DatasetError
          error={error}
          onRetry={() => {
            vizCoreLoader.reset();
            resetTranslations();
            reset();
          }}
        />
      )}
    >
      <Suspense
        fallback={
          <LoadingArcs
            label={t('loading.data')(n(CANONICAL_VERSIFICATION.verseCount), n(LINK_COUNT))}
          />
        }
      >
        <Loaded>{children}</Loaded>
      </Suspense>
    </ErrorBoundary>
  );
}
