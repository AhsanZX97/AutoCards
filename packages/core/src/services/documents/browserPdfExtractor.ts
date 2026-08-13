import type { PDFDocumentProxy } from 'pdfjs-dist';
import type { ExtractedDocument } from '../../types';
import { buildPdfDocument } from './pdfDocument';
import { DocumentExtractionError, type DocumentExtractor, type DocumentSource } from './types';

/**
 * pdf.js, fetched the first time a PDF is actually opened.
 *
 * It is by far the heaviest thing this app depends on — around a megabyte of
 * library plus a worker of similar size — and it is needed on exactly one
 * screen. Imported at the top of the file it landed in the main bundle, so
 * every visitor to the landing page paid for a PDF reader they never used.
 * Behind a dynamic import the bundler gives it its own chunk.
 *
 * Cached as the promise rather than the module, so several files picked at
 * once share one download instead of racing.
 */
let pdfjs: Promise<typeof import('pdfjs-dist')> | undefined;

function loadPdfjs(): Promise<typeof import('pdfjs-dist')> {
  pdfjs ??= import('pdfjs-dist').then((library) => {
    // Vite resolves this to a hashed worker asset URL at build time; the bare
    // specifier form (rather than a relative path) is pdf.js's documented
    // recipe for bundlers that support `new URL(..., import.meta.url)` asset
    // imports.
    library.GlobalWorkerOptions.workerSrc = new URL(
      'pdfjs-dist/build/pdf.worker.min.mjs',
      import.meta.url,
    ).toString();
    return library;
  });
  return pdfjs;
}

/**
 * Browser PDF text extractor backed by pdf.js. Unlike a raw Tj/TJ operator
 * scan, this handles Flate-compressed content streams — the vast majority of
 * real-world PDFs — and reports the document's actual page count and title.
 * Falls back to a synthetic page when a document has no text layer at all
 * (scanned/image-only PDFs).
 */
export class BrowserPdfExtractor implements DocumentExtractor {
  readonly id = 'pdfjs';

  async extract(source: DocumentSource): Promise<ExtractedDocument> {
    const buffer = await source.arrayBuffer();

    let pdfjsLib: typeof import('pdfjs-dist');
    try {
      pdfjsLib = await loadPdfjs();
    } catch (error) {
      console.error('[autocards] could not load the PDF reader', error);
      throw new DocumentExtractionError(
        'The PDF reader could not be loaded. Check your connection and try again.',
      );
    }

    let pdfDocument: PDFDocumentProxy;
    try {
      pdfDocument = await pdfjsLib.getDocument({ data: new Uint8Array(buffer) }).promise;
    } catch (error) {
      throw new DocumentExtractionError(describeLoadError(source.name, error));
    }

    try {
      const title = await readTitle(pdfDocument);
      return buildPdfDocument({
        filename: source.name,
        size: source.size,
        pageCount: pdfDocument.numPages,
        pages: await extractPages(pdfDocument),
        ...(title ? { title } : {}),
      });
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
