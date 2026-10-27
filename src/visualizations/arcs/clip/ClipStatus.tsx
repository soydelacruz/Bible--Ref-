import { useLayoutEffect, useRef, useSyncExternalStore } from 'react';
import { CloseIcon, ExportIcon, ShareIcon } from '../../../shared/ui/icons.tsx';
import { useLocalization } from '../../../i18n/use-locale.tsx';
import controls from '../../shared/components/controls.module.css';
import { downloadBlob } from '../../shared/image-export.ts';
import { canShareFile } from './clip-format.ts';
import type { ClipJob } from './clip-job.ts';
import styles from './ClipStatus.module.css';

interface ClipStatusProps {
  readonly job: ClipJob;
}

/**
 * Where a video clip stands, over the stage: its progress while it is made, with a way to stop,
 * then a way to share or save it. Nothing until a clip is asked for.
 *
 * The clip is made first and shared after, from a button of its own: a share sheet opens only
 * from a press, and the one that asked for the clip is seconds old by the time it is ready.
 */
export function ClipStatus({ job }: ClipStatusProps) {
  const { t, share } = useLocalization();
  const state = useSyncExternalStore(job.subscribe, job.getState);
  if (state.kind === 'idle') {
    return null;
  }
  const message =
    state.kind === 'recording'
      ? t('clip.making')
      : state.kind === 'ready'
        ? t('clip.ready')
        : t('clip.failed');
  const dismiss = () => {
    job.dismiss();
  };
  return (
    <section className={styles.status} aria-label={t('clip.label')}>
      {state.kind !== 'failed' && (
        <Preview canvas={state.preview} isPlaying={state.kind === 'recording'} />
      )}
      <div className={styles.body}>
        <p className={styles.message} role="status">
          {message}
        </p>
        {state.kind === 'recording' && (
          <div className={styles.progress}>
            <progress
              className={styles.bar}
              max={1}
              value={state.progress}
              aria-label={t('clip.making')}
            />
            <span className={styles.percent}>{share(state.progress, 1)}</span>
          </div>
        )}
        <div className={styles.actions}>
          {state.kind === 'recording' && (
            <button
              type="button"
              className={controls.button}
              onClick={() => {
                job.cancel();
              }}
            >
              {t('clip.cancel')}
            </button>
          )}
          {state.kind === 'ready' && (
            <>
              {canShareFile(state.file) && (
                <button
                  type="button"
                  className={`${controls.button} ${styles.primary}`}
                  onClick={() => {
                    void shareFile(state.file);
                  }}
                >
                  <ShareIcon />
                  {t('clip.share')}
                </button>
              )}
              <button
                type="button"
                className={controls.button}
                onClick={() => {
                  downloadBlob(state.file, state.file.name);
                }}
              >
                <ExportIcon />
                {t('clip.download')}
              </button>
            </>
          )}
          {state.kind !== 'recording' && (
            <button
              type="button"
              className={`${controls.button} ${styles.close}`}
              aria-label={t('clip.close')}
              title={t('clip.close')}
              onClick={dismiss}
            >
              <CloseIcon />
            </button>
          )}
        </div>
      </div>
    </section>
  );
}

/**
 * The canvas the clip plays on, shown small. It stays in the page while the clip records: a
 * canvas out of the document may not be painted, and a frame not painted is not recorded.
 */
function Preview({
  canvas,
  isPlaying,
}: {
  readonly canvas: HTMLCanvasElement;
  readonly isPlaying: boolean;
}) {
  const frameRef = useRef<HTMLDivElement>(null);
  useLayoutEffect(() => {
    const frame = frameRef.current;
    if (!frame) {
      return undefined;
    }
    frame.append(canvas);
    return () => {
      canvas.remove();
    };
  }, [canvas]);
  return (
    <div ref={frameRef} className={styles.preview} data-playing={isPlaying} aria-hidden="true" />
  );
}

/** Opens the share sheet with the clip; if it can't take it after all, the clip is saved. */
async function shareFile(file: File): Promise<void> {
  try {
    await navigator.share({ files: [file] });
  } catch (error) {
    // Closing the sheet is the reader's choice, not a failure.
    if (!(error instanceof DOMException && error.name === 'AbortError')) {
      downloadBlob(file, file.name);
    }
  }
}
