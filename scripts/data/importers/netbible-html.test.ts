import { describe, expect, it } from 'vitest';
import { toOsisId } from '../../../src/core/bible/verse-ref.ts';
import { CANONICAL_VERSIFICATION } from '../../../src/core/bible/versification.ts';
import {
  NET_OMITTED_VERSES,
  netBookFromHtml,
  netBookId,
  netVerseLines,
  netVersesFromHtml,
} from './netbible-html.ts';

/** A verse marker as netbible.org writes it. */
function verse(book: string, chapter: number, number: number): string {
  const id = `${book.replace(/ /g, '_')}_${String(chapter)}_${String(number)}`;
  return (
    `<span id="netText_${id}" alt="${id}" class="netVerse ">` +
    `<span class="vref"><span class="verseNumber">${String(number)}</span></span> `
  );
}

const NOTE = '<sup> <a href="#" class="netNoteSuper" pos="1">219</a>&nbsp;</sup>';

describe('netVersesFromHtml', () => {
  it('reads a verse without its number, note markers or word tags', () => {
    const html =
      `<p class="bodytext"> ${verse('John', 3, 16)}<st data-num="1063">For</st> ` +
      `<st data-num="3779">this is the way</st>${NOTE} God loved the world.</span></p>`;
    expect(netVersesFromHtml(html).get('John.3.16')).toBe(
      'For this is the way God loved the world.',
    );
  });

  it('writes the divine name in small capitals as capitals', () => {
    const html = `${verse('Genesis', 2, 4)}when the <span class="smcaps"><st>Lord</st></span> God`;
    expect(netVersesFromHtml(html).get('Gen.2.4')).toBe('when the LORD God');
  });

  it('reads the escaped small-capitals class some spans carry', () => {
    const html = `${verse('Psalms', 23, 1)}The <span class=&quot;smcaps&quot;>Lord</span> is`;
    expect(netVersesFromHtml(html).get('Ps.23.1')).toBe('The LORD is');
  });

  it('joins a verse set over several poetic lines, even when its spans are left open', () => {
    const html =
      `<p class="poetry"> ${verse('Genesis', 1, 27)}God created humankind${NOTE} in his image, ` +
      `<p class="poetry"> <span id="netText_Genesis_1_27" class="netVerse ">male and female ` +
      'he created them.</span></p>';
    expect(netVersesFromHtml(html).get('Gen.1.27')).toBe(
      'God created humankind in his image, male and female he created them.',
    );
  });

  it('leaves out section headings, acrostic letters and the speakers of the Song of Songs', () => {
    const html =
      `<div class="paragraphtitle"><h3>The Prophet Speaks${NOTE}</h3></div>` +
      `<p class="lamhebrew"> ${verse('Lamentations', 1, 1)}<b><span class="hebrew">א</span></b> ` +
      '(<i>Alef</i>)</p><p class="poetry">Alas! The city sits alone!</p>' +
      `<p class="sosspeaker"> ${verse('Song of Songs', 1, 2)}<b><i>The Beloved:</i></b></p>` +
      '<p class="poetry">Oh, how I wish you would kiss me!</p>';
    const verses = netVersesFromHtml(html);
    expect(verses.get('Lam.1.1')).toBe('Alas! The city sits alone!');
    expect(verses.get('Song.1.2')).toBe('Oh, how I wish you would kiss me!');
  });

  it('keeps bold quotations inside a verse, and sets punctuation against its words', () => {
    const html = `${verse('1 Corinthians', 1, 19)}it is written, “<i><b>I will destroy</b></i>” wisely ,<br>truly.`;
    expect(netVersesFromHtml(html).get('1Cor.1.19')).toBe(
      'it is written, “I will destroy” wisely, truly.',
    );
  });

  it('decodes character references', () => {
    const html = `${verse('Mark', 1, 1)}&quot;a&quot; &amp; &#8220;b&#x201D; &copy;`;
    expect(netVersesFromHtml(html).get('Mark.1.1')).toBe('"a" & “b” &copy;');
  });

  it('ignores text before the first verse', () => {
    expect(netVersesFromHtml('<h3>Psalm 3</h3> nothing yet').size).toBe(0);
  });
});

/** A note marker as netbible.org writes it into the text. */
const marker = (number: number) =>
  `<sup> <a href="#" class="netNoteSuper" pos="1">${String(number)}</a>&nbsp;</sup>`;

describe('netBookFromHtml', () => {
  it('places each note after the words its marker follows', () => {
    const { verses, notes } = netBookFromHtml(
      `${verse('Genesis', 1, 1)}In the beginning${marker(1)} God${marker(2)} created.${marker(3)}`,
    );
    expect(verses.get('Gen.1.1')).toBe('In the beginning God created.');
    expect(notes.get(1)).toEqual({ verse: 'Gen.1.1', at: 16 });
    expect(notes.get(2)).toEqual({ verse: 'Gen.1.1', at: 20 });
    expect(notes.get(3)).toEqual({ verse: 'Gen.1.1', at: 29 });
  });

  it('keeps a marker in its place where the text around it is tidied', () => {
    const { verses, notes } = netBookFromHtml(
      `${verse('Mark', 1, 1)}word ${marker(1)}, then ( ${marker(2)}aside)`,
    );
    expect(verses.get('Mark.1.1')).toBe('word, then (aside)');
    expect(notes.get(1)?.at).toBe(4);
    expect(notes.get(2)?.at).toBe(12);
  });

  it('puts a marker in a heading, or before the text, at the start of the verse that follows', () => {
    const { notes } = netBookFromHtml(
      `<h3>Psalm 3${marker(1)}</h3>${verse('Psalms', 3, 1)}Text.` +
        `<div class="paragraphtitle">A heading${marker(2)}</div>${verse('Psalms', 3, 2)}Next.`,
    );
    expect(notes.get(1)).toEqual({ verse: 'Ps.3.1', at: 0 });
    expect(notes.get(2)).toEqual({ verse: 'Ps.3.2', at: 0 });
  });

  it('refuses a note marked twice, a marker with no number, and one after the last verse', () => {
    const start = verse('Mark', 1, 1);
    expect(() => netBookFromHtml(`${start}a${marker(1)} b${marker(1)}`)).toThrow(
      /marked more than once/,
    );
    expect(() => netBookFromHtml(`${start}a<sup><a class="netNoteSuper"> </a></sup>`)).toThrow(
      /has no number/,
    );
    expect(() =>
      netBookFromHtml(`${start}a<div class="paragraphtitle">End${marker(9)}</div>`),
    ).toThrow(/after the last verse/);
  });
});

describe('netBookId', () => {
  it('maps netbible.org book names, the Song of Songs included', () => {
    expect(netBookId('1 Corinthians')).toBe('1Cor');
    expect(netBookId('Song of Songs')).toBe('Song');
  });

  it('refuses a name it does not know', () => {
    expect(() => netBookId('Hezekiah')).toThrow(/unknown book/);
  });
});

describe('netVerseLines', () => {
  /** Text for every verse of the KJV versification but those the NET leaves out. */
  const whole = new Map(
    Array.from({ length: CANONICAL_VERSIFICATION.verseCount }, (_, index) =>
      toOsisId(CANONICAL_VERSIFICATION.refAt(index)),
    )
      .filter((id) => !NET_OMITTED_VERSES.has(id))
      .map((id) => [id, `Text of ${id}.`]),
  );
  const lines = netVerseLines(whole).split('\n');

  it('writes every verse of the KJV versification, in eBible verse-per-line form', () => {
    expect(lines).toHaveLength(31_102 + 1);
    expect(lines[0]).toBe('GEN 1:1 Text of Gen.1.1.');
    expect(lines.at(-1)).toBe('');
  });

  it('writes a verse the NET leaves out with no text', () => {
    expect(lines).toContain('ACT 24:7');
    expect(lines.filter((line) => /^\S+ \d+:\d+$/.test(line))).toHaveLength(17);
  });

  it('refuses a verse with no text that the NET does not leave out', () => {
    const lost = new Map(whole);
    lost.delete('Gen.1.2');
    lost.set('Gen.1.3', '');
    expect(() => netVerseLines(lost)).toThrow(/no text for 2 verses .* Gen\.1\.2, Gen\.1\.3/);
  });

  it('refuses a verse outside the KJV versification', () => {
    expect(() => netVerseLines(new Map([...whole, ['Gen.1.99', 'x']]))).toThrow(/outside the KJV/);
  });
});
