import * as pdfjsLib from 'pdfjs-dist';
import type { PDFDocumentProxy } from 'pdfjs-dist';
import type { ExtractedDocument } from '../../types';
import { PdfExtractionError, type PdfExtractor, type PdfSource } from './types';

// Vite resolves this to a hashed worker asset URL at build time; the bare
// specifier form (rather than a relative path) is pdf.js's documented recipe
// for bundlers that support `new URL(..., import.meta.url)` asset imports.
pdfjsLib.GlobalWorkerOptions.workerSrc = new URL(
  'pdfjs-dist/build/pdf.worker.min.mjs',
  import.meta.url,
).toString();

/**
 * Browser PDF text extractor backed by pdf.js. Unlike a raw Tj/TJ operator
 * scan, this handles Flate-compressed content streams — the vast majority of
 * real-world PDFs — and reports the document's actual page count and title.
 * Falls back to a synthetic page when a document has no text layer at all
 * (scanned/image-only PDFs).
 */
export class BrowserPdfExtractor implements PdfExtractor {
  readonly id = 'pdfjs';

  async extract(source: PdfSource): Promise<ExtractedDocument> {
    const buffer = await source.arrayBuffer();

    let pdfDocument: PDFDocumentProxy;
    try {
      pdfDocument = await pdfjsLib.getDocument({ data: new Uint8Array(buffer) }).promise;
    } catch (error) {
      throw new PdfExtractionError(describeLoadError(source.name, error));
    }

    try {
      const extracted = await extractPages(pdfDocument);
      const title = await readTitle(pdfDocument);
      const hasText = extracted.some((page) => page.trim().length > 0);
      const pages = hasText
        ? extracted
        : [`[No extractable text found in ${source.name}. It may be a scanned/image-only PDF.]`];

      return {
        filename: source.name,
        size: source.size,
        pageCount: pdfDocument.numPages,
        pages,
        text: pages.join('\n\n'),
        ...(title ? { title } : {}),
        // Nothing came out of any page's text content: the PDF is image-only
        // (no text layer), which pdf.js cannot read without OCR.
        ...(hasText ? {} : { synthetic: true }),
      };
    } finally {
      await pdfDocument.cleanup();
    }
  }
}

async function extractPages(pdfDocument: PDFDocumentProxy): Promise<string[]> {
  const pages: string[] = [];
  for (let pageNumber = 1; pageNumber <= pdfDocument.numPages; pageNumber += 1) {
    const page = await pdfDocument.getPage(pageNumber);
    try {
      const { items } = await page.getTextContent();
      let pageText = '';
      for (const item of items) {
        if (!('str' in item)) continue;
        pageText += item.str + (item.hasEOL ? '\n' : ' ');
      }
      pages.push(pageText.trim());
    } finally {
      page.cleanup();
    }
  }
  return pages;
}

async function readTitle(pdfDocument: PDFDocumentProxy): Promise<string | undefined> {
  try {
    const { info } = await pdfDocument.getMetadata();
    const title = (info as { Title?: string }).Title?.trim();
    return title || undefined;
  } catch {
    return undefined;
  }
}

function describeLoadError(filename: string, error: unknown): string {
  const name = error instanceof Error ? error.name : '';
  if (name === 'PasswordException') {
    return `${filename} is password-protected and cannot be read.`;
  }
  if (name === 'InvalidPDFException') {
    return `${filename} does not look like a valid PDF file.`;
  }
  const message = error instanceof Error ? error.message : String(error);
  return `Could not read ${filename}: ${message}`;
}
