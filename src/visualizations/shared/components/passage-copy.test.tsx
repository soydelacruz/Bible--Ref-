import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi, type Mock } from 'vitest';
import { chapterPassageOf, versePassage, type Passage } from '../../../core/bible/passage.ts';
import { CANONICAL_VERSIFICATION } from '../../../core/bible/versification.ts';
import { verseIndex } from '../../../test-utils/fixtures.ts';
import { createVizData } from '../../../test-utils/viz-data.ts';
import { DEFAULT_LINK_FILTER } from '../link-filter.ts';
import { canCopy, copyQuote, quotePassage } from '../passage-quote.ts';
import { PassagePanel } from './PassagePanel.tsx';
import { enBooks } from '../../../i18n/books/en.ts';

const JOHN_3_16 = verseIndex('John', 3, 16);
const JOHN_3_17 = verseIndex('John', 3, 17);
const ROM_5_8 = verseIndex('Rom', 5, 8);
const ROM_5_9 = verseIndex('Rom', 5, 9);

const DATA = createVizData(
  [{ from: JOHN_3_16, to: ROM_5_8, toEnd: ROM_5_9, votes: 50 }],
  new Map([
    [JOHN_3_16, 'For God so loved the world…'],
    [ROM_5_8, 'But God proves His love…'],
    [ROM_5_9, 'Therefore, since we have now been justified…'],
  ]),
);

/** Stands in for the browser's rich-clipboard wrapper, which happy-dom does not have. */
class FakeClipboardItem {
  readonly items: Record<string, Blob>;

  constructor(items: Record<string, Blob>) {
    this.items = items;
  }
}

/** A clipboard that records what was written, with the HTML flavour optionally refused. */
let clipboard: {
  write: Mock<(items: unknown[]) => Promise<void>>;
  writeText: Mock<(text: string) => Promise<void>>;
};

function stubClipboard({ refuseHtml = false } = {}) {
  const write = vi.fn<(items: unknown[]) => Promise<void>>(() =>
    refuseHtml ? Promise.reject(new Error('unsupported')) : Promise.resolve(),
  );
  const writeText = vi.fn<(text: string) => Promise<void>>(() => Promise.resolve());
  Object.defineProperty(navigator, 'clipboard', {
    value: { write, writeText },
    configurable: true,
    writable: true,
  });
  Object.defineProperty(window, 'isSecureContext', { value: true, configurable: true });
  clipboard = { write, writeText };
  return clipboard;
}

afterEach(() => {
  Reflect.deleteProperty(navigator, 'clipboard');
  vi.unstubAllGlobals();
  vi.useRealTimers();
});

describe('canCopy', () => {
  it('is false on a page that is not secure, where the clipboard is unavailable', () => {
    Object.defineProperty(window, 'isSecureContext', { value: false, configurable: true });
    expect(canCopy()).toBe(false);
  });

  it('is true on a secure page with a clipboard', () => {
    stubClipboard();
    expect(canCopy()).toBe(true);
  });
});

describe('copyQuote', () => {
  const quote = { text: 'plain', html: '<p>rich</p>' };

  it('writes both the rich and the plain flavour where the browser takes them', async () => {
    const clipboard = stubClipboard();
    vi.stubGlobal('ClipboardItem', FakeClipboardItem);
    await copyQuote(quote);
    expect(clipboard.write).toHaveBeenCalled();
    expect(clipboard.writeText).not.toHaveBeenCalled();
  });

  it('falls back to plain text when the browser refuses the rich flavour', async () => {
    const clipboard = stubClipboard({ refuseHtml: true });
    vi.stubGlobal('ClipboardItem', FakeClipboardItem);
    await copyQuote(quote);
    expect(clipboard.writeText).toHaveBeenCalledWith('plain');
  });

  it('writes plain text in a browser with no rich clipboard at all', async () => {
    const clipboard = stubClipboard();
    vi.stubGlobal('ClipboardItem', undefined);
    await copyQuote(quote);
    expect(clipboard.writeText).toHaveBeenCalledWith('plain');
  });
});

describe('the copy button', () => {
  function renderPanel(passage: Passage = versePassage(JOHN_3_16)) {
    render(
      <PassagePanel
        data={DATA}
        passage={passage}
        filter={DEFAULT_LINK_FILTER}
        onSelect={vi.fn()}
        onClose={vi.fn()}
        shareUrl={() => 'https://example.org/?ref=John.3.16'}
      />,
    );
  }

  beforeEach(() => {
    stubClipboard();
    vi.stubGlobal('ClipboardItem', undefined);
  });

  it('is not offered where the page cannot write to the clipboard', () => {
    Object.defineProperty(window, 'isSecureContext', { value: false, configurable: true });
    renderPanel();
    expect(screen.queryByRole('button', { name: /Copy John 3:16/ })).toBeNull();
  });

  it('copies the verse with its reference and a link', async () => {
    renderPanel();
    await userEvent.click(screen.getByRole('button', { name: 'Copy John 3:16 with a link' }));
    await waitFor(() => {
      expect(clipboard.writeText).toHaveBeenCalled();
    });
    const [written] = clipboard.writeText.mock.calls[0] ?? [];
    expect(written).toContain('For God so loved the world…');
    expect(written).toContain('John 3:16 (BSB)');
    expect(written).toContain('https://example.org/?ref=John.3.16');
  });

  /** The panel's one live region, which every copy button speaks through. */
  const verseStatus = () => screen.getAllByRole('status')[0];

  it('has one live region for all its copy buttons, not one each', () => {
    renderPanel();
    expect(screen.getAllByRole('button', { name: /^Copy .* with a link$/ }).length).toBeGreaterThan(
      1,
    );
    expect(screen.getAllByRole('status')).toHaveLength(1);
  });

  it('says so, and then stops saying so', async () => {
    renderPanel();
    await userEvent.click(screen.getByRole('button', { name: 'Copy John 3:16 with a link' }));
    await waitFor(() => {
      expect(verseStatus()?.textContent).toBe('John 3:16 copied');
    });
    await waitFor(
      () => {
        expect(verseStatus()?.textContent).toBe('');
      },
      { timeout: 4000 },
    );
  });

  it('copies a cross-referenced passage from its own button', async () => {
    renderPanel();
    await userEvent.click(screen.getByRole('button', { name: /Copy Romans 5:8–9 with a link/ }));
    await waitFor(() => {
      expect(clipboard.writeText).toHaveBeenCalled();
    });
  });

  it('says nothing when the clipboard refuses, and stays usable', async () => {
    clipboard.writeText.mockRejectedValueOnce(new Error('denied'));
    renderPanel();
    await userEvent.click(screen.getByRole('button', { name: 'Copy John 3:16 with a link' }));
    await waitFor(() => {
      expect(verseStatus()?.textContent).toBe('');
    });
  });

  it('copies a chapter\u2019s links rather than the chapter itself', async () => {
    renderPanel(chapterPassageOf(JOHN_3_16, CANONICAL_VERSIFICATION));
    expect(screen.queryByRole('button', { name: /Copy John 3 with a link/ })).toBeNull();
    await userEvent.click(screen.getByRole('button', { name: /Copy Romans 5:8–9 with a link/ }));
    await waitFor(() => {
      expect(clipboard.writeText).toHaveBeenCalled();
    });
    const [written] = clipboard.writeText.mock.calls[0] ?? [];
    expect(written).toContain('⁸');
  });
});

describe('quotePassage', () => {
  const versification = CANONICAL_VERSIFICATION;
  const { translation } = DATA;

  it('quotes one verse without a verse number', () => {
    const quote = quotePassage({
      translation,
      versification,
      names: enBooks,
      start: JOHN_3_16,
      end: JOHN_3_16,
      url: 'https://example.org/',
    });
    expect(quote.text.startsWith('For God so loved')).toBe(true);
    expect(quote.html).toContain('<blockquote>');
  });

  it('numbers the verses of a range, in superscript', () => {
    const quote = quotePassage({
      translation,
      versification,
      names: enBooks,
      start: ROM_5_8,
      end: ROM_5_9,
      url: 'https://example.org/',
    });
    expect(quote.text).toContain('⁸');
    expect(quote.text).toContain('⁹');
    expect(quote.html).toContain('<sup>8</sup>');
  });

  it('adds the chapter to the number where the range crosses one', () => {
    const quote = quotePassage({
      translation,
      versification,
      names: enBooks,
      start: JOHN_3_16,
      end: JOHN_3_17,
      url: 'https://example.org/',
    });
    expect(quote.text).toContain('¹⁶');
  });

  it('escapes anything in the text that would otherwise be markup', () => {
    const data = createVizData([], new Map([[JOHN_3_16, 'Love & <truth>']]));
    const quote = quotePassage({
      translation: data.translation,
      versification,
      names: enBooks,
      start: JOHN_3_16,
      end: JOHN_3_16,
      url: 'https://example.org/?a=1&b=2',
    });
    expect(quote.html).toContain('Love &amp; &lt;truth&gt;');
    expect(quote.html).toContain('a=1&amp;b=2');
  });

  it('leaves out a verse the translation omits', () => {
    const data = createVizData(
      [],
      new Map([
        [ROM_5_8, 'Kept'],
        [ROM_5_9, ''],
      ]),
    );
    const quote = quotePassage({
      translation: data.translation,
      versification,
      names: enBooks,
      start: ROM_5_8,
      end: ROM_5_9,
      url: 'https://example.org/',
    });
    expect(quote.text).toContain('Kept');
    expect(quote.text).not.toContain('⁹');
  });
});
