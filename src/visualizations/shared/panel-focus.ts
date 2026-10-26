/**
 * Where keyboard focus goes as the details panel changes passage.
 *
 * Following a link replaces the panel's contents, and with them the button that had focus: left
 * alone, focus falls to the page itself, and a keyboard or screen-reader reader is sent back to
 * the top of the page. The panel's title is where it lands instead (see `PassagePanel`). Search
 * lives outside the panel, so it asks for the same thing here, before the panel it is asking of
 * has necessarily opened.
 */

/** Marks the panel's title, the element focus is moved to. */
export const PANEL_TITLE_ATTRIBUTE = 'data-panel-title';

/**
 * How long a request waits for its passage to be shown. The passage is usually there within a
 * frame; past this, the reader asked for the passage already open, and nothing will change.
 */
export const FOCUS_REQUEST_MS = 1000;

interface FocusRequest {
  /** Where focus goes back to when the panel closes, e.g. the search box. */
  readonly returnTo: HTMLElement | null;
}

let pending: FocusRequest | null = null;

/** The title of the panel on screen: the other views stay mounted, but inert. */
function visibleTitle(): HTMLElement | undefined {
  return [...document.querySelectorAll<HTMLElement>(`[${PANEL_TITLE_ATTRIBUTE}]`)].find(
    (title) => title.closest('[inert]') === null,
  );
}

/**
 * Asks the panel to take focus once it shows the passage about to be chosen. Focus leaves `from`
 * at once, which also closes a phone's on-screen keyboard.
 */
export function focusPassageTitle(from: Element | null): void {
  const returnTo = from instanceof HTMLElement ? from : null;
  const request: FocusRequest = { returnTo };
  pending = request;
  returnTo?.blur();
  setTimeout(() => {
    if (pending !== request) {
      return;
    }
    pending = null;
    // The passage asked for was the one already open: its title is still the place to be, as
    // long as the reader has not gone somewhere else in the meantime.
    if (document.activeElement === null || document.activeElement === document.body) {
      visibleTitle()?.focus({ preventScroll: true });
    }
  }, FOCUS_REQUEST_MS);
}

/** The request waiting for the panel, if there is one; it stays until `settleFocusRequest`. */
export function pendingFocusRequest(): FocusRequest | null {
  return pending;
}

/** The panel has taken focus: the request is answered. */
export function settleFocusRequest(): void {
  pending = null;
}

/** What can take focus in the visualization, when there is nothing else to go back to. */
const FOCUSABLE = '[tabindex="0"], button:not(:disabled), a[href], input:not(:disabled)';

/**
 * As the panel closes, focus goes back to whatever opened it, e.g. the arcs, a row of threads or
 * the search box. When that is gone, or there was none (the passage came from the address), it
 * goes to the visualization beside the panel, rather than to the top of the page.
 */
export function returnFocus(opener: HTMLElement | null, panel: HTMLElement | null): void {
  if (opener?.isConnected) {
    opener.focus();
    if (document.activeElement === opener) {
      return;
    }
  }
  const page = panel?.closest('aside')?.parentElement;
  page?.querySelector('main')?.querySelector<HTMLElement>(FOCUSABLE)?.focus();
}
