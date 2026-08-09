import { describe, expect, it, vi } from 'vitest';
import { RoutingDocumentExtractor } from '../routingExtractor';
import { DocumentExtractionError, documentKindOf, isSupportedDocument, describeUnsupported } from '../types';
import type { DocumentExtractor } from '../types';
import { docxFile, pptxFile, sourceFromString } from './documentFixtures';

/** Stands in for pdf.js, which needs a browser. */
function fakePdfExtractor(): DocumentExtractor {
  return {
    id: 'fake-pdf',
    extract: vi.fn(async (source) => ({
      filename: source.name,
      size: source.size,
      kind: 'pdf' as const,
      pageCount: 1,
      pages: ['pdf text'],
      text: 'pdf text',
    })),
  };
}

function router(pdf = fakePdfExtractor()) {
  return { extractor: new RoutingDocumentExtractor(pdf), pdf };
}

describe('documentKindOf', () => {
  it.each([
    ['notes.pdf', 'pdf'],
    ['handout.docx', 'document'],
    ['lecture.pptx', 'slides'],
    ['scratch.txt', 'text'],
    ['readme.md', 'text'],
    ['NOTES.PDF', 'pdf'],
    // Same OOXML zip as their plain counterparts — a show file just opens
    // straight into presentation mode, and a macro-enabled one carries VBA we
    // never look at. The slide and paragraph parts are identical.
    ['lecture.ppsx', 'slides'],
    ['lecture.pptm', 'slides'],
    ['lecture.ppsm', 'slides'],
    ['handout.docm', 'document'],
  ])('reads %s as %s', (filename, kind) => {
    expect(documentKindOf(filename)).toBe(kind);
  });

  it('reads a PowerPoint show the same way as a normal deck', async () => {
    const { extractor } = router();
    const show = pptxFile('lecture.ppsx', [{ body: ['Respiration'], notes: ['Mention the Krebs cycle.'] }]);
    const document = await extractor.extract(show);

    expect(document.kind).toBe('slides');
    expect(document.pageCount).toBe(1);
    expect(document.text).toContain('Respiration');
    expect(document.text).toContain('Mention the Krebs cycle.');
  });

  it('does not claim to read formats it cannot', () => {
    expect(isSupportedDocument('old.doc')).toBe(false);
    expect(isSupportedDocument('slides.ppt')).toBe(false);
    expect(isSupportedDocument('photo.png')).toBe(false);
    expect(isSupportedDocument('noextension')).toBe(false);
  });
});

describe('describeUnsupported', () => {
  it('tells someone with a .doc exactly how to fix it', () => {
    expect(describeUnsupported('essay.doc')).toMatch(/save as/i);
    expect(describeUnsupported('essay.doc')).toMatch(/\.docx/);
  });

  it('lists what does work for a format it has no advice for', () => {
    expect(describeUnsupported('photo.png')).toMatch(/PDF/);
  });
});

describe('RoutingDocumentExtractor', () => {
  it('sends a PDF to the PDF extractor', async () => {
    const { extractor, pdf } = router();
    await extractor.extract(sourceFromString('notes.pdf', 'ignored'));
    expect(pdf.extract).toHaveBeenCalled();
  });

  it('reads a Word document without going near the PDF extractor', async () => {
    const { extractor, pdf } = router();
    const document = await extractor.extract(docxFile('handout.docx', ['Mitochondria make ATP.']));

    expect(document.text).toContain('Mitochondria make ATP.');
    expect(pdf.extract).not.toHaveBeenCalled();
  });

  it('reads a plain text file', async () => {
    const { extractor } = router();
    const document = await extractor.extract(sourceFromString('notes.txt', 'Just some notes.'));
    expect(document.text).toBe('Just some notes.');
  });

  it('refuses a legacy .doc with advice rather than a generic failure', async () => {
    const { extractor } = router();
    const failed = extractor.extract(sourceFromString('essay.doc', 'whatever'));

    await expect(failed).rejects.toBeInstanceOf(DocumentExtractionError);
    await expect(failed).rejects.toThrow(/\.docx/);
  });

  it('refuses a format it has never heard of', async () => {
    const { extractor } = router();
    await expect(extractor.extract(sourceFromString('photo.png', 'whatever'))).rejects.toBeInstanceOf(
      DocumentExtractionError,
    );
  });
});
