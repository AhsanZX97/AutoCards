import { afterEach, describe, expect, it, vi } from 'vitest';
import { EdgePdfExtractor } from '../edgePdfExtractor';
import { DocumentExtractionError, type DocumentSource } from '../types';
import type { EdgeConfig } from '../../edgeConfig';

const config: EdgeConfig = {
  supabaseUrl: 'https://project.supabase.co',
  anonKey: 'anon-key',
  getAccessToken: () => 'user-token',
};

function pdfSource(name = 'notes.pdf', size = 4096): DocumentSource {
  return { name, size, arrayBuffer: async () => new ArrayBuffer(size) };
}

/** Stands in for the `extract-document` function. */
function respondWith(body: unknown, status = 200) {
  const fetchMock = vi.fn(async () => new Response(JSON.stringify(body), { status }));
  vi.stubGlobal('fetch', fetchMock);
  return fetchMock;
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('EdgePdfExtractor', () => {
  it('turns the pages the server read into a document', async () => {
    respondWith({ document: { pageCount: 2, pages: ['page one', 'page two'], title: 'Cell Biology' } });

    const document = await new EdgePdfExtractor(config).extract(pdfSource());

    expect(document.filename).toBe('notes.pdf');
    expect(document.kind).toBe('pdf');
    expect(document.pageCount).toBe(2);
    expect(document.pages).toEqual(['page one', 'page two']);
    expect(document.text).toBe('page one\n\npage two');
    expect(document.title).toBe('Cell Biology');
    expect(document.synthetic).toBeUndefined();
  });

  it('reports the size of the file the user picked, not of the reply', async () => {
    respondWith({ document: { pageCount: 1, pages: ['text'] } });
    const document = await new EdgePdfExtractor(config).extract(pdfSource('notes.pdf', 12345));
    expect(document.size).toBe(12345);
  });

  it('flags a PDF with no text layer as synthetic, the same as the browser does', async () => {
    respondWith({ document: { pageCount: 3, pages: ['', '', ''] } });

    const document = await new EdgePdfExtractor(config).extract(pdfSource('scan.pdf'));

    expect(document.synthetic).toBe(true);
    expect(document.pageCount).toBe(3);
    expect(document.text).toMatch(/scanned\/image-only/);
  });

  it('sends the bytes with the session token and the file name', async () => {
    const fetchMock = respondWith({ document: { pageCount: 1, pages: ['text'] } });

    await new EdgePdfExtractor(config).extract(pdfSource('lecture notes.pdf'));

    const [url, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toContain('https://project.supabase.co/functions/v1/extract-document');
    expect(url).toContain('name=lecture%20notes.pdf');
    expect(init.method).toBe('POST');
    expect((init.headers as Record<string, string>).Authorization).toBe('Bearer user-token');
    expect((init.headers as Record<string, string>).apikey).toBe('anon-key');
  });

  it('passes the server’s own refusal through, so a locked file says so', async () => {
    respondWith(
      { error: { code: 'bad_request', message: 'notes.pdf is password-protected and cannot be read.' } },
      400,
    );

    const failed = new EdgePdfExtractor(config).extract(pdfSource());

    await expect(failed).rejects.toBeInstanceOf(DocumentExtractionError);
    await expect(failed).rejects.toThrow(/password-protected/);
  });

  it('asks the user to sign in rather than uploading without a session', async () => {
    const fetchMock = respondWith({ document: { pageCount: 1, pages: ['text'] } });
    const signedOut = new EdgePdfExtractor({ ...config, getAccessToken: () => undefined });

    await expect(signedOut.extract(pdfSource())).rejects.toThrow(/sign in/i);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('refuses an oversized file before reading its bytes', async () => {
    const fetchMock = respondWith({ document: { pageCount: 1, pages: ['text'] } });
    const source = pdfSource('huge.pdf', 40_000_000);
    const arrayBuffer = vi.spyOn(source, 'arrayBuffer');

    await expect(new EdgePdfExtractor(config).extract(source)).rejects.toThrow(/limit/i);
    expect(arrayBuffer).not.toHaveBeenCalled();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('explains a failed upload as a connection problem', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => {
        throw new Error('Network request failed');
      }),
    );

    const failed = new EdgePdfExtractor(config).extract(pdfSource());

    await expect(failed).rejects.toBeInstanceOf(DocumentExtractionError);
    await expect(failed).rejects.toThrow(/connection/i);
  });

  it('fails plainly when the reply is not the shape it should be', async () => {
    respondWith({ document: { pageCount: 'two', pages: null } });

    await expect(new EdgePdfExtractor(config).extract(pdfSource())).rejects.toBeInstanceOf(
      DocumentExtractionError,
    );
  });

  it('fails plainly when a gateway returns something that is not JSON at all', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response('<html>gateway timeout</html>', { status: 200 })));

    await expect(new EdgePdfExtractor(config).extract(pdfSource())).rejects.toBeInstanceOf(
      DocumentExtractionError,
    );
  });
});
