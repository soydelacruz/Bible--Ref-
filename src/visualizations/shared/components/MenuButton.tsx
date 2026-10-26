import {
  useEffect,
  useEffectEvent,
  useId,
  useLayoutEffect,
  useRef,
  useState,
  type ReactNode,
} from 'react';
import { ExpandIcon, type IconComponent } from '../../../shared/ui/icons.tsx';
import styles from './controls.module.css';

interface MenuButtonProps {
  /** What the menu is called, e.g. "Filters". Always its accessible name. */
  readonly label: string;
  /** Shown next to the label, and alone on phones. Omit for a menu that shows its value. */
  readonly icon?: IconComponent;
  /**
   * The setting's current value, e.g. "KJV". A menu with one shows it in place of its name, at
   * every width: the value is what the reader needs to see, and it is shorter than the name.
   */
  readonly value?: string;
  /** Shows a small dot on the button, e.g. when the menu's settings differ from the defaults. */
  readonly indicator?: boolean;
  /**
   * The accessible name to use while `indicator` is set, e.g. "Filters (changed)". Supplied by
   * the menu rather than composed here, because an adjective agrees with the noun it follows:
   * Portuguese needs "Filtros (alterados)" but "Tradução (alterada)", and only the caller
   * knows which noun it passed.
   */
  readonly changedLabel?: string;
  /** Marks the button busy while the choice is being applied (e.g. a text still downloading). */
  readonly busy?: boolean;
  /**
   * Whether the popover is open, for a menu that something else on the page can open too (the
   * Filters link in the summary line). Left out, the menu keeps track of it by itself.
   */
  readonly open?: boolean | undefined;
  readonly onOpenChange?: ((open: boolean) => void) | undefined;
  /** The popover's content. */
  readonly children: ReactNode;
}

/** Space kept between an open popover and the edges of the viewport (matches `.popover`). */
const VIEWPORT_MARGIN_PX = 12;

/**
 * The popover hangs from the button's end edge, which can push it past the viewport on narrow
 * screens; this slides it back just enough to fit.
 */
function keepInViewport(popover: HTMLElement): void {
  popover.style.translate = '';
  const { left, right } = popover.getBoundingClientRect();
  const maxRight = document.documentElement.clientWidth - VIEWPORT_MARGIN_PX;
  const shift =
    left < VIEWPORT_MARGIN_PX ? VIEWPORT_MARGIN_PX - left : Math.min(maxRight - right, 0);
  popover.style.translate = shift === 0 ? '' : `${shift}px 0`;
}

/** A header button that opens a small popover; closes on outside click or Escape. */
export function MenuButton({
  label,
  icon: Icon,
  value,
  indicator = false,
  changedLabel,
  busy = false,
  open: openProp,
  onOpenChange,
  children,
}: MenuButtonProps) {
  const [ownOpen, setOwnOpen] = useState(false);
  const open = openProp ?? ownOpen;
  const setOpen = onOpenChange ?? setOwnOpen;
  const close = useEffectEvent(() => {
    setOpen(false);
  });
  const name = value === undefined ? label : `${label}: ${value}`;
  const menuRef = useRef<HTMLDivElement>(null);
  const buttonRef = useRef<HTMLButtonElement>(null);
  const popoverRef = useRef<HTMLDivElement>(null);
  const popoverId = useId();

  useEffect(() => {
    if (!open) {
      return undefined;
    }
    const closeOnOutside = (event: PointerEvent) => {
      if (event.target instanceof Node && !menuRef.current?.contains(event.target)) {
        close();
      }
    };
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        close();
        // Escape is a keyboard gesture, so focus goes back to the button it came from rather
        // than to the top of the page.
        buttonRef.current?.focus();
      }
    };
    document.addEventListener('pointerdown', closeOnOutside);
    document.addEventListener('keydown', closeOnEscape);
    return () => {
      document.removeEventListener('pointerdown', closeOnOutside);
      document.removeEventListener('keydown', closeOnEscape);
    };
  }, [open]);

  // Before paint, so the popover never flashes at its clipped position.
  useLayoutEffect(() => {
    const popover = popoverRef.current;
    if (!open || !popover) {
      return undefined;
    }
    const place = () => {
      keepInViewport(popover);
    };
    place();
    window.addEventListener('resize', place);
    return () => {
      window.removeEventListener('resize', place);
    };
  }, [open]);

  return (
    <div ref={menuRef} className={styles.menu}>
      <button
        ref={buttonRef}
        type="button"
        className={`${styles.button} ${styles.menuButton}`}
        // Named explicitly: on phones the label is hidden and only the icon shows, and a menu
        // showing its value says both ("Translation: KJV").
        aria-label={indicator && changedLabel !== undefined ? changedLabel : name}
        aria-expanded={open}
        aria-controls={popoverId}
        aria-busy={busy || undefined}
        onClick={() => {
          setOpen(!open);
        }}
      >
        {Icon && <Icon />}
        {value === undefined ? (
          <span className={styles.menuLabel}>{label}</span>
        ) : (
          <>
            <span className={styles.menuValue}>{value}</span>
            <ExpandIcon className={styles.menuChevron} />
          </>
        )}
        {indicator && <span className={styles.indicator} />}
      </button>
      {open && (
        <div ref={popoverRef} id={popoverId} className={styles.popover}>
          {children}
        </div>
      )}
    </div>
  );
}
