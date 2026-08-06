import type { ExtractedDocument } from '../../types';

/**
 * File-like input. A browser `File` satisfies this directly; on mobile the
 * document picker result is adapted to the same shape.
 */
export interface PdfSource {
  name: string;
  size: number;
  arrayBuffer(): Promise<ArrayBuffer>;
}

export interface PdfExtractor {
  readonly id: string;
  extract(source: PdfSource): Promise<ExtractedDocument>;
}

export class PdfExtractionError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'PdfExtractionError';
  }
}

/**
 * Used where real PDF parsing is not available (React Native has no pdf.js).
 * Reports the file's real name and size but synthesises the page text, which
 * is harmless while the generator ignores document text anyway.
 */
export class StubPdfExtractor implements PdfExtractor {
  readonly id = 'stub';

  async extract(source: PdfSource): Promise<ExtractedDocument> {
    // ~40KB per page is a reasonable average for a text-heavy PDF.
    const pageCount = Math.max(1, Math.round(source.size / 40_000));
    const pages = Array.from(
      { length: pageCount },
      (_unused, index) =>
        `[Page ${index + 1} of ${source.name}. Text extraction is not available on this platform.]`,
    );
    return {
      filename: source.name,
      size: source.size,
      pageCount,
      pages,
      text: pages.join('\n\n'),
    };
  }
}
