import type { ExtractedDocument } from '../../types';
import { edgeErrorMessage, functionUrl, type EdgeConfig } from '../edgeConfig';
import { buildPdfDocument } from './pdfDocument';
import {
  DocumentExtractionError,
  describeOversized,
  isOversizedUpload,
  type DocumentExtractor,
  type DocumentSource,
} from './types';

/**
 * Reads a PDF by asking our own server to do it.
 *
 * This is mobile's PDF reader. React Native cannot run pdf.js — Hermes has
 * neither `Promise.withResolvers` nor `structuredClone` nor `DOMMatrix`, which
 * pdf.js leans on throughout — and the alternative, a native parser per
 * platform, would mean three different PDF implementations producing three
 * subtly different decks from one file. Sending the bytes to the
 * `extract-document` function keeps it at one.
 *
 * Only the mechanical part happens server-side. What comes back is raw page
 * text, and {@link buildPdfDocument} — the same function `BrowserPdfExtractor`
 * calls — decides what it means, so a scanned PDF is judged identically on both
 * platforms.
 *
 * Unlike generation, this costs no upload: the allowance is spent by
 * `generate-deck`, and a file that failed to read never gets that far.
 */
export class EdgePdfExtractor implements DocumentExtractor {
  readonly id = 'edge-pdf';

  constructor(private readonly config: EdgeConfig) {}

  async extract(source: DocumentSource): Promise<ExtractedDocument> {
    // Checked before the bytes are read rather than after: the point of failing
    // early is not to pull a file this large into memory in the first place.
    if (isOversizedUpload(source.size)) {
      throw new DocumentExtractionError(describeOversized(source.name, source.size));
    }

    const token = await this.config.getAccessToken();
    if (!token) {
      throw new DocumentExtractionError('Sign in to upload a document.');
    }

    const buffer = await source.arrayBuffer();

    let response: Response;
    try {
      response = await fetch(
        `${functionUrl(this.config, 'extract-document')}?name=${encodeURIComponent(source.name)}`,
        {
          method: 'POST',
          headers: {
            // Sent as raw bytes rather than base64 in JSON, which would add a
            // third to the size of every upload for nothing.
            'Content-Type': 'application/pdf',
            apikey: this.config.anonKey,
            Authorization: `Bearer ${token}`,
          },
          body: buffer,
        },
      );
    } catch {
      throw new DocumentExtractionError(
        `Could not upload ${source.name}. Check your connection and try again.`,
      );
    }

    const envelope = await readJson(response);

    if (!response.ok) {
      // The function writes its refusals for the person reading them — a
      // password-protected file, a damaged one — so they pass through as-is.
      throw new DocumentExtractionError(
        edgeErrorMessage(envelope, `Could not read ${source.name}. Try uploading it again.`),
      );
    }

    const document = readDocument(envelope);
    if (!document) {
      throw new DocumentExtractionError(
        `Could not read ${source.name}. Try uploading it again.`,
      );
    }

    return buildPdfDocument({
      filename: source.name,
      size: source.size,
      pageCount: document.pageCount,
      pages: document.pages,
      ...(document.title ? { title: document.title } : {}),
    });
  }
}

interface RawDocument {
  pageCount: number;
  pages: string[];
  title?: string;
}

async function readJson(response: Response): Promise<unknown> {
  try {
    return await response.json();
  } catch {
    return undefined;
  }
}

/**
 * Reads the reply, or reports nothing usable in it.
 *
 * Checked rather than cast because a reply that is not the shape we expect is
 * indistinguishable at the type level from one that is, and a gateway timing
 * out mid-upload is perfectly capable of returning an HTML error page with a
 * 200. Anything unrecognisable becomes a plain failure rather than a document
 * with `undefined` pages that breaks further down.
 */
function readDocument(value: unknown): RawDocument | undefined {
  if (typeof value !== 'object' || value === null) return undefined;
  const document = (value as { document?: unknown }).document;
  if (typeof document !== 'object' || document === null) return undefined;

  const { pageCount, pages, title } = document as Record<string, unknown>;
  if (!Array.isArray(pages) || !pages.every((page) => typeof page === 'string')) return undefined;
  if (typeof pageCount !== 'number' || !Number.isFinite(pageCount)) return undefined;

  return {
    pageCount,
    pages: pages as string[],
    ...(typeof title === 'string' && title ? { title } : {}),
  };
}
