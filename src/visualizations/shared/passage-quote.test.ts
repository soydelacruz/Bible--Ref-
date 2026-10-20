import { describe, expect, it } from 'vitest';
import { CANONICAL_VERSIFICATION } from '../../core/bible/versification.ts';
import { verseIndex, createTranslationFile } from '../../test-utils/fixtures.ts';
import { getTranslationManifest } from '../../translations/registry.ts';
import { Translation } from '../../translations/translation.ts';
import { quotePassage } from './passage-quote.ts';
import { enBooks } from '../../i18n/books/en.ts';

const GEN_1_31 = verseIndex('Gen', 1, 31);
const GEN_2_1 = verseIndex('Gen', 2, 1);
const GEN_2_2 = verseIndex('Gen', 2, 2);
const MATT_17_21 = verseIndex('Matt', 17, 21);
const URL = 'https://example.org/site/?ref=Gen.1.31';

const translation = new Translation(
  getTranslationManifest('bsb'),
  CANONICAL_VERSIFICATION,
  createTranslationFile(
    new Map([
      [GEN_1_31, 'And God looked upon all that He had made, and indeed, it was very good.'],
      [GEN_2_1, 'Thus the heavens and the earth were completed <in all their vast array>.'],
      [GEN_2_2, 'And by the seventh day God had finished the work He had been doing;'],
      [MATT_17_21, ''],
    ]),
  ),
);
const quote = (start: number, end: number) =>
  quotePassage({
    translation,
    versification: CANONICAL_VERSIFICATION,
    names: enBooks,
    start,
    end,
    url: URL,
  });

describe('quotePassage', () => {
  it('quotes a verse with its reference, translation and link', () => {
    expect(quote(GEN_1_31, GEN_1_31).text).toBe(
      'And God looked upon all that He had made, and indeed, it was very good.\n' +
        `— Genesis 1:31 (BSB) ${URL}`,
    );
  });

  it('carries the acknowledgment of a text that is not in the public domain', () => {
    const net = getTranslationManifest('net');
    const quoted = quotePassage({
      translation: new Translation(net, CANONICAL_VERSIFICATION, createTranslationFile()),
      versification: CANONICAL_VERSIFICATION,
      names: enBooks,
      start: GEN_1_31,
      end: GEN_1_31,
      url: URL,
    });
    expect(quoted.text).toMatch(/— Genesis 1:31 \(NET\) .*\nScripture quoted by permission\./);
    expect(quoted.html).toContain('<p><small>Scripture quoted by permission.');
    // Its designation links to its site, as the NET's terms ask.
    expect(quoted.html).toContain('(<a href="https://netbible.org/">NET</a>)');
    // A public-domain text needs no credit after its quotations.
    expect(quote(GEN_1_31, GEN_1_31).text).not.toContain('permission');
  });

  it('numbers the verses of a passage, with the chapter where it changes', () => {
    const { text } = quote(GEN_1_31, GEN_2_2);
    expect(text).toMatch(/^³¹And God looked .* ²:¹Thus the heavens .* ²:²And by the seventh day/);
    expect(text).toContain(`— Genesis 1:31–2:2 (BSB) ${URL}`);
  });

  it('gives rich editors a quote and a link, with the text escaped', () => {
    const { html } = quote(GEN_1_31, GEN_2_1);
    expect(html).toContain('<blockquote><p><sup>31</sup>And God looked');
    expect(html).toContain('<sup>2:1</sup>Thus the heavens and the earth were completed &lt;in');
    expect(html).toContain(`<p>— <a href="${URL}">Genesis 1:31–2:1</a> (BSB)</p>`);
  });

  it('leaves out verses the translation omits', () => {
    const { text } = quote(MATT_17_21 - 1, MATT_17_21 + 1);
    expect(text).not.toMatch(/²¹/);
    expect(text).toMatch(/²⁰.* ²²/);
  });
});
