import { lazy } from 'react';
import { ClustersIcon } from '../../shared/ui/icons.tsx';
import type { Visualization } from '../visualization.ts';

// The view's code (with d3-force) is a chunk of its own; its download starts as soon as the app
// lists the views.
const explorer = import('./ClustersExplorer.tsx');

export const clusters = {
  id: 'clusters',
  titleKey: 'view.clusters',
  shortTitleKey: 'view.clusters.short',
  icon: ClustersIcon,
  openLabelKey: 'view.clusters.open',
  Component: lazy(async () => ({ default: (await explorer).ClustersExplorer })),
} as const satisfies Visualization;
