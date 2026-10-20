import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import type { StudyNote } from '../../core/datasets/formats.ts';
import { InlineNote, VerseWithNotes } from './VerseWithNotes.tsx';

const TEXT = 'In the beginning God created the heavens and the earth.';
const BEGINNING: StudyNote = {
  number: 1,
  verse: 0,
  at: 16,
  parts: [{ kind: 'translation', text: ['Or “In the beginning of”.'] }],
};
const GOD: StudyNote = {
  number: 2,
  verse: 0,
  at: 20,
  parts: [{ kind: 'study', text: ['See ', { passage: [1, 1], text: ['v. 2'] }, '.'] }],
};
const PHRASES = new Map<number, string | null>([
  [1, 'In the beginning'],
  [2, 'God'],
]);

describe('VerseWithNotes', () => {
  it('reads as the verse, with a named mark after the words each note is about', () => {
    const { container } = render(
      <VerseWithNotes
        text={TEXT}
        notes={[GOD, BEGINNING]}
        phrases={PHRASES}
        openNumber={2}
        noteId="note"
        onToggle={vi.fn()}
      />,
    );
    expect(container.textContent).toBe(TEXT);
    const beginning = screen.getByRole('button', {
      name: 'Translation note on “In the beginning”',
    });
    expect(beginning.dataset['kind']).toBe('translation');
    expect(beginning.getAttribute('aria-expanded')).toBe('false');
    const god = screen.getByRole('button', { name: 'Study note on “God”' });
    expect(god.getAttribute('aria-expanded')).toBe('true');
    expect(god.getAttribute('aria-controls')).toBe('note');
  });

  it('opens a note from its mark without selecting the verse around it', async () => {
    const onToggle = vi.fn();
    const onVerseClick = vi.fn();
    render(
      <div role="presentation" onClick={onVerseClick}>
        <VerseWithNotes
          text={TEXT}
          notes={[BEGINNING]}
          phrases={new Map([[1, null]])}
          openNumber={null}
          noteId="note"
          onToggle={onToggle}
        />
      </div>,
    );
    await userEvent.click(screen.getByRole('button', { name: 'Translation note' }));
    expect(onToggle).toHaveBeenCalledWith(BEGINNING);
    expect(onVerseClick).not.toHaveBeenCalled();
  });
});

describe('InlineNote', () => {
  it('shows the note under its words, closes, and keeps its clicks to itself', async () => {
    const onClose = vi.fn();
    const onCite = vi.fn();
    const onVerseClick = vi.fn();
    render(
      <div role="presentation" onClick={onVerseClick}>
        <InlineNote
          id="note"
          note={GOD}
          phrase="God"
          handlers={{ onCite, describe: () => 'Go to Genesis 1:2' }}
          onClose={onClose}
        />
      </div>,
    );
    expect(screen.getByText('God')).toBeDefined();
    expect(screen.getByText('Study')).toBeDefined();
    await userEvent.click(screen.getByText(/See/));
    expect(onVerseClick).not.toHaveBeenCalled();
    await userEvent.click(screen.getByRole('button', { name: 'Go to Genesis 1:2' }));
    expect(onCite).toHaveBeenCalledWith([1, 1]);
    await userEvent.click(screen.getByRole('button', { name: 'Close the note' }));
    expect(onClose).toHaveBeenCalled();
  });

  it('leaves out the words when a note was marked before any', () => {
    const { container } = render(
      <InlineNote
        id="note"
        note={BEGINNING}
        phrase={null}
        handlers={{ describe: () => '' }}
        onClose={vi.fn()}
      />,
    );
    expect(container.querySelectorAll('p')).toHaveLength(1);
  });
});
