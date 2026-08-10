import { describe, expect, it } from 'vitest';
import {
  MAX_UPLOAD_BYTES,
  describeOversized,
  formatFileSize,
  isOversizedUpload,
} from '../types';

describe('isOversizedUpload', () => {
  it('accepts a file at the limit', () => {
    expect(isOversizedUpload(MAX_UPLOAD_BYTES)).toBe(false);
  });

  it('refuses a file over the limit', () => {
    expect(isOversizedUpload(MAX_UPLOAD_BYTES + 1)).toBe(true);
  });

  it('accepts the sizes real uploads actually are', () => {
    expect(isOversizedUpload(2_400_000)).toBe(false); // a chapter
    expect(isOversizedUpload(18_000_000)).toBe(false); // a scanned handout
  });

  /**
   * A browser reporting no size is not a reason to refuse the file — the
   * extractor will fail on its own if it turns out to be unreadable.
   */
  it('lets a file through when the size is missing or nonsense', () => {
    expect(isOversizedUpload(0)).toBe(false);
    expect(isOversizedUpload(Number.NaN)).toBe(false);
    expect(isOversizedUpload(-1)).toBe(false);
  });
});

describe('formatFileSize', () => {
  it('reads megabytes in the units the file picker showed', () => {
    expect(formatFileSize(2_400_000)).toBe('2.4 MB');
    expect(formatFileSize(41_000_000)).toBe('41 MB');
  });

  it('reads small files in kilobytes', () => {
    expect(formatFileSize(48_000)).toBe('47 KB');
  });

  it('never reports a real file as 0 KB', () => {
    expect(formatFileSize(120)).toBe('1 KB');
  });
});

describe('describeOversized', () => {
  it('names the file, its size and the limit', () => {
    const message = describeOversized('lecture-notes.pdf', 41_000_000);

    expect(message).toContain('lecture-notes.pdf');
    expect(message).toContain('41 MB');
    expect(message).toContain('25 MB');
  });
});
