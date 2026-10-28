import { lazy } from 'react';
import { createCachedLoader } from '../../shared/lib/cached-loader.ts';
import { ReadingIcon } from '../../shared/ui/icons.tsx';
import type { Visualization } from '../visualization.ts';

// The view's code is a chunk of its own, downloaded the first time the view is opened — or, on the
// page that opens on it, beside the data.
const explorer = createCachedLoader(() => import('./ThreadsExplorer.tsx'));

export const threads = {
  id: 'threads',
  titleKey: 'view.threads',
  shortTitleKey: 'view.threads.short',
  icon: ReadingIcon,
  openLabelKey: 'view.threads.open',
  load: explorer.load,
  Component: lazy(async () => ({ default: (await explorer.load()).ThreadsExplorer })),
} as const satisfies Visualization;
