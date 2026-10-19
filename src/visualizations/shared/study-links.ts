import { BOOKS, getBook, type BookId } from '../../core/bible/books.ts';
import { KJV_CHAPTER_VERSE_COUNTS } from '../../core/bible/kjv-versification.ts';

/**
 * Links from a passage to study sites elsewhere: translators' notes, lexicons, interlinears and
 * commentaries the app cannot carry itself. Links only — none of their text is copied here. The
 * NET Bible's notes in particular may not be redistributed, but may be linked to.
 *
 * Every pattern below was checked by opening it, for every book of the Bible, on 2026-10-19.
 */

/** A verse, or a whole chapter when `verse` is absent. */
export interface StudyReference {
  readonly book: BookId;
  readonly chapter: number;
  readonly verse?: number;
}

/** The sites, each with what it offers; the visible names and labels are in the catalogues. */
export type StudySite =
  | 'net'
  | 'blueLetterBible'
  | 'bibleHubCommentaries'
  | 'bibleHubParallel'
  | 'bibleHubChapter'
  | 'stepBible';

export interface StudyLink {
  readonly site: StudySite;
  readonly url: string;
}

/**
 * The NET Bible names books as they are written in English, with `+` for spaces, except for the
 * Song of Solomon: it knows that book as "Song of Songs", and both full names open chapter 1
 * whatever chapter was asked for, so it is given the one short name that works.
 */
function netBookName(book: BookId): string {
  return (book === 'Song' ? 'Song' : getBook(book).name).replaceAll(' ', '+');
}

/** Blue Letter Bible's three-letter codes. Most are a name's first letters; Ruth's is not. */
const BLUE_LETTER_BIBLE_CODES: Readonly<Record<BookId, string>> = {
  Gen: 'gen',
  Exod: 'exo',
  Lev: 'lev',
  Num: 'num',
  Deut: 'deu',
  Josh: 'jos',
  Judg: 'jdg',
  Ruth: 'rth',
  '1Sam': '1sa',
  '2Sam': '2sa',
  '1Kgs': '1ki',
  '2Kgs': '2ki',
  '1Chr': '1ch',
  '2Chr': '2ch',
  Ezra: 'ezr',
  Neh: 'neh',
  Esth: 'est',
  Job: 'job',
  Ps: 'psa',
  Prov: 'pro',
  Eccl: 'ecc',
  Song: 'sng',
  Isa: 'isa',
  Jer: 'jer',
  Lam: 'lam',
  Ezek: 'eze',
  Dan: 'dan',
  Hos: 'hos',
  Joel: 'joe',
  Amos: 'amo',
  Obad: 'oba',
  Jonah: 'jon',
  Mic: 'mic',
  Nah: 'nah',
  Hab: 'hab',
  Zeph: 'zep',
  Hag: 'hag',
  Zech: 'zec',
  Mal: 'mal',
  Matt: 'mat',
  Mark: 'mar',
  Luke: 'luk',
  John: 'jhn',
  Acts: 'act',
  Rom: 'rom',
  '1Cor': '1co',
  '2Cor': '2co',
  Gal: 'gal',
  Eph: 'eph',
  Phil: 'phl',
  Col: 'col',
  '1Thess': '1th',
  '2Thess': '2th',
  '1Tim': '1ti',
  '2Tim': '2ti',
  Titus: 'tit',
  Phlm: 'phm',
  Heb: 'heb',
  Jas: 'jas',
  '1Pet': '1pe',
  '2Pet': '2pe',
  '1John': '1jo',
  '2John': '2jo',
  '3John': '3jo',
  Jude: 'jde',
  Rev: 'rev',
};

/** How many chapters come before each book's first, counting from Genesis 1. */
const CHAPTERS_BEFORE: ReadonlyMap<BookId, number> = new Map(
  BOOKS.map((book, ordinal) => [
    book.id,
    BOOKS.slice(0, ordinal).reduce(
      (total, earlier) => total + KJV_CHAPTER_VERSE_COUNTS[earlier.id].length,
      0,
    ),
  ]),
);

/**
 * Blue Letter Bible numbers a verse by its chapter's place in the whole Bible (Genesis 1 is the
 * first, Revelation 22 the 1,189th) times a thousand, plus the verse — John 3:16 is 1000016 — and
 * opens the verse's interlinear, with the lexicon behind each word, under that number.
 */
function blueLetterBibleVerseId(book: BookId, chapter: number, verse: number): number {
  return ((CHAPTERS_BEFORE.get(book) ?? 0) + chapter) * 1000 + verse;
}

/** BibleHub's folder for a book: its name in lower case, `_` for spaces, and `songs` for the Song. */
function bibleHubBook(book: BookId): string {
  return book === 'Song' ? 'songs' : getBook(book).name.toLowerCase().replaceAll(' ', '_');
}

/** The links for a verse or a chapter, in the order the panel lists them: the NET's notes first. */
export function studyLinks({ book, chapter, verse }: StudyReference): readonly StudyLink[] {
  const blb = `https://www.blueletterbible.org/kjv/${BLUE_LETTER_BIBLE_CODES[book]}/${String(chapter)}`;
  const bibleHub = bibleHubBook(book);
  const net = `https://netbible.org/bible/${netBookName(book)}+${String(chapter)}`;
  // STEPBible reads this app's own OSIS book IDs.
  const step = `https://www.stepbible.org/?q=version=ESV|reference=${book}.${String(chapter)}`;

  if (verse === undefined) {
    return [
      { site: 'net', url: net },
      // A chapter opens at its first verse, with the same tools beside every verse.
      { site: 'blueLetterBible', url: `${blb}/1/` },
      // Commentaries on BibleHub are kept verse by verse; a chapter has its own page.
      { site: 'bibleHubChapter', url: `https://biblehub.com/${bibleHub}/${String(chapter)}.htm` },
      { site: 'stepBible', url: step },
    ];
  }
  const place = `${String(chapter)}-${String(verse)}.htm`;
  const blbId = blueLetterBibleVerseId(book, chapter, verse);
  return [
    { site: 'net', url: `${net}:${String(verse)}` },
    { site: 'blueLetterBible', url: `${blb}/${String(verse)}/t_conc_${String(blbId)}` },
    { site: 'bibleHubCommentaries', url: `https://biblehub.com/commentaries/${bibleHub}/${place}` },
    { site: 'bibleHubParallel', url: `https://biblehub.com/parallel/${bibleHub}/${place}` },
    { site: 'stepBible', url: `${step}.${String(verse)}` },
  ];
}
