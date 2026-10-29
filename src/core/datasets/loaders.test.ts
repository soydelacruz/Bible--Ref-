import { afterEach, describe, expect, it, vi } from 'vitest';
import { loadCrossReferences } from '../../cross-references/load-cross-references.ts';
import { CROSS_REFERENCE_SOURCE_MANIFESTS } from '../../cross-references/registry.ts';
import { loadTranslation } from '../../translations/load-translation.ts';
import { getTranslationManifest } from '../../translations/registry.ts';
import { loadOriginalWords } from '../../words/load-original-words.ts';
import { getWordSourceManifest } from '../../words/registry.ts';
import {
  createCrossReferencesFile,
  createTranslationFile,
  PROVENANCE,
  verseIndex,
} from '../../test-utils/fixtures.ts';
import { CANONICAL_VERSIFICATION } from '../bible/versification.ts';
import { encodeCrossReferences } from './cross-references-binary.ts';
import { translationDatasetPath } from './paths.ts';

const GEN_1_1 = verseIndex('Gen', 1, 1);
const GEN_1_2 = verseIndex('Gen', 1, 2);

/** Answers every fetch with this body, and reports what was asked for. */
function serveBody(body: string | Uint8Array<ArrayBuffer>) {
  const fetch = vi.fn<(input: string | URL) => Promise<Response>>(() =>
    Promise.resolve(
      new Response(body, {
        status: 200,
        headers: { 'content-type': 'text/plain' },
      }),
    ),
  );
  vi.stubGlobal('fetch', fetch);
  return fetch;
}

/** Answers every fetch with this file, as JSON. */
function serve(file: unknown) {
  return serveBody(JSON.stringify(file));
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('loadTranslation', () => {
  it('builds a translation from its file, and times the work', async () => {
    const fetch = serve(createTranslationFile(new Map([[GEN_1_1, 'In the beginning']])));
    const { translation, report } = await loadTranslation(getTranslationManifest('bsb'));
    expect(translation.verseText(GEN_1_1)).toBe('In the beginning');
    expect(String(fetch.mock.calls[0]?.[0])).toContain(translationDatasetPath('bsb'));
    expect(report.processMs).toBeGreaterThanOrEqual(0);
    expect(report.bytes).toBeGreaterThan(0);
  });

  it('refuses a file that belongs to another translation', async () => {
    serve({ ...createTranslationFile(), translationId: 'kjv' });
    await expect(loadTranslation(getTranslationManifest('bsb'))).rejects.toThrow(/bsb/);
  });
});

describe('loadCrossReferences', () => {
  const [manifest] = CROSS_REFERENCE_SOURCE_MANIFESTS;
  const file = createCrossReferencesFile([{ from: GEN_1_1, to: GEN_1_2, votes: 5 }]);

  it('indexes the links it downloads', async () => {
    if (!manifest) {
      throw new Error('Expected a cross-reference source.');
    }
    serveBody(encodeCrossReferences(file));
    const { dataset, report } = await loadCrossReferences(manifest);
    expect(dataset.index.outgoing(GEN_1_1)).toHaveLength(1);
    expect(dataset.sourceRowCount).toBe(1);
    expect(dataset.provenance).toEqual(PROVENANCE);
    expect(dataset.index.verseCount).toBe(CANONICAL_VERSIFICATION.verseCount);
    expect(report.path).toContain(manifest.id);
  });

  it('refuses the JSON an earlier release served', async () => {
    if (!manifest) {
      throw new Error('Expected a cross-reference source.');
    }
    serve(file);
    await expect(loadCrossReferences(manifest)).rejects.toThrow(
      'expected the binary cross-reference format, got JSON',
    );
  });
});

describe('loadOriginalWords', () => {
  const manifest = getWordSourceManifest('stepbible');

  it('indexes the words it downloads', async () => {
    serve({
      format: 'original-words',
      schemaVersion: 1,
      versification: 'kjv',
      provenance: PROVENANCE,
      notices: [],
      sourceId: 'stepbible',
      license: { name: 'CC BY 4.0', url: 'https://creativecommons.org/licenses/by/4.0/' },
      attribution: 'Original-language words: STEP Bible (CC BY 4.0).',
      maxVerses: 100,
      words: {
        strongs: ['H7225G'],
        lemma: ['רֵאשִׁית'],
        transliteration: ['reshit'],
        gloss: ['beginning'],
        offsets: [0, 1],
        verses: [GEN_1_1],
      },
    });
    const { dataset } = await loadOriginalWords(manifest);
    expect(dataset.maxVerses).toBe(100);
    expect(dataset.index.wordsOf(GEN_1_1).map((word) => word.strongs)).toEqual(['H7225G']);
  });

  it('refuses a file whose verses are outside the versification', async () => {
    serve({
      format: 'original-words',
      schemaVersion: 1,
      versification: 'kjv',
      provenance: PROVENANCE,
      notices: [],
      sourceId: 'stepbible',
      license: { name: 'CC BY 4.0', url: 'https://creativecommons.org/licenses/by/4.0/' },
      attribution: 'Original-language words: STEP Bible (CC BY 4.0).',
      maxVerses: 100,
      words: {
        strongs: ['H7225G'],
        lemma: ['x'],
        transliteration: ['x'],
        gloss: ['x'],
        offsets: [0, 1],
        verses: [999_999],
      },
    });
    await expect(loadOriginalWords(manifest)).rejects.toThrow();
  });
});
