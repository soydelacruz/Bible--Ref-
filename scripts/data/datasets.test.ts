import { strToU8, zipSync } from 'fflate';
import { describe, expect, it } from 'vitest';
import { parseOsisId } from '../../src/core/bible/verse-ref.ts';
import { CANONICAL_VERSIFICATION } from '../../src/core/bible/versification.ts';
import { DATASET_BUILDERS, type RawSourceContent } from './datasets.ts';
import { BOOK_CODES as KJV_CODES } from './importers/ebible-vpl.ts';
import { expectMember, readSources, type RawSource } from './lib/sources.ts';

/** The archive entry each zipped source pins, mirroring `data/sources.json`. */
const MEMBERS: Readonly<Record<string, string>> = {
  kjv: 'eng-kjv2006_vpl.txt',
  web: 'engwebp_vpl.txt',
  asv: 'eng-asv_vpl.txt',
  ylt: 'engylt_vpl.txt',
  rv1909: 'spaRV1909_vpl.txt',
};

function source(id: string): RawSource {
  const member = MEMBERS[id];
  return {
    id,
    description: id,
    url: `https://example.org/${id}`,
    fileName: `${id}.txt`,
    sha256: 'a'.repeat(64),
    ...(member === undefined ? {} : { member }),
    retrievedAt: '2026-01-01',
    license: 'CC BY 4.0',
    homepage: 'https://example.org/',
  };
}

/** One line per verse of the whole canon, which is what every importer insists on. */
function everyVerse(render: (index: number) => string): string {
  return Array.from({ length: CANONICAL_VERSIFICATION.verseCount }, (_, index) =>
    render(index),
  ).join('\n');
}

const BSB = everyVerse((index) => {
  const ref = CANONICAL_VERSIFICATION.refAt(index);
  const book = CANONICAL_VERSIFICATION.bookAt(index);
  return `${book.name} ${String(ref.chapter)}:${String(ref.verse)}\tVerse ${String(index)}.`;
});

const KJV = everyVerse((index) => {
  const ref = CANONICAL_VERSIFICATION.refAt(index);
  const code = KJV_CODES[CANONICAL_VERSIFICATION.bookAt(index).ordinal] ?? 'GEN';
  return `${code} ${String(ref.chapter)}:${String(ref.verse)} Verse ${String(index)}`;
});

/**
 * The World English Bible as eBible.org numbers it: the doxology closes Romans 14 as 14:24–26, and
 * 16:25 is left blank where it was moved from.
 */
const WEB = KJV.split('\n')
  .filter((line) => !/^ROM 16:2[67] /.test(line))
  .map((line) => (line.startsWith('ROM 16:25 ') ? 'ROM 16:25 ' : line))
  .flatMap((line) =>
    line.startsWith('ROM 14:23 ')
      ? [line, 'ROM 14:24 Now to him', 'ROM 14:25 but now', 'ROM 14:26 to the only wise God']
      : [line],
  )
  .join('\n');

const CONTENT: Readonly<Record<string, string | Uint8Array>> = {
  bsb: `The Holy Bible, Berean Standard Bible\nVerse\tBerean Standard Bible\n${BSB}`,
  kjv: zipSync({ 'eng-kjv2006_vpl.txt': strToU8(KJV) }),
  web: zipSync({ 'engwebp_vpl.txt': strToU8(WEB) }),
  asv: zipSync({ 'eng-asv_vpl.txt': strToU8(KJV) }),
  ylt: zipSync({ 'engylt_vpl.txt': strToU8(KJV) }),
  // Its own text, in its own entry: a builder that reached for the wrong archive, or the wrong
  // name inside one, would otherwise pass by looking like the KJV's.
  blivre: zipSync({
    'bliv-tr_vpl.txt': strToU8(
      everyVerse((index) => {
        const ref = CANONICAL_VERSIFICATION.refAt(index);
        const code = KJV_CODES[CANONICAL_VERSIFICATION.bookAt(index).ordinal] ?? 'GEN';
        return `${code} ${String(ref.chapter)}:${String(ref.verse)} Versículo ${String(index)}.`;
      }),
    ),
  }),
  rv1909: zipSync({
    'spaRV1909_vpl.txt': strToU8(
      everyVerse((index) => {
        const ref = CANONICAL_VERSIFICATION.refAt(index);
        const code = KJV_CODES[CANONICAL_VERSIFICATION.bookAt(index).ordinal] ?? 'GEN';
        return `${code} ${String(ref.chapter)}:${String(ref.verse)} Versículo ${String(index)}.`;
      }),
    ),
  }),
  openbible: zipSync({
    'cross_references.txt': strToU8(
      'From Verse\tTo Verse\tVotes\t# CC-BY 2026-01-01\nGen.1.1\tJohn.1.1\t5',
    ),
  }),
  'stepbible-tagnt-mat-jhn': 'Mat.1.1#01=NKO\tx\ty\tG0976=N-NSF\tz',
  'stepbible-tagnt-act-rev': '',
  'stepbible-tahot-gen-deu': 'Gen.1.1#01=L\tx\ty\tz\t{H7225G}\tHNcfsa',
  'stepbible-tahot-jos-est': '',
  'stepbible-tahot-job-sng': '',
  'stepbible-tahot-isa-mal': '',
  'stepbible-tbesg': ['G0976', 'G0976 =', 'G0976', 'βίβλος', 'biblos', 'G:N-F', 'book', ''].join(
    '\t',
  ),
  'stepbible-tbesh': [
    'H7225',
    'H7225G =',
    'H7225G',
    'רֵאשִׁית',
    're.Shit',
    'N:N-F',
    'beginning',
    '',
  ].join('\t'),
};

const readSource = (id: string): Promise<RawSourceContent> => {
  const content = CONTENT[id];
  if (content === undefined) {
    throw new Error(`The test has no content for "${id}".`);
  }
  return Promise.resolve({
    source: source(id),
    content: Buffer.from(typeof content === 'string' ? strToU8(content) : content),
  });
};

describe('DATASET_BUILDERS', () => {
  it('has one builder per dataset the app loads', () => {
    expect(DATASET_BUILDERS.map((builder) => builder.outputPath)).toEqual([
      'data/translations/bsb.json',
      'data/translations/kjv.json',
      'data/translations/web.json',
      'data/translations/asv.json',
      'data/translations/ylt.json',
      'data/translations/blivre.json',
      'data/translations/rv1909.json',
      'data/cross-references/openbible.json',
      'data/words/stepbible.json',
    ]);
  });

  it('writes every dataset under public/data', () => {
    for (const builder of DATASET_BUILDERS) {
      expect(builder.outputPath.startsWith('data/')).toBe(true);
      expect(builder.outputPath.endsWith('.json')).toBe(true);
    }
  });

  it.each(DATASET_BUILDERS.map((b) => [b.outputPath, b] as const))(
    'builds %s from its pinned sources',
    async (_path, builder) => {
      const dataset = await builder.build(readSource);
      expect(dataset.versification).toBe('kjv');
      expect(dataset.schemaVersion).toBe(1);
      expect(dataset.provenance.sha256).toHaveLength(64);
      expect(dataset.provenance.url).toContain('https://example.org/');
      expect(Array.isArray(dataset.notices)).toBe(true);
    },
  );

  it('reads the World English Bible into the KJV numbering', async () => {
    const web = DATASET_BUILDERS.find((b) => b.outputPath.endsWith('/web.json'));
    const dataset = await web?.build(readSource);
    if (dataset?.format !== 'translation-text') {
      throw new Error('Expected the WEB dataset.');
    }
    const at = (osisId: string) => {
      const ref = parseOsisId(osisId);
      const index = ref && CANONICAL_VERSIFICATION.indexOf(ref);
      return index === undefined ? undefined : dataset.verses[index];
    };
    expect(at('Rom.16.25')).toBe('Now to him');
    expect(at('Rom.16.27')).toBe('to the only wise God');
    expect(dataset.notices).toEqual([]);
  });

  it('passes the words builder its licence and credit, from one place', async () => {
    const words = DATASET_BUILDERS.find((b) => b.outputPath.includes('words'));
    const dataset = await words?.build(readSource);
    if (dataset?.format !== 'original-words') {
      throw new Error('Expected the words dataset.');
    }
    expect(dataset.license).toEqual({
      name: 'CC BY 4.0',
      url: 'https://creativecommons.org/licenses/by/4.0/',
    });
    expect(dataset.attribution).toContain('STEP Bible');
  });
});

describe('the pins and the importers', () => {
  it('agree on which entry of an archive is read', async () => {
    // A pin covers one file. If a builder reaches for a different entry than the pin names, the
    // scripture it ships is never checked against anything — and nothing would say so.
    const sources = await readSources();
    for (const source of sources) {
      if (source.member === undefined) {
        continue;
      }
      expect(expectMember(source), source.id).toBe(source.member);
      expect(source.fileName.endsWith('.zip'), `${source.id} pins an entry of a ZIP`).toBe(true);
    }
  });

  it('names an entry for the KJV, whose archive carries four files it does not read', () => {
    expect(MEMBERS['kjv']).toBe('eng-kjv2006_vpl.txt');
  });
});
