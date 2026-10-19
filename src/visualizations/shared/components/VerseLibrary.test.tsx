import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { versePassage } from '../../../core/bible/passage.ts';
import { CANONICAL_VERSIFICATION } from '../../../core/bible/versification.ts';
import { verseIndex } from '../../../test-utils/fixtures.ts';
import { createVizData } from '../../../test-utils/viz-data.ts';
import { LIBRARY_PREFERENCE } from '../../../library/use-library.ts';
import { writePreference } from '../../../shared/lib/preferences.ts';
import { DEFAULT_LINK_FILTER } from '../link-filter.ts';
import { EXPORT_FILE_NAME, SavedMenu } from './SavedMenu.tsx';
import { PassagePanel } from './PassagePanel.tsx';

const JOHN_3_16 = verseIndex('John', 3, 16);
const GEN_1_1 = verseIndex('Gen', 1, 1);
const DATA = createVizData(
  [],
  new Map([
    [JOHN_3_16, 'Fixture text of the saved verse.'],
    [GEN_1_1, 'Fixture text of the first verse.'],
  ]),
);

function renderPanel(verse = JOHN_3_16) {
  return render(
    <PassagePanel
      data={DATA}
      passage={versePassage(verse)}
      filter={DEFAULT_LINK_FILTER}
      onSelect={vi.fn()}
      onClose={vi.fn()}
      shareUrl={() => 'https://example.org/'}
    />,
  );
}

function renderMenu(onSelect = vi.fn()) {
  render(
    <SavedMenu
      versification={CANONICAL_VERSIFICATION}
      translation={DATA.translation}
      onSelect={onSelect}
    />,
  );
  return onSelect;
}

async function openMenu() {
  await userEvent.click(screen.getByRole('button', { name: /^Saved verses/ }));
}

beforeEach(() => {
  // Through the store, not just localStorage: it keeps what it read for the rest of the visit.
  writePreference(LIBRARY_PREFERENCE, '');
});

describe('VerseLibrary', () => {
  it('saves a verse, and unsaves it', async () => {
    renderPanel();
    await userEvent.click(screen.getByRole('button', { name: 'Save verse' }));
    expect(screen.getByRole('button', { name: 'Saved' }).getAttribute('aria-pressed')).toBe('true');
    await userEvent.click(screen.getByRole('button', { name: 'Saved' }));
    expect(screen.getByRole('button', { name: 'Save verse' })).toBeDefined();
  });

  it('marks the verse in the colour chosen, and takes it off again', async () => {
    renderPanel();
    const colours = screen.getByRole('group', { name: 'Highlight' });
    await userEvent.click(within(colours).getByRole('button', { name: 'Green' }));
    expect(screen.getByText('Fixture text of the saved verse.').dataset['color']).toBe('green');
    await userEvent.click(within(colours).getByRole('button', { name: 'No highlight' }));
    expect(screen.getByText('Fixture text of the saved verse.').dataset['color']).toBeUndefined();
  });

  it('keeps a note as it is typed', async () => {
    const { unmount } = renderPanel();
    await userEvent.type(screen.getByRole('textbox', { name: 'Note' }), 'Read at the wedding');
    unmount();
    renderPanel();
    expect(screen.getByRole('textbox', { name: 'Note' })).toHaveProperty(
      'value',
      'Read at the wedding',
    );
  });
});

describe('SavedMenu', () => {
  it('says how to start when nothing is saved', async () => {
    renderMenu();
    await openMenu();
    expect(screen.getByText(/Nothing saved yet/)).toBeDefined();
    expect(screen.getByRole('button', { name: /Export/ })).toHaveProperty('disabled', true);
  });

  it('lists what is kept, notes in place of the text, and opens a verse', async () => {
    renderPanel(GEN_1_1);
    await userEvent.click(screen.getByRole('button', { name: 'Save verse' }));
    renderPanel(JOHN_3_16);
    await userEvent.type(
      screen.getAllByRole('textbox', { name: 'Note' })[1] ?? document.body,
      'Hope',
    );
    const onSelect = renderMenu();
    await openMenu();
    const count = screen.getByText('2 verses saved on this device.');
    // The menu's own list: the panels rendered above have lists of their own.
    const items = within(count.parentElement ?? document.body).getAllByRole('listitem');
    expect(items.map((item) => item.querySelector('strong')?.textContent)).toEqual([
      'Genesis 1:1',
      'John 3:16',
    ]);
    expect(items[0]?.textContent).toContain('Fixture text of the first verse.');
    expect(items[1]?.textContent).toContain('Hope');
    await userEvent.click(within(items[1] ?? document.body).getByRole('button'));
    expect(onSelect).toHaveBeenCalledWith(versePassage(JOHN_3_16));
  });

  it('exports the library as a file', async () => {
    renderPanel();
    await userEvent.click(screen.getByRole('button', { name: 'Save verse' }));
    let exported = '';
    vi.spyOn(URL, 'createObjectURL').mockImplementation((blob) => {
      void (blob as Blob).text().then((text) => {
        exported = text;
      });
      return 'blob:export';
    });
    vi.spyOn(URL, 'revokeObjectURL').mockImplementation(() => undefined);
    const names: string[] = [];
    vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(function (
      this: HTMLAnchorElement,
    ) {
      names.push(this.download);
    });
    renderMenu();
    await openMenu();
    await userEvent.click(screen.getByRole('button', { name: /Export/ }));
    expect(names).toEqual([EXPORT_FILE_NAME]);
    await vi.waitFor(() => {
      expect(exported).toContain('"John.3.16"');
    });
    vi.restoreAllMocks();
  });

  it('imports an exported file, and says how much it brought', async () => {
    renderMenu();
    await openMenu();
    const file = new File(
      [
        JSON.stringify({
          format: 'bible-cross-references-library',
          version: 1,
          verses: { 'Gen.1.1': { saved: true, updatedAt: 1 } },
        }),
      ],
      'saved.json',
      { type: 'application/json' },
    );
    await userEvent.click(screen.getByRole('button', { name: /Import/ }));
    await userEvent.upload(screen.getByTestId('import-file'), file);
    expect(await screen.findByText('Imported 1 verse.')).toBeDefined();
    expect(screen.getAllByRole('listitem')).toHaveLength(1);
  });

  it('refuses a file that holds no saved verses', async () => {
    renderMenu();
    await openMenu();
    await userEvent.upload(
      screen.getByTestId('import-file'),
      new File(['{}'], 'other.json', { type: 'application/json' }),
    );
    expect(await screen.findByText(/holds no saved verses/)).toBeDefined();
  });
});
