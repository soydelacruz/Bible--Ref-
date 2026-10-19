import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { GENRES } from '../../../core/bible/genres.ts';
import { CANONICAL_VERSIFICATION } from '../../../core/bible/versification.ts';
import { verseIndex } from '../../../test-utils/fixtures.ts';
import { createVizData } from '../../../test-utils/viz-data.ts';
import { GenreToggles } from './GenreToggles.tsx';
import { ReferenceSearch } from './ReferenceSearch.tsx';

describe('ReferenceSearch', () => {
  function renderSearch() {
    const onSelect = vi.fn();
    render(<ReferenceSearch versification={CANONICAL_VERSIFICATION} onSelect={onSelect} />);
    return { onSelect, input: screen.getByRole('searchbox') };
  }

  it('opens a verse that is typed in full', async () => {
    const { onSelect, input } = renderSearch();
    await userEvent.type(input, 'John 3:16{Enter}');
    expect(onSelect).toHaveBeenCalledWith({ kind: 'verse', verse: verseIndex('John', 3, 16) });
  });

  it.each(['jn 3 16', 'Gen.1.1', 'ps 23', 'JOHN 3:16'])(
    'accepts %s, the way a reader actually types it',
    async (typed) => {
      const { onSelect, input } = renderSearch();
      await userEvent.type(input, `${typed}{Enter}`);
      expect(onSelect).toHaveBeenCalled();
    },
  );

  it('opens a whole chapter when no verse is given', async () => {
    const { onSelect, input } = renderSearch();
    await userEvent.type(input, 'Psalm 23{Enter}');
    expect(onSelect).toHaveBeenCalledWith({ kind: 'chapter', book: 'Ps', chapter: 23 });
  });

  it('says what is wrong instead of doing nothing', async () => {
    const { onSelect, input } = renderSearch();
    await userEvent.type(input, 'Hesitations 4:4{Enter}');
    expect(onSelect).not.toHaveBeenCalled();
    expect(screen.getByRole('alert').textContent).toBeTruthy();
  });

  it('points the box at its own message, so it is announced', async () => {
    const { input } = renderSearch();
    await userEvent.type(input, 'nonsense{Enter}');
    const described = input.getAttribute('aria-describedby');
    expect(described).toBeTruthy();
    expect(document.getElementById(described ?? '')).not.toBeNull();
  });

  it('clears the message once the next reference is good', async () => {
    const { input } = renderSearch();
    await userEvent.type(input, 'nonsense{Enter}');
    expect(screen.getByRole('alert')).toBeDefined();
    await userEvent.clear(input);
    await userEvent.type(input, 'John 3:16{Enter}');
    expect(screen.queryByRole('alert')).toBeNull();
  });

  it('does nothing for an empty box', async () => {
    const { onSelect, input } = renderSearch();
    await userEvent.type(input, '{Enter}');
    expect(onSelect).not.toHaveBeenCalled();
  });
});

describe('ReferenceSearch, given words rather than a reference', () => {
  const JOHN_4_10 = verseIndex('John', 4, 10);
  const JER_2_13 = verseIndex('Jer', 2, 13);
  const MARK_1_1 = verseIndex('Mark', 1, 1);
  const { translation } = createVizData(
    [],
    new Map([
      [JER_2_13, 'They have forsaken Me, the fountain of Living Water.'],
      [JOHN_4_10, 'He would have given you living water.'],
      [MARK_1_1, 'The beginning of the gospel, as Mark tells it.'],
    ]),
  );

  function renderSearch() {
    const onSelect = vi.fn();
    render(
      <ReferenceSearch
        versification={CANONICAL_VERSIFICATION}
        translation={translation}
        onSelect={onSelect}
      />,
    );
    return { onSelect, input: screen.getByRole('searchbox') };
  }

  it('lists the verses that contain them, in canonical order', async () => {
    const { input } = renderSearch();
    await userEvent.type(input, 'living water{Enter}');
    expect(screen.getByRole('status').textContent).toBe('2 verses contain “living water”.');
    expect(
      screen.getAllByRole('listitem').map((item) => item.querySelector('strong')?.textContent),
    ).toEqual(['Jeremiah 2:13', 'John 4:10']);
  });

  it('marks the words in each verse, whatever their case', async () => {
    const { input } = renderSearch();
    await userEvent.type(input, 'living water{Enter}');
    expect([...document.querySelectorAll('mark')].map((mark) => mark.textContent)).toEqual([
      'Living Water',
      'living water',
    ]);
  });

  it('opens the verse that is chosen, and closes the list', async () => {
    const { onSelect, input } = renderSearch();
    await userEvent.type(input, 'living water{Enter}');
    await userEvent.click(screen.getByRole('button', { name: /John 4:10/ }));
    expect(onSelect).toHaveBeenCalledWith({ kind: 'verse', verse: JOHN_4_10 });
    expect(screen.queryByRole('region')).toBeNull();
    expect((input as HTMLInputElement).value).toBe('');
  });

  it('closes the list with Escape, the close button, or a click elsewhere', async () => {
    const { input } = renderSearch();
    await userEvent.type(input, 'living water{Enter}');
    await userEvent.keyboard('{Escape}');
    expect(screen.queryByRole('region')).toBeNull();

    await userEvent.type(input, '{Enter}');
    await userEvent.click(screen.getByRole('button', { name: 'Close the results' }));
    expect(screen.queryByRole('region')).toBeNull();

    await userEvent.type(input, '{Enter}');
    await userEvent.click(document.body);
    expect(screen.queryByRole('region')).toBeNull();
  });

  it('says how many there are when it shows only the first of them', async () => {
    const { input } = renderSearch();
    await userEvent.type(input, 'verse number{Enter}');
    expect(screen.getByRole('status').textContent).toMatch(
      /^31,099 verses contain “verse number”\. Showing the first 100;/,
    );
    expect(screen.getAllByRole('listitem')).toHaveLength(100);
  });

  it('opens a reference rather than searching for it', async () => {
    const { onSelect, input } = renderSearch();
    await userEvent.type(input, 'Mark 1{Enter}');
    expect(onSelect).toHaveBeenCalledWith({ kind: 'chapter', book: 'Mark', chapter: 1 });
  });

  it('searches for a book’s name when it is in quotation marks', async () => {
    const { onSelect, input } = renderSearch();
    await userEvent.type(input, '"mark"{Enter}');
    expect(onSelect).not.toHaveBeenCalled();
    expect(screen.getByRole('status').textContent).toBe('1 verse contains “mark”.');
  });

  it('says so when no verse contains the words', async () => {
    const { input } = renderSearch();
    await userEvent.type(input, 'zebra crossing{Enter}');
    expect(screen.getByRole('alert').textContent).toMatch(/^No verse contains “zebra crossing”/);
  });

  it('treats a missing chapter of a real book as a mistyped reference, not a search', async () => {
    const { input } = renderSearch();
    await userEvent.type(input, 'John 99{Enter}');
    expect(screen.getByRole('alert').textContent).toBe('John has 21 chapters.');
  });

  it('keeps the message for an unknown book when the words are nowhere in the text', async () => {
    const { input } = renderSearch();
    await userEvent.type(input, 'Hesitations 4:4{Enter}');
    expect(screen.getByRole('alert').textContent).toBe('Unknown book “Hesitations”.');
  });
});

describe('GenreToggles', () => {
  it('shows every genre, grouped by testament', () => {
    render(<GenreToggles hiddenGenres={new Set()} onToggle={vi.fn()} />);
    expect(screen.getByText('Old Testament')).toBeDefined();
    expect(screen.getByText('New Testament')).toBeDefined();
    expect(screen.getAllByRole('button')).toHaveLength(GENRES.length);
  });

  it('marks a genre that is showing as pressed', () => {
    render(<GenreToggles hiddenGenres={new Set()} onToggle={vi.fn()} />);
    for (const button of screen.getAllByRole('button')) {
      expect(button.getAttribute('aria-pressed')).toBe('true');
    }
  });

  it('marks a hidden genre as not pressed', () => {
    render(<GenreToggles hiddenGenres={new Set(['law'])} onToggle={vi.fn()} />);
    expect(screen.getByRole('button', { name: /Law/ }).getAttribute('aria-pressed')).toBe('false');
  });

  it('reports the genre that was toggled', async () => {
    const onToggle = vi.fn();
    render(<GenreToggles hiddenGenres={new Set()} onToggle={onToggle} />);
    await userEvent.click(screen.getByRole('button', { name: /Revelation/ }));
    expect(onToggle).toHaveBeenCalledWith('revelation');
  });
});
