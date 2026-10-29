/**
 * The Clusters layout worker: settles where every cluster goes (a force simulation per band) off
 * the main thread, so opening a book or resizing the window never stops the page while it runs.
 */
import { serveRequests } from '../../core/lib/worker-rpc.ts';
import { answerLayoutRequest } from './cluster-layout-messages.ts';

serveRequests(self, answerLayoutRequest);
