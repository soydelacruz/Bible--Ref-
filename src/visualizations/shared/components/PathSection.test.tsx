import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { versePassage, type Passage } from '../../../core/bible/passage.ts';
import { verseIndex } from '../../../test-utils/fixtures.ts';
import { createVizData } from '../../../test-utils/viz-data.ts';
import { createLinkFilter, DEFAULT_LINK_FILTER } from '../link-filter.ts';
import { PassagePanel } from './PassagePanel.tsx';

const GEN_3_15 = verseIndex('Gen', 3, 15);
const ROM_16_20 = verseIndex('Rom', 16, 20);
const REV_12_9 = verseIndex('Rev', 12, 9);

const DATA = createVizData(
  [
    { from: GEN_3_15, to: ROM_16_20, votes: 12 },
    { from: REV_12_9, to: ROM_16_20, votes: 1 },
  ],
  new Map([
    [GEN_3_15, 'Fixture text of the first verse.'],
    [ROM_16_20, 'Fixture text of the middle verse.'],
    [REV_12_9, 'Fixture text of the last verse.'],
  ]),
);

const EVERY_LINK = createLinkFilter(-Infinity);

function panelFor(passage: Passage, onSelect = vi.fn(), filter = EVERY_LINK) {
  return (
    <PassagePanel
      data={DATA}
      passage={passage}
      filter={filter}
      onSelect={onSelect}
      onClose={vi.fn()}
      shareUrl={() => 'https://example.org/'}
    />
  );
}

/** The path's own section: the panel has other lists in it, such as the study links. */
function pathSection() {
  const section = screen.getByRole('heading', { name: /^Path/ }).closest('section');
  if (!section) {
    throw new Error('The path has no section of its own.');
  }
  return within(section);
}

async function findPathTo(reference: string) {
  await userEvent.type(
    screen.getByRole('textbox', { name: 'Passage to find a path to' }),
    reference,
  );
  await userEvent.click(screen.getByRole('button', { name: 'Find' }));
}

describe('PathSection', () => {
  it('shows the chain of links from the passage to the one asked for', async () => {
    render(panelFor(versePassage(GEN_3_15)));
    await findPathTo('Rev 12:9');
    expect(screen.getByRole('status').textContent).toBe(
      'Genesis 3:15 to Revelation 12:9 in 2 links:',
    );
    const steps = within(pathSection().getByRole('list')).getAllByRole('listitem');
    expect(steps.map((step) => step.querySelector('strong')?.textContent)).toEqual([
      'Genesis 3:15',
      'Romans 16:20',
      'Revelation 12:9',
    ]);
    expect(steps[1]?.textContent).toContain('references · 12 votes');
    expect(steps[2]?.textContent).toContain('is referenced by · 1 vote');
    expect(steps[2]?.textContent).toContain('Fixture text of the last verse.');
  });

  it('travels to a step, and keeps the path from there', async () => {
    const onSelect = vi.fn();
    const { rerender } = render(panelFor(versePassage(GEN_3_15), onSelect));
    await findPathTo('Rev 12:9');
    await userEvent.click(
      within(pathSection().getByRole('list')).getByRole('button', { name: /Romans 16:20/ }),
    );
    expect(onSelect).toHaveBeenCalledWith(versePassage(ROM_16_20));

    rerender(panelFor(versePassage(ROM_16_20), onSelect));
    expect(screen.getByRole('status').textContent).toBe(
      'Romans 16:20 to Revelation 12:9 in 1 link:',
    );
  });

  it('says so when the passage is already the destination', async () => {
    render(panelFor(versePassage(GEN_3_15)));
    await findPathTo('Gen 3');
    expect(screen.getByRole('status').textContent).toBe(
      'This passage is Genesis 3, or contains it.',
    );
    expect(pathSection().queryByRole('list')).toBeNull();
  });

  it('says so when no chain of links gets there', async () => {
    render(panelFor(versePassage(GEN_3_15)));
    await findPathTo('Isa 7:14');
    expect(screen.getByRole('status').textContent).toMatch(
      /^No chain of links reaches Isaiah 7:14/,
    );
  });

  it('only follows the links the filters show', async () => {
    render(panelFor(versePassage(GEN_3_15), vi.fn(), DEFAULT_LINK_FILTER));
    await findPathTo('Rev 12:9');
    expect(screen.getByRole('status').textContent).toMatch(/^No chain of links/);
  });

  it('explains a reference it cannot read, and finds nothing', async () => {
    render(panelFor(versePassage(GEN_3_15)));
    await findPathTo('Hesitations 4:4');
    expect(screen.getByRole('alert').textContent).toBe('Unknown book “Hesitations”.');
    expect(screen.queryByRole('status')).toBeNull();
    await userEvent.type(screen.getByRole('textbox', { name: 'Passage to find a path to' }), 'x');
    expect(screen.queryByRole('alert')).toBeNull();
  });

  it('can be cleared', async () => {
    render(panelFor(versePassage(GEN_3_15)));
    await findPathTo('Rev 12:9');
    await userEvent.click(screen.getByRole('button', { name: 'Clear path' }));
    expect(screen.queryByRole('status')).toBeNull();
    expect(pathSection().queryByRole('list')).toBeNull();
  });
});
