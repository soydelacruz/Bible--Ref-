import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { CANONICAL_VERSIFICATION } from '../../../core/bible/versification.ts';
import { EMPTY_LIBRARY, serializeLibrary, updateEntry } from '../../../library/library.ts';
import { LIBRARY_PREFERENCE } from '../../../library/use-library.ts';
import { writePreference } from '../../../shared/lib/preferences.ts';
import { verseIndex } from '../../../test-utils/fixtures.ts';
import { createVizData } from '../../../test-utils/viz-data.ts';
import { SavedMenu } from './SavedMenu.tsx';

const JOHN_3_16 = verseIndex('John', 3, 16);
const GEN_1_1 = verseIndex('Gen', 1, 1);

beforeEach(() => {
  const saved = updateEntry(EMPTY_LIBRARY, JOHN_3_16, { saved: true }, 1);
  const noted = updateEntry(saved, GEN_1_1, { note: 'Hope' }, 2);
  writePreference(LIBRARY_PREFERENCE, serializeLibrary(noted, CANONICAL_VERSIFICATION));
});

describe('SavedMenu, before the text has arrived', () => {
  it('lists the verses and their notes, and leaves out only the words still on their way', async () => {
    const { translation } = createVizData([], new Map([[JOHN_3_16, 'Fixture text.']]));
    const { rerender } = render(
      <SavedMenu versification={CANONICAL_VERSIFICATION} translation={null} onSelect={vi.fn()} />,
    );
    await userEvent.click(screen.getByRole('button', { name: /^Saved verses/ }));
    const list = screen.getByRole('list');
    const items = within(list).getAllByRole('listitem');
    expect(items.map((item) => item.querySelector('strong')?.textContent)).toEqual([
      'Genesis 1:1',
      'John 3:16',
    ]);
    expect(items[0]?.textContent).toContain('Hope');
    expect(list.textContent).not.toContain('Fixture text.');

    rerender(
      <SavedMenu
        versification={CANONICAL_VERSIFICATION}
        translation={translation}
        onSelect={vi.fn()}
      />,
    );
    expect(screen.getByRole('list').textContent).toContain('Fixture text.');
  });
});
