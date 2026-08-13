import type { ExtractedDocument } from '../../types';

/** Page text as it came out of pdf.js, before this file decides what it means. */
export interface RawPdfExtraction {
  filename: string;
  size: number;
  /** What the document declares, which is not the same as how many pages had text. */
  pageCount: number;
  /** One entry per page, in order. Entries may be empty. */
  pages: string[];
  /** Document metadata title, when the file declares one. */
  title?: string;
}

/**
 * Turns raw pdf.js output into the document the rest of the app consumes.
 *
 * Shared rather than written twice on purpose. The same PDF has to become the
 * same deck whether pdf.js ran in the browser (`BrowserPdfExtractor`) or in the
 * `extract-document` Edge Function on mobile's behalf (`EdgePdfExtractor`) —
 * and the one judgement being made here, whether a document has a text layer at
 * all, is exactly the kind of rule that would drift if each caller made it.
 *
 * That judgement matters because a scanned PDF is not a failure: it opens fine,
 * reports its pages, and yields nothing. Flagging it `synthetic` is what stops a
 * live model being billed to write cards about a placeholder.
 */
export function buildPdfDocument(raw: RawPdfExtraction): ExtractedDocument {
  const hasText = raw.pages.some((page) => page.trim().length > 0);
  const pages = hasText
    ? raw.pages
    : [`[No extractable text found in ${raw.filename}. It may be a scanned/image-only PDF.]`];

  return {
    filename: raw.filename,
    size: raw.size,
    kind: 'pdf',
    pageCount: raw.pageCount,
    pages,
    text: pages.join('\n\n'),
    ...(raw.title ? { title: raw.title } : {}),
    ...(hasText ? {} : { synthetic: true }),
  };
}
