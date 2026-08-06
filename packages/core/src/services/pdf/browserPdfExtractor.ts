import type { ExtractedDocument } from '../../types';
import { PdfExtractionError, type PdfExtractor, type PdfSource } from './types';

/**
 * Minimal browser PDF text extractor. Reads the file as text and pulls
 * parenthesized runs out of PDF `Tj`/`TJ` show-text operators — good enough
 * for uncompressed, non-encrypted PDFs without pulling in pdf.js. Falls back
 * to a synthetic page if nothing recognizable is found.
 */
export class BrowserPdfExtractor implements PdfExtractor {
  readonly id = 'browser-naive';

  async extract(source: PdfSource): Promise<ExtractedDocument> {
    const buffer = await source.arrayBuffer();
    const bytes = new Uint8Array(buffer);
    const raw = bytesToLatin1(bytes);

    if (!raw.startsWith('%PDF-')) {
      throw new PdfExtractionError(`${source.name} does not look like a PDF file.`);
    }

    const pageCount = Math.max(1, countPages(raw));
    const text = extractShowTextRuns(raw).trim();

    const pages = text
      ? splitAcrossPages(text, pageCount)
      : [`[No extractable text found in ${source.name}. It may be a scanned/image-only PDF.]`];

    return {
      filename: source.name,
      size: source.size,
      pageCount,
      pages,
      text: pages.join('\n\n'),
    };
  }
}

function bytesToLatin1(bytes: Uint8Array): string {
  let out = '';
  const chunkSize = 0x8000;
  for (let i = 0; i < bytes.length; i += chunkSize) {
    out += String.fromCharCode(...bytes.subarray(i, i + chunkSize));
  }
  return out;
}

function countPages(raw: string): number {
  const matches = raw.match(/\/Type\s*\/Page(?!s)/g);
  return matches ? matches.length : 1;
}

/** Pulls literal-string operands out of `(...) Tj` and `[(...) ...] TJ` operators. */
function extractShowTextRuns(raw: string): string {
  const runs: string[] = [];
  const pattern = /\(((?:\\.|[^()\\])*)\)\s*(?:Tj|TJ)?/g;
  let match: RegExpExecArray | null;
  while ((match = pattern.exec(raw)) !== null) {
    const decoded = decodePdfString(match[1] ?? '');
    if (decoded.trim()) runs.push(decoded);
  }
  return runs.join(' ');
}

function decodePdfString(value: string): string {
  return value
    .replace(/\\n/g, '\n')
    .replace(/\\r/g, '')
    .replace(/\\t/g, '\t')
    .replace(/\\\(/g, '(')
    .replace(/\\\)/g, ')')
    .replace(/\\\\/g, '\\')
    .replace(/\\(\d{1,3})/g, (_m, oct: string) => String.fromCharCode(parseInt(oct, 8)));
}

function splitAcrossPages(text: string, pageCount: number): string[] {
  if (pageCount <= 1) return [text];
  const chunkSize = Math.ceil(text.length / pageCount);
  const pages: string[] = [];
  for (let i = 0; i < text.length; i += chunkSize) {
    pages.push(text.slice(i, i + chunkSize));
  }
  return pages;
}
