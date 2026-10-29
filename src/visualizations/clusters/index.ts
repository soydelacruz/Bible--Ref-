import { lazy } from 'react';
import { createCachedLoader } from '../../shared/lib/cached-loader.ts';
import { ClustersIcon } from '../../shared/ui/icons.tsx';
import type { Visualization } from '../visualization.ts';

// The view's code (with d3-force) is a chunk of its own, downloaded the first time the view is
// opened — or, on the page that opens on it, beside the data.
const explorer = createCachedLoader(() => import('./ClustersExplorer.tsx'));

export const clusters = {
  id: 'clusters',
  titleKey: 'view.clusters',
  shortTitleKey: 'view.clusters.short',
  icon: ClustersIcon,
  openLabelKey: 'view.clusters.open',
  // Drawn from the links alone: it shows before the text has arrived.
  drawsBeforeText: true,
  load: explorer.load,
  Component: lazy(async () => ({ default: (await explorer.load()).ClustersExplorer })),
} as const satisfies Visualization;
