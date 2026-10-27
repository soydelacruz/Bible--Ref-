import { createContext, use, type ReactNode } from 'react';
import { MoreIcon } from '../../../shared/ui/icons.tsx';
import { SiteFooter } from '../../../shared/ui/SiteFooter.tsx';
import { useLocalization } from '../../../i18n/use-locale.tsx';
import { useBottomSheet } from '../use-bottom-sheet.ts';
import controls from './controls.module.css';
import { MenuButton, MenuRows } from './MenuButton.tsx';
import styles from './VizPage.module.css';

/**
 * What the host adds to every view's header (Wander): provided once, around all the views, rather
 * than handed to each of them to pass on. First among the controls, beside the search box, since
 * like the search it takes the reader to a passage; in the More menu on phones.
 */
export const HeaderActions = createContext<ReactNode>(null);

interface VizPageProps {
  /** The header's leading part, provided by the host app: the site's name and navigation. */
  readonly masthead?: ReactNode;
  /** The search box: in the header at every width, taking the room the row leaves it. */
  readonly search?: ReactNode;
  /**
   * The controls every view has a place for: the translation, saved verses, genres or image
   * export. In the header's row, and in the More menu on phones, where the row has no room.
   */
  readonly tools?: ReactNode;
  /** The filters menu: last in the header at every width, so it is always in the same place. */
  readonly filters?: ReactNode;
  /**
   * The view's own controls, which it keeps in a toolbar on its stage (`controls.stageToolbar`):
   * here they join the More menu on phones, where that toolbar is hidden.
   */
  readonly viewTools?: ReactNode;
  /** Marks the More menu while something inside it hides part of the picture (genres). */
  readonly moreChanged?: boolean;
  /** The details panel: a side column on wide screens, a bottom sheet on phones; omit or pass
   * `null` / `false` for none. */
  readonly panel?: ReactNode;
  /** Closes the panel; on phones, pulling its sheet down from the collapsed height calls it. */
  readonly onPanelClose?: () => void;
  /** Data attribution and inspiration, shown in the footer. */
  readonly credits: ReactNode;
  /** The visualization itself. */
  readonly children: ReactNode;
}

/**
 * The shared frame of every visualization page.
 *
 * The header is the same in every view, so switching views never moves the content: one row on a
 * desktop; on narrower screens the name and the switch, and under them the search box and the
 * controls. A control that belongs to one view lives on that view's stage instead.
 */
export function VizPage({
  masthead,
  search,
  tools,
  filters,
  viewTools,
  moreChanged = false,
  panel,
  onPanelClose,
  credits,
  children,
}: VizPageProps) {
  const { t } = useLocalization();
  const hasPanel = panel !== undefined && panel !== null && panel !== false;
  const { expanded, setExpanded, containerRef, sheetRef, spaceRef, scrimRef } = useBottomSheet(
    hasPanel,
    onPanelClose,
  );
  const actions = use(HeaderActions);
  const hasMore = Boolean(actions) || Boolean(tools) || Boolean(viewTools);
  return (
    <div className={styles.page}>
      <header className={styles.header}>
        <div className={styles.masthead}>{masthead}</div>
        <div className={styles.search}>{search}</div>
        <div className={styles.tools}>
          {/* The same controls are rendered again inside More, which only exists while open:
              there is never more than one of each on screen or to a screen reader. */}
          <div className={styles.shared}>
            {actions}
            {tools}
          </div>
          {filters}
          {hasMore && (
            <div className={styles.more}>
              <MenuButton
                label={t('menu.more')}
                changedLabel={t('menu.moreChanged')}
                icon={MoreIcon}
                indicator={moreChanged}
                focusOnOpen
                closeOnAction
              >
                <MenuRows value>
                  <div className={controls.rows}>
                    {actions}
                    {tools}
                  </div>
                  {Boolean(viewTools) && <div className={controls.rowsSection}>{viewTools}</div>}
                </MenuRows>
              </MenuButton>
            </div>
          )}
        </div>
      </header>
      <div
        ref={containerRef}
        className={styles.body}
        data-sheet={hasPanel ? (expanded ? 'expanded' : 'collapsed') : undefined}
      >
        <main className={styles.stage}>{children}</main>
        {hasPanel && (
          <>
            {/* Phones: the collapsed sheet's room, so the visualization lays out above it. */}
            <div ref={spaceRef} className={styles.sheetSpace} aria-hidden="true" />
            <div
              ref={scrimRef}
              className={styles.sheetScrim}
              aria-hidden="true"
              onClick={() => {
                setExpanded(false);
              }}
            />
            <aside ref={sheetRef} className={styles.panel} aria-label={t('panel.details')}>
              <button
                type="button"
                className={styles.sheetHandle}
                aria-label={expanded ? t('panel.collapse') : t('panel.expand')}
                aria-expanded={expanded}
                onClick={() => {
                  setExpanded(!expanded);
                }}
              />
              {panel}
            </aside>
          </>
        )}
      </div>
      <SiteFooter className={styles.footer}>{credits}</SiteFooter>
    </div>
  );
}
