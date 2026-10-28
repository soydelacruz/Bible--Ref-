import { useCallback, useEffect, useRef } from 'react';
import { prefersReducedMotion } from '../visualizations/shared/frames.ts';
import { chooseSwitch } from './switch-plan.ts';
import { runViewSwitch, type ViewSwitch } from './view-switch.ts';

/** Keys that only modify others: pressing one alone doesn't make the keyboard the input. */
const MODIFIER_KEYS: ReadonlySet<string> = new Set(['Shift', 'Control', 'Alt', 'Meta']);

/** A switch between views, before it is known how it will look. */
export type SwitchRequest = Omit<ViewSwitch, 'style'>;

/**
 * Switches between views (see `runViewSwitch`), choosing how from what the reader did last — a key
 * switches near-instantly — from their wish for less motion, and from what the browser can do.
 */
export function useViewSwitch(): (request: SwitchRequest) => void {
  // The latest input was a key: what it changes shows at once, as the arcs do with theirs.
  const keyboardRef = useRef(false);
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (!MODIFIER_KEYS.has(event.key)) {
        keyboardRef.current = true;
      }
    };
    const onPointer = () => {
      keyboardRef.current = false;
    };
    window.addEventListener('keydown', onKey, { capture: true });
    window.addEventListener('pointerdown', onPointer, { capture: true });
    return () => {
      window.removeEventListener('keydown', onKey, { capture: true });
      window.removeEventListener('pointerdown', onPointer, { capture: true });
    };
  }, []);
  return useCallback((request: SwitchRequest) => {
    const style = chooseSwitch({
      canTransition: 'startViewTransition' in document,
      reducedMotion: prefersReducedMotion(),
      keyboard: keyboardRef.current,
      carriesPassage: request.carried !== null,
    });
    runViewSwitch({ ...request, style });
  }, []);
}
