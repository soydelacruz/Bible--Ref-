import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import type { NoteText } from '../../../core/datasets/note-text.ts';
import { NoteParts, NoteTextView } from './NoteText.tsx';

const TEXT: NoteText = [
  { style: 'italic', text: ['In'] },
  ' ',
  { style: 'bold', text: ['the'] },
  ' ',
  { style: 'smallCaps', text: ['Lord'] },
  ' ',
  { style: 'hebrew', text: ['אֱלֹהִים'] },
  ' ',
  { style: 'transliteration', text: ['ʾelohim'] },
  ' ',
  { style: 'greek', text: ['λόγος'] },
  ' ',
  { style: 'manuscript', text: ['P'] },
  { style: 'superscript', text: ['46'] },
  '\nSee ',
  { passage: [1, 1], text: ['v. 2'] },
  '.',
];

const describePassage = ([first]: readonly [number, number]) => `Go to verse ${String(first)}`;

describe('NoteTextView', () => {
  it('builds the note from its structure, each style its own element', () => {
    const { container } = render(<NoteTextView text={TEXT} describe={describePassage} />);
    expect(container.querySelector('i')?.textContent).toBe('In');
    expect(container.querySelector('b')?.textContent).toBe('the');
    expect(container.querySelector('[lang="he"]')?.getAttribute('dir')).toBe('rtl');
    expect(container.querySelector('[lang="grc"]')?.textContent).toBe('λόγος');
    expect(container.querySelector('sup')?.textContent).toBe('46');
    expect(container.querySelectorAll('br')).toHaveLength(1);
    expect(container.textContent).toContain('Lord אֱלֹהִים ʾelohim λόγος P46');
    // Without a way to open it, a citation is just its words.
    expect(screen.queryByRole('button')).toBeNull();
  });

  it('opens a cited passage, without the click reaching what the note sits in', async () => {
    const onCite = vi.fn();
    const onOuterClick = vi.fn();
    render(
      <div role="presentation" onClick={onOuterClick}>
        <NoteTextView text={TEXT} onCite={onCite} describe={describePassage} />
      </div>,
    );
    await userEvent.click(screen.getByRole('button', { name: 'Go to verse 1' }));
    expect(onCite).toHaveBeenCalledWith([1, 1]);
    expect(onOuterClick).not.toHaveBeenCalled();
  });
});

describe('NoteParts', () => {
  it('names the kind of each part', () => {
    render(
      <NoteParts
        parts={[
          { kind: 'translation', text: ['Or “sky.”'] },
          { kind: 'text-critical', text: ['MT reads.'] },
        ]}
        describe={describePassage}
      />,
    );
    expect(screen.getByText('Translation')).toBeDefined();
    expect(screen.getByText('Text-critical')).toBeDefined();
    expect(screen.getByText('Or “sky.”')).toBeDefined();
  });
});
