import { join, sep } from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  PUBLIC_DIR,
  RAW_DATA_DIR,
  REPO_ROOT,
  SOURCES_FILE,
  publicFilePath,
  rawFilePath,
} from './paths.ts';

describe("the pipeline's paths", () => {
  it('are all inside the repository', () => {
    for (const path of [SOURCES_FILE, RAW_DATA_DIR, PUBLIC_DIR]) {
      expect(path.startsWith(REPO_ROOT)).toBe(true);
    }
  });

  // Paths are compared in the platform's own form (`\` on Windows), as `resolve` returns them.
  it('point at the places the README documents', () => {
    expect(SOURCES_FILE.endsWith(join(sep, 'data', 'sources.json'))).toBe(true);
    expect(RAW_DATA_DIR.endsWith(join(sep, 'data', 'raw'))).toBe(true);
    expect(PUBLIC_DIR.endsWith(join(sep, 'public'))).toBe(true);
  });

  it('resolve a raw file under data/raw', () => {
    expect(rawFilePath('bsb.txt')).toBe(join(RAW_DATA_DIR, 'bsb.txt'));
  });

  it('resolve a generated dataset under public', () => {
    expect(publicFilePath('data/translations/bsb.json')).toBe(
      join(PUBLIC_DIR, 'data', 'translations', 'bsb.json'),
    );
  });
});
