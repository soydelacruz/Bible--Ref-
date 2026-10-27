import { describe, expect, it } from 'vitest';
import { chapterPassageOf, versePassage } from '../../../core/bible/passage.ts';
import { CANONICAL_VERSIFICATION } from '../../../core/bible/versification.ts';
import { ENGLISH } from '../../../i18n/use-locale.tsx';
import { createTranslationFile, verseIndex } from '../../../test-utils/fixtures.ts';
import { createVizData } from '../../../test-utils/viz-data.ts';
import { getTranslationManifest } from '../../../translations/registry.ts';
import { Translation } from '../../../translations/translation.ts';
import { createLinkFilter } from '../../shared/link-filter.ts';
import { voteWeight } from '../../shared/vote-weight.ts';
import { buildClipScene, clipArcs, passageWords, wrapText } from './clip-scene.ts';

const JOHN_3_16 = verseIndex('John', 3, 16);
const JOHN_3_17 = verseIndex('John', 3, 17);
const ROM_5_8 = verseIndex('Rom', 5, 8);
const ROM_8_32 = verseIndex('Rom', 8, 32);
const GEN_22_2 = verseIndex('Gen', 22, 2);
const ANY_VOTES = createLinkFilter(-Infinity);

// Genre ordinals, in canonical order.
const LAW = 0;
const GOSPELS = 5;
const PAULINE = 7;

const DATA = createVizData(
  [
    { from: JOHN_3_16, to: ROM_8_32, votes: 510 },
    { from: JOHN_3_16, to: ROM_5_8, votes: 983 },
    // Into a range covering John 3:16 and 3:17: one arc, landing between them.
    { from: GEN_22_2, to: JOHN_3_16, toEnd: JOHN_3_17, votes: 7 },
    { from: ROM_5_8, to: JOHN_3_16, votes: -2 },
    // Inside the chapter: listed under both of its verses, drawn once.
    { from: JOHN_3_16, to: JOHN_3_17, votes: 3 },
  ],
  new Map([
    [JOHN_3_16, 'For God so loved the world…'],
    [JOHN_3_17, ''],
  ]),
);

function arcsOf(range: { start: number; end: number }, minVotes = -Infinity) {
  return clipArcs(DATA.crossReferences.index, range, createLinkFilter(minVotes), DATA.verseGenres);
}

describe('clipArcs', () => {
  it('draws every link of a verse out of it, ordered by where it lands', () => {
    const arcs = arcsOf({ start: JOHN_3_16, end: JOHN_3_16 });
    expect(arcs).toEqual([
      {
        here: JOHN_3_16 + 1,
        there: GEN_22_2 + 0.5,
        hereGenre: GOSPELS,
        thereGenre: LAW,
        weight: voteWeight(7),
      },
      {
        here: JOHN_3_16 + 0.5,
        there: JOHN_3_17 + 0.5,
        hereGenre: GOSPELS,
        thereGenre: GOSPELS,
        weight: voteWeight(3),
      },
      // Two links meet at Romans 5:8, one each way.
      {
        here: JOHN_3_16 + 0.5,
        there: ROM_5_8 + 0.5,
        hereGenre: GOSPELS,
        thereGenre: PAULINE,
        weight: voteWeight(983),
      },
      {
        here: JOHN_3_16 + 0.5,
        there: ROM_5_8 + 0.5,
        hereGenre: GOSPELS,
        thereGenre: PAULINE,
        weight: voteWeight(-2),
      },
      {
        here: JOHN_3_16 + 0.5,
        there: ROM_8_32 + 0.5,
        hereGenre: GOSPELS,
        thereGenre: PAULINE,
        weight: voteWeight(510),
      },
    ]);
  });

  it('draws a link between two of its verses once, from its source', () => {
    const arcs = arcsOf({ start: JOHN_3_16, end: JOHN_3_17 });
    const inside = arcs.filter((arc) => arc.there === JOHN_3_17 + 0.5);
    expect(inside).toEqual([expect.objectContaining({ here: JOHN_3_16 + 0.5 })]);
    expect(arcs).toHaveLength(5);
  });

  it('leaves out the links the filter hides', () => {
    expect(arcsOf({ start: JOHN_3_16, end: JOHN_3_16 }, 500).map((arc) => arc.there)).toEqual([
      ROM_5_8 + 0.5,
      ROM_8_32 + 0.5,
    ]);
  });
});

describe('passageWords', () => {
  const translation = DATA.translation;

  it('is a verse’s text', () => {
    expect(
      passageWords(translation, { start: JOHN_3_16, end: JOHN_3_16 }, CANONICAL_VERSIFICATION),
    ).toBe('For God so loved the world…');
  });

  it('numbers a passage’s verses, leaving out those the translation omits', () => {
    const start = verseIndex('John', 3, 15);
    const end = verseIndex('John', 3, 18);
    expect(passageWords(translation, { start, end }, CANONICAL_VERSIFICATION)).toBe(
      `¹⁵Verse number ${String(start)}. ¹⁶For God so loved the world… ` +
        `¹⁸Verse number ${String(end)}.`,
    );
  });

  it('is nothing when every verse is omitted', () => {
    expect(
      passageWords(translation, { start: JOHN_3_17, end: JOHN_3_17 }, CANONICAL_VERSIFICATION),
    ).toBeNull();
  });
});

describe('wrapText', () => {
  // One unit per character, so widths can be read off the text.
  const measure = (text: string) => text.length;

  it('breaks between words, keeping each line within the width', () => {
    expect(wrapText('For God so loved the world', 10, 5, measure)).toEqual([
      'For God so',
      'loved the',
      'world',
    ]);
  });

  it('ends the last line with an ellipsis when the text runs on past it', () => {
    expect(wrapText('For God so loved the world, that he gave', 10, 2, measure)).toEqual([
      'For God so',
      'loved the…',
    ]);
    expect(wrapText('For God so loved them all, that he gave', 10, 2, measure)).toEqual([
      'For God so',
      'loved…',
    ]);
    expect(wrapText('one two, three four', 9, 1, measure)).toEqual(['one two…']);
  });

  it('gives a word wider than a line the line to itself', () => {
    expect(wrapText('a Mahershalalhashbaz b', 6, 3, measure)).toEqual([
      'a',
      'Mahershalalhashbaz',
      'b',
    ]);
  });

  it('makes no lines of no words', () => {
    expect(wrapText('  ', 10, 3, measure)).toEqual([]);
  });
});

describe('buildClipScene', () => {
  const caption = { title: 'John 3:16 · App', url: 'https://example.org', credit: 'Credit.' };
  const scene = (translation: Translation | null, passage = versePassage(JOHN_3_16)) =>
    buildClipScene({
      core: DATA,
      passage,
      filter: ANY_VOTES,
      translation,
      names: ENGLISH.books,
      genreNames: ENGLISH.locale.genres,
      caption,
    });

  it('names the passage, and quotes it with the translation’s abbreviation', () => {
    const result = scene(DATA.translation);
    expect(result.reference).toBe('John 3:16');
    expect(result.range).toEqual({ start: JOHN_3_16, end: JOHN_3_16 });
    expect(result.words).toEqual({
      text: 'For God so loved the world…',
      abbreviation: 'BSB',
      credit: null,
    });
    expect(result.caption).toBe(caption);
    expect(result.arcs).toHaveLength(5);
  });

  it('carries the credit of a translation not in the public domain', () => {
    const manifest = getTranslationManifest('net');
    const net = new Translation(manifest, CANONICAL_VERSIFICATION, createTranslationFile());
    expect(scene(net).words).toEqual(
      expect.objectContaining({ abbreviation: 'NET', credit: manifest.attribution }),
    );
  });

  it('leaves the words out while the text is on its way, or where it has none', () => {
    expect(scene(null).words).toBeNull();
    expect(scene(DATA.translation, versePassage(JOHN_3_17)).words).toBeNull();
  });

  it('names a chapter as a chapter', () => {
    expect(scene(null, chapterPassageOf(JOHN_3_16, CANONICAL_VERSIFICATION)).reference).toBe(
      'John 3',
    );
  });
});
