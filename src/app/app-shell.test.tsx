import { act, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { DebugPage } from '../features/debug/DebugPage.tsx';
import { debugDataLoader } from '../features/debug/debug-data.ts';
import { mount } from '../shared/lib/mount.tsx';
import {
  createCrossReferenceColumns,
  createTranslationFile,
  PROVENANCE,
  verseIndex,
} from '../test-utils/fixtures.ts';
import { VizDataBoundary } from '../visualizations/shared/components/VizDataBoundary.tsx';
import {
  HeaderActions,
  PageNotice,
  VizPage,
} from '../visualizations/shared/components/VizPage.tsx';
import { vizCoreLoader, resetTranslations } from '../visualizations/shared/viz-data.ts';
import { ViewSwitch } from './ViewSwitch.tsx';
import { VIEWS } from './views.ts';

const GEN_1_1 = verseIndex('Gen', 1, 1);

const CROSS_REFERENCES = {
  format: 'cross-references',
  schemaVersion: 1,
  versification: 'kjv',
  provenance: PROVENANCE,
  notices: [],
  sourceId: 'openbible',
  sourceRowCount: 1,
  links: createCrossReferenceColumns([{ from: GEN_1_1, to: GEN_1_1 + 1, votes: 5 }]),
};

/**
 * Renders something that suspends, waiting for it to settle before asserting. The render has to
 * happen inside an awaited `act`, or React stays on the loading screen and never reaches the
 * data — or the error boundary.
 */
async function renderSuspending(node: React.ReactNode): Promise<void> {
  await act(async () => {
    render(node);
    await Promise.resolve();
  });
}

/** Serves the datasets, or fails every request. */
function serve({ failing = false } = {}) {
  const fetch = vi.fn((input: string | URL) => {
    if (failing) {
      return Promise.reject(new Error('offline'));
    }
    const body = String(input).includes('cross-references')
      ? CROSS_REFERENCES
      : createTranslationFile();
    return Promise.resolve(new Response(JSON.stringify(body)));
  });
  vi.stubGlobal('fetch', fetch);
  return fetch;
}

afterEach(() => {
  vi.unstubAllGlobals();
  vizCoreLoader.reset();
  resetTranslations();
  debugDataLoader.reset();
  document.body.innerHTML = '';
  vi.restoreAllMocks();
});

describe('mount', () => {
  it('renders the page into the root, with one install guide beside it', async () => {
    document.body.innerHTML = '<div id="root"></div>';
    await act(async () => {
      mount(<p>Hello</p>);
      await Promise.resolve();
    });
    expect(document.body.textContent).toContain('Hello');
    expect(document.querySelectorAll('dialog')).toHaveLength(1);
  });

  it('refuses to start without a root to render into', () => {
    expect(() => {
      mount(<p>Hello</p>);
    }).toThrow(/#root/);
  });
});

describe('VizDataBoundary', () => {
  it('shows the data once it has loaded', async () => {
    serve();
    await renderSuspending(
      <VizDataBoundary>{(core) => <p>{core.versification.verseCount} verses</p>}</VizDataBoundary>,
    );
    expect(screen.getByText(/31102 verses/)).toBeDefined();
  });

  it('waits with a loading screen that says what is coming', () => {
    serve();
    render(<VizDataBoundary>{() => <p>done</p>}</VizDataBoundary>);
    expect(screen.getByText(/Loading 31,102 verses/)).toBeDefined();
  });

  it('explains a failed download and offers to try again', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => undefined);
    serve({ failing: true });
    await renderSuspending(<VizDataBoundary>{() => <p>done</p>}</VizDataBoundary>);
    const alert = await screen.findByRole('alert');
    expect(alert.textContent).toContain('could not be loaded');
    // And in the reader's own words, not the importer's: the underlying error names the file and
    // tells whoever is reading it to run a build script, which is no use to someone on a train.
    expect(alert.textContent).not.toContain('npm run data');
    expect(alert.textContent).not.toContain('data/translations');
    expect(screen.getByRole('button', { name: /Retry/ })).toBeDefined();
  });

  it('forgets the failure when retried, so the download starts over', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => undefined);
    const fetch = serve({ failing: true });
    await renderSuspending(<VizDataBoundary>{() => <p>done</p>}</VizDataBoundary>);
    await screen.findByRole('button', { name: /Retry/ });
    const before = fetch.mock.calls.length;
    await userEvent.click(screen.getByRole('button', { name: /Retry/ }));
    await waitFor(() => {
      expect(fetch.mock.calls.length).toBeGreaterThan(before);
    });
  });
});

describe('VizPage', () => {
  it('lays out the masthead, the search box, the controls, the stage and the credits', () => {
    render(
      <VizPage
        masthead={<h1>Title</h1>}
        search={<input type="search" aria-label="Go to" />}
        tools={<button type="button">Saved</button>}
        filters={<button type="button">Filter</button>}
        credits={<span>Credits</span>}
      >
        <canvas />
      </VizPage>,
    );
    expect(screen.getByRole('heading', { name: 'Title' })).toBeDefined();
    expect(screen.getByRole('searchbox', { name: 'Go to' })).toBeDefined();
    expect(screen.getByRole('button', { name: 'Saved' })).toBeDefined();
    expect(screen.getByRole('button', { name: 'Filter' })).toBeDefined();
    expect(screen.getByText('Credits')).toBeDefined();
    expect(screen.getByRole('main')).toBeDefined();
  });

  it('gathers the controls and the view’s own into a More menu, for phones', async () => {
    render(
      <VizPage
        tools={<button type="button">Saved</button>}
        viewTools={<button type="button">Tour</button>}
        credits={<span>Credits</span>}
      >
        <canvas />
      </VizPage>,
    );
    // The view's own controls are on its stage, not in the header: here only once More opens.
    expect(screen.queryByRole('button', { name: 'Tour' })).toBeNull();
    const more = screen.getByRole('button', { name: 'More' });
    await userEvent.click(more);
    const popover = document.getElementById(more.getAttribute('aria-controls') ?? '');
    if (!popover) throw new Error('More opened nothing');
    const menu = within(popover);
    // Focus moves into it, to its first control.
    expect(document.activeElement).toBe(menu.getByRole('button', { name: 'Saved' }));
    expect(menu.getByRole('button', { name: 'Tour' })).toBeDefined();
    // Escape closes it and returns focus to the button that opened it.
    await userEvent.keyboard('{Escape}');
    expect(more.getAttribute('aria-expanded')).toBe('false');
    expect(document.activeElement).toBe(more);
  });

  it('puts what the host adds first among the controls, and first in More', async () => {
    render(
      <HeaderActions value={<button type="button">Wander</button>}>
        <VizPage
          tools={<button type="button">Saved</button>}
          filters={<button type="button">Filter</button>}
          credits={<span>Credits</span>}
        >
          <canvas />
        </VizPage>
      </HeaderActions>,
    );
    const names = (buttons: readonly HTMLElement[]) => buttons.map((button) => button.textContent);
    const header = within(screen.getByRole('banner'));
    // One copy at the end of the first row, for where the header is two rows, and one among the
    // controls; the styles show one at a time, which this DOM does not apply.
    expect(names(header.getAllByRole('button'))).toEqual([
      'Wander',
      'Wander',
      'Saved',
      'Filter',
      'More',
    ]);
    const more = screen.getByRole('button', { name: 'More' });
    await userEvent.click(more);
    const popover = document.getElementById(more.getAttribute('aria-controls') ?? '');
    if (!popover) throw new Error('More opened nothing');
    expect(names(within(popover).getAllByRole('button'))).toEqual(['Wander', 'Saved']);
  });

  it('has a More menu for what the host adds, even with no controls of its own', () => {
    render(
      <HeaderActions value={<button type="button">Wander</button>}>
        <VizPage credits={<span>Credits</span>}>
          <canvas />
        </VizPage>
      </HeaderActions>,
    );
    expect(screen.getByRole('button', { name: 'More' })).toBeDefined();
  });

  it('puts what the host shows under the header in a row of its own, before the stage', () => {
    render(
      <PageNotice value={<section aria-label="Start here" />}>
        <VizPage credits={<span>Credits</span>}>
          <canvas />
        </VizPage>
      </PageNotice>,
    );
    const notice = screen.getByRole('region', { name: 'Start here' });
    const header = screen.getByRole('banner');
    const stage = screen.getByRole('main');
    expect(notice.parentElement?.previousElementSibling).toBe(header);
    expect(stage.contains(notice)).toBe(false);
    expect(notice.compareDocumentPosition(stage) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  });

  it('says on the More button when something inside it hides part of the picture', () => {
    render(
      <VizPage tools={<button type="button">Genres</button>} moreChanged credits={<span>C</span>}>
        <canvas />
      </VizPage>,
    );
    expect(screen.getByRole('button', { name: 'More (genres hidden)' })).toBeDefined();
  });

  it('has no More menu when there is nothing to put in it', () => {
    render(
      <VizPage filters={<button type="button">Filter</button>} credits={<span>Credits</span>}>
        <canvas />
      </VizPage>,
    );
    expect(screen.queryByRole('button', { name: 'More' })).toBeNull();
  });

  it('has no details panel until there is something to show', () => {
    render(
      <VizPage credits={<span>Credits</span>}>
        <canvas />
      </VizPage>,
    );
    expect(screen.queryByLabelText('Details')).toBeNull();
  });

  it('shows the details panel, with a handle to open it fully', () => {
    render(
      <VizPage credits={<span>Credits</span>} panel={<p>About this verse</p>}>
        <canvas />
      </VizPage>,
    );
    expect(screen.getByLabelText('Details')).toBeDefined();
    expect(screen.getByRole('button', { name: 'Expand details' })).toBeDefined();
  });

  it('opens and closes the sheet from its handle', async () => {
    render(
      <VizPage credits={<span>Credits</span>} panel={<p>About this verse</p>}>
        <canvas />
      </VizPage>,
    );
    await userEvent.click(screen.getByRole('button', { name: 'Expand details' }));
    expect(screen.getByRole('button', { name: 'Collapse details' })).toBeDefined();
  });
});

describe('ViewSwitch', () => {
  it('offers every visualization, marking the one on screen', () => {
    render(
      <ViewSwitch
        views={VIEWS}
        current="arcs"
        hrefOf={(view) => `/${view.path}`}
        onOpen={vi.fn()}
      />,
    );
    expect(screen.getAllByRole('link')).toHaveLength(VIEWS.length);
    expect(screen.getByRole('link', { name: 'Arcs' }).getAttribute('aria-current')).toBe('page');
  });

  it('opens a view in place, without loading the page again', async () => {
    const onOpen = vi.fn();
    render(
      <ViewSwitch
        views={VIEWS}
        current="arcs"
        hrefOf={(view) => `/${view.path}`}
        onOpen={onOpen}
      />,
    );
    await userEvent.click(screen.getByRole('link', { name: 'Threads' }));
    expect(onOpen).toHaveBeenCalledWith(expect.objectContaining({ id: 'threads' }));
  });

  it('keeps a real address on each link, so they can be opened in a tab', () => {
    render(
      <ViewSwitch
        views={VIEWS}
        current="arcs"
        hrefOf={(view) => `/${view.path}`}
        onOpen={vi.fn()}
      />,
    );
    expect(screen.getByRole('link', { name: 'Threads' }).getAttribute('href')).toBe('/threads/');
  });
});

describe('the views', () => {
  it('starts with the home page, and gives every other view a path of its own', () => {
    expect(VIEWS[0].path).toBe('');
    const paths = VIEWS.map((view) => view.path);
    expect(new Set(paths).size).toBe(paths.length);
  });

  it('names each view for its switch and for the panel’s link', () => {
    for (const view of VIEWS) {
      expect(view.titleKey.length).toBeGreaterThan(0);
      expect(view.shortTitleKey.length).toBeGreaterThan(0);
      expect(view.openLabelKey.length).toBeGreaterThan(0);
    }
  });

  it('draws Arcs and Clusters before the text has arrived, and Threads once it has', () => {
    // vite/plugins.test.ts pins the other side: these are the pages that do not preload the text.
    const early = VIEWS.filter((view) => 'drawsBeforeText' in view && view.drawsBeforeText);
    expect(early.map((view) => view.path)).toEqual(['', 'clusters/']);
  });
});

describe('DebugPage', () => {
  it('lists its sections and waits for the datasets', () => {
    vi.spyOn(debugDataLoader, 'load').mockReturnValue(new Promise(() => undefined));
    render(<DebugPage />);
    expect(screen.getByRole('navigation', { name: 'Sections' })).toBeDefined();
    expect(screen.getByText(/Loading datasets/)).toBeDefined();
    expect(screen.getAllByRole('listitem').length).toBeGreaterThan(3);
  });

  // Renders one element per unlinked verse over a whole-Bible fixture, which is slow in
  // happy-dom and slower again on a loaded CI runner: measured at 7s beside 21 other files.
  it('shows the dashboard once the datasets are there', { timeout: 30_000 }, async () => {
    serve();
    debugDataLoader.reset();
    await renderSuspending(<DebugPage />);
    expect(screen.getByText('Dataset files')).toBeDefined();
  });

  it('explains a failed load and offers to retry', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => undefined);
    vi.spyOn(debugDataLoader, 'load').mockRejectedValue(new Error('no datasets'));
    await renderSuspending(<DebugPage />);
    expect(await screen.findByRole('alert')).toBeDefined();
    expect(screen.getByText('no datasets')).toBeDefined();
    expect(screen.getByRole('button', { name: /Retry/ })).toBeDefined();
  });

  it('starts the load again when retried', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => undefined);
    const load = vi.spyOn(debugDataLoader, 'load').mockRejectedValue(new Error('no datasets'));
    const reset = vi.spyOn(debugDataLoader, 'reset');
    await renderSuspending(<DebugPage />);
    await screen.findByRole('button', { name: /Retry/ });
    await userEvent.click(screen.getByRole('button', { name: /Retry/ }));
    expect(reset).toHaveBeenCalled();
    expect(load.mock.calls.length).toBeGreaterThan(1);
  });
});

describe('the debug dataset loader', () => {
  it('loads the default text and every registered source together', async () => {
    const fetch = serve();
    debugDataLoader.reset();
    const data = await debugDataLoader.load();
    expect(data.translation.translation.manifest.id).toBe('bsb');
    expect(data.crossReferences).toHaveLength(1);
    expect(fetch).toHaveBeenCalledTimes(2);
  });
});

describe('the visualization registry', () => {
  it('describes each view with an icon and a lazily loaded component', async () => {
    const { arcs } = await import('../visualizations/arcs/index.ts');
    const { threads } = await import('../visualizations/threads/index.ts');
    for (const view of [arcs, threads]) {
      expect(typeof view.icon).toBe('function');
      expect(view.Component).toBeDefined();
    }
  });
});
