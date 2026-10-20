import { BOOKS, isBookId, type BookId } from '../../../src/core/bible/books.ts';
import { parseOsisId, type VerseIndex } from '../../../src/core/bible/verse-ref.ts';
import type { Versification } from '../../../src/core/bible/versification.ts';
import {
  DATASET_SCHEMA_VERSION,
  type DatasetProvenance,
  type ImportNotice,
  type NoteKind,
  type StudyNote,
  type StudyNotePart,
  type StudyNotesFile,
} from '../../../src/core/datasets/formats.ts';
import type { NoteRun, NoteStyle } from '../../../src/core/datasets/note-text.ts';
import type { NoteSourceManifest } from '../../../src/notes/note-source-manifest.ts';
import { createNotice } from '../lib/notices.ts';

/**
 * Reads the NET Bible's notes as netbible.org serves them (a book's notes as HTML, one
 * `<div class="note">` each) into the app's study-notes datasets: a small structure of text,
 * styles and passage citations that the app renders itself, never the HTML.
 *
 * The markup is checked against a whitelist. A tag or class the NET has not used before fails the
 * build rather than slipping through, or being dropped unseen.
 */

/** One note as the extract records it: where it is marked, and its HTML as served. */
export interface NetNoteRecord {
  readonly book: BookId;
  /** The NET's number for the note within its book. */
  readonly number: number;
  /** The verse the marker is in, by OSIS ID. */
  readonly verse: string;
  /** Characters of the verse's NET text before the marker. */
  readonly at: number;
  readonly html: string;
}

const NOTE_PATTERN = /<div class="note">[\s\S]*?<\/div>/g;
const NOTE_NUMBER_PATTERN = /<span class="noteNoteSuper" id="note_(\d+)">\d+<\/span>/;

/** A book's notes, by their number in it. */
export function splitNetNotes(html: string): Map<number, string> {
  const notes = new Map<number, string>();
  for (const match of html.matchAll(NOTE_PATTERN)) {
    const number = Number(NOTE_NUMBER_PATTERN.exec(match[0])?.[1]);
    if (!Number.isInteger(number)) {
      throw new Error(`NET notes: a note has no number: ${match[0].slice(0, 80)}`);
    }
    if (notes.has(number)) {
      throw new Error(`NET notes: note ${String(number)} appears twice.`);
    }
    notes.set(number, match[0]);
  }
  const rest = html.replace(NOTE_PATTERN, '').trim();
  if (rest !== '') {
    throw new Error(`NET notes: text outside any note: ${rest.slice(0, 80)}`);
  }
  return notes;
}

/** The NET's abbreviations in its references (`Bible:Ge 1:1`), for the books of the app. */
const NET_REFERENCE_BOOKS: Readonly<Record<string, BookId>> = {
  Ge: 'Gen',
  Ex: 'Exod',
  Le: 'Lev',
  Nu: 'Num',
  De: 'Deut',
  Jos: 'Josh',
  Jdg: 'Judg',
  Ru: 'Ruth',
  '1Sa': '1Sam',
  '2Sa': '2Sam',
  '1Ki': '1Kgs',
  '2Ki': '2Kgs',
  '1Ch': '1Chr',
  '2Ch': '2Chr',
  Ezr: 'Ezra',
  Ne: 'Neh',
  Es: 'Esth',
  Est: 'Esth',
  Job: 'Job',
  Ps: 'Ps',
  Pr: 'Prov',
  Ec: 'Eccl',
  Ecc: 'Eccl',
  So: 'Song',
  Song: 'Song',
  Is: 'Isa',
  Je: 'Jer',
  La: 'Lam',
  Eze: 'Ezek',
  Da: 'Dan',
  Ho: 'Hos',
  Joe: 'Joel',
  Am: 'Amos',
  Ob: 'Obad',
  Jon: 'Jonah',
  Mic: 'Mic',
  Na: 'Nah',
  Hab: 'Hab',
  Zep: 'Zeph',
  Hag: 'Hag',
  Zec: 'Zech',
  Mal: 'Mal',
  Mt: 'Matt',
  Mat: 'Matt',
  Mk: 'Mark',
  Lu: 'Luke',
  Jn: 'John',
  Ac: 'Acts',
  Ro: 'Rom',
  '1Co': '1Cor',
  '2Co': '2Cor',
  Ga: 'Gal',
  Gal: 'Gal',
  Eph: 'Eph',
  Php: 'Phil',
  Col: 'Col',
  '1Th': '1Thess',
  '2Th': '2Thess',
  '1Ti': '1Tim',
  '2Ti': '2Tim',
  Tit: 'Titus',
  Phm: 'Phlm',
  Heb: 'Heb',
  Jam: 'Jas',
  '1Pe': '1Pet',
  '2Pe': '2Pet',
  '1Jn': '1John',
  '2Jn': '2John',
  '3Jn': '3John',
  // "Jud 14", alluded to in 1 Enoch: Jude, not Judith.
  Jud: 'Jude',
  Jude: 'Jude',
  Re: 'Rev',
};

/** `Bible:Ge 1:3-31`, `Bible:Ge 1:1-2:3`, `Bible:Ps 23`, `Bible:Ps 23-24`, `Bible:Jude 14`. */
const REFERENCE_PATTERN = /^Bible:([1-3]?[A-Za-z]+) (\d+)(?::(\d+))?(?:-(\d+)(?::(\d+))?)?$/;

/**
 * The verses a reference in a note cites, or `null` for one the app cannot link: a book outside
 * the 66, a verse the KJV numbering does not have, or a reference by the Hebrew (`BibleBHS:`) or
 * Greek (`BibleLXX:`) numbering, which would land on the wrong English verse.
 */
export function resolveNetReference(
  reference: string,
  versification: Versification,
): readonly [VerseIndex, VerseIndex] | null {
  const match = REFERENCE_PATTERN.exec(reference);
  const book = match ? NET_REFERENCE_BOOKS[match[1] ?? ''] : undefined;
  if (!match || book === undefined) {
    return null;
  }
  const numberOf = (part: string | undefined) => (part === undefined ? undefined : Number(part));
  const n1 = Number(match[2]);
  const [n2, n3, n4] = [numberOf(match[3]), numberOf(match[4]), numberOf(match[5])];
  const verse = (chapter: number, number: number) =>
    versification.indexOf({ book, chapter, verse: number });
  let first: VerseIndex | undefined;
  let last: VerseIndex | undefined;
  if (n2 !== undefined) {
    first = verse(n1, n2);
    if (n3 === undefined) last = first;
    else last = n4 === undefined ? verse(n1, n3) : verse(n3, n4);
  } else if (versification.chapterCountOf(book) === 1) {
    // A book of one chapter is cited by verse alone: "Jude 14", "Phlm 9-10".
    first = verse(1, n1);
    if (n4 === undefined) last = n3 === undefined ? first : verse(1, n3);
  } else {
    first = versification.chapterRange(book, n1)?.start;
    last =
      n3 !== undefined && n4 !== undefined
        ? verse(n3, n4)
        : versification.chapterRange(book, n3 ?? n1)?.end;
  }
  if (first === undefined || last === undefined || last < first) {
    return null;
  }
  return [first, last];
}

const NOTE_KINDS_BY_NET_TYPE: Readonly<Record<string, NoteKind>> = {
  tn: 'translation',
  sn: 'study',
  tc: 'text-critical',
  map: 'map',
};

const TAG_STYLES: Readonly<Record<string, NoteStyle>> = {
  i: 'italic',
  b: 'bold',
  sup: 'superscript',
};

const SPAN_STYLES: Readonly<Record<string, NoteStyle>> = {
  hebrew: 'hebrew',
  greek: 'greek',
  translit: 'transliteration',
  smcaps: 'smallCaps',
  sup: 'superscript',
  Apparatus: 'manuscript',
  uncial: 'manuscript',
};

const NAMED_ENTITIES: Readonly<Record<string, string>> = {
  amp: '&',
  apos: "'",
  gt: '>',
  lt: '<',
  nbsp: ' ',
  quot: '"',
};

function decodeEntities(text: string): string {
  return text.replace(/&(#x[0-9a-f]+|#\d+|[a-z]+);/gi, (entity, name: string) => {
    if (/^#x/i.test(name)) return String.fromCodePoint(parseInt(name.slice(2), 16));
    if (name.startsWith('#')) return String.fromCodePoint(Number(name.slice(1)));
    const decoded = NAMED_ENTITIES[name.toLowerCase()];
    if (decoded === undefined) {
      throw new Error(`NET notes: unknown character reference ${entity}.`);
    }
    return decoded;
  });
}

/** A run being built; turned into runs of its parent once its closing tag is read. */
interface Frame {
  /** The tag that closes it (`''` for the part itself). */
  readonly tag: string;
  readonly runs: NoteRun[];
  readonly close: (runs: NoteRun[]) => readonly NoteRun[];
}

/** Adds runs to a list, joining strings that meet. */
function appendRuns(target: NoteRun[], runs: readonly NoteRun[]): void {
  for (const run of runs) {
    const previous = target.at(-1);
    if (typeof run === 'string' && typeof previous === 'string') {
      target[target.length - 1] = previous + run;
    } else if (run !== '') {
      target.push(run);
    }
  }
}

/**
 * Removes the spaces (and, at the end of a part, the line breaks) at the very end of some runs,
 * however deep the last one is.
 */
function trimEnd(runs: NoteRun[], trailing = / +$/): void {
  const last = runs.at(-1);
  if (typeof last === 'string') {
    const trimmed = last.replace(trailing, '');
    if (trimmed === '') runs.pop();
    else runs[runs.length - 1] = trimmed;
  } else if (last !== undefined) {
    // Built here as a mutable list, so it can still be trimmed before the part is finished.
    trimEnd(last.text as NoteRun[], trailing);
  }
}

export interface ParsedNetNote {
  readonly parts: readonly StudyNotePart[];
  /** References left as plain text, as the note writes them (e.g. `BibleBHS:Ps 51:3`). */
  readonly unlinked: readonly string[];
}

const TAG_PATTERN = /<(\/?)([a-zA-Z][a-zA-Z0-9]*)([^>]*)>/g;
const CLASS_PATTERN = /\bclass="([^"]*)"/;
const REF_PATTERN = /\bref="([^"]*)"/;
const STYLE_ONLY_PATTERN = /^\s*style="[^"]*"\s*$/;
const WRAPPER_PATTERN =
  /^<div class="note"><sup><span class="noteNoteSuper" id="note_\d+">\d+<\/span>(?:&nbsp;|\s)*<\/sup>([\s\S]*)<\/div>$/;

/**
 * One note, from its HTML into its parts. Each part starts at a `<span class="notetype">` naming
 * its kind; whitespace is collapsed, a `<br>` becomes a line break, a map link its plain label,
 * and a reference the app can resolve a passage citation.
 */
export function parseNetNote(html: string, versification: Versification): ParsedNetNote {
  const body = WRAPPER_PATTERN.exec(html)?.[1];
  if (body === undefined) {
    throw new Error(`NET notes: not a note: ${html.slice(0, 80)}`);
  }
  const parts: StudyNotePart[] = [];
  const unlinked: string[] = [];
  const newPart = (): Frame[] => [{ tag: '', runs: [], close: (runs) => runs }];
  let stack = newPart();
  let kind: NoteKind | null = null;
  let kindText: string | null = null;
  /** The last character written to the part, so whitespace collapses across tags. */
  let lastCharacter = '';

  const top = (): Frame => {
    const frame = stack.at(-1);
    if (!frame) throw new Error('NET notes: the markup closes more than it opens.');
    return frame;
  };
  const write = (raw: string) => {
    let text = decodeEntities(raw).replace(/\s+/g, ' ');
    if (lastCharacter === '' || lastCharacter === ' ' || lastCharacter === '\n') {
      text = text.replace(/^ /, '');
    }
    if (text === '') return;
    appendRuns(top().runs, [text]);
    lastCharacter = text.at(-1) ?? lastCharacter;
  };
  const finishPart = () => {
    if (stack.length !== 1) {
      throw new Error(`NET notes: <${top().tag}> is not closed: ${html.slice(0, 80)}`);
    }
    const runs = top().runs;
    trimEnd(runs, /\s+$/);
    if (runs.length > 0) {
      if (kind === null) {
        throw new Error(`NET notes: text before the note's kind: ${html.slice(0, 80)}`);
      }
      parts.push({ kind, text: runs });
    }
    stack = newPart();
    lastCharacter = '';
  };
  const open = (tag: string, close: Frame['close']) => {
    stack.push({ tag, runs: [], close });
  };
  const styled = (tag: string, style: NoteStyle) => {
    open(tag, (runs) => (runs.length === 0 ? [] : [{ style, text: runs }]));
  };

  let last = 0;
  for (const match of body.matchAll(TAG_PATTERN)) {
    const between = body.slice(last, match.index);
    if (kindText === null) write(between);
    else kindText += between;
    last = match.index + match[0].length;
    const [, slash = '', rawName = ''] = match;
    // A few attributes come with their quotes escaped (`class=&quot;smcaps&quot;`).
    const attributes = (match[3] ?? '').replaceAll('&quot;', '"');
    const name = rawName.toLowerCase();
    const className = CLASS_PATTERN.exec(attributes)?.[1] ?? '';

    if (slash === '/') {
      if (name === 'span' && kindText !== null) {
        // An empty type opens a part with no kind, which must then stay empty: a few notes
        // carry one before their real first part, or as an empty last paragraph.
        const netType = kindText.trim();
        kind = NOTE_KINDS_BY_NET_TYPE[netType] ?? null;
        if (kind === null && netType !== '') {
          throw new Error(`NET notes: unknown note type "${netType}".`);
        }
        kindText = null;
      } else if (name !== 'p' && stack.slice(1).some((frame) => frame.tag === name)) {
        const frame = stack.pop();
        if (frame?.tag !== name) {
          throw new Error(
            `NET notes: </${name}> closes <${frame?.tag ?? ''}>: ${html.slice(0, 80)}`,
          );
        }
        appendRuns(top().runs, frame.close(frame.runs));
      }
      // A closing tag with nothing of its name open is a slip in the source, ignored as a
      // browser ignores it (two notes in Proverbs close one span twice).
      continue;
    }

    const tagStyle = TAG_STYLES[name];
    const spanStyle = name === 'span' ? SPAN_STYLES[className] : undefined;
    if (name === 'span' && className === 'notetype') {
      finishPart();
      kind = null;
      kindText = '';
    } else if (name === 'p' && className === 'note') {
      // A further part: the notetype inside it starts it.
    } else if (name === 'br') {
      trimEnd(top().runs);
      appendRuns(top().runs, ['\n']);
      lastCharacter = '\n';
    } else if (name === 'data') {
      const reference = REF_PATTERN.exec(attributes)?.[1];
      if (reference === undefined) throw new Error('NET notes: a <data> with no reference.');
      const passage = resolveNetReference(reference, versification);
      if (passage === null) unlinked.push(reference);
      open('data', (runs) =>
        passage === null || runs.length === 0 ? runs : [{ passage, text: runs }],
      );
    } else if (name === 'a' && className === 'mapLink') {
      // The maps are not part of the app: the label ("Map1-A1") stays as text.
      open('a', (runs) => runs);
    } else if (tagStyle !== undefined) {
      styled(name, tagStyle);
    } else if (spanStyle !== undefined) {
      styled('span', spanStyle);
    } else if (name === 'span' && STYLE_ONLY_PATTERN.test(attributes)) {
      // An inline font size, nothing more: the words keep their place, the size does not.
      open('span', (runs) => runs);
    } else {
      throw new Error(`NET notes: unexpected markup ${match[0]}.`);
    }
  }
  write(body.slice(last));
  finishPart();
  if (parts.length === 0) {
    throw new Error(`NET notes: a note with no text: ${html.slice(0, 80)}`);
  }
  return { parts, unlinked };
}

/** Reads the extract (one JSON object per line) into its records, checking each. */
export function readNetNoteRecords(jsonl: string): NetNoteRecord[] {
  return jsonl
    .split('\n')
    .filter((line) => line.trim() !== '')
    .map((line, index): NetNoteRecord => {
      const record = JSON.parse(line) as Partial<NetNoteRecord>;
      const valid =
        typeof record.book === 'string' &&
        isBookId(record.book) &&
        Number.isInteger(record.number) &&
        typeof record.verse === 'string' &&
        Number.isInteger(record.at) &&
        typeof record.html === 'string';
      if (!valid) {
        throw new Error(`NET notes: line ${String(index + 1)} is not a note record.`);
      }
      return record as NetNoteRecord;
    });
}

export interface NetNotesOptions {
  readonly manifest: NoteSourceManifest;
  readonly provenance: DatasetProvenance;
  /** The NET's text, by verse index: a marker's place counts characters in it. */
  readonly verses: readonly string[];
  readonly versification: Versification;
}

function bookNotices(notes: readonly StudyNote[], unlinked: readonly string[]): ImportNotice[] {
  const kinds = new Map<NoteKind, string[]>();
  for (const note of notes) {
    for (const part of note.parts) {
      const numbers = kinds.get(part.kind) ?? [];
      numbers.push(String(note.number));
      kinds.set(part.kind, numbers);
    }
  }
  return [
    ...[...kinds].map(([kind, numbers]) =>
      createNotice('info', `Parts of notes: ${kind}`, numbers),
    ),
    ...(unlinked.length === 0
      ? []
      : [
          createNotice(
            'info',
            'References left as text: by Hebrew or Greek verse numbering, to books outside ' +
              'the 66, or to verses the KJV numbering does not have',
            unlinked,
          ),
        ]),
  ];
}

/** Every book's notes file, from the extract's records. A book without notes gets an empty file. */
export function importNetNotes(
  records: readonly NetNoteRecord[],
  { manifest, provenance, verses, versification }: NetNotesOptions,
): Map<BookId, StudyNotesFile> {
  const byBook = new Map<BookId, { notes: StudyNote[]; unlinked: string[] }>();
  for (const record of records) {
    const ref = parseOsisId(record.verse);
    const verse = ref?.book === record.book ? versification.indexOf(ref) : undefined;
    const label = `${record.book} note ${String(record.number)}`;
    if (verse === undefined) {
      throw new Error(`NET notes: ${label} is marked in "${record.verse}", outside its book.`);
    }
    if (record.at < 0 || record.at > (verses[verse] ?? '').length) {
      throw new Error(`NET notes: ${label} is marked outside the text of ${record.verse}.`);
    }
    const { parts, unlinked } = parseNetNote(record.html, versification);
    const book = byBook.get(record.book) ?? { notes: [], unlinked: [] };
    book.notes.push({ number: record.number, verse, at: record.at, parts });
    book.unlinked.push(...unlinked);
    byBook.set(record.book, book);
  }

  const files = new Map<BookId, StudyNotesFile>();
  for (const { id } of BOOKS) {
    const { notes, unlinked } = byBook.get(id) ?? { notes: [], unlinked: [] };
    // In reading order: by verse, then by place in it.
    const ordered = notes.toSorted((a, b) => a.verse - b.verse || a.at - b.at);
    files.set(id, {
      format: 'study-notes',
      schemaVersion: DATASET_SCHEMA_VERSION,
      versification: versification.id,
      provenance,
      notices: bookNotices(ordered, unlinked),
      sourceId: manifest.id,
      book: id,
      translationId: manifest.translationId,
      license: manifest.license,
      attribution: manifest.attribution,
      notes: ordered,
    });
  }
  return files;
}
