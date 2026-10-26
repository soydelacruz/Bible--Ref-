import { formatBytes } from './files.ts';
import type { RawSource } from './sources.ts';

/** How many changed lines to print before summing up the rest. */
const SHOWN_LINES = 40;

interface ChangedLine {
  readonly text: string;
  /** How many lines both versions share before this one: where it goes. */
  readonly at: number;
}

/** The lines of `lines` that `other` lacks, counting repeats, each with its place. */
function linesMissingFrom(lines: readonly string[], other: readonly string[]): ChangedLine[] {
  const unmatched = new Map<string, number>();
  for (const line of other) {
    unmatched.set(line, (unmatched.get(line) ?? 0) + 1);
  }
  const missing: ChangedLine[] = [];
  let shared = 0;
  for (const line of lines) {
    const count = unmatched.get(line) ?? 0;
    if (count > 0) {
      unmatched.set(line, count - 1);
      shared += 1;
    } else {
      missing.push({ text: line.replace(/\r$/, ''), at: shared });
    }
  }
  return missing;
}

function countLines(count: number): string {
  return count === 1 ? '1 line' : `${count.toLocaleString('en-US')} lines`;
}

/**
 * What changed between two versions of a text, for whoever decides whether to adopt the new one:
 * the lines only the old version has (`-`) and those only the new one has (`+`), in the text's
 * order, each old line just before the lines that took its place.
 *
 * Not a full diff, and it need not be: in a verse-per-line text every line is one verse with its
 * reference, so a line that is in one version and not the other is exactly a verse that changed.
 */
export function describeTextChange(before: string, after: string): string[] {
  if (before.replaceAll('\r\n', '\n') === after.replaceAll('\r\n', '\n')) {
    return ['Only the line endings changed.'];
  }
  const oldLines = before.split('\n');
  const newLines = after.split('\n');
  const removed = linesMissingFrom(oldLines, newLines);
  const added = linesMissingFrom(newLines, oldLines);
  // A stable sort, so lines that go in the same place keep their own order.
  const changes = [
    ...removed.map(({ text, at }) => ({ text: `- ${text}`, at, order: 0 })),
    ...added.map(({ text, at }) => ({ text: `+ ${text}`, at, order: 1 })),
  ].sort((a, b) => a.at - b.at || a.order - b.order);
  const shown = changes.slice(0, SHOWN_LINES).map(({ text }) => text);
  const rest = changes.length - shown.length;
  return [
    `${countLines(removed.length)} removed, ${countLines(added.length)} added:`,
    ...shown,
    ...(rest > 0 ? [`… and ${rest.toLocaleString('en-US')} more`] : []),
  ];
}

/**
 * What changed between two versions of the bytes a source pins: the lines of a text file, or the
 * size of anything else, whose bytes would mean nothing printed.
 */
export function describePinnedChange(
  source: RawSource,
  before: Uint8Array,
  after: Uint8Array,
): string[] {
  if (!(source.member ?? source.fileName).endsWith('.txt')) {
    return [`${formatBytes(before.byteLength)} before, ${formatBytes(after.byteLength)} now.`];
  }
  // The byte order mark is kept: a publisher adding or dropping one is a change like any other.
  const decoder = new TextDecoder('utf-8', { ignoreBOM: true });
  return describeTextChange(decoder.decode(before), decoder.decode(after));
}
