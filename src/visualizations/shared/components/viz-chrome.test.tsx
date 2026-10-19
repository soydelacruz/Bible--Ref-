import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { GENRES } from '../../../core/bible/genres.ts';
import { SiteFooter } from '../../../shared/ui/SiteFooter.tsx';
import { getTranslationManifest } from '../../../translations/registry.ts';
import { createLinkFilter, DEFAULT_LINK_FILTER } from '../link-filter.ts';
import { Credits } from './Credits.tsx';
import { FiltersMenu } from './FiltersMenu.tsx';
import { GenreLegend } from './GenreLegend.tsx';
import { GenreMenu } from './GenreMenu.tsx';
import { GenreToggles, toggleGenre } from './GenreToggles.tsx';
import { LinkStats } from './LinkStats.tsx';
import { TranslationMenu } from './TranslationMenu.tsx';

const BSB = getTranslationManifest('bsb');

const SUMMARY = {
  verseCount: 31_102,
  shownLinks: 120_000,
  totalLinks: 344_799,
  connectedVerses: 20_000,
  crossTestamentLinks: 30_000,
};

/** Opens a popover menu by its button. */
async function openMenu(name: RegExp) {
  await userEvent.click(screen.getByRole('button', { name }));
}

describe('FiltersMenu', () => {
  function renderMenu(filter = DEFAULT_LINK_FILTER) {
    const onChange = vi.fn();
    render(
      <FiltersMenu
        filter={filter}
        defaults={DEFAULT_LINK_FILTER}
        onChange={onChange}
        shownLinks={120_000}
        totalLinks={344_799}
      />,
    );
    return onChange;
  }

  it('offers every vote threshold once opened', async () => {
    renderMenu();
    await openMenu(/Filters/);
    expect(screen.getByRole('option', { name: 'All' })).toBeDefined();
    expect(screen.getByRole('option', { name: '≥ 100' })).toBeDefined();
  });

  it('reports the threshold a reader picks', async () => {
    const onChange = renderMenu();
    await openMenu(/Filters/);
    await userEvent.selectOptions(screen.getByRole('combobox'), '20');
    expect(onChange).toHaveBeenCalledWith(expect.objectContaining({ minVotes: 20 }));
  });

  it('says how many links are shown out of the whole dataset', async () => {
    renderMenu();
    await openMenu(/Filters/);
    expect(screen.getByText(/Showing 120,000 of 344,799 links/)).toBeDefined();
  });

  it('counts the hidden genres in the same line', async () => {
    renderMenu({ minVotes: 4, hiddenGenres: new Set(['law', 'gospels']) });
    await openMenu(/Filters/);
    expect(screen.getByText(/2 genres hidden/)).toBeDefined();
  });

  it('cannot be reset while nothing has been changed', async () => {
    renderMenu();
    await openMenu(/Filters/);
    expect(screen.getByRole('button', { name: /Reset filters/ })).toHaveProperty('disabled', true);
  });

  it('puts the filters back to their defaults', async () => {
    const onChange = renderMenu(createLinkFilter(50));
    await openMenu(/Filters/);
    await userEvent.click(screen.getByRole('button', { name: /Reset filters/ }));
    expect(onChange).toHaveBeenCalledWith(DEFAULT_LINK_FILTER);
  });
});

describe('TranslationMenu', () => {
  it('names the translation being read', () => {
    render(
      <TranslationMenu current={BSB} onChange={vi.fn()} localeId="en" onLocaleChange={vi.fn()} />,
    );
    expect(screen.getByRole('button', { name: /Translation/ }).textContent).toContain('BSB');
  });

  it('switches to another translation', async () => {
    const onChange = vi.fn();
    render(
      <TranslationMenu current={BSB} onChange={onChange} localeId="en" onLocaleChange={vi.fn()} />,
    );
    await openMenu(/Translation/);
    await userEvent.click(screen.getByRole('radio', { name: /King James/ }));
    expect(onChange).toHaveBeenCalledWith('kjv');
  });

  it('marks the one in use', async () => {
    render(
      <TranslationMenu current={BSB} onChange={vi.fn()} localeId="en" onLocaleChange={vi.fn()} />,
    );
    await openMenu(/Translation/);
    expect(screen.getByRole('radio', { name: /Berean/ })).toHaveProperty('checked', true);
  });

  it('marks itself busy while a translation is still downloading', () => {
    render(
      <TranslationMenu
        current={BSB}
        onChange={vi.fn()}
        pending
        localeId="en"
        onLocaleChange={vi.fn()}
      />,
    );
    expect(screen.getByRole('button', { name: /Translation/ }).getAttribute('aria-busy')).toBe(
      'true',
    );
  });

  it('shows why a translation could not be loaded', async () => {
    render(
      <TranslationMenu
        current={BSB}
        onChange={vi.fn()}
        error="Network error"
        localeId="en"
        onLocaleChange={vi.fn()}
      />,
    );
    await openMenu(/Translation/);
    expect(screen.getByText(/Network error/)).toBeDefined();
  });
});

describe('GenreToggles', () => {
  it('lists every genre of both testaments', () => {
    render(<GenreToggles hiddenGenres={new Set()} onToggle={vi.fn()} />);
    expect(screen.getAllByRole('button')).toHaveLength(GENRES.length);
    expect(screen.getByText('Old Testament')).toBeDefined();
    expect(screen.getByText('New Testament')).toBeDefined();
  });

  it('hides a genre when its key is used', async () => {
    const onToggle = vi.fn();
    render(<GenreToggles hiddenGenres={new Set()} onToggle={onToggle} />);
    const [first] = GENRES;
    if (!first) {
      throw new Error('Expected a genre.');
    }
    await userEvent.click(screen.getByRole('button', { name: first.name }));
    expect(onToggle).toHaveBeenCalledWith(first.id);
  });

  it('shows which genres are currently hidden, and offers to show them again', () => {
    const [hidden] = GENRES;
    if (!hidden) {
      throw new Error('Expected at least one genre.');
    }
    render(<GenreToggles hiddenGenres={new Set([hidden.id])} onToggle={vi.fn()} />);
    const toggle = screen.getByRole('button', { name: hidden.name });
    expect(toggle.getAttribute('aria-pressed')).toBe('false');
    expect(toggle.getAttribute('title')).toBe(`Show ${hidden.name}`);
  });
});

describe('GenreLegend and GenreMenu', () => {
  it('shows the legend as a strip of genres, with its own collapse button', () => {
    render(<GenreLegend hiddenGenres={new Set()} onToggle={vi.fn()} />);
    expect(screen.getAllByRole('button').length).toBe(GENRES.length + 1);
  });

  it('folds the legend away on a phone, and brings it back', async () => {
    render(<GenreLegend hiddenGenres={new Set()} onToggle={vi.fn()} />);
    await userEvent.click(screen.getByRole('button', { name: 'Show genres' }));
    expect(screen.getByRole('button', { name: 'Hide genres' })).toBeDefined();
    expect(screen.getByLabelText('Genres').getAttribute('data-open')).toBe('true');
  });

  it('puts the same genres behind a button on a narrow screen', async () => {
    render(<GenreMenu hiddenGenres={new Set()} onToggle={vi.fn()} />);
    await openMenu(/Genres/);
    // The genres, plus the button that opened them.
    expect(screen.getAllByRole('button').length).toBe(GENRES.length + 1);
  });
});

describe('LinkStats', () => {
  it('summarises what is on screen', () => {
    render(<LinkStats summary={SUMMARY} />);
    const stats = screen.getByLabelText('Summary');
    expect(stats.textContent).toContain('31,102');
    expect(stats.textContent).toContain('120,000');
    expect(stats.textContent).toContain('of 344,799');
  });

  it('leaves out the total when nothing is filtered', () => {
    render(<LinkStats summary={{ ...SUMMARY, shownLinks: SUMMARY.totalLinks }} />);
    expect(screen.getByLabelText('Summary').textContent).not.toContain('of 344,799');
  });

  it('offers a hint for a mouse and one for a touch screen', () => {
    render(
      <LinkStats summary={SUMMARY} hint={{ pointer: 'Hover a verse', touch: 'Tap a verse' }} />,
    );
    expect(screen.getByText('Hover a verse')).toBeDefined();
    expect(screen.getByText('Tap a verse')).toBeDefined();
  });
});

describe('Credits', () => {
  it('names the source of the links, the licence and that they were changed', () => {
    render(<Credits translation={BSB} />);
    expect(screen.getByRole('link', { name: 'OpenBible.info' })).toBeDefined();
    expect(screen.getByRole('link', { name: 'CC BY 4.0' })).toBeDefined();
    expect(screen.getByText(/re-indexed/)).toBeDefined();
  });

  it('credits the translation being read', () => {
    render(<Credits translation={BSB} />);
    expect(screen.getByText(new RegExp(BSB.abbreviation))).toBeDefined();
  });

  it('credits the work that inspired the view, when there is one', () => {
    render(
      <Credits
        translation={BSB}
        inspiration={{
          title: 'Bible Cross-References',
          author: 'C. Harrison',
          url: 'https://x.test/',
        }}
      />,
    );
    const link = screen.getByRole('link', { name: 'C. Harrison' });
    // The work's name is this app's name too, so only the tooltip carries it.
    expect(link.getAttribute('title')).toBe('Bible Cross-References, by C. Harrison');
  });
});

describe('SiteFooter', () => {
  it('points at the author’s site and the source code', () => {
    render(<SiteFooter />);
    expect(screen.getByRole('link', { name: 'SoyDeLaCruz.dev' }).getAttribute('href')).toBe(
      '/soydelacruz/',
    );
    expect(screen.getByRole('link', { name: /Source code on GitHub/ }).getAttribute('href')).toBe(
      'https://github.com/soydelacruz/Bible--Ref-',
    );
  });

  it('carries the year, so the notice does not go stale', () => {
    render(<SiteFooter />);
    expect(screen.getByRole('contentinfo').textContent).toContain(String(new Date().getFullYear()));
  });

  it('offers the install guide', () => {
    render(<SiteFooter />);
    expect(screen.getByRole('button', { name: /Install/ })).toBeDefined();
  });

  it('shows the credits a page gives it', () => {
    render(
      <SiteFooter>
        <span>Links: somewhere</span>
      </SiteFooter>,
    );
    expect(within(screen.getByRole('contentinfo')).getByText('Links: somewhere')).toBeDefined();
  });
});

describe('toggleGenre', () => {
  it('hides a genre that was showing', () => {
    expect([...toggleGenre(new Set(), 'law')]).toEqual(['law']);
  });

  it('shows a genre that was hidden', () => {
    expect([...toggleGenre(new Set(['law']), 'law')]).toEqual([]);
  });

  it('leaves the set it was given alone', () => {
    const hidden = new Set(['law'] as const);
    toggleGenre(hidden, 'gospels');
    expect([...hidden]).toEqual(['law']);
  });
});
