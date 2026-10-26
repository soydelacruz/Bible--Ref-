import type { ReactNode } from 'react';
import { useLocalization } from '../../../i18n/use-locale.tsx';
import { useCompleteData } from '../use-text-status.ts';
import { resetTranslation, type EarlyVizData, type TextStatus, type VizData } from '../viz-data.ts';
import controls from './controls.module.css';
import { DatasetError } from './VizDataBoundary.tsx';

/**
 * In place of a text's words while they download: a line saying so — or, if the download failed,
 * why, with a way to try again. Everything around it (the drawing, the links) is already there.
 */
export function TextPending({
  status,
  onRetry,
}: {
  readonly status: TextStatus;
  readonly onRetry: () => void;
}) {
  const { t } = useLocalization();
  if (status.state === 'failed') {
    return <DatasetError error={status.error} onRetry={onRetry} />;
  }
  // `data-text-pending`: what the end-to-end tests wait on before reading words.
  return (
    <p
      role="status"
      className={controls.hint}
      style={{ padding: 'var(--space-6)' }}
      data-text-pending=""
    >
      {t('loading.text')}
    </p>
  );
}

/**
 * Renders `children` with the complete data once the text has arrived, and `TextPending` in their
 * place until then: for the parts of a view that show words, such as the details panel.
 */
export function WithText({
  data,
  children,
}: {
  readonly data: EarlyVizData;
  readonly children: (data: VizData) => ReactNode;
}) {
  const complete = useCompleteData(data);
  return complete === null ? (
    <TextPending
      status={data.text}
      onRetry={() => {
        resetTranslation(data.translationManifest.id);
      }}
    />
  ) : (
    children(complete)
  );
}
