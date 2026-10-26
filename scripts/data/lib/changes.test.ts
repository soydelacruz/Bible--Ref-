import { strToU8 } from 'fflate';
import { describe, expect, it } from 'vitest';
import { describePinnedChange, describeTextChange } from './changes.ts';
import type { RawSource } from './sources.ts';

const BEFORE = [
  'EXO 24:2 Moses alone shall come near to the LORD,',
  'EXO 24:3 All the words which the LORD has spoken will we do.',
  'EXO 24:4 Moses wrote all the LORD’s words,',
  'DEU 6:10 to give you, great and goodly cities,',
  '',
].join('\n');

const AFTER = BEFORE.replace('will we do', 'we will do').replace(
  'great and goodly cities',
  'a land with great and good cities',
);

function source(overrides: Partial<RawSource> = {}): RawSource {
  return {
    id: 'web',
    description: 'A text',
    url: 'https://example.org/web.zip',
    fileName: 'web.txt',
    sha256: 'a'.repeat(64),
    retrievedAt: '2026-01-01',
    license: 'Public domain',
    homepage: 'https://example.org/',
    ...overrides,
  };
}

describe('describeTextChange', () => {
  it('shows each revised verse as its old line, then the new one in its place', () => {
    expect(describeTextChange(BEFORE, AFTER)).toEqual([
      '2 lines removed, 2 lines added:',
      '- EXO 24:3 All the words which the LORD has spoken will we do.',
      '+ EXO 24:3 All the words which the LORD has spoken we will do.',
      '- DEU 6:10 to give you, great and goodly cities,',
      '+ DEU 6:10 to give you, a land with great and good cities,',
    ]);
  });

  it('shows a verse added or dropped where it is in the text', () => {
    const added = BEFORE.replace('EXO 24:4', 'EXO 24:3a A new line\nEXO 24:4');
    expect(describeTextChange(BEFORE, added)).toEqual([
      '0 lines removed, 1 line added:',
      '+ EXO 24:3a A new line',
    ]);
    expect(describeTextChange(added, BEFORE)).toEqual([
      '1 line removed, 0 lines added:',
      '- EXO 24:3a A new line',
    ]);
  });

  it('says so when only the line endings changed, rather than listing every line', () => {
    expect(describeTextChange(BEFORE, BEFORE.replaceAll('\n', '\r\n'))).toEqual([
      'Only the line endings changed.',
    ]);
  });

  it('prints a line without the carriage return that ends it', () => {
    const crlf = (text: string) => text.replaceAll('\n', '\r\n');
    expect(describeTextChange(crlf(BEFORE), crlf(AFTER))[1]).toBe(
      '- EXO 24:3 All the words which the LORD has spoken will we do.',
    );
  });

  it('stops after forty lines and counts the rest', () => {
    const verses = (word: string) =>
      Array.from({ length: 30 }, (_, index) => `GEN 1:${String(index + 1)} ${word}`).join('\n');
    const lines = describeTextChange(verses('old'), verses('new'));
    expect(lines[0]).toBe('30 lines removed, 30 lines added:');
    expect(lines).toHaveLength(1 + 40 + 1);
    expect(lines.at(-1)).toBe('… and 20 more');
  });
});

describe('describePinnedChange', () => {
  it('reads the entry a source pins as text, by its name', () => {
    const zipped = source({ fileName: 'web.zip', member: 'web.txt' });
    expect(describePinnedChange(zipped, strToU8(BEFORE), strToU8(AFTER))).toEqual(
      describeTextChange(BEFORE, AFTER),
    );
  });

  it('keeps a byte order mark the publisher added, so the change is not invisible', () => {
    const lines = describePinnedChange(
      source(),
      strToU8(BEFORE),
      strToU8(String.fromCharCode(0xfeff) + BEFORE),
    );
    expect(lines[0]).toBe('1 line removed, 1 line added:');
  });

  it('gives only the sizes of a file that is not text', () => {
    const archive = source({ fileName: 'links.zip' });
    expect(describePinnedChange(archive, new Uint8Array(2048), new Uint8Array(3072))).toEqual([
      '2.0 KB before, 3.0 KB now.',
    ]);
  });
});
