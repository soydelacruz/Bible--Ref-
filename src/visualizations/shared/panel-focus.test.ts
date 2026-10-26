import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  FOCUS_REQUEST_MS,
  focusPassageTitle,
  PANEL_TITLE_ATTRIBUTE,
  pendingFocusRequest,
  returnFocus,
  settleFocusRequest,
} from './panel-focus.ts';

/** An element the test cannot go on without. */
function present<Found>(element: Found | null): Found {
  if (element === null) {
    throw new Error('The page is missing an element the test needs.');
  }
  return element;
}

/** A view's page as the app lays it out: the visualization, and the panel beside it. */
function page(): { input: HTMLInputElement; title: HTMLHeadingElement; panel: HTMLElement } {
  document.body.innerHTML = `
    <div>
      <header><input aria-label="Search" /></header>
      <main><span>Drawing</span><button type="button">Stage</button></main>
      <aside><div id="panel"><h2 tabindex="-1" ${PANEL_TITLE_ATTRIBUTE}>John 3:16</h2></div></aside>
    </div>`;
  return {
    input: present(document.querySelector('input')),
    title: present(document.querySelector('h2')),
    panel: present(document.querySelector<HTMLElement>('#panel')),
  };
}

beforeEach(() => {
  vi.useFakeTimers();
});

afterEach(() => {
  settleFocusRequest();
  vi.useRealTimers();
  document.body.innerHTML = '';
});

describe('focusPassageTitle', () => {
  it('leaves the search box at once, and waits for the panel', () => {
    const { input } = page();
    input.focus();
    focusPassageTitle(input);
    expect(document.activeElement).toBe(document.body);
    expect(pendingFocusRequest()?.returnTo).toBe(input);
  });

  it('is answered by the panel taking focus', () => {
    const { input, title } = page();
    focusPassageTitle(input);
    title.focus();
    settleFocusRequest();
    vi.advanceTimersByTime(FOCUS_REQUEST_MS);
    expect(pendingFocusRequest()).toBeNull();
    expect(document.activeElement).toBe(title);
  });

  it('focuses the title already there when the passage asked for was already open', () => {
    const { input, title } = page();
    input.focus();
    focusPassageTitle(input);
    vi.advanceTimersByTime(FOCUS_REQUEST_MS);
    expect(document.activeElement).toBe(title);
    expect(pendingFocusRequest()).toBeNull();
  });

  it('skips the title of a view that is not on screen', () => {
    const { input } = page();
    document.querySelector('div')?.setAttribute('inert', '');
    focusPassageTitle(input);
    vi.advanceTimersByTime(FOCUS_REQUEST_MS);
    expect(document.activeElement).toBe(document.body);
  });

  it('does not take focus back from wherever the reader has gone since', () => {
    const { input } = page();
    focusPassageTitle(input);
    const stage = present(document.querySelector('button'));
    stage.focus();
    vi.advanceTimersByTime(FOCUS_REQUEST_MS);
    expect(document.activeElement).toBe(stage);
  });

  it('leaves an earlier request to the newer one', () => {
    const { input, title } = page();
    focusPassageTitle(input);
    focusPassageTitle(null);
    expect(pendingFocusRequest()?.returnTo).toBeNull();
    vi.advanceTimersByTime(FOCUS_REQUEST_MS);
    expect(document.activeElement).toBe(title);
  });
});

describe('returnFocus', () => {
  it('goes back to what opened the panel', () => {
    const { input, panel } = page();
    returnFocus(input, panel);
    expect(document.activeElement).toBe(input);
  });

  it('goes to the visualization when that is gone, or there was none', () => {
    const { input, panel } = page();
    input.remove();
    returnFocus(input, panel);
    expect(document.activeElement?.textContent).toBe('Stage');
    (document.activeElement as HTMLElement).blur();
    returnFocus(null, panel);
    expect(document.activeElement?.textContent).toBe('Stage');
  });

  it('goes to the visualization when what opened the panel cannot take focus', () => {
    const { input, panel } = page();
    input.closest('header')?.setAttribute('inert', '');
    returnFocus(input, panel);
    expect(document.activeElement?.textContent).toBe('Stage');
  });

  it('does nothing outside a page with a visualization', () => {
    returnFocus(null, null);
    expect(document.activeElement).toBe(document.body);
  });
});
