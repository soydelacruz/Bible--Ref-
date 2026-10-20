import { describe, expect, it } from 'vitest';
import { CANONICAL_VERSIFICATION } from '../../../src/core/bible/versification.ts';
import { getNoteSourceManifest } from '../../../src/notes/registry.ts';
import { PROVENANCE, verseIndex } from '../../../src/test-utils/fixtures.ts';
import {
  importNetNotes,
  parseNetNote,
  readNetNoteRecords,
  resolveNetReference,
  splitNetNotes,
  type NetNoteRecord,
} from './netbible-notes.ts';

const V = CANONICAL_VERSIFICATION;

/** A note as netbible.org serves it, with its number and its body. */
function note(number: number, body: string): string {
  return (
    `<div class="note"><sup><span class="noteNoteSuper" id="note_${String(number)}">` +
    `${String(number)}</span>&nbsp;</sup>${body}</div>`
  );
}

const parse = (body: string) => parseNetNote(note(1, body), V);

describe('splitNetNotes', () => {
  it('splits a book of notes by their numbers', () => {
    const notes = splitNetNotes(`${note(1, 'a')}\n${note(2, 'b')}`);
    expect([...notes.keys()]).toEqual([1, 2]);
    expect(notes.get(2)).toContain('b</div>');
  });

  it('refuses a note given twice, one with no number, and text outside the notes', () => {
    expect(() => splitNetNotes(note(1, 'a') + note(1, 'b'))).toThrow(/appears twice/);
    expect(() => splitNetNotes('<div class="note">no number</div>')).toThrow(/has no number/);
    expect(() => splitNetNotes(`${note(1, 'a')} stray words`)).toThrow(/outside any note/);
  });
});

describe('resolveNetReference', () => {
  const range = (first: number, last: number) => [first, last];

  it('resolves a verse, a range in a chapter and one across chapters', () => {
    const gen11 = verseIndex('Gen', 1, 1);
    expect(resolveNetReference('Bible:Ge 1:1', V)).toEqual(range(gen11, gen11));
    expect(resolveNetReference('Bible:Ge 1:3-31', V)).toEqual(
      range(verseIndex('Gen', 1, 3), verseIndex('Gen', 1, 31)),
    );
    expect(resolveNetReference('Bible:Ge 1:1-2:3', V)).toEqual(
      range(gen11, verseIndex('Gen', 2, 3)),
    );
  });

  it('resolves whole chapters, and a chapter to a verse of a later one', () => {
    expect(resolveNetReference('Bible:Ps 23', V)).toEqual(
      range(verseIndex('Ps', 23, 1), verseIndex('Ps', 23, 6)),
    );
    expect(resolveNetReference('Bible:Ps 23-24', V)).toEqual(
      range(verseIndex('Ps', 23, 1), verseIndex('Ps', 24, 10)),
    );
    expect(resolveNetReference('Bible:Ps 23-24:2', V)).toEqual(
      range(verseIndex('Ps', 23, 1), verseIndex('Ps', 24, 2)),
    );
  });

  it('reads a book of one chapter by verse, as the NET cites Jude', () => {
    expect(resolveNetReference('Bible:Jud 14', V)).toEqual(
      range(verseIndex('Jude', 1, 14), verseIndex('Jude', 1, 14)),
    );
    expect(resolveNetReference('Bible:Phm 9-10', V)).toEqual(
      range(verseIndex('Phlm', 1, 9), verseIndex('Phlm', 1, 10)),
    );
    expect(resolveNetReference('Bible:Jude 14-1:2', V)).toBeNull();
  });

  it('leaves unlinked what would land on the wrong verse, or on none', () => {
    // The Hebrew and Greek numberings, the Apocrypha, a verse the KJV lacks, a backward range.
    expect(resolveNetReference('BibleBHS:Ps 51:3', V)).toBeNull();
    expect(resolveNetReference('BibleLXX:Ps 43:23', V)).toBeNull();
    expect(resolveNetReference('Bible:Sir 1:1', V)).toBeNull();
    expect(resolveNetReference('Bible:Ge 1:40', V)).toBeNull();
    expect(resolveNetReference('Bible:Ge 2:3-1', V)).toBeNull();
  });
});

describe('parseNetNote', () => {
  it('reads each part under its kind', () => {
    const { parts } = parse(
      '<span class="notetype">tn</span>  Or “sky.”<p class="note"><span class="notetype">sn</span> ' +
        'The heavens.</p><p class="note"><span class="notetype">tc</span> MT reads.</p>' +
        '<p class="note"><span class="notetype">map</span> For location see ' +
        '<a class="mapLink" href="javascript:{};" data-map="map1">Map1-A1</a>.</p>',
    );
    expect(parts).toEqual([
      { kind: 'translation', text: ['Or “sky.”'] },
      { kind: 'study', text: ['The heavens.'] },
      { kind: 'text-critical', text: ['MT reads.'] },
      { kind: 'map', text: ['For location see Map1-A1.'] },
    ]);
  });

  it('keeps styles as a structure, never as markup', () => {
    const { parts } = parse(
      '<span class="notetype">tn</span> <i>In</i> <b>the</b> <span class="smcaps">Lord</span>: ' +
        '<span class="hebrew">אֱלֹהִים</span> (<span class="translit">ʾelohim</span>), ' +
        '<span class="greek">λόγος</span>, <span class="Apparatus">P</span><sup>46</sup> ' +
        '<span class="uncial">autois</span> <span class="sup">e</span>',
    );
    expect(parts[0]?.text).toEqual([
      { style: 'italic', text: ['In'] },
      ' ',
      { style: 'bold', text: ['the'] },
      ' ',
      { style: 'smallCaps', text: ['Lord'] },
      ': ',
      { style: 'hebrew', text: ['אֱלֹהִים'] },
      ' (',
      { style: 'transliteration', text: ['ʾelohim'] },
      '), ',
      { style: 'greek', text: ['λόγος'] },
      ', ',
      { style: 'manuscript', text: ['P'] },
      { style: 'superscript', text: ['46'] },
      ' ',
      { style: 'manuscript', text: ['autois'] },
      ' ',
      { style: 'superscript', text: ['e'] },
    ]);
  });

  it('cites the passages it can resolve, and lists the ones it leaves as text', () => {
    const { parts, unlinked } = parse(
      '<span class="notetype">sn</span> See v. <data ref="Bible:Ge 1:2">2</data> and ' +
        '<data ref="BibleBHS:Ps 51:3">Ps 51:3 HT</data>.',
    );
    const gen12 = verseIndex('Gen', 1, 2);
    expect(parts[0]?.text).toEqual([
      'See v. ',
      { passage: [gen12, gen12], text: ['2'] },
      ' and Ps 51:3 HT.',
    ]);
    expect(unlinked).toEqual(['BibleBHS:Ps 51:3']);
  });

  it('collapses whitespace across tags and keeps line breaks', () => {
    const { parts } = parse(
      '<span class="notetype">tn</span>   Line  one, <i> set </i> apart<br/> line two &amp; ' +
        '&#8220;three&#x201D;<br>  ',
    );
    expect(parts[0]?.text).toEqual([
      'Line one, ',
      { style: 'italic', text: ['set '] },
      'apart\nline two & “three”',
    ]);
  });

  it('reads the slips the NET’s HTML has: escaped quotes, empty types, a stray </span>', () => {
    expect(
      parse('<span class="notetype">sn</span> The <span class=&quot;smcaps&quot;>Lord</span>.')
        .parts[0]?.text,
    ).toEqual(['The ', { style: 'smallCaps', text: ['Lord'] }, '.']);
    expect(
      parse(
        '<span class="notetype"></span> <p class="note"><span class="notetype">sn</span> Text.' +
          '</p><p class="note"><span class="notetype"></span>  </p>',
      ).parts,
    ).toEqual([{ kind: 'study', text: ['Text.'] }]);
    expect(
      parse('<span class="notetype">tc</span> (<span class="translit">a</span></span>) b').parts[0]
        ?.text,
    ).toEqual(['(', { style: 'transliteration', text: ['a'] }, ') b']);
  });

  it('keeps the words of a span that only sets a font size, and drops empty styles', () => {
    expect(
      parse(
        '<span class="notetype">sn</span> <span style="font-size: 15px;">a tunic</span><i></i>.',
      ).parts[0]?.text,
    ).toEqual(['a tunic.']);
  });

  it('refuses anything it has not been taught', () => {
    expect(() => parse('<span class="notetype">tn</span> <script>x</script>')).toThrow(
      /unexpected markup/,
    );
    expect(() => parse('<span class="notetype">xx</span> a')).toThrow(/unknown note type "xx"/);
    expect(() => parse('<span class="notetype">tn</span> &bogus;')).toThrow(/character reference/);
    expect(() => parse('<span class="notetype">tn</span> <i><b>a</i></b>')).toThrow(/closes <b>/);
    expect(() => parse('<span class="notetype">tn</span> <i>open')).toThrow(/not closed/);
    expect(() => parse('words before any kind')).toThrow(/before the note's kind/);
    expect(() => parse('<span class="notetype">tn</span>  ')).toThrow(/no text/);
    expect(() => parse('<span class="notetype">tn</span> <data>2</data>')).toThrow(/no reference/);
    expect(() => parseNetNote('<p>not a note</p>', V)).toThrow(/not a note/);
  });
});

const GEN_NOTE: NetNoteRecord = {
  book: 'Gen',
  number: 2,
  verse: 'Gen.1.1',
  at: 16,
  html: note(
    2,
    '<span class="notetype">tn</span> Or “God.” See <data ref="Bible:Sir 1:1">Sir 1:1</data>.',
  ),
};

describe('readNetNoteRecords', () => {
  it('reads one record a line, skipping blank lines', () => {
    expect(readNetNoteRecords(`${JSON.stringify(GEN_NOTE)}\n\n`)).toEqual([GEN_NOTE]);
  });

  it('refuses a line that is not a note record', () => {
    expect(() => readNetNoteRecords(JSON.stringify({ ...GEN_NOTE, book: 'Enoch' }))).toThrow(
      /line 1 is not a note record/,
    );
  });
});

describe('importNetNotes', () => {
  const verses = Array.from({ length: V.verseCount }, () => 'In the beginning God created.');
  const options = {
    manifest: getNoteSourceManifest('net'),
    provenance: PROVENANCE,
    verses,
    versification: V,
  };
  const first = {
    ...GEN_NOTE,
    number: 1,
    at: 3,
    html: note(1, '<span class="notetype">sn</span> In.'),
  };

  it('writes a file for every book, its notes in reading order', () => {
    const files = importNetNotes([GEN_NOTE, first], options);
    expect(files.size).toBe(66);
    const genesis = files.get('Gen');
    expect(genesis?.notes.map((n) => n.number)).toEqual([1, 2]);
    expect(genesis?.notes[1]).toMatchObject({ verse: 0, at: 16 });
    expect(genesis?.attribution).toContain('Biblical Studies Press');
    expect(genesis?.translationId).toBe('net');
    expect(genesis?.notices.map((n) => n.message)).toEqual([
      'Parts of notes: study',
      'Parts of notes: translation',
      expect.stringContaining('References left as text'),
    ]);
    expect(files.get('Rev')?.notes).toEqual([]);
    expect(files.get('Rev')?.notices).toEqual([]);
  });

  it('refuses a note marked outside its book, or past the end of its verse', () => {
    expect(() => importNetNotes([{ ...GEN_NOTE, verse: 'Exod.1.1' }], options)).toThrow(
      /outside its book/,
    );
    expect(() => importNetNotes([{ ...GEN_NOTE, verse: 'Gen.1.99' }], options)).toThrow(
      /outside its book/,
    );
    expect(() => importNetNotes([{ ...GEN_NOTE, at: 999 }], options)).toThrow(
      /outside the text of Gen.1.1/,
    );
  });
});
