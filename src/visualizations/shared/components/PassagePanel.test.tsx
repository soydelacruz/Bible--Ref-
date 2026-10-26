import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { versePassage, type Passage } from '../../../core/bible/passage.ts';
import { createStudyNotesFile, verseIndex } from '../../../test-utils/fixtures.ts';
import { createVizData } from '../../../test-utils/viz-data.ts';
import { DEFAULT_LINK_FILTER } from '../link-filter.ts';
import { focusPassageTitle, settleFocusRequest } from '../panel-focus.ts';
import { resetStudyNotes } from '../viz-data.ts';
import { PassagePanel } from './PassagePanel.tsx';

const JOHN_3_16 = verseIndex('John', 3, 16);
const JOHN_3_17 = verseIndex('John', 3, 17);
const ROM_5_8 = verseIndex('Rom', 5, 8);
const GEN_1_1 = verseIndex('Gen', 1, 1);

const DATA = createVizData(
  [
    { from: JOHN_3_16, to: ROM_5_8, votes: 50 },
    { from: GEN_1_1, to: JOHN_3_16, votes: 30 },
  ],
  new Map([
    [JOHN_3_16, 'For God so loved the world…'],
    [ROM_5_8, 'But God proves His love…'],
    [GEN_1_1, 'In the beginning…'],
    [JOHN_3_17, 'For God did not send His Son…'],
  ]),
);

function panel(passage: Passage, onSelect = vi.fn(), onClose = vi.fn(), props = {}) {
  return (
    <PassagePanel
      data={DATA}
      passage={passage}
      filter={DEFAULT_LINK_FILTER}
      onSelect={onSelect}
      onClose={onClose}
      shareUrl={(target) => `https://example.org/?ref=${target.kind}`}
      {...props}
    />
  );
}

function renderPanel(passage: Passage = versePassage(JOHN_3_16), props = {}) {
  const onSelect = vi.fn();
  const onClose = vi.fn();
  const result = render(panel(passage, onSelect, onClose, props));
  return {
    ...result,
    onSelect,
    onClose,
    /** Shows another passage, as following a link or a step of the tour does. */
    show: (next: Passage) => {
      result.rerender(panel(next, onSelect, onClose, props));
    },
  };
}

/** Something outside the panel that keeps focus, e.g. the arcs or the tour's button. */
function focusOutside(): HTMLButtonElement {
  const outside = document.createElement('button');
  outside.textContent = 'Arcs';
  document.body.append(outside);
  outside.focus();
  return outside;
}

/** The panel's one live region. */
const said = () => screen.getByRole('status').textContent;

describe('PassagePanel', () => {
  it('names the passage, its book and its genre', () => {
    renderPanel();
    expect(screen.getByRole('heading', { name: 'John 3:16' })).toBeDefined();
    expect(screen.getByText(/Gospels/)).toBeDefined();
  });

  it("shows a verse's text", () => {
    renderPanel();
    expect(screen.getByText('For God so loved the world…')).toBeDefined();
  });

  it('lists where the passage points, and what points at it', () => {
    renderPanel();
    expect(screen.getByRole('button', { name: /References/ })).toBeDefined();
    expect(screen.getByRole('button', { name: /Referenced by/ })).toBeDefined();
    expect(screen.getByText(/But God proves His love/)).toBeDefined();
    expect(screen.getByText(/In the beginning/)).toBeDefined();
  });

  it('follows a reference when it is chosen', async () => {
    const { onSelect } = renderPanel();
    await userEvent.click(
      screen.getByText(/But God proves His love/).closest('button') as HTMLElement,
    );
    expect(onSelect).toHaveBeenCalledWith(versePassage(ROM_5_8));
  });

  it('closes', async () => {
    const { onClose } = renderPanel();
    await userEvent.click(screen.getByRole('button', { name: 'Close' }));
    expect(onClose).toHaveBeenCalled();
  });

  it('steps to the next and previous verse', async () => {
    const { onSelect } = renderPanel();
    await userEvent.click(screen.getByRole('button', { name: /Next/i }));
    expect(onSelect).toHaveBeenCalledWith(versePassage(JOHN_3_17));
    await userEvent.click(screen.getByRole('button', { name: /Previous/i }));
    expect(onSelect).toHaveBeenCalledWith(versePassage(verseIndex('John', 3, 15)));
  });

  it('says so when a passage has no links in a direction', () => {
    renderPanel(versePassage(verseIndex('Rev', 22, 21)));
    expect(screen.getAllByText('None').length).toBeGreaterThan(0);
  });

  it('shows a chapter as a list of its verses', () => {
    renderPanel({ kind: 'chapter', book: 'John', chapter: 3 });
    expect(screen.getByRole('button', { name: /Verses/ })).toBeDefined();
    expect(screen.getByText('For God so loved the world…')).toBeDefined();
  });

  it("opens a verse from a chapter's list", async () => {
    const { onSelect } = renderPanel({ kind: 'chapter', book: 'John', chapter: 3 });
    await userEvent.click(
      screen.getByText('For God so loved the world…').closest('button') as HTMLElement,
    );
    expect(onSelect).toHaveBeenCalledWith(versePassage(JOHN_3_16));
  });

  it('shows the genre breakdown of where a passage connects', () => {
    renderPanel();
    expect(screen.getByRole('button', { name: /Links by genre/ })).toBeDefined();
  });

  it('shows actions the host gives it', () => {
    renderPanel(versePassage(JOHN_3_16), {
      actions: <button type="button">Read in context</button>,
    });
    expect(screen.getByRole('button', { name: 'Read in context' })).toBeDefined();
  });

  it('previews a connection when one is pointed at, and stops when it is not', async () => {
    const onPreview = vi.fn();
    renderPanel(versePassage(JOHN_3_16), { onPreview });
    const row = screen.getByText(/But God proves His love/).closest('[class*="quotable"]');
    await userEvent.hover(row as HTMLElement);
    await userEvent.unhover(row as HTMLElement);
    expect(onPreview).toHaveBeenCalledWith(null);
  });

  it('notes a verse the translation leaves out', () => {
    const data = createVizData([], new Map([[verseIndex('Matt', 17, 21), '']]));
    render(
      <PassagePanel
        data={data}
        passage={versePassage(verseIndex('Matt', 17, 21))}
        filter={DEFAULT_LINK_FILTER}
        onSelect={vi.fn()}
        onClose={vi.fn()}
        shareUrl={() => 'https://example.org/'}
      />,
    );
    expect(screen.getByText(/Omitted in the BSB/)).toBeDefined();
  });
});

describe('PassagePanel, as the passage changes', () => {
  afterEach(() => {
    settleFocusRequest();
    vi.unstubAllGlobals();
    document.body.innerHTML = '';
  });

  it('moves nothing for the first passage, which came from the address', () => {
    renderPanel();
    expect(document.activeElement).toBe(document.body);
  });

  it('puts focus on the new title when a followed link takes its button with it', async () => {
    const { onSelect, show } = renderPanel();
    await userEvent.click(
      screen.getByText(/But God proves His love/).closest('button') as HTMLElement,
    );
    expect(onSelect).toHaveBeenCalledWith(versePassage(ROM_5_8));
    show(versePassage(ROM_5_8));
    expect(document.activeElement).toBe(screen.getByRole('heading', { name: 'Romans 5:8' }));
  });

  it('leaves focus where it can stay, and says what changed instead', async () => {
    const outside = focusOutside();
    const { show } = renderPanel();
    await waitFor(() => {
      expect(said()).toBe('John 3:16 · 1 reference · 1 referenced by');
    });
    show(versePassage(ROM_5_8));
    expect(document.activeElement).toBe(outside);
    await waitFor(() => {
      expect(said()).toBe('Romans 5:8 · 1 referenced by');
    });
  });

  it('says so when a passage has no cross-references', async () => {
    focusOutside();
    renderPanel(versePassage(verseIndex('Rev', 22, 21)));
    await waitFor(() => {
      expect(said()).toBe('Revelation 22:21 · No cross-references');
    });
  });

  it('keeps focus on the next-verse button while stepping verse by verse', async () => {
    const { show } = renderPanel();
    const next = screen.getByRole('button', { name: 'Next verse' });
    await userEvent.click(next);
    show(versePassage(JOHN_3_17));
    expect(document.activeElement).toBe(next);
    await waitFor(() => {
      expect(said()).toBe('John 3:17 · No cross-references');
    });
  });

  it('takes focus for a search, and gives it back to the search box on closing', async () => {
    const search = document.createElement('input');
    document.body.append(search);
    search.focus();
    focusPassageTitle(search);
    const { onClose } = renderPanel();
    expect(document.activeElement).toBe(screen.getByRole('heading', { name: 'John 3:16' }));
    await userEvent.click(screen.getByRole('button', { name: 'Close' }));
    expect(onClose).toHaveBeenCalled();
    expect(document.activeElement).toBe(search);
  });

  it('gives focus back to what opened it, e.g. the arcs', async () => {
    const outside = focusOutside();
    renderPanel();
    await userEvent.click(screen.getByRole('button', { name: 'Close' }));
    expect(document.activeElement).toBe(outside);
  });

  it('gives focus to the visualization when nothing opened it', async () => {
    render(
      <div>
        <main>
          <button type="button">Stage</button>
        </main>
        <aside>{panel(versePassage(JOHN_3_16))}</aside>
      </div>,
    );
    await userEvent.click(screen.getByRole('button', { name: 'Close' }));
    expect(document.activeElement?.textContent).toBe('Stage');
  });
});

describe('PassagePanel summary', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    resetStudyNotes();
  });

  it('sums up the links under the title, which reads it out with the title', () => {
    renderPanel();
    const heading = screen.getByRole('heading', { name: 'John 3:16' });
    const summary = document.getElementById(heading.getAttribute('aria-describedby') ?? '');
    expect(summary?.textContent).toBe('1 reference·1 referenced by');
  });

  it('has nothing to sum up for a passage without links', () => {
    renderPanel(versePassage(verseIndex('Rev', 22, 21)));
    const heading = screen.getByRole('heading', { name: 'Revelation 22:21' });
    expect(heading.hasAttribute('aria-describedby')).toBe(false);
  });

  it('jumps to a section, opening it if the reader had folded it', async () => {
    renderPanel();
    const band = screen.getByRole('button', { name: /^Referenced by/ });
    if (band.getAttribute('aria-expanded') === 'true') {
      await userEvent.click(band);
    }
    expect(band.getAttribute('aria-expanded')).toBe('false');
    await userEvent.click(screen.getByRole('button', { name: '1 referenced by' }));
    expect(band.getAttribute('aria-expanded')).toBe('true');
    expect(document.activeElement).toBe(band);
  });

  it('opens a folded section before measuring where to scroll it to', async () => {
    renderPanel();
    const band = screen.getByRole('button', { name: /^Referenced by/ });
    if (band.getAttribute('aria-expanded') === 'true') {
      await userEvent.click(band);
    }
    const section = band.closest('section');
    if (!section) {
      throw new Error('The band has no section.');
    }
    // Measured while still folded, the scroll would be clamped to the shorter panel.
    const openWhenMeasured: (string | null)[] = [];
    vi.spyOn(section, 'getBoundingClientRect').mockImplementation(() => {
      openWhenMeasured.push(band.getAttribute('aria-expanded'));
      return new DOMRect();
    });
    await userEvent.click(screen.getByRole('button', { name: '1 referenced by' }));
    expect(openWhenMeasured).toEqual(['true']);
  });

  it('counts the notes too, once they arrive, and opens them from there', async () => {
    resetStudyNotes();
    const notes = createStudyNotesFile('John', [
      { number: 1, verse: JOHN_3_16, at: 0, parts: [{ kind: 'study', text: ['A note.'] }] },
    ]);
    vi.stubGlobal(
      'fetch',
      vi.fn(() => Promise.resolve(new Response(JSON.stringify(notes)))),
    );
    renderPanel();
    await userEvent.click(await screen.findByRole('button', { name: '1 note' }));
    const band = screen.getByRole('button', { name: /^NET notes/ });
    expect(band.getAttribute('aria-expanded')).toBe('true');
    expect(document.activeElement).toBe(band);
  });
});

describe('PassagePanel, for a screen reader', () => {
  it("says what a chapter's numbers count, and which language its verses are in", () => {
    renderPanel({ kind: 'chapter', book: 'John', chapter: 3 });
    const verse = screen.getByText('For God so loved the world…');
    expect(verse.getAttribute('lang')).toBe('en');
    expect(verse.closest('button')?.textContent).toContain('2 links');
    const other = screen.getByText('For God did not send His Son…');
    expect(other.closest('button')?.textContent).toContain('0 links');
  });

  it("says what a book's number of links counts", () => {
    renderPanel();
    expect(screen.getByText('Romans').textContent).toBe('Romans1 passage');
  });
});
