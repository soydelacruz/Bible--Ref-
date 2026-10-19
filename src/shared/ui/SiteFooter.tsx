import type { ReactNode } from 'react';
import { useLocalization } from '../../i18n/use-locale.tsx';
import { SourceCodeIcon } from './icons.tsx';
import { InstallLink } from './InstallGuide.tsx';
import styles from './SiteFooter.module.css';

const YEAR = new Date().getFullYear();

/** Where the code lives. The project is open source, so every page points at it. */
const REPOSITORY_URL = 'https://github.com/soydelacruz/Bible--Ref-';

interface SiteFooterProps {
  /** Page-specific credits, such as data attribution. */
  readonly children?: ReactNode;
  /** Extra class for page-specific spacing (CSS Modules class names may be undefined). */
  readonly className?: string | undefined;
}

/**
 * The minimal site-wide footer: the year, the author's site, the source and how to install the
 * app, plus credits.
 */
export function SiteFooter({ children, className }: SiteFooterProps) {
  const { t } = useLocalization();
  return (
    <footer className={className ? `${styles.footer} ${className}` : styles.footer}>
      <span className={styles.owner}>
        <span className={styles.copyright}>© {YEAR} · </span>
        <a href="https://trekhleb.dev">trekhleb.dev</a> ·{' '}
        <a
          className={styles.source}
          href={REPOSITORY_URL}
          target="_blank"
          rel="noreferrer"
          title={t('footer.source')}
          aria-label={t('footer.source')}
        >
          <SourceCodeIcon />
          <span className={styles.sourceLabel}>{t('footer.sourceLabel')}</span>
        </a>{' '}
        <InstallLink />
      </span>
      {children !== undefined && <span className={styles.credits}>{children}</span>}
    </footer>
  );
}
