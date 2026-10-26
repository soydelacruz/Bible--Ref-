import { crossReferencesDatasetPath, translationDatasetPath } from '../../core/datasets/paths.ts';
import { CROSS_REFERENCE_SOURCE_MANIFESTS } from '../../cross-references/registry.ts';
import type { CrossReferenceSourceManifest } from '../../cross-references/source-manifest.ts';
import { DEFAULT_TRANSLATION_ID } from '../../translations/registry.ts';

/** The cross-reference source the visualizations draw. */
export function vizCrossReferenceSource(): CrossReferenceSourceManifest {
  const manifest = CROSS_REFERENCE_SOURCE_MANIFESTS.find(
    ({ enabledByDefault }) => enabledByDefault,
  );
  if (!manifest) {
    throw new Error('No cross-reference source is enabled by default.');
  }
  return manifest;
}

/**
 * The files a first visit needs, relative to the site's base: the links, and the text of the
 * default translation, which the offline cache stores when it installs. The HTML preloads the links
 * (and, on a page whose first screen is words, the reader's text) so they download while the
 * scripts do — see vite/site-head.ts; elsewhere the text follows once the links are in (see
 * `afterLinksDownloaded`).
 */
export function vizDatasetPaths(): readonly string[] {
  return [
    translationDatasetPath(DEFAULT_TRANSLATION_ID),
    crossReferencesDatasetPath(vizCrossReferenceSource().id),
  ];
}
