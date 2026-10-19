import { render, screen, within } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { versePassage } from '../../../core/bible/passage.ts';
import { CANONICAL_VERSIFICATION } from '../../../core/bible/versification.ts';
import { verseIndex } from '../../../test-utils/fixtures.ts';
import { StudySection } from './StudySection.tsx';

function links() {
  return within(screen.getByRole('list')).getAllByRole('link');
}

describe('StudySection', () => {
  it('names each link by what it opens and the passage it opens it on', () => {
    render(
      <StudySection
        passage={versePassage(verseIndex('John', 3, 16))}
        versification={CANONICAL_VERSIFICATION}
      />,
    );
    expect(links().map((link) => link.getAttribute('aria-label'))).toEqual([
      'NET Bible notes on John 3:16',
      'Blue Letter Bible interlinear and lexicon on John 3:16',
      'BibleHub commentaries on John 3:16',
      'BibleHub parallel translations on John 3:16',
      'STEPBible word study on John 3:16',
    ]);
    expect(links()[0]?.getAttribute('href')).toBe('https://netbible.org/bible/John+3:16');
  });

  it('opens every site in a new tab that cannot reach back into the app', () => {
    render(
      <StudySection
        passage={versePassage(verseIndex('Ps', 23, 1))}
        versification={CANONICAL_VERSIFICATION}
      />,
    );
    for (const link of links()) {
      expect(link.getAttribute('target')).toBe('_blank');
      expect(link.getAttribute('rel')).toBe('noopener noreferrer');
    }
  });

  it('links a whole chapter', () => {
    render(
      <StudySection
        passage={{ kind: 'chapter', book: 'Rom', chapter: 8 }}
        versification={CANONICAL_VERSIFICATION}
      />,
    );
    expect(links().map((link) => link.getAttribute('aria-label'))).toEqual([
      'NET Bible notes on Romans 8',
      'Blue Letter Bible interlinear and lexicon on Romans 8',
      'BibleHub study page on Romans 8',
      'STEPBible word study on Romans 8',
    ]);
  });

  it('is a section of the panel, under its own band', () => {
    render(
      <StudySection
        passage={versePassage(verseIndex('Gen', 1, 1))}
        versification={CANONICAL_VERSIFICATION}
      />,
    );
    expect(screen.getByRole('heading').textContent).toContain('Study elsewhere');
  });
});
