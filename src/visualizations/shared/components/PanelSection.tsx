import { useId, type ReactNode } from 'react';
import { useLocalization } from '../../../i18n/use-locale.tsx';
import { useBooleanPreference, writePreference } from '../../../shared/lib/preferences.ts';
import { ExpandIcon, type IconComponent } from '../../../shared/ui/icons.tsx';
import styles from './PassagePanel.module.css';

/** Carries a section's `id` on its element, so the panel's summary can find it. */
export const PANEL_SECTION_ATTRIBUTE = 'data-section';

const preferenceOf = (id: string) => `panel:${id}`;

/** Opens a section, e.g. one the reader jumps to from the summary, as if its band were pressed. */
export function openPanelSection(id: string): void {
  writePreference(preferenceOf(id), 'true');
}

/**
 * One band of the details panel.
 *
 * The panel is a long scroll of verses that all look alike, and its sections used to be marked
 * only by a line of small capitals — easy to scroll past without noticing that "References" has
 * become "Referenced by". So each heading is a band that stays at the top of the panel while its
 * own section is on screen: whatever is being read, the thing above it says what it is.
 *
 * Each band also opens and closes, and remembers that between visits, so a reader who never
 * wants one of them can put it away for good.
 */
export function PanelSection({
  id,
  icon: Icon,
  title,
  description,
  count,
  countLabel,
  trailing,
  defaultOpen = true,
  children,
}: {
  /** Identifies the section in storage; changing it forgets what readers chose. */
  readonly id: string;
  readonly icon: IconComponent;
  readonly title: string;
  /** What the section holds, in a few words, e.g. "where this passage points". */
  readonly description: string;
  /** Shown at the end of the band; omit where a count would mean nothing. */
  readonly count?: number;
  /** What the count counts, for a reader who cannot see the section, e.g. "passages". */
  readonly countLabel?: string;
  /** Anything between the name and the count, e.g. the genre strip. */
  readonly trailing?: ReactNode;
  /** Whether the section starts open, before the reader has said otherwise. */
  readonly defaultOpen?: boolean;
  readonly children: ReactNode;
}) {
  const { t, n } = useLocalization();
  const [open, setOpen] = useBooleanPreference(preferenceOf(id), defaultOpen);
  const bodyId = useId();
  return (
    <section className={styles.section} {...{ [PANEL_SECTION_ATTRIBUTE]: id }}>
      <h3 className={styles.sectionHeader}>
        <button
          type="button"
          className={styles.sectionToggle}
          aria-expanded={open}
          aria-controls={bodyId}
          onClick={() => {
            setOpen(!open);
          }}
        >
          <Icon className={styles.sectionIcon} />
          <span className={styles.sectionName}>{title}</span>
          <span className={styles.sectionNote}>{description}</span>
          {trailing}
          {count !== undefined && (
            <span className={styles.count}>
              {n(count)}
              <span className={styles.visuallyHidden}> {countLabel ?? t('panel.items')}</span>
            </span>
          )}
          <ExpandIcon className={styles.chevron} />
        </button>
      </h3>
      <div id={bodyId} className={styles.sectionBody} hidden={!open}>
        {children}
      </div>
    </section>
  );
}
