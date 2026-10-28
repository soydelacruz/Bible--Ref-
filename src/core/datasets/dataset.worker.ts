/**
 * The dataset worker: reads the files the page downloads (see `decoders.ts`) so the page itself
 * never stops for them, and hands the arrays it builds back without copying them.
 */
import { serveRequests } from '../lib/worker-rpc.ts';
import { decodeDataset, parseDecodeMessage } from './decoders.ts';

serveRequests(self, (message) => {
  const { request, buffer } = parseDecodeMessage(message);
  return decodeDataset(request, buffer);
});
