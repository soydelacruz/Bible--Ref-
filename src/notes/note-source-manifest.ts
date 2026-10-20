import type { VersificationId } from '../core/bible/versification.ts';
import type { NoteSourceId, TranslationId } from '../core/datasets/ids.ts';
import type { LicenseInfo } from '../core/datasets/metadata.ts';

/** Describes a source of study notes on the text. */
export interface NoteSourceManifest {
  readonly id: NoteSourceId;
  readonly name: string;
  readonly description: string;
  /** The translation whose wording the notes discuss, and in whose text they are marked. */
  readonly translationId: TranslationId;
  /** The language the notes are written in (BCP 47), whatever the interface's. */
  readonly language: string;
  readonly license: LicenseInfo;
  /** Credit line to display wherever the notes are shown. */
  readonly attribution: string;
  readonly homepage: string;
  readonly versification: VersificationId;
}
