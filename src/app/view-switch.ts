import { flushSync } from 'react-dom';
import type { Passage } from '../core/bible/passage.ts';
import { locatePassage, type ScreenPoint } from '../visualizations/shared/passage-spot.ts';
import styles from './PassageBeacon.module.css';
import { beaconStart, planBeacon, type SwitchStyle } from './switch-plan.ts';
import './view-switch.css';

/**
 * How long a landed beacon stays before it is taken away, in ms: it lingers, then fades (both in
 * `PassageBeacon.module.css`).
 */
export const BEACON_LANDING_MS = 350;

/** One switch between views. */
export interface ViewSwitch {
  /** Shows the next view: a state change, run in `flushSync` so the page has it on return. */
  readonly update: () => void;
  readonly style: SwitchStyle;
  /** What holds the view being left, and the one being shown. */
  readonly from: Element | null;
  readonly to: Element | null;
  /** The passage the beacon carries, and its name as the beacon shows it; `null` for none. */
  readonly carried: { readonly passage: Passage; readonly label: string } | null;
}

/** Ends the switch under way at once, so a quick second one starts from a still page. */
let endCurrent: (() => void) | null = null;

/**
 * Changes the view the reader sees, and shows where the focused passage went.
 *
 * With the View Transitions API the page crossfades, and when a passage travels, a small beacon
 * named after it moves from where the last view draws it to where the next one does. Placed before
 * the switch, it is in the browser's picture of the page as it was; moved during the update, it is
 * in the picture as it is; and the browser carries it from one to the other. Then it lingers a
 * moment and fades. Without the API the next view fades in over the last one, which stays under it
 * until it has. Focus, and what is announced, are the update's own: nothing here touches them.
 */
export function runViewSwitch({ update, style, from, to, carried }: ViewSwitch): void {
  endCurrent?.();
  endCurrent = null;
  if (style.kind === 'fade') {
    fadeViews(update, style.fadeMs, from, to);
    return;
  }
  const travelling = style.beacon ? carried : null;
  const departure = travelling && from ? locatePassage(from, travelling.passage) : null;
  const start = beaconStart(departure);
  let beacon = travelling && start ? showBeacon(travelling.label, start) : null;
  let ended = false;
  const root = document.documentElement;
  root.dataset['viewSwitch'] = '';
  root.style.setProperty('--view-switch-fade', `${String(style.fadeMs)}ms`);
  const transition = document.startViewTransition(() => {
    flushSync(update);
    if (ended || !travelling) {
      return;
    }
    const path = planBeacon(departure, to && locatePassage(to, travelling.passage));
    if (path.kind === 'none') {
      // Nothing to point at: the beacon in the picture of the last view leaves no trace.
      beacon?.remove();
      beacon = null;
      root.dataset['viewSwitch'] = 'plain';
      return;
    }
    beacon ??= showBeacon(travelling.label, path.to);
    placeBeacon(beacon, path.to);
  });
  const end = () => {
    ended = true;
    transition.skipTransition();
    beacon?.remove();
    beacon = null;
  };
  endCurrent = end;
  // A switch cut short, or skipped because the page is hidden, still finishes: its update runs.
  transition.ready.catch(() => undefined);
  transition.updateCallbackDone.catch((error: unknown) => {
    reportError(error);
  });
  void transition.finished
    .catch(() => undefined)
    .then(() => {
      if (endCurrent === end) {
        endCurrent = null;
        delete root.dataset['viewSwitch'];
        root.style.removeProperty('--view-switch-fade');
      }
      if (beacon) {
        land(beacon);
      }
    });
}

/** Without view transitions: the next view fades in, over the last one until it has. */
function fadeViews(update: () => void, fadeMs: number, from: Element | null, to: Element | null) {
  from?.setAttribute('data-leaving', '');
  flushSync(update);
  to?.setAttribute('data-entering', '');
  if (to instanceof HTMLElement) {
    to.style.setProperty('--view-fade', `${String(fadeMs)}ms`);
  }
  const done = () => {
    window.clearTimeout(timer);
    from?.removeAttribute('data-leaving');
    to?.removeAttribute('data-entering');
  };
  const timer = window.setTimeout(done, fadeMs);
  endCurrent = done;
}

/** A beacon at `point`, named `label`: a glowing dot with the passage's name over it. */
function showBeacon(label: string, point: ScreenPoint): HTMLElement {
  const beacon = document.createElement('div');
  beacon.className = styles.beacon ?? '';
  // It only shows the way: what a screen reader hears of a switch is the view's own.
  beacon.setAttribute('aria-hidden', 'true');
  beacon.dataset['passageBeacon'] = '';
  const name = document.createElement('span');
  name.className = styles.label ?? '';
  name.textContent = label;
  const dot = document.createElement('span');
  dot.className = styles.dot ?? '';
  beacon.append(name, dot);
  placeBeacon(beacon, point);
  document.body.append(beacon);
  return beacon;
}

/** Room the name needs on either side of the dot to be centered over it, in px. */
const LABEL_ROOM_PX = 96;

function placeBeacon(beacon: HTMLElement, { x, y }: ScreenPoint): void {
  beacon.style.left = `${String(x)}px`;
  beacon.style.top = `${String(y)}px`;
  // Centered over the dot, unless that would run it off the side of the screen.
  beacon.dataset['align'] =
    x < LABEL_ROOM_PX ? 'start' : x > window.innerWidth - LABEL_ROOM_PX ? 'end' : 'center';
}

/** A landed beacon lingers a moment, fades, and is gone. */
function land(beacon: HTMLElement): void {
  beacon.dataset['landed'] = '';
  window.setTimeout(() => {
    beacon.remove();
  }, BEACON_LANDING_MS);
}
