import { act, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { versePassage, type Passage } from '../../../core/bible/passage.ts';
import { verseIndex } from '../../../test-utils/fixtures.ts';
import { createVizData } from '../../../test-utils/viz-data.ts';
import type { PathStep } from '../connection-path.ts';
import { createLinkFilter, DEFAULT_LINK_FILTER } from '../link-filter.ts';
import { PathLight, type LitSteps } from '../path-light.ts';
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

function panelFor(
  passage: Passage,
  onSelect = vi.fn(),
  filter = EVERY_LINK,
  pathLight?: PathLight,
) {
  return (
    <PassagePanel
      data={DATA}
      passage={passage}
      filter={filter}
      onSelect={onSelect}
      onClose={vi.fn()}
      shareUrl={() => 'https://example.org/'}
      {...(pathLight && { pathLight })}
    />
  );
}

/** What the picture beside the panel was asked to draw, and a way to say which steps it lit. */
function drawingPicture() {
  const light = new PathLight();
  const plays: {
    readonly steps: readonly PathStep[];
    readonly signal: AbortSignal;
    readonly onLit: (lit: LitSteps | null) => void;
  }[] = [];
  light.attach((steps, { signal, onLit }) => {
    plays.push({ steps, signal, onLit });
    return Promise.resolve(true);
  });
  return { light, plays };
}

/** The chain's steps as listed, each with whether it is lit. */
function litSteps() {
  return within(pathSection().getByRole('list'))
    .getAllByRole('listitem')
    .map((step) => step.hasAttribute('data-lit'));
}

/** The path's own section: the panel has other lists in it (the study links) and a live region. */
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
  await userEvent.click(screen.getByRole('button', { name: 'Find path' }));
}

describe('PathSection', () => {
  it('shows the chain of links from the passage to the one asked for', async () => {
    render(panelFor(versePassage(GEN_3_15)));
    await findPathTo('Rev 12:9');
    expect(pathSection().getByRole('status').textContent).toBe(
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
    expect(pathSection().getByRole('status').textContent).toBe(
      'Romans 16:20 to Revelation 12:9 in 1 link:',
    );
  });

  it('says so when the passage is already the destination', async () => {
    render(panelFor(versePassage(GEN_3_15)));
    await findPathTo('Gen 3');
    expect(pathSection().getByRole('status').textContent).toBe(
      'This passage is Genesis 3, or contains it.',
    );
    expect(pathSection().queryByRole('list')).toBeNull();
  });

  it('says so when no chain of links gets there', async () => {
    render(panelFor(versePassage(GEN_3_15)));
    await findPathTo('Isa 7:14');
    expect(pathSection().getByRole('status').textContent).toMatch(
      /^No chain of links reaches Isaiah 7:14/,
    );
  });

  it('only follows the links the filters show', async () => {
    render(panelFor(versePassage(GEN_3_15), vi.fn(), DEFAULT_LINK_FILTER));
    await findPathTo('Rev 12:9');
    expect(pathSection().getByRole('status').textContent).toMatch(/^No chain of links/);
  });

  it('explains a reference it cannot read, and finds nothing', async () => {
    render(panelFor(versePassage(GEN_3_15)));
    await findPathTo('Hesitations 4:4');
    expect(screen.getByRole('alert').textContent).toBe(
      'No book is called “Hesitations”. Try a name or abbreviation, like “Rev 12:9”.',
    );
    expect(pathSection().queryByRole('status')).toBeNull();
    await userEvent.type(screen.getByRole('textbox', { name: 'Passage to find a path to' }), 'x');
    expect(screen.queryByRole('alert')).toBeNull();
  });

  it('clears the last path when the next entry cannot be read', async () => {
    render(panelFor(versePassage(GEN_3_15)));
    await findPathTo('Rev 12:9');
    expect(pathSection().getByRole('list')).toBeDefined();
    const input = screen.getByRole('textbox', { name: 'Passage to find a path to' });
    await userEvent.clear(input);
    await findPathTo('Hesitations 4:4');
    expect(screen.getByRole('alert')).toBeDefined();
    // No path left under the message, to be read as the answer to it.
    expect(pathSection().queryByRole('status')).toBeNull();
    expect(pathSection().queryByRole('list')).toBeNull();
  });

  it('can be cleared', async () => {
    render(panelFor(versePassage(GEN_3_15)));
    await findPathTo('Rev 12:9');
    await userEvent.click(screen.getByRole('button', { name: 'Clear path' }));
    expect(pathSection().queryByRole('status')).toBeNull();
    expect(pathSection().queryByRole('list')).toBeNull();
  });

  describe('beside a picture that draws it', () => {
    it('has the chain drawn once, when it appears', async () => {
      const { light, plays } = drawingPicture();
      render(panelFor(versePassage(GEN_3_15), vi.fn(), EVERY_LINK, light));
      await findPathTo('Rev 12:9');
      expect(plays.map(({ steps }) => steps.map((step) => step.verse))).toEqual([
        [GEN_3_15, ROM_16_20, REV_12_9],
      ]);
    });

    it('lights up the step the light is heading for, and all of them together', async () => {
      const { light, plays } = drawingPicture();
      render(panelFor(versePassage(GEN_3_15), vi.fn(), EVERY_LINK, light));
      await findPathTo('Rev 12:9');
      expect(litSteps()).toEqual([false, false, false]);
      act(() => {
        plays[0]?.onLit({ first: 1, last: 1 });
      });
      expect(litSteps()).toEqual([false, true, false]);
      act(() => {
        plays[0]?.onLit({ first: 2, last: 2 });
      });
      expect(litSteps()).toEqual([false, false, true]);
      act(() => {
        plays[0]?.onLit({ first: 0, last: 2 });
      });
      expect(litSteps()).toEqual([true, true, true]);
      act(() => {
        plays[0]?.onLit(null);
      });
      expect(litSteps()).toEqual([false, false, false]);
    });

    it('plays it again on request', async () => {
      const { light, plays } = drawingPicture();
      render(panelFor(versePassage(GEN_3_15), vi.fn(), EVERY_LINK, light));
      await findPathTo('Rev 12:9');
      await userEvent.click(pathSection().getByRole('button', { name: 'Play again' }));
      expect(plays).toHaveLength(2);
      expect(plays[0]?.signal.aborted).toBe(true);
    });

    it('has it taken off the picture when the path is cleared or the panel goes', async () => {
      const { light, plays } = drawingPicture();
      const { unmount } = render(panelFor(versePassage(GEN_3_15), vi.fn(), EVERY_LINK, light));
      await findPathTo('Rev 12:9');
      await userEvent.click(screen.getByRole('button', { name: 'Clear path' }));
      expect(plays[0]?.signal.aborted).toBe(true);
      await userEvent.clear(screen.getByRole('textbox', { name: 'Passage to find a path to' }));
      await findPathTo('Rev 12:9');
      unmount();
      expect(plays).toHaveLength(2);
      expect(plays[1]?.signal.aborted).toBe(true);
    });

    it('draws the chain from a step followed, in place of the one before', async () => {
      const { light, plays } = drawingPicture();
      const onSelect = vi.fn();
      const { rerender } = render(panelFor(versePassage(GEN_3_15), onSelect, EVERY_LINK, light));
      await findPathTo('Rev 12:9');
      rerender(panelFor(versePassage(ROM_16_20), onSelect, EVERY_LINK, light));
      expect(plays[0]?.signal.aborted).toBe(true);
      expect(plays[1]?.steps.map((step) => step.verse)).toEqual([ROM_16_20, REV_12_9]);
    });
  });

  it('offers no replay where the view draws no path', async () => {
    render(panelFor(versePassage(GEN_3_15)));
    await findPathTo('Rev 12:9');
    expect(pathSection().queryByRole('button', { name: 'Play again' })).toBeNull();
    expect(litSteps()).toEqual([false, false, false]);
  });
});
