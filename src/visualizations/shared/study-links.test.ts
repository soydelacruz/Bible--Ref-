import { describe, expect, it } from 'vitest';
import { BOOKS } from '../../core/bible/books.ts';
import { studyLinks, type StudyReference } from './study-links.ts';

function urls(reference: StudyReference): Readonly<Record<string, string>> {
  return Object.fromEntries(studyLinks(reference).map((link) => [link.site, link.url]));
}

/**
 * The passages every pattern was opened for. Each URL here was followed in a browser and landed
 * on the passage it names.
 */
describe('studyLinks for a verse', () => {
  it('links John 3:16', () => {
    expect(urls({ book: 'John', chapter: 3, verse: 16 })).toEqual({
      net: 'https://netbible.org/bible/John+3:16',
      blueLetterBible: 'https://www.blueletterbible.org/kjv/jhn/3/16/t_conc_1000016',
      bibleHubCommentaries: 'https://biblehub.com/commentaries/john/3-16.htm',
      bibleHubParallel: 'https://biblehub.com/parallel/john/3-16.htm',
      stepBible: 'https://www.stepbible.org/?q=version=ESV|reference=John.3.16',
    });
  });

  it('links Psalm 23:1', () => {
    expect(urls({ book: 'Ps', chapter: 23, verse: 1 })).toEqual({
      net: 'https://netbible.org/bible/Psalms+23:1',
      blueLetterBible: 'https://www.blueletterbible.org/kjv/psa/23/1/t_conc_501001',
      bibleHubCommentaries: 'https://biblehub.com/commentaries/psalms/23-1.htm',
      bibleHubParallel: 'https://biblehub.com/parallel/psalms/23-1.htm',
      stepBible: 'https://www.stepbible.org/?q=version=ESV|reference=Ps.23.1',
    });
  });

  it('links 1 Corinthians 13:4, a numbered book', () => {
    expect(urls({ book: '1Cor', chapter: 13, verse: 4 })).toEqual({
      net: 'https://netbible.org/bible/1+Corinthians+13:4',
      blueLetterBible: 'https://www.blueletterbible.org/kjv/1co/13/4/t_conc_1075004',
      bibleHubCommentaries: 'https://biblehub.com/commentaries/1_corinthians/13-4.htm',
      bibleHubParallel: 'https://biblehub.com/parallel/1_corinthians/13-4.htm',
      stepBible: 'https://www.stepbible.org/?q=version=ESV|reference=1Cor.13.4',
    });
  });

  it('links Song of Solomon 2:1, which every site names its own way', () => {
    expect(urls({ book: 'Song', chapter: 2, verse: 1 })).toEqual({
      // "Song+of+Solomon+2:1" and "Song+of+Songs+2:1" both open chapter 1.
      net: 'https://netbible.org/bible/Song+2:1',
      blueLetterBible: 'https://www.blueletterbible.org/kjv/sng/2/1/t_conc_673001',
      bibleHubCommentaries: 'https://biblehub.com/commentaries/songs/2-1.htm',
      bibleHubParallel: 'https://biblehub.com/parallel/songs/2-1.htm',
      stepBible: 'https://www.stepbible.org/?q=version=ESV|reference=Song.2.1',
    });
  });

  it('links 3 John 1:2, a book of one chapter', () => {
    expect(urls({ book: '3John', chapter: 1, verse: 2 })).toEqual({
      net: 'https://netbible.org/bible/3+John+1:2',
      blueLetterBible: 'https://www.blueletterbible.org/kjv/3jo/1/2/t_conc_1166002',
      bibleHubCommentaries: 'https://biblehub.com/commentaries/3_john/1-2.htm',
      bibleHubParallel: 'https://biblehub.com/parallel/3_john/1-2.htm',
      stepBible: 'https://www.stepbible.org/?q=version=ESV|reference=3John.1.2',
    });
  });

  it('lists the NET Bible’s notes first', () => {
    expect(studyLinks({ book: 'Gen', chapter: 1, verse: 1 })[0]?.site).toBe('net');
  });

  it('numbers Blue Letter Bible verses from Genesis 1 to Revelation 22', () => {
    expect(urls({ book: 'Gen', chapter: 1, verse: 1 })['blueLetterBible']).toBe(
      'https://www.blueletterbible.org/kjv/gen/1/1/t_conc_1001',
    );
    expect(urls({ book: 'Rev', chapter: 22, verse: 21 })['blueLetterBible']).toBe(
      'https://www.blueletterbible.org/kjv/rev/22/21/t_conc_1189021',
    );
  });
});

describe('studyLinks for a chapter', () => {
  it('links Romans 8', () => {
    expect(urls({ book: 'Rom', chapter: 8 })).toEqual({
      net: 'https://netbible.org/bible/Romans+8',
      blueLetterBible: 'https://www.blueletterbible.org/kjv/rom/8/1/',
      bibleHubChapter: 'https://biblehub.com/romans/8.htm',
      stepBible: 'https://www.stepbible.org/?q=version=ESV|reference=Rom.8',
    });
  });

  it('lists the NET Bible’s notes first', () => {
    expect(studyLinks({ book: 'Song', chapter: 2 })[0]).toEqual({
      site: 'net',
      url: 'https://netbible.org/bible/Song+2',
    });
  });
});

/**
 * Every book's name on every site, as checked against each site on 2026-10-19: a page per book,
 * which landed on that book and chapter. A renamed book in `books.ts` would quietly break a link,
 * so the whole list is held here.
 */
describe('each site’s name for every book', () => {
  const NET =
    'Genesis Exodus Leviticus Numbers Deuteronomy Joshua Judges Ruth 1+Samuel 2+Samuel 1+Kings ' +
    '2+Kings 1+Chronicles 2+Chronicles Ezra Nehemiah Esther Job Psalms Proverbs Ecclesiastes Song ' +
    'Isaiah Jeremiah Lamentations Ezekiel Daniel Hosea Joel Amos Obadiah Jonah Micah Nahum ' +
    'Habakkuk Zephaniah Haggai Zechariah Malachi Matthew Mark Luke John Acts Romans ' +
    '1+Corinthians 2+Corinthians Galatians Ephesians Philippians Colossians 1+Thessalonians ' +
    '2+Thessalonians 1+Timothy 2+Timothy Titus Philemon Hebrews James 1+Peter 2+Peter 1+John ' +
    '2+John 3+John Jude Revelation';
  const BLUE_LETTER_BIBLE =
    'gen exo lev num deu jos jdg rth 1sa 2sa 1ki 2ki 1ch 2ch ezr neh est job psa pro ecc sng isa ' +
    'jer lam eze dan hos joe amo oba jon mic nah hab zep hag zec mal mat mar luk jhn act rom 1co ' +
    '2co gal eph phl col 1th 2th 1ti 2ti tit phm heb jas 1pe 2pe 1jo 2jo 3jo jde rev';
  const BIBLE_HUB =
    'genesis exodus leviticus numbers deuteronomy joshua judges ruth 1_samuel 2_samuel 1_kings ' +
    '2_kings 1_chronicles 2_chronicles ezra nehemiah esther job psalms proverbs ecclesiastes songs ' +
    'isaiah jeremiah lamentations ezekiel daniel hosea joel amos obadiah jonah micah nahum ' +
    'habakkuk zephaniah haggai zechariah malachi matthew mark luke john acts romans ' +
    '1_corinthians 2_corinthians galatians ephesians philippians colossians 1_thessalonians ' +
    '2_thessalonians 1_timothy 2_timothy titus philemon hebrews james 1_peter 2_peter 1_john ' +
    '2_john 3_john jude revelation';

  const chapterLinks = BOOKS.map((book) => urls({ book: book.id, chapter: 1 }));
  const pick = (site: string, pattern: RegExp) =>
    chapterLinks.map((links) => pattern.exec(links[site] ?? '')?.[1]).join(' ');

  it('names them for the NET Bible', () => {
    expect(pick('net', /bible\/(.+)\+1$/)).toBe(NET);
  });

  it('names them for Blue Letter Bible', () => {
    expect(pick('blueLetterBible', /kjv\/([^/]+)\//)).toBe(BLUE_LETTER_BIBLE);
  });

  it('names them for BibleHub', () => {
    expect(pick('bibleHubChapter', /biblehub\.com\/([^/]+)\//)).toBe(BIBLE_HUB);
  });

  it('gives STEPBible this app’s own OSIS IDs', () => {
    expect(pick('stepBible', /reference=([^.]+)\./)).toBe(BOOKS.map((book) => book.id).join(' '));
  });
});
