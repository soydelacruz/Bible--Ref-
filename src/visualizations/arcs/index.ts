import { lazy } from 'react';
import { createCachedLoader } from '../../shared/lib/cached-loader.ts';
import { ArcsIcon } from '../../shared/ui/icons.tsx';
import type { Visualization } from '../visualization.ts';

// The view's code, with Three.js, is a chunk of its own, downloaded the first time the view is
// opened — or, on the page that opens on it, beside the data.
const explorer = createCachedLoader(() => import('./ArcsExplorer.tsx'));

export const arcs = {
  id: 'arcs',
  titleKey: 'view.arcs',
  shortTitleKey: 'view.arcs.short',
  icon: ArcsIcon,
  openLabelKey: 'view.arcs.open',
  // Drawn from the links alone: it shows before the text has arrived.
  drawsBeforeText: true,
  load: explorer.load,
  Component: lazy(async () => ({ default: (await explorer.load()).ArcsExplorer })),
} as const satisfies Visualization;
