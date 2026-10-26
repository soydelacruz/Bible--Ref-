import type { JSXElementConstructor, ReactNode } from 'react';
import type { Passage } from '../core/bible/passage.ts';
import type { MessageKey } from '../i18n/messages/types.ts';
import type { IconComponent } from '../shared/ui/icons.tsx';
import type { LinkFilter } from './shared/link-filter.ts';
import type { EarlyVizData, VizCore, VizData } from './shared/viz-data.ts';

/**
 * What the host app gives a visualization. The host owns the URL, where it keeps the focused
 * passage and the active visualization, so every visualization shares the same passage.
 */
export interface VisualizationProps<Data extends VizCore = VizData> {
  readonly data: Data;
  /** The focused passage, or `null` for none. */
  readonly passage: Passage | null;
  /**
   * Focuses another passage (or none); the host records it in the URL and the history. With
   * `replace`, it takes the place of the current history entry instead (e.g. each stop of a tour
   * after the first, so Back leaves the tour rather than retracing it).
   */
  readonly onNavigate: (passage: Passage | null, options?: { readonly replace?: boolean }) => void;
  /** Which links to show. One filter for every visualization, so they agree on the links. */
  readonly filter: LinkFilter;
  readonly onFilterChange: (filter: LinkFilter) => void;
  /**
   * Whether the visualization is on screen. The host keeps every visualization mounted, so a
   * hidden one should stop drawing (and start its intro once shown).
   */
  readonly active: boolean;
  /** The header's leading part from the host: the site's name (a link home) and the switch
   * between visualizations. */
  readonly masthead: ReactNode;
  /** The host's translation picker, for the visualization to place among its own controls. */
  readonly translationMenu: ReactNode;
  /** Links that open a passage in the other visualizations, for the details panel. */
  readonly passageLinks: (passage: Passage) => ReactNode;
  /** A passage's address on the published site, for links meant for others (copied quotes). */
  readonly shareUrl: (passage: Passage) => string;
}

interface VisualizationInfo {
  readonly id: string;
  /** Message keys rather than words: the switch is read in the reader's own language. */
  readonly titleKey: MessageKey;
  /** Shown instead of the title on phones. */
  readonly shortTitleKey: MessageKey;
  readonly icon: IconComponent;
  /** Invites a reader into this visualization from another one, e.g. "Read in context". */
  readonly openLabelKey: MessageKey;
}

/**
 * A visualization of the explorer. Each folder under `src/visualizations/` exports one from its
 * `index.ts`, and the app lists them in `src/app/views.ts`. Visualizations never import each other;
 * the host connects them.
 *
 * `Component` is usually lazy, so each visualization's code (e.g. Three.js) is a chunk of its own.
 */
export type Visualization = VisualizationInfo &
  (
    | {
        /** Shown once the text has arrived: what it draws is the words. */
        readonly drawsBeforeText?: false;
        readonly Component: JSXElementConstructor<VisualizationProps>;
      }
    | {
        /**
         * Drawn from the links alone, so it shows before the text has arrived — seconds sooner on
         * a phone — and only its parts that show words wait for it (see `WithText`).
         */
        readonly drawsBeforeText: true;
        readonly Component: JSXElementConstructor<VisualizationProps<EarlyVizData>>;
      }
  );
