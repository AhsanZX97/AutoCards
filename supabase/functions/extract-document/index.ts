import { failure, json, preflight } from '../_shared/http.ts';
import { adminClient, authenticate } from '../_shared/supabase.ts';

/**
 * pdf.js — the same library, and deliberately the same major version, the web
 * app runs in `packages/core/src/services/documents/browserPdfExtractor.ts`.
 * Keep this pin in step with `pdfjs-dist` in `packages/core/package.json`: the
 * whole reason this function exists is so both platforms read a PDF the same
 * way, and two versions is the obvious way for that to stop being true.
 *
 * The `legacy` build rather than the modern one because this runs outside a
 * browser: it is the variant compiled without the newest syntax and without
 * assuming a DOM. Text extraction touches no canvas, so nothing here needs the
 * optional native `@napi-rs/canvas` dependency.
 */
import * as pdfjsLib from 'npm:pdfjs-dist@6.2.108/legacy/build/pdf.mjs';
import * as pdfjsWorker from 'npm:pdfjs-dist@6.2.108/legacy/build/pdf.worker.mjs';

/**
 * The largest PDF this will read, matching `MAX_UPLOAD_BYTES` in
 * `packages/core/src/services/documents/types.ts`.
 *
 * Enforced here as well as in the app because the client-side check is a
 * courtesy to the user, not a control: the whole file is pulled into this
 * isolate's memory and parsed there, and an isolate that runs out of memory
 * fails in a way the caller cannot be told anything useful about.
 */
const MAX_BYTES = 25_000_000;

/**
 * Run the parser on this thread rather than in a Web Worker.
 *
 * pdf.js checks `globalThis.pdfjsWorker` first and takes its in-process path
 * the moment it finds one, never reaching either of the two branches that
 * would break here: spawning `new Worker(...)` reads `window.location`, which
 * Deno has no such thing as, and the fallback after that dynamically imports a
 * URL worked out at runtime, which a deployed function bundle would not
 * contain. Assigning it is what makes this deterministic instead of dependent
 * on what the runtime happens to allow.
 *
 * The static import above is what puts the worker code in the bundle at all.
 * Extraction is byte-for-byte identical either way — a worker would only keep
 * parsing off this thread, and each request already has an isolate to itself.
 */
(globalThis as { pdfjsWorker?: unknown }).pdfjsWorker = pdfjsWorker;

/**
 * Reads the text out of an uploaded PDF, for clients that cannot do it
 * themselves.
 *
 * Mobile is the only caller. React Native has no pdf.js — Hermes has neither
 * `Promise.withResolvers` nor `structuredClone` nor `DOMMatrix`, all of which
 * pdf.js uses throughout — so before this existed the mobile app wired a stub
 * that invented page text and flagged the document `synthetic`. Generation then
 * refused it, which does not read as a bug to the person holding the phone: the
 * upload simply finished and then nothing happened.
 *
 * The alternative was a native parser behind the same interface, which would
 * have meant a third PDF implementation (iOS PDFKit, Android PdfBox, pdf.js)
 * and a custom dev client for an app that has no native modules at all today.
 * One library called from both platforms is what keeps the decks identical.
 *
 * This is the one function that sees an uploaded document rather than the
 * prompt built from it, so it is worth being clear about what that does and
 * does not change. It costs no upload — the allowance is spent by
 * `generate-deck`, which is where the money is — and it writes nothing, so the
 * per-plan page and deck limits stay exactly where they were, client-side.
 * What bounds this is a valid session and a size cap.
 */
Deno.serve(async (request) => {
  const early = preflight(request);
  if (early) return early;
  if (request.method !== 'POST') {
    return failure('Use POST to read a document.', 405, 'bad_request');
  }

  let admin: ReturnType<typeof adminClient>;
  try {
    admin = adminClient();
  } catch (error) {
    console.error('extract-document is misconfigured', error);
    return failure('Reading documents is not switched on for this app yet.', 500, 'misconfigured');
  }

  // A session is the whole gate here. Parsing a large PDF costs real CPU, and
  // an endpoint that did this for anyone who found the URL would be a way to
  // spend this project's compute budget for free.
  const caller = await authenticate(request, admin);
  if (!caller) {
    return failure('Sign in to upload a document.', 401, 'unauthenticated');
  }

  // The name is only ever used to write error messages the user will read, so
  // they name the file they picked rather than "the document".
  const filename = readFilename(request);

  const declared = Number(request.headers.get('content-length') ?? '');
  if (Number.isFinite(declared) && declared > MAX_BYTES) {
    return failure(tooBig(filename), 413, 'bad_request');
  }

  let bytes: Uint8Array;
  try {
    bytes = new Uint8Array(await request.arrayBuffer());
  } catch {
    return failure(`${filename} did not arrive in one piece. Try uploading it again.`, 400, 'bad_request');
  }

  if (bytes.byteLength === 0) {
    return failure(`${filename} arrived empty. Try uploading it again.`, 400, 'bad_request');
  }
  // Checked again against what actually arrived: `content-length` is the
  // client's claim about the body, not a fact about it.
  if (bytes.byteLength > MAX_BYTES) {
    return failure(tooBig(filename), 413, 'bad_request');
  }

  let pdfDocument;
  try {
    pdfDocument = await pdfjsLib.getDocument({
      data: bytes,
      // Nothing is drawn, only read. Fonts would only matter for rendering, and
      // `isEvalSupported` off keeps pdf.js from compiling font programs at all
      // — faster here, and one less thing running on a server.
      useSystemFonts: false,
      disableFontFace: true,
      isEvalSupported: false,
    }).promise;
  } catch (error) {
    return failure(describeLoadError(filename, error), 400, 'bad_request');
  }

  try {
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

    const title = await readTitle(pdfDocument);

    // Raw pages, not a finished document. Whether a PDF counts as having no
    // text layer is `buildPdfDocument` in core's job, so that web and mobile
    // reach that verdict through the same code rather than two copies of it.
    return json({
      document: {
        pageCount: pdfDocument.numPages,
        pages,
        ...(title ? { title } : {}),
      },
    });
  } catch (error) {
    console.error('could not read the PDF', error);
    return failure(`Could not read ${filename}. It may be damaged.`, 400, 'bad_request');
  } finally {
    await pdfDocument.cleanup();
    await pdfDocument.destroy();
  }
});

/** The name the user picked, for messages. Never used to open anything. */
function readFilename(request: Request): string {
  const raw = new URL(request.url).searchParams.get('name')?.trim();
  // Trimmed to a sane length: this goes straight into a message the user reads,
  // and a caller is free to send something absurd.
  return raw ? raw.slice(0, 120) : 'That PDF';
}

function tooBig(filename: string): string {
  return `${filename} is larger than the 25 MB limit. Split it up, or upload a smaller export of it.`;
}

async function readTitle(pdfDocument: { getMetadata: () => Promise<unknown> }): Promise<string | undefined> {
  try {
    const metadata = (await pdfDocument.getMetadata()) as { info?: { Title?: string } };
    const title = metadata.info?.Title?.trim();
    return title || undefined;
  } catch {
    return undefined;
  }
}

/**
 * Worded to match `describeLoadError` in core's browser extractor, so the same
 * broken file is explained the same way on both platforms.
 */
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
