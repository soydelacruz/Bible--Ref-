import { act, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import { toPassageOsisId, type Passage } from '../core/bible/passage.ts';
import { KJV_VERSIFICATION } from '../core/bible/versification.ts';
import { setActiveLocale } from '../i18n/locale-choice.ts';
import { verseIndex } from '../test-utils/fixtures.ts';
import { onTourRequest, setArcsTourAvailable } from '../visualizations/arcs/tour/tour-request.ts';
import { pendingFocusRequest, settleFocusRequest } from '../visualizations/shared/panel-focus.ts';
import { StartHere } from './StartHere.tsx';
import { VIEWS, type View } from './views.ts';

const [ARCS, THREADS] = VIEWS;

// Listing the views starts loading each one's code (see visualizations/*/index.ts), and nothing
// here renders them to wait for it. Wait for it once, so the file cannot finish, and its
// environment be torn down, while those imports are still loading.
beforeAll(async () => {
  await Promise.all([
    import('../visualizations/arcs/ArcsExplorer.tsx'),
    import('../visualizations/threads/ThreadsExplorer.tsx'),
    import('../visualizations/clusters/ClustersExplorer.tsx'),
  ]);
});

/** The strip as the app lays it out: under the header, over the arcs it leaves the keys to. */
function renderStrip() {
  const onOpen = vi.fn<(view: View, passage: Passage) => void>();
  const onClose = vi.fn();
  render(
    <div>
      {/* VizPage gives it a row of its own. */}
      <div>
        <StartHere
          versification={KJV_VERSIFICATION}
          hrefOf={(view, passage) =>
            `/${view.path}?ref=${toPassageOsisId(passage, KJV_VERSIFICATION)}`
          }
          onOpen={onOpen}
          onClose={onClose}
        />
      </div>
      <main>
        <div role="application" tabIndex={0} aria-label="Arcs" />
      </main>
    </div>,
  );
  return { onOpen, onClose };
}

const strip = () => screen.getByRole('region', { name: 'Start here' });

afterEach(() => {
  settleFocusRequest();
  setArcsTourAvailable(true);
  act(() => {
    setActiveLocale('en');
  });
});

describe('StartHere', () => {
  it('says what the picture is, and offers three ways in', () => {
    renderStrip();
    expect(strip().textContent).toContain(
      'Each arc joins two passages that refer to each other, coloured by the genre of their books.',
    );
    expect(screen.getByRole('link', { name: 'John 3:16 in Arcs' }).getAttribute('href')).toBe(
      '/?ref=John.3.16',
    );
    expect(screen.getByRole('link', { name: 'Psalm 23 in Threads' }).getAttribute('href')).toBe(
      '/threads/?ref=Ps.23',
    );
    expect(screen.getByRole('button', { name: 'The tour in 45 seconds' })).toBeTruthy();
  });

  it('opens a way in, in place, and asks the panel to take the keys when it shows', () => {
    const { onOpen } = renderStrip();
    fireEvent.click(screen.getByRole('link', { name: 'John 3:16 in Arcs' }));
    expect(onOpen).toHaveBeenLastCalledWith(ARCS, {
      kind: 'verse',
      verse: verseIndex('John', 3, 16),
    });
    expect(pendingFocusRequest()).not.toBeNull();
    fireEvent.click(screen.getByRole('link', { name: 'Psalm 23 in Threads' }));
    expect(onOpen).toHaveBeenLastCalledWith(THREADS, { kind: 'chapter', book: 'Ps', chapter: 23 });
  });

  it('starts the arcs’ tour, as their own button does, and is done', () => {
    const { onClose } = renderStrip();
    const listener = vi.fn();
    const stop = onTourRequest(listener);
    fireEvent.click(screen.getByRole('button', { name: 'The tour in 45 seconds' }));
    stop();
    expect(listener).toHaveBeenCalledOnce();
    expect(onClose).toHaveBeenCalledOnce();
  });

  it('offers no tour while the filter leaves none to take', () => {
    act(() => {
      setArcsTourAvailable(false);
    });
    renderStrip();
    expect(screen.queryByRole('button', { name: 'The tour in 45 seconds' })).toBeNull();
    act(() => {
      setArcsTourAvailable(true);
    });
    expect(screen.getByRole('button', { name: 'The tour in 45 seconds' })).toBeTruthy();
  });

  it('closes, leaving the keys with the arcs under it', () => {
    const { onClose } = renderStrip();
    const close = screen.getByRole('button', { name: 'Don’t show this again' });
    close.focus();
    fireEvent.click(close);
    expect(onClose).toHaveBeenCalledOnce();
    expect(document.activeElement).toBe(screen.getByRole('application', { name: 'Arcs' }));
  });

  it('closes with nothing to hand the keys to', () => {
    const onClose = vi.fn();
    render(
      <StartHere
        versification={KJV_VERSIFICATION}
        hrefOf={() => '/'}
        onOpen={vi.fn()}
        onClose={onClose}
      />,
    );
    const close = screen.getByRole('button', { name: 'Don’t show this again' });
    close.focus();
    fireEvent.click(close);
    expect(onClose).toHaveBeenCalledOnce();
  });

  it('leaves focus alone when it was elsewhere', () => {
    renderStrip();
    fireEvent.click(screen.getByRole('button', { name: 'Don’t show this again' }));
    expect(document.activeElement).toBe(document.body);
  });

  it('speaks the reader’s language', () => {
    act(() => {
      setActiveLocale('pt');
    });
    renderStrip();
    expect(screen.getByRole('region', { name: 'Comece aqui' })).toBeTruthy();
    expect(screen.getByRole('link', { name: 'João 3:16 nos Arcos' })).toBeTruthy();
    expect(screen.getByRole('link', { name: 'Salmo 23 nos Fios' })).toBeTruthy();
    expect(screen.getByRole('button', { name: 'O passeio em 45 segundos' })).toBeTruthy();
  });
});
