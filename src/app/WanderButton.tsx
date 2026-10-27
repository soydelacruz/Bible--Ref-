import { use } from 'react';
import { useLocalization } from '../i18n/use-locale.tsx';
import { WanderIcon } from '../shared/ui/icons.tsx';
import controls from '../visualizations/shared/components/controls.module.css';
import { MenuRows } from '../visualizations/shared/components/MenuButton.tsx';
import styles from './WanderButton.module.css';

/** The compass's one turn: under 300ms, like the rest of the interface's motion. */
const FLOURISH_MS = 280;
/** The interface's ease-out (`cubic-bezier(0.16, 1, 0.3, 1)` in the CSS). */
const EASE_OUT = 'cubic-bezier(0.16, 1, 0.3, 1)';

interface WanderButtonProps {
  /** Turns the compass once as it is pressed: the first time only, so it greets rather than nags. */
  readonly flourish: boolean;
  readonly onWander: () => void;
}

/**
 * Wander, in the header: a press goes to a richly linked verse the reader may not know (see
 * `wander.ts`). A button of the header's row, or on phones a row of the More menu, like the menus
 * beside it.
 */
export function WanderButton({ flourish, onWander }: WanderButtonProps) {
  const { t } = useLocalization();
  const isRow = use(MenuRows);
  const label = t('wander.label');
  return (
    <button
      type="button"
      className={`${controls.button} ${styles.wander}`}
      // Named explicitly: where the header is tight the label gives way to the icon.
      aria-label={label}
      title={isRow ? undefined : t('wander.hint')}
      onClick={(event) => {
        if (flourish) {
          turnCompass(event.currentTarget);
        }
        onWander();
      }}
    >
      <WanderIcon />
      <span className={isRow ? controls.rowLabel : styles.label}>{label}</span>
    </button>
  );
}

/**
 * The flourish: one turn of the compass, settling as it comes round. Where motion is reduced, the
 * compass dims and returns instead, in place. Played from here rather than by a CSS rule, which
 * would play it again every time the button is drawn anew — in another view, or in More.
 */
function turnCompass(button: HTMLButtonElement): void {
  const icon = button.querySelector('svg');
  if (!icon || typeof icon.animate !== 'function') {
    return;
  }
  const still = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  icon.animate(
    still
      ? [{ opacity: 1 }, { opacity: 0.35 }, { opacity: 1 }]
      : [{ transform: 'rotate(0turn)' }, { transform: 'rotate(1turn)' }],
    { duration: FLOURISH_MS, easing: still ? 'ease-in-out' : EASE_OUT },
  );
}
