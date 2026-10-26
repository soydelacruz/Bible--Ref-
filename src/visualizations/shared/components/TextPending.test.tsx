import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { DatasetUnavailableError } from '../../../shared/lib/fetch-dataset.ts';
import { createVizData } from '../../../test-utils/viz-data.ts';
import { getTranslationManifest } from '../../../translations/registry.ts';
import {
  subscribeToTexts,
  translationLoader,
  type EarlyVizData,
  type VizData,
} from '../viz-data.ts';
import { TextPending, WithText } from './TextPending.tsx';

const { translation, ...core } = createVizData();

function early(text: EarlyVizData['text']): EarlyVizData {
  return { ...core, translationManifest: getTranslationManifest('bsb'), text };
}

describe('TextPending', () => {
  it('says the words are on their way', () => {
    render(<TextPending status={{ state: 'loading' }} onRetry={vi.fn()} />);
    expect(screen.getByRole('status').textContent).toBe('Loading the text…');
  });

  it('explains a failed download in the reader’s words, and offers to try again', async () => {
    const onRetry = vi.fn();
    render(
      <TextPending
        status={{ state: 'failed', error: new DatasetUnavailableError('bsb.json', 'offline') }}
        onRetry={onRetry}
      />,
    );
    expect(screen.getByRole('alert').textContent).toMatch(/could not be loaded/);
    await userEvent.click(screen.getByRole('button', { name: 'Retry' }));
    expect(onRetry).toHaveBeenCalledTimes(1);
  });

  it('shows any other fault as it is', () => {
    render(<TextPending status={{ state: 'failed', error: 'odd' }} onRetry={vi.fn()} />);
    expect(screen.getByRole('alert').textContent).toContain('odd');
  });
});

describe('WithText', () => {
  it('stands in for the words until they arrive, then shows what needs them', () => {
    const show = vi.fn((data: VizData) => <p>{data.translation.manifest.abbreviation}</p>);
    const { rerender } = render(<WithText data={early({ state: 'loading' })}>{show}</WithText>);
    expect(screen.getByRole('status').textContent).toBe('Loading the text…');
    expect(show).not.toHaveBeenCalled();

    rerender(<WithText data={early({ state: 'loaded', translation })}>{show}</WithText>);
    expect(screen.queryByRole('status')).toBeNull();
    expect(screen.getByText('BSB')).toBeDefined();
  });

  it('retries a failed download by forgetting it, so it starts over', async () => {
    const failed = translationLoader('bsb');
    const listener = vi.fn();
    const unsubscribe = subscribeToTexts(listener);
    render(
      <WithText data={early({ state: 'failed', error: new Error('offline') })}>
        {() => null}
      </WithText>,
    );
    await userEvent.click(screen.getByRole('button', { name: 'Retry' }));
    expect(listener).toHaveBeenCalled();
    expect(translationLoader('bsb')).not.toBe(failed);
    unsubscribe();
  });
});
