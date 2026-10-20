import type { NoteSourceId } from '../core/datasets/ids.ts';
import type { NoteSourceManifest } from './note-source-manifest.ts';

const NOTE_SOURCES: Readonly<Record<NoteSourceId, NoteSourceManifest>> = {
  // Not part of the NET's free licence for its text: the notes are used by a permission of their
  // own (see PRODUCT.md), whose exact terms and wording are still to be recorded before release.
  net: {
    id: 'net',
    name: 'NET Bible notes',
    description:
      'The translators’ notes of the NET Bible: on the wording, on the manuscripts behind it, ' +
      'and on the history and meaning of the text, each marked at its word in the NET.',
    translationId: 'net',
    license: {
      name: 'Used by permission',
      url: 'https://netbible.com/copyright/',
      publicDomain: false,
    },
    attribution:
      'Notes from the NET Bible® copyright ©1996, 2019 by Biblical Studies Press, L.L.C. ' +
      'http://netbible.com All rights reserved. Used by permission.',
    homepage: 'https://netbible.org/',
    versification: 'kjv',
  },
};

export const NOTE_SOURCE_MANIFESTS: readonly NoteSourceManifest[] = Object.values(NOTE_SOURCES);

export function getNoteSourceManifest(id: NoteSourceId): NoteSourceManifest {
  return NOTE_SOURCES[id];
}
