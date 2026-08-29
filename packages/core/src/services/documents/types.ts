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
  jpg: 'image',
  jpeg: 'image',
  png: 'image',
  webp: 'image',
  gif: 'image',
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
  heic: 'iPhone photos in HEIC format cannot be read here. In Photos, use Share and pick JPEG, or set the camera to Most Compatible and take it again.',
  heif: 'HEIF photos cannot be read here. Export the picture as a JPEG and upload that.',
  tif: 'TIFF images cannot be read here. Save the picture as a JPEG or PNG and upload that.',
  tiff: 'TIFF images cannot be read here. Save the picture as a JPEG or PNG and upload that.',
  bmp: 'BMP images cannot be read here. Save the picture as a JPEG or PNG and upload that.',
};

/**
 * The largest file this app will try to read.
 *
 * Not a plan limit — a browser one. Extraction pulls the whole file into
 * memory as an `ArrayBuffer` and pdf.js parses it on the main thread, so a
 * genuinely large upload does not fail, it freezes the tab. 25MB clears a
 * scanned chapter or an image-heavy slide deck, which are the biggest things
 * people actually upload, and stops the rest before anything is read.
 */
export const MAX_UPLOAD_BYTES = 25_000_000;

/**
 * Whether a file is too large to read here.
 *
 * A missing or nonsensical size reads as fine: some browsers report 0 for a
 * file picked from a network drive, and refusing on that would block a
 * perfectly readable upload. The extractor still fails on its own if it turns
 * out to be unreadable.
 */
export function isOversizedUpload(size: number): boolean {
  if (!Number.isFinite(size) || size <= 0) return false;
  return size > MAX_UPLOAD_BYTES;
}

/** File size in the units a file picker shows, e.g. `2.4 MB` or `47 KB`. */
export function formatFileSize(bytes: number): string {
  if (!Number.isFinite(bytes) || bytes <= 0) return '0 KB';
  if (bytes >= 1_000_000) {
    const megabytes = bytes / 1_000_000;
    return `${megabytes >= 10 ? Math.round(megabytes) : megabytes.toFixed(1)} MB`;
  }
  return `${Math.max(1, Math.round(bytes / 1024))} KB`;
}

/** Why a file was too big, with both numbers so the gap is obvious. */
export function describeOversized(filename: string, size: number): string {
  return `${filename} is ${formatFileSize(size)}, and the limit is ${formatFileSize(
    MAX_UPLOAD_BYTES,
  )} per file. Split it up, or upload a smaller export of it.`;
}

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
  return `${filename} is not a format we can read. Upload a PDF, Word document, PowerPoint deck, a photo, or a plain text file.`;
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
 * Picture formats, kept apart from {@link SUPPORTED_EXTENSIONS} because they
 * are picked from their own place in the app.
 *
 * A photograph is uploaded for a different reason than a document — there is
 * no text in it to extract, and the run has to move onto a model that can see
 * — so it is offered as its own thing rather than hidden inside a picker that
 * says "document" on it. The two lists never overlap.
 */
export const SUPPORTED_IMAGE_EXTENSIONS = ['.jpg', '.jpeg', '.png', '.webp', '.gif'] as const;

/** `accept` attribute for a picker that takes pictures only. */
export const IMAGE_UPLOAD_ACCEPT = SUPPORTED_IMAGE_EXTENSIONS.join(',');

/** Plain-English list for placeholder copy, e.g. "JPEG, PNG, WebP or GIF". */
export const SUPPORTED_IMAGE_FORMATS_LABEL = 'JPEG, PNG, WebP and GIF';

/** Whether this file is a picture rather than something with text in it. */
export function isImageUpload(filename: string): boolean {
  return documentKindOf(filename) === 'image';
}

/** Whether this file is a document — readable, and not a picture. */
export function isDocumentUpload(filename: string): boolean {
  const kind = documentKindOf(filename);
  return kind !== undefined && kind !== 'image';
}

/**
 * Why a file was turned away by the picker it was dropped on, when the other
 * picker would have taken it.
 *
 * Worth its own message: "unsupported format" would be a lie about a file the
 * app reads perfectly well, and the person is one click from the right place.
 */
export function describeMisplacedUpload(filename: string, wanted: 'document' | 'image'): string {
  return wanted === 'image'
    ? `${filename} is a document, not a picture. Add it under "Upload a document" instead.`
    : `${filename} is a picture. Add it under "Upload an image" instead.`;
}

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
