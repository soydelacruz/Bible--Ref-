import { readFile } from 'node:fs/promises';
import {
  expectArrayOf,
  expectRecord,
  expectString,
  ValidationError,
} from '../../../src/core/lib/validation.ts';
import { extractZipEntry, sha256Hex, writeFileAtomic } from './files.ts';
import { SOURCES_FILE } from './paths.ts';

/** An upstream file the data pipeline depends on, pinned by its SHA-256 checksum. */
export interface RawSource {
  readonly id: string;
  readonly description: string;
  readonly url: string;
  /** File name under `data/raw/`. */
  readonly fileName: string;
  /**
   * Expected SHA-256 (hex) of the pinned content: the downloaded file, or the archive entry
   * `member` names.
   */
  readonly sha256: string;
  /**
   * An entry inside the archive whose digest is pinned, instead of the archive's own.
   *
   * Some hosts rebuild their archives on a schedule. The files inside do not change, but a ZIP
   * carries each entry's timestamp, so the archive's digest moves for reasons that have nothing
   * to do with the data — and a pin on it then fails on an ordinary day, for no real reason.
   * Pinning the one entry an importer actually reads is both steadier and stricter: it is the
   * bytes that matter, and nothing else can drift past it.
   */
  readonly member?: string;
  /**
   * The script that makes the file, for a source no URL serves as it is: an extract from a local
   * copy of the upstream material. Its `url` then says where that material lives, not where the
   * file can be downloaded, so the pipeline never downloads it: it checks the file, and re-pins
   * it from disk after the script makes it again.
   */
  readonly extractedBy?: string;
  /** Date (YYYY-MM-DD) on which the pinned file was retrieved. */
  readonly retrievedAt: string;
  readonly license: string;
  readonly homepage: string;
}

const SHA256_PATTERN = /^[0-9a-f]{64}$/;
const FILE_NAME_PATTERN = /^[\w.-]+$/;
const DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;
/** A script of the data pipeline, by its path from the repository root. */
const SCRIPT_PATTERN = /^scripts\/data\/[\w-]+\.ts$/;

function expectMatch(value: unknown, pattern: RegExp, path: string): string {
  const text = expectString(value, path);
  if (!pattern.test(text)) {
    throw new ValidationError(path, `"${text}" does not match ${String(pattern)}`);
  }
  return text;
}

function parseRawSource(value: unknown, path: string): RawSource {
  const record = expectRecord(value, path);
  return {
    id: expectString(record['id'], `${path}.id`),
    description: expectString(record['description'], `${path}.description`),
    url: expectString(record['url'], `${path}.url`),
    fileName: expectMatch(record['fileName'], FILE_NAME_PATTERN, `${path}.fileName`),
    sha256: expectMatch(record['sha256'], SHA256_PATTERN, `${path}.sha256`),
    ...(record['member'] === undefined
      ? {}
      : { member: expectMatch(record['member'], FILE_NAME_PATTERN, `${path}.member`) }),
    ...(record['extractedBy'] === undefined
      ? {}
      : {
          extractedBy: expectMatch(record['extractedBy'], SCRIPT_PATTERN, `${path}.extractedBy`),
        }),
    retrievedAt: expectMatch(record['retrievedAt'], DATE_PATTERN, `${path}.retrievedAt`),
    license: expectString(record['license'], `${path}.license`),
    homepage: expectString(record['homepage'], `${path}.homepage`),
  };
}

export async function readSources(): Promise<RawSource[]> {
  const json: unknown = JSON.parse(await readFile(SOURCES_FILE, 'utf8'));
  const sources = expectArrayOf(
    expectRecord(json, 'sources.json')['sources'],
    'sources',
    parseRawSource,
  );
  const ids = new Set(sources.map((source) => source.id));
  if (ids.size !== sources.length) {
    throw new Error(`${SOURCES_FILE}: source IDs must be unique.`);
  }
  return sources;
}

export async function writeSources(sources: readonly RawSource[]): Promise<void> {
  await writeFileAtomic(SOURCES_FILE, `${JSON.stringify({ sources }, null, 2)}\n`);
}

export function findSource(sources: readonly RawSource[], id: string): RawSource {
  const source = sources.find((candidate) => candidate.id === id);
  if (!source) {
    throw new Error(`${SOURCES_FILE} has no source with ID "${id}".`);
  }
  return source;
}

/**
 * The bytes a source's pin covers: the whole file, or the archive entry it names.
 */
export function pinnedContent(source: RawSource, content: Uint8Array): Uint8Array {
  return source.member === undefined ? content : extractZipEntry(content, source.member);
}

/** Whether a file matches its pin, by the digest of whatever the pin covers. */
export function pinnedDigest(source: RawSource, content: Uint8Array): string {
  return sha256Hex(pinnedContent(source, content));
}

/**
 * The archive entry a source pins, for an importer that reads one.
 *
 * Refuses a source that names no member rather than falling back to a literal: the pin and the
 * importer have to cover the same bytes, and the only way to be sure is to read both from the
 * same place.
 */
export function expectMember(source: RawSource): string {
  if (source.member === undefined) {
    throw new Error(`Source "${source.id}" pins the whole archive, so it names no entry to read.`);
  }
  return source.member;
}
