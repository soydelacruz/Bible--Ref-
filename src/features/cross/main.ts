import '../../shared/styles/global.css';
import './cross.css';
import { startCrossScene } from './cross-scene.ts';

// The page's words are in its HTML; this only draws the cross behind them. Without WebGL the page
// keeps a cross drawn in CSS (see cross.css), so it never shows a broken canvas.
const host = document.getElementById('root');
if (host) {
  host.replaceChildren();
  const still = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  try {
    startCrossScene(host, { still });
    document.documentElement.dataset['scene'] = 'ready';
  } catch {
    document.documentElement.dataset['scene'] = 'unavailable';
  }
}
