import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { FiltersIcon } from '../../../shared/ui/icons.tsx';
import { MenuButton, MenuRows } from './MenuButton.tsx';

function renderMenu(props: Partial<Parameters<typeof MenuButton>[0]> = {}) {
  return render(
    <MenuButton label="Filters" icon={FiltersIcon} {...props}>
      <p>menu contents</p>
    </MenuButton>,
  );
}

describe('MenuButton', () => {
  it('starts closed', () => {
    renderMenu();
    expect(screen.queryByText('menu contents')).toBeNull();
    expect(screen.getByRole('button').getAttribute('aria-expanded')).toBe('false');
  });

  it('opens and closes on its own button', async () => {
    renderMenu();
    const button = screen.getByRole('button');
    await userEvent.click(button);
    expect(screen.getByText('menu contents')).toBeDefined();
    await userEvent.click(button);
    expect(screen.queryByText('menu contents')).toBeNull();
  });

  it('closes when something outside it is used', async () => {
    render(
      <div>
        <MenuButton label="Filters">
          <p>menu contents</p>
        </MenuButton>
        <button type="button">elsewhere</button>
      </div>,
    );
    await userEvent.click(screen.getByRole('button', { name: 'Filters' }));
    expect(screen.getByText('menu contents')).toBeDefined();
    await userEvent.click(screen.getByRole('button', { name: 'elsewhere' }));
    expect(screen.queryByText('menu contents')).toBeNull();
  });

  it('stays open while the menu itself is used', async () => {
    renderMenu();
    await userEvent.click(screen.getByRole('button', { name: 'Filters' }));
    await userEvent.click(screen.getByText('menu contents'));
    expect(screen.getByText('menu contents')).toBeDefined();
  });

  it('can be opened and closed from elsewhere, and reports its own button', async () => {
    const onOpenChange = vi.fn();
    const { rerender } = render(
      <MenuButton label="Filters" open onOpenChange={onOpenChange}>
        <p>menu contents</p>
      </MenuButton>,
    );
    expect(screen.getByText('menu contents')).toBeDefined();
    await userEvent.click(screen.getByRole('button', { name: 'Filters' }));
    expect(onOpenChange).toHaveBeenLastCalledWith(false);
    await userEvent.keyboard('{Escape}');
    expect(onOpenChange).toHaveBeenLastCalledWith(false);
    rerender(
      <MenuButton label="Filters" open={false} onOpenChange={onOpenChange}>
        <p>menu contents</p>
      </MenuButton>,
    );
    expect(screen.queryByText('menu contents')).toBeNull();
    await userEvent.click(screen.getByRole('button', { name: 'Filters' }));
    expect(onOpenChange).toHaveBeenLastCalledWith(true);
  });

  it('closes on Escape', async () => {
    renderMenu();
    await userEvent.click(screen.getByRole('button'));
    await userEvent.keyboard('{Escape}');
    expect(screen.queryByText('menu contents')).toBeNull();
  });

  it('ignores keys that are not Escape', async () => {
    renderMenu();
    await userEvent.click(screen.getByRole('button'));
    // Enter and Space would activate the focused button, which is the browser's own doing.
    await userEvent.keyboard('{ArrowDown}x');
    expect(screen.getByText('menu contents')).toBeDefined();
  });

  it('wears its value in place of its name, so the setting is readable at a glance', () => {
    renderMenu({ value: 'KJV' });
    const button = screen.getByRole('button');
    expect(button.textContent).toContain('KJV');
    expect(button.getAttribute('aria-label')).toBe('Filters: KJV');
  });

  it('is named for itself when it shows no value', () => {
    renderMenu();
    expect(screen.getByRole('button').getAttribute('aria-label')).toBe('Filters');
  });

  it('says when its settings differ from the defaults', () => {
    renderMenu({ indicator: true, changedLabel: 'Filters (changed)' });
    expect(screen.getByRole('button').getAttribute('aria-label')).toBe('Filters (changed)');
  });

  it('keeps its plain name when it is marked changed but given no changed name', () => {
    renderMenu({ indicator: true });
    expect(screen.getByRole('button').getAttribute('aria-label')).toBe('Filters');
  });

  it('says when the choice is still being applied', () => {
    renderMenu({ value: 'KJV', busy: true });
    expect(screen.getByRole('button').getAttribute('aria-busy')).toBe('true');
  });

  it('is not busy by default', () => {
    renderMenu();
    expect(screen.getByRole('button').getAttribute('aria-busy')).toBeNull();
  });

  it('points at the popover it controls', async () => {
    renderMenu();
    const button = screen.getByRole('button');
    await userEvent.click(button);
    const id = button.getAttribute('aria-controls');
    expect(document.getElementById(id ?? '')?.textContent).toBe('menu contents');
  });

  it('names its icon in a tooltip, for a pointer where the header shows the icon alone', () => {
    renderMenu({ indicator: true, changedLabel: 'Filters (changed)' });
    expect(screen.getByRole('button').getAttribute('title')).toBe('Filters (changed)');
  });

  it('moves focus to its first control when asked, for a menu that is a list of controls', async () => {
    render(
      <MenuButton label="More" focusOnOpen>
        <button type="button">Saved</button>
      </MenuButton>,
    );
    await userEvent.click(screen.getByRole('button', { name: 'More' }));
    expect(document.activeElement).toBe(screen.getByRole('button', { name: 'Saved' }));
  });

  it('leaves focus on its button otherwise', async () => {
    render(
      <MenuButton label="Filters">
        <button type="button">Reset</button>
      </MenuButton>,
    );
    await userEvent.click(screen.getByRole('button', { name: 'Filters' }));
    expect(document.activeElement).toBe(screen.getByRole('button', { name: 'Filters' }));
  });

  it('closes after one of its actions when asked, as a menu of actions does', async () => {
    const onAction = vi.fn();
    render(
      <MenuButton label="More" closeOnAction>
        <button type="button" onClick={onAction}>
          Save as image
        </button>
        <p>a note</p>
      </MenuButton>,
    );
    await userEvent.click(screen.getByRole('button', { name: 'More' }));
    // Text is not an action.
    await userEvent.click(screen.getByText('a note'));
    expect(screen.getByText('a note')).toBeDefined();
    await userEvent.click(screen.getByRole('button', { name: 'Save as image' }));
    expect(onAction).toHaveBeenCalled();
    expect(screen.queryByText('a note')).toBeNull();
  });

  it('stays open while a menu inside it is opened and used', async () => {
    render(
      <MenuButton label="More" closeOnAction>
        <MenuRows value>
          <MenuButton label="Genres">
            <button type="button">Law</button>
          </MenuButton>
        </MenuRows>
      </MenuButton>,
    );
    await userEvent.click(screen.getByRole('button', { name: 'More' }));
    await userEvent.click(screen.getByRole('button', { name: 'Genres' }));
    // A choice inside the inner menu belongs to that menu, which stays open too.
    await userEvent.click(screen.getByRole('button', { name: 'Law' }));
    expect(screen.getByRole('button', { name: 'Law' })).toBeDefined();
  });

  it('spells out a menu that is a row of another, with its value, and unfolds it in place', async () => {
    render(
      <MenuRows value>
        <MenuButton label="Translation" value="KJV">
          <p>the translations</p>
        </MenuButton>
      </MenuRows>,
    );
    const row = screen.getByRole('button', { name: 'Translation: KJV' });
    expect(row.textContent).toContain('Translation');
    expect(row.textContent).toContain('KJV');
    // Spelled out already, so no tooltip.
    expect(row.getAttribute('title')).toBeNull();
    await userEvent.click(row);
    expect(screen.getByText('the translations')).toBeDefined();
  });

  it('closes one menu per Escape, the innermost first', async () => {
    render(
      <MenuButton label="More">
        <MenuRows value>
          <MenuButton label="Genres">
            <p>genre list</p>
          </MenuButton>
        </MenuRows>
      </MenuButton>,
    );
    const more = screen.getByRole('button', { name: 'More' });
    await userEvent.click(more);
    const genres = screen.getByRole('button', { name: 'Genres' });
    await userEvent.click(genres);
    await userEvent.keyboard('{Escape}');
    expect(screen.queryByText('genre list')).toBeNull();
    expect(genres.getAttribute('aria-expanded')).toBe('false');
    expect(document.activeElement).toBe(genres);
    await userEvent.keyboard('{Escape}');
    expect(more.getAttribute('aria-expanded')).toBe('false');
    expect(document.activeElement).toBe(more);
  });

  it('stops listening once it is gone', async () => {
    const { unmount } = renderMenu();
    await userEvent.click(screen.getByRole('button'));
    unmount();
    // No listener should survive to act on this.
    await userEvent.keyboard('{Escape}');
    expect(document.body.textContent).toBe('');
  });
});
