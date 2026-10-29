import { act, renderHook, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { TranslationId } from '../../core/datasets/ids.ts';
import { createTranslationFile } from '../../test-utils/fixtures.ts';
import { createVizData } from '../../test-utils/viz-data.ts';
import { getTranslationManifest } from '../../translations/registry.ts';
import { useCompleteData, useTextStatus } from './use-text-status.ts';
import { resetTranslation, resetTranslations, type EarlyVizData } from './viz-data.ts';

/** Serves each translation's file, or answers with something that is not one when `broken`. */
function serveTexts(broken = false) {
  const fetch = vi.fn((input: string | URL) => {
    const id = /translations\/(\w+)\./.exec(String(input))?.[1] ?? 'bsb';
    const file = broken
      ? { not: 'a translation' }
      : { ...createTranslationFile(), translationId: id };
    return Promise.resolve(new Response(JSON.stringify(file)));
  });
  vi.stubGlobal('fetch', fetch);
  return fetch;
}

beforeEach(() => {
  resetTranslations();
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('useTextStatus', () => {
  it('starts the download, and follows it until the text is here', async () => {
    const fetch = serveTexts();
    const { result } = renderHook(() => useTextStatus('bsb'));
    expect(result.current.state).toBe('loading');
    await waitFor(() => {
      expect(result.current.state).toBe('loaded');
    });
    expect(fetch).toHaveBeenCalledTimes(1);
  });

  it('reports a failure, and downloads again once it has been forgotten', async () => {
    serveTexts(true);
    const { result } = renderHook(() => useTextStatus('bsb'));
    await waitFor(() => {
      expect(result.current.state).toBe('failed');
    });

    const fetch = serveTexts();
    act(() => {
      resetTranslation('bsb');
    });
    await waitFor(() => {
      expect(result.current.state).toBe('loaded');
    });
    expect(fetch).toHaveBeenCalledTimes(1);
  });

  it('follows the translation it is asked about', async () => {
    serveTexts();
    const { result, rerender } = renderHook(({ id }: { id: TranslationId }) => useTextStatus(id), {
      initialProps: { id: 'bsb' },
    });
    await waitFor(() => {
      expect(result.current.state).toBe('loaded');
    });
    rerender({ id: 'kjv' });
    await waitFor(() => {
      expect(result.current.state === 'loaded' && result.current.translation.manifest.id).toBe(
        'kjv',
      );
    });
  });
});

describe('useCompleteData', () => {
  const { translation, ...core } = createVizData();
  const loading: EarlyVizData = {
    ...core,
    translationManifest: getTranslationManifest('bsb'),
    text: { state: 'loading' },
  };

  it('is nothing while the words are still on their way', () => {
    const { result } = renderHook(() => useCompleteData(loading));
    expect(result.current).toBeNull();
  });

  it('is the data with its words once they are here, the same object each time', () => {
    const loaded: EarlyVizData = { ...loading, text: { state: 'loaded', translation } };
    const { result, rerender } = renderHook(() => useCompleteData(loaded));
    const first = result.current;
    expect(first?.translation).toBe(translation);
    expect(first?.crossReferences).toBe(core.crossReferences);
    rerender();
    expect(result.current).toBe(first);
  });
});
