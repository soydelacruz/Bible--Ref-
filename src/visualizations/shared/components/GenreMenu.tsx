import { useLocalization } from '../../../i18n/use-locale.tsx';
import { GenresIcon } from '../../../shared/ui/icons.tsx';
import { GenreToggles, type GenreTogglesProps } from './GenreToggles.tsx';
import { MenuButton } from './MenuButton.tsx';

/**
 * The genre legend, the same in every view: a header menu (a row of More on phones) whose keys
 * name the pictures' colours and hide or show each genre's links. Marked while any is hidden.
 * In the header rather than on the picture, so the header is the same in every view and the
 * legend never covers what it explains; the pictures name their genres in place besides.
 */
export function GenreMenu(props: GenreTogglesProps) {
  const { t } = useLocalization();
  return (
    <MenuButton
      label={t('genres.label')}
      changedLabel={t('genres.labelChanged')}
      icon={GenresIcon}
      indicator={props.hiddenGenres.size > 0}
    >
      <GenreToggles {...props} />
    </MenuButton>
  );
}
