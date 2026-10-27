import type { GenreId } from '../../../core/bible/genres.ts';
import { elementAt } from '../../../core/lib/array.ts';
import { formatPassage, passageRange, type Passage } from '../../../core/bible/passage.ts';
import type { VerseIndexRange, Versification } from '../../../core/bible/versification.ts';
import type { CrossReferenceIndex } from '../../../cross-references/cross-reference-index.ts';
import type { BookNames } from '../../../i18n/books/types.ts';
import type { Translation } from '../../../translations/translation.ts';
import { collectConnections } from '../../shared/connections.ts';
import type { ImageCaption } from '../../shared/image-export.ts';
import type { LinkFilter } from '../../shared/link-filter.ts';
import { superscript } from '../../shared/passage-quote.ts';
import type { VizCore } from '../../shared/viz-data.ts';
import { voteWeight } from '../../shared/vote-weight.ts';

/** One link of the passage, as the clip draws it: an arc that grows out of the passage. */
export interface ClipArc {
  /** Where it meets the passage on the axis, in continuous verse units (as the diagram's arcs). */
  readonly here: number;
  /** Its other end. */
  readonly there: number;
  /** Genre ordinals of the two ends: the arc's colors. */
  readonly hereGenre: number;
  readonly thereGenre: number;
  /** Brightness in [0.2, 1] from community votes, as in the diagram. */
  readonly weight: number;
}

/**
 * The links of a passage that pass the filter, each once, in the order the clip grows them: by
 * where their other end is, so they sweep across the Bible from Genesis to Revelation.
 */
export function clipArcs(
  index: CrossReferenceIndex,
  range: VerseIndexRange,
  filter: LinkFilter,
  verseGenres: Uint8Array,
): ClipArc[] {
  const { outgoing, incoming } = collectConnections(index, range, filter, verseGenres);
  const seen = new Set<number>();
  const arcs: ClipArc[] = [];
  // A link between two verses of a chapter is both: it is drawn once, from its source.
  for (const { link, direction } of [...outgoing, ...incoming]) {
    if (seen.has(link.id)) {
      continue;
    }
    seen.add(link.id);
    // The ends where the diagram puts them: a source verse's middle, a target range's middle.
    const source = link.from + 0.5;
    const target = (link.targetStart + link.targetEnd + 1) / 2;
    const sourceGenre = elementAt(verseGenres, link.from);
    const targetGenre = elementAt(verseGenres, link.targetStart);
    const outward = direction === 'outgoing';
    arcs.push({
      here: outward ? source : target,
      there: outward ? target : source,
      hereGenre: outward ? sourceGenre : targetGenre,
      thereGenre: outward ? targetGenre : sourceGenre,
      weight: voteWeight(link.votes),
    });
  }
  return arcs.sort((a, b) => a.there - b.there || a.here - b.here);
}

/**
 * The passage's words: a verse's text, or a chapter's verses with their numbers. `null` when the
 * translation has none of them.
 */
export function passageWords(
  translation: Translation,
  range: VerseIndexRange,
  versification: Versification,
): string | null {
  const verses: string[] = [];
  for (let verse = range.start; verse <= range.end; verse += 1) {
    const text = translation.verseText(verse);
    if (text === '') {
      continue;
    }
    verses.push(
      range.start === range.end
        ? text
        : superscript(String(versification.refAt(verse).verse)) + text,
    );
  }
  return verses.length === 0 ? null : verses.join(' ');
}

/**
 * Breaks text into lines no wider than `maxWidth`, at most `maxLines` of them; text that runs on
 * past the last line ends it with an ellipsis. A word wider than a line has the line to itself.
 */
export function wrapText(
  text: string,
  maxWidth: number,
  maxLines: number,
  measure: (text: string) => number,
): string[] {
  const lines: string[] = [];
  let line = '';
  for (const word of text.split(/\s+/).filter((part) => part !== '')) {
    const longer = line === '' ? word : `${line} ${word}`;
    if (line === '' || measure(longer) <= maxWidth) {
      line = longer;
      continue;
    }
    if (lines.length === maxLines - 1) {
      return [...lines, ellipsize(line, maxWidth, measure)];
    }
    lines.push(line);
    line = word;
  }
  return line === '' ? lines : [...lines, line];
}

/** A line the text runs on from, cut back by words until it fits with an ellipsis. */
function ellipsize(line: string, maxWidth: number, measure: (text: string) => number): string {
  const words = line.split(' ');
  const shown = () => `${words.join(' ').replace(/[,;:]$/, '')}…`;
  while (words.length > 1 && measure(shown()) > maxWidth) {
    words.pop();
  }
  return shown();
}

/** Everything one clip shows, worked out before its first frame. */
export interface ClipScene {
  readonly versification: Versification;
  readonly names: BookNames;
  readonly genreNames: Readonly<Record<GenreId, string>>;
  readonly range: VerseIndexRange;
  /** The passage, as its title says it: `John 3:16`. */
  readonly reference: string;
  /** Null while the text is still on its way, or if it has none of the passage. */
  readonly words: ClipWords | null;
  readonly caption: ImageCaption;
  readonly arcs: readonly ClipArc[];
}

export interface ClipWords {
  readonly text: string;
  readonly abbreviation: string;
  /**
   * The translation's credit, for a text not in the public domain: it asks to travel with every
   * quotation, as it does with a copied verse.
   */
  readonly credit: string | null;
}

export function buildClipScene({
  core,
  passage,
  filter,
  translation,
  names,
  genreNames,
  caption,
}: {
  readonly core: VizCore;
  readonly passage: Passage;
  readonly filter: LinkFilter;
  readonly translation: Translation | null;
  readonly names: BookNames;
  readonly genreNames: Readonly<Record<GenreId, string>>;
  readonly caption: ImageCaption;
}): ClipScene {
  const { versification, verseGenres } = core;
  const range = passageRange(passage, versification);
  const text = translation && passageWords(translation, range, versification);
  const manifest = translation?.manifest;
  return {
    versification,
    names,
    genreNames,
    range,
    reference: formatPassage(passage, versification, names),
    words:
      text && manifest
        ? {
            text,
            abbreviation: manifest.abbreviation,
            credit: manifest.license.publicDomain === true ? null : manifest.attribution,
          }
        : null,
    caption,
    arcs: clipArcs(core.crossReferences.index, range, filter, verseGenres),
  };
}
