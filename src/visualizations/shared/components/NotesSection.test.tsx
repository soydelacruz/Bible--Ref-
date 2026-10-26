import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { CANONICAL_VERSIFICATION } from '../../../core/bible/versification.ts';
import type { StudyNote } from '../../../core/datasets/formats.ts';
import {
  createStudyNotesFile,
  createTranslationFile,
  verseIndex,
} from '../../../test-utils/fixtures.ts';
import { createVizData } from '../../../test-utils/viz-data.ts';
import { getTranslationManifest } from '../../../translations/registry.ts';
import { Translation } from '../../../translations/translation.ts';
import { resetStudyNotes, studyNotesIfLoaded, studyNotesLoader } from '../viz-data.ts';
import type { VizData } from '../viz-data.ts';
import { NotesSection } from './NotesSection.tsx';

const GEN_1_1 = verseIndex('Gen', 1, 1);
const GEN_1_2 = verseIndex('Gen', 1, 2);
const TEXT = 'In the beginning God created the heavens and the earth.';
const LONG = 'A long study note. '.repeat(40);

const NOTES: readonly StudyNote[] = [
  {
    number: 1,
    verse: GEN_1_1,
    at: 16,
    parts: [
      { kind: 'translation', text: ['Or “when God began”.'] },
      { kind: 'study', text: ['See ', { passage: [GEN_1_2, GEN_1_2], text: ['v. 2'] }, '.'] },
    ],
  },
  { number: 2, verse: GEN_1_1, at: 20, parts: [{ kind: 'study', text: [LONG] }] },
];

/** The fixture links and text, read in the NET, whose words the notes are about. */
function inTheNet(): VizData {
  return {
    ...createVizData(),
    translation: new Translation(getTranslationManifest('net'), CANONICAL_VERSIFICATION, {
      ...createTranslationFile(new Map([[GEN_1_1, TEXT]])),
      translationId: 'net',
    }),
  };
}

function serve(file: unknown) {
  const fetch = vi.fn<(input: string | URL) => Promise<Response>>(() =>
    Promise.resolve(new Response(JSON.stringify(file))),
  );
  vi.stubGlobal('fetch', fetch);
  return fetch;
}

beforeEach(() => {
  resetStudyNotes();
});

afterEach(() => {
  vi.unstubAllGlobals();
});

/** Unfolds the notes, which start folded; a reader's choice lasts, so it may be open already. */
async function openNotes() {
  const band = await screen.findByRole('button', { name: /^NET notes/ });
  if (band.getAttribute('aria-expanded') === 'false') {
    await userEvent.click(band);
  }
}

describe('NotesSection', () => {
  // First, before any test unfolds them: the fold is remembered for the rest of the file.
  it('starts folded, the band saying how many notes there are', async () => {
    serve(createStudyNotesFile('Gen', NOTES));
    render(<NotesSection verse={GEN_1_1} data={inTheNet()} onSelect={vi.fn()} />);
    const band = await screen.findByRole('button', { name: /^NET notes/ });
    expect(band.getAttribute('aria-expanded')).toBe('false');
    expect(band.textContent).toContain('2 notes');
    // The credit is a condition of using the notes, so it shows while they are folded too.
    expect(screen.getByText(/Biblical Studies Press/)).toBeDefined();
  });

  it('lists a verse’s notes under the words they are about, with the credit', async () => {
    serve(createStudyNotesFile('Gen', NOTES));
    render(<NotesSection verse={GEN_1_1} data={inTheNet()} onSelect={vi.fn()} />);
    await openNotes();
    expect(await screen.findByText('In the beginning')).toBeDefined();
    expect(screen.getByText('God')).toBeDefined();
    expect(screen.getByText('Or “when God began”.')).toBeDefined();
    expect(screen.getByText(/Biblical Studies Press/)).toBeDefined();
    expect(screen.getByRole('link', { name: 'netbible.org' }).getAttribute('href')).toBe(
      'https://netbible.org/',
    );
    // Once here, the book's notes are kept for the next verse opened.
    expect(studyNotesIfLoaded('Gen')?.book).toBe('Gen');
  });

  it('narrows the notes to one kind, and back', async () => {
    serve(createStudyNotesFile('Gen', NOTES));
    render(<NotesSection verse={GEN_1_1} data={inTheNet()} onSelect={vi.fn()} />);
    await openNotes();
    await userEvent.click(await screen.findByRole('button', { name: 'Wording 1' }));
    expect(screen.getByText('Or “when God began”.')).toBeDefined();
    expect(screen.queryByText(/A long study note/)).toBeNull();
    await userEvent.click(screen.getByRole('button', { name: 'All 2' }));
    expect(screen.getByText(/A long study note/)).toBeDefined();
  });

  it('folds a long note until the reader asks for all of it', async () => {
    serve(createStudyNotesFile('Gen', NOTES));
    render(<NotesSection verse={GEN_1_1} data={inTheNet()} onSelect={vi.fn()} />);
    await openNotes();
    const more = await screen.findByRole('button', { name: 'Read the whole note' });
    expect(more.getAttribute('aria-expanded')).toBe('false');
    await userEvent.click(more);
    expect(more.getAttribute('aria-expanded')).toBe('true');
    expect(more.textContent).toBe('Show less');
  });

  it('opens a passage a note cites', async () => {
    serve(createStudyNotesFile('Gen', NOTES));
    const onSelect = vi.fn();
    render(<NotesSection verse={GEN_1_1} data={inTheNet()} onSelect={onSelect} />);
    await openNotes();
    await userEvent.click(await screen.findByRole('button', { name: 'Go to Genesis 1:2' }));
    expect(onSelect).toHaveBeenCalledWith({ kind: 'verse', verse: GEN_1_2 });
  });

  it('says whose wording the notes follow when another translation is read', async () => {
    serve(createStudyNotesFile('Gen', NOTES));
    render(<NotesSection verse={GEN_1_1} data={createVizData()} onSelect={vi.fn()} />);
    await openNotes();
    expect(await screen.findByText(/the text above is the BSB/)).toBeDefined();
    // The words a note is about are the NET's, so they are not shown under another text.
    expect(screen.queryByText('In the beginning')).toBeNull();
  });

  it('shows nothing for a verse without notes', async () => {
    const fetch = serve(createStudyNotesFile('Gen', NOTES));
    const { container } = render(
      <NotesSection verse={GEN_1_2} data={inTheNet()} onSelect={vi.fn()} />,
    );
    await waitFor(() => {
      expect(studyNotesIfLoaded('Gen')).not.toBeNull();
    });
    expect(fetch).toHaveBeenCalledTimes(1);
    expect(container.innerHTML).toBe('');
  });

  it('forgets a failed download, so the next verse opened asks again', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(() => Promise.reject(new Error('offline'))),
    );
    const first = studyNotesLoader('Gen');
    const { container } = render(
      <NotesSection verse={GEN_1_1} data={inTheNet()} onSelect={vi.fn()} />,
    );
    await waitFor(() => {
      expect(studyNotesLoader('Gen')).not.toBe(first);
    });
    expect(container.innerHTML).toBe('');
  });
});
