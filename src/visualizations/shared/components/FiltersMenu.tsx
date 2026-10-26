import { useLocalization } from '../../../i18n/use-locale.tsx';
import { FiltersIcon, ResetIcon } from '../../../shared/ui/icons.tsx';
import {
  describeThreshold,
  isDefaultFilter,
  VOTE_THRESHOLDS,
  type LinkFilter,
} from '../link-filter.ts';
import styles from './controls.module.css';
import { MenuButton } from './MenuButton.tsx';

interface FiltersMenuProps {
  readonly filter: LinkFilter;
  readonly defaults: LinkFilter;
  readonly onChange: (filter: LinkFilter) => void;
  /** Links currently shown, and in the whole dataset, so filtering is never hidden. */
  readonly shownLinks: number;
  readonly totalLinks: number;
  /** For a view that opens the menu from elsewhere too (see `MenuButton`). */
  readonly open?: boolean | undefined;
  readonly onOpenChange?: ((open: boolean) => void) | undefined;
}

/** Low-key link filters: a button that opens a small popover. */
export function FiltersMenu({
  filter,
  defaults,
  onChange,
  shownLinks,
  totalLinks,
  open,
  onOpenChange,
}: FiltersMenuProps) {
  const { t, n } = useLocalization();
  const isDefault = isDefaultFilter(filter, defaults);
  // The minimum is included: "4 or more votes" keeps links with 4 votes.
  const threshold = describeThreshold(filter.minVotes);
  const thresholdText =
    threshold.kind === 'all'
      ? t('filter.allLinks')
      : threshold.kind === 'no-downvoted'
        ? t('filter.noDownvoted')
        : t('filter.atLeastVotes')(n(threshold.votes));
  const thresholdLabel = (minVotes: number) =>
    minVotes === -Infinity
      ? t('menu.filters.votes.all')
      : t('menu.filters.votes.atLeast')(minVotes);
  return (
    <MenuButton
      label={t('menu.filters')}
      changedLabel={t('menu.filtersChanged')}
      icon={FiltersIcon}
      indicator={!isDefault}
      open={open}
      onOpenChange={onOpenChange}
    >
      <label className={styles.field}>
        {t('menu.filters.votes')}
        <select
          className={styles.select}
          value={String(filter.minVotes)}
          onChange={(event) => {
            onChange({ ...filter, minVotes: Number(event.target.value) });
          }}
        >
          {VOTE_THRESHOLDS.map((minVotes) => (
            <option key={minVotes} value={String(minVotes)}>
              {thresholdLabel(minVotes)}
            </option>
          ))}
        </select>
      </label>
      <p className={styles.hint}>
        {t('menu.filters.note')(
          n(shownLinks),
          n(totalLinks),
          thresholdText,
          filter.hiddenGenres.size > 0
            ? t('menu.filters.hiddenGenres')(filter.hiddenGenres.size)
            : '',
        )}
      </p>
      <p className={styles.hint}>{t('menu.filters.tip')}</p>
      <button
        type="button"
        className={styles.button}
        disabled={isDefault}
        onClick={() => {
          onChange(defaults);
        }}
      >
        <ResetIcon />
        {t('menu.filters.reset')}
      </button>
    </MenuButton>
  );
}
