import {
  createContext,
  use,
  useEffect,
  useEffectEvent,
  useId,
  useLayoutEffect,
  useRef,
  useState,
  type MouseEvent,
  type ReactNode,
} from 'react';
import { ExpandIcon, type IconComponent } from '../../../shared/ui/icons.tsx';
import styles from './controls.module.css';

/**
 * Whether the menus inside are rows of another menu (the phone header's More) rather than
 * buttons of the header: a row spells out its name, and opens its content in place below itself,
 * so a menu in a menu is a list that unfolds rather than a popover stacked on a popover.
 */
export const MenuRows = createContext(false);

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
  /**
   * Moves keyboard focus to the first control inside once open, for a menu that is a list of
   * controls (More) rather than a setting to glance at.
   */
  readonly focusOnOpen?: boolean;
  /**
   * Closes once one of its own buttons has done its job (e.g. "Save as image"), as a menu of
   * actions does. A menu inside it is left alone: opening one is not an action.
   */
  readonly closeOnAction?: boolean;
  /** The popover's content. */
  readonly children: ReactNode;
}

/** Space kept between an open popover and the edges of the viewport (matches `.popover`). */
const VIEWPORT_MARGIN_PX = 12;

/** Marks a popover, so an action can tell which menu it belongs to. */
const POPOVER = 'data-popover';

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
  focusOnOpen = false,
  closeOnAction = false,
  children,
}: MenuButtonProps) {
  const isRow = use(MenuRows);
  const [ownOpen, setOwnOpen] = useState(false);
  const open = openProp ?? ownOpen;
  const setOpen = onOpenChange ?? setOwnOpen;
  const close = useEffectEvent(() => {
    setOpen(false);
  });
  const name = value === undefined ? label : `${label}: ${value}`;
  const accessibleName = indicator && changedLabel !== undefined ? changedLabel : name;
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
      // A menu open inside this one takes the Escape for itself: one press closes one menu.
      if (event.key !== 'Escape' || popoverRef.current?.querySelector('[aria-expanded="true"]')) {
        return;
      }
      close();
      // Escape is a keyboard gesture, so focus goes back to the button it came from rather than
      // to the top of the page.
      buttonRef.current?.focus();
    };
    document.addEventListener('pointerdown', closeOnOutside);
    document.addEventListener('keydown', closeOnEscape);
    return () => {
      document.removeEventListener('pointerdown', closeOnOutside);
      document.removeEventListener('keydown', closeOnEscape);
    };
  }, [open]);

  useEffect(() => {
    if (open && focusOnOpen) {
      popoverRef.current?.querySelector<HTMLElement>('button, input, select, a[href]')?.focus();
    }
  }, [open, focusOnOpen]);

  // Before paint, so the popover never flashes at its clipped position. A row's content unfolds
  // in the flow, inside a popover that is already placed.
  useLayoutEffect(() => {
    const popover = popoverRef.current;
    if (!open || !popover || isRow) {
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
  }, [open, isRow]);

  const closeAfterAction = (event: MouseEvent<HTMLDivElement>) => {
    const target = event.target instanceof Element ? event.target.closest('button') : null;
    if (
      target !== null &&
      !target.hasAttribute('aria-expanded') &&
      target.closest(`[${POPOVER}]`) === event.currentTarget
    ) {
      setOpen(false);
      // The control that did it goes with the popover, so focus would fall back to the top of the
      // page; it goes back to the button the menu opened from, as after Escape.
      buttonRef.current?.focus();
    }
  };

  const dot = indicator && <span className={styles.indicator} />;
  return (
    <div ref={menuRef} className={isRow ? `${styles.menu} ${styles.menuRow}` : styles.menu}>
      <button
        ref={buttonRef}
        type="button"
        className={`${styles.button} ${styles.menuButton}`}
        // Named explicitly: on phones the label is hidden and only the icon shows, and a menu
        // showing its value says both ("Translation: KJV"). The tooltip says it to a pointer
        // where the header has room for the icon alone; a row spells it out already.
        aria-label={accessibleName}
        title={isRow ? undefined : accessibleName}
        aria-expanded={open}
        aria-controls={popoverId}
        aria-busy={busy || undefined}
        onClick={() => {
          setOpen(!open);
        }}
      >
        {Icon && <Icon />}
        {isRow ? (
          // A row has the width to say both what it is and what it is set to.
          <>
            <span className={styles.rowLabel}>{label}</span>
            {dot}
            {value !== undefined && <span className={styles.menuValue}>{value}</span>}
            <ExpandIcon className={styles.menuChevron} />
          </>
        ) : (
          <>
            {value === undefined ? (
              <span className={styles.menuLabel}>{label}</span>
            ) : (
              <>
                <span className={styles.menuValue}>{value}</span>
                <ExpandIcon className={styles.menuChevron} />
              </>
            )}
            {dot}
          </>
        )}
      </button>
      {open && (
        <div
          ref={popoverRef}
          id={popoverId}
          className={isRow ? styles.rowPopover : styles.popover}
          {...{ [POPOVER]: '' }}
          onClick={closeOnAction ? closeAfterAction : undefined}
        >
          {/* The rows inside belong to this popover, not to the one it may itself sit in. */}
          <MenuRows value={false}>{children}</MenuRows>
        </div>
      )}
    </div>
  );
}
