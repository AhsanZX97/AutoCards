import type { DocumentKind, ExtractedDocument } from '../../types';

/**
 * File-like input. A browser `File` satisfies this directly; on mobile the
 * document picker result is adapted to the same shape.
 */
export interface DocumentSource {
  name: string;
  size: number;
  arrayBuffer(): Promise<ArrayBuffer>;
}

export interface DocumentExtractor {
  readonly id: string;
  extract(source: DocumentSource): Promise<ExtractedDocument>;
}

export class DocumentExtractionError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'DocumentExtractionError';
  }
}

/**
 * Extension → what the file is, for everything the app can read.
 *
 * The Office entries come in families. A `.ppsx` is a `.pptx` flagged to open
 * straight into presentation mode, and the `m` variants carry VBA macros —
 * inside, all of them are the same zip with the same slide and paragraph
 * parts, and we only ever read the XML, so they cost nothing to accept.
 */
const KIND_BY_EXTENSION: Record<string, DocumentKind> = {
  pdf: 'pdf',
  pptx: 'slides',
  ppsx: 'slides',
  pptm: 'slides',
  ppsm: 'slides',
  potx: 'slides',
  docx: 'document',
  docm: 'document',
  dotx: 'document',
  txt: 'text',
  md: 'text',
  markdown: 'text',
};

/**
 * Formats that look supported but are not, with the fix in each message.
 *
 * `.doc` and `.ppt` are OLE2 compound binaries — a different container
 * entirely from the zipped XML of their `x` successors, and one no maintained
 * browser library reads. Re-saving is seconds of work for the person holding
 * the file and a parser we would own forever otherwise. `.pages` and `.key`
 * are Apple's own bundles, which only Apple's software opens.
 */
const UNSUPPORTED_EXTENSIONS: Record<string, string> = {
  doc: 'Word’s older .doc format cannot be read here. Open it and use Save As to make a .docx, then upload that.',
  ppt: 'PowerPoint’s older .ppt format cannot be read here. Open it and use Save As to make a .pptx, then upload that.',
  pages: 'Pages files cannot be read here. Export the document as a PDF or Word file and upload that.',
  key: 'Keynote files cannot be read here. Export the deck as a PDF or PowerPoint file and upload that.',
};

export function extensionOf(filename: string): string {
  const match = /\.([^.]+)$/.exec(filename.trim().toLowerCase());
  return match?.[1] ?? '';
}

/** What the app will make of this filename, or `undefined` if it cannot read it. */
export function documentKindOf(filename: string): DocumentKind | undefined {
  return KIND_BY_EXTENSION[extensionOf(filename)];
}

export function isSupportedDocument(filename: string): boolean {
  return documentKindOf(filename) !== undefined;
}

/**
 * Why a file was rejected, said in terms of what to do about it. Falls back to
 * naming the formats that do work, which is more use than "unsupported type".
 */
export function describeUnsupported(filename: string): string {
  const known = UNSUPPORTED_EXTENSIONS[extensionOf(filename)];
  if (known) return known;
  return `${filename} is not a format we can read. Upload a PDF, Word document, PowerPoint deck, or a plain text file.`;
}

/**
 * Extensions offered in the file picker.
 *
 * Every readable extension is listed, not just the headline four: the picker
 * greys out anything missing here, and someone whose lecturer handed out a
 * `.ppsx` should not be told the file is unsupported when it reads perfectly.
 */
export const SUPPORTED_EXTENSIONS = [
  '.pdf',
  '.docx',
  '.docm',
  '.dotx',
  '.pptx',
  '.ppsx',
  '.pptm',
  '.ppsm',
  '.potx',
  '.txt',
  '.md',
  '.markdown',
] as const;

/** `accept` attribute for a file input covering everything readable. */
export const UPLOAD_ACCEPT = SUPPORTED_EXTENSIONS.join(',');

/** Plain-English list for placeholder copy, e.g. "PDF, Word, PowerPoint or text". */
export const SUPPORTED_FORMATS_LABEL = 'PDF, Word, PowerPoint, text and Markdown';

/**
 * Used where real extraction is not available (React Native has no pdf.js).
 * Reports the file's real name and size but synthesises the page text, so the
 * document is flagged `synthetic` — a live model refuses it rather than
 * writing cards about a placeholder.
 */
export class StubDocumentExtractor implements DocumentExtractor {
  readonly id = 'stub';

  async extract(source: DocumentSource): Promise<ExtractedDocument> {
    // ~40KB per page is a reasonable average for a text-heavy document.
    const pageCount = Math.max(1, Math.round(source.size / 40_000));
    const pages = Array.from(
      { length: pageCount },
      (_unused, index) =>
        `[Page ${index + 1} of ${source.name}. Text extraction is not available on this platform.]`,
    );
    return {
      filename: source.name,
      size: source.size,
      kind: documentKindOf(source.name) ?? 'pdf',
      pageCount,
      pages,
      text: pages.join('\n\n'),
      synthetic: true,
    };
  }
}
